import type { MaterialKey } from '../render/materials';
import {
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_ORDER,
  RESOURCE_CORE_DEFS,
  type ResourceCategoryId,
  type ResourceId,
} from '../sim/catalogs/resources';
import { BIOME_SCATTER } from '../sim/catalogs/obtaining';
import type { MaterialTag, ProcessStage, StructuralClass } from '../sim/catalogs/materials';
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
  // Carried through from the renderer-free core definition so one joined
  // resource can be read — and validated — as a whole. See catalogs/materials.ts.
  processStage: ProcessStage;
  structuralClass: StructuralClass;
  tags: readonly MaterialTag[];
};

type ResourceWorldDefinition = Omit<
  ResourceDefinition,
  'id' | 'label' | 'shortLabel' | 'category' | 'iconKey' | 'processStage' | 'structuralClass' | 'tags'
>;

const RESOURCE_WORLD_DEFS: Record<ResourceId, ResourceWorldDefinition> = {
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
  // Also deliberately absent from `BIOME_RESOURCES`. A palm is the only
  // woody thing on a dunes page, and both of its materials come off it with
  // scissors — nothing palm ever lies loose to be walked over.
  'palm-clippings': {
    material: 'paper.orangewrap', visual: 'twigBundle', mapColor: '#b07a3c',
  },
  'palm-fiber': {
    material: 'paper.hill', visual: 'fiberTuft', mapColor: '#7ca24c',
  },
  // Neither lies loose anywhere; both come off living things with scissors.
  // Salmon ribbon-weave reads as twisted crepe until a tile is drawn.
  'crepe-vine': {
    material: 'paper.salmon', visual: 'fiberTuft', mapColor: '#5f9a3e',
  },
  'blotting-caps': {
    material: 'paper.brown.warm', visual: 'stoneCluster', mapColor: '#b98a6a',
  },
  'mossy-paper-fiber': {
    material: 'paper.monstera', visual: 'fiberTuft', mapColor: '#4f823f',
  },
  'cypress-bark-folds': { material: 'paper.cork', visual: 'twigBundle', mapColor: '#71543f' },
  'alpine-resin-paper': { material: 'paper.hill', visual: 'fiberTuft', mapColor: '#78914b' },
  'acacia-thornwood': { material: 'paper.brown.warm', visual: 'twigBundle', mapColor: '#95633d' },
  'baobab-pith-fiber': { material: 'paper.orangewrap', visual: 'fiberTuft', mapColor: '#b68557' },
  'bamboo-strips': { material: 'paper.green', visual: 'twigBundle', mapColor: '#6f9842' },
  'supple-shrub-shoots': { material: 'paper.salmon', visual: 'twigBundle', mapColor: '#8b7751' },
  'pressed-petal-confetti': { material: 'paper.rainbow', visual: 'fiberTuft', mapColor: '#c66f91' },
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
  // The compiled jungle-loam tile wins on the ground; monstera green is the
  // primitive-geometry fallback while it loads or if art ever goes missing.
  'jungle-loam': {
    material: 'paper.monstera', visual: 'stoneCluster', mapColor: '#5c6e3a',
  },
  // Deliberately absent from `BIOME_RESOURCES`: rainfolds come out of the
  // shovel, never lying loose — the dig layer is their only route, the way
  // bark curls are the shears' reward.
  'rainfold-pebbles': {
    material: 'paper.aqua', visual: 'stoneCluster', mapColor: '#4c91a8',
  },
  'bog-peat-paper': { material: 'paper.brown', visual: 'stoneCluster', mapColor: '#554b35' },
  'wetland-silt-clay': { material: 'paper.aqua', visual: 'stoneCluster', mapColor: '#718b7d' },
  'granite-cardstone': { material: 'paper.grey', visual: 'stoneCluster', mapColor: '#777c80' },
  'savanna-hardpan': { material: 'paper.orangewrap', visual: 'stoneCluster', mapColor: '#a27b48' },
  'badlands-ochre': { material: 'paper.orangewrap', visual: 'stoneCluster', mapColor: '#b65f3d' },
  'bamboo-loam': { material: 'paper.monstera', visual: 'stoneCluster', mapColor: '#53683f' },
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
  'lotus-fold-seeds': { material: 'paper.rainbow', visual: 'seedPile', mapColor: '#cf7896' },
  'marsh-reed-seeds': { material: 'paper.green', visual: 'seedPile', mapColor: '#718857' },
  'sunpaper-seeds': { material: 'paper.orangewrap', visual: 'seedPile', mapColor: '#cca442' },
  'bamboo-starts': { material: 'paper.green', visual: 'seedPile', mapColor: '#729848' },
  'alpine-herb-seeds': { material: 'paper.hill', visual: 'seedPile', mapColor: '#798c61' },
  'prickly-pear-seeds': { material: 'paper.green', visual: 'seedPile', mapColor: '#859750' },
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
  'lotus-blossoms': { material: 'paper.rainbow', visual: 'harvestedFood', mapColor: '#d77e9d' },
  'marsh-reed-stalks': { material: 'paper.green', visual: 'fiberTuft', mapColor: '#718557' },
  'sunpaper-heads': { material: 'paper.orangewrap', visual: 'harvestedFood', mapColor: '#d1a43d' },
  'young-bamboo': { material: 'paper.green', visual: 'harvestedFood', mapColor: '#759c4b' },
  'alpine-herbs': { material: 'paper.hill', visual: 'harvestedFood', mapColor: '#778e63' },
  'paper-prickly-pears': { material: 'paper.green', visual: 'harvestedFood', mapColor: '#8b9b51' },
  // Never spawns loose in the world (crafted-only, see recipes.ts) — visual
  // is set for type-completeness and in case it's ever dropped/stored. A
  // bundle of finished lumber is closer in shape to twigBundle than any
  // other flat-lying pile, just a tidier, more uniform one.
  'bound-lumber': {
    material: 'paper.brown.warm', visual: 'twigBundle', mapColor: '#6b4423',
  },
  // Mill-refined stock (catalogs/millRefining.ts). Never generated loose;
  // visuals matter only if one is ever dropped or displayed.
  'binding-cord': {
    material: 'paper.salmon', visual: 'fiberTuft', mapColor: '#b5745a',
  },
  'soft-pulp': {
    material: 'paper.bubbles', visual: 'stoneCluster', mapColor: '#cfd9cf',
  },
  'stone-aggregate': {
    material: 'paper.grey', visual: 'stoneCluster', mapColor: '#8a8f91',
  },
  'paper-mortar': {
    material: 'paper.brown.warm', visual: 'stoneCluster', mapColor: '#c29a6c',
  },
};

// Built with an explicit loop rather than `Object.fromEntries(...) as
// Record<...>`: the cast silently accepted whatever the join produced, so a
// core field the joined type didn't know about would never have been caught.
// Assigning into a typed record checks each merged definition for real.
function joinResourceDefs(): Record<ResourceId, ResourceDefinition> {
  const joined = {} as Record<ResourceId, ResourceDefinition>;
  for (const id of Object.keys(RESOURCE_CORE_DEFS) as ResourceId[]) {
    joined[id] = { ...RESOURCE_CORE_DEFS[id], ...RESOURCE_WORLD_DEFS[id] };
  }
  return joined;
}

export const RESOURCE_DEFS = joinResourceDefs();

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
