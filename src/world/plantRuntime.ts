import * as THREE from 'three';
import type { TerrainEditCellState } from '../sim/state';
import { getMaterial } from '../render/materials';
import { plantStageAt, plantStageProgress, type PlantStage } from '../sim/catalogs/seeds';
import { sampleTerrainHeight } from './terrain';

// Plant visuals by growth stage.
//
// Stage is derived from elapsed time (see catalogs/seeds.ts), never stored, so
// a plant looks correct the instant its page streams back in — including
// after the game has been closed for an hour — without anything having ticked
// while it was away.
//
// Each stage is a distinct silhouette rather than the same flower scaled up,
// because "has it grown?" should be answerable at a glance from across the
// clearing, not by comparing sizes.

/** A just-sown bed: turned soil with a seed barely covered. */
function buildSeededVisual(group: THREE.Group, progress: number) {
  const mound = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), getMaterial('paper.brown.warm'));
  mound.scale.set(1.5, 0.45 + progress * 0.15, 1.5);
  mound.position.y = 0.012;
  group.add(mound);
}

/** First shoot: two small leaves on a short stem. */
function buildSproutVisual(group: THREE.Group, progress: number) {
  const green = getMaterial('paper.green');
  const height = 0.09 + progress * 0.08;

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.017, height, 6), green);
  stem.position.y = height / 2;
  group.add(stem);

  for (const side of [-1, 1] as const) {
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.045 + progress * 0.025, 8), green);
    leaf.position.set(side * 0.04, height * 0.85, 0);
    leaf.rotation.set(-Math.PI / 2.4, 0, side * 0.7);
    group.add(leaf);
  }
}

/** Grown but closed: a real stem, leaves, and a bud that has not opened. */
function buildBudVisual(group: THREE.Group, progress: number) {
  const green = getMaterial('paper.green');
  const height = 0.24 + progress * 0.14;

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, height, 7), green);
  stem.position.y = height / 2;
  group.add(stem);

  for (const [index, side] of [-1, 1].entries()) {
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.07, 9), green);
    leaf.position.set(side * 0.06, height * (0.4 + index * 0.18), 0);
    leaf.rotation.set(-Math.PI / 2.6, 0, side * 0.85);
    group.add(leaf);
  }

  // The bud swells and starts to show colour as it approaches blooming.
  const bud = new THREE.Mesh(
    new THREE.SphereGeometry(0.045 + progress * 0.022, 10, 8),
    progress > 0.55 ? getMaterial('paper.rainbow') : green,
  );
  bud.scale.set(0.85, 1.25, 0.85);
  bud.position.y = height + 0.03;
  group.add(bud);
}

/** Full bloom: the Buttonbloom proper. */
function buildBloomVisual(group: THREE.Group) {
  const green = getMaterial('paper.green');
  const petals = getMaterial('paper.rainbow');

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.42, 7), green);
  stem.position.y = 0.21;
  group.add(stem);

  for (const [index, side] of [-1, 1].entries()) {
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.075, 9), green);
    leaf.position.set(side * 0.07, 0.16 + index * 0.08, 0);
    leaf.rotation.set(-Math.PI / 2.6, 0, side * 0.9);
    group.add(leaf);
  }

  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.CircleGeometry(0.1, 10), petals);
    petal.position.set(Math.cos(angle) * 0.1, 0.44, Math.sin(angle) * 0.1);
    petal.rotation.x = -Math.PI / 2;
    group.add(petal);
  }

  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.025, 16), getMaterial('paper.brown.warm'));
  button.position.y = 0.455;
  group.add(button);
}

/** Mending groundcover: a tuft that thickens as it stitches the ground. */
function buildMendingVisual(group: THREE.Group, progress: number) {
  const green = getMaterial('paper.green');
  const blades = 5 + Math.round(progress * 4);
  for (let index = 0; index < blades; index += 1) {
    const angle = (index / blades) * Math.PI * 2;
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.1 + progress * 0.12 + (index % 3) * 0.035, 0.018),
      green,
    );
    blade.position.set(Math.cos(angle) * 0.28, 0.08 + progress * 0.05, Math.sin(angle) * 0.28);
    blade.rotation.set((index % 2 ? 1 : -1) * 0.18, -angle, (index % 2 ? 1 : -1) * 0.28);
    group.add(blade);
  }
}

/** Build just the plant body for a stage. Also used by the ghost preview. */
export function buildPlantStageVisual(stage: PlantStage, progress: number, mending: boolean): THREE.Group {
  const group = new THREE.Group();
  if (mending) {
    buildMendingVisual(group, progress);
    return group;
  }
  if (stage === 'seeded') buildSeededVisual(group, progress);
  else if (stage === 'sprout') buildSproutVisual(group, progress);
  else if (stage === 'bud') buildBudVisual(group, progress);
  else buildBloomVisual(group);
  return group;
}

export function buildTerrainPlantVisual(edit: TerrainEditCellState): THREE.Group | null {
  if (!edit.plantedSeedId || edit.state === 'dug') return null;

  const plantedAt = edit.plantedAt ?? edit.changedAt;
  const now = Date.now();
  const stage = plantStageAt(edit.plantedSeedId, plantedAt, now);
  const progress = plantStageProgress(edit.plantedSeedId, plantedAt, now);

  const group = new THREE.Group();
  group.position.set(edit.x, sampleTerrainHeight(edit.x, edit.z) + 0.018, edit.z);
  group.add(buildPlantStageVisual(stage, progress, edit.state === 'mending'));
  // Recorded so the runtime can tell when a plant has outgrown its mesh and
  // needs rebuilding, without diffing the whole scene.
  group.userData.plantStage = stage;

  if (edit.state === 'mending') return group;

  // The seed packet stays attached to the plant runtime so it streams and
  // hides with its page. Plant interactions toggle it from persistent state.
  const seedPickup = new THREE.Group();
  seedPickup.name = 'plant-seed-pickup';
  const dropAngle = ((edit.geologySeed >>> 0) % 360) * (Math.PI / 180);
  seedPickup.position.set(Math.cos(dropAngle) * 0.42, 0.045, Math.sin(dropAngle) * 0.42);
  seedPickup.rotation.y = -dropAngle + 0.35;
  const packet = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.18), getMaterial('paper.rainbow'));
  packet.rotation.y = 0.28;
  const seedA = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), getMaterial('paper.brown.warm'));
  seedA.position.set(-0.075, 0.045, 0.01);
  const seedB = seedA.clone();
  seedB.position.set(0.075, 0.045, -0.015);
  seedPickup.add(packet, seedA, seedB);
  seedPickup.visible = Boolean(edit.seedDropReady);
  group.add(seedPickup);
  group.userData.seedPickup = seedPickup;
  return group;
}
