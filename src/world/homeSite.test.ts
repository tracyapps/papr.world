import { describe, expect, it } from 'vitest';
import {
  HOME_ANNEX_REACH,
  HOME_BODY_RADIUS,
  HOME_DOORSTEP_DISTANCE,
  homeDoorstep,
  homeFacing,
  homePosition,
  homeSolids,
} from './homeSite';

const HOME = { x: -1.5, z: -2.2 };

describe('the home site', () => {
  it('stands beside the saved Home place, not on top of it', () => {
    expect(homePosition(HOME)).not.toEqual(HOME);
  });

  it('leaves the Home place itself outside the tent, so you spawn on the doorstep', () => {
    const [body] = homeSolids(HOME, { first: false, second: false });
    const gap = Math.hypot(HOME.x - body.x, HOME.z - body.z);
    // Clear of the tent's ground plus a walker's body (about 0.3).
    expect(gap).toBeGreaterThan(HOME_BODY_RADIUS + 0.3);
  });

  it('turns the door toward the Home place', () => {
    const spot = homePosition(HOME);
    const turn = homeFacing();
    // The door is the model's +z side, which a turn of t sends to (sin t, cos t).
    const door = { x: Math.sin(turn), z: Math.cos(turn) };
    const toHome = { x: HOME.x - spot.x, z: HOME.z - spot.z };
    const length = Math.hypot(toHome.x, toHome.z);
    expect(door.x * (toHome.x / length) + door.z * (toHome.z / length)).toBeCloseTo(1, 5);
  });

  it('adds a solid per annex room, either side of the house', () => {
    const none = homeSolids(HOME, { first: false, second: false });
    const both = homeSolids(HOME, { first: true, second: true });
    expect(none).toHaveLength(1);
    expect(both).toHaveLength(3);
    const [body, one, two] = both;
    expect(Math.hypot(one.x - body.x, one.z - body.z)).toBeCloseTo(HOME_ANNEX_REACH, 5);
    expect(Math.hypot(two.x - body.x, two.z - body.z)).toBeCloseTo(HOME_ANNEX_REACH, 5);
    // Opposite sides: the two annexes mirror through the middle.
    expect(one.x + two.x).toBeCloseTo(2 * body.x, 5);
    expect(one.z + two.z).toBeCloseTo(2 * body.z, 5);
  });

  it('keeps the tent clear of the Thing Maker, the trail sign and the display wall', () => {
    const [body] = homeSolids(HOME, { first: true, second: true });
    const neighbours = [
      { x: -0.12, z: -3.22, r: 1.35 },
      { x: -4.05, z: -4.7, r: 0.48 },
      { x: -0.85, z: 1.65, r: 1.05 },
    ];
    for (const other of neighbours) {
      expect(Math.hypot(body.x - other.x, body.z - other.z)).toBeGreaterThan(HOME_BODY_RADIUS + other.r);
    }
  });
});

describe('the doorstep', () => {
  it('is in front of the door, clear of every solid, and within reach of the house', () => {
    const solids = homeSolids(HOME, { first: true, second: true });
    const step = homeDoorstep(HOME);
    for (const solid of solids) {
      // 0.22 is the player's body radius.
      expect(Math.hypot(step.x - solid.x, step.z - solid.z)).toBeGreaterThan(solid.radius + 0.22);
    }
    const spot = homePosition(HOME);
    expect(Math.hypot(step.x - spot.x, step.z - spot.z)).toBeCloseTo(HOME_DOORSTEP_DISTANCE, 5);
  });
});
