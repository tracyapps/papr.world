import { describe, expect, it } from 'vitest';
import type { Biome } from '../sim/catalogs/biomes';
import { buildTreasureMapModel, describeTreasureMap } from './treasureMapModel';

const world = (px: number): Biome => (px >= 2 ? 'dunes' : 'meadow');
const places = [
  { id: 'home', name: 'Home', x: 0, z: 0, builtin: true },
  { id: 'ribbonbark-forest', name: 'Ribbonbark Forest', x: -50, z: 0, builtin: true },
  { id: 'wood-mill', name: 'Wood Mill', x: -94, z: 0, builtin: true },
  { id: 'place-3', name: 'Nice pond', x: 20, z: 5, builtin: false },
];

describe('the treasure map model', () => {
  it('inks walked pages, names their regions once, and rumours the rest', () => {
    const model = buildTreasureMapModel(0, 0, 'near', places, {
      biomeAt: world,
      exploredAt: (px, pz) => (px === 0 && (pz === 0 || pz === 1) ? 0.5 : 0),
      regionName: () => 'Notebook Meadow',
    });
    expect(model.exploredPages).toBe(2);
    expect(model.regions).toHaveLength(1);
    expect(model.regions[0]).toMatchObject({ text: 'Notebook Meadow', weight: 2 });
    expect(model.rumours.map((r) => r.biome)).toEqual(['dunes']);
    expect(model.cells).toHaveLength(21 * 21);
  });

  it('keeps real places, marks home, and leaves out the region signposts', () => {
    const model = buildTreasureMapModel(0, 0, 'near', places, {
      biomeAt: world, exploredAt: () => 0, regionName: () => 'x',
    });
    expect(model.places.map((p) => `${p.id}:${p.kind}`)).toEqual(['home:home', 'wood-mill:mill', 'place-3:place']);
  });

  it('says in words what it shows in pictures', () => {
    const model = buildTreasureMapModel(0, 0, 'far', places, {
      biomeAt: world, exploredAt: () => 0, regionName: () => 'x',
    });
    const text = describeTreasureMap(model, (hint) => `${hint.biome} somewhere`);
    expect(text).toContain('explored 0 pages');
    expect(text).toContain('dunes somewhere');
  });
});
