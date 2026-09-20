import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyGameCommand } from './commands';
import { createDefaultGameState, setGameStateForTests } from './state';
import { SEED_DEFS, growsInShallowWater, type SeedId } from './catalogs/seeds';
import { terrainCellAt } from './terrainCells';

beforeEach(() => setGameStateForTests(null));
afterEach(() => setGameStateForTests(null));

function cell(x: number, z: number) {
  const target = terrainCellAt(x, z, () => '0,0');
  return { pageId: target.pageId, cellKey: target.cellKey, x: target.x, z: target.z };
}

function stocked(...seeds: SeedId[]) {
  const state = createDefaultGameState();
  for (const seed of seeds) state.player.inventory[seed] = 5;
  return state;
}

describe('shallow-water seeds', () => {
  it('marks exactly the lotus and the marsh reed as water-tolerant', () => {
    const tolerant = (Object.keys(SEED_DEFS) as SeedId[]).filter(growsInShallowWater).sort();
    expect(tolerant).toEqual(['lotus-fold-seeds', 'marsh-reed-seeds']);
  });
});

describe('planting into shallow water', () => {
  it('roots a lotus straight into a wet cell with no dig first', () => {
    const state = stocked('lotus-fold-seeds');
    const target = cell(6, 6);
    expect(state.world.pages['0,0']?.terrainEdits[target.cellKey]).toBeUndefined();

    const result = applyGameCommand(state, {
      type: 'plantTerrain', target, seedId: 'lotus-fold-seeds', now: 1000, wetBed: true,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toMatch(/shallows/);
    expect(state.world.pages['0,0'].terrainEdits[target.cellKey]).toMatchObject({
      state: 'planted', plantedSeedId: 'lotus-fold-seeds', depth: 0, toolTier: 0,
    });
    expect(state.player.inventory['lotus-fold-seeds']).toBe(4);
  });

  it('does the same for marsh reeds', () => {
    const state = stocked('marsh-reed-seeds');
    const result = applyGameCommand(state, {
      type: 'plantTerrain', target: cell(6, 6), seedId: 'marsh-reed-seeds', now: 1000, wetBed: true,
    });
    expect(result.ok).toBe(true);
  });

  it('still needs a dug bed when the cell is not claimed to be wet', () => {
    const state = stocked('lotus-fold-seeds');
    const result = applyGameCommand(state, {
      type: 'plantTerrain', target: cell(6, 6), seedId: 'lotus-fold-seeds', now: 1000,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/dug/);
  });

  it('refuses the wet shortcut for a seed that does not like wet feet', () => {
    const state = stocked('buttonbloom-seeds');
    const target = cell(6, 6);
    const result = applyGameCommand(state, {
      type: 'plantTerrain', target, seedId: 'buttonbloom-seeds', now: 1000, wetBed: true,
    });
    expect(result.ok).toBe(false);
    expect(state.world.pages['0,0']?.terrainEdits[target.cellKey]).toBeUndefined();
    expect(state.player.inventory['buttonbloom-seeds']).toBe(5);
  });

  it('keeps the spacing rule: a second lotus too close is refused', () => {
    const state = stocked('lotus-fold-seeds');
    const first = cell(6, 6);
    const next = cell(6.5, 6);
    expect(applyGameCommand(state, {
      type: 'plantTerrain', target: first, seedId: 'lotus-fold-seeds', now: 1000, wetBed: true,
    }).ok).toBe(true);

    const second = applyGameCommand(state, {
      type: 'plantTerrain', target: next, seedId: 'lotus-fold-seeds', now: 1100, wetBed: true,
    });
    expect(second.ok).toBe(false);
    // A refusal spends no seed and leaves no bed behind.
    expect(state.player.inventory['lotus-fold-seeds']).toBe(4);
    expect(state.world.pages['0,0'].terrainEdits[next.cellKey]).toBeUndefined();
  });

  it('lifts and clears freely, like a planter box — nothing was ever dug', () => {
    const state = stocked('lotus-fold-seeds');
    const target = cell(6, 6);
    state.player.tools['creased-hoe'] = 1;
    state.player.equippedTool = 'creased-hoe';
    applyGameCommand(state, { type: 'plantTerrain', target, seedId: 'lotus-fold-seeds', now: 1000, wetBed: true });

    expect(applyGameCommand(state, { type: 'liftPlant', target, now: 1100 }).ok).toBe(true);
    expect(state.world.pages['0,0'].terrainEdits[target.cellKey]?.state).toBe('dug');

    expect(applyGameCommand(state, { type: 'refillTerrain', target, now: 1200 }).ok).toBe(true);
    expect(state.world.pages['0,0'].terrainEdits[target.cellKey]).toBeUndefined();
  });
});
