import { describe, expect, it } from 'vitest';
import { createDwelling } from '../sim/dwellingState';
import type { DwellingState } from '../sim/state';
import { describeHome, exteriorPlan, exteriorSignature, homePosition, isNearHome, HOME_REACH } from './dwellingLook';

function house(parts: DwellingState['parts'], projects: DwellingState['projects'] = {}): DwellingState {
  return { parts, projects };
}

describe('the home exterior', () => {
  it('is a tent on a ground sheet to begin with', () => {
    const plan = exteriorPlan(createDwelling());
    expect(plan).toMatchObject({ tent: true, groundSheet: true, floor: false, walls: false, roof: false, upper: false, rooms: 0, scaffolding: null });
  });

  it('retires the tent cloth only when the roof goes on, and the ground sheet when the floor does', () => {
    expect(exteriorPlan(house(['floor'])).groundSheet).toBe(false);
    expect(exteriorPlan(house(['floor', 'walls'])).tent).toBe(true);
    expect(exteriorPlan(house(['floor', 'walls', 'roof'])).tent).toBe(false);
  });

  it('counts extra rooms', () => {
    expect(exteriorPlan(house(['floor', 'walls', 'room-1'])).rooms).toBe(1);
    expect(exteriorPlan(house(['floor', 'walls', 'room-1', 'room-2'])).rooms).toBe(2);
  });

  it('puts scaffolding up only once a build has actually started', () => {
    const collecting = house([], { floor: { paid: { layerboard: 1 }, startedAt: null, completesAt: null } });
    expect(exteriorPlan(collecting).scaffolding).toBeNull();
    const building = house([], { floor: { paid: { layerboard: 4, 'binding-cord': 2 }, startedAt: 1, completesAt: 9 } });
    expect(exteriorPlan(building).scaffolding).toBe('floor');
  });

  it('changes its signature exactly when the picture changes', () => {
    const a = exteriorSignature(exteriorPlan(createDwelling()));
    const b = exteriorSignature(exteriorPlan(house(['floor'])));
    const again = exteriorSignature(exteriorPlan(createDwelling()));
    expect(a).not.toBe(b);
    expect(a).toBe(again);
    // Paying into a project that has not started changes nothing you can see.
    const collecting = house([], { floor: { paid: { layerboard: 1 }, startedAt: null, completesAt: null } });
    expect(exteriorSignature(exteriorPlan(collecting))).toBe(a);
  });
});

describe('the home in words', () => {
  it('describes the tent, then each stage', () => {
    expect(describeHome(createDwelling())).toContain('tent');
    expect(describeHome(house(['floor']))).toContain('a floor');
    expect(describeHome(house(['floor', 'walls', 'roof']))).toContain('cottage');
    expect(describeHome(house(['floor', 'walls', 'roof', 'upstairs']))).toContain('two-storey');
  });

  it('mentions scaffolding while a part is going up', () => {
    const building = house([], { floor: { paid: {}, startedAt: 1, completesAt: 9 } });
    expect(describeHome(building)).toContain('Scaffolding');
  });
});

describe('where the home stands', () => {
  it('sits beside the saved Home place, not on top of it', () => {
    const spot = homePosition({ x: -1.5, z: -2.2 });
    expect(spot).not.toEqual({ x: -1.5, z: -2.2 });
  });

  it('is near when within reach of the door', () => {
    const place = { x: 0, z: 0 };
    const spot = homePosition(place);
    expect(isNearHome({ x: spot.x + 1, z: spot.z }, place)).toBe(true);
    expect(isNearHome({ x: spot.x + HOME_REACH + 1, z: spot.z }, place)).toBe(false);
  });
});
