export const BIOME_IDS = [
  'clearing', 'forest', 'meadow', 'dunes', 'scrapflats', 'tropical',
  'swamp', 'wetland', 'rocky-highlands', 'savanna', 'badlands', 'bamboo-forest',
] as const;
export type Biome = typeof BIOME_IDS[number];
