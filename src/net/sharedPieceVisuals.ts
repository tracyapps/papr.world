import * as THREE from 'three';
import type { PlacedPiece } from '../../shared/src/index';
import { scene } from '../render/context';
import { getGameState } from '../sim/state';
import { buildPlacedPieceVisual } from '../world/buildPieceVisuals';
import { sampleTerrainHeight } from '../world/terrain';

const root = new THREE.Group();
root.name = 'shared-pieces';
const visuals = new Map<string, { piece: PlacedPiece; group: THREE.Group }>();

export function initializeSharedPieceVisuals(): void {
  if (!root.parent) scene.add(root);
}

export function addSharedPiece(piece: PlacedPiece): void {
  removeSharedPiece(piece.id);
  const group = buildPlacedPieceVisual(piece);
  group.position.set(piece.x, sampleTerrainHeight(piece.x, piece.z) + 0.01, piece.z);
  root.add(group);
  visuals.set(piece.id, { piece, group });
  syncSharedPieceVisibility();
}

export function removeSharedPiece(id: string): void {
  const visual = visuals.get(id);
  if (!visual) return;
  visual.group.removeFromParent();
  visuals.delete(id);
}

/** Hide the server echo of a piece already represented by this device's solo save. */
export function syncSharedPieceVisibility(): void {
  for (const { piece, group } of visuals.values()) {
    group.visible = !hasLocalEquivalent(piece);
  }
}

export function sharedPieceCount(): number {
  return visuals.size;
}

function hasLocalEquivalent(target: PlacedPiece): boolean {
  for (const page of Object.values(getGameState().world.pages)) {
    for (const piece of Object.values(page.placedPieces)) {
      if (
        piece.templateKey === target.templateKey
        && Math.abs(piece.x - target.x) < 0.01
        && Math.abs(piece.z - target.z) < 0.01
        && Math.abs(piece.rotY - target.rotY) < 0.01
      ) return true;
    }
  }
  return false;
}
