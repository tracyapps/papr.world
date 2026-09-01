import * as THREE from 'three';
import { createRng, hashCoords } from '../core/math';
import { registerMapFeature, updateMapFeaturePosition } from '../world/mapFeatures';
import { sampleTerrainHeight } from '../world/terrain';
import { PAGE_SIZE, type Biome, type PageData } from '../world/types';
import { updateCritter, type Critter } from './critterBehavior';
import { buildCritterRig } from './critterRigs';
import { pickIdleAction } from './critterIdle';
import { generateCritterParams, SPECIES_MAP_COLORS, type CritterSpecies } from './critterVariation';
import { getBoldnessBoost } from './friendship';
import { isInWater } from '../world/water';
import { isSolidAt } from '../world/footprints';
import { nudgeToFreeSpot } from '../core/placement';

// Critter system: deterministic spawning per page, seeded individual
// variation, and a single update loop that only animates critters on
// active (visible) pages near the player.

/** Critters beyond this distance from the avatar don't animate at all. */
const ACTIVE_RADIUS = 55;
const BASE_CURIOUS_RANGE = 3.5;

const critters: Critter[] = [];

type WeightedSpecies = Array<[CritterSpecies, number]>;

/** Who lives where. Scrapflats are raccoon country (trash pandas love
 * scrap piles); cats turn up everywhere, as is their custom. */
const BIOME_SPECIES: Record<Biome, WeightedSpecies> = {
  clearing: [['squirrel', 0.25], ['butterfly', 0.2], ['bunny', 0.18], ['bird', 0.15], ['cat', 0.12], ['raccoon', 0.1]],
  forest: [['squirrel', 0.3], ['bunny', 0.22], ['bird', 0.18], ['butterfly', 0.1], ['raccoon', 0.1], ['cat', 0.1]],
  meadow: [['butterfly', 0.28], ['bunny', 0.27], ['bird', 0.2], ['cat', 0.1], ['raccoon', 0.1], ['squirrel', 0.05]],
  // Meerkats are dune country's signature species — same flagship density raccoons get in scrapflats.
  dunes: [['meerkat', 0.3], ['bird', 0.25], ['bunny', 0.15], ['raccoon', 0.15], ['butterfly', 0.1], ['cat', 0.05]],
  scrapflats: [['raccoon', 0.45], ['cat', 0.15], ['bird', 0.15], ['bunny', 0.13], ['squirrel', 0.12]],
};

const BIOME_COUNTS: Record<Biome, [number, number]> = {
  clearing: [2, 3],
  forest: [3, 4],
  meadow: [3, 4],
  dunes: [1, 2],
  scrapflats: [2, 3],
};

function pickSpecies(table: WeightedSpecies, roll: number): CritterSpecies {
  let cumulative = 0;
  for (const [species, weight] of table) {
    cumulative += weight;
    if (roll <= cumulative) return species;
  }
  return table[table.length - 1][0];
}

function spawnCritter(
  parent: THREE.Group,
  id: string,
  species: CritterSpecies,
  seed: number,
  x: number,
  z: number,
  nameOverride?: string,
): Critter {
  const params = generateCritterParams(species, seed);
  if (nameOverride) params.name = nameOverride;

  // Friendship makes critters bolder and more attentive from farther away.
  const boldness = getBoldnessBoost(id);
  params.shyness *= 1 - boldness * 0.7;

  const rig = buildCritterRig(species, params);

  // Land critters seeded onto water or inside a wall get walked out to the
  // nearest free ground. Spawn points come from seeded page coordinates that
  // know nothing about ponds or the Thing Maker; nudging afterwards keeps the
  // seed — and therefore multiplayer agreement — intact while still landing
  // somewhere sensible. Flyers are exempt: hovering over a pond is exactly
  // where a butterfly belongs, and nothing blocks a butterfly.
  const spawn = rig.flying
    ? { x, z }
    : nudgeToFreeSpot(x, z, (px, pz) => isInWater(px, pz) || isSolidAt(px, pz, 0.16));
  rig.group.position.set(
    spawn.x,
    sampleTerrainHeight(spawn.x, spawn.z) + rig.groundOffset * params.scale,
    spawn.z,
  );
  const rng = createRng(seed ^ 0x5f3759df);
  rig.group.rotation.y = rng() * Math.PI * 2;
  parent.add(rig.group);

  const critter: Critter = {
    id,
    species,
    params,
    rig,
    home: new THREE.Vector3(spawn.x, 0, spawn.z),
    rng,
    state: 'idle',
    stateTime: 0,
    stateDuration: 1 + rng() * 2,
    target: new THREE.Vector3(spawn.x, 0, spawn.z),
    heading: rig.group.rotation.y,
    walkPhase: rng() * Math.PI * 2,
    curiousRange: BASE_CURIOUS_RANGE + boldness * 2,
    mapFeatureId: `critter:${id}`,
    // Seeded from the same rng as everything else, so two critters spawned
    // side by side don't start the same action on the same frame.
    idleAction: pickIdleAction(species, rng, { playerNearby: false, friendship: boldness }),
    idleDuration: 1 + rng() * 2,
    noticed: false,
    friendship: boldness,
    friendshipCheckedAt: 0,
    detour: null,
    detourSign: 0,
    detourTime: 0,
    pathBlocked: false,
    pathCooldown: 0,
  };

  registerMapFeature({
    color: SPECIES_MAP_COLORS[species],
    id: critter.mapFeatureId,
    kind: 'critter',
    radiusX: 0.15,
    radiusZ: 0.15,
    shape: 'circle',
    x: spawn.x,
    z: spawn.z,
  });

  critters.push(critter);
  return critter;
}

/**
 * The clearing's authored residents: the original squirrel and butterfly,
 * plus Bandit the raccoon, who lives behind the starter house and is,
 * by design decree, adorable.
 */
export function buildCritters(parent: THREE.Group) {
  spawnCritter(parent, '0,0#squirrel', 'squirrel', hashCoords(0, 0, 901), -5.88, -0.12);
  spawnCritter(parent, '0,0#butterfly', 'butterfly', hashCoords(0, 0, 902), -1.05, -1.55);
  spawnCritter(parent, '0,0#raccoon', 'raccoon', hashCoords(0, 0, 903), 4.7, 2.5, 'Bandit');
  // Every neighborhood needs a cat who acts like it owns the place.
  spawnCritter(parent, '0,0#cat', 'cat', hashCoords(0, 0, 904), 0.9, 4.3);
}

export function buildWoodMillResident(parent: THREE.Group, x: number, z: number) {
  return spawnCritter(parent, '-2,0#woodchuck', 'woodchuck', hashCoords(-2, 0, 1881), x, z, 'Chisel');
}

/** Deterministic critter population for generated/authored pages. */
export function populatePageCritters(page: PageData, group: THREE.Group) {
  const rng = createRng(hashCoords(page.px, page.pz, 44021));
  const [min, max] = BIOME_COUNTS[page.biome];
  const count = min + Math.floor(rng() * (max - min + 1));

  // Standing orders: the world can always use another raccoon, and the
  // cat distribution system must remain operational.
  const bonusRoll = rng();
  const bonus: CritterSpecies | null = bonusRoll < 0.15 ? 'raccoon' : bonusRoll < 0.27 ? 'cat' : null;

  const half = PAGE_SIZE / 2 - 3;
  const cx = page.px * PAGE_SIZE;
  const cz = page.pz * PAGE_SIZE;

  for (let index = 0; index < count + (bonus ? 1 : 0); index += 1) {
    const species = index === count && bonus
      ? bonus
      : pickSpecies(BIOME_SPECIES[page.biome], rng());
    const x = cx + (rng() * 2 - 1) * half;
    const z = cz + (rng() * 2 - 1) * half;
    spawnCritter(
      group,
      `${page.id}#${index}`,
      species,
      hashCoords(page.px, page.pz, 500 + index),
      x,
      z,
    );
  }
}

export function updateCritters(delta: number, elapsed: number, avatarPosition: THREE.Vector3) {
  for (const critter of critters) {
    // Skip critters on hidden (streamed-out) pages...
    if (critter.rig.group.parent?.visible === false) continue;
    // ...and critters too far away to matter this frame.
    const dx = critter.rig.group.position.x - avatarPosition.x;
    const dz = critter.rig.group.position.z - avatarPosition.z;
    if (dx * dx + dz * dz > ACTIVE_RADIUS * ACTIVE_RADIUS) continue;

    updateCritter(critter, delta, elapsed, avatarPosition);
    updateMapFeaturePosition(critter.mapFeatureId, critter.rig.group.position.x, critter.rig.group.position.z);
  }
}

const raycaster = new THREE.Raycaster();
const pickNdc = new THREE.Vector2();
const projected = new THREE.Vector3();

/** Forgiving pick radius in CSS pixels — critters are small and wandering. */
const PICK_SLOP_PX = 48;

/**
 * The critter under (or near) a screen point. Tries an exact raycast
 * first, then falls back to the nearest critter within a small
 * screen-space radius — kinder to trackpads and moving targets.
 */
export function pickCritterAtScreen(clientX: number, clientY: number, camera: THREE.Camera): Critter | null {
  pickNdc.set(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(pickNdc, camera);

  const visibleCritters = critters.filter((critter) => critter.rig.group.parent?.visible !== false);
  const hits = raycaster.intersectObjects(visibleCritters.map((critter) => critter.rig.group), true);

  if (hits.length > 0) {
    let node: THREE.Object3D | null = hits[0].object;
    while (node) {
      const owner = visibleCritters.find((critter) => critter.rig.group === node);
      if (owner) return owner;
      node = node.parent;
    }
  }

  // Near-miss fallback: nearest critter within PICK_SLOP_PX on screen.
  let nearest: Critter | null = null;
  let nearestPixels = PICK_SLOP_PX;
  for (const critter of visibleCritters) {
    projected.copy(critter.rig.group.position);
    projected.y += 0.3; // aim at the body, not the feet
    projected.project(camera);
    if (projected.z > 1) continue; // behind the camera
    const screenX = ((projected.x + 1) / 2) * window.innerWidth;
    const screenY = ((1 - projected.y) / 2) * window.innerHeight;
    const pixels = Math.hypot(screenX - clientX, screenY - clientY);
    if (pixels < nearestPixels) {
      nearest = critter;
      nearestPixels = pixels;
    }
  }
  return nearest;
}

/** For future interaction UI: the nearest critter within reach. */
export function getNearestCritter(position: THREE.Vector3, maxDistance = 2): Critter | null {
  let nearest: Critter | null = null;
  let nearestDistance = maxDistance;
  for (const critter of critters) {
    if (critter.rig.group.parent?.visible === false) continue;
    const distance = critter.rig.group.position.distanceTo(position);
    if (distance < nearestDistance) {
      nearest = critter;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function getCritterNearGroundPoint(x: number, z: number, radius = 0.75): Critter | null {
  for (const critter of critters) {
    if (critter.rig.group.parent?.visible === false) continue;
    const dx = critter.rig.group.position.x - x;
    const dz = critter.rig.group.position.z - z;
    if (dx * dx + dz * dz < radius * radius) return critter;
  }
  return null;
}
