import * as THREE from 'three';
import type { HomeMarker } from '../../shared/src/index';
import { buildHouse } from '../game/dwellingExterior';
import { exteriorPlanFromParts } from '../game/dwellingLook';
import { camera, scene } from '../render/context';
import { invalidateFootprintCache } from '../world/footprints';
import { homeFacing, homePosition } from '../world/homeSite';
import {
  clearNeighborHomes,
  homeAddress,
  removeNeighborHome,
  setNeighborHome,
  signWords,
  type HomeAddress,
  type NeighborHome,
} from '../world/neighborHomes';
import { sampleTerrainHeight } from '../world/terrain';

// A neighbor's home, standing where theirs stands for them: the same tent or
// house, drawn from the parts they have finished, with scaffolding for the part
// going up. A sign beside the door says whose it is, and whether the house is
// open; a smaller plate on the other side of the door gives the house its
// number. (land-and-dwellings.md, house-and-home.md.)
//
// The drawing itself is the player's own (`buildHouse`); this file only decides
// where it stands and what the sign and the plate say. Everything the sign says
// is also said in words when you walk up to it (`game/guestsUi.ts`).

const POST_HEIGHT = 0.92;
const SIGN_Y = POST_HEIGHT - 0.14;
/** The sign stands to the side of the door, clear of the doorstep and the annex rooms. */
const SIGN_LOCAL = { x: -1.3, z: 1.75 } as const;

const PLATE_POST_HEIGHT = 0.62;
const PLATE_Y = PLATE_POST_HEIGHT - 0.1;
/** The plate gets its own short stake on the other side of the door, so the two
 *  boards never read as one cluttered noticeboard. Still clear of the annex
 *  room that stands at local (1.75, 0). */
const PLATE_LOCAL = { x: 1.15, z: 1.7 } as const;

type HomeVisual = {
  root: THREE.Group;
  sign: THREE.Sprite;
  plate: THREE.Sprite;
  address: HomeAddress;
  accountId: string;
  name: string;
};

const root = new THREE.Group();
root.name = 'shared-homes';
const visuals = new Map<string, HomeVisual>();

const postGeometry = new THREE.CylinderGeometry(0.035, 0.045, POST_HEIGHT, 6);
const platePostGeometry = new THREE.CylinderGeometry(0.03, 0.038, PLATE_POST_HEIGHT, 6);
/** Shared by every home, so removal must not dispose them (see `disposeGroup`). */
const sharedGeometries = new Set([postGeometry, platePostGeometry]);
const postMaterial = new THREE.MeshStandardMaterial({
  color: '#7c5c3a', metalness: 0, roughness: 0.92,
});

export function initializeSharedHomeVisuals(): void {
  if (!root.parent) scene.add(root);
}

/** A paper-cutout board on a canvas, sized in world units and hung at `y`. */
function boardSprite(canvas: HTMLCanvasElement, width: number, height: number, y: number): THREE.Sprite {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.position.y = y;
  sprite.scale.set(width, height, 1);
  return sprite;
}

function makeSignSprite(home: NeighborHome): THREE.Sprite {
  const { heading, line } = signWords(home);
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 168;
  const context = canvas.getContext('2d');
  if (context) {
    // Hazard-stripe bands only while nothing is built, kept in the game's
    // kraft/gold palette rather than literal safety yellow.
    const stripeHeight = home.parts.length === 0 && !home.open ? 16 : 6;
    context.save();
    context.beginPath();
    context.rect(0, 0, 384, stripeHeight);
    context.rect(0, 168 - stripeHeight, 384, stripeHeight);
    context.clip();
    context.fillStyle = home.open ? '#5f7d4a' : '#3f3428';
    context.fillRect(0, 0, 384, 168);
    if (stripeHeight > 6) {
      context.fillStyle = '#d8a03c';
      const stripeWidth = 22;
      for (let x = -168; x < 384 + 168; x += stripeWidth * 2) {
        context.save();
        context.transform(1, 0, -0.6, 1, 0, 0);
        context.fillRect(x, -20, stripeWidth, 210);
        context.restore();
      }
    }
    context.restore();

    context.fillStyle = 'rgba(247, 241, 222, 0.96)';
    context.strokeStyle = 'rgba(74, 61, 43, 0.75)';
    context.lineWidth = 4;
    context.beginPath();
    context.roundRect(14, stripeHeight + 6, 356, 168 - stripeHeight * 2 - 12, 12);
    context.fill();
    context.stroke();

    context.textAlign = 'center';
    context.fillStyle = home.open ? '#3f6a2f' : '#8a5a2a';
    context.font = '700 22px Georgia, serif';
    context.fillText(heading, 192, stripeHeight + 42);

    context.fillStyle = '#3f3428';
    context.font = '600 30px Georgia, serif';
    context.fillText(home.name.slice(0, 24), 192, stripeHeight + 82);

    if (line) {
      context.fillStyle = '#6b5a44';
      context.font = 'italic 17px Georgia, serif';
      context.fillText(line, 192, stripeHeight + 112);
    }
  }
  return boardSprite(canvas, 1.5, 0.66, SIGN_Y);
}

/**
 * The address plate: the same paper and ink as the sign, one size down, with
 * the number large and the name on the line below it — a house number, not a
 * second noticeboard. Nothing here changes with the open-house state, because
 * an address does not.
 */
function makeAddressPlateSprite(home: NeighborHome): THREE.Sprite {
  const address = homeAddress(home);
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = 'rgba(247, 241, 222, 0.96)';
    context.strokeStyle = 'rgba(74, 61, 43, 0.75)';
    context.lineWidth = 5;
    context.beginPath();
    context.roundRect(6, 6, 308, 116, 10);
    context.fill();
    context.stroke();

    context.textAlign = 'center';
    context.fillStyle = '#8a5a2a';
    context.font = '700 22px Georgia, serif';
    context.fillText(`No. ${address.number}`, 160, 52);

    context.fillStyle = '#3f3428';
    context.font = '600 30px Georgia, serif';
    context.fillText(address.name.slice(0, 24), 160, 94);
  }
  return boardSprite(canvas, 1.02, 0.41, PLATE_Y);
}

function disposeSprite(sprite: THREE.Sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((node) => {
    if (node instanceof THREE.Mesh && !sharedGeometries.has(node.geometry)) node.geometry.dispose();
  });
}

/** Draw (or redraw) a neighbor's home from what they published. */
export function addSharedHome(marker: HomeMarker): void {
  removeSharedHome(marker.accountId, false);
  const home = setNeighborHome(marker);
  if (!home) return;

  const host = new THREE.Group();
  host.name = `shared-home:${home.accountId}`;
  host.add(buildHouse(exteriorPlanFromParts(home.parts, home.building)));

  const post = new THREE.Mesh(postGeometry, postMaterial);
  post.position.set(SIGN_LOCAL.x, POST_HEIGHT / 2, SIGN_LOCAL.z);
  post.castShadow = true;
  host.add(post);
  const sign = makeSignSprite(home);
  sign.position.x = SIGN_LOCAL.x;
  sign.position.z = SIGN_LOCAL.z;
  host.add(sign);

  const platePost = new THREE.Mesh(platePostGeometry, postMaterial);
  platePost.position.set(PLATE_LOCAL.x, PLATE_POST_HEIGHT / 2, PLATE_LOCAL.z);
  platePost.castShadow = true;
  host.add(platePost);
  const plate = makeAddressPlateSprite(home);
  plate.position.x = PLATE_LOCAL.x;
  plate.position.z = PLATE_LOCAL.z;
  host.add(plate);

  const spot = homePosition(home.place);
  host.position.set(spot.x, sampleTerrainHeight(spot.x, spot.z), spot.z);
  host.rotation.y = homeFacing();

  root.add(host);
  visuals.set(home.accountId, {
    root: host,
    sign,
    plate,
    address: homeAddress(home),
    accountId: home.accountId,
    name: home.name,
  });
  // The house is solid, and claims its ground against digging and placing.
  invalidateFootprintCache();
}

export function removeSharedHome(accountId: string, forget = true): void {
  const visual = visuals.get(accountId);
  if (visual) {
    visual.root.removeFromParent();
    disposeGroup(visual.root);
    disposeSprite(visual.sign);
    disposeSprite(visual.plate);
    visuals.delete(accountId);
  }
  if (forget) {
    removeNeighborHome(accountId);
    invalidateFootprintCache();
  }
}

export function clearSharedHomeVisuals(): void {
  for (const accountId of [...visuals.keys()]) removeSharedHome(accountId, false);
  clearNeighborHomes();
  invalidateFootprintCache();
}

export function sharedHomeCount(): number {
  return visuals.size;
}

export type SharedHomeHit = { accountId: string; name: string };

const pickRaycaster = new THREE.Raycaster();
const pickNdc = new THREE.Vector2();

/** The first neighbor's home under a screen point, and which part of it. */
function pickVisualAtScreen(
  clientX: number,
  clientY: number,
): { visual: HomeVisual; object: THREE.Object3D } | null {
  pickNdc.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1,
  );
  pickRaycaster.setFromCamera(pickNdc, camera);

  const hosts = [...visuals.values()];
  const hits = pickRaycaster.intersectObjects(hosts.map((visual) => visual.root), true);
  if (hits.length === 0) return null;

  const object = hits[0].object;
  let node: THREE.Object3D | null = object;
  while (node) {
    const visual = hosts.find((entry) => entry.root === node);
    if (visual) return { visual, object };
    node = node.parent;
  }
  return null;
}

/** The home marker under a screen point, so clicking it opens that
 * neighbor's player card the same way clicking their avatar does. */
export function pickSharedHomeAtScreen(clientX: number, clientY: number): SharedHomeHit | null {
  const hit = pickVisualAtScreen(clientX, clientY);
  if (!hit) return null;
  return { accountId: hit.visual.accountId, name: hit.visual.name };
}

/**
 * The address plate under a screen point, when the click landed on the plate
 * itself rather than the house or the sign. It answers with the address — the
 * account id is what a caller opens a card with (`openPlayerCardFor`) — so the
 * number beside a door can be its own way to reach the person, apart from the
 * door panel the house opens.
 */
export function pickSharedHomePlateAtScreen(clientX: number, clientY: number): HomeAddress | null {
  const hit = pickVisualAtScreen(clientX, clientY);
  if (!hit || hit.object !== hit.visual.plate) return null;
  return hit.visual.address;
}
