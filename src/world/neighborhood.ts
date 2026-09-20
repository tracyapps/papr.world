// Where a neighbourhood's lots are: the clump of starter homes that grows
// around an origin, so a new player lands beside their neighbours instead of on
// top of them. Renderer-free like homeSite.ts, and — the whole point of it —
// PURE AND DETERMINISTIC: the same page, origin and taken ground always name
// the same next lot, so two clients and the server agree about where a home
// stands without ever syncing a lot number or a lot index.
//
// A lot is a *place*: the spot the Home bookmark sits on. Where the tent stands
// beside it and which way the door turns is homeSite.ts's business, not this
// file's. (docs/land-and-dwellings.md — "unbounded to explore, clustered to
// live"; docs/house-and-home.md — every player is given a home.)
//
// "Taken ground" is any point that already claims space: a neighbour's Home
// place today, and any landmark a caller wants the clump to give way to. That
// is land-and-dwellings.md's spacing rule — "nothing is owned; some things
// simply cannot be built too close together" — read as arithmetic.

import { homeFacing } from './homeSite';

/**
 * Centre-to-centre spacing between lots, in world units.
 *
 * Sized from what a home actually claims rather than picked for looks. The
 * house body reaches 1.25 from its middle and an annex room reaches
 * 1.75 + 0.95 = 2.7 (homeSite.ts), so two fully grown homes need 5.4 between
 * their middles just to stop touching — and stopping at 5.4 would leave none
 * of the *usable* gap land-and-dwellings.md insists on, since a display case
 * claims about a metre of ground and a walker needs half of one. 8 leaves the
 * worst-angled pair of neighbours 2.6 of clear ground between annex walls:
 * enough to walk between them, put a case down, or grow a strip of garden.
 * Smaller than this and the clump reads as a terrace; much larger and the
 * neighbours are not neighbours.
 */
export const LOT_SPACING = 8;

/**
 * How far off its own slot a home may sit and still count as occupying it, in
 * world units.
 *
 * Published positions cross the wire as 32-bit floats (`HomeSchema`), so a
 * neighbour's home arrives a few millionths off the lot it was given. Half a
 * unit absorbs that with enormous margin, and it is still far too small to
 * squeeze two real neighbours closer than 7.5 — more than the 5.4 two grown
 * houses need. It also keeps the honest case working: a home that *moved* off
 * the grid blocks whatever slot is genuinely near it.
 */
export const LOT_POSITION_SLACK = 0.5;

/** Slots per ring step. Six, so a ring's own lots are one whole step apart and
 *  a ring can never crowd itself; the step does all the spacing. */
export const LOT_RING_SLOTS = 6;

/**
 * The furthest ring a clump will spiral out to.
 *
 * A guard, not a policy: 16 rings is 817 lots and 128 units of radius, past
 * anything one page (50 units — world/types.ts) should ever hold. Its real
 * meaning is the design answer in land-and-dwellings.md: when a neighbourhood
 * is full, `nextLot` says so and the next neighbourhood opens adjacent rather
 * than densifying.
 */
export const LOT_MAX_RING = 16;

const TAU = Math.PI * 2;

export type LotPoint = { x: number; z: number };

export type Lot = LotPoint & {
  /** The turn the house wears there. Every home in the game already turns its
   *  door to its own place, so this is `homeFacing()` and not a second idea. */
  facing: number;
  /** 0 is the origin; 1, 2, … are the rings around it. */
  ring: number;
  /** Its place in the queue: lots are handed out in index order, so this is
   *  also "how many neighbours were here before you". */
  index: number;
};

/**
 * A stable 32-bit number for a piece of text (FNV-1a).
 *
 * Written out rather than imported because everything derived from it — a
 * page's turn, a home's number on its address plate — must come out the same
 * in every engine and on every machine, and `Math.imul` is the one piece of
 * JavaScript number handling that is defined to be exact. This names things;
 * it is not a security decision, so collisions are fine and expected.
 */
export function stableHash(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** How many slots a ring holds: one at the origin, six per step outward. */
export function ringSlotCount(ring: number): number {
  return ring <= 0 ? 1 : LOT_RING_SLOTS * ring;
}

/** How many lots come before this slot in the sweep. */
export function slotIndex(ring: number, slot: number): number {
  let index = slot;
  for (let inner = 0; inner < ring; inner += 1) index += ringSlotCount(inner);
  return index;
}

/** How many homes the clump holds before `nextLot` reports it full. */
export const LOT_CAPACITY = (() => {
  let total = 0;
  for (let ring = 0; ring <= LOT_MAX_RING; ring += 1) total += ringSlotCount(ring);
  return total;
})();

/**
 * Thousandths of a unit. `Math.cos`/`Math.sin` are allowed to differ in the
 * last bit between engines, so a lot position is quantised far coarser than
 * that difference: the answer is then a number two machines can compare with
 * `===` rather than a number a test has to be lenient about.
 */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Each page's clump gets its own turn, so two neighbourhoods do not come out
 * spoke-for-spoke identical. It is a *turn*, never a shift: every lot stays the
 * same distance from the origin and from every other lot, and the pass must use
 * the canonical page id (`pageId(px, pz)` from world/types.ts) that every client
 * and the server already agree on. '' — an unknown page, solo play, a test —
 * simply means no turn.
 */
function pageTurn(page: string): number {
  if (!page) return 0;
  return ((stableHash(page) % 4096) / 4096) * TAU;
}

/**
 * The spot of one slot, relative to the origin.
 *
 * Odd rings start on the page's turn and even rings half a slot later, so rings
 * do not line up spoke-for-spoke from the middle of the clump. The first lot is
 * the origin *untouched* — a solo player's home has to stay exactly where it
 * has always been, down to the last decimal.
 */
export function lotInRing(ring: number, slot: number, origin: LotPoint, page = ''): Lot {
  const step = Math.max(0, Math.floor(ring));
  if (step === 0) return { x: origin.x, z: origin.z, facing: homeFacing(), ring: 0, index: 0 };

  const count = ringSlotCount(step);
  const turn = pageTurn(page) + (step % 2 === 0 ? Math.PI / count : 0);
  const at = ((slot % count) + count) % count;
  const angle = turn + (TAU * at) / count;
  const radius = step * LOT_SPACING;

  return {
    x: round3(origin.x + Math.cos(angle) * radius),
    z: round3(origin.z + Math.sin(angle) * radius),
    facing: homeFacing(),
    ring: step,
    index: slotIndex(step, at),
  };
}

/**
 * Whether a lot may be handed out here: nothing already taken within
 * `LOT_SPACING` of it. Points that are not numbers are ignored rather than
 * counted, so one bad record off the wire cannot wall off the whole page.
 */
export function isLotFree(
  candidate: LotPoint,
  anchors: readonly LotPoint[],
  spacing = LOT_SPACING,
): boolean {
  const room = spacing - LOT_POSITION_SLACK;
  for (const anchor of anchors) {
    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.z)) continue;
    if (Math.hypot(candidate.x - anchor.x, candidate.z - anchor.z) < room) return false;
  }
  return true;
}

/**
 * The next lot for this page: nearest free slot to the origin, sweeping the
 * origin first and then the rings outward, so the clump stays as tight as the
 * spacing allows and a full inner ring spills over rather than in.
 *
 * Pure: the answer is a function of `anchors`, `origin` and `page` alone, and
 * nothing here is stored or remembered between calls. Two clients and the
 * server given the same taken ground therefore name the same lot without
 * anybody syncing an index.
 *
 * `null` means the clump is full — land-and-dwellings.md's answer, not an
 * error: the next neighbourhood opens adjacent.
 */
export function nextLot(
  anchors: readonly LotPoint[],
  origin: LotPoint,
  page: string,
  maxRing = LOT_MAX_RING,
): Lot | null {
  for (let ring = 0; ring <= maxRing; ring += 1) {
    const count = ringSlotCount(ring);
    for (let slot = 0; slot < count; slot += 1) {
      const candidate = lotInRing(ring, slot, origin, page);
      if (isLotFree(candidate, anchors)) return candidate;
    }
  }
  return null;
}

// ---- Who keeps the slot when two homes claim the same one -------------------

/**
 * A piece of taken ground that belongs to a known account: a neighbour's
 * published Home place, tagged with whose it is.
 *
 * The tag is the whole point. Two players who signed up before the clump
 * existed both have their Home on the fixed spawn, so the only way to settle
 * who moves — without a server round trip — is to compare something both
 * clients already hold: the account ids. The smaller id keeps the slot; the
 * larger yields.
 */
export type HomeAnchor = LotPoint & { accountId: string };

export type ResolveHomeLotInput = {
  /** The account doing the resolving (the "me" in the rule). */
  selfAccountId: string;
  /** This account's Home place today, or null when it has never been placed. */
  selfLot: LotPoint | null;
  /** Ground already taken on this page, each point tagged with its account. */
  anchors: readonly HomeAnchor[];
  /** The page's spawn point: the first lot, and the centre the clump grows from. */
  origin: LotPoint;
  /** The canonical page id; '' for solo/unknown, which simply means no turn. */
  page: string;
};

/**
 * The answer to "our homes are both standing on the same lot": one of us
 * moves. Returned instead of a lot when this home already sits somewhere good,
 * so the caller leaves its saved place exactly where it is.
 */
export const KEEP_HOME_LOT = 'keep' as const;

/**
 * Which lot this account's home should claim, given the ground already taken.
 *
 * Deterministic and self-healing: a pure function of the synced home list plus
 * this account's own Home place, so two clients, a fresh joiner and a reload
 * all reach the same answer with no extra state and no round trip. The rules,
 * in order:
 *
 *   1. Never placed: take `nextLot` — the nearest free slot. (A solo player's
 *      empty clump resolves to the origin itself, untouched.)
 *   2. Standing on a slot another account's home also claims, and that
 *      account's id sorts BEFORE ours: we are the newcomer, so we take
 *      `nextLot` and leave them the slot. Both sides read the same two ids off
 *      the same synced list, so both agree who yields.
 *   3. Otherwise keep: our slot is free, or the only other claimant sorts after
 *      us and will yield on its own re-check. (Re-checking whenever the
 *      neighbour list changes — sharedSession's subscription — is what makes
 *      the clump settle.)
 *
 * `null` means the clump is full: there is nothing free to move to, so the
 * caller keeps whatever it already has (land-and-dwellings.md: the next
 * neighbourhood opens adjacent).
 */
export function resolveHomeLot(input: ResolveHomeLotInput): Lot | null | typeof KEEP_HOME_LOT {
  const { selfAccountId, selfLot, anchors, origin, page } = input;
  // A published anchor for our own account would be us; the rule is about the
  // ground OTHERS take.
  const others = anchors.filter((anchor) => anchor.accountId !== selfAccountId);

  if (!selfLot) return nextLot(others, origin, page);

  // Do any of our neighbours' homes sit on our slot, and does the nearest
  // relevant one sort before us? `isLotFree` is the same predicate `nextLot`
  // uses, so "occupied" means exactly "a slot nextLot would refuse to hand out".
  const yielded = others.some(
    (anchor) => anchor.accountId < selfAccountId && !isLotFree(selfLot, [anchor]),
  );
  return yielded ? nextLot(others, origin, page) : KEEP_HOME_LOT;
}
