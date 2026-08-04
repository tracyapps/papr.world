import * as THREE from 'three';
import { scene } from '../render/context';
import { RENDER_ORDER } from '../render/renderOrder';
import { SEED_DEFS, plantStageAt } from '../sim/catalogs/seeds';
import { getGameState } from '../sim/state';
import { sampleTerrainHeight } from '../world/terrain';
import { buildPlantStageVisual } from '../world/plantRuntime';
import { getActionMode, onActionModeChanged } from './actionMode';
import { resolveGardenAction, selectedSeed, type GardenAction } from './gardenActions';
import { getKeyLight, getAmbientLight } from '../render/lighting';

// The plant-mode overlay.
//
// Spacing rules are invisible: a player who is refused has no way to see the
// circle they violated. So while the hoe is out, this draws the rules
// directly on the ground —
//
//   - a translucent preview of what you are about to plant, at the cell you
//     are pointing at, in the stage it will eventually reach
//   - a ring showing the space that plant will claim
//   - rings around every nearby plant showing the space they already claim
//
// Overlapping rings *are* the explanation. The text card is a fallback for
// the numbers, not the primary teaching tool.
//
// The world dims slightly while this is active so the rings read clearly
// against busy paper ground, and lifts back when the hoe is put away.

/** How far around the player to show existing plants' claimed space. */
const RING_VIEW_RADIUS = 7;
/** Light levels are eased rather than snapped, so the mode change is calm. */
const DIM_RATE = 3.2;
const DIM_FACTOR = 0.62;

const VALID_COLOR = new THREE.Color('#6f9b52');
const INVALID_COLOR = new THREE.Color('#b4693f');
const CLAIMED_COLOR = new THREE.Color('#7d6753');

let root: THREE.Group | null = null;
let ghost: THREE.Group | null = null;
let ghostHost: THREE.Group | null = null;
let targetRing: THREE.Mesh | null = null;
let claimedRings: THREE.Group | null = null;
let ghostKey = '';

let dimBlend = 0;
let baseKeyIntensity = -1;
let baseAmbientIntensity = -1;

/** Flat ring lying on the ground, used for every spacing circle. */
function createRing(radius: number, color: THREE.Color, opacity: number): THREE.Mesh {
  const geometry = new THREE.RingGeometry(Math.max(0.02, radius - 0.045), radius, 40);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color,
    depthWrite: false,
    opacity,
    side: THREE.DoubleSide,
    transparent: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  // Flat on the ground, so it goes in the ground band — a positive order
  // would draw the ring over the player standing inside it.
  mesh.renderOrder = RENDER_ORDER.gardenRing;
  return mesh;
}

function setGhostAppearance(group: THREE.Group, color: THREE.Color, opacity: number) {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const material = child.material as THREE.Material;
    // Clone once per ghost mesh: these share cached world materials, and
    // tinting in place would recolour every real plant in the world.
    if (!child.userData.ghostMaterial) {
      const ghostMaterial = (material as THREE.MeshStandardMaterial).clone();
      ghostMaterial.transparent = true;
      ghostMaterial.depthWrite = false;
      child.material = ghostMaterial;
      child.userData.ghostMaterial = true;
      child.castShadow = false;
      child.receiveShadow = false;
      // The ghost plant stands up in the world, so it keeps world order and
      // sorts by depth against real objects.
      child.renderOrder = RENDER_ORDER.world;
    }
    const ghostMaterial = child.material as THREE.MeshStandardMaterial;
    ghostMaterial.opacity = opacity;
    ghostMaterial.color.lerp(color, 0.45);
  });
}

export function initializeGardenOverlay() {
  root = new THREE.Group();
  root.name = 'garden-overlay';
  root.visible = false;
  ghostHost = new THREE.Group();
  claimedRings = new THREE.Group();
  targetRing = createRing(0.5, VALID_COLOR, 0.75);
  root.add(ghostHost, claimedRings, targetRing);
  scene.add(root);

  onActionModeChanged((mode) => {
    if (mode !== 'plant') hideGardenOverlay();
  });
}

export function hideGardenOverlay() {
  if (root) root.visible = false;
}

/** Rebuild the ghost only when the plant it represents actually changes. */
function syncGhost(seedId: string | null, mending: boolean) {
  if (!ghostHost) return;
  const key = seedId ? `${seedId}:${mending}` : '';
  if (key === ghostKey) return;
  ghostKey = key;

  ghostHost.clear();
  ghost = null;
  if (!seedId) return;

  // Preview the plant at full bloom, not as a seed: the player is choosing
  // where a grown plant will sit, and a preview of a bare mound of soil tells
  // them nothing about the space it will fill.
  ghost = buildPlantStageVisual('bloom', 1, mending);
  ghostHost.add(ghost);
}

/** Refresh the rings showing space already claimed by nearby plants. */
function syncClaimedRings(avatarPosition: THREE.Vector3) {
  if (!claimedRings) return;
  claimedRings.clear();

  const pages = getGameState().world.pages;
  for (const page of Object.values(pages)) {
    for (const edit of Object.values(page.terrainEdits)) {
      if (edit.state === 'dug' || !edit.plantedSeedId) continue;
      const distance = Math.hypot(edit.x - avatarPosition.x, edit.z - avatarPosition.z);
      if (distance > RING_VIEW_RADIUS) continue;

      const ring = createRing(SEED_DEFS[edit.plantedSeedId].spacing, CLAIMED_COLOR, 0.4);
      ring.position.set(edit.x, sampleTerrainHeight(edit.x, edit.z) + 0.03, edit.z);
      claimedRings.add(ring);
    }
  }
}

/**
 * Ease the world's lighting down while the hoe is out.
 *
 * Dimming the *scene* rather than laying a dark DOM panel over everything
 * keeps the overlay itself bright: a full-screen scrim would dim the very
 * rings and ghost it is meant to highlight.
 */
function updateDimming(delta: number, active: boolean) {
  const key = getKeyLight();
  const ambient = getAmbientLight();
  if (!key || !ambient) return;

  if (baseKeyIntensity < 0) {
    baseKeyIntensity = key.intensity;
    baseAmbientIntensity = ambient.intensity;
  }

  const target = active ? 1 : 0;
  dimBlend += (target - dimBlend) * Math.min(1, delta * DIM_RATE);
  if (Math.abs(dimBlend - target) < 0.002) dimBlend = target;

  const scale = 1 - (1 - DIM_FACTOR) * dimBlend;
  key.intensity = baseKeyIntensity * scale;
  ambient.intensity = baseAmbientIntensity * scale;
}

export function updateGardenOverlay(
  delta: number,
  elapsed: number,
  avatarPosition: THREE.Vector3,
  hover: { x: number; z: number } | null,
  action: GardenAction | null,
) {
  const active = getActionMode() === 'plant';
  updateDimming(delta, active);

  if (!root || !targetRing) return;
  if (!active) {
    root.visible = false;
    return;
  }
  root.visible = true;

  syncClaimedRings(avatarPosition);

  const seedId = selectedSeed();
  const mending = seedId ? SEED_DEFS[seedId].effect === 'mending' : false;
  const showGhost = Boolean(hover && action && action.kind === 'plant' && seedId);
  syncGhost(showGhost ? seedId : null, mending);

  if (!hover || !action || action.kind === 'none') {
    targetRing.visible = false;
    if (ghostHost) ghostHost.visible = false;
    return;
  }

  const groundY = sampleTerrainHeight(hover.x, hover.z);
  const color = action.ok ? VALID_COLOR : INVALID_COLOR;

  // The target ring shows the space *this* action needs: the plant's spacing
  // when sowing, the cell itself when lifting or filling.
  const radius = action.kind === 'plant' && seedId ? SEED_DEFS[seedId].spacing : 0.4;
  targetRing.visible = true;
  targetRing.position.set(hover.x, groundY + 0.035, hover.z);
  targetRing.scale.setScalar(radius / 0.5);
  const ringMaterial = targetRing.material as THREE.MeshBasicMaterial;
  ringMaterial.color.copy(color);
  // A slow pulse keeps the active target distinct from the static claimed
  // rings without needing a second colour.
  ringMaterial.opacity = 0.6 + Math.sin(elapsed * 3.4) * 0.16;

  if (ghostHost && ghost) {
    ghostHost.visible = showGhost;
    ghostHost.position.set(hover.x, groundY + 0.018, hover.z);
    setGhostAppearance(ghost, color, action.ok ? 0.55 : 0.32);
  } else if (ghostHost) {
    ghostHost.visible = false;
  }
}

/** Stage label for a plant already in the ground, for UI copy. */
export function existingPlantStage(edit: { plantedSeedId?: string; plantedAt?: number; changedAt: number }) {
  if (!edit.plantedSeedId) return null;
  return plantStageAt(
    edit.plantedSeedId as keyof typeof SEED_DEFS,
    edit.plantedAt ?? edit.changedAt,
    Date.now(),
  );
}
