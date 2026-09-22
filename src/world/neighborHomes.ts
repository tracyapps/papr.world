// The homes of other players, as this player knows them. Renderer-free, like
// homeSite.ts: the drawing is in net/sharedHomeVisuals.ts, and the walking,
// the prompt and the tests all read this one list.
//
// A neighbor's home stands exactly where ours would for the same Home place
// (`homePosition`), turned toward it (`homeFacing`), so a visitor arriving at
// the doorstep meets the same door everyone else does.

import { isDwellingPartId, type DwellingPartId } from '../sim/catalogs/dwellings';
import { isMailboxStyleId } from '../sim/catalogs/mailboxes';
import {
  DEFAULT_MAILBOX_PRIMARY,
  DEFAULT_MAILBOX_SECONDARY,
  DEFAULT_MAILBOX_STYLE,
  sanitizeMailboxColor,
} from '../../shared/src/index';
import { HOME_BODY_RADIUS, HOME_REACH, homeDoorstep, homePosition, homeSolids, type HomeSolid } from './homeSite';
import { stableHash } from './neighborhood';

export type NeighborHome = {
  accountId: string;
  /** Their name when they last published it. */
  name: string;
  /** The Home place they published; the house stands beside it. */
  place: { x: number; z: number };
  /**
   * The page that Home place is on. Kept because a neighbourhood is per page:
   * the lot layout (world/neighborhood.ts) may only take the homes standing on
   * the page it is laying out, or a clump would be dodging people it will never
   * see. '' when an older marker did not carry one.
   */
  page: string;
  parts: DwellingPartId[];
  /** The part going up right now (drawn as scaffolding), if any. */
  building: DwellingPartId | null;
  /** Open house: the sign is out and anyone may walk in. */
  open: boolean;
  /** Mailbox rig id; falls back to the default rig when unset or unknown. */
  mailboxStyle: string;
  mailboxPrimary: string;
  mailboxSecondary: string;
};

/** The shape a published marker arrives in (`HomeMarker`), read loosely so bad data cannot get in. */
export type NeighborHomeInput = {
  accountId: string;
  name: string;
  x: number;
  z: number;
  page?: string;
  parts?: readonly string[];
  building?: string;
  open?: boolean;
  mailboxStyle?: string;
  mailboxPrimary?: string;
  mailboxSecondary?: string;
};

const homes = new Map<string, NeighborHome>();
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

/** Keeps only what this game version knows how to draw. */
export function neighborHomeFrom(input: NeighborHomeInput): NeighborHome | null {
  if (!input.accountId || !Number.isFinite(input.x) || !Number.isFinite(input.z)) return null;
  const parts = (input.parts ?? []).filter(isDwellingPartId);
  return {
    accountId: input.accountId,
    name: input.name || 'A neighbor',
    place: { x: input.x, z: input.z },
    page: typeof input.page === 'string' ? input.page : '',
    parts: [...new Set(parts)],
    building: isDwellingPartId(input.building) ? input.building : null,
    open: input.open === true,
    mailboxStyle: isMailboxStyleId(input.mailboxStyle) ? input.mailboxStyle : DEFAULT_MAILBOX_STYLE,
    mailboxPrimary: sanitizeMailboxColor(input.mailboxPrimary, DEFAULT_MAILBOX_PRIMARY),
    mailboxSecondary: sanitizeMailboxColor(input.mailboxSecondary, DEFAULT_MAILBOX_SECONDARY),
  };
}

export function setNeighborHome(input: NeighborHomeInput): NeighborHome | null {
  const home = neighborHomeFrom(input);
  if (!home) return null;
  homes.set(home.accountId, home);
  changed();
  return home;
}

export function removeNeighborHome(accountId: string): void {
  if (homes.delete(accountId)) changed();
}

export function clearNeighborHomes(): void {
  if (homes.size === 0) return;
  homes.clear();
  changed();
}

export function getNeighborHome(accountId: string): NeighborHome | null {
  return homes.get(accountId) ?? null;
}

export function allNeighborHomes(): NeighborHome[] {
  return [...homes.values()];
}

export function subscribeNeighborHomes(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The circles a walker cannot enter, for one neighbor's home. */
export function neighborHomeSolids(home: NeighborHome): HomeSolid[] {
  return homeSolids(home.place, {
    first: home.parts.includes('room-1'),
    second: home.parts.includes('room-2'),
  }).map((solid) => ({ ...solid, id: `neighbor:${home.accountId}:${solid.id}` }));
}

/** Where a neighbor's front step is, on the surface. */
export function neighborDoorstep(home: NeighborHome): { x: number; z: number } {
  return homeDoorstep(home.place);
}

/** Distance from a point to the outside of a neighbor's house. Zero at the wall. */
export function distanceToNeighborEdge(home: NeighborHome, position: { x: number; z: number }): number {
  const spot = homePosition(home.place);
  return Math.max(0, Math.hypot(position.x - spot.x, position.z - spot.z) - HOME_BODY_RADIUS);
}

/**
 * The neighbor's home you are standing at, if any: the nearest within reach.
 * Ties go to whoever is listed first, which is stable while nobody moves.
 */
export function nearestNeighborHome(
  position: { x: number; z: number },
  reach = HOME_REACH,
): NeighborHome | null {
  let best: NeighborHome | null = null;
  let bestDistance = Infinity;
  for (const home of homes.values()) {
    const spot = homePosition(home.place);
    const distance = Math.hypot(position.x - spot.x, position.z - spot.z);
    if (distance < reach && distance < bestDistance) {
      best = home;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * What a home's sign says, in its two lines (the drawing and the words
 * agree). "Building a home" was dropped for anyone with a published
 * marker: reaching this function at all means the owner has logged in at
 * least once, so a home mid-construction gets the small "excuse our dust"
 * hanging sign instead (see `buildHouse` in game/dwellingExterior.ts) — a
 * signed-up account that never joins publishes no marker and has no sign
 * at all, which already reads as "not started."
 */
export function signWords(home: NeighborHome): { heading: string; line: string } {
  if (home.open) return { heading: 'OPEN HOUSE', line: 'come on in' };
  return { heading: 'HOME', line: '' };
}

// ---- The address plate ------------------------------------------------------

/** How many numbers the street runs to. Two digits fit a small plate, and a
 *  collision only ever means two homes share a number nobody has to file by. */
const ADDRESS_NUMBERS = 99;

/**
 * The plate beside a home's door: who lives there, and the number a passer-by
 * can point at. `accountId` travels with it so a click on the plate can open
 * that player's card (`ui/playerCard.ts` `openPlayerCardFor`), which is a
 * different thing from the door panel the house itself opens.
 */
export type HomeAddress = {
  accountId: string;
  name: string;
  /** 1 to 99, derived from the account id. */
  number: number;
  /** The plate in one line of words, e.g. `No. 12 · Wren`. */
  text: string;
};

/**
 * A home's address plate. The number is derived from the account id rather
 * than assigned, so every client draws the same one with nothing stored,
 * nothing synced and no lot record to look up, and it survives a rename: the
 * house keeps its number when its owner changes their name. Same trick as the
 * avatars and the lots — derived, never exchanged.
 */
export function homeAddress(home: { accountId: string; name: string }): HomeAddress {
  const name = home.name || 'A neighbor';
  const number = 1 + (stableHash(home.accountId) % ADDRESS_NUMBERS);
  return { accountId: home.accountId, name, number, text: `No. ${number} · ${name}` };
}
