import * as THREE from 'three';
import { scene } from '../render/context';
import { getGameState, LOCAL_PLAYER_ID } from '../sim/state';
import type { BuildSiteState } from '../sim/state';
import { dispatchGameCommand, resolveIngredientAllocation } from '../sim/commands';
import { buildAssemblyDef, nextBuildStep } from '../sim/catalogs/building';
import { TOOL_DEFS } from '../sim/catalogs/tools';
import {
  BUILD_PIECE_DEFS,
  buildPieceDef,
  buildPiecesConflict,
  type BuildPieceDef,
  type BuildPieceKey,
} from '../world/buildPieces';
import { buildPlacedPieceVisual } from '../world/buildPieceVisuals';
import { findBuildFootprintBlocker, invalidateFootprintCache } from '../world/footprints';
import { refreshBuiltTerrainNear } from '../world/streaming';
import { sampleTerrainHeight } from '../world/terrain';
import { pageId, pageOfPosition } from '../world/types';
import { avatar } from './avatar';
import { pickTerrainAtScreen } from './toolActions';
import { getCritterNearGroundPoint } from './critters';
import { showPetToast } from './petting';
import { playCozySound } from './cozyAudio';
import { getActionMode, onActionModeChanged, setActionMode } from './actionMode';
import { createGroundRing, setGhostAppearance } from './gardenOverlay';
import { startTimedAction } from './timedAction';

// Build-mode placement: choosing a piece, aiming it at the ground, seeing a
// translucent ghost plus the footprints it respects, and putting it down.
//
// The same resolver backs the cursor, the overlay, and the click — mirroring
// the garden overlay's "resolver agrees with command" arrangement, so the
// cursor can never say yes to a click that will be refused.

/** A bit more generous than a tool's reach: you are choosing where a whole
 * object sits, not poking a hole. */
const PLACE_REACH = 4.5;
/** How far around the player to show existing pieces' claimed space. */
const RING_VIEW_RADIUS = 7;

const VALID_COLOR = new THREE.Color('#6f9b52');
const INVALID_COLOR = new THREE.Color('#b4693f');
const CLAIMED_COLOR = new THREE.Color('#7d6753');

export type PlaceTargetStatus =
  | 'valid'
  | 'no-piece'
  | 'out-of-reach'
  | 'blocked'
  | 'occupied'
  | 'too-close';

type PlaceAssessment = {
  status: PlaceTargetStatus;
  def?: BuildPieceDef;
  point?: THREE.Vector3;
  message?: string;
  site?: BuildSiteState;
  rotY?: number;
};

type ActiveBuildPreview = {
  key: BuildPieceKey;
  point: THREE.Vector3;
  rotY: number;
};

// ---- Piece selection -----------------------------------------------------

const selectionListeners = new Set<() => void>();
let selectedKey: BuildPieceKey | null = null;
let selectedRotY = 0;
let activeBuildPreview: ActiveBuildPreview | null = null;

export function getSelectedBuildPiece() {
  return selectedKey;
}

export function setSelectedBuildPiece(key: BuildPieceKey | null) {
  if (key === selectedKey) return;
  selectedKey = key;
  selectedRotY = 0;
  for (const listener of selectionListeners) listener();
}

export function getSelectedBuildRotation() {
  return selectedRotY;
}

/** R-key action. Returns false outside build mode so input can pitch the camera instead. */
export function rotateSelectedBuildPiece() {
  if (getActionMode() !== 'place' || !selectedKey) return false;
  // Building already captured its pose. Consume R without moving that pose or
  // pitching the camera until the action has finished.
  if (activeBuildPreview) return true;
  selectedRotY = (selectedRotY + Math.PI / 2) % (Math.PI * 2);
  for (const listener of selectionListeners) listener();
  return true;
}

export function onSelectedBuildPieceChanged(listener: () => void) {
  selectionListeners.add(listener);
  return () => selectionListeners.delete(listener);
}

// ---- Assessment ----------------------------------------------------------

function withinPlaceReach(point: THREE.Vector3) {
  return Math.hypot(point.x - avatar.position.x, point.z - avatar.position.z) <= PLACE_REACH;
}

/** The first existing piece whose real rotated footprint conflicts. */
function crowdingPiece(x: number, z: number, key: BuildPieceKey, rotY: number) {
  const target = { templateKey: key, x, z, rotY };
  for (const page of Object.values(getGameState().world.pages)) {
    for (const piece of Object.values(page.placedPieces)) {
      if (buildPiecesConflict(target, piece)) return piece;
    }
  }
  return null;
}

function crowdingBuildSite(x: number, z: number, key: BuildPieceKey, rotY: number) {
  const target = { templateKey: key, x, z, rotY };
  for (const page of Object.values(getGameState().world.pages)) {
    for (const site of Object.values(page.buildSites)) {
      if (buildPiecesConflict(target, site)) return site;
    }
  }
  return null;
}

/** Resolve what placing the selected piece at a ground point would do. */
export function assessPlaceAtPoint(point: THREE.Vector3, rotY = selectedRotY): PlaceAssessment {
  const key = selectedKey;
  if (!key) return { status: 'no-piece' };
  const def = BUILD_PIECE_DEFS[key];
  const definition = buildAssemblyDef(key);
  const state = getGameState();
  const equipped = state.player.equippedTool;
  const tool = equipped ? TOOL_DEFS[equipped] : null;
  if (!definition || !equipped || !tool || tool.verb !== 'build' || (state.player.tools[equipped] ?? 0) <= 0) {
    return { status: 'blocked', def, point, message: 'Hold a hammer to build that' };
  }
  if (tool.tier < definition.minimumToolTier) {
    return { status: 'blocked', def, point, message: `That plan needs a level ${definition.minimumToolTier} hammer` };
  }
  if (!withinPlaceReach(point)) {
    return { status: 'out-of-reach', def, message: 'That spot is out of reach — walk a little closer' };
  }
  const radius = Math.max(def.radiusX, def.radiusZ);
  const blocker = findBuildFootprintBlocker(point.x, point.z, radius);
  if (blocker) {
    return { status: 'blocked', def, point, message: `There is ${blocker.label} tucked into that spot` };
  }
  const critter = getCritterNearGroundPoint(point.x, point.z, radius + 0.35);
  if (critter) {
    return { status: 'occupied', def, point, message: `${critter.params.name} is right there — best not build on a neighbor` };
  }
  const buildSite = crowdingBuildSite(point.x, point.z, key, rotY);
  if (buildSite) {
    if (buildSite.templateKey !== key) {
      return { status: 'too-close', def, point, message: 'That space belongs to another unfinished build' };
    }
    const step = nextBuildStep(definition, buildSite.completedStepIds);
    if (!step) return { status: 'blocked', def, point, message: 'That build plan cannot find its next step' };
    if (!resolveIngredientAllocation(state.player.inventory, step.materials)) {
      return { status: 'blocked', def, point, message: `More materials are needed for ${step.label.toLowerCase()}` };
    }
    return {
      status: 'valid',
      def,
      point: new THREE.Vector3(buildSite.x, point.y, buildSite.z),
      site: buildSite,
      rotY: buildSite.rotY,
    };
  }
  if (crowdingPiece(point.x, point.z, key, rotY)) {
    return { status: 'too-close', def, point, message: 'That is too close to something you have already placed' };
  }
  const firstStep = nextBuildStep(definition, []);
  if (!firstStep) return { status: 'blocked', def, point, message: 'That build plan has no first step' };
  if (!resolveIngredientAllocation(state.player.inventory, firstStep.materials)) {
    return { status: 'blocked', def, point, message: `More materials are needed for ${firstStep.label.toLowerCase()}` };
  }
  return { status: 'valid', def, point, rotY };
}

/** Screen-space wrapper: pick the ground under the pointer, then assess. */
export function assessPlaceTargetAtScreen(clientX: number, clientY: number): PlaceAssessment {
  const point = pickTerrainAtScreen(clientX, clientY);
  if (!point) return { status: selectedKey ? 'out-of-reach' : 'no-piece' };
  return assessPlaceAtPoint(point);
}

export function placeTargetStatusAtScreen(clientX: number, clientY: number): PlaceTargetStatus {
  return assessPlaceTargetAtScreen(clientX, clientY).status;
}

function pageIdAt(x: number, z: number) {
  const page = pageOfPosition(x, z);
  return pageId(page.px, page.pz);
}

// ---- Placement -----------------------------------------------------------

export function tryPlaceAt(clientX: number, clientY: number) {
  if (getActionMode() !== 'place') return false;
  const assessment = assessPlaceTargetAtScreen(clientX, clientY);
  if (assessment.status !== 'valid' || !assessment.def || !assessment.point) {
    if (assessment.message) showPetToast(assessment.message);
    return assessment.status !== 'no-piece';
  }
  const { x, z } = assessment.point;
  const rotY = assessment.rotY ?? selectedRotY;
  const definition = buildAssemblyDef(assessment.def.key);
  const step = definition
    ? nextBuildStep(definition, assessment.site?.completedStepIds ?? [])
    : null;
  if (!definition || !step) {
    showPetToast('That build plan cannot find its next step.');
    return true;
  }
  activeBuildPreview = {
    key: assessment.def.key,
    point: assessment.point.clone(),
    rotY,
  };
  const started = startTimedAction({
    steps: [{
      id: step.id,
      kind: step.verb,
      label: step.label,
      durationMs: step.durationSeconds * 1000,
    }],
    onComplete: () => {
      const result = dispatchGameCommand({
        type: 'completeBuildStep',
        templateKey: assessment.def!.key,
        stepId: step.id,
        x,
        z,
        rotY,
        pageId: assessment.site?.page || pageIdAt(x, z),
        now: Date.now(),
      });
      if (!result.ok) {
        activeBuildPreview = null;
        showPetToast(result.reason);
        return;
      }
      // A finished piece or a newly persisted assembly site both change the
      // space the world reserves. The same refresh works for each outcome.
      invalidateFootprintCache();
      refreshBuiltTerrainNear(x, z);
      playCozySound('rustle');
      showPetToast(result.message);
      activeBuildPreview = null;
    },
    onCancel: () => {
      activeBuildPreview = null;
    },
  });
  if (!started) activeBuildPreview = null;
  return true;
}

// ---- Ground overlay ------------------------------------------------------

let overlayRoot: THREE.Group | null = null;
let ghostHost: THREE.Group | null = null;
let ghost: THREE.Group | null = null;
let targetRing: THREE.Mesh | null = null;
let claimedRings: THREE.Group | null = null;
let ghostKey: BuildPieceKey | null = null;

export function initializePlacement() {
  if (overlayRoot) return;
  overlayRoot = new THREE.Group();
  overlayRoot.name = 'build-overlay';
  overlayRoot.visible = false;
  ghostHost = new THREE.Group();
  claimedRings = new THREE.Group();
  targetRing = createGroundRing(0.5, VALID_COLOR, 0.75);
  overlayRoot.add(ghostHost, claimedRings, targetRing);
  scene.add(overlayRoot);

  onActionModeChanged((mode) => {
    // Entering build mode arms the first piece, so the rail is one click.
    if (mode === 'place' && !selectedKey) {
      const first = Object.keys(BUILD_PIECE_DEFS)[0] as BuildPieceKey;
      setSelectedBuildPiece(first);
    }
    if (mode !== 'place') hideBuildOverlay();
  });

  // Stable visual fixture for browser checks. It exercises the exact pinned
  // pose used during a timed build without granting tools, spending materials,
  // or writing anything into the player's save.
  const previewKey = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('buildingGhostPreview')
    : null;
  if (previewKey && previewKey in BUILD_PIECE_DEFS) {
    setSelectedBuildPiece(previewKey as BuildPieceKey);
    selectedRotY = Math.PI / 2;
    activeBuildPreview = {
      key: previewKey as BuildPieceKey,
      point: new THREE.Vector3(-0.1, sampleTerrainHeight(-0.1, -2.2), -2.2),
      rotY: selectedRotY,
    };
    setActionMode('place');
  }
}

export function hideBuildOverlay() {
  if (overlayRoot) overlayRoot.visible = false;
}

/** Rebuild the ghost only when the piece it represents actually changes. */
function syncGhost(key: BuildPieceKey | null) {
  if (!ghostHost) return;
  if (key === ghostKey) return;
  ghostKey = key;
  ghostHost.clear();
  ghost = null;
  if (!key) return;
  ghost = buildPlacedPieceVisual({
    id: 'ghost',
    templateKey: key,
    x: 0,
    z: 0,
    rotY: 0,
    ownerId: LOCAL_PLAYER_ID,
    page: '0,0',
  });
  ghostHost.add(ghost);
}

/** Refresh rings showing the space already claimed by nearby pieces. */
function syncClaimedRings(avatarPosition: THREE.Vector3) {
  if (!claimedRings) return;
  claimedRings.clear();
  for (const page of Object.values(getGameState().world.pages)) {
    for (const piece of Object.values(page.placedPieces)) {
      const distance = Math.hypot(piece.x - avatarPosition.x, piece.z - avatarPosition.z);
      if (distance > RING_VIEW_RADIUS) continue;
      const def = buildPieceDef(piece.templateKey);
      const ring = createGroundRing(Math.max(0.3, def.radiusX, def.radiusZ), CLAIMED_COLOR, 0.4);
      ring.position.set(piece.x, sampleTerrainHeight(piece.x, piece.z) + 0.03, piece.z);
      claimedRings.add(ring);
    }
    for (const site of Object.values(page.buildSites)) {
      const distance = Math.hypot(site.x - avatarPosition.x, site.z - avatarPosition.z);
      if (distance > RING_VIEW_RADIUS) continue;
      const def = buildPieceDef(site.templateKey);
      const ring = createGroundRing(Math.max(0.3, def.radiusX, def.radiusZ), CLAIMED_COLOR, 0.32);
      ring.position.set(site.x, sampleTerrainHeight(site.x, site.z) + 0.03, site.z);
      claimedRings.add(ring);
    }
  }
}

export function updateBuildOverlay(
  delta: number,
  elapsed: number,
  avatarPosition: THREE.Vector3,
  hover: THREE.Vector3 | null,
) {
  const active = getActionMode() === 'place';
  if (!overlayRoot || !targetRing) return;
  if (!active) {
    overlayRoot.visible = false;
    return;
  }
  overlayRoot.visible = true;

  syncClaimedRings(avatarPosition);

  const pinned = activeBuildPreview;
  const key = pinned?.key ?? selectedKey;
  const displayPoint = pinned?.point ?? hover;
  const assessment = pinned
    ? { status: 'valid' as const, def: BUILD_PIECE_DEFS[pinned.key], point: pinned.point, rotY: pinned.rotY }
    : hover ? assessPlaceAtPoint(hover) : null;
  syncGhost(displayPoint && key ? key : null);

  if (!displayPoint || !assessment || assessment.status === 'no-piece') {
    targetRing.visible = false;
    if (ghostHost) ghostHost.visible = false;
    return;
  }

  const previewPoint = assessment.point ?? displayPoint;
  const groundY = sampleTerrainHeight(previewPoint.x, previewPoint.z);
  const color = assessment.status === 'valid' ? VALID_COLOR : INVALID_COLOR;

  // The target ring shows the space this piece will claim. Overlapping rings
  // are the explanation for a refusal, just as in the garden.
  targetRing.visible = true;
  targetRing.position.set(previewPoint.x, groundY + 0.035, previewPoint.z);
  const radius = assessment.def ? Math.max(0.3, assessment.def.radiusX, assessment.def.radiusZ) : 0.3;
  targetRing.scale.setScalar(radius / 0.5);
  const ringMaterial = targetRing.material as THREE.MeshBasicMaterial;
  ringMaterial.color.copy(color);
  ringMaterial.opacity = 0.6 + Math.sin(elapsed * 3.4) * 0.16;

  if (ghostHost && ghost) {
    ghostHost.visible = true;
    ghostHost.position.set(previewPoint.x, groundY + 0.018, previewPoint.z);
    ghostHost.rotation.y = assessment.rotY ?? selectedRotY;
    setGhostAppearance(ghost, color, assessment.status === 'valid' ? 0.55 : 0.32);
  } else if (ghostHost) {
    ghostHost.visible = false;
  }
}
