// Generic "carry it, see a ghost, click to set it down" placement — the
// building system's UX (placement.ts), generalized for things that aren't
// build pieces: trinkets today, tools and resources once they can be picked
// up and dropped too. Deliberately free of placement.ts's footprint/material
// machinery, which is specific to walls and furniture — this only answers
// "is that spot within reach", the same bar trinkets were held to before
// (none at all, beyond standing wherever you clicked "place").
import * as THREE from 'three';
import { scene } from '../render/context';
import { RENDER_ORDER } from '../render/renderOrder';
import { avatar } from './avatar';
import { pickTerrainAtScreen } from './toolActions';
import { createGroundRing, setGhostAppearance } from './gardenOverlay';
import { showPetToast } from './petting';
import { registerScreenInteraction } from './interactionRouter';

export type CarriedDrop = {
  /** Named in the toast ("Placing the paper fox — click to set it down"). */
  label: string;
  /** Built once when carrying begins. Owned by this module from that point
   *  on — disposed when carrying ends, one way or another. */
  buildVisual: () => THREE.Object3D;
  /** The vertical gap between the ground and the visual's own origin, so the
   *  ghost sits exactly where the real thing will once it's confirmed. */
  groundOffset: number;
  /** Whether R is allowed to turn it before it's set down. */
  rotatable: boolean;
  /** The confirmed ground point and facing. Returning `ok: false` keeps
   *  carrying it — the caller found a reason of its own to refuse. */
  onDrop: (point: THREE.Vector3, rotY: number) => { ok: boolean; message?: string };
  /** Fired on Escape, or when a new carry begins mid-carry. Never fired after
   *  a successful onDrop. */
  onCancel?: () => void;
};

/** Same "arm's length" distance the build system holds placement to. */
const PLACE_REACH = 4.5;

const REACH_TINT = new THREE.Color('#ffffff');
const OUT_OF_REACH_TINT = new THREE.Color('#b4693f');
const RING_VALID_COLOR = new THREE.Color('#6f9b52');
const RING_INVALID_COLOR = new THREE.Color('#b4693f');

let carried: CarriedDrop | null = null;
let ghost: THREE.Object3D | null = null;
let targetRing: THREE.Mesh | null = null;
let rotY = 0;

function disposeVisual(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  });
}

export function isCarryingDrop() {
  return carried !== null;
}

/** The label of whatever's currently being carried, for the HUD/cursor to
 *  ask about without importing the whole carry state. */
export function carriedDropLabel(): string | null {
  return carried?.label ?? null;
}

function teardown() {
  if (ghost) {
    scene.remove(ghost);
    disposeVisual(ghost);
    ghost = null;
  }
  if (targetRing) targetRing.visible = false;
  carried = null;
  rotY = 0;
}

/** Escape while carrying, or starting a new carry mid-carry: whatever was
 *  being carried goes back where it came from (the caller's `onCancel`
 *  decides what that means — the shelf, the inventory, wherever). */
export function cancelDropCarry(): boolean {
  if (!carried) return false;
  const { onCancel } = carried;
  teardown();
  onCancel?.();
  return true;
}

export function beginDropCarry(item: CarriedDrop) {
  cancelDropCarry();
  if (!targetRing) {
    targetRing = createGroundRing(0.4, RING_VALID_COLOR, 0.6);
    targetRing.renderOrder = RENDER_ORDER.gardenRing;
    targetRing.visible = false;
    scene.add(targetRing);
  }
  carried = item;
  rotY = 0;
  ghost = item.buildVisual();
  scene.add(ghost);
  const verb = item.rotatable ? ', R to turn it, ' : ', ';
  showPetToast(`Placing ${item.label} — click to set it down${verb}Esc to put it back`);
}

export function rotateDropCarry(): boolean {
  if (!carried || !carried.rotatable) return false;
  rotY += Math.PI / 2;
  return true;
}

function withinReach(point: THREE.Vector3) {
  return Math.hypot(point.x - avatar.position.x, point.z - avatar.position.z) <= PLACE_REACH;
}

/** Called every frame while carrying, from both the indoor and outdoor loops
 *  (main.ts), the same way updateBuildOverlay already is. A no-op the rest
 *  of the time. */
export function updateDropPlacement(clientX: number, clientY: number) {
  if (!carried || !ghost || !targetRing) return;
  const point = pickTerrainAtScreen(clientX, clientY);
  if (!point) {
    ghost.visible = false;
    targetRing.visible = false;
    return;
  }
  const valid = withinReach(point);

  ghost.visible = true;
  ghost.position.set(point.x, point.y + carried.groundOffset, point.z);
  ghost.rotation.y = rotY;
  setGhostAppearance(ghost as THREE.Group, valid ? REACH_TINT : OUT_OF_REACH_TINT, valid ? 0.7 : 0.35);

  targetRing.visible = true;
  targetRing.position.set(point.x, point.y + 0.03, point.z);
  const ringMaterial = targetRing.material as THREE.MeshBasicMaterial;
  ringMaterial.color.copy(valid ? RING_VALID_COLOR : RING_INVALID_COLOR);
}

/**
 * The actual click, not the last hover frame — recomputed fresh from the
 * click's own coordinates so a tap with no preceding pointermove (touch,
 * most of the time) still lands exactly where it was aimed, rather than
 * trusting whatever updateDropPlacement() last happened to see.
 */
function tryDropAt(clientX: number, clientY: number): boolean {
  if (!carried) return false;
  const point = pickTerrainAtScreen(clientX, clientY);
  if (!point) {
    showPetToast("That's too far to reach — walk a little closer");
    return true; // handled the click (with a refusal), not a miss
  }
  if (!withinReach(point)) {
    showPetToast('That spot is out of reach — walk a little closer');
    return true;
  }
  const item = carried;
  const result = item.onDrop(point, rotY);
  if (!result.ok) {
    if (result.message) showPetToast(result.message);
    return true;
  }
  teardown();
  return true;
}

// One entry in the shared screen-interaction router (see
// game/interactionRouter.ts) rather than a bespoke hook in main.ts's click
// handler — carrying something claims the click the same way build mode's
// own placement does, and cannot be shadowed by a lower-priority verb.
registerScreenInteraction({
  id: 'drop-carry',
  // Above every other verb: once you're carrying something, every click is
  // about setting it down until you cancel, never a tool swing or a chat
  // with whatever happens to be under the cursor.
  priority: 100,
  scene: 'any',
  hitTest: () => isCarryingDrop(),
  interact: (clientX, clientY) => tryDropAt(clientX, clientY),
});
