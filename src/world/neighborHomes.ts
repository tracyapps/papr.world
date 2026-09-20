// The homes of other players, as this player knows them. Renderer-free, like
// homeSite.ts: the drawing is in net/sharedHomeVisuals.ts, and the walking,
// the prompt and the tests all read this one list.
//
// A neighbor's home stands exactly where ours would for the same Home place
// (`homePosition`), turned toward it (`homeFacing`), so a visitor arriving at
// the doorstep meets the same door everyone else does.

import { isDwellingPartId, type DwellingPartId } from '../sim/catalogs/dwellings';
import { HOME_BODY_RADIUS, HOME_REACH, homeDoorstep, homePosition, homeSolids, type HomeSolid } from './homeSite';

export type NeighborHome = {
  accountId: string;
  /** Their name when they last published it. */
  name: string;
  /** The Home place they published; the house stands beside it. */
  place: { x: number; z: number };
  parts: DwellingPartId[];
  /** The part going up right now (drawn as scaffolding), if any. */
  building: DwellingPartId | null;
  /** Open house: the sign is out and anyone may walk in. */
  open: boolean;
};

/** The shape a published marker arrives in (`HomeMarker`), read loosely so bad data cannot get in. */
export type NeighborHomeInput = {
  accountId: string;
  name: string;
  x: number;
  z: number;
  parts?: readonly string[];
  building?: string;
  open?: boolean;
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
    parts: [...new Set(parts)],
    building: isDwellingPartId(input.building) ? input.building : null,
    open: input.open === true,
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

/** What a home's sign says, in its two lines (the drawing and the words agree). */
export function signWords(home: NeighborHome): { heading: string; line: string } {
  if (home.open) return { heading: 'OPEN HOUSE', line: 'come on in' };
  if (home.parts.length === 0) return { heading: 'BUILDING A HOME', line: 'a new neighbor, papering in' };
  return { heading: 'HOME', line: '' };
}
