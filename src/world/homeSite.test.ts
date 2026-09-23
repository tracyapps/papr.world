import { describe, expect, it } from 'vitest';
import {
  HOME_ANNEX_REACH,
  HOME_ANNEX_Z_OFFSET,
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

  it('adds a solid per annex room, either side of the house and pulled toward the rear', () => {
    const none = homeSolids(HOME, { first: false, second: false });
    const both = homeSolids(HOME, { first: true, second: true });
    expect(none).toHaveLength(1);
    expect(both).toHaveLength(3);
    const [body, one, two] = both;
    // Each annex sits HOME_ANNEX_REACH sideways and HOME_ANNEX_Z_OFFSET back
    // (in the house's own local axes), so its distance from the body center
    // is the hypotenuse of the two, not the reach alone.
    const expectedDistance = Math.hypot(HOME_ANNEX_REACH, HOME_ANNEX_Z_OFFSET);
    expect(Math.hypot(one.x - body.x, one.z - body.z)).toBeCloseTo(expectedDistance, 5);
    expect(Math.hypot(two.x - body.x, two.z - body.z)).toBeCloseTo(expectedDistance, 5);
    // Mirrored side-to-side (the sideways step flips sign between the two),
    // but both are pulled toward the rear by the same amount, so the pair's
    // midpoint sits behind the body center rather than on top of it.
    const turn = homeFacing();
    const midX = (one.x + two.x) / 2;
    const midZ = (one.z + two.z) / 2;
    expect(midX).toBeCloseTo(body.x + HOME_ANNEX_Z_OFFSET * Math.sin(turn), 5);
    expect(midZ).toBeCloseTo(body.z + HOME_ANNEX_Z_OFFSET * Math.cos(turn), 5);
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
