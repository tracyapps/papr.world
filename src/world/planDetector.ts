import type { RecipeId } from '../sim/catalogs/recipes';
import { planSiteFor } from './planSites';

/**
 * The plan detector: hot and cold, and nothing else.
 *
 * **It deliberately does not point.** A direction would turn finding a plan
 * into following an arrow, and the walk is the feature — the detector's job is
 * to convert "somewhere in the world" into "somewhere around here" and then
 * get out of the way.
 *
 * That restraint has to be enforced here rather than left to the UI, because
 * anything this module returns can be rendered. So it returns a **band**, not
 * a distance and not a bearing. A caller cannot draw an arrow from a band, and
 * cannot triangulate from a value that only changes every few dozen steps.
 *
 * One detector is tuned to one plan. Hunting a different plan means making a
 * different detector — see `docs/plans-and-blueprints.md`.
 */

export type DetectorBand = 'cold' | 'cool' | 'warm' | 'hot' | 'burning' | 'here';

export type DetectorReading = {
  band: DetectorBand;
  /** Copy for the HUD. Warm and vague on purpose. */
  message: string;
  /** True only inside pickup range, so the UI can stop nagging. */
  atSite: boolean;
};

/**
 * Band edges in world units.
 *
 * Coarse, and widely spaced: a player standing still and stepping sideways
 * should not see the reading flicker, because a flickering reading is a
 * compass. `PAGE_SIZE` is 50, so `warm` is roughly "this page and its
 * neighbours" and `cool` is a few pages out.
 */
const BAND_EDGES: Array<{ band: DetectorBand; within: number; message: string }> = [
  { band: 'here', within: 6, message: 'Right here. It is practically under your feet.' },
  { band: 'burning', within: 22, message: 'Burning. Look around — this is the spot.' },
  { band: 'hot', within: 60, message: 'Hot. Somewhere very close by.' },
  { band: 'warm', within: 150, message: 'Warm. You are in the right part of the world.' },
  { band: 'cool', within: 380, message: 'Cool. Something is out this way, but not near.' },
];

const COLD: Omit<DetectorReading, 'atSite'> = {
  band: 'cold',
  message: 'Cold. Whatever this is tuned to, it is a long way off.',
};

/** Inside this range the plan can be picked up. */
export const PLAN_PICKUP_RANGE = 6;

/**
 * What a detector tuned to `recipeId` reads at a position.
 *
 * Pure, cheap, and safe to poll — but the caller should poll it on a timer or
 * on movement rather than per frame. Nothing here is expensive, and that is
 * exactly the sort of assumption that has cost this project a frame budget
 * before.
 */
export function detectorReadingAt(recipeId: RecipeId, x: number, z: number): DetectorReading {
  const site = planSiteFor(recipeId);
  const distance = Math.hypot(site.x - x, site.z - z);
  const atSite = distance <= PLAN_PICKUP_RANGE;

  for (const edge of BAND_EDGES) {
    if (distance <= edge.within) return { band: edge.band, message: edge.message, atSite };
  }
  return { ...COLD, atSite };
}

/** Ordered coldest to warmest, for a UI that wants to render a scale. */
export const DETECTOR_BANDS: DetectorBand[] = ['cold', 'cool', 'warm', 'hot', 'burning', 'here'];

/** 0..1 for a dial or a colour ramp. Derived from the band, never the distance. */
export function bandIntensity(band: DetectorBand): number {
  const index = DETECTOR_BANDS.indexOf(band);
  return index < 0 ? 0 : index / (DETECTOR_BANDS.length - 1);
}
