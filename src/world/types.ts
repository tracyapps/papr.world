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
  | 'leafy-3'
  | 'palm-1'
  | 'palm-2'
  | 'palm-3'
  | 'palm-4'
  | 'palm-5'
  | 'banana-1'
  | 'jungle-1'
  | 'jungle-2'
  | 'redwood-1'
  | 'redwood-2'
  | 'redwood-3'
  | 'redwood-4'
  | 'redwood-5'
  | 'redwood-6'
  | 'redwood-7';

/**
 * Non-interactive scenery cutouts: decorative like a tree, but never
 * trimmable/harvestable/growable. Cactus lives here rather than in
 * `TreeKind` so desert scenery never enters the tree-growth economy — and
 * so do the biome undergrowth plants (ferns, flowers, shrubs, boulders),
 * which share a page's scenery budget without joining its yields.
 */
export type DecorKind =
  | 'cactus-1'
  | 'cactus-2'
  | 'cactus-3'
  | 'cactus-4'
  | 'cactus-5'
  | 'cactus-6'
  | 'cactus-7'
  | 'cactus-8'
  // Dunes understory: succulents, dry shrubs, and one hardy flower.
  | 'agave-1'
  | 'agave-2'
  | 'prickly-pear-1'
  | 'shrub-desert-1'
  | 'shrub-desert-2'
  | 'marigold-1'
  // Forest floor: ferns, fungi, a berry shrub, and one mossy rock.
  | 'fern-1'
  | 'fern-2'
  | 'fern-3'
  | 'mushroom-1'
  | 'mushroom-2'
  | 'berry-shrub-1'
  | 'boulder-mossy-1'
  // Tropical understory: the broadleaf plant the biome plan asked for,
  // jungle shrubs, its three signature flowers, bamboo, and mangrove.
  | 'broadleaf-plant-1'
  | 'broadleaf-plant-2'
  | 'shrub-tropical-1'
  | 'shrub-tropical-2'
  | 'shrub-tropical-3'
  | 'hibiscus-1'
  | 'anthurium-1'
  | 'bird-of-paradise-1'
  | 'bamboo-1'
  | 'mangrove-1'
  // Hanging vines. Never placed on the ground: they only appear in a tall
  // jungle tree's `vines` list, hooked under its canopy.
  | 'hanging-vine-1'
  | 'hanging-vine-2'
  | 'hanging-vine-flowering-1';

/**
 * A vine hanging from a tree's canopy, positioned relative to its tree so it
 * can never drift away from it (or be left floating when the tree is culled
 * for standing in water). Offsets are in the tree's own plane.
 */
export type HangingVineData = {
  art: DecorKind;
  /** Sideways offset along the tree cutout's width, in world units. */
  offset: number;
  /** Height above the tree's base where the vine's top is hooked. */
  topY: number;
  /** Length of the vine cutout. */
  height: number;
  /** Nudged toward the viewer so the vine reads in front of the canopy. */
  depth: number;
};

export type HarvestVisual =
  | 'fiberTuft'
  | 'stoneCluster'
  | 'twigBundle'
  // Small and round rather than jagged — a scatter of seeds, not pebbles.
  | 'seedPile'
  // Tumbled, rounded produce — what a berry or a root drops as, not a
  // stone and not a blade of grass.
  | 'harvestedFood';

export type WaterBankStyle = 'marsh' | 'rock' | 'sand' | 'woodland';

export type WaterCrossingData = {
  x: number;
  z: number;
  /** Long axis of the bridge, which runs bank-to-bank. */
  rotationY: number;
  width: number;
  length: number;
};

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
      /** A curved, flowing water ribbon. Points and widths are world-space. */
      kind: 'waterChannel';
      points: Array<[number, number]>;
      widths: number[];
      depths: number[];
      flowSpeed: number;
      bankStyle: WaterBankStyle;
      seed: number;
      crossing?: WaterCrossingData;
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
      /** Vines hooked under this tree's canopy — tall jungle trees only. */
      vines?: HangingVineData[];
    }
  | {
      /**
       * Cutout scenery. Most decor is pure garnish; mushrooms and shrubs are
       * trimmable (see `decorTrimSpecies` in treeRuntime.ts).
       */
      kind: 'decor';
      art: DecorKind;
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
