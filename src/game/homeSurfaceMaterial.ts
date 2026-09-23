import * as THREE from 'three';
import { getMaterial } from '../render/materials';
import type { HomeSurfaceLook } from '../sim/homeLook';

const cache = new Map<string, THREE.MeshStandardMaterial>();

export function homeSurfaceMaterial(look: HomeSurfaceLook): THREE.MeshStandardMaterial {
  const key = `${look.design}|${look.color}`;
  let material = cache.get(key);
  if (!material) {
    material = getMaterial(look.design).clone();
    material.color.multiply(new THREE.Color(look.color));
    cache.set(key, material);
  }
  return material;
}
