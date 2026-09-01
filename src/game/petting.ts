import * as THREE from 'three';
import { camera, scene } from '../render/context';
import { RENDER_ORDER } from '../render/renderOrder';
import { avatar } from './avatar';
import { triggerFlourish } from './critterBehavior';
import { pickCritterAtScreen } from './critters';
import type { Critter } from './critterBehavior';
import { addFriendshipPoints } from './friendship';
import { getToastStack } from '../ui/hudLayout';

// The first interaction verb: left-click a critter to pet it.
// Response: it turns to you and does its flourish (the cat slow-blinks,
// the raccoon rubs its hands), paper hearts float up, and a little toast
// tells you its name. Friendship points accrue with a per-critter
// cooldown so affection is a visit, not a grind.

/** How close the avatar must be to reach a critter. */
const PET_REACH = 2.6;
/** Seconds between friendship-point grants per critter (hearts always show). */
const POINTS_COOLDOWN = 6;
const POINTS_PER_PET = 4;

const HEART_LIFETIME = 1.35;

const PET_VERBS: Record<string, string> = {
  squirrel: 'chitters happily',
  butterfly: 'flutters happily',
  raccoon: 'chirps and rubs its little hands',
  bunny: 'wiggles its nose',
  bird: 'cheeps',
  cat: 'slow-blinks at you',
  woodchuck: 'chatters its teeth and beams',
  meerkat: 'stands up tall on its toes to get a better look at you',
};

// --- Paper hearts -----------------------------------------------------

type Heart = {
  mesh: THREE.Mesh;
  age: number;
  driftX: number;
  driftZ: number;
};

let heartGeometry: THREE.ShapeGeometry | null = null;
const activeHearts: Heart[] = [];

function getHeartGeometry(): THREE.ShapeGeometry {
  if (heartGeometry) return heartGeometry;
  // Classic bezier heart (drawn point-up after the flip below).
  const shape = new THREE.Shape();
  shape.moveTo(0.25, 0.25);
  shape.bezierCurveTo(0.25, 0.25, 0.2, 0, 0, 0);
  shape.bezierCurveTo(-0.3, 0, -0.3, 0.35, -0.3, 0.35);
  shape.bezierCurveTo(-0.3, 0.55, -0.1, 0.77, 0.25, 0.95);
  shape.bezierCurveTo(0.6, 0.77, 0.8, 0.55, 0.8, 0.35);
  shape.bezierCurveTo(0.8, 0.35, 0.8, 0, 0.5, 0);
  shape.bezierCurveTo(0.35, 0, 0.25, 0.25, 0.25, 0.25);
  heartGeometry = new THREE.ShapeGeometry(shape);
  heartGeometry.center();
  return heartGeometry;
}

function spawnHearts(at: THREE.Vector3, count: number) {
  for (let index = 0; index < count; index += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: index % 2 === 0 ? '#e2607a' : '#ef8ba1',
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(getHeartGeometry(), material);
    const size = 0.14 + Math.random() * 0.08;
    mesh.scale.set(size, size, size);
    mesh.rotation.z = Math.PI; // point the heart up
    mesh.renderOrder = RENDER_ORDER.hearts;
    mesh.position.set(
      at.x + (Math.random() - 0.5) * 0.3,
      at.y + 0.45 + Math.random() * 0.2,
      at.z + (Math.random() - 0.5) * 0.3,
    );
    scene.add(mesh);
    activeHearts.push({
      mesh,
      age: -index * 0.12, // stagger the pops
      driftX: (Math.random() - 0.5) * 0.25,
      driftZ: (Math.random() - 0.5) * 0.25,
    });
  }
}

// --- Toast ------------------------------------------------------------

let toastElement: HTMLParagraphElement | null = null;
let toastTimer: number | undefined;

export function showPetToast(message: string) {
  if (!toastElement) return;
  toastElement.textContent = message;
  toastElement.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastElement?.classList.remove('is-visible');
  }, 2600);
}

// --- Petting ----------------------------------------------------------

const lastPointsAt = new Map<string, number>();

export function petCritter(critter: Critter) {
  const position = critter.rig.group.position;
  triggerFlourish(critter, avatar.position);
  spawnHearts(position.clone(), 3);

  const now = performance.now() / 1000;
  const last = lastPointsAt.get(critter.id) ?? -Infinity;
  if (now - last >= POINTS_COOLDOWN) {
    addFriendshipPoints(critter.id, POINTS_PER_PET);
    lastPointsAt.set(critter.id, now);
  }

  const verb = PET_VERBS[critter.species] ?? 'is pleased';
  showPetToast(`♥ ${critter.params.name} ${verb}`);
}

export function initializePetting() {
  // Previously fixed at top:64 centred — the same band as the compass
  // (y:76) and the region banner (y:78), so three unrelated overlays
  // competed for one strip of screen. Now a flow child of the shared
  // bottom-centre toast stack, which guarantees separation.
  toastElement = document.createElement('p');
  toastElement.className = 'pet-toast';
  toastElement.setAttribute('aria-live', 'polite');
  getToastStack().append(toastElement);
}

/** Left-click handler: pet the critter under the cursor if it's in reach. */
export function tryPetAt(clientX: number, clientY: number) {
  const critter = pickCritterAtScreen(clientX, clientY, camera);
  if (!critter) return;

  const distance = critter.rig.group.position.distanceTo(avatar.position);
  if (distance > PET_REACH) {
    showPetToast(`${critter.params.name} is over there — walk closer to say hi`);
    return;
  }

  petCritter(critter);
}

/** Float and fade active hearts; call every frame. */
export function updatePetEffects(delta: number) {
  for (let index = activeHearts.length - 1; index >= 0; index -= 1) {
    const heart = activeHearts[index];
    heart.age += delta;
    if (heart.age < 0) {
      heart.mesh.visible = false;
      continue;
    }
    heart.mesh.visible = true;

    if (heart.age >= HEART_LIFETIME) {
      scene.remove(heart.mesh);
      (heart.mesh.material as THREE.Material).dispose();
      activeHearts.splice(index, 1);
      continue;
    }

    const progress = heart.age / HEART_LIFETIME;
    heart.mesh.position.y += delta * (0.75 - progress * 0.3);
    heart.mesh.position.x += heart.driftX * delta;
    heart.mesh.position.z += heart.driftZ * delta;
    heart.mesh.lookAt(camera.position);
    heart.mesh.rotation.z = Math.PI + Math.sin(heart.age * 5) * 0.15;
    (heart.mesh.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - progress * progress);
  }
}
