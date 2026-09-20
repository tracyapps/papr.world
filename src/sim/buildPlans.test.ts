import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyGameCommand, craftBlockers } from './commands';
import { createDefaultGameState, initializeGameState, setGameStateForTests, SAVE_STORAGE_KEY } from './state';
import { BUILD_ASSEMBLY_DEFS } from './catalogs/building';
import {
  RECIPE_DEFS,
  buildPlanForPiece,
  isCraftableRecipe,
  looseRecipes,
  unlearnedBuildPlan,
  type RecipeId,
} from './catalogs/recipes';
import { TECH_DEFS, techNodeGrantingRecipe, techNodeStatus } from './catalogs/techTree';
import { BUILD_PIECE_DEFS, type BuildPieceKey } from '../world/buildPieces';

beforeEach(() => setGameStateForTests(null));
afterEach(() => setGameStateForTests(null));

const BUILD_PLAN_IDS = (Object.keys(RECIPE_DEFS) as RecipeId[])
  .filter((id) => RECIPE_DEFS[id].output.kind === 'build-piece');

function withMallet() {
  const state = createDefaultGameState();
  state.player.tools['basic-mallet'] = 1;
  state.player.equippedTool = 'basic-mallet';
  return state;
}

function buildStep(templateKey: string, stepId: string, x: number, now: number) {
  return {
    type: 'completeBuildStep' as const,
    templateKey, stepId, x, z: 0, rotY: 0, pageId: '0,0', now,
  };
}

describe('build-piece plans — catalog shape', () => {
  it('names a real build piece with a real assembly, one plan per piece', () => {
    expect(BUILD_PLAN_IDS.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const id of BUILD_PLAN_IDS) {
      const output = RECIPE_DEFS[id].output;
      if (output.kind !== 'build-piece') continue;
      expect(output.templateKey in BUILD_PIECE_DEFS).toBe(true);
      expect(output.templateKey in BUILD_ASSEMBLY_DEFS).toBe(true);
      expect(seen.has(output.templateKey)).toBe(false);
      seen.add(output.templateKey);
      expect(buildPlanForPiece(output.templateKey)).toBe(id);
    }
  });

  it('comes only from the knowledge tree, and every one has exactly one lesson', () => {
    for (const id of BUILD_PLAN_IDS) {
      expect(RECIPE_DEFS[id].planSource).toBe('knowledge-tree');
      expect(techNodeGrantingRecipe(id)).not.toBeNull();
    }
  });

  it('spreads the plans across lessons instead of bundling them', () => {
    const lessons = BUILD_PLAN_IDS.map((id) => techNodeGrantingRecipe(id));
    expect(new Set(lessons).size).toBe(BUILD_PLAN_IDS.length);
  });

  it('leaves the free starter pieces ungated', () => {
    for (const key of ['paper-bench', 'planter-box', 'path-plank', 'paper-lamp'] as BuildPieceKey[]) {
      expect(buildPlanForPiece(key)).toBeNull();
      expect(unlearnedBuildPlan([], key)).toBeNull();
    }
  });

  it('is never craftable at the Thing Maker, and never listed there', () => {
    const state = createDefaultGameState();
    for (const id of BUILD_PLAN_IDS) {
      expect(isCraftableRecipe(id)).toBe(false);
      expect(looseRecipes()).not.toContain(id);
      state.player.plans.push(id);
      expect(craftBlockers(state, id).some((blocker) => blocker.kind === 'build-plan')).toBe(true);
      const started = applyGameCommand(state, { type: 'startCraft', recipeId: id, now: 1000 });
      expect(started.ok).toBe(false);
    }
  });
});

describe('build-piece plans — gating', () => {
  it('refuses to start a plan-gated piece without the plan, leaving no trace', () => {
    const state = withMallet();
    const result = applyGameCommand(state, buildStep('garden-arbor', 'posts', 3, 1000));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Professor/);
    expect(state.world.pages['0,0']).toBeUndefined();
  });

  it('starts the piece once the plan is known', () => {
    const state = withMallet();
    state.player.plans.push('garden-arbor');
    const result = applyGameCommand(state, buildStep('garden-arbor', 'posts', 3, 1000));

    expect(result.ok).toBe(true);
    expect(Object.values(state.world.pages['0,0'].buildSites)).toHaveLength(1);
  });

  it('still needs the hammer tier on top of the plan', () => {
    const state = createDefaultGameState();
    state.player.plans.push('garden-arbor');
    state.player.tools['squeaky-hammer'] = 1;
    state.player.equippedTool = 'squeaky-hammer';

    const result = applyGameCommand(state, buildStep('garden-arbor', 'posts', 3, 1000));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/level 2 hammer/);
  });

  it('lets a build already underway finish even if the plan is gone', () => {
    const state = withMallet();
    state.player.inventory['binding-cord'] = 3;
    state.player.plans.push('garden-arbor');
    expect(applyGameCommand(state, buildStep('garden-arbor', 'posts', 3, 1000)).ok).toBe(true);

    // Whatever became of the plan (an account sync, a hand-edited save), the
    // half-built arbor is not stranded.
    state.player.plans = state.player.plans.filter((id) => id !== 'garden-arbor');
    expect(applyGameCommand(state, buildStep('garden-arbor', 'lintel', 3, 2000)).ok).toBe(true);
    expect(applyGameCommand(state, buildStep('garden-arbor', 'join', 3, 3000)).ok).toBe(true);
    expect(Object.values(state.world.pages['0,0'].placedPieces)).toHaveLength(1);
  });

  it('does not let a finished plan-gated piece unlock its neighbours', () => {
    const state = withMallet();
    state.player.plans.push('garden-arbor');
    const result = applyGameCommand(state, buildStep('picnic-table', 'top', 6, 1000));
    expect(result.ok).toBe(false);
  });
});

describe('build-piece plans — the lessons that teach them', () => {
  it('keeps every lesson reachable from ready nodes alone', () => {
    for (const id of BUILD_PLAN_IDS) {
      const node = TECH_DEFS[techNodeGrantingRecipe(id)!];
      expect(node.readiness).toBe('ready');
      for (const required of node.requires) {
        expect(TECH_DEFS[required as keyof typeof TECH_DEFS].readiness).toBe('ready');
      }
    }
  });

  it('opens each lesson once its prerequisites are learned, and marks it owned with the plan', () => {
    const state = createDefaultGameState();
    // Everything a fresh save needs to be one lesson away from each of them.
    state.player.plans.push('okayish-shovel', 'tending-hoe', 'sturdy-scissors', 'basic-mallet');

    expect(techNodeStatus('garden-structures', state)).toBe('available');
    expect(techNodeStatus('outdoor-furniture', state)).toBe('available');
    expect(techNodeStatus('simple-crossings', state)).toBe('available');

    state.player.plans.push('garden-arbor');
    expect(techNodeStatus('garden-structures', state)).toBe('owned');
  });

  it('is locked on a fresh save until the mallet lesson is done', () => {
    const state = createDefaultGameState();
    expect(techNodeStatus('garden-structures', state)).toBe('locked');
  });
});

describe('build-piece plans — saves', () => {
  it('keeps a learned build plan through save normalization', () => {
    const map = new Map<string, string>([[SAVE_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      player: { plans: ['garden-arbor', 'footbridge', 'not-a-plan'] },
      world: {},
    })]]);
    const state = initializeGameState({
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { map.set(key, value); },
    });

    expect(state.player.plans).toContain('garden-arbor');
    expect(state.player.plans).toContain('footbridge');
    expect(state.player.plans).not.toContain('not-a-plan');
  });
});
