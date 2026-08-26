import * as THREE from 'three';
import {
  DESIGN_CUTOUT,
  DESIGN_GROUND_Y,
  DESIGN_SHEET,
  type PlayerState,
} from '../../shared/src/index';
import { camera, scene, textureLoader } from '../render/context';
import { bridgeDeckHeightAt } from '../world/water';
import { sampleTerrainHeight } from '../world/terrain';
import type { RemoteSample } from './remotePlayers';

const CUTOUT_WORLD_HEIGHT = 1.55;
const SHEET_UNIT = CUTOUT_WORLD_HEIGHT / DESIGN_CUTOUT.height;
const PLANE_WIDTH = DESIGN_SHEET.width * SHEET_UNIT;
const PLANE_HEIGHT = DESIGN_SHEET.height * SHEET_UNIT;
const CENTER_Y = 0.06 + (DESIGN_GROUND_Y - DESIGN_SHEET.height / 2) * SHEET_UNIT;
const MAX_VISIBLE_DISTANCE = 42;

type RemoteVisual = {
  root: THREE.Group;
  cutout: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  label: THREE.Sprite;
};

const root = new THREE.Group();
root.name = 'shared-players';
const visuals = new Map<string, RemoteVisual>();

const placeholder = textureLoader.load('/assets/runtime/avatars/avatar_placeholder_flat_01.png');
placeholder.colorSpace = THREE.SRGBColorSpace;

export function initializeRemoteAvatarVisuals(): void {
  if (!root.parent) scene.add(root);
}

export function addRemoteAvatar(player: PlayerState): void {
  removeRemoteAvatar(player.id);

  const host = new THREE.Group();
  host.name = `shared-player:${player.id}`;

  const material = new THREE.MeshStandardMaterial({
    alphaTest: 0.03,
    color: player.avatar.edgeColor,
    depthWrite: false,
    map: placeholder,
    metalness: 0,
    roughness: 0.94,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const cutout = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT), material);
  cutout.castShadow = true;
  cutout.position.y = CENTER_Y;
  const label = makeNameLabel(player.name);
  host.add(cutout, label);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.48, 24),
    new THREE.MeshBasicMaterial({
      color: '#3d352d',
      depthWrite: false,
      opacity: 0.14,
      transparent: true,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.006;
  host.add(shadow);

  root.add(host);
  visuals.set(player.id, { root: host, cutout, label });
}

export function removeRemoteAvatar(id: string): void {
  const visual = visuals.get(id);
  if (!visual) return;
  visual.root.removeFromParent();
  visual.cutout.geometry.dispose();
  visual.cutout.material.dispose();
  visual.label.material.map?.dispose();
  visual.label.material.dispose();
  visuals.delete(id);
}

export function clearRemoteAvatars(): void {
  for (const id of [...visuals.keys()]) removeRemoteAvatar(id);
}

export function updateRemoteAvatar(
  id: string,
  sample: RemoteSample,
  localPosition: THREE.Vector3,
): void {
  const visual = visuals.get(id);
  if (!visual) return;
  const distance = Math.hypot(sample.x - localPosition.x, sample.z - localPosition.z);
  visual.root.visible = distance <= MAX_VISIBLE_DISTANCE;
  if (!visual.root.visible) return;

  const ground = bridgeDeckHeightAt(sample.x, sample.z) ?? sampleTerrainHeight(sample.x, sample.z);
  visual.root.position.set(sample.x, ground, sample.z);
  visual.cutout.lookAt(camera.position.x, ground + CENTER_Y, camera.position.z);
}

export function remoteAvatarCount(): number {
  return visuals.size;
}

function makeNameLabel(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const context = canvas.getContext('2d');
  if (context) {
    context.font = '600 34px Georgia, serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const safeName = name.slice(0, 24);
    const width = Math.min(350, context.measureText(safeName).width + 42);
    context.fillStyle = 'rgba(247, 241, 222, 0.94)';
    context.strokeStyle = 'rgba(74, 61, 43, 0.72)';
    context.lineWidth = 4;
    context.beginPath();
    context.roundRect((384 - width) / 2, 14, width, 68, 14);
    context.fill();
    context.stroke();
    context.fillStyle = '#3f3428';
    context.fillText(safeName, 192, 48);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.position.y = CENTER_Y + PLANE_HEIGHT / 2 + 0.18;
  sprite.scale.set(1.75, 0.44, 1);
  return sprite;
}
