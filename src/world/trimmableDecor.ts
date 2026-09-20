import type { TreeSpecies } from '../sim/catalogs/trees';
import type { DecorKind } from './types';

// Renderer-free on purpose (no Three.js import), so generation tests and a
// future server can ask "is this cutout trimmable?" without a canvas.

/**
 * Undergrowth cutouts that are part of the trim economy. Anything absent
 * stays pure scenery (ferns, cactus, logs, and all rock formations).
 */
const DECOR_TRIM_SPECIES: Partial<Record<DecorKind, TreeSpecies>> = {
  'mushroom-1': 'mushroom',
  'mushroom-2': 'mushroom',
  'mushroom-3': 'mushroom',
  'mushroom-amanita': 'mushroom',
  'mushroom-coral': 'mushroom',
  'mushroom-fly-agaric': 'mushroom',
  'mushroom-morel': 'mushroom',
  'mushroom-shelf': 'mushroom',
  'shrub-desert-1': 'shrub',
  'shrub-desert-2': 'shrub',
  'berry-shrub-1': 'shrub',
  'shrub-tropical-1': 'shrub',
  'shrub-tropical-2': 'shrub',
  'shrub-tropical-3': 'shrub',
  'shrub-alpine': 'shrub',
  'shrub-savanna': 'shrub',
  'shrub-swamp': 'shrub',
  'shrub-temperate-1': 'shrub',
  'shrub-temperate-2': 'shrub',
  'shrub-thorny': 'shrub',
  'shrub-flowering-1': 'shrub',
  'shrub-flowering-2': 'shrub',
  'marigold-1': 'flower',
  'hibiscus-1': 'flower',
  'anthurium-1': 'flower',
  'bird-of-paradise-1': 'flower',
  'bamboo-1': 'bamboo',
  'bamboo-2': 'bamboo',
  'bamboo-3': 'bamboo',
  'bamboo-tall': 'bamboo',
  'bamboo-shoot': 'bamboo',
  'moss-ball': 'moss',
  'moss-drape': 'moss',
  'moss-hummock': 'moss',
  'moss-patch': 'moss',
  'flower-allium': 'flower',
  'flower-blackeyed-susan': 'flower',
  'flower-bougainvillea': 'flower',
  'flower-coneflower': 'flower',
  'flower-cosmos': 'flower',
  'flower-daisy': 'flower',
  'flower-edelweiss': 'flower',
  'flower-foxglove': 'flower',
  'flower-lotus': 'flower',
  'flower-lupine': 'flower',
  'flower-marigold': 'flower',
  'flower-paintbrush': 'flower',
  'flower-plumeria': 'flower',
  'flower-poppy': 'flower',
  'flower-protea': 'flower',
  'flower-spider-lily': 'flower',
  'flower-sunflower': 'flower',
  'flower-zinnia': 'flower',
  'hanging-vine-1': 'vine',
  'hanging-vine-2': 'vine',
  'hanging-vine-flowering-1': 'vine',
  'hanging-vine-3': 'vine',
  'hanging-vine-4': 'vine',
  'hanging-vine-flowering-2': 'vine',
};

/** The trimmable species a decor cutout belongs to, or null for scenery. */
export function decorTrimSpecies(kind: DecorKind): TreeSpecies | null {
  return DECOR_TRIM_SPECIES[kind] ?? null;
}
