import * as THREE from 'three';
import { camera, scene } from '../render/context';
import { dispatchGameCommand } from '../sim/commands';
import { getGameState } from '../sim/state';
import {
  TRIM_STAGE_RESPONSES,
  treeGrowthAt,
  treeStageAt,
  treeStageFor,
  trimProfileForTier,
  type TreeSpecies,
  type TreeStage,
} from '../sim/catalogs/trees';
import { TOOL_DEFS } from '../sim/catalogs/tools';
import { applyTreeStageVisual } from '../world/treeRuntime';
import { getActionMode } from './actionMode';
import { avatar } from './avatar';
import { playCozySound } from './cozyAudio';
import { showPetToast } from './petting';
import { showResourceGain } from './harvesting';

/**
 * Trimming: the world side of the renewable tree model.
 *
 * The registry mirrors `harvesting.ts` deliberately — trees are registered as
 * their page is built and never queried against world data per frame. The
 * one thing this module is careful about is the memory in
 * `docs/next-session.md`: per-frame world queries are what broke clicking
 * last time, and the symptom was not stutter. Nothing here runs a footprint
 * or page lookup on the frame path; recovery re-poses only the handful of
 * trees that are actually mid-regrowth, twice a second at most.
 */

/** How close you must stand. Slightly longer than dig reach — it is a tree. */
const TRIM_REACH = 3.6;
/** Beyond reach but close enough that you clearly meant that tree. */
const TRIM_HINT_REACH = 9;
const PICK_SLOP_PX = 48;
/** Fraction of the way up the trunk that screen-space picking aims at. */
const TRUNK_AIM = 0.4;
const RESTAGE_INTERVAL_MS = 500;

type TreeEntry = {
  id: string;
  object: THREE.Mesh;
  pageId: string;
  treeKey: string;
  species: TreeSpecies;
  x: number;
  z: number;
  height: number;
  baseY: number;
  /** Last stage this mesh was posed for, so recovery only rebuilds on change. */
  posedStage: TreeStage | null;
};

const trees = new Map<string, TreeEntry>();
/**
 * Trees currently below full growth.
 *
 * Kept as its own set so the recovery pass iterates a handful of entries
 * rather than every tree on every loaded page — a forest page alone holds
 * close to fifty.
 */
const recovering = new Set<string>();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const projected = new THREE.Vector3();
let nextRestageAt = 0;

export function registerTrimmableTree(entry: Omit<TreeEntry, 'posedStage'>) {
  trees.set(entry.id, { ...entry, posedStage: null });
  if (growthRecordFor(entry.pageId, entry.treeKey)) recovering.add(entry.id);
  restage(trees.get(entry.id)!, Date.now());
}

function growthRecordFor(pageId: string, treeKey: string) {
  return getGameState().world.pages[pageId]?.treeGrowth[treeKey];
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

function restage(entry: TreeEntry, now: number) {
  const record = growthRecordFor(entry.pageId, entry.treeKey);
  const stage = treeStageAt(record, now);
  applyTreeStageVisual({
    mesh: entry.object,
    stage,
    species: entry.species,
    record,
    height: entry.height,
    baseY: entry.baseY,
    now,
  });
  entry.posedStage = stage;
  // A tree that has grown all the way back leaves the recovery set, and its
  // save record is meaningless from then on. The record is left in place
  // rather than deleted here: this is a render-side pass, and state edits
  // belong to commands.
  if (!record || treeGrowthAt(record, now) >= 100) recovering.delete(entry.id);
}

function candidates(reach: number) {
  const result: TreeEntry[] = [];
  for (const entry of trees.values()) {
    if (Math.hypot(entry.x - avatar.position.x, entry.z - avatar.position.z) > reach) continue;
    if (!isAttachedAndVisible(entry.object)) continue;
    result.push(entry);
  }
  return result;
}

function pickTreeAt(clientX: number, clientY: number, reach: number): TreeEntry | null {
  const available = candidates(reach);
  if (available.length === 0) return null;

  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(available.map((entry) => entry.object), false);
  if (hits.length > 0) {
    const hit = available.find((entry) => entry.object === hits[0].object);
    if (hit) return hit;
  }

  // Same forgiving screen-space fallback the loose materials use. A tree
  // cutout is mostly transparent, so an exact hit on the plane is not the
  // only click a player reasonably expects to work — and the reach filter
  // above already means only trees you are standing beside are in play.
  let nearest: TreeEntry | null = null;
  let nearestPixels = PICK_SLOP_PX;
  for (const entry of available) {
    projected.set(entry.x, entry.baseY + entry.height * TRUNK_AIM, entry.z);
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

function equippedTrimTool() {
  const state = getGameState();
  const toolId = state.player.equippedTool;
  if (!toolId || (state.player.tools[toolId] ?? 0) <= 0) return null;
  const tool = TOOL_DEFS[toolId];
  return tool.verb === 'trim' ? tool : null;
}

export type TrimTargetStatus =
  | 'valid'
  | 'no-tool'
  | 'no-tree'
  | 'out-of-reach'
  | 'too-tough'
  | 'resting';

/**
 * Whether the tree under the pointer can be cut right now, and why not.
 *
 * The cursor and the click share this single resolver, so the cursor can
 * never say yes to a click that will be refused — the same arrangement the
 * garden overlay uses.
 *
 * A reachable tree wins over a distant one, so standing beside a sapling in
 * a forest does not produce "walk closer" about the redwood behind it.
 */
export function assessTrimTarget(clientX: number, clientY: number): {
  status: TrimTargetStatus;
  entry?: TreeEntry;
} {
  const tool = equippedTrimTool();
  if (!tool) return { status: 'no-tool' };
  const entry = pickTreeAt(clientX, clientY, TRIM_REACH)
    ?? pickTreeAt(clientX, clientY, TRIM_HINT_REACH);
  if (!entry) return { status: 'no-tree' };

  const distance = Math.hypot(entry.x - avatar.position.x, entry.z - avatar.position.z);
  if (distance > TRIM_REACH) return { status: 'out-of-reach', entry };
  if (entry.species === 'redwood' && !trimProfileForTier(tool.tier).handlesRedwood) {
    return { status: 'too-tough', entry };
  }
  const growth = treeGrowthAt(growthRecordFor(entry.pageId, entry.treeKey), Date.now());
  if (treeStageFor(growth) === 'resting') return { status: 'resting', entry };
  return { status: 'valid', entry };
}

/**
 * Whether a click here should be consumed by trimming.
 *
 * True for refusals too, not only for a cut that will succeed. This was the
 * bug: requiring `valid` meant the router never called `tryTrimAt` for a
 * redwood you lacked the shears for, so the carefully worded refusal was
 * unreachable and the click fell silently through to petting. `planting`
 * already had this right — "the click must be consumed so the player gets an
 * explanation rather than the silent nothing of a click that falls through
 * to the world."
 */
export function hasTrimActionAt(clientX: number, clientY: number) {
  if (getActionMode() !== 'trim') return false;
  const { status } = assessTrimTarget(clientX, clientY);
  return status !== 'no-tool' && status !== 'no-tree';
}

export function tryTrimAt(clientX: number, clientY: number): boolean {
  if (getActionMode() !== 'trim') return false;
  const assessment = assessTrimTarget(clientX, clientY);

  if (assessment.status === 'no-tool' || assessment.status === 'no-tree') return false;

  if (assessment.status === 'out-of-reach') {
    showPetToast('That tree is over there — walk closer to reach the branches');
    return true;
  }
  if (assessment.status === 'too-tough') {
    const tool = equippedTrimTool();
    showPetToast(`${tool?.name ?? 'These scissors'} will not get through redwood bark — you need a heavier pair of shears`);
    return true;
  }
  if (assessment.status === 'resting') {
    showPetToast(TRIM_STAGE_RESPONSES.resting);
    return true;
  }

  const entry = assessment.entry!;
  const result = dispatchGameCommand({
    type: 'trimTree',
    target: { pageId: entry.pageId, treeKey: entry.treeKey, species: entry.species },
    now: Date.now(),
  });
  if (!result.ok) {
    showPetToast(result.reason);
    return true;
  }

  recovering.add(entry.id);
  restage(entry, Date.now());
  playCozySound('rustle');
  // One chip, not one per material. The chip is a single element on a timer,
  // so looping over a mixed yield would flash each in turn and leave only the
  // last visible — the largest is the one worth counting, and the toast below
  // already names everything the cut gave.
  const largest = Object.entries(result.grants ?? {})
    .sort((a, b) => b[1] - a[1])[0];
  if (largest) showResourceGain(largest[0] as Parameters<typeof showResourceGain>[0], largest[1]);
  showPetToast(result.message);
  return true;
}

/**
 * Console-only diagnostic: what the trim system can currently see.
 *
 * Written because "nothing is trimmable" has at least four causes that look
 * identical on screen — an empty registry, a tree out of reach, a hidden
 * page, or a tool that is not really equipped — and the cursor shows the
 * same thing for all of them. Gameplay never calls this.
 */
export function describeTrimRegistry() {
  const tool = equippedTrimTool();
  const nearby = [...trees.values()]
    .map((entry) => ({
      id: entry.id,
      species: entry.species,
      distance: Number(Math.hypot(entry.x - avatar.position.x, entry.z - avatar.position.z).toFixed(2)),
      attached: isAttachedAndVisible(entry.object),
      stage: treeStageAt(growthRecordFor(entry.pageId, entry.treeKey), Date.now()),
    }))
    .sort((a, b) => a.distance - b.distance);
  return {
    registered: trees.size,
    equippedTrimTool: tool?.name ?? null,
    actionMode: getActionMode(),
    reach: TRIM_REACH,
    inReach: nearby.filter((entry) => entry.distance <= TRIM_REACH && entry.attached).length,
    nearest: nearby.slice(0, 8),
  };
}

/**
 * Re-pose trees that are growing back.
 *
 * Throttled and scoped to the recovery set, so this costs nothing on a page
 * where nobody has cut anything — which is every page until they do.
 */
export function updateTrimmableTrees() {
  const now = Date.now();
  if (now < nextRestageAt) return;
  nextRestageAt = now + RESTAGE_INTERVAL_MS;
  for (const id of [...recovering]) {
    const entry = trees.get(id);
    if (!entry) {
      recovering.delete(id);
      continue;
    }
    restage(entry, now);
  }
}
