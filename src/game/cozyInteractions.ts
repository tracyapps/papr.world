import * as THREE from 'three';
import { camera } from '../render/context';
import { avatar } from './avatar';
import { playCozySound, type CozySound } from './cozyAudio';
import { getToastStack } from '../ui/hudLayout';

type Reaction = 'bob' | 'ripple' | 'spin' | 'sway';

type CozyObject = {
  id: string;
  label: string;
  messages: string[];
  object: THREE.Object3D;
  reaction: Reaction;
  sound: CozySound;
  baseRotation: THREE.Euler;
  baseScale: THREE.Vector3;
  activeFor: number;
  messageIndex: number;
  onInteract?: () => void;
};

const INTERACT_REACH = 5.2;
const objects: CozyObject[] = [];
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let toast: HTMLDivElement | null = null;
let toastTimer: number | undefined;

export function registerCozyObject(options: {
  id: string;
  label: string;
  messages: string[];
  object: THREE.Object3D;
  reaction: Reaction;
  sound: CozySound;
  onInteract?: () => void;
}) {
  if (objects.some((entry) => entry.id === options.id)) return;
  objects.push({
    ...options,
    baseRotation: options.object.rotation.clone(),
    baseScale: options.object.scale.clone(),
    activeFor: 0,
    messageIndex: 0,
  });
}

function showReaction(entry: CozyObject) {
  if (!toast) return;
  const message = entry.messages[entry.messageIndex % entry.messages.length];
  entry.messageIndex += 1;
  toast.innerHTML = `<strong>${entry.label}</strong><span>${message}</span>`;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast?.classList.remove('is-visible'), 3200);
}

export function initializeCozyInteractions() {
  toast = document.createElement('div');
  toast.className = 'cozy-world-toast';
  toast.setAttribute('aria-live', 'polite');
  getToastStack().append(toast);
}

function pickCozyObjectAt(clientX: number, clientY: number): CozyObject | null {
  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const visible = objects.filter((entry) => entry.object.parent?.visible !== false);
  const hits = raycaster.intersectObjects(visible.map((entry) => entry.object), true);
  if (hits.length === 0) return null;

  let node: THREE.Object3D | null = hits[0].object;
  while (node) {
    const entry = visible.find((candidate) => candidate.object === node);
    if (entry) return entry;
    node = node.parent;
  }
  return null;
}

/** Used by the cursor affordance without triggering a reaction. */
export function hasCozyInteractionAt(clientX: number, clientY: number): boolean {
  return pickCozyObjectAt(clientX, clientY) !== null;
}

export function tryCozyInteractionAt(clientX: number, clientY: number): boolean {
  const entry = pickCozyObjectAt(clientX, clientY);
  if (!entry) return false;

  const worldPosition = new THREE.Vector3();
  entry.object.getWorldPosition(worldPosition);
  if (worldPosition.distanceTo(avatar.position) > INTERACT_REACH) {
    if (toast) {
      toast.innerHTML = `<strong>${entry.label}</strong><span>Walk a little closer to investigate.</span>`;
      toast.classList.add('is-visible');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => toast?.classList.remove('is-visible'), 2400);
    }
    return true;
  }

  entry.activeFor = 1;
  entry.onInteract?.();
  playCozySound(entry.sound);
  showReaction(entry);
  return true;
}

export function updateCozyInteractions(delta: number, elapsed: number) {
  for (const entry of objects) {
    if (entry.activeFor > 0) entry.activeFor = Math.max(0, entry.activeFor - delta / 1.35);
    const pulse = Math.sin((1 - entry.activeFor) * Math.PI * 6) * entry.activeFor;
    const ambient = Math.sin(elapsed * 1.4 + entry.messageIndex * 0.7) * 0.012;

    entry.object.scale.copy(entry.baseScale);
    entry.object.rotation.copy(entry.baseRotation);
    switch (entry.reaction) {
      case 'bob':
        entry.object.scale.multiplyScalar(1 + Math.abs(pulse) * 0.08 + ambient);
        break;
      case 'ripple':
        entry.object.scale.x *= 1 + Math.abs(pulse) * 0.12;
        entry.object.scale.z *= 1 + Math.abs(pulse) * 0.12;
        break;
      case 'spin':
        entry.object.rotation.y += entry.activeFor * entry.activeFor * Math.PI * 5;
        break;
      case 'sway':
        entry.object.rotation.z += pulse * 0.12 + ambient;
        break;
    }
  }
}
