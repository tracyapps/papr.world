import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HARVEST_SECONDS,
  SEED_DEFS,
  plantHarvestDurationMs,
  type SeedId,
} from './seeds';

describe('per-seed harvest duration', () => {
  it('falls back to the shared default for every seed today', () => {
    // No seed sets `harvestSeconds` yet — this is the seam for a future
    // slower, bigger crop, not a decision about today's catalog. Once one
    // exists, add a duration test alongside it there rather than here.
    for (const seedId of Object.keys(SEED_DEFS) as SeedId[]) {
      expect(plantHarvestDurationMs(seedId)).toBe(DEFAULT_HARVEST_SECONDS * 1000);
    }
  });
});
