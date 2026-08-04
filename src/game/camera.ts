import * as THREE from 'three';
import { camera } from '../render/context';
import { clamp } from '../core/math';
import { sampleTerrainHeight } from '../world/terrain';

// Follow camera as a pitch orbit around the avatar.
// High pitch = the old overhead craft-table view.
// Low pitch = level with the character's face, so the skyline, backdrop
// mountains, and paper clouds come into frame. R/F or right stick tilts.
//
// Zooming all the way in blends continuously into a first-person-ish
// view: the camera settles just behind the avatar's eyes (the avatar
// fades out — see game/avatar.ts) and pitch becomes look up/down.
// No mode switch; you just zoom into being the paper potato.

const MIN_PITCH = 0; // full skyward look; kept just shy of a singular camera angle below
const MAX_PITCH = 1.12; // steep overhead
const DEFAULT_PITCH = 0.65; // matches the old default framing
const MIN_DISTANCE = 1.15; // fully "inside" the avatar (first-person blend)
const MAX_DISTANCE = 12.5;

/** Below this distance the orbit starts blending into first person. */
const FIRST_PERSON_BLEND_START = 3.4;

/** Where the camera aims, relative to avatar center. At level pitch this
 * is the avatar's own head height, so "level" reads as eye-to-eye with
 * your character rather than staring over it. */
const LIFT_AT_MIN_PITCH = 1.15;
const LIFT_AT_MAX_PITCH = 0.35;

/** First-person eye height above avatar center (head of the cutout). */
const EYE_HEIGHT = 0.52;

/** Stop a sliver below vertical. Near 90 degrees the forward and camera-up
 * vectors become almost parallel, which makes tiny yaw changes feel like a
 * sudden spin. 87.5 degrees still reads as looking straight into the canopy
 * while leaving enough horizontal direction for calm, predictable turning. */
const MAX_UPWARD_ANGLE = THREE.MathUtils.degToRad(87.5);
const MAX_DOWNWARD_ANGLE = -1.16;
const SKYWARD_TRANSITION_END = 0.3;

let yaw = Math.PI / 4;
let pitch = DEFAULT_PITCH;
let cameraDistance = 8.5;
let targetPitch = pitch;
let targetCameraDistance = cameraDistance;
let viewCloseness = 0;

export function getYaw() {
  return yaw;
}

/** Debug snapshot for the console hook in main.ts. */
export function getCameraDebug() {
  return { pitch, targetPitch, cameraDistance, targetCameraDistance, viewCloseness };
}

/** 0 = normal orbit view, 1 = fully zoomed into first person. */
export function getViewCloseness() {
  return viewCloseness;
}

export function addYaw(delta: number) {
  yaw += delta;
}

export function adjustCameraZoom(amount: number) {
  targetCameraDistance = clamp(targetCameraDistance + amount, MIN_DISTANCE, MAX_DISTANCE);
}

/** Positive tilts toward overhead/downward; negative tilts toward the sky. */
export function adjustCameraPitch(amount: number) {
  targetPitch = clamp(targetPitch + amount, MIN_PITCH, MAX_PITCH);
}

/** Gamepad right-stick look. */
export function applyGamepadLook(delta: number, lookX: number, lookY: number) {
  yaw -= lookX * delta * 2.4;
  targetPitch = clamp(targetPitch - lookY * delta * 1.6, MIN_PITCH, MAX_PITCH);
}

function liftForPitch(currentPitch: number) {
  const t = (currentPitch - MIN_PITCH) / (MAX_PITCH - MIN_PITCH);
  return THREE.MathUtils.lerp(LIFT_AT_MIN_PITCH, LIFT_AT_MAX_PITCH, t);
}

const desiredPosition = new THREE.Vector3();
const lookPoint = new THREE.Vector3();
const fpEye = new THREE.Vector3();
const fpLook = new THREE.Vector3();
const skyLook = new THREE.Vector3();

export function updateCamera(target: THREE.Vector3) {
  pitch = THREE.MathUtils.lerp(pitch, targetPitch, 0.12);
  cameraDistance = THREE.MathUtils.lerp(cameraDistance, targetCameraDistance, 0.12);

  // How far into the first-person blend we are (smoothstepped).
  const rawCloseness = 1 - clamp(
    (cameraDistance - MIN_DISTANCE) / (FIRST_PERSON_BLEND_START - MIN_DISTANCE),
    0,
    1,
  );
  viewCloseness = rawCloseness * rawCloseness * (3 - 2 * rawCloseness);

  // --- Orbit framing ---
  const horizontal = Math.cos(pitch) * cameraDistance;
  desiredPosition.set(
    target.x + Math.sin(yaw) * horizontal,
    target.y + Math.sin(pitch) * cameraDistance,
    target.z + Math.cos(yaw) * horizontal,
  );
  lookPoint.set(target.x, target.y + liftForPitch(pitch), target.z);

  // The orbit used to stop at a level view because it always looked back at
  // the avatar. Near the lower end of the range, release that fixed target and
  // smoothly pan into the sky. This works even before first-person zoom.
  const rawSkyward = 1 - clamp(
    (pitch - MIN_PITCH) / (SKYWARD_TRANSITION_END - MIN_PITCH),
    0,
    1,
  );
  const skyward = rawSkyward * rawSkyward * (3 - 2 * rawSkyward);
  if (skyward > 0) {
    const upwardAngle = MAX_UPWARD_ANGLE * skyward;
    const horizontalLook = Math.cos(upwardAngle) * 4;
    skyLook.set(
      desiredPosition.x - Math.sin(yaw) * horizontalLook,
      desiredPosition.y + Math.sin(upwardAngle) * 4,
      desiredPosition.z - Math.cos(yaw) * horizontalLook,
    );
    lookPoint.lerp(skyLook, skyward);
  }

  // --- First-person framing: eye just behind the avatar's face, pitch
  // remapped to look up/down at the world. ---
  if (viewCloseness > 0) {
    fpEye.set(
      target.x + Math.sin(yaw) * 0.28,
      target.y + EYE_HEIGHT,
      target.z + Math.cos(yaw) * 0.28,
    );
    const pitchProgress = clamp((pitch - MIN_PITCH) / (MAX_PITCH - MIN_PITCH), 0, 1);
    const firstPersonAngle = THREE.MathUtils.lerp(MAX_UPWARD_ANGLE, MAX_DOWNWARD_ANGLE, pitchProgress);
    const firstPersonHorizontal = Math.cos(firstPersonAngle) * 4;
    fpLook.set(
      fpEye.x - Math.sin(yaw) * firstPersonHorizontal,
      fpEye.y + Math.sin(firstPersonAngle) * 4,
      fpEye.z - Math.cos(yaw) * firstPersonHorizontal,
    );

    desiredPosition.lerp(fpEye, viewCloseness);
    lookPoint.lerp(fpLook, viewCloseness);
  }

  camera.position.lerp(desiredPosition, 0.12);

  // Never let the camera dip under the paper terrain.
  const floor = sampleTerrainHeight(camera.position.x, camera.position.z) + 0.42;
  if (camera.position.y < floor) {
    camera.position.y = floor;
  }

  camera.lookAt(lookPoint);
}
