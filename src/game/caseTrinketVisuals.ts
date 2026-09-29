import * as THREE from 'three';
import { DISPLAY_CASE_TEMPLATE } from '../../shared/src/index';
import { getTrinketDef, type TrinketDef } from '../sim/catalogs/trinkets';
import { getGameState, onGameStateChanged } from '../sim/state';
import { animateTrinketRig, buildTrinketRig } from './trinketRigs';
import { getPlacedPieceVisual } from './placedPieceInteractions';
import { listCases, subscribeCases, type CaseHandle, type CaseView } from './cases';
import { getSharedPieceVisual } from '../net/sharedPieceVisuals';
import { RESOURCE_DEFS } from '../world/resources';
import { getMaterial } from '../render/materials';
import {
  DISPLAY_CASE_LID,
  DISPLAY_CASE_SHAPE,
  buildDisplayCaseLevel,
  displayCaseFloorY,
  displayCaseLidY,
} from '../world/buildPieceVisuals';

/**
 * What a display case shows beyond its own piece: the extra glass levels the
 * owner has added, and the things set out on every level. All of it is a
 * decorative child of the case's own rendered group, so it inherits position,
 * rotation and visibility for free. Measurements come from
 * `DISPLAY_CASE_SHAPE` in world/buildPieceVisuals.ts, the one place they live.
 *
 * Each level holds `LIMITS.caseSlotsPerShelf` things in two rows of four: the
 * front row on the level's floor, the back row up on a low riser so it shows
 * over the front. Every keepsake is fitted to its slot (never larger than it
 * used to be drawn), because a keepsake can be tall or wide and a case is
 * neither -- this is what keeps the tallest one under the shelf above.
 *
 * A rebuild happens only when a case's contents or height change, or the
 * object representing the case is replaced. Per frame, the keepsakes move the
 * way they do on a shelf at home (`updateCaseTrinkets`), and only while their
 * case is actually drawn.
 *
 * Both keepsakes and stocked goods occupy slots, matching the panel.
 */

type Slot = { x: number; y: number; z: number };

/** Every slot of a case this many shelves tall, in fill order: level by level, front row first. */
export function caseSlotPositions(shelves: number): Slot[] {
  const { sheetHalf, riser, rows, columns } = DISPLAY_CASE_SHAPE;
  const slots: Slot[] = [];
  for (let level = 0; level < shelves; level += 1) {
    const floor = displayCaseFloorY(level) + sheetHalf;
    for (const row of rows) {
      for (const x of columns) slots.push({ x, y: floor + (row.raised ? riser.height : 0), z: row.z });
    }
  }
  return slots;
}

/** How keepsakes were drawn before they were fitted: the most a fitted one may grow to. */
const TRINKET_SCALE_MAX = 1.5;
/** Headroom for motions that lift or swing a keepsake off its rest pose (flip, orbit). */
const MOTION_ROOM = 0.9;

const restBox = new THREE.Box3();
const restCenter = new THREE.Vector3();

/**
 * Scale a keepsake rig to fit one slot and stand it there. Measured once, at
 * rest, when the case is rebuilt -- never per frame.
 */
function fitRigToSlot(rig: THREE.Object3D, slot: Slot) {
  const { slotFootprint, slotHeight } = DISPLAY_CASE_SHAPE;
  rig.position.set(0, 0, 0);
  rig.updateMatrixWorld(true);
  restBox.setFromObject(rig);
  const width = restBox.max.x - restBox.min.x;
  const depth = restBox.max.z - restBox.min.z;
  const height = restBox.max.y;
  const base = rig.scale.x;
  let fit = TRINKET_SCALE_MAX;
  if (Math.max(width, depth) > 0) fit = Math.min(fit, (slotFootprint * MOTION_ROOM) / Math.max(width, depth));
  if (height > 0) fit = Math.min(fit, (slotHeight * MOTION_ROOM) / height);
  rig.scale.setScalar(base * fit);
  // Centre what it actually is over the slot: some rigs sit off their origin.
  restBox.getCenter(restCenter);
  rig.position.set(slot.x - restCenter.x * fit, slot.y, slot.z - restCenter.z * fit);
}

type AnimatedRig = { group: THREE.Group; def: TrinketDef };
type AnchoredSlots = { anchor: THREE.Object3D; group: THREE.Group; signature: string; rigs: AnimatedRig[] };

const anchored = new Map<string, AnchoredSlots>();

function disposeGroup(group: THREE.Group) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  });
}

/** Whichever object is actually rendering this case right now. A case you
 * built always has a local piece (see cases.ts); one a neighbor built and
 * shared has only the server-echoed copy. When both exist -- the usual case
 * for a shared case you built yourself, since the server gives its echo an
 * id of its own (publishSharedPlacedPiece sends none) -- the local one wins,
 * matching what `hasLocalEquivalent` already decided is visible
 * (sharedPieceVisuals.ts): the echo stands hidden, and trinkets parented to
 * it would be hidden with it. */
function anchorFor(view: CaseView): THREE.Object3D | null {
  return getPlacedPieceVisual(view.handle.id)
    ?? localPieceVisualAt(view.handle)
    ?? getSharedPieceVisual(view.handle.id);
}

/** The drawn piece standing where this view's case stands. The view's id is
 * the server echo's, which matches no local piece, so a shared case you
 * built yourself is tied back to your own piece by its page and spot. */
function localPieceVisualAt(handle: CaseHandle): THREE.Object3D | null {
  const pieces = getGameState().world.pages[handle.page]?.placedPieces ?? {};
  for (const piece of Object.values(pieces)) {
    if (piece.templateKey !== DISPLAY_CASE_TEMPLATE) continue;
    if (Math.abs(piece.x - handle.x) >= 0.01 || Math.abs(piece.z - handle.z) >= 0.01) continue;
    const visual = getPlacedPieceVisual(piece.id);
    if (visual) return visual;
  }
  return null;
}

function signatureFor(view: CaseView): string {
  return JSON.stringify([view.shelves, view.items]);
}

/** Whether a case needs anything drawn beyond its own piece. */
function needsContents(view: CaseView): boolean {
  return view.items.length > 0 || view.shelves > 1;
}

/** Stand the lid on top of however many levels there are. Absolute, so it is right after any change. */
function placeLid(anchor: THREE.Object3D, shelves: number) {
  const lid = anchor.getObjectByName(DISPLAY_CASE_LID);
  if (lid) lid.position.y = displayCaseLidY(shelves);
}

function buildSlotGroup(view: CaseView): { group: THREE.Group; rigs: AnimatedRig[] } {
  const slots = new THREE.Group();
  slots.name = 'case-trinkets';
  const rigs: AnimatedRig[] = [];
  // The levels above the first, which the piece itself does not draw.
  for (let level = 1; level < view.shelves; level += 1) slots.add(buildDisplayCaseLevel(level));
  const positions = caseSlotPositions(view.shelves);
  view.items.slice(0, positions.length).forEach((item, index) => {
    const slot = positions[index];
    if (item.kind === 'trinket') {
      const def = getTrinketDef(item.defId);
      if (!def) return;
      const rig = buildTrinketRig(def, item.seed);
      fitRigToSlot(rig, slot);
      slots.add(rig);
      rigs.push({ group: rig, def });
      return;
    }
    // Shared free cases hold resources, tools, and ordinary items. They do
    // not have individual world rigs, so a small paper parcel represents
    // each occupied slot, with the resource's own paper when available.
    const material = item.kind === 'resource'
      ? getMaterial(RESOURCE_DEFS[item.itemId as keyof typeof RESOURCE_DEFS]?.material ?? 'paper.cork')
      : getMaterial(item.kind === 'tool' ? 'paper.grey' : 'paper.salmon');
    const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.16), material);
    parcel.name = `case-item-${item.kind}`;
    parcel.position.set(slot.x, slot.y + 0.065, slot.z);
    parcel.castShadow = true;
    slots.add(parcel);
  });
  return { group: slots, rigs };
}

function takeDown(entry: AnchoredSlots) {
  entry.anchor.remove(entry.group);
  placeLid(entry.anchor, 1);
  disposeGroup(entry.group);
}

/** Rebuild whatever needs it to match the current cases. Idempotent, and
 * cheap when nothing changed -- every case is skipped unless its contents,
 * its height, or its anchor object have actually changed since last time. */
export function syncCaseTrinketVisuals(): void {
  const views = listCases();
  const liveKeys = new Set(views.map((view) => view.handle.key));

  for (const [key, entry] of anchored) {
    if (liveKeys.has(key)) continue;
    takeDown(entry);
    anchored.delete(key);
  }

  for (const view of views) {
    const anchor = anchorFor(view);
    const signature = signatureFor(view);
    const existing = anchored.get(view.handle.key);

    if (!anchor || !needsContents(view)) {
      if (existing) {
        takeDown(existing);
        anchored.delete(view.handle.key);
      }
      continue;
    }

    if (existing && existing.anchor === anchor && existing.signature === signature) continue;

    if (existing) takeDown(existing);

    const { group, rigs } = buildSlotGroup(view);
    anchor.add(group);
    placeLid(anchor, view.shelves);
    anchored.set(view.handle.key, { anchor, group, signature, rigs });
  }
}

/** Drawn right now: this object and everything above it visible, all the way up to a scene. */
function isDrawn(object: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (!node.visible) return false;
    if ((node as THREE.Scene).isScene) return true;
    node = node.parent;
  }
  return false;
}

/**
 * Keepsakes in a case move the way they do on a shelf at home. Called every
 * frame; a case that is not drawn (another page, hidden echo, indoors) costs
 * one walk up its parents and nothing more.
 */
export function updateCaseTrinkets(delta: number, elapsed: number): void {
  for (const entry of anchored.values()) {
    if (entry.rigs.length === 0 || !isDrawn(entry.anchor)) continue;
    for (const rig of entry.rigs) animateTrinketRig(rig.group, rig.def, elapsed, delta);
  }
}

/** Wire the visuals to the case data and the save. Call once at boot. */
export function initializeCaseTrinketVisuals(): void {
  syncCaseTrinketVisuals();
  subscribeCases(syncCaseTrinketVisuals);
  onGameStateChanged(syncCaseTrinketVisuals);
}
