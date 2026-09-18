import * as THREE from 'three';
import { scene } from '../render/context';
import { sampleTerrainHeight } from '../world/terrain';
import { isPageActive } from '../world/streaming';
import { getGameState, onGameStateChanged, type TrinketInstance } from '../sim/state';
import { getTrinketDef, type TrinketDef } from '../sim/catalogs/trinkets';
import { buildTrinketRig, animateTrinketRig } from './trinketRigs';
import { getTrinketInstance } from './trinkets';

/**
 * Trinket *visuals*: the little objects standing in the world.
 *
 * Kept apart from `trinkets.ts` (which owns the save data) so the quest
 * runtime, and any headless test of it, never has to load three.js or touch
 * the DOM. The coupling is one-directional: this module reads the save and
 * never writes it.
 *
 * Visuals are added straight to the scene rather than into a page group. A
 * trinket is not part of a generated page — no seed produced it — so the world
 * generator must never see it. Instead the rig is hidden while its page is
 * streamed out, which is exactly the behaviour a page group would have given,
 * with none of the coupling.
 */

type TrinketVisual = {
  group: THREE.Group;
  def: TrinketDef;
  /** Cached at sync time so the per-frame update never looks a trinket up. */
  pageId: string;
};

const visuals = new Map<string, TrinketVisual>();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function disposeGroup(group: THREE.Group) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  });
}

/** Rebuild the world's trinket visuals to match the save. Idempotent. */
export function syncTrinketVisuals(): void {
  const placed = getGameState().player.trinkets.filter((trinket) => trinket.placed);
  const liveIds = new Set(placed.map((trinket) => trinket.id));

  for (const [id, visual] of visuals) {
    if (liveIds.has(id)) continue;
    scene.remove(visual.group);
    disposeGroup(visual.group);
    visuals.delete(id);
  }

  for (const trinket of placed) {
    const placement = trinket.placed!;
    let visual = visuals.get(trinket.id);
    if (!visual) {
      const def = getTrinketDef(trinket.defId);
      if (!def) continue;
      const group = buildTrinketRig(def, trinket.seed);
      group.name = `trinket:${trinket.id}`;
      group.userData.trinketId = trinket.id;
      scene.add(group);
      visual = { group, def, pageId: placement.pageId };
      visuals.set(trinket.id, visual);
    }
    visual.pageId = placement.pageId;
    visual.group.position.set(
      placement.x,
      sampleTerrainHeight(placement.x, placement.z) + 0.02,
      placement.z,
    );
    visual.group.rotation.y = placement.rotY;
    visual.group.visible = isPageActive(placement.pageId);
  }
}

/** Wire the visuals to the save and to the render scene. Call once at boot. */
export function initializeTrinketVisuals(): void {
  syncTrinketVisuals();
  onGameStateChanged(syncTrinketVisuals);
}

export function updateTrinkets(delta: number, elapsed: number): void {
  for (const visual of visuals.values()) {
    // Everything needed is cached on the visual: this runs every frame, and a
    // save lookup per placed trinket per frame would scale with the whole
    // collection rather than with what is actually on screen.
    visual.group.visible = isPageActive(visual.pageId);
    if (!visual.group.visible) continue;
    animateTrinketRig(visual.group, visual.def, elapsed, delta);
  }
}

/** The placed trinket under a screen point, for pickup clicks. */
export function pickTrinketAtScreen(clientX: number, clientY: number, camera: THREE.Camera): TrinketInstance | null {
  pointer.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(pointer, camera);
  const groups = [...visuals.values()]
    .filter((visual) => visual.group.visible)
    .map((visual) => visual.group);
  const hits = raycaster.intersectObjects(groups, true);
  if (hits.length === 0) return null;
  let node: THREE.Object3D | null = hits[0].object;
  while (node) {
    const id = node.userData?.trinketId as string | undefined;
    if (id) return getTrinketInstance(id);
    node = node.parent;
  }
  return null;
}
