import { describe, expect, it } from 'vitest';
import { waterwayPropsForPage, withWaterways } from './waterways';
import type { PageData } from './types';

function channelOn(px: number, pz: number) {
  return waterwayPropsForPage({ px, pz }).find((prop) => prop.kind === 'waterChannel');
}

describe('procedural waterways', () => {
  it('places the first meandering river just east of the clearing', () => {
    const overlap = channelOn(0, 0);
    expect(overlap).toBeUndefined();
    expect(channelOn(1, 0)).toBeDefined();
  });

  it('is deterministic for multiplayer and revisits', () => {
    expect(waterwayPropsForPage({ px: 1, pz: 0 })).toEqual(waterwayPropsForPage({ px: 1, pz: 0 }));
  });

  it('shares identical samples across neighbouring page seams', () => {
    const south = channelOn(1, 0);
    const north = channelOn(1, 1);
    expect(south?.kind).toBe('waterChannel');
    expect(north?.kind).toBe('waterChannel');
    if (south?.kind !== 'waterChannel' || north?.kind !== 'waterChannel') return;

    const northByZ = new Map(north.points.map((point) => [point[1], point[0]]));
    const overlap = south.points.filter((point) => northByZ.has(point[1]));
    // Two shared samples make one complete overlapping segment at the seam.
    expect(overlap.length).toBeGreaterThanOrEqual(2);
    for (const [x, z] of overlap) expect(northByZ.get(z)).toBeCloseTo(x, 10);
  });

  it('adds a bridge when the page-centre reach is too deep for land critters', () => {
    const river = channelOn(1, 0);
    expect(river?.kind).toBe('waterChannel');
    if (river?.kind !== 'waterChannel') return;
    expect(Math.max(...river.depths)).toBeGreaterThan(0.46);
    expect(river.crossing).toBeDefined();
  });

  it('reserves the channel corridor from local terrain mounds', () => {
    const page: PageData = {
      id: '1,0', px: 1, pz: 0, biome: 'meadow', seed: 1,
      groundMaterial: 'ground.meadow',
      terrain: [
        { x: 65, z: 0, radiusX: 3, radiusZ: 3, height: 0.8 },
        { x: 35, z: 0, radiusX: 2, radiusZ: 2, height: 0.8 },
      ],
      props: [],
    };

    const prepared = withWaterways(page);
    expect(prepared.terrain).toHaveLength(1);
    expect(prepared.terrain[0].x).toBe(35);
  });
});
