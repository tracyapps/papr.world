// Where the home stands and how much ground it takes up. Renderer-free, so the
// footprint query (footprints.ts), the drawing (game/dwellingExterior.ts) and
// the tests all read one answer.
//
// The home stands a little way from the saved Home place with its door turned
// toward it, so the spot you spawn on (and the guide arrives at) is the
// doorstep, not the middle of the tent.

import { pageId, pageOfPosition } from './types';

/** Where the home stands, relative to the saved Home place. Clear of the Thing Maker. */
export const HOME_OFFSET = { x: -2.1, z: 1.2 } as const;

/** Used only before the saved places have loaded. */
export const HOME_FALLBACK_PLACE = { x: -1.5, z: -2.2 } as const;

/** How much ground the tent (or house) claims, and how big an annex room is. */
export const HOME_BODY_RADIUS = 1.25;
export const HOME_ANNEX_RADIUS = 0.95;
/** Annex rooms stand this far to either side of the house's middle. */
export const HOME_ANNEX_REACH = 1.75;

/** How near counts as "at the door" for the E key, the prompt and stepping inside. */
export const HOME_REACH = 4.5;

export function homePosition(place: { x: number; z: number }): { x: number; z: number } {
  return { x: place.x + HOME_OFFSET.x, z: place.z + HOME_OFFSET.z };
}

/**
 * The Home place a lot is built around. A lot is exactly where the Home
 * bookmark sits, so this is the one seam between "where the neighbourhood put
 * you" (world/neighborhood.ts) and the `place` that `homePosition`,
 * `homeFacing`, `homeDoorstep` and `homeSolids` all take. If lots ever stop
 * coinciding with places, this is the single line that changes.
 */
export function homePlaceForLot(lot: { x: number; z: number }): { x: number; z: number } {
  return { x: lot.x, z: lot.z };
}

/** A home marker is indexed by the page containing the home, not whatever
 * page its owner is currently exploring when they publish it. */
export function homeMarkerPage(x: number, z: number): string {
  const page = pageOfPosition(x, z);
  return pageId(page.px, page.pz);
}

export function isNearHome(
  position: { x: number; z: number },
  place: { x: number; z: number },
  reach = HOME_REACH,
): boolean {
  const home = homePosition(place);
  return Math.hypot(position.x - home.x, position.z - home.z) < reach;
}

/**
 * The turn (three.js `rotation.y`) that points the door at the Home place.
 * The door is the model's +z side, which a turn of `t` sends to (sin t, cos t).
 */
export function homeFacing(): number {
  return Math.atan2(-HOME_OFFSET.x, -HOME_OFFSET.z);
}

/** How far in front of the house's middle the doorstep is (clear of the body's ground). */
export const HOME_DOORSTEP_DISTANCE = 1.9;

/** The spot outside the door: where leaving the house puts you. */
export function homeDoorstep(place: { x: number; z: number }): { x: number; z: number } {
  const spot = homePosition(place);
  const turn = homeFacing();
  return {
    x: spot.x + Math.sin(turn) * HOME_DOORSTEP_DISTANCE,
    z: spot.z + Math.cos(turn) * HOME_DOORSTEP_DISTANCE,
  };
}

export type HomeSolid = { id: string; x: number; z: number; radius: number };

/**
 * The circles a walker cannot enter: the body of the house, plus one per
 * annex room that stands. Circles, not rotated boxes, so nothing here depends
 * on which way the house happens to face.
 */
export function homeSolids(
  place: { x: number; z: number },
  rooms: { first: boolean; second: boolean },
): HomeSolid[] {
  const spot = homePosition(place);
  const turn = homeFacing();
  const solids: HomeSolid[] = [{ id: 'home-body', x: spot.x, z: spot.z, radius: HOME_BODY_RADIUS }];
  // A local step along +x lands on (cos t, -sin t) in the world.
  const annex = (id: string, side: 1 | -1) => {
    const along = side * HOME_ANNEX_REACH;
    solids.push({
      id,
      x: spot.x + along * Math.cos(turn),
      z: spot.z - along * Math.sin(turn),
      radius: HOME_ANNEX_RADIUS,
    });
  };
  if (rooms.first) annex('home-room-1', 1);
  if (rooms.second) annex('home-room-2', -1);
  return solids;
}
