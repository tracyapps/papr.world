import { describe, expect, it } from 'vitest';
import { nudgeToFreeSpot, slideMove } from './placement';

/** A square obstruction centred on the origin. */
const inBox = (x: number, z: number) => Math.abs(x) < 1 && Math.abs(z) < 1;

describe('nudgeToFreeSpot', () => {
  it('leaves a free point exactly where it is', () => {
    expect(nudgeToFreeSpot(5, 5, inBox)).toEqual({ x: 5, z: 5 });
  });

  it('moves a blocked point clear', () => {
    const moved = nudgeToFreeSpot(0, 0, inBox);
    expect(inBox(moved.x, moved.z)).toBe(false);
  });

  it('is deterministic, so nudged spawns agree across reloads and clients', () => {
    expect(nudgeToFreeSpot(0.2, -0.3, inBox)).toEqual(nudgeToFreeSpot(0.2, -0.3, inBox));
  });

  it('finds the near edge rather than wandering far off', () => {
    const moved = nudgeToFreeSpot(0, 0, inBox);
    expect(Math.hypot(moved.x, moved.z)).toBeLessThan(2);
  });

  it('gives up gracefully when everything is blocked', () => {
    const moved = nudgeToFreeSpot(0, 0, () => true, 2);
    expect(moved).toEqual({ x: 0, z: 0 });
  });

  it('finds a narrow gap between obstacles', () => {
    // Rings are angle-offset so successive rings do not probe the same
    // spokes; a fixed spoke pattern can miss a thin corridor.
    const wallsWithGap = (x: number, z: number) => Math.abs(z) < 1.5 && !(x > 1.4 && x < 1.9);
    const moved = nudgeToFreeSpot(0, 0, wallsWithGap);
    expect(wallsWithGap(moved.x, moved.z)).toBe(false);
  });
});

describe('slideMove', () => {
  // A wall running along z, occupying x in [0, 1].
  const wall = (x: number, _z: number) => x > 0 && x < 1;

  it('takes an unobstructed step whole', () => {
    expect(slideMove(-3, 0, 0.5, 0.25, wall)).toEqual({ x: -2.5, z: 0.25 });
  });

  it('slides along a wall instead of stopping dead', () => {
    // Walking diagonally into the wall: the x component is refused, the z
    // component still happens, so you scrape past rather than sticking.
    const moved = slideMove(-0.1, 0, 0.5, 0.5, wall);
    expect(moved.x).toBe(-0.1);
    expect(moved.z).toBe(0.5);
  });

  it('refuses a step straight into a wall', () => {
    expect(slideMove(-0.1, 0, 0.5, 0, wall)).toEqual({ x: -0.1, z: 0 });
  });

  it('never traps something already inside an obstacle', () => {
    // A building placed on top of you must not become a prison. This is the
    // deliberate escape hatch, not an oversight.
    expect(slideMove(0.5, 0, 0.4, 0, wall)).toEqual({ x: 0.9, z: 0 });
  });

  it('lets you walk out of a wall you were stuck in', () => {
    const moved = slideMove(0.5, 0, -0.9, 0, wall);
    expect(wall(moved.x, moved.z)).toBe(false);
  });
});
