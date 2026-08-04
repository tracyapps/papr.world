import * as THREE from 'three';
import { scene } from '../render/context';
import { RENDER_ORDER } from '../render/renderOrder';
import { sampleTerrainHeight } from '../world/terrain';
import { submersionAt, waterDepthAt } from '../world/water';

// Wading: what happens when you walk into water.
//
// Three cues, because any one alone reads as a bug rather than a feature:
//   - the avatar sinks and slows, so the water has weight
//   - ripple rings spread from the feet, so the surface reacts
//   - rings only appear while actually moving, so standing still is calm
//
// Ripples are flat expanding rings rather than a shader on the surface. A
// shader would ripple the *whole* pond uniformly; rings originate where the
// player's feet are, which is the thing that makes it read as being caused by
// you.

/** Movement multiplier at full depth. Wading is slower, not sticky. */
const WADE_SPEED_FLOOR = 0.55;
/** Seconds between ripple rings while wading at speed. */
const RIPPLE_INTERVAL = 0.28;
const RIPPLE_LIFETIME = 1.5;
const MAX_RIPPLES = 24;

type Ripple = {
  mesh: THREE.Mesh;
  age: number;
};

let ripples: Ripple[] = [];
let rippleGeometry: THREE.RingGeometry | null = null;
let rippleMaterial: THREE.MeshBasicMaterial | null = null;
let root: THREE.Group | null = null;
let sinceLastRipple = 0;

function getRippleGeometry(): THREE.RingGeometry {
  if (!rippleGeometry) {
    rippleGeometry = new THREE.RingGeometry(0.72, 1, 24);
    rippleGeometry.rotateX(-Math.PI / 2);
  }
  return rippleGeometry;
}

function getRippleMaterial(): THREE.MeshBasicMaterial {
  if (!rippleMaterial) {
    rippleMaterial = new THREE.MeshBasicMaterial({
      color: '#f4f9fb',
      depthWrite: false,
      opacity: 0.5,
      side: THREE.DoubleSide,
      transparent: true,
    });
  }
  return rippleMaterial;
}

export function initializeWading() {
  root = new THREE.Group();
  root.name = 'wading-ripples';
  scene.add(root);
}

/**
 * Speed multiplier for the avatar at a position.
 *
 * Applied to movement rather than to the input, so a gamepad stick still
 * reads as fully pressed while the character moves slowly through water.
 */
export function wadeSpeedMultiplier(x: number, z: number): number {
  return 1 - (1 - WADE_SPEED_FLOOR) * submersionAt(x, z);
}

/** How far the avatar's feet sit below the ground line here. */
export function wadeSinkAt(x: number, z: number): number {
  return waterDepthAt(x, z);
}

function spawnRipple(x: number, z: number) {
  if (!root) return;
  // Reuse the oldest ring rather than growing without bound: a player can
  // walk laps around a pond for a long time.
  if (ripples.length >= MAX_RIPPLES) {
    const oldest = ripples.shift();
    if (oldest) root.remove(oldest.mesh);
  }
  const mesh = new THREE.Mesh(getRippleGeometry(), getRippleMaterial().clone());
  mesh.position.set(x, sampleTerrainHeight(x, z) + 0.03, z);
  mesh.scale.setScalar(0.12);
  mesh.renderOrder = RENDER_ORDER.ripple;
  root.add(mesh);
  ripples.push({ mesh, age: 0 });
}

export function updateWading(delta: number, position: THREE.Vector3, speed: number) {
  const submersion = submersionAt(position.x, position.z);
  const moving = speed > 0.35;

  if (submersion > 0.05 && moving) {
    sinceLastRipple += delta;
    // Faster movement makes rings more often, so hurrying looks like
    // hurrying rather than the same lazy pulse.
    const interval = RIPPLE_INTERVAL / (0.6 + speed * 0.5);
    if (sinceLastRipple >= interval) {
      sinceLastRipple = 0;
      spawnRipple(position.x, position.z);
    }
  } else {
    sinceLastRipple = RIPPLE_INTERVAL;
  }

  if (ripples.length === 0) return;

  const surviving: Ripple[] = [];
  for (const ripple of ripples) {
    ripple.age += delta;
    const life = ripple.age / RIPPLE_LIFETIME;
    if (life >= 1) {
      root?.remove(ripple.mesh);
      ripple.mesh.material instanceof THREE.Material && ripple.mesh.material.dispose();
      continue;
    }
    // Expand quickly then ease, the way a real ring loses energy.
    const spread = 0.12 + Math.sqrt(life) * 0.85;
    ripple.mesh.scale.setScalar(spread);
    const material = ripple.mesh.material as THREE.MeshBasicMaterial;
    material.opacity = 0.5 * (1 - life) * (1 - life);
    surviving.push(ripple);
  }
  ripples = surviving;
}

/** Test seam. */
export function resetWadingForTests() {
  ripples = [];
  sinceLastRipple = 0;
}
