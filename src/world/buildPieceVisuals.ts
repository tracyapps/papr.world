import * as THREE from 'three';
import { createSheet, createWall } from '../render/builders';
import { getMaterial, getResourceSurfaceMaterial, type MaterialKey } from '../render/materials';
import { getBuildSurfaceUrl } from '../game/resourcePresentation';
import type { PlacedPiece } from '../../shared/src/index';
import { isLegacyBuildMaterial, resolveBuildMaterial, DEFAULT_BUILD_MATERIAL } from '../sim/catalogs/building';
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
  buildVisual(group, key, buildSurface(key, piece.material));
  group.rotation.y = piece.rotY ?? 0;
  return group;
}

/**
 * How many times a resource tile repeats across a built surface.
 *
 * The retired paper textures each carried their own repeat in `MATERIAL_DEFS`
 * (1.6 to 4, by how big the motif was drawn); a resource tile has no such
 * setting, so this is the one place it lives. Two reads as paper stock on
 * furniture rather than a single stretched picture.
 */
const BUILD_SURFACE_REPEAT: [number, number] = [2, 2];

/**
 * The material a piece is actually built from.
 *
 * A resource-backed choice wears that resource's compiled tile. A retired
 * paper key — every piece built before materials were resources — keeps
 * rendering exactly as it always has. Anything else (a malformed value, a
 * client on an older protocol, a resource nobody has drawn yet) falls back to
 * this piece type's original look rather than an invalid lookup.
 */
function buildSurface(key: BuildPieceKey, requested?: string): THREE.MeshStandardMaterial {
  const material = resolveBuildMaterial(key, requested);
  const surfaceUrl = getBuildSurfaceUrl(material);
  if (surfaceUrl) return getResourceSurfaceMaterial(surfaceUrl, BUILD_SURFACE_REPEAT);
  if (isLegacyBuildMaterial(material)) return getMaterial(material as MaterialKey);
  return getMaterial(DEFAULT_BUILD_MATERIAL[key] as MaterialKey);
}

function buildVisual(group: THREE.Group, key: BuildPieceKey, material: THREE.MeshStandardMaterial) {
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
    case 'garden-arbor':
      buildArbor(group, material);
      break;
    case 'picnic-table':
      buildPicnicTable(group, material);
      break;
    case 'footbridge':
      buildFootbridge(group, material);
      break;
  }
}

function buildBench(group: THREE.Group, chosen: THREE.MeshStandardMaterial) {
  // Seat and backrest follow the chosen material; the legs stay a fixed dark
  // wood accent regardless of what the rest is built from.
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

function buildPlanter(group: THREE.Group, chosen: THREE.MeshStandardMaterial) {
  // The box follows the chosen material; the soil fill stays soil-coloured
  // no matter what the box itself is built from.
  const wood = chosen;
  const soil = getMaterial('paper.brown.warm');

  // Long faces front and back, then the short side faces rotated flat-on.
  group.add(createWall(0.8, 0.42, wood, [0, 0.21, 0.2]));
  group.add(createWall(0.8, 0.42, wood, [0, 0.21, -0.2]));
  group.add(createWall(0.44, 0.42, wood, [0.4, 0.21, 0], Math.PI / 2));
  group.add(createWall(0.44, 0.42, wood, [-0.4, 0.21, 0], Math.PI / 2));

  // Soil reads as a raised bed's fill, proud of the rim.
  group.add(createSheet(0.72, 0.34, soil, [0, 0.44, 0]));
}

function buildPlank(group: THREE.Group, chosen: THREE.MeshStandardMaterial) {
  group.add(createSheet(1.7, 0.62, chosen, [0, 0.018, 0]));
}

function buildLamp(group: THREE.Group, chosen: THREE.MeshStandardMaterial) {
  // The pole follows the chosen material; the base and shade stay fixed —
  // a lamp's paper shade shouldn't turn to cork just because the pole did.
  const wood = chosen;
  const warm = getMaterial('paper.brown.warm');
  const shade = getMaterial('paper.notebook');

  group.add(createSheet(0.26, 0.26, warm, [0, 0.02, 0]));
  group.add(createWall(0.07, 1.3, wood, [0, 0.66, 0]));

  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.38, 8), shade);
  cone.position.set(0, 1.53, 0);
  cone.castShadow = true;
  group.add(cone);
}

function buildArbor(group: THREE.Group, chosen: THREE.MeshStandardMaterial) {
  for (const x of [-0.72, 0.72]) group.add(createWall(0.12, 2.15, chosen, [x, 1.075, 0]));
  group.add(createWall(1.65, 0.14, chosen, [0, 2.08, 0]));
  const leaf = getMaterial('paper.green');
  for (const x of [-0.55, -0.18, 0.18, 0.55]) {
    const sprig = createSheet(0.35, 0.22, leaf, [x, 2.16, 0]);
    sprig.rotation.z = x * 0.3;
    group.add(sprig);
  }
}

function buildPicnicTable(group: THREE.Group, chosen: THREE.MeshStandardMaterial) {
  const dark = getMaterial('paper.brown');
  group.add(createSheet(1.7, 0.72, chosen, [0, 0.78, 0]));
  for (const z of [-0.62, 0.62]) group.add(createSheet(1.65, 0.3, chosen, [0, 0.46, z]));
  for (const x of [-0.62, 0.62]) {
    for (const z of [-0.3, 0.3]) group.add(createWall(0.1, 0.75, dark, [x, 0.375, z]));
  }
}

function buildFootbridge(group: THREE.Group, chosen: THREE.MeshStandardMaterial) {
  const rail = getMaterial('paper.brown');
  for (let index = -3; index <= 3; index += 1) {
    group.add(createSheet(0.34, 1.0, chosen, [index * 0.38, 0.18 + Math.cos(index * 0.35) * 0.08, 0]));
  }
  for (const z of [-0.48, 0.48]) {
    group.add(createWall(2.65, 0.08, rail, [0, 0.72, z]));
    for (const x of [-1.15, -0.58, 0, 0.58, 1.15]) group.add(createWall(0.07, 0.68, rail, [x, 0.38, z]));
  }
}
