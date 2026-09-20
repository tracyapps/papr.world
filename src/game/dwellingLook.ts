// What the home looks like, and how it is said in words. Renderer-free so it
// can be tested (the three.js drawing is in dwellingExterior.ts).
//
// The exterior is drawn from the list of finished parts, plus whichever
// project is mid-build (which wears scaffolding). Everyone starts as a tent,
// so a half-upgraded house is always a coherent picture.

import { DWELLING_PART_DEFS, DWELLING_PART_IDS, dwellingStage, type DwellingPartId } from '../sim/catalogs/dwellings';
import type { DwellingState } from '../sim/state';
import { HOME_OFFSET, HOME_REACH, homePosition, isNearHome } from '../world/homeSite';

export type ExteriorPlan = {
  /** Tent cloth is up: until a roof replaces it. */
  tent: boolean;
  /** Bare ground sheet under the tent, until a floor is laid. */
  groundSheet: boolean;
  floor: boolean;
  walls: boolean;
  roof: boolean;
  upper: boolean;
  /** How many extra rooms stand (0 to 2). */
  rooms: number;
  /** The part being built right now, drawn with scaffolding. */
  scaffolding: DwellingPartId | null;
};

export function exteriorPlan(dwelling: DwellingState): ExteriorPlan {
  const building = DWELLING_PART_IDS.find((id) => dwelling.projects[id]?.startedAt != null) ?? null;
  return exteriorPlanFromParts(dwelling.parts, building);
}

/** What a home tells its neighbors: the finished parts, and the part going up right now. */
export function publishedLook(dwelling: DwellingState): { parts: DwellingPartId[]; building: DwellingPartId | '' } {
  return {
    parts: [...dwelling.parts],
    building: DWELLING_PART_IDS.find((id) => dwelling.projects[id]?.startedAt != null) ?? '',
  };
}

/**
 * The same picture from just the finished parts and the part being built, which
 * is all a neighbor's home publishes (`HomeMarker.parts` / `building`).
 */
export function exteriorPlanFromParts(
  parts: readonly DwellingPartId[],
  building: DwellingPartId | null,
): ExteriorPlan {
  const has = (id: DwellingPartId) => parts.includes(id);
  return {
    tent: !has('roof'),
    groundSheet: !has('floor'),
    floor: has('floor'),
    walls: has('walls'),
    roof: has('roof'),
    upper: has('upstairs'),
    rooms: (has('room-1') ? 1 : 0) + (has('room-2') ? 1 : 0),
    scaffolding: building,
  };
}

/** A stable string that changes exactly when the picture would. */
export function exteriorSignature(plan: ExteriorPlan): string {
  return [
    plan.tent, plan.groundSheet, plan.floor, plan.walls, plan.roof, plan.upper, plan.rooms, plan.scaffolding ?? '-',
  ].join('|');
}

/** The home in one sentence, for the panel, the nearby list and screen readers. */
export function describeHome(dwelling: DwellingState): string {
  return describeHomeParts(
    dwelling.parts,
    DWELLING_PART_IDS.find((id) => dwelling.projects[id]?.startedAt != null) ?? null,
  );
}

/** The same sentence for a home known only by its parts (a neighbor's). */
export function describeHomeParts(parts: readonly DwellingPartId[], building: DwellingPartId | null): string {
  const plan = exteriorPlanFromParts(parts, building);
  const stage = dwellingStage(parts);
  const pieces: string[] = [];
  if (plan.floor) pieces.push('a floor');
  if (plan.walls) pieces.push('walls');
  if (plan.roof) pieces.push('a roof');
  if (plan.upper) pieces.push('an upper floor');
  if (plan.rooms > 0) pieces.push(plan.rooms === 1 ? 'an extra room' : `${plan.rooms} extra rooms`);
  const base = stage === 'tent'
    ? 'A tent under construction, with room to grow'
    : stage === 'shell'
      ? 'A tent home, part-built'
      : stage === 'cottage'
        ? 'A cottage'
        : 'A two-storey house';
  const with_ = pieces.length ? `, with ${pieces.join(', ')}` : '';
  const scaffold = plan.scaffolding
    ? `. Scaffolding is up for the ${DWELLING_PART_DEFS[plan.scaffolding].label.toLowerCase()}.`
    : '.';
  return `${base}${with_}${scaffold}`;
}

// Where the home stands lives in world/homeSite.ts (the footprint query needs
// it too); re-exported so callers of the look module keep one import.
export { HOME_OFFSET, HOME_REACH, homePosition, isNearHome };
