// The inside of the player's home: one room to begin with, bigger than the
// tent looks from outside ("it is made of paper"). Renderer-free; the drawing
// is in game/interiorScene.ts. Design: docs/scenes-and-interiors.md.
//
// The interior lives in its own coordinate space, parked far from anything
// the surface can generate (`INTERIOR_ORIGIN`). Nothing on the surface can
// collide with it, and no surface page is streamed near it, because the
// surface is not simulated while you are inside.

import { dwellingStage, type DwellingPartId } from '../sim/catalogs/dwellings';

/** World coordinates of the middle of the interior. About 800 pages from the clearing. */
export const INTERIOR_ORIGIN = { x: 40000, z: 40000 } as const;

const BASE_HALF_WIDTH = 3.2;
const BASE_HALF_DEPTH = 2.6;
/** Each annex room opens the house out sideways by this much (each side). */
const ROOM_HALF_WIDTH = 1.2;
/** The door is in the wall at local z = +halfDepth. */
const EXIT_INSET = 0.45;
const ENTRY_INSET = 1.3;
export const INTERIOR_EXIT_REACH = 1.5;
export const INTERIOR_WALL_HEIGHT = 1.0;
/** The doorway in the front wall. */
export const INTERIOR_DOOR_WIDTH = 1.2;

export type InteriorLayout = {
  halfWidth: number;
  halfDepth: number;
  /** Where you appear when you come in (world coordinates). */
  entry: { x: number; z: number };
  /** The spot just inside the door where leaving is offered. */
  exit: { x: number; z: number };
};

export function homeInteriorLayout(parts: readonly DwellingPartId[]): InteriorLayout {
  const rooms = (parts.includes('room-1') ? 1 : 0) + (parts.includes('room-2') ? 1 : 0);
  const halfWidth = BASE_HALF_WIDTH + rooms * ROOM_HALF_WIDTH;
  const halfDepth = BASE_HALF_DEPTH;
  return {
    halfWidth,
    halfDepth,
    entry: { x: INTERIOR_ORIGIN.x, z: INTERIOR_ORIGIN.z + halfDepth - ENTRY_INSET },
    exit: { x: INTERIOR_ORIGIN.x, z: INTERIOR_ORIGIN.z + halfDepth - EXIT_INSET },
  };
}

/** Is a walker of this radius standing in a wall (that is, outside the room)? */
export function interiorBlocked(layout: InteriorLayout, x: number, z: number, radius: number): boolean {
  const dx = Math.abs(x - INTERIOR_ORIGIN.x);
  const dz = Math.abs(z - INTERIOR_ORIGIN.z);
  return dx > layout.halfWidth - radius || dz > layout.halfDepth - radius;
}

export function nearInteriorExit(layout: InteriorLayout, x: number, z: number): boolean {
  return Math.hypot(x - layout.exit.x, z - layout.exit.z) < INTERIOR_EXIT_REACH;
}

/** True for a point that could only be inside the interior's own space. */
export function isInInteriorSpace(x: number, z: number): boolean {
  return Math.abs(x - INTERIOR_ORIGIN.x) < 100 && Math.abs(z - INTERIOR_ORIGIN.z) < 100;
}

/** What the place is called, for announcements and the Leave button. */
export function interiorName(parts: readonly DwellingPartId[]): 'tent' | 'house' {
  return dwellingStage(parts) === 'tent' ? 'tent' : 'house';
}

/** Said aloud on arrival: where you are, and the way out. */
export function describeArrival(parts: readonly DwellingPartId[]): string {
  return `Inside your ${interiorName(parts)}. Exit: the door, just in front of you.`;
}
