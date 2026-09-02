export type ResourceCategoryDefinition = {
  id: string;
  label: string;
  singularLabel: string;
  description: string;
  iconKey: string;
  color: string;
};

export const RESOURCE_CATEGORIES = {
  sticks: { id: 'sticks', label: 'Sticks & Twigs', singularLabel: 'stick', description: 'Snapped, shed, and ribbon-curled pieces of local trees.', iconKey: 'resource-category.sticks', color: '#9a623b' },
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
};

/** Renderer-free identities shared by saves, recipes, tests, and a future server. */
export const RESOURCE_CORE_DEFS = {
  'kraft-twigs': { id: 'kraft-twigs', label: 'Kraft-paper twigs', shortLabel: 'Kraft twigs', category: 'sticks', iconKey: 'resource.kraft-twigs' },
  'ribbonwood-sticks': { id: 'ribbonwood-sticks', label: 'Ribbonwood sticks', shortLabel: 'Ribbonwood', category: 'sticks', iconKey: 'resource.ribbonwood-sticks' },
  // The first material with no loose pile anywhere in the world: bark curls
  // only come off a living redwood, and only to heavier shears. That is what
  // makes the tier-2 scissors worth making rather than a bigger number.
  'redwood-bark-curls': { id: 'redwood-bark-curls', label: 'Redwood bark curls', shortLabel: 'Bark curls', category: 'sticks', iconKey: 'resource.redwood-bark-curls' },
  'mossy-paper-fiber': { id: 'mossy-paper-fiber', label: 'Mossy paper fiber', shortLabel: 'Paper fiber', category: 'fiber', iconKey: 'resource.mossy-paper-fiber' },
  'confetti-stones': { id: 'confetti-stones', label: 'Confetti stones', shortLabel: 'Confetti stone', category: 'stones', iconKey: 'resource.confetti-stones' },
  'graphite-cardstone': { id: 'graphite-cardstone', label: 'Graphite cardstone', shortLabel: 'Cardstone', category: 'stones', iconKey: 'resource.graphite-cardstone' },
  'bluefold-pebbles': { id: 'bluefold-pebbles', label: 'Bluefold pebbles', shortLabel: 'Bluefolds', category: 'stones', iconKey: 'resource.bluefold-pebbles' },
  'terracotta-pebbles': { id: 'terracotta-pebbles', label: 'Terracotta pebbles', shortLabel: 'Terracottas', category: 'stones', iconKey: 'resource.terracotta-pebbles' },
  'sunbaked-cardboard': { id: 'sunbaked-cardboard', label: 'Sunbaked cardboard', shortLabel: 'Sunbaked card', category: 'cardboard', iconKey: 'resource.sunbaked-cardboard' },
  'ochre-paperclay': { id: 'ochre-paperclay', label: 'Ochre paperclay', shortLabel: 'Ochre clay', category: 'soil', iconKey: 'resource.ochre-paperclay' },
  'carbon-soil': { id: 'carbon-soil', label: 'Carbon soil', shortLabel: 'Carbon soil', category: 'soil', iconKey: 'resource.carbon-soil' },
  'carbon-copy-shale': { id: 'carbon-copy-shale', label: 'Carbon-copy shale', shortLabel: 'Copy shale', category: 'stones', iconKey: 'resource.carbon-copy-shale' },
  'buttonbloom-seeds': { id: 'buttonbloom-seeds', label: 'Buttonbloom seeds', shortLabel: 'Buttonbloom seeds', category: 'seeds', iconKey: 'resource.buttonbloom-seeds' },
  'mend-me-seeds': { id: 'mend-me-seeds', label: 'Mend-me seeds', shortLabel: 'Mend-me seeds', category: 'seeds', iconKey: 'resource.mend-me-seeds' },
  'raspberry-bush-seeds': { id: 'raspberry-bush-seeds', label: 'Raspberry bush seeds', shortLabel: 'Raspberry seeds', category: 'seeds', iconKey: 'resource.raspberry-bush-seeds' },
  'crinkle-carrot-seeds': { id: 'crinkle-carrot-seeds', label: 'Crinkle-carrot seeds', shortLabel: 'Carrot seeds', category: 'seeds', iconKey: 'resource.crinkle-carrot-seeds' },
  'ribbon-corn-seeds': { id: 'ribbon-corn-seeds', label: 'Ribbon-corn seeds', shortLabel: 'Corn seeds', category: 'seeds', iconKey: 'resource.ribbon-corn-seeds' },
  'folded-cabbage-seeds': { id: 'folded-cabbage-seeds', label: 'Folded-cabbage seeds', shortLabel: 'Cabbage seeds', category: 'seeds', iconKey: 'resource.folded-cabbage-seeds' },
  'paper-tomato-seeds': { id: 'paper-tomato-seeds', label: 'Paper-tomato seeds', shortLabel: 'Tomato seeds', category: 'seeds', iconKey: 'resource.paper-tomato-seeds' },
  'raspberries': { id: 'raspberries', label: 'Paper raspberries', shortLabel: 'Raspberries', category: 'food', iconKey: 'resource.raspberries' },
  'crinkle-carrots': { id: 'crinkle-carrots', label: 'Crinkle carrots', shortLabel: 'Crinkle carrots', category: 'food', iconKey: 'resource.crinkle-carrots' },
  'ribbon-corn': { id: 'ribbon-corn', label: 'Ribbon corn', shortLabel: 'Ribbon corn', category: 'food', iconKey: 'resource.ribbon-corn' },
  'folded-cabbage': { id: 'folded-cabbage', label: 'Folded cabbage', shortLabel: 'Folded cabbage', category: 'food', iconKey: 'resource.folded-cabbage' },
  'paper-tomato': { id: 'paper-tomato', label: 'Paper tomatoes', shortLabel: 'Paper tomatoes', category: 'food', iconKey: 'resource.paper-tomato' },
  // Crafted at the Thing Maker, never found loose in the world — see
  // recipes.ts's 'resource'-kind RecipeOutput. First refined material.
  'bound-lumber': { id: 'bound-lumber', label: 'Bound lumber', shortLabel: 'Bound lumber', category: 'refined', iconKey: 'resource.bound-lumber' },
} as const satisfies Record<string, ResourceCoreDefinition>;

export type ResourceId = keyof typeof RESOURCE_CORE_DEFS;
