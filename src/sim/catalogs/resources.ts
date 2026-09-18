import type { MaterialMetadata, MaterialTag, ProcessStage, StructuralClass } from './materials';
import { MATERIAL_TAG_IDS } from './materials';

export type ResourceCategoryDefinition = {
  id: string;
  label: string;
  singularLabel: string;
  description: string;
  iconKey: string;
  color: string;
};

export const RESOURCE_CATEGORIES = {
  sticks: { id: 'sticks', label: 'Wood & Bark', singularLabel: 'stick', description: 'Snapped, shed, and ribbon-curled pieces of local trees.', iconKey: 'resource-category.sticks', color: '#9a623b' },
  stones: { id: 'stones', label: 'Stones & Pebbles', singularLabel: 'stone', description: 'Crumpled, folded, and pressed pieces gathered from the ground.', iconKey: 'resource-category.stones', color: '#657e82' },
  fiber: { id: 'fiber', label: 'Fibers & Foliage', singularLabel: 'fiber', description: 'Soft plantlike scraps for stuffing, weaving, and growing things.', iconKey: 'resource-category.fiber', color: '#5b8849' },
  cardboard: { id: 'cardboard', label: 'Cardboard & Board', singularLabel: 'piece', description: 'Sturdy layered material shaped by the landscape around it.', iconKey: 'resource-category.cardboard', color: '#aa7945' },
  soil: { id: 'soil', label: 'Paper Soil & Clay', singularLabel: 'scoop', description: 'Regional paper earth lifted from shallow beds and folded hills.', iconKey: 'resource-category.soil', color: '#8c6748' },
  seeds: { id: 'seeds', label: 'Seeds & Starts', singularLabel: 'seed', description: 'Tiny folded beginnings for gardens and careful ground-mending.', iconKey: 'resource-category.seeds', color: '#778f4d' },
  food: { id: 'food', label: 'Harvests & Food', singularLabel: 'harvest', description: 'Paper fruits and vegetables picked from plants you grew.', iconKey: 'resource-category.food', color: '#c45d4a' },
  // Crafted, never found loose — see recipes.ts's 'resource'-kind
  // RecipeOutput. First entry: bound-lumber (2026-09-02).
  refined: { id: 'refined', label: 'Refined Materials', singularLabel: 'piece', description: 'Multi-step supplies worked up from raw finds at the Thing Maker.', iconKey: 'resource-category.refined', color: '#7a5c3e' },
} as const satisfies Record<string, ResourceCategoryDefinition>;

export type ResourceCategoryId = keyof typeof RESOURCE_CATEGORIES;
export const RESOURCE_CATEGORY_ORDER: ResourceCategoryId[] = ['sticks', 'stones', 'fiber', 'cardboard', 'soil', 'seeds', 'food', 'refined'];

export type ResourceCoreDefinition = {
  id: string;
  label: string;
  shortLabel: string;
  category: ResourceCategoryId;
  iconKey: string;
  /** How many transformations sit behind this. See `materials.ts`. */
  processStage: ProcessStage;
  /** What scale of building may use it. Conservative on purpose — see `materials.ts`. */
  structuralClass: StructuralClass;
  /** What a recipe may ask for without naming this resource exactly. At least one. */
  tags: readonly MaterialTag[];
};

/** Renderer-free identities shared by saves, recipes, tests, and a future server. */
export const RESOURCE_CORE_DEFS = {
  'kraft-twigs': { id: 'kraft-twigs', label: 'Kraft-paper twigs', shortLabel: 'Kraft twigs', category: 'sticks', iconKey: 'resource.kraft-twigs', processStage: 0, structuralClass: 1, tags: ['wood'] },
  'ribbonwood-sticks': { id: 'ribbonwood-sticks', label: 'Ribbonwood sticks', shortLabel: 'Ribbonwood', category: 'sticks', iconKey: 'resource.ribbonwood-sticks', processStage: 0, structuralClass: 1, tags: ['wood', 'species-wood'] },
  // The first material with no loose pile anywhere in the world: bark curls
  // only come off a living redwood, and only to heavier shears. That is what
  // makes the tier-2 scissors worth making rather than a bigger number.
  'redwood-bark-curls': { id: 'redwood-bark-curls', label: 'Redwood bark curls', shortLabel: 'Bark curls', category: 'sticks', iconKey: 'resource.redwood-bark-curls', processStage: 0, structuralClass: 1, tags: ['wood', 'species-wood', 'long-fiber'] },
  'palm-clippings': { id: 'palm-clippings', label: 'Palm clippings', shortLabel: 'Palm clippings', category: 'sticks', iconKey: 'resource.palm-clippings', processStage: 0, structuralClass: 1, tags: ['wood', 'species-wood'] },
  'palm-fiber': { id: 'palm-fiber', label: 'Palm fiber', shortLabel: 'Palm fiber', category: 'fiber', iconKey: 'resource.palm-fiber', processStage: 0, structuralClass: 0, tags: ['soft-fiber', 'long-fiber'] },
  // Trimmed from the hanging vines on tall jungle trees — nowhere else. Long,
  // twisted, stretchy strands: the tropics' binding and weaving fiber.
  'crepe-vine': { id: 'crepe-vine', label: 'Crepe-paper vine', shortLabel: 'Crepe vine', category: 'fiber', iconKey: 'resource.crepe-vine', processStage: 0, structuralClass: 0, tags: ['long-fiber'] },
  // Snipped from mushroom clusters on forest and jungle floors. Spongy and
  // soft, like blotting paper — stuffing, not structure.
  'blotting-caps': { id: 'blotting-caps', label: 'Blotting-paper caps', shortLabel: 'Blotting caps', category: 'fiber', iconKey: 'resource.blotting-caps', processStage: 0, structuralClass: 0, tags: ['soft-fiber'] },
  'mossy-paper-fiber': { id: 'mossy-paper-fiber', label: 'Mossy paper fiber', shortLabel: 'Paper fiber', category: 'fiber', iconKey: 'resource.mossy-paper-fiber', processStage: 0, structuralClass: 0, tags: ['soft-fiber'] },
  'confetti-stones': { id: 'confetti-stones', label: 'Confetti stones', shortLabel: 'Confetti stone', category: 'stones', iconKey: 'resource.confetti-stones', processStage: 0, structuralClass: 1, tags: ['stone'] },
  'graphite-cardstone': { id: 'graphite-cardstone', label: 'Graphite cardstone', shortLabel: 'Cardstone', category: 'stones', iconKey: 'resource.graphite-cardstone', processStage: 0, structuralClass: 1, tags: ['stone'] },
  'bluefold-pebbles': { id: 'bluefold-pebbles', label: 'Bluefold pebbles', shortLabel: 'Bluefolds', category: 'stones', iconKey: 'resource.bluefold-pebbles', processStage: 0, structuralClass: 1, tags: ['stone'] },
  'terracotta-pebbles': { id: 'terracotta-pebbles', label: 'Terracotta pebbles', shortLabel: 'Terracottas', category: 'stones', iconKey: 'resource.terracotta-pebbles', processStage: 0, structuralClass: 1, tags: ['stone'] },
  'sunbaked-cardboard': { id: 'sunbaked-cardboard', label: 'Sunbaked cardboard', shortLabel: 'Sunbaked card', category: 'cardboard', iconKey: 'resource.sunbaked-cardboard', processStage: 0, structuralClass: 1, tags: ['board'] },
  'ochre-paperclay': { id: 'ochre-paperclay', label: 'Ochre paperclay', shortLabel: 'Ochre clay', category: 'soil', iconKey: 'resource.ochre-paperclay', processStage: 0, structuralClass: 1, tags: ['clay', 'soil'] },
  // The tropics' wet-ground soil, per the biome plan: "a wet-ground soil or
  // clay distinct from ochre paperclay." Dark, green, and always damp.
  'jungle-loam': { id: 'jungle-loam', label: 'Jungle loam', shortLabel: 'Jungle loam', category: 'soil', iconKey: 'resource.jungle-loam', processStage: 0, structuralClass: 1, tags: ['clay', 'soil'] },
  // Its dig-table stone — "folded over like a letter," the same idea as
  // bluefolds, in wetter paper. Dug, never scattered: the tropics' shovel
  // story mirrors the redwood's scissors story.
  'rainfold-pebbles': { id: 'rainfold-pebbles', label: 'Rainfold pebbles', shortLabel: 'Rainfolds', category: 'stones', iconKey: 'resource.rainfold-pebbles', processStage: 0, structuralClass: 1, tags: ['stone'] },
  'carbon-soil': { id: 'carbon-soil', label: 'Carbon soil', shortLabel: 'Carbon soil', category: 'soil', iconKey: 'resource.carbon-soil', processStage: 0, structuralClass: 0, tags: ['soil'] },
  'carbon-copy-shale': { id: 'carbon-copy-shale', label: 'Carbon-copy shale', shortLabel: 'Copy shale', category: 'stones', iconKey: 'resource.carbon-copy-shale', processStage: 0, structuralClass: 1, tags: ['stone'] },
  'buttonbloom-seeds': { id: 'buttonbloom-seeds', label: 'Buttonbloom seeds', shortLabel: 'Buttonbloom seeds', category: 'seeds', iconKey: 'resource.buttonbloom-seeds', processStage: 0, structuralClass: 0, tags: ['seed'] },
  'mend-me-seeds': { id: 'mend-me-seeds', label: 'Mend-me seeds', shortLabel: 'Mend-me seeds', category: 'seeds', iconKey: 'resource.mend-me-seeds', processStage: 0, structuralClass: 0, tags: ['seed'] },
  'raspberry-bush-seeds': { id: 'raspberry-bush-seeds', label: 'Raspberry bush seeds', shortLabel: 'Raspberry seeds', category: 'seeds', iconKey: 'resource.raspberry-bush-seeds', processStage: 0, structuralClass: 0, tags: ['seed'] },
  'crinkle-carrot-seeds': { id: 'crinkle-carrot-seeds', label: 'Crinkle-carrot seeds', shortLabel: 'Carrot seeds', category: 'seeds', iconKey: 'resource.crinkle-carrot-seeds', processStage: 0, structuralClass: 0, tags: ['seed'] },
  'ribbon-corn-seeds': { id: 'ribbon-corn-seeds', label: 'Ribbon-corn seeds', shortLabel: 'Corn seeds', category: 'seeds', iconKey: 'resource.ribbon-corn-seeds', processStage: 0, structuralClass: 0, tags: ['seed'] },
  'folded-cabbage-seeds': { id: 'folded-cabbage-seeds', label: 'Folded-cabbage seeds', shortLabel: 'Cabbage seeds', category: 'seeds', iconKey: 'resource.folded-cabbage-seeds', processStage: 0, structuralClass: 0, tags: ['seed'] },
  'paper-tomato-seeds': { id: 'paper-tomato-seeds', label: 'Paper-tomato seeds', shortLabel: 'Tomato seeds', category: 'seeds', iconKey: 'resource.paper-tomato-seeds', processStage: 0, structuralClass: 0, tags: ['seed'] },
  'raspberries': { id: 'raspberries', label: 'Paper raspberries', shortLabel: 'Raspberries', category: 'food', iconKey: 'resource.raspberries', processStage: 0, structuralClass: 0, tags: ['food'] },
  'crinkle-carrots': { id: 'crinkle-carrots', label: 'Crinkle carrots', shortLabel: 'Crinkle carrots', category: 'food', iconKey: 'resource.crinkle-carrots', processStage: 0, structuralClass: 0, tags: ['food'] },
  'ribbon-corn': { id: 'ribbon-corn', label: 'Ribbon corn', shortLabel: 'Ribbon corn', category: 'food', iconKey: 'resource.ribbon-corn', processStage: 0, structuralClass: 0, tags: ['food'] },
  'folded-cabbage': { id: 'folded-cabbage', label: 'Folded cabbage', shortLabel: 'Folded cabbage', category: 'food', iconKey: 'resource.folded-cabbage', processStage: 0, structuralClass: 0, tags: ['food'] },
  'paper-tomato': { id: 'paper-tomato', label: 'Paper tomatoes', shortLabel: 'Paper tomatoes', category: 'food', iconKey: 'resource.paper-tomato', processStage: 0, structuralClass: 0, tags: ['food'] },
  // Crafted at the Thing Maker, never found loose in the world — see
  // recipes.ts's 'resource'-kind RecipeOutput. First refined material.
  'bound-lumber': { id: 'bound-lumber', label: 'Bound lumber', shortLabel: 'Bound lumber', category: 'refined', iconKey: 'resource.bound-lumber', processStage: 1, structuralClass: 2, tags: ['wood', 'board'] },
} as const satisfies Record<string, ResourceCoreDefinition>;

export type ResourceId = keyof typeof RESOURCE_CORE_DEFS;


/** The material axes for one resource, without the identity fields around them. */
export function materialMetaFor(resource: ResourceId): MaterialMetadata {
  const def = RESOURCE_CORE_DEFS[resource];
  return { processStage: def.processStage, structuralClass: def.structuralClass, tags: def.tags };
}

export function hasMaterialTag(resource: ResourceId, tag: MaterialTag): boolean {
  return (RESOURCE_CORE_DEFS[resource].tags as readonly string[]).includes(tag);
}

export const RESOURCE_IDS = Object.keys(RESOURCE_CORE_DEFS) as ResourceId[];

/**
 * Every resource carrying each tag, derived rather than hand-kept — a
 * tag-kind recipe ingredient reads this instead of restating a list that
 * would quietly go stale the next time a material is added.
 */
export const RESOURCES_BY_TAG: Record<MaterialTag, ResourceId[]> = Object.fromEntries(
  MATERIAL_TAG_IDS.map((tag) => [tag, RESOURCE_IDS.filter((id) => hasMaterialTag(id, tag))]),
) as Record<MaterialTag, ResourceId[]>;

export function resourcesWithTag(tag: MaterialTag): ResourceId[] {
  return RESOURCES_BY_TAG[tag];
}
