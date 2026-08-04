export const BIOME_IDS = ['clearing', 'forest', 'meadow', 'dunes', 'scrapflats'] as const;
export type Biome = typeof BIOME_IDS[number];
