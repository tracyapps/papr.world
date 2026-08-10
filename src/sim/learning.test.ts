import { afterEach, describe, expect, it } from 'vitest';
import { recipeForTool } from './catalogs/recipes';
import { techNodeStatus } from './catalogs/techTree';
import { dispatchGameCommand } from './commands';
import {
  getLearningProgress,
  reconcileTechLearningState,
  startTechLearningState,
} from './learning';
import {
  SAVE_STORAGE_KEY,
  createDefaultGameState,
  initializeGameState,
  setGameStateForTests,
} from './state';

afterEach(() => setGameStateForTests(null));

describe('one-at-a-time tech learning', () => {
  it('starts an available node and refuses a second one', () => {
    const state = createDefaultGameState();

    expect(startTechLearningState(state, 'digging-2', 1_000)).toEqual({
      ok: true,
      message: 'Started learning Digging 2.',
    });
    expect(state.player.activeLearning?.nodeId).toBe('digging-2');
    expect(startTechLearningState(state, 'trimming-2', 2_000)).toEqual({
      ok: false,
      reason: 'Digging 2 is already being learned.',
    });
  });

  it('refuses locked, learned, and concept nodes', () => {
    const state = createDefaultGameState();

    expect(startTechLearningState(state, 'digging-1', 1_000).ok).toBe(false);
    expect(startTechLearningState(state, 'digging-3', 1_000).ok).toBe(false);
    expect(startTechLearningState(state, 'gardening-2', 1_000).ok).toBe(false);
  });

  it('uses elapsed real-world time and grants the plan when the wait finishes', () => {
    const state = createDefaultGameState();
    startTechLearningState(state, 'digging-2', 1_000);
    const durationMs = 6 * 60 * 60 * 1000;

    expect(getLearningProgress(state, 1_000 + durationMs / 2)?.fraction).toBeCloseTo(0.5, 4);
    const completed = reconcileTechLearningState(state, 1_000 + durationMs);

    expect(completed).toBe('digging-2');
    expect(state.player.activeLearning).toBeNull();
    expect(state.player.plans).toContain(recipeForTool('okayish-shovel'));
    expect(techNodeStatus('digging-2', state)).toBe('owned');
    expect(techNodeStatus('digging-3', state)).toBe('available');
  });

  it('counts making only after the lesson starts, while already owning a tool counts immediately', () => {
    const state = createDefaultGameState();
    state.player.tools['flimsy-shovel'] = 1;
    state.world.thingMaker.completedOutputs.push('flimsy-shovel');

    startTechLearningState(state, 'digging-2', 1_000);
    let progress = getLearningProgress(state, 1_000);
    expect(progress?.tasks.map((task) => task.completed)).toEqual([true, false]);
    expect(progress?.fraction).toBeCloseTo(1 / 3, 4);

    state.world.thingMaker.completedOutputs.push('flimsy-shovel');
    expect(reconcileTechLearningState(state, 2_000)).toBeNull();
    progress = getLearningProgress(state, 2_000);
    expect(progress?.tasks[1]).toMatchObject({ completed: false, current: 1, target: 2 });

    state.world.thingMaker.completedOutputs.push('flimsy-shovel');
    expect(reconcileTechLearningState(state, 3_000)).toBe('digging-2');
    expect(state.player.activeLearning).toBeNull();
  });

  it('never lets task progress regress after a completed prerequisite tool is given away', () => {
    const state = createDefaultGameState();
    state.player.tools['flimsy-shovel'] = 1;
    startTechLearningState(state, 'digging-2', 1_000);
    reconcileTechLearningState(state, 1_000);

    state.player.tools['flimsy-shovel'] = 0;
    expect(getLearningProgress(state, 2_000)?.tasks[0].completed).toBe(true);
  });

  it('settles task progress through the normal game-command boundary', () => {
    const state = createDefaultGameState();
    state.player.tools['flimsy-shovel'] = 1;
    startTechLearningState(state, 'digging-2', 1_000);
    setGameStateForTests(state);

    state.world.thingMaker.activeCraft = {
      recipeId: 'flimsy-shovel',
      startedAt: 1_500,
      completesAt: 2_000,
    };
    expect(dispatchGameCommand({ type: 'completeCraft', now: 2_000 }).ok).toBe(true);
    expect(getLearningProgress(state, 2_000)?.tasks[1].current).toBe(1);

    state.world.thingMaker.activeCraft = {
      recipeId: 'flimsy-shovel',
      startedAt: 2_500,
      completesAt: 3_000,
    };
    expect(dispatchGameCommand({ type: 'completeCraft', now: 3_000 }).ok).toBe(true);
    expect(state.player.activeLearning).toBeNull();
    expect(state.player.plans).toContain(recipeForTool('okayish-shovel'));
  });
});

describe('learning save compatibility', () => {
  it('loads an older version-1 save with no learning field as idle', () => {
    const oldState = createDefaultGameState();
    delete (oldState.player as unknown as Record<string, unknown>).activeLearning;
    const storage = {
      value: JSON.stringify(oldState),
      getItem(key: string) { return key === SAVE_STORAGE_KEY ? this.value : null; },
      setItem(_key: string, value: string) { this.value = value; },
    };

    const loaded = initializeGameState(storage);
    expect(loaded.player.activeLearning).toBeNull();
  });

  it('normalizes malformed learning state instead of keeping a broken slot occupied', () => {
    const malformed = createDefaultGameState();
    (malformed.player as unknown as { activeLearning: unknown }).activeLearning = {
      nodeId: 42,
      startedAt: 'yesterday',
    };
    const storage = {
      value: JSON.stringify(malformed),
      getItem(key: string) { return key === SAVE_STORAGE_KEY ? this.value : null; },
      setItem(_key: string, value: string) { this.value = value; },
    };

    expect(initializeGameState(storage).player.activeLearning).toBeNull();
  });
});
