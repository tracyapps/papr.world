import type * as THREE from 'three';
import { groundedCutoutY } from '../render/builders';
import { treeStageProgress, type TreeGrowthState, type TreeSpecies, type TreeStage } from '../sim/catalogs/trees';
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
const STAGE_SCALE: Record<TreeStage, { height: number; width: number }> = {
  flourishing: { height: 1, width: 1 },
  trimmed: { height: 0.96, width: 0.9 },
  cropped: { height: 0.91, width: 0.78 },
  resting: { height: 0.87, width: 0.68 },
};

/** Share of the height reduction a redwood actually takes. */
const REDWOOD_HEIGHT_DAMPING = 0.25;

export function treeSpeciesOf(kind: TreeKind): TreeSpecies {
  if (kind.startsWith('redwood')) return 'redwood';
  if (kind.startsWith('pine')) return 'pine';
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
}) {
  const { mesh, stage, species, record, height, baseY, now } = options;
  const from = STAGE_SCALE[stage];
  const to = STAGE_SCALE[nextStageUp(stage)];
  const progress = treeStageProgress(record, now);

  const width = from.width + (to.width - from.width) * progress;
  const rawHeight = from.height + (to.height - from.height) * progress;
  const heightScale = species === 'redwood'
    ? 1 - (1 - rawHeight) * REDWOOD_HEIGHT_DAMPING
    : rawHeight;

  mesh.scale.set(width, heightScale, 1);
  mesh.position.y = groundedCutoutY(baseY, height) - (height * (1 - heightScale)) / 2;
}

/** The stage a tree grows into next. Flourishing is the top; it stays. */
function nextStageUp(stage: TreeStage): TreeStage {
  if (stage === 'resting') return 'cropped';
  if (stage === 'cropped') return 'trimmed';
  if (stage === 'trimmed') return 'flourishing';
  return 'flourishing';
}
