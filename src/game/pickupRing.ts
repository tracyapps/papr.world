// A faint ring on the ground showing the walk-pickup radius — how close you
// need to be to a ground resource before walking over it collects it
// automatically (WALK_PICKUP_RADIUS, in harvesting.ts). Added 2026-09-22:
// in first-person the camera sits at eye height and you can't see your own
// feet, so that radius was previously only guessable by feel.
//
// Reuses the same flat-ring building block as the build/garden overlays
// (`createGroundRing`) rather than inventing a second way to draw a circle
// on the ground.
import * as THREE from 'three';
import { scene } from '../render/context';
import { RENDER_ORDER } from '../render/renderOrder';
import { avatar } from './avatar';
import { WALK_PICKUP_RADIUS } from './harvesting';
import { groundHeightAt } from '../world/activeScene';
import { createGroundRing } from './gardenOverlay';
import { getViewCloseness } from './camera';
import { getSetting, onSettingsChanged } from './settings';

const RING_COLOR = new THREE.Color('#f4e3b8');
/** Opaque enough to read against any biome's ground without competing with
 *  a resource's own glow — this supports that feedback, doesn't replace it. */
const MAX_OPACITY = 0.4;
/**
 * Where the 'auto' fade starts and finishes, in `getViewCloseness()` units
 * (0 = pulled all the way back, 1 = fully first-person). Starting before 1
 * means the ring is already legible by the time the view actually feels
 * first-person, rather than popping in at the very last instant of the zoom.
 */
const AUTO_FADE_START = 0.25;
const AUTO_FADE_END = 0.55;

let ring: THREE.Mesh | null = null;

export function initializePickupRing() {
  if (ring) return;
  ring = createGroundRing(WALK_PICKUP_RADIUS, RING_COLOR, 0);
  ring.visible = false;
  ring.renderOrder = RENDER_ORDER.gardenRing;
  scene.add(ring);
  // Switching the setting to 'off' mid-session hides it immediately, rather
  // than waiting for updatePickupRing()'s next call to notice (it will, next
  // frame, regardless — this just avoids a one-frame lag being the only path).
  onSettingsChanged(() => {
    if (ring && getSetting('pickupRingVisibility') === 'off') ring.visible = false;
  });
}

export function updatePickupRing() {
  if (!ring) return;
  const mode = getSetting('pickupRingVisibility');
  if (mode === 'off') {
    ring.visible = false;
    return;
  }

  const opacity = mode === 'always'
    ? MAX_OPACITY
    : MAX_OPACITY * THREE.MathUtils.smoothstep(getViewCloseness(), AUTO_FADE_START, AUTO_FADE_END);

  ring.visible = opacity > 0.002;
  if (!ring.visible) return;

  (ring.material as THREE.MeshBasicMaterial).opacity = opacity;
  ring.position.set(
    avatar.position.x,
    groundHeightAt(avatar.position.x, avatar.position.z) + 0.03,
    avatar.position.z,
  );
}
