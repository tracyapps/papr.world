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
} as const satisfies Record<string, ResourceCategoryDefinition>;

export type ResourceCategoryId = keyof typeof RESOURCE_CATEGORIES;
export const RESOURCE_CATEGORY_ORDER: ResourceCategoryId[] = ['sticks', 'stones', 'fiber', 'cardboard', 'soil', 'seeds'];

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
  'mossy-paper-fiber': { id: 'mossy-paper-fiber', label: 'Mossy paper fiber', shortLabel: 'Paper fiber', category: 'fiber', iconKey: 'resource.mossy-paper-fiber' },
  'confetti-stones': { id: 'confetti-stones', label: 'Confetti stones', shortLabel: 'Confetti stone', category: 'stones', iconKey: 'resource.confetti-stones' },
  'graphite-cardstone': { id: 'graphite-cardstone', label: 'Graphite cardstone', shortLabel: 'Cardstone', category: 'stones', iconKey: 'resource.graphite-cardstone' },
  'bluefold-pebbles': { id: 'bluefold-pebbles', label: 'Bluefold pebbles', shortLabel: 'Bluefolds', category: 'stones', iconKey: 'resource.bluefold-pebbles' },
  'sunbaked-cardboard': { id: 'sunbaked-cardboard', label: 'Sunbaked cardboard', shortLabel: 'Sunbaked card', category: 'cardboard', iconKey: 'resource.sunbaked-cardboard' },
  'ochre-paperclay': { id: 'ochre-paperclay', label: 'Ochre paperclay', shortLabel: 'Ochre clay', category: 'soil', iconKey: 'resource.ochre-paperclay' },
  'carbon-soil': { id: 'carbon-soil', label: 'Carbon soil', shortLabel: 'Carbon soil', category: 'soil', iconKey: 'resource.carbon-soil' },
  'carbon-copy-shale': { id: 'carbon-copy-shale', label: 'Carbon-copy shale', shortLabel: 'Copy shale', category: 'stones', iconKey: 'resource.carbon-copy-shale' },
  'buttonbloom-seeds': { id: 'buttonbloom-seeds', label: 'Buttonbloom seeds', shortLabel: 'Buttonbloom seeds', category: 'seeds', iconKey: 'resource.buttonbloom-seeds' },
  'mend-me-seeds': { id: 'mend-me-seeds', label: 'Mend-me seeds', shortLabel: 'Mend-me seeds', category: 'seeds', iconKey: 'resource.mend-me-seeds' },
} as const satisfies Record<string, ResourceCoreDefinition>;

export type ResourceId = keyof typeof RESOURCE_CORE_DEFS;
