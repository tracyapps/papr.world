import type { Biome } from './biomes';
import type { ResourceId } from './resources';

/** Surface formations are renewable stock, separate from terrain digging. */
export type RockFormation =
  | 'small-rock'
  | 'medium-rock'
  | 'boulder'
  | 'stack'
  | 'scree'
  | 'cliff-slab'
  | 'lichen-rock';

export type RockGrowthState = {
  growth: number;
  minedAt: number;
  mines: number;
  formation?: RockFormation;
};

export type RockAddress = {
  pageId: string;
  rockKey: string;
  formation: RockFormation;
  biome: Biome;
};

export const MAX_ROCK_GROWTH = 100;
/** A worked formation reforms completely in six real-world minutes. */
export const ROCK_REGROWTH_PER_SECOND = MAX_ROCK_GROWTH / (6 * 60);

export function rockGrowthAt(record: RockGrowthState | undefined, now: number): number {
  if (!record) return MAX_ROCK_GROWTH;
  const elapsedSeconds = Math.max(0, now - record.minedAt) / 1000;
  return Math.min(MAX_ROCK_GROWTH, record.growth + elapsedSeconds * ROCK_REGROWTH_PER_SECOND);
}

export function rockIsReady(record: RockGrowthState | undefined, now: number): boolean {
  return rockGrowthAt(record, now) >= MAX_ROCK_GROWTH;
}

const FORMATION_NAMES: Record<RockFormation, string> = {
  'small-rock': 'small rock',
  'medium-rock': 'rock formation',
  boulder: 'boulder',
  stack: 'rock stack',
  scree: 'scree pile',
  'cliff-slab': 'cliff slab',
  'lichen-rock': 'lichen-covered rock',
};

export function rockFormationName(formation: RockFormation): string {
  return FORMATION_NAMES[formation];
}

const BIOME_STONE: Record<Biome, ResourceId> = {
  clearing: 'bluefold-pebbles',
  forest: 'graphite-cardstone',
  meadow: 'confetti-stones',
  dunes: 'terracotta-pebbles',
  scrapflats: 'graphite-cardstone',
  tropical: 'rainfold-pebbles',
  swamp: 'carbon-copy-shale',
  wetland: 'rainfold-pebbles',
  'rocky-highlands': 'granite-cardstone',
  savanna: 'terracotta-pebbles',
  badlands: 'granite-cardstone',
  'bamboo-forest': 'rainfold-pebbles',
};

/** Biomes whose renewable formations produce this material. */
export function surfaceMineBiomes(resource: ResourceId): Biome[] {
  return (Object.keys(BIOME_STONE) as Biome[]).filter((biome) => BIOME_STONE[biome] === resource);
}

const FORMATION_YIELD: Record<RockFormation, number> = {
  'small-rock': 1,
  'medium-rock': 2,
  boulder: 3,
  stack: 2,
  scree: 3,
  'cliff-slab': 3,
  'lichen-rock': 2,
};

export type MineYield = { resource: ResourceId; quantity: number };

/**
 * A deterministic surface-rock reward. The biome supplies the stone identity;
 * the formation supplies quantity. Large formations occasionally include a
 * shale flake, keyed by stable rock id and work count so reloads cannot reroll.
 */
export function resolveMineYield(args: {
  rockKey: string;
  formation: RockFormation;
  biome: Biome;
  mines: number;
}): MineYield[] {
  const primary = BIOME_STONE[args.biome];
  const result: MineYield[] = [{ resource: primary, quantity: FORMATION_YIELD[args.formation] }];
  if (FORMATION_YIELD[args.formation] >= 3 && stableRoll(`${args.rockKey}:${args.mines}`) % 3 === 0
    && primary !== 'carbon-copy-shale') {
    result.push({ resource: 'carbon-copy-shale', quantity: 1 });
  }
  return result;
}

function stableRoll(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
