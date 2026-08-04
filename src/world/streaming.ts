import * as THREE from 'three';
import { scene } from '../render/context';
import { buildPageGroup, refreshPageTerrain } from './pageRuntime';
import { getPage } from './pages';
import { pageId, pageOfPosition } from './types';
import { buildHorizonPageGroup, disposeHorizonPageGroup } from './horizonRuntime';

// Keeps the avatar's page plus its eight neighbors built and visible.
// Built pages are kept (hidden) so revisits are instant and the map
// remembers what it saw. Page transitions are ordinary movement.

type BuiltPage = {
  group: THREE.Group;
};

const builtPages = new Map<string, BuiltPage>();
const horizonPages = new Map<string, THREE.Group>();
let currentPageId = '';
let streamedCenter = '';

const NEAR_PAGE_RADIUS = 1;
const HORIZON_PAGE_RADIUS = 3;

export function getCurrentPageId() {
  return currentPageId;
}

export function isPageActive(id: string) {
  const built = builtPages.get(id);
  return Boolean(built?.group.visible);
}

export function refreshBuiltPageTerrain(id: string) {
  const built = builtPages.get(id);
  if (built) refreshPageTerrain(id, built.group);
}

export function refreshBuiltTerrainNear(x: number, z: number) {
  const center = pageOfPosition(x, z);
  for (let px = center.px - 1; px <= center.px + 1; px += 1) {
    for (let pz = center.pz - 1; pz <= center.pz + 1; pz += 1) {
      refreshBuiltPageTerrain(pageId(px, pz));
    }
  }
}

export function updateStreaming(avatarPosition: THREE.Vector3) {
  const { px, pz } = pageOfPosition(avatarPosition.x, avatarPosition.z);
  currentPageId = pageId(px, pz);
  if (currentPageId === streamedCenter) return;
  streamedCenter = currentPageId;

  const wantedNear = new Set<string>();
  const wantedHorizon = new Set<string>();
  for (let dx = -HORIZON_PAGE_RADIUS; dx <= HORIZON_PAGE_RADIUS; dx += 1) {
    for (let dz = -HORIZON_PAGE_RADIUS; dz <= HORIZON_PAGE_RADIUS; dz += 1) {
      const id = pageId(px + dx, pz + dz);
      if (Math.max(Math.abs(dx), Math.abs(dz)) <= NEAR_PAGE_RADIUS) wantedNear.add(id);
      else wantedHorizon.add(id);
    }
  }

  // Build or show wanted pages.
  for (let dx = -NEAR_PAGE_RADIUS; dx <= NEAR_PAGE_RADIUS; dx += 1) {
    for (let dz = -NEAR_PAGE_RADIUS; dz <= NEAR_PAGE_RADIUS; dz += 1) {
      const id = pageId(px + dx, pz + dz);
      let built = builtPages.get(id);
      if (!built) {
        const group = buildPageGroup(getPage(px + dx, pz + dz));
        scene.add(group);
        built = { group };
        builtPages.set(id, built);
      }
      built.group.visible = true;
      horizonPages.get(id)?.removeFromParent();
    }
  }

  for (let dx = -HORIZON_PAGE_RADIUS; dx <= HORIZON_PAGE_RADIUS; dx += 1) {
    for (let dz = -HORIZON_PAGE_RADIUS; dz <= HORIZON_PAGE_RADIUS; dz += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) <= NEAR_PAGE_RADIUS) continue;
      const id = pageId(px + dx, pz + dz);
      let group = horizonPages.get(id);
      if (!group) {
        group = buildHorizonPageGroup(getPage(px + dx, pz + dz));
        horizonPages.set(id, group);
      }
      if (!group.parent) scene.add(group);
    }
  }

  // Hide everything else.
  for (const [id, built] of builtPages) {
    if (!wantedNear.has(id)) {
      built.group.visible = false;
    }
  }


  // Horizon pages are cheap and disposable. Keeping only the current ring
  // avoids turning a long walk into an ever-growing geometry cache.
  for (const [id, group] of horizonPages) {
    if (wantedHorizon.has(id)) continue;
    disposeHorizonPageGroup(group);
    horizonPages.delete(id);
  }
}
