import { RESOURCE_CORE_DEFS, type ResourceId } from './resources';

/**
 * The renewable tree model.
 *
 * A tree is never destroyed and has no hit points. It carries a small amount
 * of **growth**; trimming spends it, time restores it. Nothing here knows
 * about Three.js, page meshes, or the renderer, so a future authoritative
 * server can run the identical model.
 *
 * The load-bearing decision is that growth is *derived*, exactly like plant
 * stages in `catalogs/seeds.ts`. We store the growth left at the moment of
 * the last cut and when that cut happened; everything since is arithmetic on
 * elapsed time. That means:
 *
 * - no per-tree timers, and no ticking for the thousands of trees on pages
 *   that are not loaded;
 * - a tree looks right the instant its page streams back in, including after
 *   the game has been closed — the catch-up the design doc asks for is not a
 *   special case, it is the only case;
 * - an untouched tree stores *nothing at all*, so a forest costs zero bytes
 *   in the save until someone actually cuts something.
 */

/** Growth of a tree nobody has touched. The scale is arbitrary; 100 reads. */
export const MAX_TREE_GROWTH = 100;

/**
 * Recovery rate, in growth per second.
 *
 * Tuned to the prototype end of the design doc's range: a tree cut to nothing
 * is fully back in five minutes, and crosses a stage boundary every ~75
 * seconds, so a player pottering nearby sees it visibly change more than once
 * without ever being made to wait on it.
 *
 * The later cozy target is 15–30 minutes. That is a one-line change here, and
 * deliberately not made yet: at prototype speeds you can actually watch the
 * whole cycle happen while play-testing.
 */
export const TREE_REGROWTH_PER_SECOND = MAX_TREE_GROWTH / 300;

export type TreeStage = 'flourishing' | 'trimmed' | 'cropped' | 'resting';

/**
 * Species groups, not drawings.
 *
 * There are sixteen `TreeKind` cutouts but only four things a tree can be as
 * far as growth and yield are concerned. Keying the model on the artwork
 * would mean every new drawing needed a yield entry, and would drag
 * renderer-side identities into the simulation.
 */
// vine, mushroom, and shrub are not trees, but use the same renewable
// snip-it-and-it-grows-back model (see SPECIES_FORM). Vines hang from the
// tall jungle canopy, and mushrooms and shrubs are undergrowth cutouts that
// joined the economy on 2026-09-18. Cacti and agaves joined 2026-09-28 (the
// dunes' own trimmable layer), and flowers are species-per-cutout so every
// blossom presses into petals of its own. Comments stay outside the union
// because tools/validate-quests.mjs reads it as text.
export type TreeSpecies =
  | 'pine' | 'leafy' | 'redwood' | 'palm' | 'banana'
  | 'cypress' | 'alpine-pine' | 'acacia' | 'baobab' | 'bamboo'
  | 'paddle-cactus' | 'barrel-cactus' | 'column-cactus' | 'agave'
  | 'vine' | 'mushroom' | 'moss' | 'shrub'
  | 'daisy' | 'cosmos' | 'sunflower' | 'coneflower' | 'marigold'
  | 'foxglove' | 'hibiscus' | 'anthurium' | 'bird-of-paradise' | 'plumeria'
  | 'protea' | 'spider-lily' | 'lotus' | 'allium' | 'lupine' | 'edelweiss'
  | 'paintbrush' | 'blackeyed-susan' | 'poppy' | 'zinnia' | 'bougainvillea'
  | 'flower';

/**
 * What kind of living thing a species is, for wording and for how a cut
 * looks. Trees lose outer branches; plants get a haircut all over; vines get
 * shorter from the bottom while staying hooked to the branch above.
 */
export type GrowthForm = 'tree' | 'plant' | 'vine';

export const SPECIES_FORM: Record<TreeSpecies, GrowthForm> = {
  pine: 'tree',
  leafy: 'tree',
  redwood: 'tree',
  palm: 'tree',
  banana: 'tree',
  cypress: 'tree',
  'alpine-pine': 'tree',
  acacia: 'tree',
  baobab: 'tree',
  bamboo: 'plant',
  'paddle-cactus': 'plant',
  'barrel-cactus': 'plant',
  'column-cactus': 'plant',
  agave: 'plant',
  vine: 'vine',
  mushroom: 'plant',
  moss: 'plant',
  shrub: 'plant',
  daisy: 'plant',
  cosmos: 'plant',
  sunflower: 'plant',
  coneflower: 'plant',
  marigold: 'plant',
  foxglove: 'plant',
  hibiscus: 'plant',
  anthurium: 'plant',
  'bird-of-paradise': 'plant',
  plumeria: 'plant',
  protea: 'plant',
  'spider-lily': 'plant',
  lotus: 'plant',
  allium: 'plant',
  lupine: 'plant',
  edelweiss: 'plant',
  paintbrush: 'plant',
  'blackeyed-susan': 'plant',
  poppy: 'plant',
  zinnia: 'plant',
  bougainvillea: 'plant',
  // Legacy: flower cutouts are species-per-kind now, but old saves recorded
  // cuts under the shared 'flower' species and its tables stay resolvable.
  flower: 'plant',
};

/** How a species is named in toasts, quests, and critter tips. */
export const SPECIES_NAMES: Record<TreeSpecies, { one: string; many: string }> = {
  pine: { one: 'pine tree', many: 'pine trees' },
  leafy: { one: 'leafy tree', many: 'leafy trees' },
  redwood: { one: 'redwood', many: 'redwoods' },
  palm: { one: 'palm tree', many: 'palm trees' },
  banana: { one: 'banana tree', many: 'banana trees' },
  cypress: { one: 'cypress tree', many: 'cypress trees' },
  'alpine-pine': { one: 'alpine pine', many: 'alpine pines' },
  acacia: { one: 'acacia tree', many: 'acacia trees' },
  baobab: { one: 'baobab', many: 'baobabs' },
  bamboo: { one: 'bamboo cluster', many: 'bamboo clusters' },
  'paddle-cactus': { one: 'paddle cactus', many: 'paddle cacti' },
  'barrel-cactus': { one: 'barrel cactus', many: 'barrel cacti' },
  'column-cactus': { one: 'column cactus', many: 'column cacti' },
  agave: { one: 'agave', many: 'agaves' },
  vine: { one: 'hanging vine', many: 'hanging vines' },
  mushroom: { one: 'mushroom cluster', many: 'mushroom clusters' },
  moss: { one: 'moss patch', many: 'moss patches' },
  shrub: { one: 'shrub', many: 'shrubs' },
  daisy: { one: 'daisy', many: 'daisies' },
  cosmos: { one: 'cosmos', many: 'cosmos' },
  sunflower: { one: 'sunflower', many: 'sunflowers' },
  coneflower: { one: 'coneflower', many: 'coneflowers' },
  marigold: { one: 'marigold', many: 'marigolds' },
  foxglove: { one: 'foxglove', many: 'foxgloves' },
  hibiscus: { one: 'hibiscus', many: 'hibiscus' },
  anthurium: { one: 'anthurium', many: 'anthuriums' },
  'bird-of-paradise': { one: 'bird-of-paradise', many: "birds-of-paradise" },
  plumeria: { one: 'plumeria', many: 'plumeria' },
  protea: { one: 'protea', many: 'proteas' },
  'spider-lily': { one: 'spider lily', many: 'spider lilies' },
  lotus: { one: 'wild lotus', many: 'wild lotuses' },
  allium: { one: 'allium', many: 'alliums' },
  lupine: { one: 'lupine', many: 'lupines' },
  edelweiss: { one: 'edelweiss', many: 'edelweiss' },
  paintbrush: { one: 'paintbrush', many: 'paintbrushes' },
  'blackeyed-susan': { one: 'black-eyed susan', many: 'black-eyed susans' },
  poppy: { one: 'poppy', many: 'poppies' },
  zinnia: { one: 'zinnia', many: 'zinnias' },
  bougainvillea: { one: 'bougainvillea', many: 'bougainvillea' },
  flower: { one: 'flower', many: 'flowers' },
};

/** Where a trimmable tree lives, in terms a server could validate. */
export type TreeAddress = {
  pageId: string;
  /** Stable per-page id, derived from the tree's generated position. */
  treeKey: string;
  species: TreeSpecies;
};

/**
 * What persists per trimmed tree. Absent means "untouched and flourishing".
 */
export type TreeGrowthState = {
  /** Growth left at the moment of the last cut, 0..MAX_TREE_GROWTH. */
  growth: number;
  /** When that cut happened. Recovery since is derived, never ticked. */
  trimmedAt: number;
  /** Cuts so far. Seeds the deterministic yield roll. */
  trims: number;
  /**
   * What kind of tree this was, recorded on the first cut.
   *
   * Optional because saves written before this field existed have no species
   * on their tree records. New cuts always write it. A quest that asks for a
   * *particular* species can therefore only be satisfied by a trim made since,
   * which is the honest answer: an old cut cannot be reinterpreted as a
   * species it never recorded.
   */
  species?: TreeSpecies;
};

/** Lower bound of each stage, richest first. */
const STAGE_THRESHOLDS: Array<[TreeStage, number]> = [
  ['flourishing', 75],
  ['trimmed', 40],
  ['cropped', 1],
  ['resting', 0],
];

export function treeStageFor(growth: number): TreeStage {
  return STAGE_THRESHOLDS.find(([, floor]) => growth >= floor)?.[0] ?? 'resting';
}

/**
 * Growth right now, recovered from the last cut.
 *
 * Pure and time-based: callers can ask about a tree that is not loaded, not
 * visible, or on a page that has never been built.
 */
export function treeGrowthAt(record: TreeGrowthState | undefined, now: number): number {
  if (!record) return MAX_TREE_GROWTH;
  const seconds = Math.max(0, (now - record.trimmedAt) / 1000);
  return Math.min(MAX_TREE_GROWTH, record.growth + seconds * TREE_REGROWTH_PER_SECOND);
}

/** Convenience: the stage a stored record is showing at `now`. */
export function treeStageAt(record: TreeGrowthState | undefined, now: number): TreeStage {
  return treeStageFor(treeGrowthAt(record, now));
}

/** 0..1 across the current stage's band, for smooth visual recovery. */
export function treeStageProgress(record: TreeGrowthState | undefined, now: number): number {
  const growth = treeGrowthAt(record, now);
  const stage = treeStageFor(growth);
  const bands: Record<TreeStage, [number, number]> = {
    flourishing: [75, MAX_TREE_GROWTH],
    trimmed: [40, 75],
    cropped: [1, 40],
    resting: [0, 1],
  };
  const [from, to] = bands[stage];
  return Math.max(0, Math.min(1, (growth - from) / Math.max(1e-6, to - from)));
}

export type TrimProfile = {
  /** Growth one cut consumes. */
  cost: number;
  /** Pieces a cut yields from a flourishing tree. */
  pieces: number;
  /**
   * Smallest species this tool can work.
   *
   * Kids scissors are described as snipping shoots and soft new growth;
   * a redwood's bark curls and structural branches want the heavier shears.
   * This is the progression gate that gives Tier 2 scissors a reason to
   * exist beyond "more of the same".
   */
  handlesRedwood: boolean;
};

const TRIM_PROFILES: Record<number, TrimProfile> = {
  1: { cost: 22, pieces: 2, handlesRedwood: false },
  2: { cost: 34, pieces: 4, handlesRedwood: true },
  3: { cost: 34, pieces: 6, handlesRedwood: true },
};

export function trimProfileForTier(tier: number): TrimProfile {
  return TRIM_PROFILES[tier] ?? TRIM_PROFILES[1];
}

/** How much of a flourishing tree's yield each stage still gives. */
const STAGE_YIELD: Record<TreeStage, number> = {
  flourishing: 1,
  trimmed: 0.7,
  cropped: 0.35,
  resting: 0,
};

/** Exported so `catalogs/obtaining.ts` can answer which tree gives what. */
export const SPECIES_YIELD: Record<TreeSpecies, {
  primary: ResourceId;
  secondary: ResourceId;
  /** The occasional better find, only from a flourishing tree. */
  variety: ResourceId;
}> = {
  pine: {
    primary: 'kraft-twigs',
    secondary: 'mossy-paper-fiber',
    variety: 'ribbonwood-sticks',
  },
  leafy: {
    // The generic broadleaf used to press mossy-paper-fiber as its primary,
    // which left the plain tree with nothing of its own — and left moss
    // sharing its signature material with a tree. Leafy clippings give the
    // common tree its own identity while the fiber stays on as a secondary.
    primary: 'leafy-clippings',
    secondary: 'mossy-paper-fiber',
    variety: 'ribbonwood-sticks',
  },
  redwood: {
    // Bark curls exist nowhere else in the world — not as a loose pile, not
    // from a dig. A redwood and a pair of sturdy scissors is the only way to
    // get them, which is the point.
    primary: 'redwood-bark-curls',
    secondary: 'ribbonwood-sticks',
    variety: 'sunbaked-cardboard',
  },
  palm: {
    // The only tree that grows where nothing else woody does, so both of its
    // own materials are exclusive to it in the same way bark curls are to a
    // redwood — you cannot pick palm clippings up off the ground anywhere.
    // The variety find is the dunes' own board rather than a fourth new
    // material: a flourishing palm sheds fronds that dry flat in the sun.
    primary: 'palm-clippings',
    secondary: 'palm-fiber',
    variety: 'sunbaked-cardboard',
  },
  banana: {
    // A banana "trunk" is a roll of leaf sheaths, so its trimmings read as
    // clippings and fiber rather than timber. They used to run on the palm
    // material pair, which left the tropics' most common tree with nothing
    // of its own; banana leaf clippings are the sheaths' own material, with
    // palm fiber staying on as the secondary. A wild fruit drop is
    // deliberately not modeled yet: food still comes only from plants a
    // player grew, and the first wild source deserves its own slice.
    primary: 'banana-leaf-clippings',
    secondary: 'palm-fiber',
    variety: 'sunbaked-cardboard',
  },
  cypress: {
    primary: 'cypress-bark-folds',
    secondary: 'mossy-paper-fiber',
    variety: 'supple-shrub-shoots',
  },
  'alpine-pine': {
    primary: 'alpine-resin-paper',
    secondary: 'kraft-twigs',
    variety: 'granite-cardstone',
  },
  acacia: {
    primary: 'acacia-thornwood',
    secondary: 'supple-shrub-shoots',
    variety: 'savanna-hardpan',
  },
  baobab: {
    primary: 'baobab-pith-fiber',
    secondary: 'acacia-thornwood',
    variety: 'savanna-hardpan',
  },
  bamboo: {
    primary: 'bamboo-strips',
    secondary: 'mossy-paper-fiber',
    variety: 'bamboo-loam',
  },
  vine: {
    // The jungle's own material: long twisted strands, like crepe-paper
    // streamers, that only come off a vine hanging from the canopy. Nothing
    // crepe lies loose anywhere, so it is tropical-exclusive by construction
    // (`SPECIES_BIOMES.vine` is the only biome list that names it).
    primary: 'crepe-vine',
    secondary: 'mossy-paper-fiber',
    variety: 'palm-fiber',
  },
  mushroom: {
    // Soft, spongy caps — blotting paper, which drinks up the damp. Forest
    // floors and the jungle both grow them.
    primary: 'blotting-caps',
    secondary: 'mossy-paper-fiber',
    variety: 'blotting-caps',
  },
  moss: {
    primary: 'mossy-paper-fiber',
    secondary: 'bog-peat-paper',
    variety: 'blotting-caps',
  },
  shrub: {
    // A bush is a small tree as far as the paper is concerned: twigs and
    // leaves, and now and then a springy ribbonwood shoot.
    primary: 'supple-shrub-shoots',
    secondary: 'mossy-paper-fiber',
    variety: 'ribbonwood-sticks',
  },
  // The three cactus species split the eight dunes drawings by shape (paddle
  // pads, blooming barrels, saguaro columns; see `trimmableDecor.ts`). Each
  // presses its own clippings — desert wood with the species in it — and all
  // three share cactus fiber as the secondary, the way the shrubs share
  // mossy fiber. A flourishing one sometimes gives up a pebble or a piece of
  // sunbaked board caught between its pads.
  'paddle-cactus': {
    primary: 'paddle-cactus-clippings',
    secondary: 'cactus-fiber',
    variety: 'sunbaked-cardboard',
  },
  'barrel-cactus': {
    primary: 'barrel-cactus-clippings',
    secondary: 'cactus-fiber',
    variety: 'terracotta-pebbles',
  },
  'column-cactus': {
    primary: 'column-cactus-clippings',
    secondary: 'cactus-fiber',
    variety: 'sunbaked-cardboard',
  },
  agave: {
    // A rosette of stiff blades, and the dunes' own long fiber — the desert
    // answer to marsh grass. Secondaries overlap the shrubs on purpose; the
    // fiber itself comes off nothing else.
    primary: 'agave-fiber',
    secondary: 'mossy-paper-fiber',
    variety: 'sunbaked-cardboard',
  },
  // One species per flower cutout, one pressed-petal material each. The
  // secondaries and the seed variety overlap across all of them — the petals
  // are what make a marigold a marigold. `flower` below is the legacy shared
  // species, kept resolvable for saves recorded before the split.
  daisy: { primary: 'daisy-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  cosmos: { primary: 'cosmos-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  sunflower: { primary: 'sunflower-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  coneflower: { primary: 'coneflower-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  marigold: { primary: 'marigold-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  foxglove: { primary: 'foxglove-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  hibiscus: { primary: 'hibiscus-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  anthurium: { primary: 'anthurium-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  'bird-of-paradise': { primary: 'bird-of-paradise-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  plumeria: { primary: 'plumeria-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  protea: { primary: 'protea-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  'spider-lily': { primary: 'spider-lily-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  lotus: { primary: 'lotus-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  allium: { primary: 'allium-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  lupine: { primary: 'lupine-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  edelweiss: { primary: 'edelweiss-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  paintbrush: { primary: 'paintbrush-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  'blackeyed-susan': { primary: 'blackeyed-susan-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  poppy: { primary: 'poppy-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  zinnia: { primary: 'zinnia-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  bougainvillea: { primary: 'bougainvillea-petals', secondary: 'mossy-paper-fiber', variety: 'buttonbloom-seeds' },
  flower: {
    primary: 'pressed-petal-confetti',
    secondary: 'mossy-paper-fiber',
    variety: 'buttonbloom-seeds',
  },
};

/**
 * Stable pseudo-random roll.
 *
 * The same FNV-1a walk used for seed-drop timing, and for the same reason:
 * a trim's contents must not change between a save and a reload, and two
 * clients must agree on them without exchanging anything but the cut count.
 */
function hashTrim(treeKey: string, trims: number, tier: number): number {
  let hash = 2166136261;
  const value = `${treeKey}:${trims}:${tier}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export type TrimYield = Array<{ resource: ResourceId; quantity: number }>;

/**
 * What one cut hands over.
 *
 * Deterministic in `treeKey` and the tree's cut count, so it can be replayed
 * or validated. Never empty for a tree that was allowed to be cut at all —
 * a refused cut is decided before this is called.
 */
export function resolveTrimYield(options: {
  treeKey: string;
  species: TreeSpecies;
  tier: number;
  stage: TreeStage;
  trims: number;
}): TrimYield {
  const { treeKey, species, tier, stage, trims } = options;
  if (stage === 'resting') return [];

  const profile = trimProfileForTier(tier);
  const total = Math.max(1, Math.round(profile.pieces * STAGE_YIELD[stage]));
  const table = SPECIES_YIELD[species];
  const roll = hashTrim(treeKey, trims, tier);

  // Most cuts are all of one thing; a good minority mix in a second material,
  // which is what stops a stand of one species from being a single-resource
  // vending machine.
  const secondary = total > 1 && roll % 100 < 45 ? 1 : 0;
  const yields: TrimYield = [{ resource: table.primary, quantity: total - secondary }];
  if (secondary > 0) yields.push({ resource: table.secondary, quantity: secondary });
  if (stage === 'flourishing' && (roll >>> 11) % 100 < 22) {
    yields.push({ resource: table.variety, quantity: 1 });
  }
  return yields;
}

/** Human-readable summary of a yield, for toasts. */
export function describeTrimYield(yields: TrimYield): string {
  return yields
    .map((entry) => `${entry.quantity} ${RESOURCE_CORE_DEFS[entry.resource].shortLabel}`)
    .join(' and ');
}

/** What the tree does in response, said kindly. */
export const TRIM_STAGE_RESPONSES: Record<TreeStage, string> = {
  flourishing: 'The canopy springs back where you cut.',
  trimmed: 'A few outer branches tuck away neatly.',
  cropped: 'Small new buds are already showing along the cut.',
  resting: 'This one is resting — give it a little while to put out new growth.',
};

const FORM_STAGE_RESPONSES: Record<GrowthForm, Record<TreeStage, string>> = {
  tree: TRIM_STAGE_RESPONSES,
  plant: {
    flourishing: 'It fluffs right back up where you snipped.',
    trimmed: 'It looks neater — a tidy little haircut.',
    cropped: 'Fresh new growth is already curling up from the middle.',
    resting: 'This one is resting — give it a little while to fill back in.',
  },
  vine: {
    flourishing: 'The vine sways and hardly seems shorter.',
    trimmed: 'The vine swings up a little shorter, still hooked on tight.',
    cropped: 'A new green tip is already reaching down again.',
    resting: 'This vine is resting — give it a little while to grow back down.',
  },
};

/** The kind reply for one species at one stage. */
export function trimStageResponse(species: TreeSpecies, stage: TreeStage): string {
  return FORM_STAGE_RESPONSES[SPECIES_FORM[species]][stage];
}
