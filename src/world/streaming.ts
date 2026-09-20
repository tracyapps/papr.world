import * as THREE from 'three';
import { scene } from '../render/context';
import { buildPageGroup, refreshPageDrops, refreshPageTerrain } from './pageRuntime';
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

/**
 * Refresh everything drawn for ONE built page: ground heights, dug patches and
 * their plants, loose drops, and placed pieces.
 *
 * This is the single-page refresh, and it should be the only one the gameplay
 * paths use. It replaces `refreshBuiltTerrainNear`, which rebuilt a 3x3 block
 * of pages — nine times the work, on every trim, dig, plant and placement,
 * including the eight pages nothing had changed on.
 *
 * WHY THAT MATTERED ENOUGH TO CHANGE. A page's ground is an 80x80 grid —
 * about 6,500 vertices each — and there is one base sheet plus up to three
 * biome overlays laid over it, before the hill and mound patches (each a
 * radial mesh of its own). Every one of those carries `userData.terrainSurface`,
 * and `refreshTerrainSurfaceMeshes` walks EVERY vertex of EVERY one of them
 * through `sampleTerrainHeight`, then recomputes the normals and the bounding
 * sphere. Times nine pages, that is well over 200,000 height samples and
 * dozens of normal/bounds recomputes for a single click — which is what
 * "trimming a shrub makes the game hitch a little" turned out to be.
 *
 * The eight neighbouring pages were being rebuilt for nothing: `trimTree`
 * writes `treeGrowth` on one page, `mineRock` writes `rockGrowth` on one page,
 * and a placed piece belongs to the page it was placed on. Nothing in this
 * game edits two pages at once.
 *
 * Pass the page id the CHANGE belongs to, not a world position: every caller
 * already knows it (the tree's page, the rock's page, the placed piece's
 * page), and deriving it from coordinates again would be both slower and a
 * chance to disagree with the command that made the edit.
 */
export function refreshBuiltPageTerrain(id: string) {
  const built = builtPages.get(id);
  if (built) refreshPageTerrain(id, built.group);
}

/**
 * The cheap half: only the loose resource drops of one page.
 *
 * Trimming a tree and mining a rock both scatter new drops into the world and
 * change nothing else about the page — `trimTree` and `mineRock` only write
 * `treeGrowth` / `rockGrowth` and call `addWorldDrop`. So the drop visuals are
 * the only group with anything to rebuild, and the ground does not need
 * re-sampling at all.
 */
export function refreshBuiltPageDrops(id: string) {
  const built = builtPages.get(id);
  if (built) refreshPageDrops(id, built.group);
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
