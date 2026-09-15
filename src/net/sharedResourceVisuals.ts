import * as THREE from 'three';
import type { ResourceNode } from '../../shared/src/index';
import { registerHarvestable, unregisterHarvestable } from '../game/harvesting';
import { scene } from '../render/context';
import { getMaterial } from '../render/materials';
import { RESOURCE_DEFS } from '../world/resources';
import type { ResourceId } from '../world/types';
import { sampleTerrainHeight } from '../world/terrain';
import { getCurrentPageId } from '../world/streaming';

const root = new THREE.Group();
root.name = 'shared-resource-nodes';
const visuals = new Map<string, { node: ResourceNode; group: THREE.Group }>();
let gather: ((nodeId: string) => void) | null = null;

export function initializeSharedResourceVisuals(onGather: (nodeId: string) => void): void {
  gather = onGather;
  if (!root.parent) scene.add(root);
}

function buildPile(resource: ResourceId): THREE.Group {
  const group = new THREE.Group();
  const material = getMaterial(RESOURCE_DEFS[resource].material);
  for (let index = 0; index < 3; index += 1) {
    const piece = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), material);
    piece.position.set((index - 1) * 0.19, 0.12 + (index % 2) * 0.05, (index % 2) * 0.12);
    piece.scale.y = 0.65;
    piece.castShadow = true;
    group.add(piece);
  }
  return group;
}

export function upsertSharedResourceNode(node: ResourceNode): void {
  if (!(node.kind in RESOURCE_DEFS)) return;
  const resource = node.kind as ResourceId;
  let visual = visuals.get(node.id);
  if (!visual || visual.node.kind !== node.kind) {
    if (visual) removeSharedResourceNode(node.id);
    const group = buildPile(resource);
    root.add(group);
    visual = { node, group };
    visuals.set(node.id, visual);
  }
  visual.node = node;
  visual.group.position.set(node.x, sampleTerrainHeight(node.x, node.z) + 0.02, node.z);
  const available = node.remaining > 0 && (!node.respawnAt || node.respawnAt <= Date.now())
    && node.page === getCurrentPageId();
  visual.group.visible = available;
  registerHarvestable({
    id: `shared:${node.id}`,
    object: visual.group,
    resource,
    amount: 1,
    respawnSeconds: null,
    available,
    onCollect: () => gather?.(node.id),
  });
}

export function removeSharedResourceNode(id: string): void {
  const visual = visuals.get(id);
  if (!visual) return;
  unregisterHarvestable(`shared:${id}`);
  visual.group.removeFromParent();
  visuals.delete(id);
}

export function syncSharedResourceVisibility(): void {
  for (const visual of visuals.values()) upsertSharedResourceNode(visual.node);
}

export function clearSharedResourceVisuals(): void {
  for (const id of [...visuals.keys()]) removeSharedResourceNode(id);
  gather = null;
}
