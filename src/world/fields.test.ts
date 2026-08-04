import { describe, expect, it } from 'vitest';
import {
  biomeConfidenceAt,
  biomeWeightsAt,
  dominantBiomeAt,
  elevationBandAt,
  fieldElevationAt,
} from './fields';
import { PAGE_SIZE, type Biome } from './types';

const GENERATED: Biome[] = ['meadow', 'forest', 'dunes', 'scrapflats'];

describe('world fields', () => {
  it('is deterministic — the same point always answers the same', () => {
    for (const [x, z] of [[0, 0], [123.4, -87.2], [-1000, 4000]]) {
      expect(fieldElevationAt(x, z)).toBe(fieldElevationAt(x, z));
      expect(dominantBiomeAt(x, z)).toBe(dominantBiomeAt(x, z));
    }
  });

  it('is continuous across page borders', () => {
    // The whole reason for a field: two pages must agree about the ground at
    // their shared edge without negotiating. A per-page hash could not do
    // this, which is what made the world read as a grid.
    const border = PAGE_SIZE / 2;
    for (const z of [-140, -12, 0, 33, 210]) {
      const left = fieldElevationAt(border - 0.001, z);
      const right = fieldElevationAt(border + 0.001, z);
      expect(Math.abs(left - right)).toBeLessThan(0.01);
    }
  });

  it('has no discontinuity anywhere along a long walk', () => {
    // Step across several pages and assert the ground never jumps. A seam
    // would show up as a single large delta between adjacent samples.
    let previous = fieldElevationAt(-200, 17);
    for (let x = -200; x <= 200; x += 0.5) {
      const height = fieldElevationAt(x, 17);
      expect(Math.abs(height - previous)).toBeLessThan(0.5);
      previous = height;
    }
  });

  it('keeps the starting clearing calm', () => {
    // The house, Thing Maker, pond and signposts are hand-placed against
    // terrain that was flat when they were positioned.
    expect(Math.abs(fieldElevationAt(0, 0))).toBeLessThan(0.2);
    for (const [x, z] of [[6, 4], [-5.2, 4.7], [10, -8]]) {
      expect(Math.abs(fieldElevationAt(x, z))).toBeLessThan(1.2);
    }
  });

  it('gets more dramatic away from home', () => {
    let nearMax = 0;
    let farMax = 0;
    for (let i = 0; i < 400; i += 1) {
      const angle = (i / 400) * Math.PI * 2;
      nearMax = Math.max(nearMax, Math.abs(fieldElevationAt(Math.cos(angle) * 20, Math.sin(angle) * 20)));
      farMax = Math.max(farMax, Math.abs(fieldElevationAt(Math.cos(angle) * 600, Math.sin(angle) * 600)));
    }
    expect(farMax).toBeGreaterThan(nearMax);
  });

  it('produces every generated biome somewhere', () => {
    // A field that only ever answers "meadow" is a field with a bug.
    const seen = new Set<Biome>();
    for (let x = -900; x <= 900; x += 37) {
      for (let z = -900; z <= 900; z += 41) {
        seen.add(dominantBiomeAt(x, z));
      }
    }
    for (const biome of GENERATED) expect(seen).toContain(biome);
  });

  it('never generates the authored clearing biome', () => {
    // The clearing is hand-made; the field must never claim a page is one.
    for (let x = -600; x <= 600; x += 53) {
      for (let z = -600; z <= 600; z += 47) {
        expect(dominantBiomeAt(x, z)).not.toBe('clearing');
      }
    }
  });

  it('weights always form a distribution', () => {
    for (const [x, z] of [[0, 0], [88, -412], [-733, 219]]) {
      const weights = biomeWeightsAt(x, z);
      const total = GENERATED.reduce((sum, biome) => sum + weights[biome], 0);
      expect(total).toBeCloseTo(1, 5);
      for (const biome of GENERATED) {
        expect(weights[biome]).toBeGreaterThanOrEqual(0);
        expect(weights[biome]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('reports low confidence at boundaries and high confidence inside a region', () => {
    // Walk until the biome changes; confidence at the crossing must be lower
    // than confidence well away from it. This is what thins props out at a
    // boundary instead of stopping them at a page edge.
    let boundaryX: number | null = null;
    let previous = dominantBiomeAt(-500, 5);
    for (let x = -500; x <= 500; x += 1) {
      const biome = dominantBiomeAt(x, 5);
      if (biome !== previous) {
        boundaryX = x;
        break;
      }
      previous = biome;
    }

    expect(boundaryX).not.toBeNull();
    const atBoundary = biomeConfidenceAt(boundaryX!, 5);
    const wellInside = biomeConfidenceAt(boundaryX! - 60, 5);
    expect(atBoundary).toBeLessThan(wellInside);
  });

  it('keeps the elevation band inside 0..1 for the map overlay', () => {
    for (let x = -2000; x <= 2000; x += 173) {
      for (let z = -2000; z <= 2000; z += 191) {
        const band = elevationBandAt(x, z);
        expect(band).toBeGreaterThanOrEqual(0);
        expect(band).toBeLessThanOrEqual(1);
      }
    }
  });

  it('does not align biome boundaries to the page grid', () => {
    // The symptom being fixed: if boundaries only ever fell on page edges,
    // every crossing would sit at a multiple of PAGE_SIZE. Collect crossings
    // and assert they land off-grid.
    const offGrid: number[] = [];
    let previous = dominantBiomeAt(-800, -33);
    for (let x = -800; x <= 800; x += 1) {
      const biome = dominantBiomeAt(x, -33);
      if (biome !== previous) {
        const distanceToEdge = Math.abs(((x % PAGE_SIZE) + PAGE_SIZE) % PAGE_SIZE - PAGE_SIZE / 2);
        offGrid.push(distanceToEdge);
      }
      previous = biome;
    }
    expect(offGrid.length).toBeGreaterThan(0);
    // At least one crossing well away from a page boundary.
    expect(Math.min(...offGrid)).toBeLessThan(PAGE_SIZE / 2 - 4);
  });
});
