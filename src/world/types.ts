import type { MaterialKey } from '../render/materials';
import type { ResourceId } from '../sim/catalogs/resources';
export type { ResourceId } from '../sim/catalogs/resources';
import type { Biome } from '../sim/catalogs/biomes';
export type { Biome } from '../sim/catalogs/biomes';

// Serializable, renderer-independent page data.
// A page is the authored/gameplay world unit (one square "sheet").
// Nothing in this file may import Three.js.

/**
 * World-units per page side. The original clearing sits in the middle of
 * page 0,0. Sized so page streaming happens well outside the camera's view
 * — at 22 units the pop-in was visible from normal zoom levels.
 */
export const PAGE_SIZE = 50;

export type PageCoord = { px: number; pz: number };

export type TerrainPatchData = {
  /** World-space center. */
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  height: number;
  /**
   * Overrides the biome's default hill paper. Lets a sand mound sit in a
   * meadow, or a dirt mound in the forest, so relief is not one colour.
   * Negative `height` makes a hollow rather than a hill.
   */
  material?: MaterialKey;
};

export type MapFeatureKind =
  | 'building'
  | 'crafted'
  | 'critter'
  | 'landmark'
  | 'path'
  | 'resource'
  | 'terrain'
  | 'tree';

export type MapHint = { kind: MapFeatureKind; color: string };

export type TreeKind =
  | 'pine-medium-1'
  | 'pine-medium-2'
  | 'pine-tall'
  | 'leafy-1'
  | 'leafy-2'
  | 'redwood-1'
  | 'redwood-2'
  | 'redwood-3'
  | 'redwood-4'
  | 'redwood-5'
  | 'redwood-6'
  | 'redwood-7';

export type HarvestVisual = 'fiberTuft' | 'stoneCluster' | 'twigBundle';

export type PropData = { id?: string } & (
  | {
      kind: 'sheet';
      material: MaterialKey;
      width: number;
      depth: number;
      x: number;
      z: number;
      y?: number;
      rotY?: number;
      map?: MapHint;
    }
  | {
      // Water is its own kind, not a blue `sheet`. The generator scatters
      // blue paper as decoration; only this becomes a pond.
      kind: 'water';
      width: number;
      depth: number;
      x: number;
      z: number;
      rotY?: number;
      map?: MapHint;
    }
  | {
      kind: 'scrapPile';
      material: MaterialKey;
      x: number;
      z: number;
      count: number;
      seed: number;
      spreadX: number;
      spreadZ: number;
      map?: MapHint;
    }
  | {
      kind: 'tree';
      tree: TreeKind;
      x: number;
      z: number;
      rotY?: number;
      height?: number;
      mapColor?: string;
    }
  | {
      kind: 'ribbon';
      material: MaterialKey;
      x: number;
      z: number;
      width: number;
      depth: number;
      rotY: number;
      map?: MapHint;
    }
  | {
      kind: 'harvestable';
      resource: ResourceId;
      visual: HarvestVisual;
      material: MaterialKey;
      x: number;
      z: number;
      seed: number;
      amount: number;
      respawnSeconds: number;
      mapColor: string;
    }
  | {
      /** Hand-built one-off set pieces that live on authored pages. */
      kind: 'unique';
      unique: 'clearingHouse' | 'thingMaker' | 'seedStore' | 'critters' | 'displayWall' | 'cozyDetails' | 'clearingSignpost' | 'forestTrailSign' | 'woodMill';
    }
);

export type PageData = {
  id: string;
  px: number;
  pz: number;
  biome: Biome;
  seed: number;
  groundMaterial: MaterialKey;
  terrain: TerrainPatchData[];
  props: PropData[];
};

export function pageId(px: number, pz: number) {
  return `${px},${pz}`;
}

/** Page coordinate containing a world position. Page 0,0 spans -25..25. */
export function pageOfPosition(x: number, z: number): PageCoord {
  return {
    px: Math.round(x / PAGE_SIZE),
    pz: Math.round(z / PAGE_SIZE),
  };
}

/** World-space center of a page. */
export function pageCenter(px: number, pz: number) {
  return { x: px * PAGE_SIZE, z: pz * PAGE_SIZE };
}
