import * as THREE from 'three';
import { getCutoutMaterial, groundedCutoutY } from '../render/builders';
import { getMaterial } from '../render/materials';
import { createTerrainPageMesh, sampleTerrainHeight } from './terrain';
import { TREE_DEFS } from './pageRuntime';
import type { PageData, TreeKind } from './types';

type HorizonTreeStyle = 'leafy' | 'pine' | 'redwood';

const HORIZON_TREE_KIND: Record<TreeKind, HorizonTreeStyle> = {
  'pine-medium-1': 'pine',
  'pine-medium-2': 'pine',
  'pine-tall': 'pine',
  'leafy-1': 'leafy',
  'leafy-2': 'leafy',
  'redwood-1': 'redwood',
  'redwood-2': 'redwood',
  'redwood-3': 'redwood',
  'redwood-4': 'redwood',
  'redwood-5': 'redwood',
  'redwood-6': 'redwood',
  'redwood-7': 'redwood',
};

const HORIZON_TREE_ART: Record<HorizonTreeStyle, TreeKind> = {
  leafy: 'leafy-1',
  pine: 'pine-tall',
  redwood: 'redwood-1',
};

function addTreeSilhouettes(page: PageData, group: THREE.Group) {
  const trees = page.props.filter((prop) => prop.kind === 'tree');
  const dummy = new THREE.Object3D();
  for (const style of Object.keys(HORIZON_TREE_ART) as HorizonTreeStyle[]) {
    const entries = trees.filter((tree) => HORIZON_TREE_KIND[tree.tree] === style);
    if (entries.length === 0) continue;
    const art = TREE_DEFS[HORIZON_TREE_ART[style]];
    const geometry = new THREE.PlaneGeometry(art.aspectRatio, 1);
    const material = getCutoutMaterial(art.url).material;
    for (const crossTurn of [0, Math.PI / 2]) {
      const instances = new THREE.InstancedMesh(geometry, material, entries.length);
      instances.castShadow = false;
      instances.receiveShadow = false;
      entries.forEach((tree, index) => {
        const height = tree.height ?? 2.6;
        dummy.position.set(tree.x, groundedCutoutY(sampleTerrainHeight(tree.x, tree.z), height), tree.z);
        dummy.rotation.set(0, (tree.rotY ?? 0) + crossTurn, 0);
        dummy.scale.set(height, height, 1);
        dummy.updateMatrix();
        instances.setMatrixAt(index, dummy.matrix);
      });
      instances.instanceMatrix.needsUpdate = true;
      group.add(instances);
    }
  }
}

/** Non-interactive page LOD: coarse ground plus crossed tree silhouettes.
 * It shares authored/generated PageData, so approaching swaps in detail at
 * the exact same positions instead of revealing a different forest. */
export function buildHorizonPageGroup(page: PageData): THREE.Group {
  const group = new THREE.Group();
  group.name = `horizon-page:${page.id}`;
  const ground = createTerrainPageMesh(page, getMaterial(page.groundMaterial), 12);
  ground.castShadow = false;
  ground.receiveShadow = false;
  group.add(ground);
  addTreeSilhouettes(page, group);
  return group;
}

export function disposeHorizonPageGroup(group: THREE.Group) {
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) object.geometry.dispose();
  });
  group.removeFromParent();
}
