import * as THREE from 'three';
import { createRng } from '../core/math';
import { getResourceSurfaceUrl } from '../game/resourcePresentation';
import { getMaterial, getResourceSurfaceMaterial } from '../render/materials';
import type { ResourceDropState } from '../sim/state';
import { RESOURCE_DEFS } from './resources';
import { sampleTerrainHeight } from './terrain';

function stringSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A compact, physical pile for one-time output from a tool action. */
export function buildResourceDropVisual(drop: ResourceDropState): THREE.Group {
  const definition = RESOURCE_DEFS[drop.resource];
  const rng = createRng(stringSeed(drop.id));
  const group = new THREE.Group();
  group.name = `resource-drop:${drop.id}`;
  group.position.set(drop.x, sampleTerrainHeight(drop.x, drop.z) + 0.035, drop.z);

  const surfaceUrl = getResourceSurfaceUrl(drop.resource);
  const material = surfaceUrl
    ? getResourceSurfaceMaterial(surfaceUrl, [1, 1])
    : getMaterial(definition.material);
  const pieces = Math.max(3, Math.min(7, drop.amount + 2));

  for (let index = 0; index < pieces; index += 1) {
    let mesh: THREE.Mesh;
    if (definition.visual === 'twigBundle') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.035, 0.44 + rng() * 0.26, 7), material);
      mesh.rotation.z = Math.PI / 2 + (rng() - 0.5) * 0.35;
    } else if (definition.visual === 'fiberTuft') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.3 + rng() * 0.22, 0.025), material);
      mesh.rotation.z = (rng() - 0.5) * 0.65;
    } else if (definition.visual === 'seedPile') {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.04 + rng() * 0.025, 8, 6), material);
      mesh.scale.set(1, 0.6, 1.25);
    } else {
      mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09 + rng() * 0.08, 0), material);
      mesh.scale.set(1, 0.55 + rng() * 0.3, 0.85 + rng() * 0.3);
    }
    mesh.position.set((rng() - 0.5) * 0.48, 0.06 + index * 0.012, (rng() - 0.5) * 0.42);
    mesh.rotation.y = rng() * Math.PI * 2;
    mesh.castShadow = true;
    group.add(mesh);
  }
  return group;
}
