import { describe, expect, it } from 'vitest';
import type { Biome } from '../sim/catalogs/biomes';
import {
  bearingBetween,
  compassArrow,
  compassPoint,
  distanceWords,
  nearestBiomes,
} from './biomeCompass';

describe('which way is the jungle', () => {
  it('uses the compass the HUD uses: north is -z, east is +x', () => {
    expect(bearingBetween(0, 0, 0, -10)).toBeCloseTo(0);
    expect(bearingBetween(0, 0, 10, 0)).toBeCloseTo(90);
    expect(bearingBetween(0, 0, 0, 10)).toBeCloseTo(180);
    expect(bearingBetween(0, 0, -10, 0)).toBeCloseTo(270);
    expect(compassPoint(44)).toBe('northeast');
    expect(compassArrow(90)).toBe('→');
  });

  it('finds the nearest page of each land, nearest first', () => {
    // Meadow everywhere, a desert strip to the east, jungle far to the north.
    const world = (px: number, pz: number): Biome => {
      if (px >= 3) return 'dunes';
      if (pz <= -10) return 'tropical';
      return 'meadow';
    };
    const found = nearestBiomes(0, 0, world);
    expect(found.map((hint) => hint.biome)).toEqual(['meadow', 'dunes', 'tropical']);
    const desert = found.find((hint) => hint.biome === 'dunes')!;
    expect(desert.distance).toBeCloseTo(150);
    expect(compassPoint(desert.bearing)).toBe('east');
    const jungle = found.find((hint) => hint.biome === 'tropical')!;
    expect(compassPoint(jungle.bearing)).toBe('north');
  });

  it('speaks in walking words, not units', () => {
    expect(distanceWords(30)).toBe('right around here');
    expect(distanceWords(2000)).toBe('a long way');
  });

  it('answers quickly for the real world', async () => {
    const { pageBiome } = await import('./biomeCompass');
    const started = performance.now();
    nearestBiomes(1234, -567, pageBiome);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
