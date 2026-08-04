import * as THREE from 'three';
import { scene } from './context';

// Soft craft-table lighting. The key light follows the avatar so shadows
// stay crisp on whichever page the player is standing on.

const KEY_OFFSET = new THREE.Vector3(6, 10, 4);
const AMBIENT_SKY_BASE = new THREE.Color('#fff8e1');

let keyLight: THREE.DirectionalLight | null = null;
let keyTarget: THREE.Object3D | null = null;
let ambientLight: THREE.HemisphereLight | null = null;

export function addLighting() {
  ambientLight = new THREE.HemisphereLight(AMBIENT_SKY_BASE, '#8d927f', 1.8);
  scene.add(ambientLight);

  keyLight = new THREE.DirectionalLight('#fff3cf', 2.7);
  keyLight.position.copy(KEY_OFFSET);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 34;
  keyLight.shadow.camera.left = -13;
  keyLight.shadow.camera.right = 13;
  keyLight.shadow.camera.top = 13;
  keyLight.shadow.camera.bottom = -13;

  keyTarget = new THREE.Object3D();
  scene.add(keyTarget);
  keyLight.target = keyTarget;
  scene.add(keyLight);
}

/**
 * Light handles for effects that temporarily change the mood — currently the
 * plant-mode overlay, which eases the world down so its ground rings read
 * clearly. Callers must restore what they change; nothing here owns a
 * "previous" value on their behalf.
 */
export function getKeyLight() {
  return keyLight;
}

export function getAmbientLight() {
  return ambientLight;
}

/**
 * Blend a whisper of the current sky color into the hemisphere light.
 * Kept subtle on purpose: the craft table should never actually get dark.
 */
export function tintAmbientSky(skyColor: THREE.Color, amount: number) {
  if (!ambientLight) return;
  ambientLight.color.copy(AMBIENT_SKY_BASE).lerp(skyColor, amount);
}

export function updateLighting(followPosition: THREE.Vector3) {
  if (!keyLight || !keyTarget) return;
  keyTarget.position.set(followPosition.x, 0, followPosition.z);
  keyLight.position.set(
    followPosition.x + KEY_OFFSET.x,
    KEY_OFFSET.y,
    followPosition.z + KEY_OFFSET.z,
  );
}
