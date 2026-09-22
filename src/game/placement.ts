import * as THREE from 'three';
import { scene } from '../render/context';
import { getGameState, LOCAL_MAKER_ID } from '../sim/state';
import type { BuildSiteState } from '../sim/state';
import { dispatchGameCommand, resolveIngredientAllocation } from '../sim/commands';
import {
  buildAssemblyDef,
  buildMaterialUnits,
  nextBuildStep,
  type BuildMaterialId,
} from '../sim/catalogs/building';
import { canAffordBuildMaterial, defaultBuildMaterial } from './buildMaterials';
import { TOOL_DEFS } from '../sim/catalogs/tools';
import { RECIPE_DEFS, unlearnedBuildPlan } from '../sim/catalogs/recipes';
import {
  BUILD_PIECE_DEFS,
  buildPieceDef,
  buildPieceDefsConflict,
  buildPiecesConflict,
  type BuildPieceDef,
  type BuildPieceKey,
  type ResolvedBuildPiece,
} from '../world/buildPieces';
import type { PlacedPiece } from '../../shared/src/index';
import { buildPlacedPieceVisual } from '../world/buildPieceVisuals';
import { findBuildFootprintBlocker, invalidateFootprintCache } from '../world/footprints';
import { refreshBuiltPageTerrain } from '../world/streaming';
import { sampleTerrainHeight } from '../world/terrain';
import { groundHeightAt, isInteriorActive, solidAt } from '../world/activeScene';
import { HOME_INTERIOR_PAGE_ID, HOME_INTERIOR_SCENE, sceneOfPageId } from '../world/scenes';
import { pageId, pageOfPosition } from '../world/types';
import { avatar } from './avatar';
import { getYaw } from './camera';
import { pickTerrainAtScreen } from './toolActions';
import { getCritterNearGroundPoint } from './critters';
import { showPetToast } from './petting';
import { playCozySound } from './cozyAudio';
import { getActionMode, onActionModeChanged, setActionMode } from './actionMode';
import { createGroundRing, setGhostAppearance } from './gardenOverlay';
import { startTimedAction } from './timedAction';
import { publishSharedPlacedPiece } from '../net/sharedSession';
import { setPlacedPieceVisualVisible } from './placedPieceInteractions';
import { refreshInteriorBuilds } from './interiorScene';

// Build-mode placement: choosing a piece, aiming it at the ground, seeing a
// translucent ghost plus the footprints it respects, and putting it down.
//
// The same resolver backs the cursor, the overlay, and the click — mirroring
// the garden overlay's "resolver agrees with command" arrangement, so the
// cursor can never say yes to a click that will be refused.

/** A bit more generous than a tool's reach: you are choosing where a whole
 * object sits, not poking a hole. */
const PLACE_REACH = 4.5;
/** Arrow-key nudge distance while carrying — small next to the smallest
 * piece radius (0.3, see BUILD_PIECE_DEFS in world/buildPieces.ts) so a few
 * presses read as fine positioning, not a jump. */
const NUDGE_STEP = 0.12;
/** How far around the player to show existing pieces' claimed space. */
const RING_VIEW_RADIUS = 7;

const VALID_COLOR = new THREE.Color('#6f9b52');
const INVALID_COLOR = new THREE.Color('#b4693f');
const CLAIMED_COLOR = new THREE.Color('#7d6753');
/** Ring tint for a piece waiting in the pending bulk-move selection — its
 * own color so "selected, not yet carried" reads differently from both the
 * ambient claimed-space rings and the carried ghost's valid/invalid tint. */
const SELECTED_COLOR = new THREE.Color('#3f7fb4');

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
  pageId?: string;
};

type ActiveBuildPreview = {
  key: BuildPieceKey;
  point: THREE.Vector3;
  rotY: number;
  material: BuildMaterialId | null;
};

// ---- Piece selection -----------------------------------------------------

const selectionListeners = new Set<() => void>();
let selectedKey: BuildPieceKey | null = null;
let selectedRotY = 0;
/**
 * Null until the player has something to build with.
 *
 * Materials are things you gathered now, so there is no longer a free default
 * to fall back on — an empty bag means you go and find some paper first, which
 * is the whole point of the change.
 */
let selectedMaterial: BuildMaterialId | null = defaultBuildMaterial('paper-bench');
let activeBuildPreview: ActiveBuildPreview | null = null;

export function getSelectedBuildPiece() {
  return selectedKey;
}

export function setSelectedBuildPiece(key: BuildPieceKey | null) {
  if (key === selectedKey) return;
  selectedKey = key;
  selectedRotY = 0;
  // Keep the current choice when it still covers the new piece — swapping a
  // bench for a plank should not quietly change what it is made of — and
  // otherwise fall to the first material that does.
  if (key && !(selectedMaterial && canAffordBuildMaterial(key, selectedMaterial))) {
    selectedMaterial = defaultBuildMaterial(key);
  }
  for (const listener of selectionListeners) listener();
}

export function getSelectedBuildRotation() {
  return selectedRotY;
}

export function getSelectedBuildMaterial() {
  return selectedMaterial;
}

/** Build-palette swatch click. Ignored once a build is already pinned and
 * running, same as rotation below — the in-flight action already captured
 * its pose and look. */
export function setSelectedBuildMaterial(material: BuildMaterialId) {
  if (getActionMode() !== 'place') return;
  if (carrying) {
    // A mixed bulk group has no one material to restyle into — the palette
    // hides the material section for a bulk carry (buildPalette.ts), and
    // this refusal is the matching guard on the command side.
    if (carrying.members.length !== 1) return;
    if (activeBuildPreview) return; // a restyle timer is already running
    if (carryHoverPoint) dropCarriedPiece(carryHoverPoint, material);
    return;
  }
  if (!selectedKey) return;
  if (activeBuildPreview) return;
  if (material === selectedMaterial) return;
  selectedMaterial = material;
  for (const listener of selectionListeners) listener();
}

/** R-key action. Returns false outside build mode so input can pitch the camera instead. */
export function rotateSelectedBuildPiece() {
  if (getActionMode() !== 'place') return false;
  if (carrying) {
    carrying.rotY = (carrying.rotY + Math.PI / 2) % (Math.PI * 2);
    return true;
  }
  if (!selectedKey) return false;
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

/** Shift+R / Shift+F while carrying: a finer step than the plain 90-degree
 * R press, for lining something up more precisely than a quarter turn
 * allows. Returns false (so input.ts falls through to the un-shifted key's
 * usual meaning) whenever nothing is being carried. */
const FINE_ROTATE_STEP = Math.PI / 12; // 15 degrees

export function fineRotateCarriedPiece(direction: 1 | -1): boolean {
  if (getActionMode() !== 'place' || !carrying) return false;
  carrying.rotY = (carrying.rotY + FINE_ROTATE_STEP * direction + Math.PI * 2) % (Math.PI * 2);
  return true;
}

/** Right-drag: free-angle rotation to any angle, not just 90-degree or
 * 15-degree steps — for lining a piece up with something that was never
 * going to land on a clean multiple of either. `deltaRadians` accumulates
 * frame to frame (input.ts converts drag pixels to radians), so this just
 * adds it straight onto the running rotation. */
export function dragRotateCarriedPiece(deltaRadians: number) {
  if (!carrying) return;
  carrying.rotY = (carrying.rotY + deltaRadians + Math.PI * 2) % (Math.PI * 2);
}

// ---- Carrying already-placed pieces ---------------------------------------
//
// Picking your own bench back up to move it is a different gesture from
// placing a new one: no tool, no materials, no build timer for a move or a
// turn. A material swap is the one exception that still costs a timer, so
// it borrows `activeBuildPreview` to pin the ghost while that timer runs —
// carrying and "mid-build" never overlap in time.
//
// Solo carry (click your own piece) and bulk carry (shift-click several,
// then click one of them) share one `CarryState`. A solo carry is just a
// one-member group sitting at its own pivot with a zero offset, so there is
// one drop/rotate/render path to keep correct instead of two that drift
// apart the first time someone fixes a bug in only one of them.

type CarriedMember = {
  piece: PlacedPiece;
  /** Position relative to the group's pivot *at pickup*, before any group
   * rotation. Rotated by `carrying.rotY` each frame to find where this
   * member actually belongs now. Zero for a solo carry. */
  offsetX: number;
  offsetZ: number;
};

type CarryState = {
  members: CarriedMember[];
  pageId: string;
  /**
   * The group's rotation *delta* since pickup, applied to both each
   * member's offset (so the group swings around its shared pivot) and each
   * member's own original facing (so a bench rotated with the group still
   * faces the same way relative to its neighbors) — a rigid-body rotation,
   * per the "rotate the whole group as one" answer this shipped against.
   * For a solo carry (offset always zero) this reduces to exactly the old
   * "rotY starts at the piece's own facing and turns from there" behavior.
   */
  rotY: number;
};

/** Treated as a piece with almost no footprint, so "does this footprint
 * overlap that click point" reuses the same rotated-rectangle math as any
 * other conflict check instead of a bespoke point-in-rectangle test. */
const PICKUP_POINT_DEF: ResolvedBuildPiece = {
  key: 'unknown', label: '', summary: '', radiusX: 0.05, radiusZ: 0.05, overlap: 'none', solid: false,
};

let carrying: CarryState | null = null;
/** Where the carried group's pivot currently sits, tracked every frame so a
 * material swatch click — which has no click point of its own — knows where
 * to restyle-and-drop. Starts at the pivot's spot when carry begins. */
let carryHoverPoint: THREE.Vector3 | null = null;
/**
 * Once an arrow-key nudge has moved the pivot, the mouse stops driving it
 * for the rest of this carry — otherwise the passive hover-follow
 * (updateBuildOverlay) would stomp every nudge on the very next frame the
 * instant the mouse so much as twitches. Reset on every new carry, so the
 * next pickup starts back under mouse control as usual.
 */
let nudgeActive = false;

/**
 * Placed pieces shift-clicked into a pending bulk-move group, waiting to be
 * picked up together. Cleared on beginning a carry, on Esc when nothing is
 * being carried yet, and on leaving build mode — a selection has no meaning
 * outside it.
 */
const selectedPieceIds = new Set<string>();

export function isCarryingPlacedPiece() {
  return carrying !== null;
}

export function carriedPieceCount(): number {
  return carrying?.members.length ?? 0;
}

export function getSelectedPlacedPieceIds(): ReadonlySet<string> {
  return selectedPieceIds;
}

/**
 * The carried piece's own template and current material — what the build
 * palette's material section should price and highlight against while
 * restyling an already-placed piece. `selectedKey`/`selectedMaterial` are
 * the *next new piece* choice and are whatever was last left in them
 * (possibly nothing at all); using those here priced and highlighted the
 * wrong item, or nothing, the whole time this piece has been carryable.
 * Null for a bulk carry too — a mixed group has no one material to restyle.
 */
export function getCarriedPieceContext(): { templateKey: string; material: string } | null {
  if (!carrying || carrying.members.length !== 1) return null;
  const { piece } = carrying.members[0];
  return { templateKey: piece.templateKey, material: piece.material };
}

/** Rotate a ground-plane offset by `radians` — used to swing a bulk group's
 * members around their shared pivot as one rigid body. */
function rotateOffset(x: number, z: number, radians: number): [number, number] {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [x * cos - z * sin, x * sin + z * cos];
}

/** The piece standing at this ground point that the local player made, if any. */
function ownedPieceAtPoint(x: number, z: number): { piece: PlacedPiece; pageId: string } | null {
  const activePageId = currentBuildPageId(x, z);
  if (!activePageId) return null;
  const page = getGameState().world.pages[activePageId];
  for (const piece of Object.values(page?.placedPieces ?? {})) {
    if (piece.makerId !== LOCAL_MAKER_ID) continue;
    const def = buildPieceDef(piece.templateKey);
    if (buildPieceDefsConflict(
      PICKUP_POINT_DEF, { x, z, rotY: 0 },
      def, { x: piece.x, z: piece.z, rotY: piece.rotY },
    )) {
      return { piece, pageId: piece.page };
    }
  }
  return null;
}

/** Shift-click an owned placed piece: add or remove it from the pending
 * bulk-move group. Returns false (so the caller can fall through to normal
 * placement) when the click did not land on anything of the player's own. */
function toggleSelectedPiece(x: number, z: number): boolean {
  const owned = ownedPieceAtPoint(x, z);
  if (!owned) return false;
  if (selectedPieceIds.has(owned.piece.id)) selectedPieceIds.delete(owned.piece.id);
  else selectedPieceIds.add(owned.piece.id);
  for (const listener of selectionListeners) listener();
  return true;
}

export function clearSelectedPlacedPieces(): boolean {
  if (selectedPieceIds.size === 0) return false;
  selectedPieceIds.clear();
  for (const listener of selectionListeners) listener();
  return true;
}

/** Re-fetch every currently-selected piece from live game state (never trust
 * a stale reference), keeping only the ones that still exist on `pageId`. A
 * selected piece that vanished, or was shift-clicked from a different page
 * entirely, is quietly left out rather than carried into a group it never
 * belonged in. */
function collectSelectedPieces(pageId: string): { piece: PlacedPiece; pageId: string }[] {
  const page = getGameState().world.pages[pageId];
  const found: { piece: PlacedPiece; pageId: string }[] = [];
  for (const id of selectedPieceIds) {
    const piece = page?.placedPieces[id];
    if (piece) found.push({ piece, pageId });
  }
  return found;
}

function beginCarrying(pieces: { piece: PlacedPiece; pageId: string }[]) {
  if (pieces.length === 0) return;
  // The pivot is the group's own centroid, not whichever piece happened to
  // be clicked — rotating a group anchored at one corner would fling
  // everything else around it instead of turning in place.
  const pivotX = pieces.reduce((sum, entry) => sum + entry.piece.x, 0) / pieces.length;
  const pivotZ = pieces.reduce((sum, entry) => sum + entry.piece.z, 0) / pieces.length;
  carrying = {
    pageId: pieces[0].pageId,
    rotY: 0,
    members: pieces.map(({ piece }) => ({
      piece,
      offsetX: piece.x - pivotX,
      offsetZ: piece.z - pivotZ,
    })),
  };
  carryHoverPoint = new THREE.Vector3(pivotX, 0, pivotZ);
  nudgeActive = false;
  for (const { piece } of pieces) setPlacedPieceVisualVisible(piece.id, false);
  selectedPieceIds.clear();
  for (const listener of selectionListeners) listener();
}

/** Esc: while carrying, put every member back exactly where it was (nothing
 * was ever written to the save, so there is nothing to undo but the ghosts).
 * With nothing carried, Esc instead clears a pending bulk selection, so
 * there is always something for it to back out of in build mode. */
export function cancelCarryingPiece(): boolean {
  if (carrying) {
    for (const { piece } of carrying.members) setPlacedPieceVisualVisible(piece.id, true);
    carrying = null;
    carryHoverPoint = null;
    nudgeActive = false;
    for (const listener of selectionListeners) listener();
    return true;
  }
  return clearSelectedPlacedPieces();
}

/**
 * Arrow-key nudge: step the carried pivot by NUDGE_STEP in the pressed
 * direction, camera-relative exactly like avatar movement (see
 * `desiredDirection` in avatar.ts, whose forward/right formula this mirrors)
 * so "up" nudges away from the camera the same way "up" walks away from it.
 * Returns false when nothing is being carried, so input.ts falls through to
 * its normal arrow-key movement handling.
 */
export function nudgeCarriedPiece(code: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'): boolean {
  if (!carrying || !carryHoverPoint) return false;
  const yaw = getYaw();
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const step = code === 'ArrowUp' ? forward
    : code === 'ArrowDown' ? forward.clone().negate()
      : code === 'ArrowRight' ? right
        : right.clone().negate();
  carryHoverPoint.addScaledVector(step, NUDGE_STEP);
  nudgeActive = true;
  return true;
}

/** Where every carried member would land if the group's pivot were set down
 * at `pivot`, with the group's accumulated rotation applied rigidly. */
function carryMemberTargets(pivot: THREE.Vector3): { member: CarriedMember; x: number; z: number; rotY: number }[] {
  if (!carrying) return [];
  const groupRotY = carrying.rotY;
  return carrying.members.map((member) => {
    const [dx, dz] = rotateOffset(member.offsetX, member.offsetZ, groupRotY);
    return {
      member,
      x: pivot.x + dx,
      z: pivot.z + dz,
      rotY: (member.piece.rotY + groupRotY) % (Math.PI * 2),
    };
  });
}

/** Assess dropping the whole carried group with its pivot at `pivot`. Fails
 * on the first member that cannot land where the group's rotation would put
 * it — an all-or-nothing check, same spirit as a solo carry, so a group
 * never drops half-obstructed. */
function assessCarryDropAtPoint(pivot: THREE.Vector3): PlaceAssessment {
  if (!carrying) return { status: 'no-piece' };
  const { pageId } = carrying;
  // Members never block each other — they are moving together and were
  // already not conflicting with one another before pickup.
  const memberIds = new Set(carrying.members.map((member) => member.piece.id));
  for (const target of carryMemberTargets(pivot)) {
    const { member, x, z, rotY } = target;
    const point = new THREE.Vector3(x, 0, z);
    const def = buildPieceDef(member.piece.templateKey);
    if (!withinPlaceReach(point)) {
      return { status: 'out-of-reach', message: 'That spot is out of reach — walk a little closer' };
    }
    if (currentBuildPageId(x, z) !== pageId) {
      return { status: 'blocked', message: 'Keep it somewhere in its own neighborhood for now' };
    }
    const radius = Math.max(def.radiusX, def.radiusZ);
    const blocker = isInteriorActive() ? null : findBuildFootprintBlocker(x, z, radius);
    if (isInteriorActive() && solidAt(x, z, radius)) {
      return { status: 'blocked', message: 'That would crowd the wall or doorway' };
    }
    if (blocker) {
      return { status: 'blocked', message: `There is ${blocker.label} tucked into that spot` };
    }
    const critter = isInteriorActive() ? null : getCritterNearGroundPoint(x, z, radius + 0.35);
    if (critter) {
      return { status: 'occupied', message: `${critter.params.name} is right there — best not set it down on a neighbor` };
    }
    if (crowdingPiece(pageId, x, z, member.piece.templateKey as BuildPieceKey, rotY, memberIds)) {
      return { status: 'too-close', message: 'That is too close to something else you have placed' };
    }
  }
  const solo = carrying.members.length === 1 ? carrying.members[0] : null;
  return {
    status: 'valid',
    point: pivot,
    rotY: carrying.rotY,
    // Only a solo carry has one piece type to size the target ring against —
    // see updateBuildOverlay, which renders a bulk group a different way.
    def: solo ? (buildPieceDef(solo.piece.templateKey) as BuildPieceDef) : undefined,
  };
}

/**
 * Shared by an instant move and, for a solo carry only, a restyle — both end
 * with one `updatePlacedPiece` command per member once the drop point checks
 * out. `material`, when given, only ever applies to a solo carry:
 * `setSelectedBuildMaterial` below refuses a swatch click while more than
 * one piece is carried, so a bulk group's pieces always keep whatever
 * material they already had.
 */
function dropCarriedPiece(pivot: THREE.Vector3, material?: BuildMaterialId) {
  if (!carrying) return;
  const assessment = assessCarryDropAtPoint(pivot);
  if (assessment.status !== 'valid') {
    if (assessment.message) showPetToast(assessment.message);
    return;
  }
  const { pageId, members } = carrying;
  const targets = carryMemberTargets(pivot);
  const solo = members.length === 1 ? members[0] : null;
  const restyling = solo !== null && material !== undefined && material !== solo.piece.material;

  const commit = () => {
    let failures = 0;
    let lastMessage = '';
    for (const target of targets) {
      const isSolo = solo !== null && target.member === solo;
      const result = dispatchGameCommand({
        type: 'updatePlacedPiece',
        id: target.member.piece.id,
        x: target.x,
        z: target.z,
        rotY: target.rotY,
        material: (isSolo && restyling ? material! : target.member.piece.material) as BuildMaterialId,
        pageId,
      });
      setPlacedPieceVisualVisible(target.member.piece.id, true);
      if (!result.ok) {
        failures += 1;
        lastMessage = result.reason;
        continue;
      }
      if (isSolo) lastMessage = result.message;
    }
    activeBuildPreview = null;
    invalidateFootprintCache();
    if (sceneOfPageId(pageId) === HOME_INTERIOR_SCENE) refreshInteriorBuilds();
    else refreshBuiltPageTerrain(pageId);
    if (failures === 0) playCozySound('rustle');
    // A validated drop failing at commit time would be a race with something
    // else changing the world between the two — not expected, but shown
    // plainly rather than silently swallowed if it ever happens.
    if (failures > 0 || solo) showPetToast(lastMessage);
    else showPetToast(`Moved ${members.length} pieces.`);
  };

  if (!restyling) {
    carrying = null;
    carryHoverPoint = null;
    nudgeActive = false;
    for (const listener of selectionListeners) listener();
    commit();
    return;
  }

  // Restyling costs the same rebuild feel the piece originally took to build.
  const definition = buildAssemblyDef(solo!.piece.templateKey);
  const durationMs = (definition?.steps[0]?.durationSeconds ?? 2) * 1000;
  activeBuildPreview = { key: solo!.piece.templateKey as BuildPieceKey, point: pivot.clone(), rotY: targets[0].rotY, material: material! };
  carrying = null;
  carryHoverPoint = null;
  nudgeActive = false;
  for (const listener of selectionListeners) listener();
  const started = startTimedAction({
    steps: [{ kind: 'build', label: 'Restyling', durationMs }],
    onComplete: commit,
    onCancel: () => {
      activeBuildPreview = null;
      setPlacedPieceVisualVisible(solo!.piece.id, true);
    },
  });
  if (!started) commit();
}


// ---- Assessment ----------------------------------------------------------

function withinPlaceReach(point: THREE.Vector3) {
  return Math.hypot(point.x - avatar.position.x, point.z - avatar.position.z) <= PLACE_REACH;
}

/** The first existing piece whose real rotated footprint conflicts.
 * `excludeIds` leaves a moving piece's own old footprint — or, for a bulk
 * carry, every member's — out of its own move check. */
function crowdingPiece(pageId: string, x: number, z: number, key: BuildPieceKey, rotY: number, excludeIds?: ReadonlySet<string>) {
  const target = { templateKey: key, x, z, rotY };
  const page = getGameState().world.pages[pageId];
  for (const piece of Object.values(page?.placedPieces ?? {})) {
    if (excludeIds?.has(piece.id)) continue;
    if (buildPiecesConflict(target, piece)) return piece;
  }
  return null;
}

function crowdingBuildSite(pageId: string, x: number, z: number, key: BuildPieceKey, rotY: number) {
  const target = { templateKey: key, x, z, rotY };
  const page = getGameState().world.pages[pageId];
  for (const site of Object.values(page?.buildSites ?? {})) {
    if (buildPiecesConflict(target, site)) return site;
  }
  return null;
}

/** Resolve what placing the selected piece at a ground point would do. */
export function assessPlaceAtPoint(point: THREE.Vector3, rotY = selectedRotY): PlaceAssessment {
  const key = selectedKey;
  if (!key) return { status: 'no-piece' };
  const def = BUILD_PIECE_DEFS[key];
  const buildPageId = currentBuildPageId(point.x, point.z);
  if (!buildPageId) {
    return { status: 'blocked', def, point, message: 'You can only decorate your own home' };
  }
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
  const blocker = isInteriorActive() ? null : findBuildFootprintBlocker(point.x, point.z, radius);
  if (isInteriorActive() && solidAt(point.x, point.z, radius)) {
    return { status: 'blocked', def, point, message: 'That would crowd the wall or doorway' };
  }
  if (blocker) {
    return { status: 'blocked', def, point, message: `There is ${blocker.label} tucked into that spot` };
  }
  const critter = isInteriorActive() ? null : getCritterNearGroundPoint(point.x, point.z, radius + 0.35);
  if (critter) {
    return { status: 'occupied', def, point, message: `${critter.params.name} is right there — best not build on a neighbor` };
  }
  const buildSite = crowdingBuildSite(buildPageId, point.x, point.z, key, rotY);
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
      pageId: buildPageId,
    };
  }
  // Knowing the plan gates starting a piece; a build already underway (handled
  // above) is finished whatever you know.
  const missingPlan = unlearnedBuildPlan(state.player.plans, key);
  if (missingPlan) {
    return { status: 'blocked', def, point, message: `Learn the ${RECIPE_DEFS[missingPlan].name} plan with the Professor first` };
  }
  if (crowdingPiece(buildPageId, point.x, point.z, key, rotY)) {
    return { status: 'too-close', def, point, message: 'That is too close to something you have already placed' };
  }
  const firstStep = nextBuildStep(definition, []);
  if (!firstStep) return { status: 'blocked', def, point, message: 'That build plan has no first step' };
  if (!resolveIngredientAllocation(state.player.inventory, firstStep.materials)) {
    return { status: 'blocked', def, point, message: `More materials are needed for ${firstStep.label.toLowerCase()}` };
  }
  return { status: 'valid', def, point, rotY, pageId: buildPageId };
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

/** The save page receiving a build in the active scene. A guest's saved
 * scene remains `surface`, which intentionally makes their host's room read
 * only instead of writing the guest's furniture into it. */
export function currentBuildPageId(x: number, z: number): string | null {
  if (!isInteriorActive()) return pageIdAt(x, z);
  return getGameState().player.scene === HOME_INTERIOR_SCENE ? HOME_INTERIOR_PAGE_ID : null;
}

// ---- Placement -----------------------------------------------------------

export function tryPlaceAt(clientX: number, clientY: number, event?: PointerEvent) {
  if (getActionMode() !== 'place') return false;
  if (carrying) {
    const point = pickTerrainAtScreen(clientX, clientY);
    if (point) dropCarriedPiece(point);
    return true;
  }
  const groundPoint = pickTerrainAtScreen(clientX, clientY);
  if (groundPoint) {
    if (event?.shiftKey) {
      // Shift-click builds up a bulk-move group instead of picking anything
      // up immediately. A shift-click that misses an owned piece falls
      // through to normal placement below, same as an unmodified miss would.
      if (toggleSelectedPiece(groundPoint.x, groundPoint.z)) return true;
    } else {
      const owned = ownedPieceAtPoint(groundPoint.x, groundPoint.z);
      if (owned) {
        // A plain click on a piece that is part of a 2-or-more selection
        // picks up the whole group; a plain click on anything else (or a
        // stray 1-piece "selection", equivalent to none) just carries that
        // one piece solo, same as ever, and drops any leftover selection.
        if (selectedPieceIds.size > 1 && selectedPieceIds.has(owned.piece.id)) {
          beginCarrying(collectSelectedPieces(owned.pageId));
        } else {
          if (selectedPieceIds.size > 0) selectedPieceIds.clear();
          beginCarrying([owned]);
        }
        return true;
      }
    }
  }
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
  const material = selectedMaterial;
  // A piece is made of something you gathered, so an empty bag stops the
  // build here rather than at the command — with the number, because "not
  // enough" without "how much" is just a shrug.
  if (!material || !canAffordBuildMaterial(assessment.def.key, material)) {
    const units = buildMaterialUnits(assessment.def.key);
    showPetToast(material
      ? `Not enough of that material — ${assessment.def.label} takes ${units}.`
      : `Gather some material first — ${assessment.def.label} takes ${units}.`);
    return true;
  }
  activeBuildPreview = {
    key: assessment.def.key,
    point: assessment.point.clone(),
    rotY,
    material,
  };
  const started = startTimedAction({
    steps: [{
      id: step.id,
      kind: step.verb,
      label: step.label,
      durationMs: step.durationSeconds * 1000,
    }],
    onComplete: () => {
      const buildPageId = assessment.site?.page || assessment.pageId || pageIdAt(x, z);
      const piecesBefore = new Set(
        Object.keys(getGameState().world.pages[buildPageId]?.placedPieces ?? {}),
      );
      const result = dispatchGameCommand({
        type: 'completeBuildStep',
        templateKey: assessment.def!.key,
        stepId: step.id,
        x,
        z,
        rotY,
        pageId: buildPageId,
        now: Date.now(),
        material,
      });
      if (!result.ok) {
        activeBuildPreview = null;
        showPetToast(result.reason);
        return;
      }
      // A finished piece or a newly persisted assembly site both change the
      // space the world reserves. The same refresh works for each outcome.
      invalidateFootprintCache();
      if (sceneOfPageId(buildPageId) === HOME_INTERIOR_SCENE) refreshInteriorBuilds();
      else refreshBuiltPageTerrain(buildPageId);
      playCozySound('rustle');
      showPetToast(result.message);
      const finishedPiece = Object.values(
        getGameState().world.pages[buildPageId]?.placedPieces ?? {},
      ).find((piece) => !piecesBefore.has(piece.id));
      if (finishedPiece) publishSharedPlacedPiece(finishedPiece);
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
let selectionRings: THREE.Group | null = null;
let ghostKey: BuildPieceKey | null = null;
let ghostMaterial: BuildMaterialId | null = null;
/** One ghost mesh per bulk-carried member, since a group has no single piece
 * type for `ghost`/`syncGhost` to represent. Rebuilt only when the carried
 * member set changes (see `syncGroupGhost`), then just repositioned each
 * frame like the solo ghost is. */
let groupGhostHost: THREE.Group | null = null;
let groupGhosts: THREE.Group[] = [];
let groupGhostKey: string | null = null;

export function initializePlacement() {
  if (overlayRoot) return;
  overlayRoot = new THREE.Group();
  overlayRoot.name = 'build-overlay';
  overlayRoot.visible = false;
  ghostHost = new THREE.Group();
  claimedRings = new THREE.Group();
  selectionRings = new THREE.Group();
  groupGhostHost = new THREE.Group();
  targetRing = createGroundRing(0.5, VALID_COLOR, 0.75);
  overlayRoot.add(ghostHost, claimedRings, selectionRings, groupGhostHost, targetRing);
  scene.add(overlayRoot);

  onActionModeChanged((mode) => {
    // Entering build mode arms the first piece, so the rail is one click.
    if (mode === 'place' && !selectedKey) {
      const first = Object.keys(BUILD_PIECE_DEFS)[0] as BuildPieceKey;
      setSelectedBuildPiece(first);
    }
    if (mode !== 'place') {
      hideBuildOverlay();
      // A pending bulk selection has no meaning outside build mode — leaving
      // it armed would silently resurrect a stale group next time build mode
      // opens and something is clicked.
      clearSelectedPlacedPieces();
    }
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
      material: selectedMaterial,
    };
    setActionMode('place');
  }
}

/** Keep the ghost and claimed-space rings in the scene currently being drawn. */
export function setPlacementOverlayScene(nextScene: THREE.Scene) {
  if (!overlayRoot || overlayRoot.parent === nextScene) return;
  overlayRoot.removeFromParent();
  nextScene.add(overlayRoot);
}

export function hideBuildOverlay() {
  if (overlayRoot) overlayRoot.visible = false;
}

/** Rebuild the ghost only when the piece it represents actually changes. */
function syncGhost(key: BuildPieceKey | null, material: BuildMaterialId | null) {
  if (!ghostHost) return;
  if (key === ghostKey && material === ghostMaterial) return;
  ghostKey = key;
  ghostMaterial = key ? material : null;
  ghostHost.clear();
  ghost = null;
  if (!key) return;
  ghost = buildPlacedPieceVisual({
    id: 'ghost',
    templateKey: key,
    x: 0,
    z: 0,
    rotY: 0,
    // Nothing chosen yet — with an empty bag there may be nothing to choose —
    // so the ghost falls back to the piece's own original look, the same way
    // `resolveBuildMaterial` treats any value it does not recognise.
    material: material ?? '',
    makerId: LOCAL_MAKER_ID,
    page: '0,0',
  });
  ghostHost.add(ghost);
}

/**
 * Rebuild the bulk-carry ghost set only when the carried member set itself
 * changes (comparing id+templateKey+material, joined) — every frame after
 * that just repositions the same meshes, same as the solo ghost does.
 */
function syncGroupGhost(members: CarriedMember[] | null) {
  if (!groupGhostHost) return;
  const key = members
    ? members.map((member) => `${member.piece.id}:${member.piece.templateKey}:${member.piece.material}`).join('|')
    : null;
  if (key === groupGhostKey) return;
  groupGhostKey = key;
  groupGhostHost.clear();
  groupGhosts = [];
  if (!members) return;
  for (const member of members) {
    const mesh = buildPlacedPieceVisual({
      id: `ghost-${member.piece.id}`,
      templateKey: member.piece.templateKey,
      x: 0,
      z: 0,
      rotY: 0,
      material: member.piece.material,
      makerId: LOCAL_MAKER_ID,
      page: '0,0',
    });
    groupGhostHost.add(mesh);
    groupGhosts.push(mesh);
  }
}

/** Refresh rings showing the space already claimed by nearby pieces. */
function syncClaimedRings(avatarPosition: THREE.Vector3) {
  if (!claimedRings) return;
  claimedRings.clear();
  const activePageId = currentBuildPageId(avatarPosition.x, avatarPosition.z);
  const page = activePageId ? getGameState().world.pages[activePageId] : null;
  if (page) {
    for (const piece of Object.values(page.placedPieces)) {
      const distance = Math.hypot(piece.x - avatarPosition.x, piece.z - avatarPosition.z);
      if (distance > RING_VIEW_RADIUS) continue;
      const def = buildPieceDef(piece.templateKey);
      const ring = createGroundRing(Math.max(0.3, def.radiusX, def.radiusZ), CLAIMED_COLOR, 0.4);
      ring.position.set(piece.x, groundHeightAt(piece.x, piece.z) + 0.03, piece.z);
      claimedRings.add(ring);
    }
    for (const site of Object.values(page.buildSites)) {
      const distance = Math.hypot(site.x - avatarPosition.x, site.z - avatarPosition.z);
      if (distance > RING_VIEW_RADIUS) continue;
      const def = buildPieceDef(site.templateKey);
      const ring = createGroundRing(Math.max(0.3, def.radiusX, def.radiusZ), CLAIMED_COLOR, 0.32);
      ring.position.set(site.x, groundHeightAt(site.x, site.z) + 0.03, site.z);
      claimedRings.add(ring);
    }
  }
}

/** Highlight every piece currently waiting in the pending bulk-move
 * selection, so shift-clicking a second and third piece reads as building
 * up a group rather than as nothing visibly happening. */
function syncSelectionRings() {
  if (!selectionRings) return;
  selectionRings.clear();
  if (selectedPieceIds.size === 0) return;
  const activePageId = currentBuildPageId(avatar.position.x, avatar.position.z);
  const page = activePageId ? getGameState().world.pages[activePageId] : null;
  if (!page) return;
  for (const id of selectedPieceIds) {
    const piece = page.placedPieces[id];
    if (!piece) continue;
    const def = buildPieceDef(piece.templateKey);
    const ring = createGroundRing(Math.max(0.3, def.radiusX, def.radiusZ), SELECTED_COLOR, 0.55);
    ring.position.set(piece.x, groundHeightAt(piece.x, piece.z) + 0.032, piece.z);
    selectionRings.add(ring);
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
  syncSelectionRings();

  const pinned = activeBuildPreview;
  // Once a nudge has taken over, the mouse stays hands-off for the rest of
  // this carry (see nudgeActive) rather than stomping every keypress the
  // instant the pointer so much as twitches.
  if (carrying && !pinned && hover && !nudgeActive) carryHoverPoint = hover.clone();

  // A bulk carry (2+ members) has no single piece type for the normal
  // ghost/ring path below to represent, so it renders through its own
  // per-member ghost set instead. Solo carry and placing a brand-new piece
  // both keep the original single-ghost path completely unchanged.
  const bulk = carrying !== null && carrying.members.length > 1;
  if (bulk) {
    if (ghostHost) ghostHost.visible = false;
    targetRing.visible = false;
    syncGroupGhost(carrying!.members);
    const pivot = pinned ? pinned.point : carryHoverPoint;
    const assessment = pivot ? assessCarryDropAtPoint(pivot) : null;
    if (!pivot || !assessment || assessment.status === 'no-piece') {
      if (groupGhostHost) groupGhostHost.visible = false;
      return;
    }
    const color = assessment.status === 'valid' ? VALID_COLOR : INVALID_COLOR;
    const opacity = assessment.status === 'valid' ? 0.55 : 0.32;
    if (groupGhostHost) {
      groupGhostHost.visible = true;
      carryMemberTargets(pivot).forEach((target, index) => {
        const mesh = groupGhosts[index];
        if (!mesh) return;
        const groundY = groundHeightAt(target.x, target.z);
        mesh.position.set(target.x, groundY + 0.018, target.z);
        mesh.rotation.y = target.rotY;
        setGhostAppearance(mesh, color, opacity);
      });
    }
    return;
  }
  if (groupGhostHost) groupGhostHost.visible = false;

  const soloCarryPiece = carrying ? carrying.members[0].piece : null;
  const key = pinned?.key ?? (soloCarryPiece ? soloCarryPiece.templateKey as BuildPieceKey : selectedKey);
  const material = pinned?.material
    ?? (soloCarryPiece ? soloCarryPiece.material as BuildMaterialId : selectedMaterial);
  const displayPoint = pinned?.point ?? hover;
  const assessment = pinned
    ? { status: 'valid' as const, def: BUILD_PIECE_DEFS[pinned.key], point: pinned.point, rotY: pinned.rotY }
    : carrying
      ? (hover ? assessCarryDropAtPoint(hover) : null)
      : hover ? assessPlaceAtPoint(hover) : null;
  syncGhost(displayPoint && key ? key : null, material);

  if (!displayPoint || !assessment || assessment.status === 'no-piece') {
    targetRing.visible = false;
    if (ghostHost) ghostHost.visible = false;
    return;
  }

  const previewPoint = assessment.point ?? displayPoint;
  const groundY = groundHeightAt(previewPoint.x, previewPoint.z);
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
