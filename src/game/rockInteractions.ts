import * as THREE from 'three';
import { camera, scene } from '../render/context';
import { dispatchGameCommand } from '../sim/commands';
import {
  rockFormationName,
  rockGrowthAt,
  rockIsReady,
  type RockFormation,
} from '../sim/catalogs/mining';
import type { Biome } from '../sim/catalogs/biomes';
import { TOOL_DEFS } from '../sim/catalogs/tools';
import { getGameState } from '../sim/state';
import { refreshBuiltPageDrops } from '../world/streaming';
import { getActionMode } from './actionMode';
import { avatar } from './avatar';
import { playCozySound } from './cozyAudio';
import { showPetToast } from './petting';

const MINE_REACH = 3.6;
const MINE_HINT_REACH = 9;
const PICK_SLOP_PX = 44;
const RESTAGE_INTERVAL_MS = 500;

type RockEntry = {
  id: string;
  object: THREE.Mesh;
  pageId: string;
  rockKey: string;
  formation: RockFormation;
  biome: Biome;
  x: number;
  z: number;
  height: number;
  baseY: number;
};

const rocks = new Map<string, RockEntry>();
const recovering = new Set<string>();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const projected = new THREE.Vector3();
let nextRestageAt = 0;

function growthRecordFor(entry: RockEntry) {
  return getGameState().world.pages[entry.pageId]?.rockGrowth?.[entry.rockKey];
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

function restage(entry: RockEntry, now: number) {
  const growth = rockGrowthAt(growthRecordFor(entry), now);
  // A depleted cutout folds down small, then steadily reforms in place. It
  // remains visible so the renewable source never looks deleted or broken.
  const scale = 0.28 + 0.72 * (growth / 100);
  entry.object.scale.setScalar(scale);
  entry.object.position.y = entry.baseY + entry.height * scale / 2;
  if (growth >= 100) recovering.delete(entry.id);
}

export function registerMineableRock(entry: RockEntry) {
  rocks.set(entry.id, entry);
  if (growthRecordFor(entry)) recovering.add(entry.id);
  restage(entry, Date.now());
}

function candidates(reach: number) {
  return [...rocks.values()].filter((entry) => (
    Math.hypot(entry.x - avatar.position.x, entry.z - avatar.position.z) <= reach
    && isAttachedAndVisible(entry.object)
  ));
}

function pickRockAt(clientX: number, clientY: number, reach: number): RockEntry | null {
  const available = candidates(reach);
  if (available.length === 0) return null;

  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(available.map((entry) => entry.object), false);
  if (hits.length > 0) {
    const hit = available.find((entry) => entry.object === hits[0].object);
    if (hit) return hit;
  }

  let nearest: RockEntry | null = null;
  let nearestPixels = PICK_SLOP_PX;
  for (const entry of available) {
    projected.set(entry.x, entry.baseY + entry.height * 0.45, entry.z);
    projected.project(camera);
    if (projected.z > 1) continue;
    const screenX = ((projected.x + 1) / 2) * window.innerWidth;
    const screenY = ((1 - projected.y) / 2) * window.innerHeight;
    const pixels = Math.hypot(screenX - clientX, screenY - clientY);
    if (pixels < nearestPixels) {
      nearestPixels = pixels;
      nearest = entry;
    }
  }
  return nearest;
}

function equippedMineTool() {
  const state = getGameState();
  const toolId = state.player.equippedTool;
  if (!toolId || (state.player.tools[toolId] ?? 0) <= 0) return null;
  const tool = TOOL_DEFS[toolId];
  return tool.verb === 'mine' ? tool : null;
}

export type MineTargetStatus = 'valid' | 'no-tool' | 'no-rock' | 'out-of-reach' | 'reforming';

export function assessMineTarget(clientX: number, clientY: number): {
  status: MineTargetStatus;
  entry?: RockEntry;
} {
  if (!equippedMineTool()) return { status: 'no-tool' };
  const entry = pickRockAt(clientX, clientY, MINE_REACH)
    ?? pickRockAt(clientX, clientY, MINE_HINT_REACH);
  if (!entry) return { status: 'no-rock' };
  if (Math.hypot(entry.x - avatar.position.x, entry.z - avatar.position.z) > MINE_REACH) {
    return { status: 'out-of-reach', entry };
  }
  if (!rockIsReady(growthRecordFor(entry), Date.now())) return { status: 'reforming', entry };
  return { status: 'valid', entry };
}

export function hasMineActionAt(clientX: number, clientY: number) {
  if (getActionMode() !== 'mine') return false;
  const { status } = assessMineTarget(clientX, clientY);
  return status !== 'no-tool' && status !== 'no-rock';
}

export function tryMineAt(clientX: number, clientY: number): boolean {
  if (getActionMode() !== 'mine') return false;
  const assessment = assessMineTarget(clientX, clientY);
  if (assessment.status === 'no-tool' || assessment.status === 'no-rock') return false;

  const entry = assessment.entry!;
  const name = rockFormationName(entry.formation);
  if (assessment.status === 'out-of-reach') {
    showPetToast(`That ${name} is over there — walk closer to reach it`);
    return true;
  }
  if (assessment.status === 'reforming') {
    showPetToast(`The ${name} is still folding itself back together.`);
    return true;
  }

  const result = dispatchGameCommand({
    type: 'mineRock',
    target: {
      pageId: entry.pageId,
      rockKey: entry.rockKey,
      formation: entry.formation,
      biome: entry.biome,
      x: entry.x,
      z: entry.z,
    },
    now: Date.now(),
  });
  if (!result.ok) {
    showPetToast(result.reason);
    return true;
  }

  recovering.add(entry.id);
  restage(entry, Date.now());
  refreshBuiltPageDrops(entry.pageId);
  playCozySound('tap');
  showPetToast(result.message);
  return true;
}

export function updateMineableRocks() {
  const now = Date.now();
  if (now < nextRestageAt) return;
  nextRestageAt = now + RESTAGE_INTERVAL_MS;
  for (const id of [...recovering]) {
    const entry = rocks.get(id);
    if (!entry) {
      recovering.delete(id);
      continue;
    }
    restage(entry, now);
  }
}

export function describeMineRegistry() {
  const nearby = [...rocks.values()]
    .map((entry) => ({
      id: entry.id,
      formation: entry.formation,
      biome: entry.biome,
      distance: Number(Math.hypot(entry.x - avatar.position.x, entry.z - avatar.position.z).toFixed(2)),
      attached: isAttachedAndVisible(entry.object),
      ready: rockIsReady(growthRecordFor(entry), Date.now()),
    }))
    .sort((a, b) => a.distance - b.distance);
  return {
    registered: rocks.size,
    equippedMineTool: equippedMineTool()?.name ?? null,
    actionMode: getActionMode(),
    reach: MINE_REACH,
    nearest: nearby.slice(0, 8),
  };
}

