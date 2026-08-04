import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_TREE_GROWTH,
  TREE_REGROWTH_PER_SECOND,
  resolveTrimYield,
  treeGrowthAt,
  treeStageAt,
  treeStageFor,
  trimProfileForTier,
  type TreeGrowthState,
} from './catalogs/trees';
import { applyGameCommand } from './commands';
import { createDefaultGameState, setGameStateForTests, type GameState } from './state';

const NOW = 1_700_000_000_000;

function stateWithScissors(toolId: 'kids-scissors' | 'sturdy-scissors' = 'kids-scissors'): GameState {
  const state = createDefaultGameState();
  state.player.tools[toolId] = 1;
  state.player.equippedTool = toolId;
  return state;
}

function trim(state: GameState, options: {
  species?: 'pine' | 'leafy' | 'redwood';
  now?: number;
  treeKey?: string;
} = {}) {
  return applyGameCommand(state, {
    type: 'trimTree',
    target: {
      pageId: '0,0',
      treeKey: options.treeKey ?? 'tree:1.000:2.000',
      species: options.species ?? 'leafy',
    },
    now: options.now ?? NOW,
  });
}

function recordFor(state: GameState, treeKey = 'tree:1.000:2.000'): TreeGrowthState | undefined {
  return state.world.pages['0,0']?.treeGrowth[treeKey];
}

afterEach(() => setGameStateForTests(null));

describe('tree growth recovery', () => {
  it('treats an unrecorded tree as fully grown', () => {
    expect(treeGrowthAt(undefined, NOW)).toBe(MAX_TREE_GROWTH);
    expect(treeStageAt(undefined, NOW)).toBe('flourishing');
  });

  it('recovers from elapsed time without anything having ticked', () => {
    const record: TreeGrowthState = { growth: 0, trimmedAt: NOW, trims: 1 };
    expect(treeGrowthAt(record, NOW)).toBe(0);
    expect(treeGrowthAt(record, NOW + 60_000)).toBeCloseTo(TREE_REGROWTH_PER_SECOND * 60, 5);
  });

  it('never exceeds full growth however long it is left', () => {
    const record: TreeGrowthState = { growth: 10, trimmedAt: NOW, trims: 1 };
    expect(treeGrowthAt(record, NOW + 86_400_000)).toBe(MAX_TREE_GROWTH);
  });

  it('recovers fully within the prototype window the design doc allows', () => {
    const record: TreeGrowthState = { growth: 0, trimmedAt: NOW, trims: 1 };
    // 4-8 minutes. Failing this means the pacing drifted out of the range the
    // design was agreed against, not merely that a constant changed.
    expect(treeGrowthAt(record, NOW + 4 * 60_000)).toBeLessThan(MAX_TREE_GROWTH);
    expect(treeGrowthAt(record, NOW + 8 * 60_000)).toBe(MAX_TREE_GROWTH);
  });

  it('places stage boundaries where the design table says', () => {
    expect(treeStageFor(100)).toBe('flourishing');
    expect(treeStageFor(75)).toBe('flourishing');
    expect(treeStageFor(74)).toBe('trimmed');
    expect(treeStageFor(40)).toBe('trimmed');
    expect(treeStageFor(39)).toBe('cropped');
    expect(treeStageFor(1)).toBe('cropped');
    expect(treeStageFor(0)).toBe('resting');
  });
});

describe('trimming', () => {
  it('refuses without a trim tool in hand', () => {
    const state = createDefaultGameState();
    expect(trim(state).ok).toBe(false);
  });

  it('refuses a shovel, which is a tool but the wrong verb', () => {
    const state = createDefaultGameState();
    state.player.tools['flimsy-shovel'] = 1;
    state.player.equippedTool = 'flimsy-shovel';
    expect(trim(state).ok).toBe(false);
  });

  it('spends growth and grants material', () => {
    const state = stateWithScissors();
    const result = trim(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const spent = MAX_TREE_GROWTH - trimProfileForTier(1).cost;
    expect(recordFor(state)?.growth).toBe(spent);
    expect(recordFor(state)?.trims).toBe(1);
    const granted = Object.values(result.grants ?? {}).reduce((sum, count) => sum + count, 0);
    expect(granted).toBeGreaterThan(0);
  });

  it('never destroys the tree, however many times it is cut', () => {
    const state = stateWithScissors();
    for (let cut = 0; cut < 20; cut += 1) trim(state, { now: NOW + cut });
    const record = recordFor(state);
    // Growth bottoms out at zero rather than going negative: this is a
    // quantity of tree, not a health bar. A tree at rest is still a tree.
    expect(record?.growth).toBe(0);
    expect(treeStageAt(record, NOW)).toBe('resting');
  });

  it('refuses a resting tree, then allows it again once it has grown back', () => {
    const state = stateWithScissors();
    for (let cut = 0; cut < 20; cut += 1) trim(state, { now: NOW + cut });

    expect(trim(state, { now: NOW + 1000 }).ok).toBe(false);
    expect(trim(state, { now: NOW + 5 * 60_000 }).ok).toBe(true);
  });

  it('yields less from a tree that has already been cut back', () => {
    const flourishing = resolveTrimYield({
      treeKey: 'tree:1.000:2.000', species: 'leafy', tier: 2, stage: 'flourishing', trims: 1,
    });
    const cropped = resolveTrimYield({
      treeKey: 'tree:1.000:2.000', species: 'leafy', tier: 2, stage: 'cropped', trims: 1,
    });
    const total = (entries: ReturnType<typeof resolveTrimYield>) =>
      entries.reduce((sum, entry) => sum + entry.quantity, 0);
    expect(total(cropped)).toBeLessThan(total(flourishing));
    expect(total(cropped)).toBeGreaterThan(0);
  });

  it('gives nothing from a resting tree', () => {
    expect(resolveTrimYield({
      treeKey: 'tree:1.000:2.000', species: 'leafy', tier: 1, stage: 'resting', trims: 1,
    })).toEqual([]);
  });

  it('yields the same contents for the same tree and cut count', () => {
    // Saving and reloading must not reroll a cut. Two clients must agree on
    // a trim's contents knowing only how many times the tree has been cut.
    const args = {
      treeKey: 'tree:3.500:-7.250', species: 'pine', tier: 2, stage: 'flourishing', trims: 4,
    } as const;
    expect(resolveTrimYield(args)).toEqual(resolveTrimYield(args));
  });

  it('varies contents between trees and between cuts', () => {
    const base = { species: 'pine', tier: 2, stage: 'flourishing' } as const;
    const rolls = new Set([
      JSON.stringify(resolveTrimYield({ ...base, treeKey: 'a', trims: 1 })),
      JSON.stringify(resolveTrimYield({ ...base, treeKey: 'b', trims: 1 })),
      JSON.stringify(resolveTrimYield({ ...base, treeKey: 'a', trims: 2 })),
      JSON.stringify(resolveTrimYield({ ...base, treeKey: 'a', trims: 3 })),
    ]);
    expect(rolls.size).toBeGreaterThan(1);
  });

  it('yields species-appropriate material', () => {
    const leafy = resolveTrimYield({
      treeKey: 'k', species: 'leafy', tier: 1, stage: 'flourishing', trims: 1,
    });
    const redwood = resolveTrimYield({
      treeKey: 'k', species: 'redwood', tier: 2, stage: 'flourishing', trims: 1,
    });
    expect(leafy[0].resource).toBe('mossy-paper-fiber');
    expect(redwood[0].resource).toBe('redwood-bark-curls');
  });

  it('makes bark curls obtainable only from a redwood', () => {
    // Not in BIOME_RESOURCES, so no loose pile anywhere generates one. A
    // redwood plus sturdy scissors is the only source, which is what gives
    // the tier-2 shears a reason to exist.
    for (const species of ['pine', 'leafy'] as const) {
      for (const stage of ['flourishing', 'trimmed', 'cropped'] as const) {
        const yields = resolveTrimYield({ treeKey: 'k', species, tier: 2, stage, trims: 1 });
        expect(yields.map((entry) => entry.resource)).not.toContain('redwood-bark-curls');
      }
    }
  });
});

describe('the redwood gate', () => {
  it('refuses kids scissors on a redwood', () => {
    const state = stateWithScissors('kids-scissors');
    const result = trim(state, { species: 'redwood' });
    expect(result.ok).toBe(false);
    expect(recordFor(state)).toBeUndefined();
  });

  it('allows sturdy scissors on a redwood', () => {
    const state = stateWithScissors('sturdy-scissors');
    expect(trim(state, { species: 'redwood' }).ok).toBe(true);
  });

  it('still lets kids scissors work an ordinary tree', () => {
    const state = stateWithScissors('kids-scissors');
    expect(trim(state, { species: 'pine' }).ok).toBe(true);
  });
});
