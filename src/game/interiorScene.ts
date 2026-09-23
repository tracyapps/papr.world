import * as THREE from 'three';
import { shadowed } from '../render/builders';
import { createColorMaterial, getMaterial } from '../render/materials';
import type { SceneGround } from '../world/activeScene';
import {
  INTERIOR_DOOR_WIDTH,
  INTERIOR_ORIGIN,
  INTERIOR_WALL_HEIGHT,
  homeInteriorLayout,
  interiorBlocked,
  type InteriorLayout,
} from '../world/homeInterior';
import type { DwellingPartId } from '../sim/catalogs/dwellings';
import { getGameState } from '../sim/state';
import { homeSurfaceMaterial } from './homeSurfaceMaterial';
import { HOME_INTERIOR_PAGE_ID } from '../world/scenes';
import { buildPlacedPieceVisual } from '../world/buildPieceVisuals';
import { registerPlacedPieceVisual } from './placedPieceInteractions';

/**
 * The inside of the home, drawn in a scene of its own.
 *
 * The surface keeps its one `THREE.Scene` (`render/context.ts`), which many
 * files add to, and is simply not rendered while you are indoors. Nothing here
 * touches it. The avatar is handed across (`moveAvatarToScene`), and the room
 * stands at `INTERIOR_ORIGIN`, far from anything the surface generates.
 *
 * Built from primitives, like the exterior: a room with low walls (so the
 * orbiting camera can always see in), a floor, a rug, a doormat at the exit,
 * and a warm lamp. What it is made of follows the finished parts.
 */

export const interiorScene = new THREE.Scene();
interiorScene.background = new THREE.Color('#e9dfc6');

/** The room stands in this group, so its lights aim at the room, not at the world's origin. */
const room = new THREE.Group();
room.position.set(INTERIOR_ORIGIN.x, 0, INTERIOR_ORIGIN.z);
interiorScene.add(room);

const fixtures = new THREE.Group();
room.add(fixtures);

/** Player-made furniture uses world-space interior coordinates, just like the
 * avatar, so it sits beside (rather than inside) the origin-offset room group. */
const playerBuilds = new THREE.Group();
playerBuilds.name = 'interior-placed-piece-visuals';
interiorScene.add(playerBuilds);

const ambient = new THREE.AmbientLight('#fff1d6', 1.0);
// Sky-and-ground light, so upright things (the cutout, the walls) are lit from every side.
const hemisphere = new THREE.HemisphereLight('#fff6e0', '#d9c39a', 1.4);
const sun = new THREE.DirectionalLight('#ffffff', 1.1);
sun.position.set(3, 7, 2.5);
const lamp = new THREE.PointLight('#ffd9a0', 4, 14, 1.6);
lamp.position.set(0, 1.7, 0);
room.add(ambient, hemisphere, sun, sun.target, lamp);

const WALL_THICK = 0.12;
const doorMaterial = createColorMaterial('#3b2c22', 0.95);

function box(w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) {
  const mesh = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material));
  mesh.position.set(x, y + h / 2, z);
  return mesh;
}

function buildRoom(layout: InteriorLayout, parts: readonly DwellingPartId[]) {
  const group = new THREE.Group();
  const { halfWidth: hw, halfDepth: hd } = layout;
  // Light floors, so a kraft-brown cutout (the default) never disappears into it.
  const look = getGameState().world.homeLook;
  const floorMaterial = homeSurfaceMaterial(look.insideFloor);
  const wallMaterial = homeSurfaceMaterial(look.insideWalls);

  group.add(box(hw * 2, 0.06, hd * 2, floorMaterial, 0, -0.06, 0));
  group.add(box(2.4, 0.02, 1.6, getMaterial('paper.plaid'), 0, 0, -0.3));

  // Low walls on all four sides, with a doorway in the front one.
  group.add(box(hw * 2 + WALL_THICK, INTERIOR_WALL_HEIGHT, WALL_THICK, wallMaterial, 0, 0, -hd));
  group.add(box(WALL_THICK, INTERIOR_WALL_HEIGHT, hd * 2, wallMaterial, -hw, 0, 0));
  group.add(box(WALL_THICK, INTERIOR_WALL_HEIGHT, hd * 2, wallMaterial, hw, 0, 0));
  const side = (hw * 2 - INTERIOR_DOOR_WIDTH) / 2;
  group.add(box(side, INTERIOR_WALL_HEIGHT, WALL_THICK, wallMaterial, -(INTERIOR_DOOR_WIDTH / 2 + side / 2), 0, hd));
  group.add(box(side, INTERIOR_WALL_HEIGHT, WALL_THICK, wallMaterial, INTERIOR_DOOR_WIDTH / 2 + side / 2, 0, hd));
  // A dark flap of cloth over the doorway's top, so the exit reads as a door.
  group.add(box(INTERIOR_DOOR_WIDTH, INTERIOR_WALL_HEIGHT - 0.8, WALL_THICK, doorMaterial, 0, 0.8, hd));
  // A doormat on the inside, where leaving is offered.
  group.add(box(INTERIOR_DOOR_WIDTH * 0.9, 0.02, 0.5, getMaterial('paper.salmon'), 0, 0, layout.exit.z - INTERIOR_ORIGIN.z));

  // Corner poles: the tent's frame, standing inside its cloth.
  for (const [cx, cz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]] as const) {
    group.add(box(0.1, INTERIOR_WALL_HEIGHT + 0.5, 0.1, createColorMaterial('#b58a4a', 0.9), cx, 0, cz));
  }
  return group;
}

let drawn = '';

/** (Re)draw the room for these finished parts, only when the picture would change. */
export function refreshInterior(parts: readonly DwellingPartId[]) {
  refreshInteriorBuilds();
  const signature = [parts.includes('floor'), parts.includes('walls'), parts.includes('room-1'), parts.includes('room-2'), JSON.stringify(getGameState().world.homeLook)].join('|');
  if (signature === drawn) return;
  drawn = signature;
  for (const child of [...fixtures.children]) {
    fixtures.remove(child);
    child.traverse((node) => {
      if (node instanceof THREE.Mesh) node.geometry.dispose();
    });
  }
  fixtures.add(buildRoom(homeInteriorLayout(parts), parts));
}

/** Redraw the local player's persisted interior page after a build or load. */
export function refreshInteriorBuilds() {
  playerBuilds.clear();
  const page = getGameState().world.pages[HOME_INTERIOR_PAGE_ID];
  if (!page) return;
  for (const piece of Object.values(page.placedPieces)) {
    if (piece.page !== HOME_INTERIOR_PAGE_ID) continue;
    const visual = buildPlacedPieceVisual(piece);
    visual.position.set(piece.x, 0.01, piece.z);
    playerBuilds.add(visual);
    registerPlacedPieceVisual(piece.id, visual);
  }
}

/** A visit must never decorate somebody else's room with the visitor's save. */
export function setInteriorBuildsVisible(visible: boolean) {
  playerBuilds.visible = visible;
}

/** The floor and walls a walker meets inside. Flat floor at height 0. */
export function interiorGround(parts: readonly DwellingPartId[]): SceneGround {
  const layout = homeInteriorLayout(parts);
  return {
    height: () => 0,
    blocked: (x, z, radius) => interiorBlocked(layout, x, z, radius),
  };
}
