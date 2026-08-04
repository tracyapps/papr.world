import type { Biome } from './biomes';
import type { ResourceId } from './resources';

export type DigDiscovery = {
  geologySeed: number;
  layer: 1 | 2 | 3;
  resource: ResourceId;
  quantity: number;
};

export type WeightedResource = { resource: ResourceId; weight: number };

export type DigLayer = 1 | 2 | 3;

/**
 * What is under the ground, by depth.
 *
 * The shovel ladder gets its meaning from *here*, not from a power stat on
 * the tools. A better shovel is better because it reaches a layer that holds
 * different material — take these tables away and the tiers have nothing to
 * be better at. That is why this is a table per depth rather than one table
 * plus a multiplier: the reward for upgrading has to be a place, not a number.
 *
 * Depths, roughly:
 *
 * 1. **Surface.** Loose paper soil and whatever has worked its way up into
 *    it. Common, generous, and the same stuff you can often find lying about.
 * 2. **Compact.** Pressed layers. Where the structural materials live — the
 *    card and shale a real build needs quantities of.
 * 3. **Deep seam.** Only present where the local geology has one, and worth
 *    the walk. Concentrated stone and the region's own oddities.
 *
 * Exported because `catalogs/obtaining.ts` reads these to answer "where can I
 * dig this up, and with what?" — the reference site and the critters quote
 * the table the game actually rolls against, never a second copy in prose.
 */
export const DIG_TABLES: Record<Biome, Record<DigLayer, WeightedResource[]>> = {
  clearing: {
    1: [
      { resource: 'ochre-paperclay', weight: 70 },
      { resource: 'bluefold-pebbles', weight: 30 },
    ],
    2: [
      { resource: 'carbon-copy-shale', weight: 52 },
      { resource: 'ochre-paperclay', weight: 28 },
      { resource: 'sunbaked-cardboard', weight: 20 },
    ],
    3: [
      { resource: 'graphite-cardstone', weight: 58 },
      { resource: 'carbon-copy-shale', weight: 42 },
    ],
  },
  forest: {
    1: [
      { resource: 'carbon-soil', weight: 68 },
      { resource: 'mossy-paper-fiber', weight: 32 },
    ],
    2: [
      { resource: 'carbon-copy-shale', weight: 48 },
      { resource: 'carbon-soil', weight: 30 },
      { resource: 'graphite-cardstone', weight: 22 },
    ],
    3: [
      { resource: 'graphite-cardstone', weight: 64 },
      { resource: 'confetti-stones', weight: 36 },
    ],
  },
  meadow: {
    1: [
      { resource: 'ochre-paperclay', weight: 62 },
      { resource: 'bluefold-pebbles', weight: 38 },
    ],
    2: [
      { resource: 'confetti-stones', weight: 50 },
      { resource: 'ochre-paperclay', weight: 28 },
      { resource: 'carbon-copy-shale', weight: 22 },
    ],
    3: [
      { resource: 'confetti-stones', weight: 55 },
      { resource: 'graphite-cardstone', weight: 45 },
    ],
  },
  dunes: {
    1: [
      { resource: 'ochre-paperclay', weight: 74 },
      { resource: 'bluefold-pebbles', weight: 26 },
    ],
    2: [
      { resource: 'sunbaked-cardboard', weight: 58 },
      { resource: 'ochre-paperclay', weight: 24 },
      { resource: 'carbon-copy-shale', weight: 18 },
    ],
    3: [
      { resource: 'sunbaked-cardboard', weight: 50 },
      { resource: 'graphite-cardstone', weight: 50 },
    ],
  },
  scrapflats: {
    1: [
      { resource: 'carbon-soil', weight: 60 },
      { resource: 'sunbaked-cardboard', weight: 40 },
    ],
    2: [
      { resource: 'carbon-copy-shale', weight: 46 },
      { resource: 'sunbaked-cardboard', weight: 30 },
      { resource: 'graphite-cardstone', weight: 24 },
    ],
    3: [
      { resource: 'graphite-cardstone', weight: 62 },
      { resource: 'confetti-stones', weight: 38 },
    ],
  },
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
  const table = DIG_TABLES[options.biome][options.layer];
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
