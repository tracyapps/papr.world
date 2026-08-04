import * as THREE from 'three';
import { camera } from '../render/context';
import { RESOURCE_DEFS } from '../world/resources';
import type { ResourceId } from '../world/types';
import { avatar } from './avatar';
import { playCozySound } from './cozyAudio';
import { addResource, getResourceCount } from './resourceInventory';
import { showPetToast } from './petting';
import { getGameState, updateGameState } from '../sim/state';
import { getToastStack } from '../ui/hudLayout';

const HARVEST_REACH = 3.4;
/** Walking across the visible bundle gathers it without another input. */
const WALK_PICKUP_RADIUS = 0.82;

type HarvestState = Record<string, number>;
type Harvestable = {
  id: string;
  object: THREE.Group;
  resource: ResourceId;
  amount: number;
  respawnSeconds: number;
  respawnAt: number;
};

const harvestables: Harvestable[] = [];
const walkOverlaps = new Set<string>();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const projected = new THREE.Vector3();
const PICK_SLOP_PX = 34;
let inventoryChip: HTMLElement | null = null;
let chipTimer: number | undefined;

function loadState(): HarvestState {
  return getGameState().world.harvestRespawns;
}

export function registerHarvestable(options: Omit<Harvestable, 'respawnAt'>) {
  if (harvestables.some((entry) => entry.id === options.id)) return;
  const respawnAt = loadState()[options.id] ?? 0;
  options.object.visible = respawnAt <= Date.now();
  harvestables.push({ ...options, respawnAt });
}

function pickHarvestableAt(clientX: number, clientY: number): Harvestable | null {
  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const available = harvestables.filter((entry) => entry.object.visible && entry.object.parent?.visible !== false);
  const hits = raycaster.intersectObjects(available.map((entry) => entry.object), true);
  if (hits.length > 0) {
    let node: THREE.Object3D | null = hits[0].object;
    while (node) {
      const harvestable = available.find((entry) => entry.object === node);
      if (harvestable) return harvestable;
      node = node.parent;
    }
  }

  // Small ground resources deserve the same forgiving screen-space picking as
  // critters. Exact geometry remains preferred; this only catches near misses.
  let nearest: Harvestable | null = null;
  let nearestPixels = PICK_SLOP_PX;
  for (const harvestable of available) {
    harvestable.object.getWorldPosition(projected);
    projected.y += 0.18;
    projected.project(camera);
    if (projected.z > 1) continue;
    const screenX = ((projected.x + 1) / 2) * window.innerWidth;
    const screenY = ((1 - projected.y) / 2) * window.innerHeight;
    const pixels = Math.hypot(screenX - clientX, screenY - clientY);
    if (pixels < nearestPixels) {
      nearestPixels = pixels;
      nearest = harvestable;
    }
  }
  return nearest;
}

export function isHarvestableAtScreen(clientX: number, clientY: number) {
  return pickHarvestableAt(clientX, clientY) !== null;
}

export function showResourceGain(resource: ResourceId, amount: number) {
  if (!inventoryChip) return;
  const definition = RESOURCE_DEFS[resource];
  inventoryChip.innerHTML = `<strong>+${amount} ${definition.shortLabel}</strong><span>${getResourceCount(resource)} in your scrapbook</span>`;
  inventoryChip.classList.add('is-visible');
  window.clearTimeout(chipTimer);
  chipTimer = window.setTimeout(() => inventoryChip?.classList.remove('is-visible'), 2800);
}

export function initializeHarvesting() {
  // Previously fixed at right:18/top:190 — identical coordinates to the
  // saved-places panel, which sits at a higher z-index and hid every
  // harvest gain. Now a flow child of the shared toast stack.
  inventoryChip = document.createElement('div');
  inventoryChip.className = 'harvest-toast';
  inventoryChip.setAttribute('aria-live', 'polite');
  getToastStack().append(inventoryChip);
}

export function tryHarvestAt(clientX: number, clientY: number): boolean {
  const harvestable = pickHarvestableAt(clientX, clientY);
  if (!harvestable) return false;

  const worldPosition = new THREE.Vector3();
  harvestable.object.getWorldPosition(worldPosition);
  const distance = Math.hypot(worldPosition.x - avatar.position.x, worldPosition.z - avatar.position.z);
  if (distance > HARVEST_REACH) {
    showPetToast(`${RESOURCE_DEFS[harvestable.resource].label} — walk closer to gather it`);
    return true;
  }

  collectHarvestable(harvestable);
  return true;
}

function collectHarvestable(harvestable: Harvestable) {
  if (!harvestable.object.visible) return;
  addResource(harvestable.resource, harvestable.amount);
  harvestable.object.visible = false;
  harvestable.respawnAt = Date.now() + harvestable.respawnSeconds * 1000;
  updateGameState((state) => {
    state.world.harvestRespawns[harvestable.id] = harvestable.respawnAt;
  });
  playCozySound(harvestable.resource.includes('stone') || harvestable.resource.includes('pebble') ? 'plop' : 'rustle');
  showResourceGain(harvestable.resource, harvestable.amount);
}

export function updateHarvestables() {
  const now = Date.now();
  let changed = false;
  for (const harvestable of harvestables) {
    harvestable.object.getWorldPosition(projected);
    const distance = Math.hypot(projected.x - avatar.position.x, projected.z - avatar.position.z);
    const isOverlapping = distance <= WALK_PICKUP_RADIUS && harvestable.object.parent?.visible !== false;
    if (isOverlapping && !walkOverlaps.has(harvestable.id) && harvestable.object.visible) {
      collectHarvestable(harvestable);
    }
    if (isOverlapping) walkOverlaps.add(harvestable.id);
    else walkOverlaps.delete(harvestable.id);

    if (harvestable.object.visible || harvestable.respawnAt <= 0 || now < harvestable.respawnAt) continue;
    harvestable.respawnAt = 0;
    harvestable.object.visible = true;
    delete loadState()[harvestable.id];
    changed = true;
  }
  if (changed) {
    updateGameState((state) => {
      for (const harvestable of harvestables) {
        if (harvestable.respawnAt <= 0) delete state.world.harvestRespawns[harvestable.id];
      }
    });
  }
}
