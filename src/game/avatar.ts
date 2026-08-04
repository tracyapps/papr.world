import * as THREE from 'three';
import { applyAlphaShadow } from '../render/builders';
import { camera, scene, textureLoader } from '../render/context';
import { sampleTerrainHeight } from '../world/terrain';
import { updateWading, wadeSinkAt, wadeSpeedMultiplier } from './wading';
import { getViewCloseness, getYaw } from './camera';
import { getMovementInput, type MovementInput } from './input';
import { isSolidAt } from '../world/footprints';
import { slideMove } from '../core/placement';

/**
 * How much room the player keeps around a wall.
 *
 * A touch wider than a critter's — the avatar is a bigger cutout, and clipping
 * a corner of the house is more noticeable at the camera distance you view
 * yourself from.
 */
const PLAYER_BODY_RADIUS = 0.22;

// The flat paper avatar: billboarded drawing with a soft blob shadow.
// Movement has acceleration, a little walk bob, and a paper-y lean so
// it feels like a cutout being scooted across a craft table.

const MAX_SPEED = 3.1;
const ACCELERATION = 14;
const DECELERATION = 18;
const BOB_FREQUENCY = 7.4;
const BOB_HEIGHT = 0.045;
const LEAN_AMOUNT = 0.085;

const avatarTexture = textureLoader.load('/assets/runtime/avatars/avatar_placeholder_flat_01.png');
avatarTexture.colorSpace = THREE.SRGBColorSpace;

const avatarMaterial = new THREE.MeshStandardMaterial({
  alphaTest: 0.03,
  depthWrite: false,
  map: avatarTexture,
  transparent: true,
  roughness: 0.94,
  metalness: 0,
  side: THREE.DoubleSide,
});

export const avatar = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.55), avatarMaterial);
avatar.castShadow = true;
applyAlphaShadow(avatar, avatarTexture, 0.03);

const avatarShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.52, 32),
  new THREE.MeshBasicMaterial({
    color: '#3d352d',
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  }),
);
avatarShadow.rotation.x = -Math.PI / 2;

const velocity = new THREE.Vector3();
let walkPhase = 0;
let currentLean = 0;

export function spawnAvatar(x: number, z: number) {
  avatar.position.set(x, sampleTerrainHeight(x, z) + 0.78, z);
  avatarShadow.position.set(x, sampleTerrainHeight(x, z) + 0.006, z);
  scene.add(avatar, avatarShadow);
}

function desiredDirection(movement: MovementInput): THREE.Vector3 {
  const yaw = getYaw();
  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  const direction = new THREE.Vector3();
  direction.addScaledVector(forward, movement.y);
  direction.addScaledVector(right, movement.x);
  if (direction.lengthSq() > 1) direction.normalize();
  return direction;
}

export function updateAvatar(delta: number) {
  const movement = getMovementInput();
  const direction = desiredDirection(movement);
  const wantsToMove = direction.lengthSq() > 0.0001;

  // Accelerate toward the desired velocity; brake a little harder than
  // we accelerate so stopping feels planted, not slippery.
  const targetVelocity = direction.clone().multiplyScalar(MAX_SPEED);
  const rate = wantsToMove ? ACCELERATION : DECELERATION;
  const maxChange = rate * delta;
  const change = targetVelocity.sub(velocity);
  if (change.length() > maxChange) {
    change.setLength(maxChange);
  }
  velocity.add(change);

  // Water slows movement rather than damping input, so a fully pressed stick
  // still reads as fully pressed while the character wades.
  const wadeScale = wadeSpeedMultiplier(avatar.position.x, avatar.position.z);
  const speed = velocity.length();
  if (speed > 0.001) {
    // Walls, trees and the Thing Maker stop you, but sliding along them keeps
    // doorways and gaps between trees passable without precise steering — a
    // hard stop on any contact makes a cozy world feel like a maze.
    const moved = slideMove(
      avatar.position.x,
      avatar.position.z,
      velocity.x * delta * wadeScale,
      velocity.z * delta * wadeScale,
      (x, z) => isSolidAt(x, z, PLAYER_BODY_RADIUS),
    );
    avatar.position.x = moved.x;
    avatar.position.z = moved.z;
  }

  // Walk bob: a light hop that scales with how fast we're moving.
  const speedRatio = Math.min(speed / MAX_SPEED, 1);
  walkPhase += delta * BOB_FREQUENCY * (0.4 + speedRatio);
  const bob = Math.abs(Math.sin(walkPhase)) * BOB_HEIGHT * speedRatio;

  const terrainHeight = sampleTerrainHeight(avatar.position.x, avatar.position.z);
  // Standing in water lowers the cutout and flattens its bob — you cannot
  // bounce as freely with your legs in a creek.
  const sink = wadeSinkAt(avatar.position.x, avatar.position.z);
  const wetBob = bob * (1 - Math.min(1, sink / 0.26) * 0.6);
  avatar.position.y = THREE.MathUtils.lerp(
    avatar.position.y,
    terrainHeight + 0.78 + wetBob - sink,
    0.28,
  );
  updateWading(delta, avatar.position, speed * wadeScale);

  // Zooming fully in becomes first person: the cutout fades away so you
  // see through your own eyes. Its paper shadow stays on the ground —
  // you're still a cutout, you just can't see yourself.
  const closeness = getViewCloseness();
  avatarMaterial.opacity = 1 - closeness;
  avatar.visible = closeness < 0.98;

  // Billboard toward the camera, then lean into sideways motion like a
  // cutout being pushed along. (Skip when the camera is inside us.)
  if (avatar.visible) {
    avatar.lookAt(camera.position.x, avatar.position.y, camera.position.z);
  }

  const yaw = getYaw();
  const rightward = velocity.x * Math.cos(yaw) - velocity.z * Math.sin(yaw);
  const targetLean = -THREE.MathUtils.clamp(rightward / MAX_SPEED, -1, 1) * LEAN_AMOUNT;
  currentLean = THREE.MathUtils.lerp(currentLean, targetLean, Math.min(delta * 9, 1));
  avatar.rotateZ(currentLean);

  avatarShadow.position.set(avatar.position.x, terrainHeight + 0.006, avatar.position.z);
  const shadowShrink = 1 - bob * 1.4;
  avatarShadow.scale.setScalar(shadowShrink);
}
