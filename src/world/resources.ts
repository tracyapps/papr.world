import type { MaterialKey } from '../render/materials';
import {
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_ORDER,
  RESOURCE_CORE_DEFS,
  type ResourceCategoryId,
  type ResourceId,
} from '../sim/catalogs/resources';
import { BIOME_SCATTER } from '../sim/catalogs/obtaining';
import type { Biome, HarvestVisual } from './types';

export { RESOURCE_CATEGORIES, RESOURCE_CATEGORY_ORDER };
export type { ResourceCategoryDefinition, ResourceCategoryId, ResourceId } from '../sim/catalogs/resources';

export type ResourceDefinition = {
  id: ResourceId;
  label: string;
  shortLabel: string;
  material: MaterialKey;
  visual: HarvestVisual;
  mapColor: string;
  category: ResourceCategoryId;
  iconKey: string;
};

const RESOURCE_WORLD_DEFS: Record<ResourceId, Omit<ResourceDefinition, 'id' | 'label' | 'shortLabel' | 'category' | 'iconKey'>> = {
  'kraft-twigs': {
    material: 'paper.brown', visual: 'twigBundle', mapColor: '#8b5f38',
  },
  'ribbonwood-sticks': {
    material: 'paper.salmon', visual: 'twigBundle', mapColor: '#b45e67',
  },
  // Deliberately absent from `BIOME_RESOURCES`: this never generates as a
  // loose pile. Cork reads as bark without new artwork.
  //
  'redwood-bark-curls': {
    material: 'paper.cork', visual: 'twigBundle', mapColor: '#8a4a33',
  },
  'mossy-paper-fiber': {
    material: 'paper.monstera', visual: 'fiberTuft', mapColor: '#4f823f',
  },
  'confetti-stones': {
    material: 'paper.purple', visual: 'stoneCluster', mapColor: '#8252a0',
  },
  'graphite-cardstone': {
    material: 'paper.grey', visual: 'stoneCluster', mapColor: '#696c70',
  },
  'bluefold-pebbles': {
    material: 'paper.aqua', visual: 'stoneCluster', mapColor: '#4c91a8',
  },
  // Desert-exclusive: warm orange wrapping paper reads as sun-baked clay
  // rather than reusing meadow's aqua pebbles in a biome they don't suit.
  'terracotta-pebbles': {
    material: 'paper.orangewrap', visual: 'stoneCluster', mapColor: '#c2703f',
  },
  'sunbaked-cardboard': {
    material: 'paper.brown.warm', visual: 'stoneCluster', mapColor: '#af7e42',
  },
  'ochre-paperclay': {
    material: 'paper.brown.warm', visual: 'stoneCluster', mapColor: '#b9824f',
  },
  'carbon-soil': {
    material: 'paper.grey', visual: 'stoneCluster', mapColor: '#4d4945',
  },
  'carbon-copy-shale': {
    material: 'paper.grey', visual: 'stoneCluster', mapColor: '#53616a',
  },
  // Small and round, not a standing blade of grass — a seed is closer in
  // shape to a tiny stone than to fiber. See seedPile in world/types.ts.
  'buttonbloom-seeds': {
    material: 'paper.rainbow', visual: 'seedPile', mapColor: '#d27891',
  },
  'mend-me-seeds': {
    material: 'paper.green', visual: 'seedPile', mapColor: '#759457',
  },
  'raspberry-bush-seeds': {
    material: 'paper.green', visual: 'seedPile', mapColor: '#c75a6a',
  },
  'crinkle-carrot-seeds': {
    material: 'paper.green', visual: 'seedPile', mapColor: '#d98a52',
  },
  'ribbon-corn-seeds': {
    material: 'paper.green', visual: 'seedPile', mapColor: '#d3b454',
  },
  'folded-cabbage-seeds': {
    material: 'paper.green', visual: 'seedPile', mapColor: '#8aa86f',
  },
  'paper-tomato-seeds': {
    material: 'paper.green', visual: 'seedPile', mapColor: '#d2654f',
  },
  // The harvests themselves don't spawn as a loose ground pile today — they
  // come off a plant you grew, not off the ground directly. `harvestedFood`
  // is set here anyway (rather than the wrong-shaped fiberTuft) so these
  // entries are correct the moment anything ever does drop them loose —
  // e.g. an unharvested plant shedding its ripe produce after a few days,
  // which is not built (see docs/resource-artwork-guide.md's note on this).
  'raspberries': {
    material: 'paper.green', visual: 'harvestedFood', mapColor: '#c73e52',
  },
  'crinkle-carrots': {
    material: 'paper.green', visual: 'harvestedFood', mapColor: '#e07b3a',
  },
  'ribbon-corn': {
    material: 'paper.green', visual: 'harvestedFood', mapColor: '#e3bd45',
  },
  'folded-cabbage': {
    material: 'paper.green', visual: 'harvestedFood', mapColor: '#7fa06a',
  },
  'paper-tomato': {
    material: 'paper.green', visual: 'harvestedFood', mapColor: '#d14a35',
  },
  // Never spawns loose in the world (crafted-only, see recipes.ts) — visual
  // is set for type-completeness and in case it's ever dropped/stored. A
  // bundle of finished lumber is closer in shape to twigBundle than any
  // other flat-lying pile, just a tidier, more uniform one.
  'bound-lumber': {
    material: 'paper.brown.warm', visual: 'twigBundle', mapColor: '#6b4423',
  },
};

export const RESOURCE_DEFS = Object.fromEntries(
  (Object.keys(RESOURCE_CORE_DEFS) as ResourceId[]).map((id) => [
    id,
    { ...RESOURCE_CORE_DEFS[id], ...RESOURCE_WORLD_DEFS[id] },
  ]),
) as Record<ResourceId, ResourceDefinition>;

/**
 * What the generator scatters as loose piles, per biome.
 *
 * Derived from `catalogs/obtaining.ts` rather than written twice. This was a
 * hand-kept list sitting beside the scatter table, so the two could disagree
 * about where a material lived and nothing would notice — the reference site
 * and a critter would then confidently describe a world the generator was
 * not building.
 */
export const BIOME_RESOURCES: Record<Biome, ResourceId[]> = BIOME_SCATTER;
