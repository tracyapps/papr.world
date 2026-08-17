import * as THREE from 'three';
import { applyAlphaShadow } from '../render/builders';
import { camera, scene, textureLoader } from '../render/context';
import { sampleTerrainHeight } from '../world/terrain';
import { updateWading, wadeSinkAt, wadeSpeedMultiplier } from './wading';
import { getViewCloseness, getYaw } from './camera';
import { getMovementInput, type MovementInput } from './input';
import { isSolidAt } from '../world/footprints';
import { DESIGN_CUTOUT, DESIGN_GROUND_Y, DESIGN_SHEET } from '../../shared/src/index';
import { slideMove } from '../core/placement';
import { isTimedActionActive } from './timedAction';

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

/**
 * The look you start with. It is a placeholder in the honest sense — a player
 * who never opens the editor still has a cutout, and one who does replaces
 * this via `setAvatarTexture` (src/game/avatarLook.ts).
 */
const placeholderTexture = textureLoader.load(
  '/assets/runtime/avatars/avatar_placeholder_flat_01.png',
);
placeholderTexture.colorSpace = THREE.SRGBColorSpace;

let avatarTexture: THREE.Texture = placeholderTexture;

const avatarMaterial = new THREE.MeshStandardMaterial({
  alphaTest: 0.03,
  depthWrite: false,
  map: avatarTexture,
  transparent: true,
  roughness: 0.94,
  metalness: 0,
  side: THREE.DoubleSide,
});

/**
 * The cutout is 1.55 units tall in the world, and always has been — that is
 * the number this whole block is arranged to keep true.
 *
 * The design sheet grew larger than the cutout (stamps need somewhere to hang
 * arms and hair), so the plane grew with it while the cutout itself stayed
 * put: one sheet unit is a fixed world distance, the plane is the whole sheet
 * at that scale, and the centre is offset so the cutout's ground line still
 * meets the terrain exactly where it used to. Derived rather than typed in, so
 * changing DESIGN_CUTOUT in shared/ moves everything together.
 */
const CUTOUT_WORLD_HEIGHT = 1.55;
const SHEET_UNIT = CUTOUT_WORLD_HEIGHT / DESIGN_CUTOUT.height;
const PLANE_WIDTH = DESIGN_SHEET.width * SHEET_UNIT;
const PLANE_HEIGHT = DESIGN_SHEET.height * SHEET_UNIT;
/** How far the cutout's feet float above the terrain — unchanged, deliberate. */
const FOOT_CLEARANCE = 0.06;
/**
 * Plane centre above the terrain: the ground line sits FOOT_CLEARANCE up, and
 * the centre sits above that by however many sheet units separate them.
 */
const AVATAR_CENTER_Y =
  FOOT_CLEARANCE + (DESIGN_GROUND_Y - DESIGN_SHEET.height / 2) * SHEET_UNIT;

export const avatar = new THREE.Mesh(
  new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT),
  avatarMaterial,
);
avatar.castShadow = true;
applyAlphaShadow(avatar, avatarTexture, 0.03);

/**
 * Swap the cutout's artwork — the player saved a new design.
 *
 * The cast shadow is derived from texture alpha, so it has to be re-derived
 * with the new texture or a snail would keep throwing a blob-shaped shadow.
 * The old texture is disposed unless it is the placeholder, which is shared
 * and may be worn again.
 */
export function setAvatarTexture(texture: THREE.Texture): void {
  const previous = avatarTexture;
  avatarTexture = texture;
  avatarMaterial.map = texture;
  avatarMaterial.needsUpdate = true;
  applyAlphaShadow(avatar, texture, 0.03);
  if (previous !== placeholderTexture) previous.dispose();
}

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
  avatar.position.set(x, sampleTerrainHeight(x, z) + AVATAR_CENTER_Y, z);
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
  // Short work actions are intentionally planted in place. Input is not
  // discarded globally (Esc still cancels); only locomotion pauses while the
  // shared progress treatment is visible.
  const movement = isTimedActionActive() ? { x: 0, y: 0 } : getMovementInput();
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
    terrainHeight + AVATAR_CENTER_Y + wetBob - sink,
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
