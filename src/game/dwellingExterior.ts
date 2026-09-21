import * as THREE from 'three';
import { shadowed } from '../render/builders';
import { createColorMaterial, getMaterial } from '../render/materials';
import { invalidateFootprintCache } from '../world/footprints';
import { homeFacing } from '../world/homeSite';
import { registerMapFeature, updateMapFeaturePosition } from '../world/mapFeatures';
import { getPlace, HOME_PLACE_ID, onPlacesChanged } from '../world/places';
import { sampleTerrainHeight } from '../world/terrain';
import { getGameState, onGameStateChanged } from '../sim/state';
import {
  exteriorPlan,
  exteriorSignature,
  homePosition,
  isNearHome,
  type ExteriorPlan,
} from './dwellingLook';

/**
 * The player's home, standing near the Home place with its door toward it: a tent under
 * construction to begin with, then whatever the finished parts add
 * (`docs/house-and-home.md`). Drawn from `exteriorPlan()`, and rebuilt only
 * when the picture would actually change.
 *
 * Built from primitives, like the other small procedural props: no new art.
 * Nothing about it is only visual: the panel, the nearby list and the toast
 * all say the same things in words (`describeHome`).
 */

// Footprint and heights, in world units (the avatar is about one unit tall).
export const HOUSE_WIDTH = 1.8;
export const HOUSE_DEPTH = 2.0;
const WIDTH = HOUSE_WIDTH;
const DEPTH = HOUSE_DEPTH;
const WALL_HEIGHT = 1.1;
const WALL_THICK = 0.1;
const TENT_HEIGHT = 1.5;

let root: THREE.Group | null = null;
let rendered = '';
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function prism(width: number, depth: number, height: number, material: THREE.Material): THREE.Mesh {
  // A triangle in x/y, extruded along z: the gable end of a tent or a roof.
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geometry.translate(0, 0, -depth / 2);
  return shadowed(new THREE.Mesh(geometry, material));
}

function box(width: number, height: number, depth: number, material: THREE.Material, x: number, y: number, z: number) {
  const mesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material));
  mesh.position.set(x, y + height / 2, z);
  return mesh;
}

const scaffoldMaterial = createColorMaterial('#b58a4a', 0.9);
const doorMaterial = createColorMaterial('#3b2c22', 0.95);

function addScaffolding(host: THREE.Group, width: number, depth: number, height: number, x = 0, z = 0) {
  const corners: Array<[number, number]> = [
    [-width / 2 - 0.15, -depth / 2 - 0.15], [width / 2 + 0.15, -depth / 2 - 0.15],
    [width / 2 + 0.15, depth / 2 + 0.15], [-width / 2 - 0.15, depth / 2 + 0.15],
  ];
  for (const [cx, cz] of corners) host.add(box(0.06, height, 0.06, scaffoldMaterial, x + cx, 0, z + cz));
  for (const y of [height * 0.45, height * 0.9]) {
    host.add(box(width + 0.3, 0.05, 0.05, scaffoldMaterial, x, y, z - depth / 2 - 0.15));
    host.add(box(width + 0.3, 0.05, 0.05, scaffoldMaterial, x, y, z + depth / 2 + 0.15));
    host.add(box(0.05, 0.05, depth + 0.3, scaffoldMaterial, x - width / 2 - 0.15, y, z));
    host.add(box(0.05, 0.05, depth + 0.3, scaffoldMaterial, x + width / 2 + 0.15, y, z));
  }
}

/** The house for a plan, at the origin, door on +z. Shared by the player's own home and every neighbor's. */
export function buildHouse(plan: ExteriorPlan): THREE.Group {
  const host = new THREE.Group();
  const cloth = getMaterial('paper.orangewrap');
  const wallPaper = getMaterial('paper.notebook');
  const roofPaper = getMaterial('paper.salmon');
  const floorPaper = getMaterial('paper.brown.warm');
  let top = 0;

  if (plan.groundSheet) host.add(box(WIDTH + 0.4, 0.03, DEPTH + 0.4, getMaterial('paper.cork'), 0, 0, 0));
  if (plan.floor) {
    host.add(box(WIDTH + 0.2, 0.12, DEPTH + 0.2, floorPaper, 0, 0, 0));
    top = 0.12;
  }

  if (plan.tent) {
    const tent = prism(WIDTH, DEPTH, TENT_HEIGHT, cloth);
    tent.position.y = top;
    // Extruded along z already; the door flap sits on the front gable.
    host.add(tent);
    const flap = new THREE.Mesh(
      new THREE.ShapeGeometry(new THREE.Shape([
        new THREE.Vector2(-0.3, 0), new THREE.Vector2(0.3, 0), new THREE.Vector2(0, 0.9),
      ])),
      doorMaterial,
    );
    flap.position.set(0, top, DEPTH / 2 + 0.01);
    host.add(flap);
  }

  if (plan.walls) {
    const y = top;
    host.add(box(WALL_THICK, WALL_HEIGHT, DEPTH, wallPaper, -WIDTH / 2, y, 0));
    host.add(box(WALL_THICK, WALL_HEIGHT, DEPTH, wallPaper, WIDTH / 2, y, 0));
    host.add(box(WIDTH, WALL_HEIGHT, WALL_THICK, wallPaper, 0, y, -DEPTH / 2));
    // Front wall with a doorway left open.
    const side = (WIDTH - 0.6) / 2;
    host.add(box(side, WALL_HEIGHT, WALL_THICK, wallPaper, -(0.3 + side / 2), y, DEPTH / 2));
    host.add(box(side, WALL_HEIGHT, WALL_THICK, wallPaper, 0.3 + side / 2, y, DEPTH / 2));
    host.add(box(0.6, WALL_HEIGHT - 0.85, WALL_THICK, wallPaper, 0, y + 0.85, DEPTH / 2));
    top = y + WALL_HEIGHT;
  }

  if (plan.upper) {
    host.add(box(WIDTH, 1.0, DEPTH, wallPaper, 0, top, 0));
    top += 1.0;
  }

  if (plan.roof) {
    const roof = prism(WIDTH + 0.4, DEPTH + 0.4, 0.9, roofPaper);
    roof.position.y = top;
    host.add(roof);
  }

  // Extra rooms are low annexes beside the house, each with its own small roof.
  for (let index = 0; index < plan.rooms; index += 1) {
    const side = index === 0 ? 1 : -1;
    const x = side * (WIDTH / 2 + 0.85);
    host.add(box(1.6, 0.95, 1.6, wallPaper, x, 0, 0));
    const annexRoof = prism(1.8, 1.8, 0.5, roofPaper);
    annexRoof.position.set(x, 0.95, 0);
    host.add(annexRoof);
  }

  if (plan.scaffolding) {
    const tall = plan.scaffolding === 'upstairs' ? top + 1.2 : Math.max(top, WALL_HEIGHT) + 0.7;
    if (plan.scaffolding === 'room-1') addScaffolding(host, 1.6, 1.6, 1.4, WIDTH / 2 + 0.85, 0);
    else if (plan.scaffolding === 'room-2') addScaffolding(host, 1.6, 1.6, 1.4, -(WIDTH / 2 + 0.85), 0);
    else addScaffolding(host, WIDTH, DEPTH, tall);
  }
  return host;
}

function redraw() {
  if (!root) return;
  const plan = exteriorPlan(getGameState().world.dwelling);
  const signature = exteriorSignature(plan);
  if (signature === rendered) return;
  rendered = signature;
  // The ground the house claims changes with its rooms; walkers and diggers ask again.
  invalidateFootprintCache();
  for (const child of [...root.children]) {
    root.remove(child);
    child.traverse((node) => {
      if (node instanceof THREE.Mesh) node.geometry.dispose();
    });
  }
  root.add(buildHouse(plan));
}

/** The saved Home place this house stands beside. */
function homePlace(): { x: number; z: number } {
  const place = getPlace(HOME_PLACE_ID);
  return place ? { x: place.x, z: place.z } : { x: -1.5, z: -2.2 };
}

/** A lot move changes no boards, walls, or roof, so it must not depend on the
 * exterior's appearance signature. Keep the drawn house, its map footprint,
 * and collision cache on the saved Home place whenever allocation moves it. */
function syncPosition() {
  if (!root) return;
  const spot = homePosition(homePlace());
  root.position.set(spot.x, sampleTerrainHeight(spot.x, spot.z), spot.z);
  updateMapFeaturePosition('home-tent', spot.x, spot.z);
  invalidateFootprintCache();
}

export function buildDwellingExterior(parent: THREE.Group) {
  const spot = homePosition(homePlace());
  root = new THREE.Group();
  root.name = 'home-exterior';
  root.position.set(spot.x, sampleTerrainHeight(spot.x, spot.z), spot.z);
  root.rotation.y = homeFacing();
  parent.add(root);
  registerMapFeature({
    color: '#c8813a',
    id: 'home-tent',
    kind: 'building',
    radiusX: WIDTH / 2,
    radiusZ: DEPTH / 2,
    shape: 'rect',
    x: spot.x,
    z: spot.z,
  });
  rendered = '';
  redraw();
  syncPosition();
  onGameStateChanged(redraw);
  onPlacesChanged(syncPosition);
}

export function isNearHomeExterior(position: { x: number; z: number }): boolean {
  return isNearHome(position, homePlace());
}

/** True when the pointer is over the visible house. */
export function isHomeAtScreen(clientX: number, clientY: number, camera: THREE.Camera): boolean {
  if (!root || root.parent?.visible === false) return false;
  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(root, true).length > 0;
}
