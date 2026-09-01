import type { ResourceId } from './resources';

/**
 * `spacing` is the radius of ground this plant needs to itself, in world
 * units. Planting is refused when two plants' spacing circles overlap.
 *
 * This exists so gardening has a natural shape rather than a uniform grid.
 * A plant that spreads wants room; a groundcover should tuck into a tight
 * row. Because the dig lattice is 0.5 units, a spacing under ~0.5 means
 * "plantable in every adjacent dug cell", and larger values force gaps.
 *
 * Tuning note: spacing is checked against the *larger* of the two plants'
 * values, so a sprawling plant keeps its distance from tidy ones too.
 */
/**
 * Growth stages a garden plant passes through.
 *
 * Stage is *derived* from elapsed time since `plantedAt` rather than stored.
 * That keeps saves small, survives a page streaming out and back, and means
 * a future server and client agree on stage without syncing anything beyond
 * the plant time — the same reason critter spawns are seeded rather than
 * replicated.
 */
export type PlantStage = 'seeded' | 'sprout' | 'bud' | 'bloom';

/**
 * The silhouette a garden plant grows into. `plantRuntime.ts` keeps one
 * builder per family, and the bloom stage is where each family diverges — the
 * earlier stages (mound, sprout, swelling bud) read the same for everything.
 *
 * `mending` is not a plant shape at all: it is the groundcover that stitches
 * a bed back into the sheet, and it never blooms.
 */
export type PlantVisualFamily = 'flower' | 'bush' | 'row' | 'stalk' | 'head' | 'vine' | 'mending';

export const PLANT_STAGE_ORDER: PlantStage[] = ['seeded', 'sprout', 'bud', 'bloom'];

export const SEED_DEFS = {
  'buttonbloom-seeds': {
    id: 'buttonbloom-seeds',
    name: 'Buttonbloom Seeds',
    effect: 'garden',
    description: 'Folds into a cheerful button-shaped garden flower.',
    // Cumulative seconds to *enter* sprout, bud, and bloom. Tuned so this
    // starter flower matures during a play session without being immediate.
    stageSeconds: [45, 150, 300],
    // Wants elbow room — leaves a visible gap between blooms.
    spacing: 0.85,
    visual: 'flower',
    harvest: { resource: 'buttonbloom-seeds', quantity: 1, mode: 'repeat', repeatSeconds: 300 },
  },
  'raspberry-bush-seeds': {
    id: 'raspberry-bush-seeds',
    name: 'Raspberry Bush Seeds',
    effect: 'garden',
    description: 'Grows into a leafy bush strung with paper raspberries.',
    stageSeconds: [90, 420, 1200],
    spacing: 0.9,
    visual: 'bush',
    accent: '#c73e52',
    harvest: { resource: 'raspberries', quantity: 3, mode: 'repeat', repeatSeconds: 600 },
  },
  'crinkle-carrot-seeds': {
    id: 'crinkle-carrot-seeds',
    name: 'Crinkle-carrot Seeds',
    effect: 'garden',
    description: 'Rows of frilly green tops over hidden orange paper roots.',
    stageSeconds: [60, 240, 720],
    spacing: 0.55,
    visual: 'row',
    accent: '#e07b3a',
    harvest: { resource: 'crinkle-carrots', quantity: 3, mode: 'whole' },
  },
  'ribbon-corn-seeds': {
    id: 'ribbon-corn-seeds',
    name: 'Ribbon-corn Seeds',
    effect: 'garden',
    description: 'Tall stalks that unfurl into golden ribbon cobs.',
    stageSeconds: [120, 600, 1800],
    spacing: 0.95,
    visual: 'stalk',
    accent: '#e3bd45',
    harvest: { resource: 'ribbon-corn', quantity: 3, mode: 'whole' },
  },
  'folded-cabbage-seeds': {
    id: 'folded-cabbage-seeds',
    name: 'Folded-cabbage Seeds',
    effect: 'garden',
    description: 'Tight ruffled heads of pale green folded paper.',
    stageSeconds: [90, 360, 1080],
    spacing: 0.8,
    visual: 'head',
    accent: '#7fa06a',
    harvest: { resource: 'folded-cabbage', quantity: 2, mode: 'whole' },
  },
  'paper-tomato-seeds': {
    id: 'paper-tomato-seeds',
    name: 'Paper-tomato Seeds',
    effect: 'garden',
    description: 'A bushy vine strung with ripe red paper fruit.',
    stageSeconds: [90, 480, 1500],
    spacing: 0.85,
    visual: 'vine',
    accent: '#d14a35',
    harvest: { resource: 'paper-tomato', quantity: 4, mode: 'repeat', repeatSeconds: 720 },
  },
  'mend-me-seeds': {
    id: 'mend-me-seeds',
    name: 'Mend-me Seeds',
    effect: 'mending',
    description: 'Stitches an empty paper-soil bed back into the surrounding sheet.',
    // Mending uses its own `mendsAt` timer and never blooms; these stages
    // only drive the little tuft's visual growth while it works.
    stageSeconds: [30, 100, 240],
    // Groundcover: meant to be sown edge to edge to close a patch of ground.
    spacing: 0.3,
    visual: 'mending',
  },
} as const satisfies Partial<Record<ResourceId, {
  id: ResourceId;
  name: string;
  effect: 'garden' | 'mending';
  description: string;
  stageSeconds: readonly [number, number, number];
  spacing: number;
  visual: PlantVisualFamily;
  /** The accent colour the plant's bloom and produce use, where it has one. */
  accent?: string;
  /**
   * What a blooming plant leaves on the ground to be picked up. A garden
   * flower drops its own seed to keep the loop going; a food plant drops its
   * fruit instead, so finding new seeds stays the interesting part.
   */
  harvest?: {
    resource: ResourceId;
    quantity: number;
    mode: 'repeat' | 'whole';
    /** Seconds until another harvest on plants that keep producing. */
    repeatSeconds?: number;
  };
  /**
   * How long picking a ready harvest takes by hand, in seconds.
   *
   * Optional and unset for every seed today, which falls back to
   * `DEFAULT_HARVEST_SECONDS` — the original flat duration every plant used
   * before this field existed. The seam exists for later, bigger crops that
   * should take real effort to bring in by hand, and for a future farming-tech
   * node to shorten (never remove — see `docs/roadmap.md` Phase 3/knowledge
   * tree "farming-equipment-automation").
   */
  harvestSeconds?: number;
}>>;

export type SeedId = keyof typeof SEED_DEFS;

/** Flat harvest time every plant used before `harvestSeconds` existed. */
export const DEFAULT_HARVEST_SECONDS = 1.35;

/** Seeds currently carried, in the stable order used by every picker. */
export function carriedSeedIds(
  inventory: Readonly<Partial<Record<ResourceId, number>>>,
): SeedId[] {
  return (Object.keys(SEED_DEFS) as SeedId[])
    .filter((seedId) => (inventory[seedId] ?? 0) > 0);
}

/**
 * Keep a preferred packet selected while it has seeds, otherwise advance to
 * the next carried packet and wrap once. This is shared by planting and shop
 * sales so the hoe strip can never highlight an empty packet.
 */
export function availableSeedSelection(
  preferred: SeedId | null,
  inventory: Readonly<Partial<Record<ResourceId, number>>>,
): SeedId | null {
  if (preferred && (inventory[preferred] ?? 0) > 0) return preferred;
  const order = Object.keys(SEED_DEFS) as SeedId[];
  const start = preferred ? order.indexOf(preferred) : -1;
  for (let offset = 1; offset <= order.length; offset += 1) {
    const candidate = order[(start + offset) % order.length];
    if ((inventory[candidate] ?? 0) > 0) return candidate;
  }
  return null;
}

/** Total seconds from sowing to full bloom. */
export function bloomSeconds(seedId: SeedId): number {
  return SEED_DEFS[seedId].stageSeconds[2];
}

/** Short shelf/selector copy for authored growth times. */
export function formatGrowthTime(seedId: SeedId): string {
  const seconds = bloomSeconds(seedId);
  if (seconds < 60) return `about ${seconds} sec`;
  const minutes = Math.round(seconds / 60);
  return `about ${minutes} min`;
}

/** What a blooming plant drops to be picked up, or null when it drops nothing. */
export function plantProduce(seedId: SeedId): ResourceId | null {
  const def = SEED_DEFS[seedId];
  return 'harvest' in def ? def.harvest?.resource ?? null : null;
}

/** Complete harvest rule for a mature plant, or null for mending groundcover. */
export function plantHarvest(seedId: SeedId): {
  resource: ResourceId;
  quantity: number;
  mode: 'repeat' | 'whole';
  repeatSeconds?: number;
} | null {
  const def = SEED_DEFS[seedId];
  return 'harvest' in def ? def.harvest ?? null : null;
}

/** How long picking this plant's ready harvest takes by hand, in milliseconds. */
export function plantHarvestDurationMs(seedId: SeedId): number {
  const def = SEED_DEFS[seedId] as { harvestSeconds?: number };
  return (def.harvestSeconds ?? DEFAULT_HARVEST_SECONDS) * 1000;
}

/**
 * Which stage a plant sown at `plantedAt` is in right now.
 *
 * Pure and time-based, so callers can ask for a stage at any moment without
 * the plant having to be loaded, ticked, or visible.
 */
export function plantStageAt(seedId: SeedId, plantedAt: number, now: number): PlantStage {
  const elapsed = Math.max(0, (now - plantedAt) / 1000);
  const [sprout, bud, bloom] = SEED_DEFS[seedId].stageSeconds;
  if (elapsed >= bloom) return 'bloom';
  if (elapsed >= bud) return 'bud';
  if (elapsed >= sprout) return 'sprout';
  return 'seeded';
}

/** 0..1 progress toward the next stage, for smooth visual growth. */
export function plantStageProgress(seedId: SeedId, plantedAt: number, now: number): number {
  const elapsed = Math.max(0, (now - plantedAt) / 1000);
  const [sprout, bud, bloom] = SEED_DEFS[seedId].stageSeconds;
  if (elapsed >= bloom) return 1;
  const [from, to] = elapsed >= bud ? [bud, bloom] : elapsed >= sprout ? [sprout, bud] : [0, sprout];
  return Math.max(0, Math.min(1, (elapsed - from) / Math.max(1e-6, to - from)));
}
