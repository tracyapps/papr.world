import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The locomotion layer: how a species moves, as data. These tests pin the
// contract the water policies and hop profiles promise, so wiring a frog
// (`{ water: 'wade', hop: ... }`) or a fish (`{ water: 'swim' }`) later is
// guaranteed to behave as documented rather than as remembered.

vi.mock('../render/context', () => ({
  textureLoader: { load: () => new THREE.Texture() },
}));
vi.mock('../world/terrain', () => ({ sampleTerrainHeight: () => 0 }));
let wet = (_x: number, _z: number) => false;
vi.mock('../world/water', () => ({
  bridgeDeckHeightAt: () => null,
  isDeepWater: () => false,
  isInWater: (x: number, z: number) => wet(x, z),
  waterDepthAt: () => 0,
}));
vi.mock('./friendship', () => ({ getBoldnessBoost: () => 0 }));
vi.mock('../world/footprints', () => ({ isSolidAt: () => false }));

const { buildCritterRig } = await import('./critterRigs');
const { generateCritterParams } = await import('./critterVariation');
const { updateCritter } = await import('./critterBehavior');
const { LOCOMOTION, locomotionOf } = await import('./critterLocomotion');
type Critter = import('./critterBehavior').Critter;

function makeCritter(species: import('./critterVariation').CritterSpecies): Critter {
  const params = generateCritterParams(species, 999);
  params.wanderRadius = 6;
  const rig = buildCritterRig(species, params);
  rig.group.position.set(0, 0, 0);
  let seed = 4242;
  return {
    id: 'test#walker',
    species,
    params,
    rig,
    home: new THREE.Vector3(0, 0, 0),
    rng: () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    },
    state: 'idle',
    stateTime: 99, // let the first update pick a wander target immediately
    stateDuration: 1,
    target: new THREE.Vector3(0, 0, 0),
    heading: 0,
    walkPhase: 0,
    curiousRange: 0,
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
}

const AWAY = new THREE.Vector3(40, 0, 40);

/** Where did this critter's wander targets actually land? */
function collectTargets(critter: Critter, seconds: number) {
  const spots: Array<{ x: number; z: number }> = [];
  let lastState = '';
  const step = 1 / 30;
  for (let t = 0; t < seconds; t += step) {
    updateCritter(critter, step, t, AWAY);
    if (critter.state === 'wander' && lastState !== 'wander') {
      spots.push({ x: critter.target.x, z: critter.target.z });
    }
    lastState = critter.state;
  }
  return spots;
}

describe('locomotion profiles', () => {
  it('gives walkers the plain default and hoppers their arc', () => {
    expect(locomotionOf('cat')).toEqual({ water: 'avoid' });
    expect(locomotionOf('bunny').hop?.height).toBeGreaterThan(0);
    expect(locomotionOf('squirrel').hop).toBeUndefined();
    // Unlisted species inherit the default rather than undefined.
    expect(locomotionOf('raccoon').water).toBe('avoid');
  });
});

describe('water policies', () => {
  afterEach(() => {
    delete LOCOMOTION.cat;
    wet = () => false;
  });

  it("'avoid' never chooses a destination in water when dry ground exists", () => {
    // A pond strip just west of home: close enough to probe into, small
    // enough that dry ground dominates every other direction.
    wet = (x, _z) => x < -1.5;
    const critter = makeCritter('cat');
    const spots = collectTargets(critter, 30);
    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) {
      expect(wet(spot.x, spot.z), `avoider targeted water at (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)})`).toBe(false);
    }
  });

  it("'wade' may choose a destination in water", () => {
    wet = () => true;
    LOCOMOTION.cat = { water: 'wade' };
    const critter = makeCritter('cat');
    const spots = collectTargets(critter, 20);
    expect(spots.length).toBeGreaterThan(0);
    expect(spots.every((spot) => wet(spot.x, spot.z))).toBe(true);
  });

  it("'swim' only ever chooses wet destinations", () => {
    // Half the world is pond: anything with |x| < 5.
    wet = (x, _z) => Math.abs(x) < 5;
    LOCOMOTION.cat = { water: 'swim' };
    const critter = makeCritter('cat');
    const spots = collectTargets(critter, 30);
    expect(spots.length).toBeGreaterThan(0);
    for (const spot of spots) {
      expect(wet(spot.x, spot.z), `targeted dry ground at (${spot.x.toFixed(2)}, ${spot.z.toFixed(2)})`).toBe(true);
    }
  });
});
