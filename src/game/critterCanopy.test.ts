import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// Canopy behaviour: sloths, monkeys, and toucans living in the trees.
// The world is stubbed flat and dry, with a few trees stated plainly below.

vi.mock('../render/context', () => ({
  textureLoader: { load: () => new THREE.Texture() },
}));
vi.mock('../world/terrain', () => ({ sampleTerrainHeight: () => 0 }));
vi.mock('../world/water', () => ({
  bridgeDeckHeightAt: () => null,
  isDeepWater: () => false,
  isInWater: () => false,
  waterDepthAt: () => 0,
}));
vi.mock('./friendship', () => ({ getBoldnessBoost: () => 0 }));

/** Only the trunks are solid, as in the real footprint table. */
let solidChecks = 0;
const TRUNKS: Array<[number, number]> = [[0, 0], [6, 0], [0, 7], [-6, 2]];
vi.mock('../world/footprints', () => ({
  isSolidAt: (x: number, z: number, radius = 0) => {
    solidChecks += 1;
    return TRUNKS.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < 0.28 + radius);
  },
}));

const { buildCritterRig } = await import('./critterRigs');
const { generateCritterParams } = await import('./critterVariation');
const { updateCritter, critterReachDistance } = await import('./critterBehavior');
const { attachCanopy, canopyTreesFromPage, isAloft, requestCanopyVisit } = await import('./critterCanopy');
type Critter = import('./critterBehavior').Critter;
type CritterSpecies = import('./critterVariation').CritterSpecies;
type PageData = import('../world/types').PageData;

const PAGE: PageData = {
  id: '0,0',
  px: 0,
  pz: 0,
  biome: 'tropical',
  seed: 1,
  groundMaterial: 'ground.tropical',
  terrain: [],
  props: [
    {
      kind: 'tree', tree: 'jungle-1', x: 0, z: 0, rotY: 0, height: 12,
      vines: [{ art: 'hanging-vine-1', offset: 2, topY: 5.6, height: 3.4, depth: 0.14 }],
    },
    { kind: 'tree', tree: 'jungle-2', x: 6, z: 0, rotY: 0.2, height: 11 },
    { kind: 'tree', tree: 'jungle-1', x: 0, z: 7, rotY: -0.3, height: 10 },
    { kind: 'tree', tree: 'palm-1', x: -6, z: 2, rotY: 0.1, height: 8 },
    // Too small to hold anyone.
    { kind: 'tree', tree: 'jungle-2', x: 15, z: 15, height: 5 },
    // Not a canopy tree at all.
    { kind: 'tree', tree: 'pine-tall', x: -15, z: -15, height: 12 },
  ],
};

const TREES = canopyTreesFromPage(PAGE, () => 0, () => false);

function seededRng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

function makeCritter(species: CritterSpecies, seed = 12345): Critter {
  const params = generateCritterParams(species, seed);
  params.shyness = 0.9; // no spontaneous visits unless a test asks for one
  const rig = buildCritterRig(species, params);
  rig.group.position.set(1, 0, 1);
  const critter: Critter = {
    id: `test#${species}`,
    species,
    params,
    rig,
    home: new THREE.Vector3(1, 0, 1),
    rng: seededRng(seed),
    state: 'idle',
    stateTime: 0,
    stateDuration: 1,
    target: new THREE.Vector3(1, 0, 1),
    heading: 0,
    walkPhase: 0,
    curiousRange: 3.5,
    mapFeatureId: 'critter:test',
    idleAction: 'settle',
    idleDuration: 1,
    noticed: false,
    friendship: 0,
    friendshipCheckedAt: 0,
    detour: null,
    detourSign: 0,
    detourTime: 0,
    pathBlocked: false,
    pathCooldown: 0,
  };
  expect(attachCanopy(critter, TREES)).toBe(true);
  return critter;
}

const FAR_AWAY = new THREE.Vector3(40, 0, 40);

/** Run for `seconds`, calling `each` after every frame. */
function run(critter: Critter, seconds: number, player = FAR_AWAY, each?: (t: number) => void) {
  const step = 1 / 30;
  for (let t = 0; t < seconds; t += step) {
    updateCritter(critter, step, t, player);
    each?.(t);
  }
}

describe('canopy trees', () => {
  it('keeps tall jungle trees and palms, with their vines, and nothing else', () => {
    expect(TREES.map((tree) => tree.kind)).toEqual(['jungle', 'jungle', 'jungle', 'palm']);
    expect(TREES[0].vines).toHaveLength(1);
    expect(TREES[0].vines[0].bottomY).toBeCloseTo(2.2);
    for (const tree of TREES) {
      expect(tree.lineY).toBeGreaterThan(2);
      expect(tree.lineY).toBeLessThan(tree.height);
    }
  });
});

describe.each(['sloth', 'monkey', 'toucan'] as const)('%s in the canopy', (species) => {
  it('starts up in a tree', () => {
    const critter = makeCritter(species);
    expect(isAloft(critter)).toBe(true);
    expect(critter.rig.group.position.y).toBeGreaterThan(1.5);
  });

  it('lives sensibly for ten minutes: no NaNs, never underground, never far from its trees', () => {
    const critter = makeCritter(species);
    const modes = new Set<string>();
    run(critter, 600, FAR_AWAY, () => {
      const { x, y, z } = critter.rig.group.position;
      expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)).toBe(true);
      expect(y).toBeGreaterThan(-0.2);
      expect(y).toBeLessThan(14);
      expect(Math.hypot(x, z - 2)).toBeLessThan(18);
      modes.add(critter.canopy!.mode);
    });
    // Monkeys and toucans certainly visit the ground in ten minutes; the
    // sloth may or may not, which is correct.
    if (species !== 'sloth') expect(modes).toEqual(new Set(['aloft', 'ground']));
  });

  it('costs no footprint queries while it sits in a tree', () => {
    const critter = makeCritter(species);
    // Hold it at rest: a long idle, then count.
    critter.stateDuration = 1e6;
    critter.idleDuration = 1e6;
    solidChecks = 0;
    run(critter, 5);
    expect(solidChecks).toBe(0);
  });
});

describe('coming down to say hello', () => {
  it('a monkey asked from below comes down near the player', () => {
    const critter = makeCritter('monkey');
    const player = critter.rig.group.position.clone().setY(0).add(new THREE.Vector3(1.5, 0, 1.5));
    expect(requestCanopyVisit(critter, player, () => 0)).toBe('coming');
    run(critter, 6, player);
    expect(isAloft(critter)).toBe(false);
    const { x, z } = critter.rig.group.position;
    expect(Math.hypot(x - player.x, z - player.z)).toBeLessThan(3.5);
  });

  it('a sloth takes its time about it', () => {
    const critter = makeCritter('sloth');
    const player = critter.rig.group.position.clone().setY(0);
    expect(requestCanopyVisit(critter, player, () => 0)).toBe('slow');
    run(critter, 3, player);
    // Three seconds in, a sloth is nowhere near the ground yet.
    expect(isAloft(critter)).toBe(true);
  });

  it('can be talked to from directly underneath', () => {
    const critter = makeCritter('sloth');
    const below = critter.rig.group.position.clone().setY(0);
    expect(critter.rig.group.position.distanceTo(below)).toBeGreaterThan(3);
    expect(critterReachDistance(critter, below)).toBeLessThan(0.01);
  });
});
