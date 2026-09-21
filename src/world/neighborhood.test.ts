import { describe, expect, it } from 'vitest';
import { homeFacing, homePlaceForLot, homePosition } from './homeSite';
import { homeAddress } from './neighborHomes';
import {
  KEEP_HOME_LOT,
  LOT_CAPACITY,
  LOT_MAX_RING,
  LOT_POSITION_SLACK,
  LOT_SPACING,
  isLotFree,
  lotInRing,
  nextLot,
  resolveHomeLot,
  ringSlotCount,
  stableHash,
  type HomeAnchor,
  type Lot,
} from './neighborhood';

/** The solo spawn, so the first lot can be checked against a real number. */
const ORIGIN = { x: -1.5, z: -2.2 };
const PAGE = '0,0';

/** Hand out `count` lots the way a client would: one, then the next, and so on. */
function fill(count: number, page = PAGE, origin = ORIGIN): Lot[] {
  const lots: Lot[] = [];
  for (let index = 0; index < count; index += 1) {
    const lot = nextLot(lots, origin, page);
    if (!lot) throw new Error('the clump reported itself full');
    lots.push(lot);
  }
  return lots;
}

function distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

describe('the neighbourhood lots', () => {
  it('gives the first lot to the origin itself, untouched', () => {
    const lot = nextLot([], ORIGIN, PAGE);
    expect(lot).toEqual({ ...ORIGIN, facing: homeFacing(), ring: 0, index: 0 });
  });

  it('is pure: the same taken ground always names the same lot, in any order', () => {
    const anchors = [ORIGIN, lotInRing(1, 0, ORIGIN, PAGE), lotInRing(1, 3, ORIGIN, PAGE)];
    const first = nextLot(anchors, ORIGIN, PAGE);
    expect(first).not.toBeNull();
    expect(nextLot(anchors, ORIGIN, PAGE)).toEqual(first);
    expect(nextLot([...anchors].reverse(), ORIGIN, PAGE)).toEqual(first);
    // Frozen inputs, so a stray write would throw rather than quietly change
    // what the next caller is handed.
    expect(nextLot(Object.freeze([...anchors]), Object.freeze({ ...ORIGIN }), PAGE)).toEqual(first);
  });

  it('fills the inner ring before spilling outward', () => {
    const lots = fill(8);
    expect(lots.map((lot) => [lot.ring, lot.index])).toEqual([
      [0, 0],
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 4],
      [1, 5],
      [1, 6],
      [2, 7],
    ]);
    // Numbered in the order they were handed out, so "how many neighbours were
    // here before you" is the same answer on every machine.
    expect(lots.every((lot, index) => lot.index === index)).toBe(true);
  });

  it('skips a slot somebody already stands on', () => {
    const taken = [ORIGIN, lotInRing(1, 0, ORIGIN, PAGE)];
    expect(nextLot(taken, ORIGIN, PAGE)).toEqual(lotInRing(1, 1, ORIGIN, PAGE));
  });

  it('skips lots rejected by the surrounding world', () => {
    const lot = nextLot([], ORIGIN, PAGE, 2, (candidate) => (
      candidate.x !== ORIGIN.x || candidate.z !== ORIGIN.z
    ));
    expect(lot?.ring).toBe(1);
  });

  it('keeps every lot at least the spacing from every other, on any page', () => {
    for (const page of [PAGE, '3,-7', '']) {
      const grid: Lot[] = [];
      for (let ring = 0; ring <= 4; ring += 1) {
        for (let slot = 0; slot < ringSlotCount(ring); slot += 1) {
          grid.push(lotInRing(ring, slot, ORIGIN, page));
        }
      }
      expect(grid).toHaveLength(1 + 6 + 12 + 18 + 24);
      let closest = Infinity;
      for (let a = 0; a < grid.length; a += 1) {
        for (let b = a + 1; b < grid.length; b += 1) {
          closest = Math.min(closest, distance(grid[a], grid[b]));
        }
      }
      // Slack for the thousandths a lot position is rounded to, not for the
      // spacing itself.
      expect(closest).toBeGreaterThanOrEqual(LOT_SPACING - 0.002);
    }
  });

  it('finds room again for a neighbour who is not standing on a slot', () => {
    const movedHome = { x: ORIGIN.x + 5, z: ORIGIN.z };
    const lot = nextLot([movedHome], ORIGIN, PAGE);
    expect(lot).not.toBeNull();
    // The origin is 5 away from them, which is too close: the sweep must step
    // out rather than crowd them.
    expect(lot!.ring).toBeGreaterThan(0);
    expect(distance(lot!, movedHome)).toBeGreaterThanOrEqual(LOT_SPACING - LOT_POSITION_SLACK);
  });

  it('turns each page clump its own way, and never moves the origin', () => {
    const here = lotInRing(1, 0, ORIGIN, PAGE);
    const elsewhere = lotInRing(1, 0, ORIGIN, '12,-3');
    expect(here).not.toEqual(elsewhere);
    for (const lot of [here, elsewhere]) {
      expect(distance(lot, ORIGIN)).toBeCloseTo(LOT_SPACING, 2);
      expect(lot.facing).toBe(homeFacing());
    }
    expect(nextLot([], ORIGIN, '12,-3')).toEqual(nextLot([], ORIGIN, '12,-3'));
  });

  it('says the clump is full rather than stamping lots on top of each other', () => {
    expect(nextLot([], ORIGIN, PAGE, 0)).toEqual({ ...ORIGIN, facing: homeFacing(), ring: 0, index: 0 });
    expect(nextLot([ORIGIN], ORIGIN, PAGE, 0)).toBeNull();
    // 1 + 6·(1+2+…+LOT_MAX_RING).
    expect(LOT_CAPACITY).toBe(1 + 6 * ((LOT_MAX_RING * (LOT_MAX_RING + 1)) / 2));
    expect(LOT_CAPACITY).toBeGreaterThan(500);
  });

  it('answers the spacing rule directly, and shrugs at nonsense on the wire', () => {
    const lot = lotInRing(1, 0, ORIGIN, PAGE);
    expect(isLotFree(lot, [])).toBe(true);
    expect(isLotFree(lot, [{ x: lot.x, z: lot.z }])).toBe(false);
    expect(isLotFree(lot, [{ x: lot.x + LOT_SPACING, z: lot.z }])).toBe(true);
    expect(isLotFree(lot, [{ x: Number.NaN, z: 0 }, { x: 0, z: Infinity }])).toBe(true);
  });

  it('has one hash, and it is the same everywhere', () => {
    expect(stableHash('')).toBe(stableHash(''));
    expect(stableHash('0,0')).toBe(stableHash('0,0'));
    expect(stableHash('0,0')).not.toBe(stableHash('0,1'));
    expect(Number.isInteger(stableHash('acct-ada'))).toBe(true);
  });

  it('hands a lot to homeSite, which puts the tent beside it and the door at it', () => {
    const lot = nextLot([], ORIGIN, PAGE)!;
    const place = homePlaceForLot(lot);
    expect(place).toEqual({ x: lot.x, z: lot.z });
    expect(homePosition(place)).toEqual(homePosition(ORIGIN));
    expect(lot.facing).toBe(homeFacing());
  });
});

// Which home keeps a contested slot, and which one moves aside. The ids on the
// anchors are what make this answerable without a round trip, so every test
// feeds them in.
describe('resolving which lot a home claims', () => {
  const anchor = (accountId: string, point: { x: number; z: number }): HomeAnchor => ({
    accountId,
    ...point,
  });

  it('gives an unassigned player the next free lot, origin and all', () => {
    const taken = [anchor('acct-a', ORIGIN)];
    const lot = resolveHomeLot({
      selfAccountId: 'acct-new',
      selfLot: null,
      anchors: taken,
      origin: ORIGIN,
      page: PAGE,
    });
    expect(lot).toEqual(nextLot(taken, ORIGIN, PAGE));
    expect(lot).not.toBe(KEEP_HOME_LOT);
    // With nobody around, the first lot of all is the origin itself.
    expect(resolveHomeLot({
      selfAccountId: 'acct-new',
      selfLot: null,
      anchors: [],
      origin: ORIGIN,
      page: PAGE,
    })).toEqual({ ...ORIGIN, facing: homeFacing(), ring: 0, index: 0 });
  });

  it('keeps a lot nobody else claims, whichever way the ids sort', () => {
    const mine = lotInRing(1, 0, ORIGIN, PAGE);
    // A neighbour on the origin, eight units clear of this slot.
    const taken = [anchor('acct-b', ORIGIN)];
    expect(resolveHomeLot({ selfAccountId: 'acct-a', selfLot: mine, anchors: taken, origin: ORIGIN, page: PAGE }))
      .toBe(KEEP_HOME_LOT);
    expect(resolveHomeLot({ selfAccountId: 'acct-z', selfLot: mine, anchors: taken, origin: ORIGIN, page: PAGE }))
      .toBe(KEEP_HOME_LOT);
  });

  it('moves an existing home when its lot is occupied by the world', () => {
    const next = resolveHomeLot({
      selfAccountId: 'acct-a',
      selfLot: ORIGIN,
      anchors: [],
      origin: ORIGIN,
      page: PAGE,
      candidateAllowed: (candidate) => candidate.x !== ORIGIN.x || candidate.z !== ORIGIN.z,
    });
    expect(next).not.toBe(KEEP_HOME_LOT);
    expect(next).not.toBeNull();
    expect((next as Lot).ring).toBe(1);
  });

  it('yields a contested slot to the account whose id sorts first', () => {
    // Two saved homes on the same spot (the fixed spawn, before the clump).
    const mine = { x: ORIGIN.x, z: ORIGIN.z };
    const earlierSeesLater = [anchor('acct-b', ORIGIN)];
    const laterSeesEarlier = [anchor('acct-a', ORIGIN)];

    // The earlier id keeps the origin untouched.
    expect(resolveHomeLot({
      selfAccountId: 'acct-a', selfLot: mine, anchors: earlierSeesLater, origin: ORIGIN, page: PAGE,
    })).toBe(KEEP_HOME_LOT);

    // The later id takes the next free lot instead.
    const moved = resolveHomeLot({
      selfAccountId: 'acct-b', selfLot: mine, anchors: laterSeesEarlier, origin: ORIGIN, page: PAGE,
    });
    expect(moved).not.toBe(KEEP_HOME_LOT);
    expect(moved).not.toBeNull();
    expect((moved as Lot).x).not.toBeCloseTo(ORIGIN.x, 3);
    expect((moved as Lot).z).not.toBeCloseTo(ORIGIN.z, 3);
  });

  it('is pure: our own anchor is ignored, and the answer does not move', () => {
    const mine = { x: ORIGIN.x, z: ORIGIN.z };
    const input = {
      selfAccountId: 'acct-b',
      selfLot: mine,
      anchors: [anchor('acct-a', ORIGIN), anchor('acct-b', ORIGIN)],
      origin: ORIGIN,
      page: PAGE,
    };
    const first = resolveHomeLot(input);
    expect(resolveHomeLot({ ...input, anchors: [...input.anchors].reverse() })).toEqual(first);
  });

  it('settles a clump with no two homes resolved onto the same lot', () => {
    // Every account starts on the fixed spawn, as they did before the clump
    // existed, and re-checks the way a client does whenever the list changes.
    const ids = ['acct-a', 'acct-b', 'acct-c', 'acct-d', 'acct-e'];
    let lots = new Map(ids.map((id) => [id, { x: ORIGIN.x, z: ORIGIN.z }]));
    for (let round = 0; round < 50; round += 1) {
      let moved = false;
      for (const id of ids) {
        const anchors = ids
          .filter((other) => other !== id)
          .map((other) => anchor(other, lots.get(other)!));
        const next = resolveHomeLot({
          selfAccountId: id, selfLot: lots.get(id)!, anchors, origin: ORIGIN, page: PAGE,
        });
        if (next && next !== KEEP_HOME_LOT) {
          lots.set(id, { x: next.x, z: next.z });
          moved = true;
        }
      }
      if (!moved) break;
    }
    const placed = [...lots.values()];
    expect(placed).toHaveLength(ids.length);
    for (let a = 0; a < placed.length; a += 1) {
      for (let b = a + 1; b < placed.length; b += 1) {
        expect(distance(placed[a], placed[b])).toBeGreaterThanOrEqual(LOT_SPACING - 0.002);
      }
    }
  });
});

// `homeAddress` lives in neighborHomes.ts; its few tests ride here so the
// neighbourhood keeps one new test file.
describe('the address plate', () => {
  it('reads as a house number and a name', () => {
    const address = homeAddress({ accountId: 'acct-ada', name: 'Wren' });
    expect(address.text).toBe(`No. ${address.number} · Wren`);
    expect(address.number).toBeGreaterThanOrEqual(1);
    expect(address.number).toBeLessThanOrEqual(99);
    expect(address.accountId).toBe('acct-ada');
    expect(address.name).toBe('Wren');
  });

  it('gives one account one number, whatever they are called and however often they are asked', () => {
    const first = homeAddress({ accountId: 'acct-ada', name: 'Wren' });
    expect(homeAddress({ accountId: 'acct-ada', name: 'Wren' })).toEqual(first);
    expect(homeAddress({ accountId: 'acct-ada', name: 'Ada Lovelace' }).number).toBe(first.number);
    expect(homeAddress({ accountId: 'acct-bo', name: 'Wren' }).number).not.toBe(first.number);
  });

  it('spreads the numbers over the accounts it is given', () => {
    const numbers = new Set<number>();
    for (let index = 0; index < 300; index += 1) {
      numbers.add(homeAddress({ accountId: `acct-${index}`, name: 'Somebody' }).number);
    }
    expect(numbers.size).toBeGreaterThan(60);
  });

  it('falls back to the same name the sign falls back to', () => {
    expect(homeAddress({ accountId: 'acct-ada', name: '' }).text).toMatch(/· A neighbor$/);
  });
});
