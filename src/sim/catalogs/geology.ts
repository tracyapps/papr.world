import type { Biome } from './biomes';
import type { ResourceId } from './resources';

export type DigDiscovery = {
  geologySeed: number;
  layer: 1 | 2 | 3;
  resource: ResourceId;
  quantity: number;
};

type WeightedResource = { resource: ResourceId; weight: number };

const SHALLOW_DIG_TABLES: Record<Biome, WeightedResource[]> = {
  clearing: [
    { resource: 'ochre-paperclay', weight: 62 },
    { resource: 'bluefold-pebbles', weight: 25 },
    { resource: 'carbon-copy-shale', weight: 13 },
  ],
  forest: [
    { resource: 'carbon-soil', weight: 58 },
    { resource: 'carbon-copy-shale', weight: 28 },
    { resource: 'graphite-cardstone', weight: 14 },
  ],
  meadow: [
    { resource: 'ochre-paperclay', weight: 48 },
    { resource: 'confetti-stones', weight: 32 },
    { resource: 'bluefold-pebbles', weight: 20 },
  ],
  dunes: [
    { resource: 'ochre-paperclay', weight: 68 },
    { resource: 'sunbaked-cardboard', weight: 22 },
    { resource: 'carbon-copy-shale', weight: 10 },
  ],
  scrapflats: [
    { resource: 'carbon-soil', weight: 48 },
    { resource: 'carbon-copy-shale', weight: 34 },
    { resource: 'graphite-cardstone', weight: 18 },
  ],
};

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rollFrom(seed: number, salt: number) {
  let value = Math.imul(seed ^ salt, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

/** Same page, cell, and layer always reveal the same geology. Hill richness
 * improves quantity without changing the regional material identity. */
export function resolveDigDiscovery(options: {
  biome: Biome;
  pageSeed: number;
  cellKey: string;
  layer: 1 | 2 | 3;
  hillRichness: number;
}): DigDiscovery {
  const geologySeed = hashText(`${options.pageSeed}:${options.cellKey}:${options.layer}`);
  const table = SHALLOW_DIG_TABLES[options.biome];
  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
  let resourceRoll = rollFrom(geologySeed, 71) * totalWeight;
  let resource = table[table.length - 1].resource;
  for (const entry of table) {
    resourceRoll -= entry.weight;
    if (resourceRoll <= 0) {
      resource = entry.resource;
      break;
    }
  }
  const richness = Math.max(0, Math.min(1, options.hillRichness));
  const bonusRoll = rollFrom(geologySeed, 193);
  const quantity = 1 + (bonusRoll < richness * 0.72 ? 1 : 0) + (richness > 0.78 && bonusRoll < 0.2 ? 1 : 0);
  return { geologySeed, layer: options.layer, resource, quantity };
}
