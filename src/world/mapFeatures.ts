import type { MapFeatureKind } from './types';

// Minimap feature registry, renderer-independent.
// Features persist once discovered so the map keeps remembering
// even when a page is streamed out.

export type MapFeature = {
  id: string;
  kind: MapFeatureKind;
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  color: string;
  shape: 'circle' | 'rect';
  rotation?: number;
};

const features: MapFeature[] = [];
const featureIndex = new Map<string, MapFeature>();

export function registerMapFeature(feature: MapFeature) {
  const existing = featureIndex.get(feature.id);
  if (existing) {
    Object.assign(existing, feature);
    return;
  }
  featureIndex.set(feature.id, feature);
  features.push(feature);
}

export function updateMapFeaturePosition(id: string, x: number, z: number) {
  const feature = featureIndex.get(id);
  if (!feature) return;
  feature.x = x;
  feature.z = z;
}

export function removeMapFeature(id: string) {
  const feature = featureIndex.get(id);
  if (!feature) return;
  featureIndex.delete(id);
  const index = features.indexOf(feature);
  if (index >= 0) features.splice(index, 1);
}

export function getMapFeatures(): readonly MapFeature[] {
  return features;
}
