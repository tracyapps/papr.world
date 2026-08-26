import {
  SEED_DEFS,
  bloomSeconds,
  plantHarvest,
  plantStageAt,
  plantStageProgress,
} from './catalogs/seeds';
import { describe, expect, it } from 'vitest';
import { applyGameCommand, refillCost, resolveIngredientAllocation } from './commands';
import { createDefaultGameState, migrateLegacyState } from './state';
import { setGameStateForTests } from './state';
import { TERRAIN_CELL_RADIUS, TERRAIN_CELL_SIZE, terrainCellAt } from './terrainCells';
import { findDigFootprintBlocker } from '../world/footprints';
import { sampleBaseTerrainHeight, sampleTerrainHeight } from '../world/terrain';
import { resolveDigDiscovery } from './catalogs/geology';

const SHALLOW_DISCOVERY = {
  geologySeed: 123,
  layer: 1 as const,
  resource: 'ochre-paperclay' as const,
  quantity: 2,
};

function gardenStateForSelectionTest() {
  const state = createDefaultGameState();
  state.player.tools['flimsy-shovel'] = 1;
  state.player.equippedTool = 'flimsy-shovel';
  return state;
}

function digGardenCellForSelectionTest(
  state: ReturnType<typeof createDefaultGameState>,
  cellKey: string,
  x: number,
  z: number,
) {
  const target = { pageId: '0,0', cellKey, x, z };
  applyGameCommand(state, { type: 'digTerrain', target, discovery: SHALLOW_DISCOVERY, now: 1000 });
  return target;
}

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('unified save migration', () => {
  it('copies valid legacy progress into the versioned state', () => {
    const storage = new MemoryStorage();
    storage.setItem('pencil-and-paper.resource-inventory.v1', JSON.stringify({
      'kraft-twigs': 9,
      'mossy-paper-fiber': 4,
      unknown: 999,
    }));
    storage.setItem('pencil-and-paper.friendship.v1', JSON.stringify({ '0,0#raccoon': 42 }));
    storage.setItem('pencil-and-paper.harvest-state.v1', JSON.stringify({ 'page:0,0:twig': 12345 }));
    storage.setItem('pencil-and-paper.places.v1', JSON.stringify({
      places: [{ id: 'home', name: 'Home', x: -1.5, z: -2.2, builtin: true }],
      nextPlaceNumber: 6,
    }));

    const state = migrateLegacyState(storage);
    expect(state.player.inventory['kraft-twigs']).toBe(9);
    expect(state.player.inventory['mossy-paper-fiber']).toBe(4);
    expect(state.player.friendships['0,0#raccoon']).toBe(42);
    expect(state.world.harvestRespawns['page:0,0:twig']).toBe(12345);
    expect(state.player.places[0]?.name).toBe('Home');
    expect(state.player.nextPlaceNumber).toBe(6);
  });
});

describe('ingredient allocation', () => {
  it('combines regional varieties within a requested family', () => {
    const allocation = resolveIngredientAllocation({
      'kraft-twigs': 3,
      'ribbonwood-sticks': 2,
    }, [{ kind: 'family', family: 'sticks', quantity: 4 }]);

    expect(allocation).not.toBeNull();
    expect(Object.values(allocation ?? {}).reduce((sum, value) => sum + (value ?? 0), 0)).toBe(4);
  });

  it('reserves exact ingredients before filling broad family costs', () => {
    const allocation = resolveIngredientAllocation({
      'graphite-cardstone': 4,
      'bluefold-pebbles': 3,
    }, [
      { kind: 'exact', resource: 'graphite-cardstone', quantity: 3 },
      { kind: 'family', family: 'stones', quantity: 3 },
    ]);

    expect(allocation?.['graphite-cardstone']).toBe(3);
    expect(allocation?.['bluefold-pebbles']).toBe(3);
  });
});

describe('crafting commands', () => {
  it('does not spend anything when a recipe cannot be afforded', () => {
    const state = createDefaultGameState();
    state.player.inventory['kraft-twigs'] = 4;
    const before = JSON.stringify(state.player.inventory);

    const result = applyGameCommand(state, { type: 'startCraft', recipeId: 'flimsy-shovel', now: 1000 });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(state.player.inventory)).toBe(before);
    expect(state.world.thingMaker.activeCraft).toBeNull();
  });

  it('spends atomically, persists a job, and grants the completed tool', () => {
    const state = createDefaultGameState();
    state.player.inventory = {
      'kraft-twigs': 4,
      'mossy-paper-fiber': 3,
      'bluefold-pebbles': 2,
    };

    const started = applyGameCommand(state, { type: 'startCraft', recipeId: 'flimsy-shovel', now: 1000 });
    expect(started.ok).toBe(true);
    expect(state.player.inventory['kraft-twigs']).toBe(0);
    expect(state.player.inventory['mossy-paper-fiber']).toBe(0);
    expect(state.player.inventory['bluefold-pebbles']).toBe(0);
    expect(state.world.thingMaker.activeCraft?.recipeId).toBe('flimsy-shovel');

    const tooEarly = applyGameCommand(state, { type: 'completeCraft', now: 2000 });
    expect(tooEarly.ok).toBe(false);
    expect(state.player.tools['flimsy-shovel']).toBeUndefined();

    const completed = applyGameCommand(state, { type: 'completeCraft', now: 8000 });
    expect(completed.ok).toBe(true);
    expect(state.world.thingMaker.activeCraft).toBeNull();
    // Finishing leaves the tool on the tray. It is not yours until collected.
    expect(state.world.thingMaker.trayOutputs).toEqual(['flimsy-shovel']);
    expect(state.player.tools['flimsy-shovel']).toBeUndefined();
    expect(state.player.equippedTool).toBeNull();
  });

  it('grants and equips a tool only when it is picked up', () => {
    const state = createDefaultGameState();
    state.world.thingMaker.trayOutputs = ['flimsy-shovel'];

    const result = applyGameCommand(state, { type: 'collectOutput', index: 0 });

    expect(result.ok).toBe(true);
    expect(state.player.tools['flimsy-shovel']).toBe(1);
    expect(state.player.equippedTool).toBe('flimsy-shovel');
    expect(state.world.thingMaker.trayOutputs).toEqual([]);
  });

  it('picks up the right thing when several are waiting', () => {
    // Regression guard: tray visuals used to be append-only and indexed by a
    // counter. Collecting from the middle has to remove that entry, not the
    // last one.
    const state = createDefaultGameState();
    state.world.thingMaker.trayOutputs = ['flimsy-shovel', 'creased-hoe', 'crease-scout'];

    const result = applyGameCommand(state, { type: 'collectOutput', index: 1 });

    expect(result.ok).toBe(true);
    expect(state.player.tools['creased-hoe']).toBe(1);
    expect(state.world.thingMaker.trayOutputs).toEqual(['flimsy-shovel', 'crease-scout']);
  });

  it('keeps the record of what was made after the tray is cleared', () => {
    const state = createDefaultGameState();
    state.player.inventory = { 'kraft-twigs': 4, 'mossy-paper-fiber': 3, 'bluefold-pebbles': 2 };
    applyGameCommand(state, { type: 'startCraft', recipeId: 'flimsy-shovel', now: 1000 });
    applyGameCommand(state, { type: 'completeCraft', now: 8000 });
    applyGameCommand(state, { type: 'collectOutput', index: 0 });

    // The Plans page reads this; picking a thing up must not erase the fact
    // that you have ever made it.
    expect(state.world.thingMaker.completedOutputs).toEqual(['flimsy-shovel']);
    expect(state.world.thingMaker.trayOutputs).toEqual([]);
  });

  it('refuses to collect from an empty slot', () => {
    const state = createDefaultGameState();
    const result = applyGameCommand(state, { type: 'collectOutput', index: 3 });
    expect(result.ok).toBe(false);
  });

  it('non-tool outputs go to items, not tools', () => {
    const state = createDefaultGameState();
    state.world.thingMaker.trayOutputs = ['crease-scout'];

    applyGameCommand(state, { type: 'collectOutput', index: 0 });

    expect(state.player.items['crease-scout']).toBe(1);
    expect(state.player.equippedTool).toBeNull();
  });
});

describe('terrain commands', () => {
  it('gives every plant its own extended maturation time', () => {
    const bloomTimes = Object.keys(SEED_DEFS).map((seedId) => bloomSeconds(seedId as keyof typeof SEED_DEFS));
    expect(new Set(bloomTimes).size).toBe(bloomTimes.length);
    expect(Math.min(...bloomTimes)).toBeGreaterThanOrEqual(240);
  });

  it('snaps the same world position to a stable cross-page terrain address', () => {
    // Derived from TERRAIN_CELL_SIZE rather than hardcoded, so retuning the
    // lattice is a one-line change instead of a test rewrite.
    const address = terrainCellAt(2.71, -3.02, () => '0,0');
    expect(address.pageId).toBe('0,0');
    expect(address.x).toBeCloseTo(Math.round(2.71 / TERRAIN_CELL_SIZE) * TERRAIN_CELL_SIZE, 6);
    expect(address.z).toBeCloseTo(Math.round(-3.02 / TERRAIN_CELL_SIZE) * TERRAIN_CELL_SIZE, 6);
    expect(address.cellKey).toBe(
      `${Math.round(2.71 / TERRAIN_CELL_SIZE)},${Math.round(-3.02 / TERRAIN_CELL_SIZE)}`,
    );
    // Snapping must be idempotent, or a cell's identity depends on where the
    // player happened to click inside it.
    expect(terrainCellAt(address.x, address.z, () => '0,0')).toEqual(address);
  });

  it('keeps the selected seed until its packet empties, then advances in catalog order', () => {
    const state = gardenStateForSelectionTest();
    const firstTarget = digGardenCellForSelectionTest(state, '0,0', 0, 0);
    const lastTarget = digGardenCellForSelectionTest(state, '2,0', 1, 0);
    state.player.inventory['buttonbloom-seeds'] = 2;
    state.player.inventory['raspberry-bush-seeds'] = 2;
    state.player.selectedSeed = 'buttonbloom-seeds';

    const first = applyGameCommand(state, {
      type: 'plantTerrain',
      target: firstTarget,
      seedId: 'buttonbloom-seeds',
      now: 2000,
    });
    expect(first.ok).toBe(true);
    expect(state.player.selectedSeed).toBe('buttonbloom-seeds');

    const last = applyGameCommand(state, {
      type: 'plantTerrain',
      target: lastTarget,
      seedId: 'buttonbloom-seeds',
      now: 2100,
    });

    expect(last.ok).toBe(true);
    expect(state.player.inventory['buttonbloom-seeds']).toBe(0);
    expect(state.player.selectedSeed).toBe('raspberry-bush-seeds');
  });

  it('wraps to an earlier carried seed and clears selection only when all packets are empty', () => {
    const state = gardenStateForSelectionTest();
    state.player.inventory['buttonbloom-seeds'] = 2;
    state.player.inventory['mend-me-seeds'] = 1;
    state.player.selectedSeed = 'mend-me-seeds';
    const first = digGardenCellForSelectionTest(state, '0,0', 0, 0);

    applyGameCommand(state, { type: 'plantTerrain', target: first, seedId: 'mend-me-seeds', now: 2000 });
    expect(state.player.selectedSeed).toBe('buttonbloom-seeds');

    state.player.inventory['buttonbloom-seeds'] = 1;
    const second = digGardenCellForSelectionTest(state, '2,0', 1, 0);
    applyGameCommand(state, { type: 'plantTerrain', target: second, seedId: 'buttonbloom-seeds', now: 2100 });
    expect(state.player.selectedSeed).toBeNull();
  });

  it('keeps one scoop small enough to overlap its neighbours', () => {
    // A dig must be wider than half a cell, otherwise adjacent digs leave
    // unturned ribs between them and a garden row cannot merge into a bed.
    expect(TERRAIN_CELL_RADIUS).toBeGreaterThan(TERRAIN_CELL_SIZE / 2);
    // ...but not so wide that one scoop swallows its neighbours' centres.
    expect(TERRAIN_CELL_RADIUS).toBeLessThan(TERRAIN_CELL_SIZE);
  });

  it('requires an owned, equipped digging tool', () => {
    const state = createDefaultGameState();
    const target = { pageId: '0,0', cellKey: '2,3', x: 2.5, z: 3.75 };

    const result = applyGameCommand(state, { type: 'digTerrain', target, discovery: SHALLOW_DISCOVERY, now: 1000 });

    expect(result.ok).toBe(false);
    expect(state.world.pages['0,0']).toBeUndefined();
  });

  it('persists a snapped shallow cell and prevents duplicate tier-one digging', () => {
    const state = createDefaultGameState();
    state.player.tools['flimsy-shovel'] = 1;
    state.player.equippedTool = 'flimsy-shovel';
    const target = { pageId: '0,0', cellKey: '2,3', x: 2.5, z: 3.75 };

    const first = applyGameCommand(state, { type: 'digTerrain', target, discovery: SHALLOW_DISCOVERY, now: 1000 });
    const second = applyGameCommand(state, { type: 'digTerrain', target, discovery: SHALLOW_DISCOVERY, now: 2000 });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(state.world.pages['0,0'].terrainEdits['2,3']).toMatchObject({
      kind: 'dug', state: 'dug', x: 2.5, z: 3.75, toolTier: 1, radius: TERRAIN_CELL_RADIUS,
    });
    expect(state.player.inventory['ochre-paperclay']).toBe(2);
    expect(state.world.pages['0,0'].terrainEdits['2,3'].revealedLayers).toEqual([SHALLOW_DISCOVERY]);

    const digDepth = state.world.pages['0,0'].terrainEdits['2,3'].depth;
    setGameStateForTests(state);
    expect(sampleTerrainHeight(2.5, 3.75)).toBeCloseTo(sampleBaseTerrainHeight(2.5, 3.75) - digDepth, 5);
    setGameStateForTests(null);
  });

  it('resolves repeatable regional geology and hill quantity bonuses', () => {
    const flat = resolveDigDiscovery({ biome: 'forest', pageSeed: 991, cellKey: '4,-2', layer: 1, hillRichness: 0 });
    const same = resolveDigDiscovery({ biome: 'forest', pageSeed: 991, cellKey: '4,-2', layer: 1, hillRichness: 0 });
    const hill = resolveDigDiscovery({ biome: 'forest', pageSeed: 991, cellKey: '4,-2', layer: 1, hillRichness: 1 });

    expect(same).toEqual(flat);
    expect(['carbon-soil', 'carbon-copy-shale', 'graphite-cardstone']).toContain(flat.resource);
    expect(hill.resource).toBe(flat.resource);
    expect(hill.quantity).toBeGreaterThanOrEqual(flat.quantity);
  });

  it('finds authored and generated-object footprints without renderer meshes', () => {
    expect(findDigFootprintBlocker(-0.12, -3.22, 0.72)?.id).toBe('thing-maker');
    expect(findDigFootprintBlocker(15, 15, 0.4)).toBeNull();
  });

  it('plants a persistent garden bed and consumes the selected seed', () => {
    const state = createDefaultGameState();
    state.player.tools['flimsy-shovel'] = 1;
    state.player.equippedTool = 'flimsy-shovel';
    const target = { pageId: '0,0', cellKey: '6,6', x: 7.5, z: 7.5 };
    applyGameCommand(state, { type: 'digTerrain', target, discovery: SHALLOW_DISCOVERY, now: 1000 });
    applyGameCommand(state, { type: 'selectSeed', seedId: 'buttonbloom-seeds' });

    const planted = applyGameCommand(state, { type: 'plantTerrain', target, seedId: 'buttonbloom-seeds', now: 2000 });

    expect(planted.ok).toBe(true);
    expect(state.player.inventory['buttonbloom-seeds']).toBe(1);
    expect(state.world.pages['0,0'].terrainEdits['6,6']).toMatchObject({
      state: 'planted', plantedSeedId: 'buttonbloom-seeds', plantedAt: 2000,
    });
    expect(state.world.pages['0,0'].terrainEdits['6,6'].nextSeedDropAt).toBeGreaterThan(2000);
  });

  it('lets tending accelerate a persistent seed drop and collects the new seed once', () => {
    const state = createDefaultGameState();
    state.player.tools['flimsy-shovel'] = 1;
    state.player.equippedTool = 'flimsy-shovel';
    const target = { pageId: '0,0', cellKey: '6,6', x: 7.5, z: 7.5 };
    applyGameCommand(state, { type: 'digTerrain', target, discovery: SHALLOW_DISCOVERY, now: 1000 });
    applyGameCommand(state, { type: 'plantTerrain', target, seedId: 'buttonbloom-seeds', now: 2000 });
    const beforeTending = state.world.pages['0,0'].terrainEdits['6,6'].nextSeedDropAt ?? 0;

    const tended = applyGameCommand(state, { type: 'tendPlant', target, now: 3000 });
    const afterTending = state.world.pages['0,0'].terrainEdits['6,6'].nextSeedDropAt ?? 0;
    // Seeds only come from a plant in full bloom, so every drop check has to
    // sit past the bloom time as well as past the scheduled drop.
    const bloomAt = 2000 + bloomSeconds('buttonbloom-seeds') * 1000;
    const dropAt = Math.max(afterTending, bloomAt);
    const tooSoon = applyGameCommand(state, { type: 'updatePlantSeedDrop', target, now: dropAt - 1 });
    const dropped = applyGameCommand(state, { type: 'updatePlantSeedDrop', target, now: dropAt });
    const collected = applyGameCommand(state, { type: 'collectPlantSeed', target, now: dropAt + 1 });
    const duplicate = applyGameCommand(state, { type: 'collectPlantSeed', target, now: dropAt + 2 });

    expect(tended.ok).toBe(true);
    expect(afterTending).toBeLessThan(beforeTending);
    expect(tooSoon.ok).toBe(false);
    expect(dropped.ok).toBe(true);
    expect(collected.ok).toBe(true);
    expect(duplicate.ok).toBe(false);
    expect(state.player.inventory['buttonbloom-seeds']).toBe(2);
    expect(state.world.pages['0,0'].terrainEdits['6,6'].seedDropReady).toBe(false);
    expect(state.world.pages['0,0'].terrainEdits['6,6'].seedDrops).toBe(1);
  });

  it('records a mature crop quietly once, even when growth is observed repeatedly', () => {
    const state = gardenStateForSelectionTest();
    state.player.inventory['raspberry-bush-seeds'] = 1;
    const target = digGardenCellForSelectionTest(state, '4,0', 2, 0);
    applyGameCommand(state, { type: 'plantTerrain', target, seedId: 'raspberry-bush-seeds', now: 2000 });
    const bloomAt = 2000 + bloomSeconds('raspberry-bush-seeds') * 1000;

    const first = applyGameCommand(state, { type: 'observePlantGrowth', target, now: bloomAt });
    const duplicate = applyGameCommand(state, { type: 'observePlantGrowth', target, now: bloomAt + 1000 });

    expect(first.ok).toBe(true);
    expect(duplicate.ok).toBe(false);
    expect(state.player.activityLog).toHaveLength(1);
    expect(state.player.activityLog[0]?.message).toContain('Raspberry Bush');
    expect(state.player.activityLog[0]?.message).toContain('ready to harvest');
  });

  it('harvests several fruit from a repeat crop and leaves the plant growing', () => {
    const state = gardenStateForSelectionTest();
    state.player.inventory['raspberry-bush-seeds'] = 1;
    const target = digGardenCellForSelectionTest(state, '4,0', 2, 0);
    applyGameCommand(state, { type: 'plantTerrain', target, seedId: 'raspberry-bush-seeds', now: 2000 });
    const ripeAt = 2000 + bloomSeconds('raspberry-bush-seeds') * 1000;
    applyGameCommand(state, { type: 'updatePlantSeedDrop', target, now: ripeAt });

    const result = applyGameCommand(state, { type: 'collectPlantSeed', target, now: ripeAt + 1 });
    const harvest = plantHarvest('raspberry-bush-seeds');

    expect(result.ok).toBe(true);
    expect(state.player.inventory.raspberries).toBe(harvest?.quantity);
    expect(state.world.pages['0,0'].terrainEdits[target.cellKey].state).toBe('planted');
    expect(state.world.pages['0,0'].terrainEdits[target.cellKey].nextSeedDropAt).toBeGreaterThan(ripeAt);
  });

  it('harvests a whole root crop into food and leaves a ready dug bed', () => {
    const state = gardenStateForSelectionTest();
    state.player.inventory['crinkle-carrot-seeds'] = 1;
    const target = digGardenCellForSelectionTest(state, '4,0', 2, 0);
    applyGameCommand(state, { type: 'plantTerrain', target, seedId: 'crinkle-carrot-seeds', now: 2000 });
    const ripeAt = 2000 + bloomSeconds('crinkle-carrot-seeds') * 1000;
    applyGameCommand(state, { type: 'updatePlantSeedDrop', target, now: ripeAt });

    const result = applyGameCommand(state, { type: 'collectPlantSeed', target, now: ripeAt + 1 });
    const edit = state.world.pages['0,0'].terrainEdits[target.cellKey];

    expect(result.ok).toBe(true);
    expect(state.player.inventory['crinkle-carrots']).toBe(plantHarvest('crinkle-carrot-seeds')?.quantity);
    expect(edit.state).toBe('dug');
    expect(edit.plantedSeedId).toBeUndefined();
  });

  it('lets a mending seed intentionally restore a dug cell', () => {
    const state = createDefaultGameState();
    state.player.tools['flimsy-shovel'] = 1;
    state.player.equippedTool = 'flimsy-shovel';
    const target = { pageId: '0,0', cellKey: '7,7', x: 8.75, z: 8.75 };
    applyGameCommand(state, { type: 'digTerrain', target, discovery: SHALLOW_DISCOVERY, now: 1000 });
    const planted = applyGameCommand(state, { type: 'plantTerrain', target, seedId: 'mend-me-seeds', now: 2000 });
    const tooSoon = applyGameCommand(state, { type: 'completeMending', target, now: 2001 });
    const complete = applyGameCommand(state, {
      type: 'completeMending',
      target,
      now: 2000 + bloomSeconds('mend-me-seeds') * 1000,
    });

    expect(planted.ok).toBe(true);
    expect(tooSoon.ok).toBe(false);
    expect(complete.ok).toBe(true);
    expect(state.world.pages['0,0'].terrainEdits['7,7']).toBeUndefined();
  });
});

describe('overlapping digs', () => {
  function digAt(state: ReturnType<typeof createDefaultGameState>, gridX: number, gridZ: number) {
    const target = {
      pageId: '0,0',
      cellKey: `${gridX},${gridZ}`,
      x: gridX * TERRAIN_CELL_SIZE,
      z: gridZ * TERRAIN_CELL_SIZE,
    };
    applyGameCommand(state, { type: 'digTerrain', target, discovery: SHALLOW_DISCOVERY, now: 1000 });
    return target;
  }

  function shovelState() {
    const state = createDefaultGameState();
    state.player.tools['flimsy-shovel'] = 1;
    state.player.equippedTool = 'flimsy-shovel';
    return state;
  }

  /** How far the ground has been lowered at a point, in world units. */
  function dugDepthAt(state: ReturnType<typeof createDefaultGameState>, x: number, z: number) {
    setGameStateForTests(state);
    const value = sampleBaseTerrainHeight(x, z) - sampleTerrainHeight(x, z);
    setGameStateForTests(null);
    return value;
  }

  it('merges adjacent scoops into one continuous bed', () => {
    // The point of the whole exercise. An earlier radius/falloff combination
    // left the midpoint between two adjacent digs at ~9% of full depth, so a
    // row read as separate dimples with unturned ridges between them.
    const state = shovelState();
    const a = digAt(state, 0, 0);
    digAt(state, 1, 0);
    const depth = state.world.pages['0,0'].terrainEdits[a.cellKey].depth;

    const midpoint = dugDepthAt(state, TERRAIN_CELL_SIZE / 2, 0);

    expect(midpoint / depth).toBeGreaterThan(0.7);
  });

  it('never digs deeper than a single scoop, however many overlap', () => {
    // Regression: depth contributions used to be summed. Once the lattice got
    // fine enough for scoops to overlap, a tidy row of holes excavated a
    // trench several times deeper than any single dig.
    const state = shovelState();
    for (let gridX = -3; gridX <= 3; gridX += 1) digAt(state, gridX, 0);
    const depth = state.world.pages['0,0'].terrainEdits['0,0'].depth;

    // Sample densely along the row, including every overlap band.
    for (let x = -1.5; x <= 1.5; x += 0.05) {
      expect(dugDepthAt(state, x, 0)).toBeLessThanOrEqual(depth + 1e-6);
    }
  });

  it('keeps a scoop centre at full depth', () => {
    const state = shovelState();
    for (let gridX = -3; gridX <= 3; gridX += 1) digAt(state, gridX, 0);
    const depth = state.world.pages['0,0'].terrainEdits['0,0'].depth;

    expect(dugDepthAt(state, 0, 0)).toBeCloseTo(depth, 5);
  });

  it('leaves ground outside the dug row untouched', () => {
    const state = shovelState();
    digAt(state, 0, 0);

    expect(dugDepthAt(state, TERRAIN_CELL_RADIUS + 0.1, 0)).toBeCloseTo(0, 6);
  });
});

describe('plant growth stages', () => {
  it('advances through every stage in order', () => {
    const sown = 1_000_000;
    const [sprout, bud, bloom] = SEED_DEFS['buttonbloom-seeds'].stageSeconds;
    const at = (seconds: number) => plantStageAt('buttonbloom-seeds', sown, sown + seconds * 1000);

    expect(at(0)).toBe('seeded');
    expect(at(sprout - 1)).toBe('seeded');
    expect(at(sprout)).toBe('sprout');
    expect(at(bud)).toBe('bud');
    expect(at(bloom)).toBe('bloom');
    // Stage must never regress once reached, however long the game is left.
    expect(at(bloom * 100)).toBe('bloom');
  });

  it('is derived from time alone, so a page can stream back in correct', () => {
    // No ticking, no stored stage: the same inputs always give the same
    // answer, which is what lets a plant be right after an hour away.
    const sown = 500;
    const later = sown + 60_000;
    expect(plantStageAt('buttonbloom-seeds', sown, later))
      .toBe(plantStageAt('buttonbloom-seeds', sown, later));
  });

  it('reports progress between stages without ever leaving 0..1', () => {
    const sown = 0;
    for (let seconds = 0; seconds <= 200; seconds += 3) {
      const progress = plantStageProgress('buttonbloom-seeds', sown, seconds * 1000);
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
    }
  });

  it('will not set seed before the plant blooms', () => {
    const state = createDefaultGameState();
    state.player.tools['flimsy-shovel'] = 1;
    state.player.equippedTool = 'flimsy-shovel';
    const target = { pageId: '0,0', cellKey: '9,9', x: 4.5, z: 4.5 };
    applyGameCommand(state, { type: 'digTerrain', target, discovery: SHALLOW_DISCOVERY, now: 1000 });
    applyGameCommand(state, { type: 'plantTerrain', target, seedId: 'buttonbloom-seeds', now: 2000 });

    // Far past the scheduled drop time, but still only a sprout.
    state.world.pages['0,0'].terrainEdits['9,9'].nextSeedDropAt = 2500;
    const early = applyGameCommand(state, { type: 'updatePlantSeedDrop', target, now: 3000 });

    expect(early.ok).toBe(false);
    expect(state.world.pages['0,0'].terrainEdits['9,9'].seedDropReady).toBe(false);
  });
});

describe('hoe: refilling and lifting', () => {
  function hoeState() {
    const state = createDefaultGameState();
    state.player.tools['flimsy-shovel'] = 1;
    state.player.tools['creased-hoe'] = 1;
    state.player.equippedTool = 'flimsy-shovel';
    return state;
  }

  function digCell(state: ReturnType<typeof createDefaultGameState>, cellKey: string, x: number, z: number) {
    const target = { pageId: '0,0', cellKey, x, z };
    applyGameCommand(state, { type: 'digTerrain', target, discovery: SHALLOW_DISCOVERY, now: 1000 });
    return target;
  }

  it('refuses to refill or lift without a hoe in hand', () => {
    const state = hoeState();
    const target = digCell(state, '1,1', 0.5, 0.5);

    const refill = applyGameCommand(state, { type: 'refillTerrain', target, now: 2000 });

    expect(refill.ok).toBe(false);
    expect(state.world.pages['0,0'].terrainEdits['1,1']).toBeDefined();
  });

  it('rakes a shallow scoop closed for free', () => {
    const state = hoeState();
    const target = digCell(state, '1,1', 0.5, 0.5);
    state.player.equippedTool = 'creased-hoe';
    const soilBefore = state.player.inventory['ochre-paperclay'];

    const result = applyGameCommand(state, { type: 'refillTerrain', target, now: 2000 });

    expect(result.ok).toBe(true);
    expect(state.world.pages['0,0'].terrainEdits['1,1']).toBeUndefined();
    expect(state.player.inventory['ochre-paperclay']).toBe(soilBefore);
  });

  it('charges soil for a deeper hole and refuses when short', () => {
    const state = hoeState();
    const target = digCell(state, '1,1', 0.5, 0.5);
    state.player.equippedTool = 'creased-hoe';
    // Stand in a tier-3 excavation.
    state.world.pages['0,0'].terrainEdits['1,1'].depth = 0.39;
    const cost = refillCost(0.39);
    expect(cost).toBeGreaterThan(0);

    state.player.inventory['ochre-paperclay'] = cost - 1;
    const short = applyGameCommand(state, { type: 'refillTerrain', target, now: 2000 });
    expect(short.ok).toBe(false);
    expect(state.world.pages['0,0'].terrainEdits['1,1']).toBeDefined();

    state.player.inventory['ochre-paperclay'] = cost + 2;
    const filled = applyGameCommand(state, { type: 'refillTerrain', target, now: 2100 });
    expect(filled.ok).toBe(true);
    expect(state.player.inventory['ochre-paperclay']).toBe(2);
  });

  it('will not refill a bed that still has something growing in it', () => {
    const state = hoeState();
    const target = digCell(state, '1,1', 0.5, 0.5);
    applyGameCommand(state, { type: 'plantTerrain', target, seedId: 'buttonbloom-seeds', now: 2000 });
    state.player.equippedTool = 'creased-hoe';

    const result = applyGameCommand(state, { type: 'refillTerrain', target, now: 2100 });

    expect(result.ok).toBe(false);
    expect(state.world.pages['0,0'].terrainEdits['1,1'].state).toBe('planted');
  });

  it('returns the seed when lifting a young plant', () => {
    const state = hoeState();
    const target = digCell(state, '1,1', 0.5, 0.5);
    const before = state.player.inventory['buttonbloom-seeds'] ?? 0;
    applyGameCommand(state, { type: 'plantTerrain', target, seedId: 'buttonbloom-seeds', now: 2000 });
    state.player.equippedTool = 'creased-hoe';

    const result = applyGameCommand(state, { type: 'liftPlant', target, now: 3000 });

    expect(result.ok).toBe(true);
    expect(state.player.inventory['buttonbloom-seeds']).toBe(before);
    // The bed survives; lifting is not the same as filling in.
    expect(state.world.pages['0,0'].terrainEdits['1,1'].state).toBe('dug');
  });

  it('returns the plant itself once it has bloomed', () => {
    const state = hoeState();
    const target = digCell(state, '1,1', 0.5, 0.5);
    applyGameCommand(state, { type: 'plantTerrain', target, seedId: 'buttonbloom-seeds', now: 2000 });
    state.player.equippedTool = 'creased-hoe';
    const seedsBefore = state.player.inventory['buttonbloom-seeds'] ?? 0;

    const bloomed = 2000 + bloomSeconds('buttonbloom-seeds') * 1000 + 1;
    const result = applyGameCommand(state, { type: 'liftPlant', target, now: bloomed });

    expect(result.ok).toBe(true);
    expect(state.player.items['plant:buttonbloom-seeds']).toBe(1);
    expect(state.player.inventory['buttonbloom-seeds']).toBe(seedsBefore);
  });

  it('keeps a seed that had already dropped when the plant is lifted', () => {
    const state = hoeState();
    const target = digCell(state, '1,1', 0.5, 0.5);
    applyGameCommand(state, { type: 'plantTerrain', target, seedId: 'buttonbloom-seeds', now: 2000 });
    state.player.equippedTool = 'creased-hoe';
    state.world.pages['0,0'].terrainEdits['1,1'].seedDropReady = true;
    const before = state.player.inventory['buttonbloom-seeds'] ?? 0;

    const bloomed = 2000 + bloomSeconds('buttonbloom-seeds') * 1000 + 1;
    applyGameCommand(state, { type: 'liftPlant', target, now: bloomed });

    // The loose seed was already earned; lifting the plant must not eat it.
    expect(state.player.inventory['buttonbloom-seeds']).toBe(before + 1);
  });

  it('frees the space it was claiming once lifted', () => {
    const state = hoeState();
    state.player.inventory['buttonbloom-seeds'] = 5;
    const first = digCell(state, '0,0', 0, 0);
    const neighbour = digCell(state, '1,0', TERRAIN_CELL_SIZE, 0);

    applyGameCommand(state, { type: 'plantTerrain', target: first, seedId: 'buttonbloom-seeds', now: 2000 });
    const crowded = applyGameCommand(state, { type: 'plantTerrain', target: neighbour, seedId: 'buttonbloom-seeds', now: 2100 });
    expect(crowded.ok).toBe(false);

    state.player.equippedTool = 'creased-hoe';
    applyGameCommand(state, { type: 'liftPlant', target: first, now: 2200 });
    state.player.equippedTool = 'flimsy-shovel';
    const nowFree = applyGameCommand(state, { type: 'plantTerrain', target: neighbour, seedId: 'buttonbloom-seeds', now: 2300 });

    expect(nowFree.ok).toBe(true);
  });
});

describe('plant spacing', () => {
  function dugState() {
    const state = createDefaultGameState();
    state.player.tools['flimsy-shovel'] = 1;
    state.player.equippedTool = 'flimsy-shovel';
    state.player.inventory['buttonbloom-seeds'] = 9;
    state.player.inventory['mend-me-seeds'] = 9;
    return state;
  }

  function dig(state: ReturnType<typeof createDefaultGameState>, gridX: number) {
    const target = {
      pageId: '0,0',
      cellKey: `${gridX},0`,
      x: gridX * TERRAIN_CELL_SIZE,
      z: 0,
    };
    applyGameCommand(state, { type: 'digTerrain', target, discovery: SHALLOW_DISCOVERY, now: 1000 });
    return target;
  }

  it('refuses to crowd a plant that needs room', () => {
    const state = dugState();
    const first = dig(state, 0);
    const neighbour = dig(state, 1); // one cell away: 0.5 units

    const a = applyGameCommand(state, { type: 'plantTerrain', target: first, seedId: 'buttonbloom-seeds', now: 2000 });
    const b = applyGameCommand(state, { type: 'plantTerrain', target: neighbour, seedId: 'buttonbloom-seeds', now: 2100 });

    expect(a.ok).toBe(true);
    // Buttonbloom spacing (0.85) exceeds one cell, so the neighbour is refused.
    expect(b.ok).toBe(false);
    expect(state.world.pages['0,0'].terrainEdits[neighbour.cellKey].state).toBe('dug');
  });

  it('allows groundcover in a tight row', () => {
    const state = dugState();
    const results = [0, 1, 2, 3].map((gridX) => {
      const target = dig(state, gridX);
      return applyGameCommand(state, { type: 'plantTerrain', target, seedId: 'mend-me-seeds', now: 2000 + gridX });
    });

    // Mend-me spacing (0.3) is under one cell, so an unbroken row is allowed.
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it('uses the larger requirement when two species meet', () => {
    const state = dugState();
    const flower = dig(state, 0);
    const cover = dig(state, 1);

    applyGameCommand(state, { type: 'plantTerrain', target: flower, seedId: 'buttonbloom-seeds', now: 2000 });
    const tucked = applyGameCommand(state, { type: 'plantTerrain', target: cover, seedId: 'mend-me-seeds', now: 2100 });

    // Groundcover is tidy, but the flower still wants its space.
    expect(tucked.ok).toBe(false);
  });

  it('does not spend a seed on a refused planting', () => {
    const state = dugState();
    const first = dig(state, 0);
    const neighbour = dig(state, 1);
    applyGameCommand(state, { type: 'plantTerrain', target: first, seedId: 'buttonbloom-seeds', now: 2000 });
    const before = state.player.inventory['buttonbloom-seeds'];

    applyGameCommand(state, { type: 'plantTerrain', target: neighbour, seedId: 'buttonbloom-seeds', now: 2100 });

    expect(state.player.inventory['buttonbloom-seeds']).toBe(before);
  });

  it('frees the space again once a bed is far enough away', () => {
    const state = dugState();
    const first = dig(state, 0);
    const distant = dig(state, 2); // 1.0 units, beyond buttonbloom spacing

    applyGameCommand(state, { type: 'plantTerrain', target: first, seedId: 'buttonbloom-seeds', now: 2000 });
    const second = applyGameCommand(state, { type: 'plantTerrain', target: distant, seedId: 'buttonbloom-seeds', now: 2100 });

    expect(second.ok).toBe(true);
  });
});

describe('placing build pieces', () => {
  function place(
    state: ReturnType<typeof createDefaultGameState>,
    templateKey: string,
    x: number,
    z: number,
    now: number,
    pageId = '0,0',
    rotY = 0,
  ) {
    return applyGameCommand(state, { type: 'placePiece', templateKey, x, z, rotY, pageId, now });
  }

  it('records a piece on the page and says what was placed', () => {
    const state = createDefaultGameState();

    const result = place(state, 'paper-bench', 6.5, -2.2, 1000);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.message).toBe('Placed the Paper bench.');
    const pieces = Object.values(state.world.pages['0,0'].placedPieces);
    expect(pieces).toHaveLength(1);
    expect(pieces[0]).toMatchObject({
      templateKey: 'paper-bench', x: 6.5, z: -2.2, page: '0,0',
    });
    expect(pieces[0]?.makerId).toBeTruthy();
  });

  it('creates the page state on demand', () => {
    const state = createDefaultGameState();

    const result = place(state, 'path-plank', 25.5, 18.25, 1000, '1,1');

    expect(result.ok).toBe(true);
    expect(Object.values(state.world.pages['1,1'].placedPieces)).toHaveLength(1);
  });

  it('refuses a template the player does not have', () => {
    const state = createDefaultGameState();

    const result = place(state, 'floating-castle', 6.5, -2.2, 1000);

    expect(result.ok).toBe(false);
    expect(state.world.pages['0,0']).toBeUndefined();
  });

  it('enforces physical overlap room-wide, not just on the target page', () => {
    const state = createDefaultGameState();
    place(state, 'paper-bench', 0, 0, 1000);

    // Their actual rectangles overlap even if the caller writes another page.
    const crowded = place(state, 'paper-lamp', 0.5, 0, 2000);

    expect(crowded.ok).toBe(false);
    expect(Object.values(state.world.pages['0,0'].placedPieces)).toHaveLength(1);
  });

  it('allows edge contact but refuses real footprint overlap', () => {
    const state = createDefaultGameState();
    place(state, 'paper-bench', 0, 0, 1000);

    // Bench and plank half-widths total 1.47. A small overlap is refused, while
    // exact edge contact is deliberately legal.
    const tooClose = place(state, 'path-plank', 1.42, 0, 2000);
    expect(tooClose.ok).toBe(false);

    const clear = place(state, 'path-plank', 1.47, 0, 3000);
    expect(clear.ok).toBe(true);
  });

  it('lets path planks overlap their own kind without accepting a duplicate click', () => {
    const state = createDefaultGameState();
    place(state, 'path-plank', 0, 0, 1000);

    expect(place(state, 'path-plank', 1.2, 0, 2000).ok).toBe(true);
    expect(place(state, 'path-plank', 0.02, 0, 3000).ok).toBe(false);
  });

  it('saves the rotation used by the placement preview', () => {
    const state = createDefaultGameState();

    expect(place(state, 'path-plank', 2, 3, 1000, '0,0', Math.PI / 2).ok).toBe(true);
    const piece = Object.values(state.world.pages['0,0'].placedPieces)[0];
    expect(piece.rotY).toBe(Math.PI / 2);
  });

  it('allows an independent piece far from the rest', () => {
    const state = createDefaultGameState();
    place(state, 'paper-bench', 0, 0, 1000);

    const far = place(state, 'paper-lamp', 10, 10, 2000, '1,1');

    expect(far.ok).toBe(true);
  });

  it('finishes a catalogued build step only with an equipped capable hammer', () => {
    const state = createDefaultGameState();
    const command = {
      type: 'completeBuildStep' as const,
      templateKey: 'path-plank',
      stepId: 'build',
      x: 6.5,
      z: -2.2,
      rotY: 0,
      pageId: '0,0',
      now: 1000,
    };

    const bareHands = applyGameCommand(state, command);
    expect(bareHands.ok).toBe(false);
    expect(state.world.pages['0,0']).toBeUndefined();

    state.player.tools['squeaky-hammer'] = 1;
    state.player.equippedTool = 'squeaky-hammer';
    const built = applyGameCommand(state, command);

    expect(built.ok).toBe(true);
    expect(Object.values(state.world.pages['0,0'].placedPieces)).toHaveLength(1);
    expect(Object.values(state.world.pages['0,0'].buildSites)).toHaveLength(0);
  });

  it('refuses an out-of-order or invented assembly step without creating a site', () => {
    const state = createDefaultGameState();
    state.player.tools['squeaky-hammer'] = 1;
    state.player.equippedTool = 'squeaky-hammer';

    const result = applyGameCommand(state, {
      type: 'completeBuildStep',
      templateKey: 'paper-bench',
      stepId: 'attach-roof',
      x: 4,
      z: 4,
      rotY: 0,
      pageId: '0,0',
      now: 1000,
    });

    expect(result.ok).toBe(false);
    expect(Object.values(state.world.pages['0,0'].buildSites)).toHaveLength(0);
    expect(Object.values(state.world.pages['0,0'].placedPieces)).toHaveLength(0);
  });
});
