import * as THREE from 'three';

// A tiny registry mapping a placed piece's id to the THREE object that
// currently renders it, so build mode can hide the real thing while a copy
// of it follows the cursor as a carry ghost (see placement.ts). Rebuilt
// wholesale whenever a page's piece visuals are rebuilt — see
// `buildPlacedPieceVisuals` in world/pageRuntime.ts.

const visuals = new Map<string, THREE.Object3D>();

export function registerPlacedPieceVisual(id: string, object: THREE.Object3D) {
  visuals.set(id, object);
}

export function setPlacedPieceVisualVisible(id: string, visible: boolean) {
  const object = visuals.get(id);
  if (object) object.visible = visible;
}
