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
    case 'display-case':
      buildDisplayCase(group, material);
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

let clearFront: THREE.MeshStandardMaterial | null = null;
let clearShelf: THREE.MeshStandardMaterial | null = null;

/** The case's clear front: a pale, see-through sheet, shared by every case. */
function getClearFront(): THREE.MeshStandardMaterial {
  clearFront ??= new THREE.MeshStandardMaterial({
    color: '#dbeef2', transparent: true, opacity: 0.3, roughness: 0.15, depthWrite: false,
  });
  return clearFront;
}

/** The glass shelf between two levels: the same glass, a touch more there, so
 * the edge of each shelf still reads while you look straight through it. */
function getClearShelf(): THREE.MeshStandardMaterial {
  clearShelf ??= new THREE.MeshStandardMaterial({
    color: '#dbeef2', transparent: true, opacity: 0.45, roughness: 0.15, depthWrite: false,
  });
  return clearShelf;
}

/**
 * The display case's measurements, shared with what sits inside it
 * (game/caseTrinketVisuals.ts), so the two can never drift apart.
 *
 * A case is a low cupboard with one glass level on top. Each shelf the owner
 * adds stacks another glass level on the one below, with a clear shelf
 * between them, and lifts the lid to the new top. Every level is tall enough
 * for the tallest keepsake once it has been fitted to its slot.
 */
export const DISPLAY_CASE_SHAPE = {
  /** Height of the cupboard's top sheet, which is the first level's floor. */
  baseTop: 0.36,
  /** Floor to floor of one glass level. */
  levelHeight: 0.62,
  /** Half the thickness of a sheet: things stand this far above a floor's centre. */
  sheetHalf: 0.0175,
  /** A low step across the back of each level, so the back row shows over the front. */
  riser: { width: 1.1, height: 0.08, depth: 0.22, z: -0.15 },
  /** Slot rows, front first: the first things set out go where they are easiest to see. */
  rows: [{ z: 0.12, raised: false }, { z: -0.15, raised: true }],
  columns: [-0.42, -0.14, 0.14, 0.42],
  /** The room one thing gets: its footprint and its height, after the riser. */
  slotFootprint: 0.3,
  slotHeight: 0.44,
} as const;

/** Where a level's floor sits (its centre line), counting the first level as 0. */
export function displayCaseFloorY(level: number): number {
  return DISPLAY_CASE_SHAPE.baseTop + level * DISPLAY_CASE_SHAPE.levelHeight;
}

/** Where the lid goes on a case this many shelves tall. */
export function displayCaseLidY(shelves: number): number {
  return displayCaseFloorY(shelves) + 0.02;
}

/** The mesh name of the lid, which caseTrinketVisuals lifts when a shelf is added. */
export const DISPLAY_CASE_LID = 'display-case-lid';

/**
 * One glass level: four clear walls, a slim post at each corner, and the
 * riser across the back. Level 0 stands on the cupboard; any higher level
 * also gets the clear shelf it stands on.
 */
export function buildDisplayCaseLevel(level: number): THREE.Group {
  const { levelHeight, riser, sheetHalf } = DISPLAY_CASE_SHAPE;
  const dark = getMaterial('paper.brown');
  const glass = getClearFront();
  const floor = displayCaseFloorY(level);
  const middle = floor + levelHeight / 2;
  const group = new THREE.Group();
  group.name = `display-case-level-${level}`;
  if (level > 0) group.add(createSheet(1.16, 0.58, getClearShelf(), [0, floor, 0]));
  group.add(createWall(1.16, levelHeight, glass, [0, middle, 0.29]));
  group.add(createWall(1.16, levelHeight, glass, [0, middle, -0.29]));
  for (const x of [-0.58, 0.58]) group.add(createWall(0.58, levelHeight, glass, [x, middle, 0], Math.PI / 2));
  for (const x of [-0.6, 0.6]) {
    for (const z of [-0.3, 0.3]) group.add(createWall(0.05, levelHeight + 0.02, dark, [x, middle, z]));
  }
  const step = new THREE.Mesh(new THREE.BoxGeometry(riser.width, riser.height, riser.depth), dark);
  step.position.set(0, floor + sheetHalf + riser.height / 2, riser.z);
  step.castShadow = true;
  step.receiveShadow = true;
  group.add(step);
  return group;
}

function buildDisplayCase(group: THREE.Group, chosen: THREE.MeshStandardMaterial) {
  const { baseTop } = DISPLAY_CASE_SHAPE;
  // A low cupboard for a base, with a top the first level stands on.
  group.add(createWall(1.2, baseTop, chosen, [0, baseTop / 2, 0.3]));
  group.add(createWall(1.2, baseTop, chosen, [0, baseTop / 2, -0.3]));
  for (const x of [-0.6, 0.6]) group.add(createWall(0.6, baseTop, chosen, [x, baseTop / 2, 0], Math.PI / 2));
  group.add(createSheet(1.2, 0.62, chosen, [0, baseTop, 0]));
  // One glass level, and a lid. There is no shelf partway up any more: a
  // level is one shelf, and a taller case is more levels (added by the owner,
  // drawn by caseTrinketVisuals, which also lifts this lid to the new top).
  group.add(buildDisplayCaseLevel(0));
  const lid = createSheet(1.28, 0.7, chosen, [0, displayCaseLidY(1), 0]);
  lid.name = DISPLAY_CASE_LID;
  group.add(lid);
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
