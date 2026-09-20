// Which way is the jungle?
//
// Biomes are not placed by hand: every spot's biome comes from the same
// deterministic fields the world is generated from (fields.ts). So "where is
// the nearest desert" can be answered anywhere, for places nobody has walked
// yet, and it can never go stale — retune the world and these answers retune
// with it. That is what lets a rough direction-finder exist long before the
// real map is designed.
//
// Answers are page-grained (50 units): a page's biome is its centre's, the
// same rule generate.ts uses. Results are cached per page forever, since a
// page's biome never changes within a build.

import { BIOME_IDS, type Biome } from '../sim/catalogs/biomes';
import { getAuthoredPage } from './authored';
import { dominantBiomeAt } from './fields';
import { PAGE_SIZE } from './types';

/** How far to look, in pages (40 pages = 2,000 units, about 11 minutes' walk). */
export const SEARCH_RADIUS_PAGES = 40;

const pageBiomeCache = new Map<string, Biome>();

/** The biome of a page, without generating the page itself. */
export function pageBiome(px: number, pz: number): Biome {
  const key = `${px},${pz}`;
  let biome = pageBiomeCache.get(key);
  if (!biome) {
    biome = getAuthoredPage(px, pz)?.biome ?? dominantBiomeAt(px * PAGE_SIZE, pz * PAGE_SIZE);
    pageBiomeCache.set(key, biome);
  }
  return biome;
}

/** Page offsets within the search radius, nearest first (built once). */
let offsets: Array<{ dx: number; dz: number; distance: number }> | null = null;
function sortedOffsets() {
  if (!offsets) {
    offsets = [];
    for (let dz = -SEARCH_RADIUS_PAGES; dz <= SEARCH_RADIUS_PAGES; dz += 1) {
      for (let dx = -SEARCH_RADIUS_PAGES; dx <= SEARCH_RADIUS_PAGES; dx += 1) {
        const distance = Math.hypot(dx, dz);
        if (distance <= SEARCH_RADIUS_PAGES) offsets.push({ dx, dz, distance });
      }
    }
    offsets.sort((a, b) => a.distance - b.distance);
  }
  return offsets;
}

export type BiomeDirection = {
  biome: Biome;
  /** Centre of the nearest page of that biome. */
  x: number;
  z: number;
  /** World units from the asking point. */
  distance: number;
  /** Compass bearing, degrees: 0 = north (-z), 90 = east (+x). */
  bearing: number;
};

/** Compass bearing from one point to another. North is -z, east is +x. */
export function bearingBetween(fromX: number, fromZ: number, toX: number, toZ: number): number {
  const degrees = (Math.atan2(toX - fromX, -(toZ - fromZ)) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

/**
 * Is this page the middle of a real stretch of its land, not a lone fleck?
 * Biomes blend at their edges, so a single page of jungle can turn up in a
 * meadow; pointing someone at it would send them to one odd page. Five of
 * the nine pages around it (itself included) must agree.
 */
export function isSubstantial(
  px: number,
  pz: number,
  biome: Biome,
  biomeAt: (px: number, pz: number) => Biome,
): boolean {
  let same = 0;
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (biomeAt(px + dx, pz + dz) === biome) same += 1;
    }
  }
  return same >= 5;
}

/**
 * The nearest real stretch of every biome (except the home clearing, which
 * is never generated), nearest first. Falls back to the nearest fleck when a
 * land only exists in flecks within reach. Biomes further than the search
 * radius are simply absent.
 */
export function nearestBiomes(
  x: number,
  z: number,
  biomeAt: (px: number, pz: number) => Biome = pageBiome,
): BiomeDirection[] {
  const originX = Math.round(x / PAGE_SIZE);
  const originZ = Math.round(z / PAGE_SIZE);
  const wanted = new Set<Biome>(BIOME_IDS.filter((biome) => biome !== 'clearing'));
  const found: BiomeDirection[] = [];
  const flecks = new Map<Biome, { dx: number; dz: number }>();
  const record = (biome: Biome, dx: number, dz: number) => {
    const targetX = (originX + dx) * PAGE_SIZE;
    const targetZ = (originZ + dz) * PAGE_SIZE;
    found.push({
      biome,
      x: targetX,
      z: targetZ,
      distance: Math.hypot(targetX - x, targetZ - z),
      bearing: bearingBetween(x, z, targetX, targetZ),
    });
  };
  for (const { dx, dz } of sortedOffsets()) {
    const biome = biomeAt(originX + dx, originZ + dz);
    if (!wanted.has(biome)) continue;
    if (!flecks.has(biome)) flecks.set(biome, { dx, dz });
    if (!isSubstantial(originX + dx, originZ + dz, biome, biomeAt)) continue;
    wanted.delete(biome);
    record(biome, dx, dz);
    if (wanted.size === 0) break;
  }
  for (const biome of wanted) {
    const fleck = flecks.get(biome);
    if (fleck) record(biome, fleck.dx, fleck.dz);
  }
  return found.sort((a, b) => a.distance - b.distance);
}

const POINTS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

export function compassPoint(bearing: number): string {
  return POINTS[Math.round(bearing / 45) % 8]!;
}

export function compassArrow(bearing: number): string {
  return ARROWS[Math.round(bearing / 45) % 8]!;
}

/**
 * Distance in walking words, not units. Deliberately vague — this is a
 * treasure map's "a fair way" rather than a satnav.
 */
export function distanceWords(distance: number): string {
  if (distance < 60) return 'right around here';
  if (distance < 200) return 'close by';
  if (distance < 500) return 'a short walk';
  if (distance < 1000) return 'a good walk';
  return 'a long way';
}

/** Player-facing biome names — the ones critters and banners use. */
export const BIOME_MAP_NAMES: Record<Biome, string> = {
  clearing: 'home clearing',
  forest: 'forest',
  meadow: 'meadow',
  dunes: 'desert',
  scrapflats: 'scrap flats',
  tropical: 'jungle',
  swamp: 'swamp',
  wetland: 'wetlands',
  'rocky-highlands': 'rocky highlands',
  savanna: 'savanna',
  badlands: 'badlands',
  'bamboo-forest': 'bamboo forest',
};
