import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// Behaviour tests, not geometry: the world these critters walk through is a
// stub so the obstacle layout is stated plainly in the test rather than
// depending on whatever the clearing happens to contain.

vi.mock('../render/context', () => ({
  textureLoader: { load: () => new THREE.Texture() },
}));
vi.mock('../world/terrain', () => ({ sampleTerrainHeight: () => 0 }));
let deepWater = (_x: number, _z: number) => false;
vi.mock('../world/water', () => ({
  bridgeDeckHeightAt: () => null,
  isDeepWater: (x: number, z: number) => deepWater(x, z),
  isInWater: () => false,
  waterDepthAt: () => 0,
}));
vi.mock('./friendship', () => ({ getBoldnessBoost: () => 0 }));

/**
 * A wall along x = 0, spanning z from -4 to 4, with no gap.
 *
 * The reported bug: a critter on one side of a wall, wanting to reach
 * something on the other, pressed into it and looked stuck.
 */
let solid = (x: number, z: number) => Math.abs(x) < 0.35 && Math.abs(z) < 4;

/**
 * Every `isSolidAt` call is counted, because the cost of this query is the
 * thing that broke the game once already — see the budget test below.
 */
let solidChecks = 0;

vi.mock('../world/footprints', () => ({
  isSolidAt: (x: number, z: number, radius = 0) => {
    solidChecks += 1;
    return solid(x, z) || solid(x + radius, z) || solid(x - radius, z)
      || solid(x, z + radius) || solid(x, z - radius);
  },
}));

const { buildCritterRig } = await import('./critterRigs');
const { generateCritterParams } = await import('./critterVariation');
const { updateCritter } = await import('./critterBehavior');
type Critter = import('./critterBehavior').Critter;

function makeCritter(x: number, z: number, targetX: number, targetZ: number): Critter {
  const params = generateCritterParams('cat', 12345);
  // Wide range so a detour is never mistaken for the critter deciding it had
  // strayed too far from home.
  params.wanderRadius = 20;
  const rig = buildCritterRig('cat', params);
  rig.group.position.set(x, 0, z);
  let seed = 7;
  const rng = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  return {
    id: 'test#cat',
    species: 'cat',
    params,
    rig,
    home: new THREE.Vector3(x, 0, z),
    rng,
    state: 'wander',
    stateTime: 0,
    stateDuration: 99,
    target: new THREE.Vector3(targetX, 0, targetZ),
    heading: 0,
    walkPhase: 0,
    curiousRange: 0, // never notices the player; this is a pure navigation test
    mapFeatureId: 'critter:test',
    idleAction: 'attentive',
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

/**
 * Run the behaviour loop at 60Hz until the critter reaches its target.
 *
 * Stopping at arrival matters: a critter that gets there goes idle and then
 * wanders off somewhere random, so the *final* position says nothing about
 * whether it succeeded. What the journey did is the thing under test.
 *
 * `pathLength` is the honest measure here. "Did it eventually arrive?" does
 * not discriminate — a critter that only slides along walls, or dithers at
 * every corner, still blunders its way there in the end. The difference the
 * player actually sees is whether the journey looked purposeful or like
 * scraping along a wall, and that shows up as distance travelled.
 */
function travel(critter: Critter, maxSeconds: number) {
  const target = critter.target.clone();
  const start = critter.rig.group.position.clone();
  // The player stands beside the critter's start: beyond STEER_RANGE critters
  // deliberately stop steering, so a distant observer would measure the cheap
  // path instead of the navigation under test. `curiousRange` is 0, so being
  // watched changes nothing else.
  const away = start.clone();
  const step = 1 / 60;
  const previous = start.clone();
  let arrived = false;
  let seconds = 0;
  let pathLength = 0;
  let maxDetourZ = 0;
  let insideWall = false;
  let enteredDeepWater = false;
  for (let t = 0; t < maxSeconds && !arrived; t += step) {
    updateCritter(critter, step, t, away);
    const { x, z } = critter.rig.group.position;
    if (solid(x, z)) insideWall = true;
    if (deepWater(x, z)) enteredDeepWater = true;
    pathLength += Math.hypot(x - previous.x, z - previous.z);
    previous.set(x, 0, z);
    maxDetourZ = Math.max(maxDetourZ, Math.abs(z - start.z));
    seconds = t;
    if (Math.hypot(x - target.x, z - target.z) < 0.5) arrived = true;
  }
  return { arrived, seconds, pathLength, maxDetourZ, insideWall, enteredDeepWater };
}

describe('critter navigation', () => {
  it('walks briskly around the end of a wall to reach its target', () => {
    // Straight through the wall is 4 units; round the end is about 9. Sliding
    // along the wall instead of steering round it costs half again as much
    // distance, and dithering at the corner costs more still — so the budget
    // below is what separates "went round" from "scraped along until free".
    const critter = makeCritter(-2, 0, 2, 0);
    const journey = travel(critter, 60);

    expect(journey.arrived).toBe(true);
    expect(journey.maxDetourZ).toBeGreaterThan(3);
    expect(journey.pathLength).toBeLessThan(14);
  });

  it('never ends up inside the wall on the way', () => {
    const critter = makeCritter(-2, 0, 2, 0);
    expect(travel(critter, 60).insideWall).toBe(false);
  });

  it('goes round the near end of a wall, not the far one', () => {
    // Meeting the wall off-centre, one end is much closer. Choosing by "how
    // much room is on each side" alone makes both ends look identical — the
    // critter cheerfully sets off the long way round and still arrives, just
    // absurdly late. Path length is what catches that.
    const critter = makeCritter(-1, 1.5, 2, 1.5);
    const journey = travel(critter, 60);

    expect(journey.arrived).toBe(true);
    expect(journey.pathLength).toBeLessThan(13);
  });

  it('takes the direct line when nothing is in the way', () => {
    // The detour must not become the default: in open ground a critter should
    // still walk straight at where it is going.
    const critter = makeCritter(-6, 0, -3, 0);
    const journey = travel(critter, 30);

    expect(journey.arrived).toBe(true);
    expect(journey.maxDetourZ).toBeLessThan(0.5);
    expect(journey.pathLength).toBeLessThan(3.5);
  });

  it('routes deterministically, so clients agree on where a critter went', () => {
    // Critter positions are not synced — every client re-simulates from the
    // same seed. A route that depended on anything unseeded would put the same
    // animal in two places for two players standing side by side.
    const a = travel(makeCritter(-2, 0, 2, 0), 60);
    const b = travel(makeCritter(-2, 0, 2, 0), 60);

    expect(a.arrived).toBe(true);
    expect(b.pathLength).toBeCloseTo(a.pathLength, 10);
    expect(b.seconds).toBeCloseTo(a.seconds, 10);
  });

  it('stays inside its per-frame query budget', () => {
    // This is a correctness test, not an optimisation.
    //
    // `isSolidAt` walks the page registry — roughly 7µs a call. The first
    // version of the detour code probed the whole path every frame, which came
    // to about 18ms per frame across a clearing full of critters: the entire
    // 60fps budget. The world still rendered, but at single-digit frame rates
    // clicks land between frames and the game stops responding to input.
    //
    // The throttle is what keeps it cheap, so the budget is asserted rather
    // than assumed. This is the worst case — a critter navigating a wall for
    // its whole life — and it measures under 4 checks a frame, about 1ms for
    // 40 critters. The headroom below is for tuning, not for regressions.
    const critter = makeCritter(-2, 0, 2, 0);
    // Player standing right there, so this measures the expensive path: far
    // from the player, critters skip steering entirely.
    const nearby = new THREE.Vector3(-2, 0, 0.5);
    const frames = 600;

    solidChecks = 0;
    for (let i = 0; i < frames; i += 1) updateCritter(critter, 1 / 60, i / 60, nearby);

    expect(solidChecks / frames).toBeLessThan(6);
  });

  it('leaves a wall it somehow started inside rather than staying stuck', () => {
    const critter = makeCritter(0, 0, 4, 0);
    travel(critter, 30);

    expect(solid(critter.rig.group.position.x, critter.rig.group.position.z)).toBe(false);
  });

  it('routes around deep water instead of walking into the middle of it', () => {
    const previousSolid = solid;
    solid = () => false;
    deepWater = (x, z) => Math.abs(x) < 0.55 && Math.abs(z) < 1.7;
    try {
      const journey = travel(makeCritter(-2, 0, 2, 0), 40);
      expect(journey.arrived).toBe(true);
      expect(journey.enteredDeepWater).toBe(false);
      expect(journey.maxDetourZ).toBeGreaterThan(1.4);
    } finally {
      solid = previousSolid;
      deepWater = () => false;
    }
  });
});
