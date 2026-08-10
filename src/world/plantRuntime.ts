import * as THREE from 'three';
import type { TerrainEditCellState } from '../sim/state';
import { createColorMaterial, getMaterial } from '../render/materials';
import {
  SEED_DEFS,
  plantProduce,
  plantStageAt,
  plantStageProgress,
  type PlantStage,
  type PlantVisualFamily,
  type SeedId,
} from '../sim/catalogs/seeds';
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
function buildBudVisual(group: THREE.Group, progress: number, accent?: string) {
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

  // The bud swells and starts to show its accent colour as it approaches
  // blooming — the first hint of which plant this will become.
  const bud = new THREE.Mesh(
    new THREE.SphereGeometry(0.045 + progress * 0.022, 10, 8),
    progress > 0.55 ? (accent ? createColorMaterial(accent) : getMaterial('paper.rainbow')) : green,
  );
  bud.scale.set(0.85, 1.25, 0.85);
  bud.position.y = height + 0.03;
  group.add(bud);
}

/** Full bloom: the Buttonbloom proper. */
function buildFlowerBloomVisual(group: THREE.Group) {
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

/** Full bloom: the raspberry bush — a lumpy leaf dome hung with berries. */
function buildBushBloomVisual(group: THREE.Group, accent?: string) {
  const green = getMaterial('paper.green');
  const berry = createColorMaterial(accent ?? '#c73e52');

  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), green);
  dome.scale.set(1.15, 0.85, 1.15);
  dome.position.y = 0.18;
  group.add(dome);
  const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), green);
  lobe.position.set(0.14, 0.13, 0.1);
  group.add(lobe);

  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const berryMesh = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), berry);
    berryMesh.position.set(Math.cos(angle) * 0.16, 0.28 + (index % 3) * 0.05, Math.sin(angle) * 0.16);
    group.add(berryMesh);
  }
}

/** Full bloom: a row of feathery tops with the orange roots poking through. */
function buildRowBloomVisual(group: THREE.Group, accent?: string) {
  const green = getMaterial('paper.green');
  const root = createColorMaterial(accent ?? '#e07b3a');
  const count = 3;

  for (let index = 0; index < count; index += 1) {
    const x = (index - (count - 1) / 2) * 0.16;
    for (let frond = 0; frond < 5; frond += 1) {
      const angle = (frond / 5) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.05, 7), green);
      leaf.position.set(x + Math.cos(angle) * 0.045, 0.22 + (frond % 2) * 0.05, Math.sin(angle) * 0.045);
      leaf.rotation.set(-Math.PI / 2, 0, angle * 0.5);
      group.add(leaf);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 7), root);
    tip.position.set(x, 0.04, 0);
    tip.rotation.x = Math.PI / 2;
    group.add(tip);
  }
}

/** Full bloom: a tall ribbon-corn stalk with a golden cob under its leaves. */
function buildStalkBloomVisual(group: THREE.Group, accent?: string) {
  const green = getMaterial('paper.green');
  const cob = createColorMaterial(accent ?? '#e3bd45');

  const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.045, 0.75, 7), green);
  stalk.position.y = 0.375;
  group.add(stalk);

  for (let index = 0; index < 3; index += 1) {
    const side = index % 2 ? 1 : -1;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.014), green);
    leaf.position.set(side * 0.09, 0.24 + index * 0.13, 0);
    leaf.rotation.set(0, side * 0.3, side * 0.5);
    group.add(leaf);
  }

  const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.2, 8), cob);
  ear.position.set(0.06, 0.33, 0);
  ear.rotation.z = 0.12;
  group.add(ear);
}

/** Full bloom: a tight ruffled cabbage head wrapped in broad folded leaves. */
function buildHeadBloomVisual(group: THREE.Group, accent?: string) {
  const leaf = createColorMaterial(accent ?? '#7fa06a');

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 9), leaf);
  head.scale.set(1, 0.82, 1);
  head.position.y = 0.16;
  group.add(head);

  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    const wrap = new THREE.Mesh(new THREE.CircleGeometry(0.11, 8), leaf);
    wrap.position.set(Math.cos(angle) * 0.14, 0.07, Math.sin(angle) * 0.14);
    wrap.rotation.set(-Math.PI / 2, 0, angle);
    group.add(wrap);
  }
}

/** Full bloom: a bushy vine strung with ripe red paper fruit. */
function buildVineBloomVisual(group: THREE.Group, accent?: string) {
  const green = getMaterial('paper.green');
  const fruit = createColorMaterial(accent ?? '#d14a35');

  for (const side of [-1, 1] as const) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 6), green);
    stem.position.set(side * 0.07, 0.25, 0);
    stem.rotation.z = -side * 0.18;
    group.add(stem);
  }
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.06, 8), green);
    leaf.position.set(Math.cos(angle) * 0.13, 0.2, Math.sin(angle) * 0.13);
    leaf.rotation.set(-Math.PI / 2.2, 0, angle);
    group.add(leaf);
  }
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2 + 0.5;
    const tomato = new THREE.Mesh(new THREE.SphereGeometry(0.05, 9, 7), fruit);
    tomato.position.set(Math.cos(angle) * 0.11, 0.12, Math.sin(angle) * 0.11);
    group.add(tomato);
  }
}

function buildFamilyBloomVisual(group: THREE.Group, visual: PlantVisualFamily, accent?: string) {
  switch (visual) {
    case 'bush': buildBushBloomVisual(group, accent); break;
    case 'row': buildRowBloomVisual(group, accent); break;
    case 'stalk': buildStalkBloomVisual(group, accent); break;
    case 'head': buildHeadBloomVisual(group, accent); break;
    case 'vine': buildVineBloomVisual(group, accent); break;
    default: buildFlowerBloomVisual(group); break;
  }
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
export function buildPlantStageVisual(seedId: SeedId, stage: PlantStage, progress: number): THREE.Group {
  const seed = SEED_DEFS[seedId];
  const group = new THREE.Group();
  if (seed.effect === 'mending') {
    buildMendingVisual(group, progress);
    return group;
  }
  if (stage === 'seeded') buildSeededVisual(group, progress);
  else if (stage === 'sprout') buildSproutVisual(group, progress);
  else if (stage === 'bud') buildBudVisual(group, progress, 'accent' in seed ? seed.accent : undefined);
  else buildFamilyBloomVisual(group, seed.visual, 'accent' in seed ? seed.accent : undefined);
  return group;
}

/** The loose packet of folded paper with its two seeds, sitting on the ground. */
function buildSeedPacketPickup(group: THREE.Group) {
  const packet = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.18), getMaterial('paper.rainbow'));
  packet.rotation.y = 0.28;
  const seedA = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), getMaterial('paper.brown.warm'));
  seedA.position.set(-0.075, 0.045, 0.01);
  const seedB = seedA.clone();
  seedB.position.set(0.075, 0.045, -0.015);
  group.add(packet, seedA, seedB);
}

/** A little folded-paper basket spilling its harvest — the food-plant drop. */
function buildProducePickupMesh(group: THREE.Group, accent?: string) {
  const brown = getMaterial('paper.brown.warm');
  const fruit = createColorMaterial(accent ?? '#c73e52');

  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.16), brown);
  basket.position.y = 0.03;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 6, 12), brown);
  handle.rotation.x = Math.PI / 2;
  handle.position.y = 0.085;
  group.add(basket, handle);

  for (let index = 0; index < 4; index += 1) {
    const piece = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), fruit);
    piece.position.set(
      -0.05 + (index % 2) * 0.1,
      0.07 + (index >= 2 ? 0.03 : 0),
      -0.03 + Math.floor(index / 2) * 0.06,
    );
    group.add(piece);
  }
}

export function buildTerrainPlantVisual(edit: TerrainEditCellState): THREE.Group | null {
  if (!edit.plantedSeedId || edit.state === 'dug') return null;

  const plantedAt = edit.plantedAt ?? edit.changedAt;
  const now = Date.now();
  const stage = plantStageAt(edit.plantedSeedId, plantedAt, now);
  const progress = plantStageProgress(edit.plantedSeedId, plantedAt, now);

  const group = new THREE.Group();
  group.position.set(edit.x, sampleTerrainHeight(edit.x, edit.z) + 0.018, edit.z);
  group.add(buildPlantStageVisual(edit.plantedSeedId, stage, progress));
  // Recorded so the runtime can tell when a plant has outgrown its mesh and
  // needs rebuilding, without diffing the whole scene.
  group.userData.plantStage = stage;

  if (edit.state === 'mending') return group;

  // The drop stays attached to the plant runtime so it streams and hides with
  // its page. Plant interactions toggle it from persistent state.
  const pickup = new THREE.Group();
  pickup.name = 'plant-seed-pickup';
  const dropAngle = ((edit.geologySeed >>> 0) % 360) * (Math.PI / 180);
  pickup.position.set(Math.cos(dropAngle) * 0.42, 0.045, Math.sin(dropAngle) * 0.42);
  pickup.rotation.y = -dropAngle + 0.35;
  const produced = plantProduce(edit.plantedSeedId);
  if (produced && produced !== edit.plantedSeedId) {
    const def = SEED_DEFS[edit.plantedSeedId];
    buildProducePickupMesh(pickup, 'accent' in def ? def.accent : undefined);
  } else {
    buildSeedPacketPickup(pickup);
  }
  pickup.visible = Boolean(edit.seedDropReady);
  group.add(pickup);
  group.userData.seedPickup = pickup;
  return group;
}
