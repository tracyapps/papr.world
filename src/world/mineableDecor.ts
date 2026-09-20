import type { RockFormation } from '../sim/catalogs/mining';
import type { DecorKind } from './types';

/** Rocks belong to mining, never trimming. Pure scenery is absent. */
const MINEABLE_DECOR: Partial<Record<DecorKind, RockFormation>> = {
  'rock-small-1': 'small-rock',
  'rock-small-2': 'small-rock',
  'rock-medium': 'medium-rock',
  'boulder-large': 'boulder',
  'boulder-mossy-1': 'boulder',
  'rock-stack': 'stack',
  'scree-pile': 'scree',
  'cliff-slab': 'cliff-slab',
  'lichen-rock': 'lichen-rock',
};

export function decorRockFormation(kind: DecorKind): RockFormation | null {
  return MINEABLE_DECOR[kind] ?? null;
}

