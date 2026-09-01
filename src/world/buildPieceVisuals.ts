import * as THREE from 'three';
import { createSheet, createWall } from '../render/builders';
import { getMaterial, type MaterialKey } from '../render/materials';
import type { PlacedPiece } from '../../shared/src/index';
import { resolveBuildMaterial } from '../sim/catalogs/building';
import { BUILD_PIECE_DEFS } from './buildPieces';
import type { BuildPieceKey } from './buildPieces';

// Turns a serializable PlacedPiece into a Three.js group of paper meshes.
//
// The returned group is rooted at ground level (children are laid out as if
// the ground is flat under the origin); the caller positions it on the actual
// terrain height. Rotation is applied to the group so the ghost and the real
// piece can share one builder.

export function buildPlacedPieceVisual(piece: PlacedPiece): THREE.Group {
  const group = new THREE.Group();
  group.name = `placed:${piece.id}`;
  if (!(piece.templateKey in BUILD_PIECE_DEFS)) return group;
  const key = piece.templateKey as BuildPieceKey;
  // A stray/malformed material (an older save, a client on an older
  // protocol) falls back to that piece's original hardcoded look rather than
  // an invalid `getMaterial` lookup.
  const material = resolveBuildMaterial(key, piece.material) as MaterialKey;
  buildVisual(group, key, material);
  group.rotation.y = piece.rotY ?? 0;
  return group;
}

function buildVisual(group: THREE.Group, key: BuildPieceKey, material: MaterialKey) {
  switch (key) {
    case 'paper-bench':
      buildBench(group, material);
      break;
    case 'planter-box':
      buildPlanter(group, material);
      break;
    case 'path-plank':
      buildPlank(group, material);
      break;
    case 'paper-lamp':
      buildLamp(group, material);
      break;
  }
}

function buildBench(group: THREE.Group, material: MaterialKey) {
  // Seat and backrest follow the chosen material; the legs stay a fixed dark
  // wood accent regardless of what the rest is built from.
  const chosen = getMaterial(material);
  const dark = getMaterial('paper.brown');

  // Seat, then the backrest tilted back a little over it.
  group.add(createSheet(1.15, 0.4, chosen, [0, 0.42, 0]));
  const back = createSheet(1.15, 0.32, chosen, [0, 0.75, -0.27]);
  back.rotation.x = 0.12;
  group.add(back);

  // Four short legs poking up under the seat.
  for (const x of [-0.48, 0.48]) {
    for (const z of [-0.16, 0.16]) {
      group.add(createWall(0.09, 0.4, dark, [x, 0.2, z]));
    }
  }
}

function buildPlanter(group: THREE.Group, material: MaterialKey) {
  // The box follows the chosen material; the soil fill stays soil-coloured
  // no matter what the box itself is built from.
  const wood = getMaterial(material);
  const soil = getMaterial('paper.brown.warm');

  // Long faces front and back, then the short side faces rotated flat-on.
  group.add(createWall(0.8, 0.42, wood, [0, 0.21, 0.2]));
  group.add(createWall(0.8, 0.42, wood, [0, 0.21, -0.2]));
  group.add(createWall(0.44, 0.42, wood, [0.4, 0.21, 0], Math.PI / 2));
  group.add(createWall(0.44, 0.42, wood, [-0.4, 0.21, 0], Math.PI / 2));

  // Soil reads as a raised bed's fill, proud of the rim.
  group.add(createSheet(0.72, 0.34, soil, [0, 0.44, 0]));
}

function buildPlank(group: THREE.Group, material: MaterialKey) {
  group.add(createSheet(1.7, 0.62, getMaterial(material), [0, 0.018, 0]));
}

function buildLamp(group: THREE.Group, material: MaterialKey) {
  // The pole follows the chosen material; the base and shade stay fixed —
  // a lamp's paper shade shouldn't turn to cork just because the pole did.
  const wood = getMaterial(material);
  const warm = getMaterial('paper.brown.warm');
  const shade = getMaterial('paper.notebook');

  group.add(createSheet(0.26, 0.26, warm, [0, 0.02, 0]));
  group.add(createWall(0.07, 1.3, wood, [0, 0.66, 0]));

  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.38, 8), shade);
  cone.position.set(0, 1.53, 0);
  cone.castShadow = true;
  group.add(cone);
}
