import { describe, expect, it } from 'vitest';
import {
  INTERIOR_ORIGIN,
  describeArrival,
  homeInteriorLayout,
  interiorBlocked,
  interiorName,
  isInInteriorSpace,
  nearInteriorExit,
} from './homeInterior';
import { PAGE_SIZE } from './types';

describe('the home interior', () => {
  it('is bigger than the tent looks from outside', () => {
    const layout = homeInteriorLayout([]);
    // The tent outside is 1.8 by 2.0 units.
    expect(layout.halfWidth * 2).toBeGreaterThan(1.8 * 2);
    expect(layout.halfDepth * 2).toBeGreaterThan(2.0 * 2);
  });

  it('opens out sideways with each annex room', () => {
    const none = homeInteriorLayout([]);
    const one = homeInteriorLayout(['room-1']);
    const two = homeInteriorLayout(['room-1', 'room-2']);
    expect(one.halfWidth).toBeGreaterThan(none.halfWidth);
    expect(two.halfWidth).toBeGreaterThan(one.halfWidth);
    expect(two.halfDepth).toBe(none.halfDepth);
  });

  it('lets you in where you can stand, and stops you at the walls', () => {
    const layout = homeInteriorLayout([]);
    expect(interiorBlocked(layout, layout.entry.x, layout.entry.z, 0.22)).toBe(false);
    expect(interiorBlocked(layout, layout.exit.x, layout.exit.z, 0.22)).toBe(false);
    expect(interiorBlocked(layout, INTERIOR_ORIGIN.x, INTERIOR_ORIGIN.z, 0.22)).toBe(false);
    expect(interiorBlocked(layout, INTERIOR_ORIGIN.x + layout.halfWidth, INTERIOR_ORIGIN.z, 0.22)).toBe(true);
    expect(interiorBlocked(layout, INTERIOR_ORIGIN.x, INTERIOR_ORIGIN.z - layout.halfDepth, 0.22)).toBe(true);
    // A wider body is stopped sooner.
    const nearWall = INTERIOR_ORIGIN.x + layout.halfWidth - 0.3;
    expect(interiorBlocked(layout, nearWall, INTERIOR_ORIGIN.z, 0.22)).toBe(false);
    expect(interiorBlocked(layout, nearWall, INTERIOR_ORIGIN.z, 0.5)).toBe(true);
  });

  it('offers the way out at the door, and only near it', () => {
    const layout = homeInteriorLayout([]);
    expect(nearInteriorExit(layout, layout.entry.x, layout.entry.z)).toBe(true);
    expect(nearInteriorExit(layout, INTERIOR_ORIGIN.x, INTERIOR_ORIGIN.z - 2)).toBe(false);
  });

  it('is parked where no surface page is streamed near the clearing', () => {
    expect(Math.abs(INTERIOR_ORIGIN.x) / PAGE_SIZE).toBeGreaterThan(100);
    expect(isInInteriorSpace(INTERIOR_ORIGIN.x + 3, INTERIOR_ORIGIN.z - 2)).toBe(true);
    expect(isInInteriorSpace(0, 0)).toBe(false);
  });

  it('names itself and says the exit on arrival', () => {
    expect(interiorName([])).toBe('tent');
    expect(interiorName(['floor', 'walls', 'roof'])).toBe('house');
    expect(describeArrival([])).toMatch(/Inside your tent\. Exit:/);
    expect(describeArrival(['floor', 'walls', 'roof'])).toMatch(/Inside your house\./);
  });
});
