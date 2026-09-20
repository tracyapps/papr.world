import { describe, expect, it } from 'vitest';
import { generatePage } from './generate';
import { dominantBiomeAt } from './fields';
import { PAGE_SIZE, type PageData } from './types';
import { decorTrimSpecies } from './trimmableDecor';
import { biomesFor, isBiomeExclusive, obtainRoutesFor } from '../sim/catalogs/obtaining';

/** The first handful of tropical pages near the origin, found by scanning. */
function tropicalPages(limit: number): PageData[] {
  const pages: PageData[] = [];
  for (let radius = 0; radius < 60 && pages.length < limit; radius += 1) {
    for (let px = -radius; px <= radius && pages.length < limit; px += 1) {
      for (const pz of [-radius, radius]) {
        if (dominantBiomeAt(px * PAGE_SIZE, pz * PAGE_SIZE) !== 'tropical') continue;
        pages.push(generatePage(px, pz));
        if (pages.length >= limit) break;
      }
    }
  }
  return pages;
}

describe('jungle canopy', () => {
  const pages = tropicalPages(12);

  it('finds tropical pages to test against', () => {
    expect(pages.length).toBeGreaterThan(4);
  });

  it('layers jungle tree heights, with emergents that stay under redwood height', () => {
    const heights = pages.flatMap((page) => page.props)
      .filter((prop) => prop.kind === 'tree' && prop.tree.startsWith('jungle'))
      .map((prop) => (prop.kind === 'tree' ? prop.height ?? 0 : 0));
    expect(heights.length).toBeGreaterThan(20);
    expect(Math.max(...heights)).toBeLessThanOrEqual(22);
    expect(heights.some((height) => height >= 14)).toBe(true);
    expect(heights.some((height) => height < 8)).toBe(true);
  });

  it('hangs vines only from tall jungle trees, within reach of the ground', () => {
    let vineCount = 0;
    for (const prop of pages.flatMap((page) => page.props)) {
      if (prop.kind !== 'tree' || !prop.vines) continue;
      expect(prop.tree.startsWith('jungle')).toBe(true);
      expect(prop.height ?? 0).toBeGreaterThanOrEqual(9);
      for (const vine of prop.vines) {
        vineCount += 1;
        expect(decorTrimSpecies(vine.art)).toBe('vine');
        expect(vine.topY).toBeLessThan(prop.height ?? 0);
        // Bottom stays off the ground but low enough to reach.
        expect(vine.topY - vine.height).toBeGreaterThanOrEqual(0.8);
        expect(vine.topY - vine.height).toBeLessThan(6);
      }
    }
    expect(vineCount).toBeGreaterThan(5);
  });
});

describe('trimmable undergrowth', () => {
  it('makes crepe vine a tropical-exclusive, trim-only material', () => {
    expect(biomesFor('crepe-vine')).toEqual(['tropical']);
    expect(isBiomeExclusive('crepe-vine')).toBe(true);
    expect(obtainRoutesFor('crepe-vine').map((route) => route.kind)).toEqual(['trimmed']);
  });

  it('gets blotting caps from mushrooms in forest and jungle', () => {
    const routes = obtainRoutesFor('blotting-caps');
    expect(routes).toContainEqual(expect.objectContaining({ kind: 'trimmed', species: 'mushroom' }));
    expect(biomesFor('blotting-caps')).toEqual(expect.arrayContaining(['forest', 'tropical']));
  });

  it('keeps ferns, cactus, and rocks as pure scenery while flowers regrow', () => {
    for (const art of ['fern-1', 'cactus-1', 'boulder-mossy-1'] as const) {
      expect(decorTrimSpecies(art)).toBeNull();
    }
    expect(decorTrimSpecies('hibiscus-1')).toBe('flower');
    expect(decorTrimSpecies('mushroom-1')).toBe('mushroom');
    expect(decorTrimSpecies('shrub-tropical-2')).toBe('shrub');
  });
});
