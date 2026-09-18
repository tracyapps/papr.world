import type { TreeSpecies } from '../sim/catalogs/trees';
import type { DecorKind } from './types';

// Renderer-free on purpose (no Three.js import), so generation tests and a
// future server can ask "is this cutout trimmable?" without a canvas.

/**
 * Undergrowth cutouts that are part of the trim economy. Anything absent
 * stays pure scenery (ferns, flowers, cactus, boulders).
 */
const DECOR_TRIM_SPECIES: Partial<Record<DecorKind, TreeSpecies>> = {
  'mushroom-1': 'mushroom',
  'mushroom-2': 'mushroom',
  'shrub-desert-1': 'shrub',
  'shrub-desert-2': 'shrub',
  'berry-shrub-1': 'shrub',
  'shrub-tropical-1': 'shrub',
  'shrub-tropical-2': 'shrub',
  'shrub-tropical-3': 'shrub',
  'hanging-vine-1': 'vine',
  'hanging-vine-2': 'vine',
  'hanging-vine-flowering-1': 'vine',
};

/** The trimmable species a decor cutout belongs to, or null for scenery. */
export function decorTrimSpecies(kind: DecorKind): TreeSpecies | null {
  return DECOR_TRIM_SPECIES[kind] ?? null;
}
