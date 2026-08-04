import * as THREE from 'three';
import { createRng } from '../core/math';
import { camera, scene } from './context';
import { RENDER_ORDER } from './renderOrder';

// Fluffy paper clouds: flat cutout clusters of overlapping circles,
// like clouds snipped from cream paper. A ring of upright clouds sits
// around the horizon (visible when the camera tilts level), and a few
// horizontal ones float overhead for when the player looks up.

const CLOUD_PARALLAX = 0.88;
const CLOUD_SEED = 20260716;

type CloudDrift = {
  group: THREE.Group;
  baseY: number;
  phase: number;
  bobAmount: number;
};

let cloudLayer: THREE.Group | null = null;
const drifts: CloudDrift[] = [];
/** Overhead clouds billboard toward the camera so they're never seen edge-on. */
const billboardClouds: THREE.Group[] = [];

const cloudMaterials = [
  new THREE.MeshBasicMaterial({ color: '#fffdf4', transparent: true, opacity: 0.96, depthWrite: false, side: THREE.DoubleSide }),
  new THREE.MeshBasicMaterial({ color: '#fdf6e8', transparent: true, opacity: 0.94, depthWrite: false, side: THREE.DoubleSide }),
];
const cloudShadeMaterial = new THREE.MeshBasicMaterial({
  color: '#e4dcc8',
  transparent: true,
  opacity: 0.9,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/** One cloud: 3-5 overlapping paper circles with a slightly offset
 * darker layer behind, like two sheets glued together. */
function createCloud(rng: () => number): THREE.Group {
  const cloud = new THREE.Group();
  const puffCount = 3 + Math.floor(rng() * 3);
  const material = cloudMaterials[Math.floor(rng() * cloudMaterials.length)];

  let cursorX = 0;
  for (let index = 0; index < puffCount; index += 1) {
    const middleBoost = 1 - Math.abs(index - (puffCount - 1) / 2) / puffCount;
    const radius = 0.55 + rng() * 0.35 + middleBoost * 0.55;

    const puff = new THREE.Mesh(new THREE.CircleGeometry(radius, 26), material);
    puff.position.set(cursorX, radius * (0.5 + middleBoost * 0.35), 0);

    const shade = new THREE.Mesh(new THREE.CircleGeometry(radius, 26), cloudShadeMaterial);
    shade.position.set(cursorX + 0.08, puff.position.y - 0.1, -0.02);

    cloud.add(shade, puff);
    cursorX += radius * (1.1 + rng() * 0.3);
  }

  // Center the cluster horizontally.
  cloud.children.forEach((child) => {
    child.position.x -= cursorX / 2;
  });

  return cloud;
}

export function buildClouds() {
  cloudLayer = new THREE.Group();
  const rng = createRng(CLOUD_SEED);

  // Horizon ring: upright clouds facing inward.
  const ringCount = 10;
  for (let index = 0; index < ringCount; index += 1) {
    const angle = (index / ringCount) * Math.PI * 2 + rng() * 0.35;
    const radius = 36 + rng() * 30;
    const cloud = createCloud(rng);
    const scale = 2.4 + rng() * 2.4;
    cloud.scale.setScalar(scale);
    const baseY = 10.5 + rng() * 10;
    cloud.position.set(Math.sin(angle) * radius, baseY, Math.cos(angle) * radius);
    cloud.rotation.y = angle;
    cloud.renderOrder = RENDER_ORDER.cloudsHigh;
    cloudLayer.add(cloud);
    drifts.push({ group: cloud, baseY, phase: rng() * Math.PI * 2, bobAmount: 0.3 + rng() * 0.35 });
  }

  // Overhead: clouds you mostly notice when you look up. These billboard
  // toward the camera every frame — a fixed flat plane reads as a weird
  // straight-edged sliver whenever it's seen edge-on.
  const overheadCount = 5;
  for (let index = 0; index < overheadCount; index += 1) {
    const cloud = createCloud(rng);
    const scale = 2.8 + rng() * 2.2;
    cloud.scale.setScalar(scale);
    const baseY = 16 + rng() * 7;
    cloud.position.set((rng() * 2 - 1) * 26, baseY, (rng() * 2 - 1) * 26);
    cloud.renderOrder = RENDER_ORDER.cloudsLow;
    cloudLayer.add(cloud);
    billboardClouds.push(cloud);
    drifts.push({ group: cloud, baseY, phase: rng() * Math.PI * 2, bobAmount: 0.2 + rng() * 0.25 });
  }

  scene.add(cloudLayer);
}

export function updateClouds(avatarPosition: THREE.Vector3, elapsed: number) {
  if (!cloudLayer) return;

  cloudLayer.position.set(
    avatarPosition.x * CLOUD_PARALLAX,
    0,
    avatarPosition.z * CLOUD_PARALLAX,
  );

  // A very slow bob so the sky feels alive without demanding attention.
  for (const drift of drifts) {
    drift.group.position.y = drift.baseY + Math.sin(elapsed * 0.1 + drift.phase) * drift.bobAmount;
  }

  // Keep overhead clouds facing the camera.
  const cameraWorld = camera.position;
  for (const cloud of billboardClouds) {
    cloud.lookAt(cameraWorld);
  }
}
