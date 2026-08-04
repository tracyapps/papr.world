import * as THREE from 'three';
import { camera } from '../render/context';
import { TOOL_DEFS } from '../sim/catalogs/tools';
import { dispatchGameCommand } from '../sim/commands';
import { getGameState, onGameStateChanged } from '../sim/state';
import { TERRAIN_CELL_RADIUS, terrainCellAt } from '../sim/terrainCells';
import { findDigFootprintBlocker } from '../world/footprints';
import { refreshBuiltTerrainNear } from '../world/streaming';
import { pageId, pageOfPosition } from '../world/types';
import { sampleTerrainHeight } from '../world/terrain';
import { avatar } from './avatar';
import { playCozySound } from './cozyAudio';
import { getCritterNearGroundPoint } from './critters';
import { showPetToast } from './petting';
import { resolveDigDiscovery } from '../sim/catalogs/geology';
import { getPage } from '../world/pages';
import { sampleBaseTerrainHeight } from '../world/terrain';
import { showResourceGain } from './harvesting';
import { SEED_DEFS } from '../sim/catalogs/seeds';
import { getActionMode, onActionModeChanged } from './actionMode';

const TOOL_REACH = 3.1;
const MAX_RAY_DISTANCE = 55;
const RAY_STEP = 0.35;
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const rayPoint = new THREE.Vector3();
const equippedToolChip = document.querySelector<HTMLElement>('#equipped-tool-chip');

function equippedDigTool() {
  const state = getGameState();
  const toolId = state.player.equippedTool;
  if (!toolId || (state.player.tools[toolId] ?? 0) <= 0) return null;
  const tool = TOOL_DEFS[toolId];
  return tool.verb === 'dig' ? tool : null;
}

/** Intersect a camera ray with the same analytic height field used by movement.
 * This keeps picking correct after terrain cells change, without depending on
 * the resolution or lifecycle of visible page meshes. */
export function pickTerrainAtScreen(clientX: number, clientY: number): THREE.Vector3 | null {
  ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const ray = raycaster.ray;
  let previousT = 0;
  let previousGap = ray.origin.y - sampleTerrainHeight(ray.origin.x, ray.origin.z);
  for (let t = RAY_STEP; t <= MAX_RAY_DISTANCE; t += RAY_STEP) {
    ray.at(t, rayPoint);
    const gap = rayPoint.y - sampleTerrainHeight(rayPoint.x, rayPoint.z);
    if (previousGap > 0 && gap <= 0) {
      let low = previousT;
      let high = t;
      for (let iteration = 0; iteration < 9; iteration += 1) {
        const middle = (low + high) / 2;
        ray.at(middle, rayPoint);
        const middleGap = rayPoint.y - sampleTerrainHeight(rayPoint.x, rayPoint.z);
        if (middleGap > 0) low = middle;
        else high = middle;
      }
      ray.at((low + high) / 2, rayPoint);
      rayPoint.y = sampleTerrainHeight(rayPoint.x, rayPoint.z);
      return rayPoint.clone();
    }
    previousT = t;
    previousGap = gap;
  }
  return null;
}

function targetWithinReach(point: THREE.Vector3) {
  return Math.hypot(point.x - avatar.position.x, point.z - avatar.position.z) <= TOOL_REACH;
}

function pageIdAt(x: number, z: number) {
  const page = pageOfPosition(x, z);
  return pageId(page.px, page.pz);
}

function steepnessAt(x: number, z: number) {
  const sampleRadius = 0.45;
  const center = sampleTerrainHeight(x, z);
  return Math.max(
    Math.abs(sampleTerrainHeight(x + sampleRadius, z) - center),
    Math.abs(sampleTerrainHeight(x - sampleRadius, z) - center),
    Math.abs(sampleTerrainHeight(x, z + sampleRadius) - center),
    Math.abs(sampleTerrainHeight(x, z - sampleRadius) - center),
  );
}

export function hasToolActionAt(clientX: number, clientY: number) {
  return getActionMode() === 'dig' && assessDigTarget(clientX, clientY).status === 'valid';
}

export type DigTargetStatus =
  | 'valid'
  | 'no-tool'
  | 'out-of-reach'
  | 'blocked'
  | 'occupied'
  | 'too-steep'
  | 'already-dug';

type DigAssessment = {
  status: DigTargetStatus;
  tool?: NonNullable<ReturnType<typeof equippedDigTool>>;
  target?: ReturnType<typeof terrainCellAt>;
  message?: string;
};

function assessDigTarget(clientX: number, clientY: number): DigAssessment {
  const tool = equippedDigTool();
  if (!tool) return { status: 'no-tool' };
  const point = pickTerrainAtScreen(clientX, clientY);
  if (!point || !targetWithinReach(point)) {
    return { status: 'out-of-reach', tool, message: 'That patch is out of reach — scoot a little closer' };
  }
  const target = terrainCellAt(point.x, point.z, pageIdAt);
  const blocker = findDigFootprintBlocker(target.x, target.z, TERRAIN_CELL_RADIUS);
  if (blocker) {
    return { status: 'blocked', tool, target, message: `There is ${blocker.label} tucked into that patch of paper` };
  }
  const critter = getCritterNearGroundPoint(target.x, target.z, TERRAIN_CELL_RADIUS + 0.35);
  if (critter) {
    return { status: 'occupied', tool, target, message: `${critter.params.name} is standing there — best not shovel a neighbor` };
  }
  if (tool.tier === 1 && steepnessAt(target.x, target.z) > 0.34) {
    return { status: 'too-steep', tool, target, message: 'That fold is too steep for a flimsy shovel' };
  }
  const existing = getGameState().world.pages[target.pageId]?.terrainEdits[target.cellKey];
  if (existing && existing.toolTier >= tool.tier) {
    return { status: 'already-dug', tool, target, message: 'This little patch is already as deep as that shovel can manage' };
  }
  return { status: 'valid', tool, target };
}

export function getDigTargetStatusAtScreen(clientX: number, clientY: number) {
  return assessDigTarget(clientX, clientY).status;
}

export function tryToolActionAt(clientX: number, clientY: number) {
  if (getActionMode() !== 'dig') return false;
  const assessment = assessDigTarget(clientX, clientY);
  if (assessment.status !== 'valid' || !assessment.tool || !assessment.target) {
    if (assessment.message) showPetToast(assessment.message);
    return assessment.status !== 'no-tool';
  }
  const { tool, target } = assessment;
  const pageCoord = pageOfPosition(target.x, target.z);
  const page = getPage(pageCoord.px, pageCoord.pz);
  const hillRichness = Math.max(0, Math.min(1, sampleBaseTerrainHeight(target.x, target.z) / 0.62));
  const discovery = resolveDigDiscovery({
    biome: page.biome,
    pageSeed: page.seed,
    cellKey: target.cellKey,
    layer: tool.tier,
    hillRichness,
  });
  const result = dispatchGameCommand({ type: 'digTerrain', target, discovery, now: Date.now() });
  if (!result.ok) {
    showPetToast(result.reason);
    return true;
  }
  refreshBuiltTerrainNear(target.x, target.z);
  playCozySound('rustle');
  showResourceGain(discovery.resource, discovery.quantity);
  showPetToast('The exposed paper-soil bed is ready for planting');
  return true;
}

function renderEquippedTool() {
  if (!equippedToolChip) return;
  const state = getGameState();
  const seedId = state.player.selectedSeed;
  const actionMode = getActionMode();
  if (actionMode === 'plant') {
    equippedToolChip.classList.add('has-tool');
    // The hoe's behaviour depends on whether seeds are in hand, so the chip
    // says which of its three jobs is currently armed rather than naming the
    // tool and leaving the player to discover the rest.
    equippedToolChip.textContent = seedId && (state.player.inventory[seedId] ?? 0) > 0
      ? `Sowing ${SEED_DEFS[seedId].name.replace(/ Seeds$/, '')} · click a plant to lift it`
      : 'Hoe ready · click a bed to fill it in, or pick a seed to sow';
    return;
  }
  const toolId = state.player.equippedTool;
  const owned = toolId ? (state.player.tools[toolId] ?? 0) > 0 : false;
  equippedToolChip.classList.toggle('has-tool', actionMode === 'dig' && owned);
  equippedToolChip.textContent = actionMode === 'dig' && owned && toolId
    ? `${TOOL_DEFS[toolId].name} · click nearby open ground to ${TOOL_DEFS[toolId].verb}`
    : 'Hands free · click objects, or drag empty space to look around';
}

export function initializeToolActions() {
  renderEquippedTool();
  onGameStateChanged(renderEquippedTool);
  onActionModeChanged(renderEquippedTool);
}
