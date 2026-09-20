import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../render/context', () => ({ textureLoader: { load: () => ({}) } }));
vi.mock('../world/terrain', () => ({ sampleTerrainHeight: () => 0 }));
vi.mock('../render/materials', () => ({ getMaterial: () => new THREE.MeshBasicMaterial() }));

// The real footprint query generates pages; these tests are about the wet-bed
// rule, so what stands in the water is stubbed and controlled per test.
let obstruction: { label: string } | null = null;
vi.mock('../world/footprints', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../world/footprints')>()),
  findNonWaterFootprintBlocker: () => obstruction,
  findDigFootprintBlocker: () => null,
}));

const { registerWaterBody, resetWaterForTests, SHALLOW_WATER_DEPTH } = await import('../world/water');
const { resolveGardenAction } = await import('./gardenActions');
const { createDefaultGameState } = await import('../sim/state');
const { terrainCellAt } = await import('../sim/terrainCells');

function pond(id: string, x: number, depth: number) {
  registerWaterBody({ id, x, z: 0, halfWidth: 3, halfDepth: 3, rotationY: 0, depth });
}

function hoeWith(seed: 'lotus-fold-seeds' | 'marsh-reed-seeds' | 'buttonbloom-seeds') {
  const state = createDefaultGameState();
  state.player.tools['creased-hoe'] = 1;
  state.player.equippedTool = 'creased-hoe';
  state.player.inventory[seed] = 3;
  state.player.selectedSeed = seed;
  // Rooting in the shallows is know-how; the gate has its own test below.
  state.player.plans.push('shallow-water-planting');
  return state;
}

function at(x: number, z: number) {
  const target = terrainCellAt(x, z, () => '0,0');
  return { pageId: target.pageId, cellKey: target.cellKey, x: target.x, z: target.z };
}

beforeEach(() => {
  resetWaterForTests();
  obstruction = null;
});
afterEach(() => resetWaterForTests());

describe('the hoe over shallow water', () => {
  it('lets a lotus be sown into a pond with no bed dug', () => {
    pond('p', 0, SHALLOW_WATER_DEPTH);
    const action = resolveGardenAction(at(0, 0), { inReach: true, state: hoeWith('lotus-fold-seeds') });
    expect(action).toMatchObject({ kind: 'plant', ok: true, wetBed: true });
  });

  it('does the same for marsh reeds', () => {
    pond('p', 0, SHALLOW_WATER_DEPTH);
    const action = resolveGardenAction(at(0, 0), { inReach: true, state: hoeWith('marsh-reed-seeds') });
    expect(action).toMatchObject({ kind: 'plant', ok: true, wetBed: true });
  });

  it('gives an ordinary seed no bed in the same water', () => {
    pond('p', 0, SHALLOW_WATER_DEPTH);
    const action = resolveGardenAction(at(0, 0), { inReach: true, state: hoeWith('buttonbloom-seeds') });
    expect(action).toMatchObject({ kind: 'plant', ok: false, blocker: { kind: 'no-bed' } });
  });

  it('gives a lotus no bed on dry ground', () => {
    pond('p', 20, SHALLOW_WATER_DEPTH);
    const action = resolveGardenAction(at(0, 0), { inReach: true, state: hoeWith('lotus-fold-seeds') });
    expect(action).toMatchObject({ kind: 'plant', ok: false, blocker: { kind: 'no-bed' } });
  });

  it('gives a lotus no bed in deep water', () => {
    pond('deep', 0, 0.9);
    const action = resolveGardenAction(at(0, 0), { inReach: true, state: hoeWith('lotus-fold-seeds') });
    expect(action).toMatchObject({ kind: 'plant', ok: false, blocker: { kind: 'no-bed' } });
  });

  it('is blocked by something standing in the water, and names it', () => {
    pond('p', 0, SHALLOW_WATER_DEPTH);
    obstruction = { label: 'a stone' };
    const action = resolveGardenAction(at(0, 0), { inReach: true, state: hoeWith('lotus-fold-seeds') });
    expect(action).toMatchObject({ kind: 'plant', ok: false, blocker: { kind: 'blocked', label: 'a stone' } });
  });

  it('still lifts a lotus that is already growing in the water', () => {
    pond('p', 0, SHALLOW_WATER_DEPTH);
    const state = hoeWith('lotus-fold-seeds');
    const target = at(0, 0);
    state.world.pages['0,0'] = {
      ...(state.world.pages['0,0'] ?? ({} as never)),
      terrainEdits: {
        [target.cellKey]: {
          kind: 'dug', state: 'planted', x: target.x, z: target.z, depth: 0, radius: 0.25,
          toolTier: 0, geologySeed: 0, revealedLayers: [], changedAt: 1,
          plantedSeedId: 'lotus-fold-seeds', plantedAt: 1,
        },
      },
    } as never;
    const action = resolveGardenAction(target, { inReach: true, state });
    expect(action).toMatchObject({ kind: 'lift', ok: true });
  });
});

describe('the hoe over shallow water without the know-how', () => {
  it('explains that the lesson is missing instead of pretending there is no bed', () => {
    pond('p', 0, SHALLOW_WATER_DEPTH);
    const state = hoeWith('lotus-fold-seeds');
    state.player.plans = state.player.plans.filter((id) => id !== 'shallow-water-planting');
    const action = resolveGardenAction(at(0, 0), { inReach: true, state });
    expect(action).toMatchObject({
      kind: 'plant', ok: false,
      blocker: { kind: 'needs-know-how', ability: 'shallow-water-planting' },
    });
  });
});
