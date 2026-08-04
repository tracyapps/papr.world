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
 * There are twelve `TreeKind` cutouts but only three things a tree can be as
 * far as growth and yield are concerned. Keying the model on the artwork
 * would mean every new drawing needed a yield entry, and would drag
 * renderer-side identities into the simulation.
 */
export type TreeSpecies = 'pine' | 'leafy' | 'redwood';

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
    primary: 'mossy-paper-fiber',
    secondary: 'kraft-twigs',
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
