import * as THREE from 'three';
import { camera, scene } from '../render/context';
import { dispatchGameCommand } from '../sim/commands';
import { getGameState } from '../sim/state';
import { plantHarvest, plantHarvestDurationMs, plantProduce } from '../sim/catalogs/seeds';
import { RESOURCE_CORE_DEFS } from '../sim/catalogs/resources';
import type { TerrainCellAddress } from '../sim/terrainCells';
import { avatar } from './avatar';
import { playCozySound } from './cozyAudio';
import { showResourceGain } from './harvesting';
import { showPetToast } from './petting';
import { refreshBuiltTerrainNear } from '../world/streaming';
import { startTimedAction } from './timedAction';

type PlantEntry = TerrainCellAddress & {
  id: string;
  object: THREE.Group;
  seedPickup: THREE.Group;
  baseScale: THREE.Vector3;
  activeFor: number;
};

const INTERACT_REACH = 3.8;
const WALK_PICKUP_RADIUS = 0.72;
const PICK_SLOP_PX = 36;
const plants = new Map<string, PlantEntry>();
const seedWalkOverlaps = new Set<string>();
const pendingPlantHarvests = new Set<string>();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const projected = new THREE.Vector3();
let nextSeedUpdate = 0;

export function registerTerrainPlant(options: Omit<PlantEntry, 'seedPickup' | 'baseScale' | 'activeFor'>) {
  const seedPickup = options.object.userData.seedPickup;
  if (!(seedPickup instanceof THREE.Group)) return;
  plants.set(options.id, {
    ...options,
    seedPickup,
    baseScale: options.object.scale.clone(),
    activeFor: plants.get(options.id)?.activeFor ?? 0,
  });
}

function isAttachedAndVisible(object: THREE.Object3D) {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (!node.visible) return false;
    if (node === scene) return true;
    node = node.parent;
  }
  return false;
}

function stateFor(entry: PlantEntry) {
  return getGameState().world.pages[entry.pageId]?.terrainEdits[entry.cellKey];
}

function visiblePlants() {
  return [...plants.values()].filter((entry) => isAttachedAndVisible(entry.object));
}

type PickedPlant = { entry: PlantEntry; target: 'flower' | 'seed' };

function pickPlantAt(clientX: number, clientY: number): PickedPlant | null {
  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const visible = visiblePlants();
  const hits = raycaster.intersectObjects(visible.map((entry) => entry.object), true);
  if (hits.length > 0) {
    let node: THREE.Object3D | null = hits[0].object;
    while (node) {
      const seedOwner = visible.find((entry) => entry.seedPickup === node && entry.seedPickup.visible);
      if (seedOwner) return { entry: seedOwner, target: 'seed' };
      const flowerOwner = visible.find((entry) => entry.object === node);
      if (flowerOwner) return { entry: flowerOwner, target: 'flower' };
      node = node.parent;
    }
  }

  let nearest: PickedPlant | null = null;
  let nearestPixels = PICK_SLOP_PX;
  for (const entry of visible) {
    const targetObject = entry.seedPickup.visible ? entry.seedPickup : entry.object;
    targetObject.getWorldPosition(projected);
    if (!entry.seedPickup.visible) projected.y += 0.3;
    projected.project(camera);
    if (projected.z > 1) continue;
    const screenX = ((projected.x + 1) / 2) * window.innerWidth;
    const screenY = ((1 - projected.y) / 2) * window.innerHeight;
    const pixels = Math.hypot(screenX - clientX, screenY - clientY);
    if (pixels < nearestPixels) {
      nearestPixels = pixels;
      nearest = { entry, target: entry.seedPickup.visible ? 'seed' : 'flower' };
    }
  }
  return nearest;
}

export function hasPlantInteractionAt(clientX: number, clientY: number) {
  return pickPlantAt(clientX, clientY) !== null;
}

function collectDrop(entry: PlantEntry) {
  const editBefore = stateFor(entry);
  const seedId = editBefore?.plantedSeedId;
  const harvest = seedId ? plantHarvest(seedId) : null;
  const result = dispatchGameCommand({ type: 'collectPlantSeed', target: entry, now: Date.now() });
  if (!result.ok) return false;
  entry.seedPickup.visible = false;
  playCozySound('rustle');
  const produced = seedId ? plantProduce(seedId) : null;
  showResourceGain(produced ?? 'buttonbloom-seeds', harvest?.quantity ?? 1);
  refreshBuiltTerrainNear(entry.x, entry.z);
  return true;
}

function startPlantHarvest(entry: PlantEntry) {
  pendingPlantHarvests.add(entry.id);
  const seedId = stateFor(entry)?.plantedSeedId;
  const durationMs = seedId ? plantHarvestDurationMs(seedId) : 1_350;
  const started = startTimedAction({
    steps: [{ kind: 'harvest', durationMs }],
    onComplete: () => {
      pendingPlantHarvests.delete(entry.id);
      collectDrop(entry);
    },
    onCancel: () => pendingPlantHarvests.delete(entry.id),
  });
  if (!started) pendingPlantHarvests.delete(entry.id);
  return true;
}

export function tryPlantInteractionAt(clientX: number, clientY: number) {
  const picked = pickPlantAt(clientX, clientY);
  if (!picked) return false;
  picked.entry.object.getWorldPosition(projected);
  if (Math.hypot(projected.x - avatar.position.x, projected.z - avatar.position.z) > INTERACT_REACH) {
    showPetToast(
      `${picked.target === 'seed' ? 'That drop' : 'The plant'} is over there — walk closer`,
    );
    return true;
  }
  if (picked.target === 'seed') return startPlantHarvest(picked.entry);

  const result = dispatchGameCommand({ type: 'tendPlant', target: picked.entry, now: Date.now() });
  if (!result.ok) return true;
  picked.entry.activeFor = 1;
  playCozySound('chime');
  showPetToast(result.message);
  return true;
}

export function updatePlantInteractions(delta: number, elapsed: number) {
  const now = Date.now();
  const shouldCheckDrops = now >= nextSeedUpdate;
  if (shouldCheckDrops) nextSeedUpdate = now + 500;

  for (const entry of visiblePlants()) {
    let edit = stateFor(entry);
    if (!edit || edit.state !== 'planted') continue;
    if (
      shouldCheckDrops
      && !edit.seedDropReady
      && (!edit.nextSeedDropAt || now >= edit.nextSeedDropAt)
    ) {
      const result = dispatchGameCommand({ type: 'updatePlantSeedDrop', target: entry, now });
      edit = stateFor(entry);
      if (result.ok && edit?.seedDropReady) {
        entry.activeFor = 1;
      }
    }
    entry.seedPickup.visible = Boolean(edit?.seedDropReady);

    if (entry.seedPickup.visible) {
      entry.seedPickup.getWorldPosition(projected);
      const isOverlapping = Math.hypot(projected.x - avatar.position.x, projected.z - avatar.position.z) <= WALK_PICKUP_RADIUS;
      const produced = edit?.plantedSeedId ? plantProduce(edit.plantedSeedId) : null;
      const isFoodHarvest = produced ? RESOURCE_CORE_DEFS[produced].category === 'food' : false;
      // Loose flower seeds still behave like walk-over pickups. Food stays on
      // the plant until the player deliberately performs the harvest action.
      if (
        isOverlapping
        && !seedWalkOverlaps.has(entry.id)
        && !isFoodHarvest
        && !pendingPlantHarvests.has(entry.id)
      ) collectDrop(entry);
      if (isOverlapping) seedWalkOverlaps.add(entry.id);
      else seedWalkOverlaps.delete(entry.id);
    } else {
      seedWalkOverlaps.delete(entry.id);
    }

    if (entry.activeFor > 0) entry.activeFor = Math.max(0, entry.activeFor - delta / 1.2);
    const tendBounce = Math.sin((1 - entry.activeFor) * Math.PI * 5) * entry.activeFor;
    const breeze = Math.sin(elapsed * 1.7 + entry.x * 0.4 + entry.z * 0.3) * 0.012;
    entry.object.scale.copy(entry.baseScale).multiplyScalar(1 + Math.abs(tendBounce) * 0.09 + breeze);
  }
}
