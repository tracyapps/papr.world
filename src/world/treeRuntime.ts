import type * as THREE from 'three';
import { groundedCutoutY } from '../render/builders';
import { SPECIES_FORM, treeStageProgress, type GrowthForm, type TreeGrowthState, type TreeSpecies, type TreeStage } from '../sim/catalogs/trees';
import type { TreeKind } from './types';

/**
 * How a tree *looks* at each growth stage.
 *
 * Trees are single alpha-cut billboards, so there is no canopy layer to hide
 * yet. The prototype answer the design doc allows is to take the cutout in
 * from its ground pivot — but only carefully, and not equally in both axes.
 *
 * Width does most of the work. A tree that has been cut should read as
 * *narrower* — outer branches tucked away — rather than shorter, because a
 * shrinking trunk is the thing that makes a paper tree look like rubber.
 * That is doubly true of redwoods, which are up to 30 units tall; a 14%
 * height loss on one of those is nearly three units of trunk vanishing, and
 * `REDWOOD_HEIGHT_DAMPING` keeps almost all of it.
 *
 * When trees gain separate canopy geometry this whole table should be
 * replaced by swapping canopy layers, as the doc describes. The seam is
 * `applyTreeStageVisual` — nothing outside this file knows how the look is
 * achieved.
 */
const STAGE_SCALE: Record<GrowthForm, Record<TreeStage, { height: number; width: number }>> = {
  tree: {
    flourishing: { height: 1, width: 1 },
    trimmed: { height: 0.96, width: 0.9 },
    cropped: { height: 0.91, width: 0.78 },
    resting: { height: 0.87, width: 0.68 },
  },
  // A mushroom or a bush has no trunk to protect, so a snip reads as a
  // haircut all over — shorter and narrower together, but never so small it
  // stops reading as the same plant.
  plant: {
    flourishing: { height: 1, width: 1 },
    trimmed: { height: 0.9, width: 0.9 },
    cropped: { height: 0.8, width: 0.8 },
    resting: { height: 0.7, width: 0.72 },
  },
  // A vine is cut from the bottom: it gets visibly *shorter* while its top
  // stays hooked on the branch (see `hangTopY` below), and barely narrower.
  vine: {
    flourishing: { height: 1, width: 1 },
    trimmed: { height: 0.78, width: 0.96 },
    cropped: { height: 0.58, width: 0.92 },
    resting: { height: 0.42, width: 0.88 },
  },
};



/** Share of the height reduction a redwood actually takes. */
const REDWOOD_HEIGHT_DAMPING = 0.25;

export function treeSpeciesOf(kind: TreeKind): TreeSpecies {
  if (kind.startsWith('redwood')) return 'redwood';
  if (kind.startsWith('pine')) return 'pine';
  if (kind.startsWith('palm')) return 'palm';
  // `banana-1` today; the broadleaf jungle trees fall through to `leafy`,
  // which is what they are — big leafy canopies over the same yields.
  if (kind.startsWith('banana')) return 'banana';
  return 'leafy';
}

/**
 * Pose an already-built tree cutout for its stage, keeping its foot planted.
 *
 * The mesh is a plane centred at `groundedCutoutY(baseY, height)`, so scaling
 * about its own centre would lift the trunk clear of the ground by half the
 * loss. The position is corrected by exactly that much, which is why a
 * trimmed tree settles rather than hovering.
 *
 * Growth inside a stage is blended toward the next one, so recovery is a
 * slow swell rather than four visible pops.
 */
export function applyTreeStageVisual(options: {
  mesh: THREE.Mesh;
  stage: TreeStage;
  species: TreeSpecies;
  record: TreeGrowthState | undefined;
  height: number;
  baseY: number;
  now: number;
  /**
   * For hanging things: the world Y the top edge is hooked to. When set, the
   * cutout shrinks upward toward it instead of settling onto the ground.
   */
  hangTopY?: number;
}) {
  const { mesh, stage, species, record, height, baseY, now, hangTopY } = options;
  const table = STAGE_SCALE[SPECIES_FORM[species]];
  const from = table[stage];
  const to = table[nextStageUp(stage)];
  const progress = treeStageProgress(record, now);

  const width = from.width + (to.width - from.width) * progress;
  const rawHeight = from.height + (to.height - from.height) * progress;
  const heightScale = species === 'redwood'
    ? 1 - (1 - rawHeight) * REDWOOD_HEIGHT_DAMPING
    : rawHeight;

  mesh.scale.set(width, heightScale, 1);
  mesh.position.y = hangTopY !== undefined
    ? hangTopY - (height * heightScale) / 2
    : groundedCutoutY(baseY, height) - (height * (1 - heightScale)) / 2;
}

/** The stage a tree grows into next. Flourishing is the top; it stays. */
function nextStageUp(stage: TreeStage): TreeStage {
  if (stage === 'resting') return 'cropped';
  if (stage === 'cropped') return 'trimmed';
  if (stage === 'trimmed') return 'flourishing';
  return 'flourishing';
}
