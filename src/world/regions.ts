import { hashCoords } from '../core/math';
import { getPage } from './pages';
import { pageOfPosition, type Biome } from './types';

const REGION_NAMES: Record<Biome, string[]> = {
  clearing: ['The Paper Clearing'],
  forest: ['Ribbonbark Forest', 'Tinselneedle Woods', 'Plaidpine Forest', 'Crinkleleaf Grove', 'Wrapping-Paper Wilds'],
  meadow: ['Notebook Meadow', 'Confetti Prairie', 'Patchwork Grasslands', 'Doodlegrass Downs'],
  dunes: ['Cardboard Desert', 'Kraftpaper Dunes', 'Corrugated Sands', 'Torn-Edge Desert'],
  scrapflats: ['Offcut Flats', 'Crumplefield Badlands', 'Cardstock Flats', 'The Scissor-Scrap Barrens'],
  tropical: ['Creaseline Jungle', 'Ribbonfrond Tropics', 'Sunfold Jungle', 'Confetti-Blossom Coast', 'Tapedrop Jungle'],
  swamp: ['Mossfold Swamp', 'Cypress Crinkles', 'Inkwater Bog', 'Mucky Margins'],
  wetland: ['Reedstitch Wetlands', 'Lilyfold Marsh', 'Soft-Silt Fen', 'Ripplepaper Mere'],
  'rocky-highlands': ['Granite-Card Highlands', 'Scree Fold Range', 'Pencilpoint Peaks', 'Lichen Ridge'],
  savanna: ['Sunpaper Savanna', 'Ribbon-Grass Plain', 'Acacia Fold', 'Baobab Reach'],
  badlands: ['Ochre-Tear Badlands', 'Redfold Barrens', 'Corrugated Canyons', 'Paintbrush Mesa'],
  'bamboo-forest': ['Bamboo-Rustle Grove', 'Green-Culm Forest', 'Folded Cane Wood', 'Panda Paperwood'],
};

const BIOME_LABELS: Record<Biome, string> = {
  clearing: 'home clearing', forest: 'forest', meadow: 'meadow', dunes: 'desert', scrapflats: 'scrap flats',
  tropical: 'tropics',
  swamp: 'swamp', wetland: 'wetlands', 'rocky-highlands': 'rocky highlands', savanna: 'savanna',
  badlands: 'badlands', 'bamboo-forest': 'bamboo forest',
};

export function getRegionName(px: number, pz: number, biome: Biome) {
  if (px === 0 && pz === 0) return 'The Paper Clearing';
  const regionX = Math.floor(px / 2);
  const regionZ = Math.floor(pz / 2);
  const names = REGION_NAMES[biome];
  return names[hashCoords(regionX, regionZ, 9031) % names.length];
}

export function getRegionAtPosition(x: number, z: number) {
  const { px, pz } = pageOfPosition(x, z);
  const page = getPage(px, pz);
  return {
    id: `${Math.floor(px / 2)},${Math.floor(pz / 2)}:${page.biome}`,
    name: getRegionName(px, pz, page.biome),
    biomeLabel: BIOME_LABELS[page.biome],
  };
}
