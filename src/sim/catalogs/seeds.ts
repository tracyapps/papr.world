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

export const PLANT_STAGE_ORDER: PlantStage[] = ['seeded', 'sprout', 'bud', 'bloom'];

export const SEED_DEFS = {
  'buttonbloom-seeds': {
    id: 'buttonbloom-seeds',
    name: 'Buttonbloom Seeds',
    effect: 'garden',
    description: 'Folds into a cheerful button-shaped garden flower.',
    // Cumulative seconds to *enter* sprout, bud, and bloom. Tuned for a play
    // session, not a chore: a bloom in about two minutes of pottering.
    stageSeconds: [14, 45, 95],
    // Wants elbow room — leaves a visible gap between blooms.
    spacing: 0.85,
  },
  'mend-me-seeds': {
    id: 'mend-me-seeds',
    name: 'Mend-me Seeds',
    effect: 'mending',
    description: 'Stitches an empty paper-soil bed back into the surrounding sheet.',
    // Mending uses its own `mendsAt` timer and never blooms; these stages
    // only drive the little tuft's visual growth while it works.
    stageSeconds: [6, 16, 30],
    // Groundcover: meant to be sown edge to edge to close a patch of ground.
    spacing: 0.3,
  },
} as const satisfies Partial<Record<ResourceId, {
  id: ResourceId;
  name: string;
  effect: 'garden' | 'mending';
  description: string;
  stageSeconds: readonly [number, number, number];
  spacing: number;
}>>;

export type SeedId = keyof typeof SEED_DEFS;

/** Total seconds from sowing to full bloom. */
export function bloomSeconds(seedId: SeedId): number {
  return SEED_DEFS[seedId].stageSeconds[2];
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
