// What the treasure map knows — separated from how it is drawn, so the rules
// ("inked where you have been, rumoured where you have not") are testable
// without a canvas.

import type { Biome } from '../sim/catalogs/biomes';
import {
  BIOME_MAP_NAMES,
  nearestBiomes,
  pageBiome,
  type BiomeDirection,
} from '../world/biomeCompass';
import { exploredFraction } from '../world/explored';
import { getRegionName } from '../world/regions';
import { PAGE_SIZE } from '../world/types';

/** A page this much seen counts as "been there" on the map. */
export const EXPLORED_THRESHOLD = 0.06;

export type MapScale = 'near' | 'far';
/** Pages from the centre to the edge, per scale. */
export const MAP_RADIUS_PAGES: Record<MapScale, number> = { near: 10, far: 28 };

export type MapCell = {
  px: number;
  pz: number;
  biome: Biome;
  explored: number;
  /**
   * What the map paints here. Walked pages: the truth. Unwalked pages: the
   * most common land around them — hearsay is vaguer than sight, and this
   * melts the world's page-sized speckle into the broad shapes a rumour
   * would give you.
   */
  shown: Biome;
};
export type MapPlaceKind = 'home' | 'mill' | 'shop' | 'place';
export type MapPlace = { id: string; name: string; x: number; z: number; kind: MapPlaceKind };
export type MapLabel = { text: string; x: number; z: number; weight: number };
/** One connected stretch of a single land within the map. */
export type MapLand = {
  biome: Biome;
  /** Where to write its name: the page nearest the stretch's middle. */
  x: number;
  z: number;
  pages: number;
  /** 0..1 — how much of it you have walked. */
  explored: number;
};

/** Stretches smaller than this are flecks, not worth a name. */
const MIN_LAND_PAGES: Record<MapScale, number> = { near: 4, far: 10 };

export type TreasureMapModel = {
  centerX: number;
  centerZ: number;
  originPx: number;
  originPz: number;
  radiusPages: number;
  cells: MapCell[];
  /** Nearest page of each biome you are not standing in. */
  rumours: BiomeDirection[];
  /** Names of regions you have actually walked, biggest first. */
  regions: MapLabel[];
  /** Sizeable stretches of each land in view, biggest first. */
  lands: MapLand[];
  places: MapPlace[];
  exploredPages: number;
};

type ModelDeps = {
  biomeAt?: (px: number, pz: number) => Biome;
  exploredAt?: (px: number, pz: number) => number;
  regionName?: (px: number, pz: number, biome: Biome) => string;
};

export function buildTreasureMapModel(
  centerX: number,
  centerZ: number,
  scale: MapScale,
  places: readonly { id: string; name: string; x: number; z: number; builtin: boolean }[],
  deps: ModelDeps = {},
): TreasureMapModel {
  const biomeAt = deps.biomeAt ?? pageBiome;
  const exploredAt = deps.exploredAt ?? exploredFraction;
  const regionName = deps.regionName ?? getRegionName;
  const radiusPages = MAP_RADIUS_PAGES[scale];
  const originPx = Math.round(centerX / PAGE_SIZE);
  const originPz = Math.round(centerZ / PAGE_SIZE);

  const cells: MapCell[] = [];
  const regions = new Map<string, { name: string; sx: number; sz: number; count: number }>();
  let exploredPages = 0;
  for (let pz = originPz - radiusPages; pz <= originPz + radiusPages; pz += 1) {
    for (let px = originPx - radiusPages; px <= originPx + radiusPages; px += 1) {
      const biome = biomeAt(px, pz);
      const explored = exploredAt(px, pz);
      cells.push({ px, pz, biome, explored, shown: biome });
      if (explored < EXPLORED_THRESHOLD) continue;
      exploredPages += 1;
      // Region names are shared by 2x2 pages of one biome (regions.ts).
      const key = `${Math.floor(px / 2)},${Math.floor(pz / 2)}:${biome}`;
      const region = regions.get(key) ?? { name: regionName(px, pz, biome), sx: 0, sz: 0, count: 0 };
      region.sx += px * PAGE_SIZE;
      region.sz += pz * PAGE_SIZE;
      region.count += 1;
      regions.set(key, region);
    }
  }

  const side = radiusPages * 2 + 1;
  const hearsay = smoothRumours(cells, side, scale === 'far' ? 2 : 1);
  cells.forEach((cell, index) => {
    if (cell.explored < EXPLORED_THRESHOLD) cell.shown = hearsay[index]!;
  });
  const lands = findLands(cells, side, MIN_LAND_PAGES[scale]);
  const here = biomeAt(originPx, originPz);
  const rumours = nearestBiomes(centerX, centerZ, biomeAt).filter((hint) => hint.biome !== here);

  // Only the nearest copy of each region name is worth writing down.
  const byName = new Map<string, MapLabel>();
  for (const region of regions.values()) {
    const label = {
      text: region.name,
      x: region.sx / region.count,
      z: region.sz / region.count,
      weight: region.count,
    };
    const existing = byName.get(region.name);
    if (!existing || label.weight > existing.weight) byName.set(region.name, label);
  }

  const mapPlaces: MapPlace[] = places
    // The three "region" signposts near home are names, not places; the map
    // already writes region names where you have walked.
    .filter((place) => !['ribbonbark-forest', 'cardboard-desert', 'offcut-flats'].includes(place.id))
    .map((place) => ({
      id: place.id,
      name: place.name,
      x: place.x,
      z: place.z,
      kind: place.id === 'home' ? 'home'
        : place.id === 'wood-mill' ? 'mill'
          : place.builtin ? 'shop' : 'place',
    }));

  return {
    centerX,
    centerZ,
    originPx,
    originPz,
    radiusPages,
    cells,
    rumours,
    regions: [...byName.values()].sort((a, b) => b.weight - a.weight),
    lands,
    places: mapPlaces,
    exploredPages,
  };
}

/**
 * Connected stretches of one land (4-neighbour flood fill over the grid),
 * so the map names "the jungle" once per stretch instead of once per page.
 */
function findLands(cells: MapCell[], side: number, minPages: number): MapLand[] {
  const seen = new Uint8Array(cells.length);
  const lands: MapLand[] = [];
  for (let start = 0; start < cells.length; start += 1) {
    if (seen[start]) continue;
    const biome = cells[start]!.shown;
    const members: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop()!;
      members.push(index);
      const col = index % side;
      const row = Math.floor(index / side);
      const neighbours = [
        col > 0 ? index - 1 : -1,
        col < side - 1 ? index + 1 : -1,
        row > 0 ? index - side : -1,
        row < side - 1 ? index + side : -1,
      ];
      for (const next of neighbours) {
        if (next < 0 || seen[next] || cells[next]!.shown !== biome) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    if (members.length < minPages || biome === 'clearing') continue;
    let sx = 0;
    let sz = 0;
    let walked = 0;
    for (const index of members) {
      sx += cells[index]!.px;
      sz += cells[index]!.pz;
      if (cells[index]!.explored >= EXPLORED_THRESHOLD) walked += 1;
    }
    const cx = sx / members.length;
    const cz = sz / members.length;
    // The member page nearest the middle, so a crescent's label sits on it.
    let best = members[0]!;
    let bestDistance = Infinity;
    for (const index of members) {
      const d = Math.hypot(cells[index]!.px - cx, cells[index]!.pz - cz);
      if (d < bestDistance) {
        bestDistance = d;
        best = index;
      }
    }
    lands.push({
      biome,
      x: cells[best]!.px * PAGE_SIZE,
      z: cells[best]!.pz * PAGE_SIZE,
      pages: members.length,
      explored: walked / members.length,
    });
  }
  return lands.sort((a, b) => b.pages - a.pages);
}

/** Mode filter over the page grid, `passes` times; returns a biome per cell. */
export function smoothRumours(cells: readonly { biome: Biome }[], side: number, passes: number): Biome[] {
  let current = cells.map((c) => c.biome);
  for (let pass = 0; pass < passes; pass += 1) {
    const next = current.slice();
    for (let row = 0; row < side; row += 1) {
      for (let col = 0; col < side; col += 1) {
        const counts = new Map<Biome, number>();
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            const r = row + dz;
            const c = col + dx;
            if (r < 0 || c < 0 || r >= side || c >= side) continue;
            const biome = current[r * side + c]!;
            counts.set(biome, (counts.get(biome) ?? 0) + 1);
          }
        }
        let best = current[row * side + col]!;
        let bestCount = 0;
        for (const [biome, count] of counts) {
          if (count > bestCount) {
            best = biome;
            bestCount = count;
          }
        }
        next[row * side + col] = best;
      }
    }
    current = next;
  }
  return current;
}

/** The same knowledge as words — the map's text version, and its alt text. */
export function describeTreasureMap(
  model: TreasureMapModel,
  describe: (hint: BiomeDirection) => string,
): string {
  const lands = model.rumours.slice(0, 5).map(describe);
  const parts = [
    model.exploredPages === 1
      ? 'You have explored 1 page of the world.'
      : `You have explored ${model.exploredPages} pages of the world around you.`,
  ];
  if (lands.length > 0) parts.push(`Lands the map has heard of — ${lands.join('; ')}.`);
  return parts.join(' ');
}

export { BIOME_MAP_NAMES };
