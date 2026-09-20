import { describe, expect, it } from 'vitest';
import { BIOME_IDS, type Biome } from '../sim/catalogs/biomes';
import { DIG_TABLES } from '../sim/catalogs/geology';
import { biomesFor, obtainRoutesFor } from '../sim/catalogs/obtaining';
import { generatePage } from './generate';
import { dominantBiomeAt } from './fields';
import { PAGE_SIZE, type PageData } from './types';
import { decorTrimSpecies } from './trimmableDecor';

const EXPANSION: Biome[] = ['swamp', 'wetland', 'rocky-highlands', 'savanna', 'badlands', 'bamboo-forest'];

function pagesFor(biome: Biome, limit = 4): PageData[] {
  const pages: PageData[] = [];
  for (let px = -45; px <= 45 && pages.length < limit; px += 1) {
    for (let pz = -45; pz <= 45 && pages.length < limit; pz += 1) {
      if (dominantBiomeAt(px * PAGE_SIZE, pz * PAGE_SIZE) === biome) pages.push(generatePage(px, pz));
    }
  }
  return pages;
}

describe('biome expansion', () => {
  it('gives every new biome generated pages, loose resources, and three dig layers', () => {
    for (const biome of EXPANSION) {
      expect(BIOME_IDS).toContain(biome);
      expect(pagesFor(biome, 1), `${biome} never generated`).toHaveLength(1);
      expect(generatePage(...(() => {
        const page = pagesFor(biome, 1)[0];
        return [page.px, page.pz] as const;
      })()).props.some((prop) => prop.kind === 'harvestable')).toBe(true);
      expect(DIG_TABLES[biome][1].length).toBeGreaterThan(0);
      expect(DIG_TABLES[biome][2].length).toBeGreaterThan(0);
      expect(DIG_TABLES[biome][3].length).toBeGreaterThan(0);
    }
  });

  it('makes new living decor renewable while reserving rocks for mining', () => {
    expect(decorTrimSpecies('bamboo-tall')).toBe('bamboo');
    expect(decorTrimSpecies('shrub-swamp')).toBe('shrub');
    expect(decorTrimSpecies('flower-lotus')).toBe('flower');
    expect(decorTrimSpecies('mushroom-morel')).toBe('mushroom');
    expect(decorTrimSpecies('moss-hummock')).toBe('moss');
    for (const rock of ['rock-small-1', 'rock-medium', 'rock-stack', 'cliff-slab'] as const) {
      expect(decorTrimSpecies(rock)).toBeNull();
    }
  });

  it('keeps each new dig identity tied to its home biome', () => {
    const pairs = [
      ['bog-peat-paper', 'swamp'], ['wetland-silt-clay', 'wetland'],
      ['granite-cardstone', 'rocky-highlands'], ['savanna-hardpan', 'savanna'],
      ['badlands-ochre', 'badlands'], ['bamboo-loam', 'bamboo-forest'],
    ] as const;
    for (const [resource, biome] of pairs) {
      expect(biomesFor(resource)).toContain(biome);
      expect(obtainRoutesFor(resource).some((route) => route.kind === 'dug')).toBe(true);
    }
  });

  it('adds mapped inland water to wet biomes', () => {
    for (const biome of ['swamp', 'wetland'] as const) {
      const waters = pagesFor(biome).flatMap((page) => page.props).filter((prop) => prop.kind === 'water');
      expect(waters.length).toBeGreaterThan(0);
      expect(waters.every((water) => water.kind === 'water' && water.map?.kind === 'terrain')).toBe(true);
    }
  });
});
