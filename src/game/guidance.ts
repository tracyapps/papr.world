import * as THREE from 'three';
import { scene } from '../render/context';
import { sampleTerrainHeight } from '../world/terrain';
import { getPlace, type Place } from '../world/places';
import { getYaw } from './camera';
import { RENDER_ORDER } from '../render/renderOrder';

// Guidance arrow: one flat paper arrow that sits on the ground a step
// ahead of the avatar — always in front of you, whichever way you face,
// like a compass you're holding. It rotates to point at the selected
// place (even if that's behind you) and hides once you arrive.

/** How far ahead of the avatar (in the camera's facing direction) the arrow sits. */
const ARROW_AHEAD = 2.3;
export const ARRIVE_DISTANCE = 2.2;

let arrow: THREE.Group | null = null;
let targetPlaceId: string | null = null;
const smoothedPosition = new THREE.Vector3();
let hasSmoothedPosition = false;

function createArrowShape(): THREE.Shape {
  // Chunky arrow pointing +y in shape space (becomes forward on the ground).
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.34);
  shape.lineTo(0.24, 0.02);
  shape.lineTo(0.1, 0.02);
  shape.lineTo(0.1, -0.3);
  shape.lineTo(-0.1, -0.3);
  shape.lineTo(-0.1, 0.02);
  shape.lineTo(-0.24, 0.02);
  shape.closePath();
  return shape;
}

function createArrow(): THREE.Group {
  const group = new THREE.Group();
  const shape = createArrowShape();

  // White paper backing so the arrow reads on any ground color.
  const backing = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: '#fff8e6', transparent: true, opacity: 0.85, depthWrite: false }),
  );
  backing.scale.setScalar(1.18);
  backing.rotation.x = -Math.PI / 2;
  backing.position.y = 0;
  // Low render order: above the ground sheet, but never over the avatar
  // or props (the avatar is transparent and doesn't write depth, so a
  // high render order here would paint the arrow on top of the character).
  backing.renderOrder = RENDER_ORDER.guidanceArrow;

  const face = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({ color: '#cf4f38', transparent: true, opacity: 0.9, depthWrite: false }),
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.038;
  face.renderOrder = RENDER_ORDER.guidanceArrow;

  group.add(backing, face);
  // A lone arrow can afford to be a little bigger than the old trail.
  group.scale.setScalar(1.25);
  return group;
}

export function initializeGuidance() {
  arrow = createArrow();
  arrow.visible = false;
  scene.add(arrow);
}

export function setGuidanceTarget(placeId: string | null) {
  targetPlaceId = placeId;
  hasSmoothedPosition = false;
  if (arrow && !placeId) {
    arrow.visible = false;
  }
}

export function getGuidanceTarget(): Place | null {
  return targetPlaceId ? getPlace(targetPlaceId) : null;
}

/** Distance to the current target, or null when no guide is active. */
export function getGuidanceDistance(avatarPosition: THREE.Vector3): number | null {
  const place = getGuidanceTarget();
  if (!place) return null;
  return Math.hypot(place.x - avatarPosition.x, place.z - avatarPosition.z);
}

export function updateGuidance(avatarPosition: THREE.Vector3, elapsed: number) {
  if (!arrow) return;

  const place = getGuidanceTarget();
  if (!place) {
    arrow.visible = false;
    return;
  }

  const dx = place.x - avatarPosition.x;
  const dz = place.z - avatarPosition.z;
  const distance = Math.hypot(dx, dz);

  if (distance < ARRIVE_DISTANCE) {
    arrow.visible = false;
    return;
  }

  arrow.visible = true;

  // Anchor: a fixed step ahead of the avatar in the camera's facing
  // direction, so the arrow stays in front of you no matter where the
  // target is — it only *points* toward the place.
  const yaw = getYaw();
  const anchorX = avatarPosition.x - Math.sin(yaw) * ARROW_AHEAD;
  const anchorZ = avatarPosition.z - Math.cos(yaw) * ARROW_AHEAD;

  if (!hasSmoothedPosition) {
    smoothedPosition.set(anchorX, 0, anchorZ);
    hasSmoothedPosition = true;
  } else {
    // Glide when the camera swings instead of snapping.
    smoothedPosition.x = THREE.MathUtils.lerp(smoothedPosition.x, anchorX, 0.22);
    smoothedPosition.z = THREE.MathUtils.lerp(smoothedPosition.z, anchorZ, 0.22);
  }

  const groundY = sampleTerrainHeight(smoothedPosition.x, smoothedPosition.z);
  arrow.position.set(smoothedPosition.x, groundY + 0.035, smoothedPosition.z);

  // Point at the destination, even when it's behind you.
  arrow.rotation.y = Math.atan2(-dx / distance, -dz / distance);

  // Gentle pulse; no scale bounce, so it stays glued to the ground.
  const pulse = 0.78 + Math.sin(elapsed * 3.2) * 0.14;
  arrow.children.forEach((child) => {
    const mesh = child as THREE.Mesh;
    const material = mesh.material as THREE.MeshBasicMaterial;
    material.opacity = (mesh.position.y > 0 ? 0.92 : 0.8) * pulse;
  });
}
