import * as THREE from 'three';
import type { HomeMarker } from '../../shared/src/index';
import { camera, scene } from '../render/context';
import { sampleTerrainHeight } from '../world/terrain';

// A neighbor's Home, staked out like a building lot before anything is
// built on it (avatar-and-identity.md / land-and-dwellings.md). The point
// isn't the marker itself — it's that a passerby can watch new stakes
// appear around them as new neighbors sign up, long before anyone has
// placed a single piece there.
//
// Deliberately built from primitives, the same convention as the other
// procedural fallbacks in this codebase (resourceDropVisual.ts) — no new
// art asset for something this small and this temporary-feeling.

const LOT_HALF = 0.6;
const STAKE_HEIGHT = 0.3;
const POST_HEIGHT = 0.92;
const SIGN_Y = POST_HEIGHT - 0.14;

type HomeVisual = {
  root: THREE.Group;
  sign: THREE.Sprite;
  accountId: string;
  name: string;
};

const root = new THREE.Group();
root.name = 'shared-homes';
const visuals = new Map<string, HomeVisual>();

const stakeGeometry = new THREE.CylinderGeometry(0.012, 0.03, STAKE_HEIGHT, 5);
const stakeMaterial = new THREE.MeshStandardMaterial({
  color: '#8a6a45', metalness: 0, roughness: 0.9,
});
const postGeometry = new THREE.CylinderGeometry(0.035, 0.045, POST_HEIGHT, 6);
const postMaterial = new THREE.MeshStandardMaterial({
  color: '#7c5c3a', metalness: 0, roughness: 0.92,
});
const stringMaterial = new THREE.LineDashedMaterial({
  color: '#c9a463', dashSize: 0.08, gapSize: 0.05, linewidth: 1,
});

export function initializeSharedHomeVisuals(): void {
  if (!root.parent) scene.add(root);
}

function buildLotOutline(): THREE.LineLoop {
  const corners = [
    new THREE.Vector3(-LOT_HALF, STAKE_HEIGHT * 0.62, -LOT_HALF),
    new THREE.Vector3(LOT_HALF, STAKE_HEIGHT * 0.62, -LOT_HALF),
    new THREE.Vector3(LOT_HALF, STAKE_HEIGHT * 0.62, LOT_HALF),
    new THREE.Vector3(-LOT_HALF, STAKE_HEIGHT * 0.62, LOT_HALF),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(corners);
  const line = new THREE.LineLoop(geometry, stringMaterial);
  line.computeLineDistances();
  return line;
}

function makeSignSprite(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 168;
  const context = canvas.getContext('2d');
  if (context) {
    // Hazard-stripe bands, kept in the game's kraft/gold palette rather than
    // literal safety yellow so it reads as "papercraft caution", not a real
    // construction site.
    const stripeHeight = 16;
    context.save();
    context.beginPath();
    context.rect(0, 0, 384, stripeHeight);
    context.rect(0, 168 - stripeHeight, 384, stripeHeight);
    context.clip();
    context.fillStyle = '#3f3428';
    context.fillRect(0, 0, 384, 168);
    context.fillStyle = '#d8a03c';
    const stripeWidth = 22;
    context.translate(0, 0);
    for (let x = -168; x < 384 + 168; x += stripeWidth * 2) {
      context.save();
      context.transform(1, 0, -0.6, 1, 0, 0);
      context.fillRect(x, -20, stripeWidth, 210);
      context.restore();
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
    context.fillStyle = '#8a5a2a';
    context.font = '700 22px Georgia, serif';
    context.fillText('BUILDING A HOME', 192, stripeHeight + 42);

    const safeName = name.slice(0, 24);
    context.fillStyle = '#3f3428';
    context.font = '600 30px Georgia, serif';
    context.fillText(safeName, 192, stripeHeight + 82);

    context.fillStyle = '#6b5a44';
    context.font = 'italic 17px Georgia, serif';
    context.fillText('a new neighbor, papering in', 192, stripeHeight + 112);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.position.y = SIGN_Y;
  sprite.scale.set(1.5, 0.66, 1);
  return sprite;
}

export function addSharedHome(home: HomeMarker): void {
  removeSharedHome(home.accountId);

  const host = new THREE.Group();
  host.name = `shared-home:${home.accountId}`;

  const corners: Array<[number, number]> = [
    [-LOT_HALF, -LOT_HALF], [LOT_HALF, -LOT_HALF], [LOT_HALF, LOT_HALF], [-LOT_HALF, LOT_HALF],
  ];
  for (const [x, z] of corners) {
    const stake = new THREE.Mesh(stakeGeometry, stakeMaterial);
    stake.position.set(x, STAKE_HEIGHT / 2, z);
    stake.castShadow = true;
    host.add(stake);
  }
  host.add(buildLotOutline());

  const post = new THREE.Mesh(postGeometry, postMaterial);
  post.position.set(-LOT_HALF, POST_HEIGHT / 2, -LOT_HALF);
  post.castShadow = true;
  host.add(post);

  const sign = makeSignSprite(home.name);
  sign.position.x = -LOT_HALF;
  sign.position.z = -LOT_HALF;
  host.add(sign);

  const ground = sampleTerrainHeight(home.x, home.z);
  host.position.set(home.x, ground, home.z);

  root.add(host);
  visuals.set(home.accountId, { root: host, sign, accountId: home.accountId, name: home.name });
}

export function removeSharedHome(accountId: string): void {
  const visual = visuals.get(accountId);
  if (!visual) return;
  visual.root.removeFromParent();
  visual.sign.material.map?.dispose();
  visual.sign.material.dispose();
  visuals.delete(accountId);
}

export function clearSharedHomeVisuals(): void {
  for (const accountId of [...visuals.keys()]) removeSharedHome(accountId);
}

export function sharedHomeCount(): number {
  return visuals.size;
}

export type SharedHomeHit = { accountId: string; name: string };

const pickRaycaster = new THREE.Raycaster();
const pickNdc = new THREE.Vector2();

/** The home marker under a screen point, so clicking it opens that
 * neighbor's player card the same way clicking their avatar does. */
export function pickSharedHomeAtScreen(clientX: number, clientY: number): SharedHomeHit | null {
  pickNdc.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1,
  );
  pickRaycaster.setFromCamera(pickNdc, camera);

  const hosts = [...visuals.values()];
  const hits = pickRaycaster.intersectObjects(hosts.map((visual) => visual.root), true);
  if (hits.length === 0) return null;

  let node: THREE.Object3D | null = hits[0].object;
  while (node) {
    const owner = hosts.find((visual) => visual.root === node);
    if (owner) return { accountId: owner.accountId, name: owner.name };
    node = node.parent;
  }
  return null;
}
