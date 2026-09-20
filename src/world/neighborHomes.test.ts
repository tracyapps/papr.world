import { afterEach, describe, expect, it } from 'vitest';
import { homeDoorstep, homePosition } from './homeSite';
import {
  allNeighborHomes,
  clearNeighborHomes,
  distanceToNeighborEdge,
  getNeighborHome,
  nearestNeighborHome,
  neighborHomeFrom,
  neighborHomeSolids,
  removeNeighborHome,
  setNeighborHome,
  signWords,
  subscribeNeighborHomes,
} from './neighborHomes';

afterEach(() => clearNeighborHomes());

const ada = { accountId: 'acct-ada', name: 'Ada', x: 10, z: 10, parts: ['floor', 'walls'], building: 'roof', open: true };

describe('neighbor homes', () => {
  it('keeps only the parts this game knows and never invents an open sign', () => {
    const home = neighborHomeFrom({ ...ADA(), parts: ['floor', 'moat', 'floor', 'walls'], building: 'moat', open: undefined });
    expect(home?.parts).toEqual(['floor', 'walls']);
    expect(home?.building).toBeNull();
    expect(home?.open).toBe(false);
  });

  it('refuses a home with no owner or a nonsense place', () => {
    expect(neighborHomeFrom({ ...ADA(), accountId: '' })).toBeNull();
    expect(neighborHomeFrom({ ...ADA(), x: Number.NaN })).toBeNull();
  });

  it('adds, replaces and removes, and tells listeners each time', () => {
    let calls = 0;
    const off = subscribeNeighborHomes(() => { calls += 1; });
    setNeighborHome(ada);
    setNeighborHome({ ...ada, open: false });
    expect(allNeighborHomes()).toHaveLength(1);
    expect(getNeighborHome('acct-ada')?.open).toBe(false);
    removeNeighborHome('acct-ada');
    removeNeighborHome('acct-ada');
    expect(calls).toBe(3);
    off();
  });

  it('finds the home you are standing at, and only within reach', () => {
    setNeighborHome(ada);
    const step = homeDoorstep({ x: 10, z: 10 });
    expect(nearestNeighborHome(step)?.accountId).toBe('acct-ada');
    expect(nearestNeighborHome({ x: step.x + 40, z: step.z })).toBeNull();
  });

  it('picks the nearer of two homes', () => {
    setNeighborHome(ada);
    setNeighborHome({ ...ada, accountId: 'acct-bo', name: 'Bo', x: 12, z: 10 });
    const bo = homePosition({ x: 12, z: 10 });
    expect(nearestNeighborHome({ x: bo.x, z: bo.z + 1 })?.accountId).toBe('acct-bo');
  });

  it('gives each home its own solids, with room annexes when the parts are there', () => {
    const plain = neighborHomeSolids(neighborHomeFrom(ADA())!);
    const roomy = neighborHomeSolids(neighborHomeFrom({ ...ADA(), parts: ['room-1', 'room-2'] })!);
    expect(plain).toHaveLength(1);
    expect(roomy).toHaveLength(3);
    expect(new Set(roomy.map((solid) => solid.id)).size).toBe(3);
    expect(roomy.every((solid) => solid.id.startsWith('neighbor:acct-ada:'))).toBe(true);
  });

  it('measures to the wall, not the middle', () => {
    const home = neighborHomeFrom(ADA())!;
    const spot = homePosition(home.place);
    expect(distanceToNeighborEdge(home, spot)).toBe(0);
    expect(distanceToNeighborEdge(home, { x: spot.x + 3, z: spot.z })).toBeCloseTo(3 - 1.25, 5);
  });
});

describe('the sign', () => {
  it('says open house when it is, whatever is built', () => {
    expect(signWords(neighborHomeFrom({ ...ADA(), open: true, parts: ['floor'] })!).heading).toBe('OPEN HOUSE');
  });
  it('says a home is being built until something is finished', () => {
    expect(signWords(neighborHomeFrom(ADA())!).heading).toBe('BUILDING A HOME');
    expect(signWords(neighborHomeFrom({ ...ADA(), parts: ['floor'] })!).heading).toBe('HOME');
  });
});

function ADA() {
  return { accountId: 'acct-ada', name: 'Ada', x: 10, z: 10, parts: [] as string[], building: '', open: false };
}
