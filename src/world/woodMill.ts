import * as THREE from 'three';
import { registerCozyObject } from '../game/cozyInteractions';
import { buildWoodMillResident } from '../game/critters';
import { createSheet } from '../render/builders';
import { createColorMaterial, getMaterial } from '../render/materials';
import { registerMapFeature } from './mapFeatures';
import { buildWoodMillSignpost } from './signposts';
import { sampleTerrainHeight } from './terrain';

const MILL_X = -94;
const MILL_Z = 0;

function buildPaperCutter(parent: THREE.Group) {
  const cutter = new THREE.Group();
  cutter.position.set(MILL_X - 0.3, sampleTerrainHeight(MILL_X - 0.3, MILL_Z) + 0.08, MILL_Z);

  const table = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.24, 3.4), getMaterial('paper.cork'));
  table.position.y = 1.25;
  table.castShadow = true;

  const legs: THREE.Mesh[] = [];
  for (const x of [-2.05, 2.05]) {
    for (const z of [-1.35, 1.35]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.25, 0.24), getMaterial('paper.brown'));
      leg.position.set(x, 0.62, z);
      leg.castShadow = true;
      legs.push(leg);
    }
  }

  const gridPaper = createSheet(4.45, 3.05, getMaterial('paper.notebook'), [0, 1.39, 0]);
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.52, 12), createColorMaterial('#4d5558', 0.7));
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(-2.0, 1.62, 1.12);

  const armPivot = new THREE.Group();
  armPivot.position.set(-1.92, 1.62, 1.12);
  armPivot.rotation.z = 0.36;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.22, 0.24), getMaterial('paper.salmon'));
  arm.position.x = 1.88;
  arm.castShadow = true;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.72, 0.065), createColorMaterial('#c9d2d2', 0.5));
  blade.position.set(1.62, -0.36, 0);
  blade.castShadow = true;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.8, 10), getMaterial('paper.brown.warm'));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(4.12, 0, 0);
  armPivot.add(arm, blade, handle);

  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.42, 2.7),
    new THREE.MeshStandardMaterial({ color: '#d9f0ec', transparent: true, opacity: 0.38, roughness: 0.35 }),
  );
  guard.position.set(-0.15, 1.68, 0);

  cutter.add(table, ...legs, gridPaper, hinge, armPivot, guard);
  parent.add(cutter);

  registerCozyObject({
    id: 'wood-mill-paper-cutter',
    label: 'Great paper cutter',
    object: cutter,
    reaction: 'bob',
    sound: 'tap',
    messages: [
      'The long blade is locked safely above its cutting grid. Chisel has penciled measurements along every edge.',
      'This cutter can square up broad sheets and trim sturdy timber-paper without chewing the corners.',
      'A note on the guard reads: “Measure twice. Snack once. Cut after both.”',
    ],
  });
}

export function buildWoodMill(parent: THREE.Group) {
  const yard = createSheet(14, 11, getMaterial('paper.brown.warm'), [MILL_X, sampleTerrainHeight(MILL_X, MILL_Z) + 0.035, MILL_Z]);
  yard.rotation.y = -0.06;
  parent.add(yard);

  const awningPosts: THREE.Mesh[] = [];
  for (const x of [MILL_X - 3.3, MILL_X + 3.3]) {
    for (const z of [MILL_Z - 2.5, MILL_Z + 2.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 3.1, 7), getMaterial('paper.brown'));
      post.position.set(x, sampleTerrainHeight(x, z) + 1.55, z);
      post.castShadow = true;
      awningPosts.push(post);
    }
  }
  const roof = createSheet(8.2, 6.7, getMaterial('roof.shingle2'), [MILL_X, sampleTerrainHeight(MILL_X, MILL_Z) + 3.15, MILL_Z]);
  roof.rotation.y = 0.08;
  parent.add(...awningPosts, roof);

  buildPaperCutter(parent);
  buildWoodMillSignpost(parent);
  buildWoodMillResident(parent, MILL_X + 4.2, MILL_Z + 1.7);

  registerMapFeature({
    id: 'wood-mill', kind: 'building', color: '#b86646', radiusX: 4.4, radiusZ: 3.5,
    shape: 'rect', x: MILL_X, z: MILL_Z, rotation: -0.06,
  });
}
