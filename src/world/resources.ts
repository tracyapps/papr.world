import type { MaterialKey } from '../render/materials';
import {
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_ORDER,
  RESOURCE_CORE_DEFS,
  type ResourceCategoryId,
  type ResourceId,
} from '../sim/catalogs/resources';
import type { Biome, HarvestVisual } from './types';

export { RESOURCE_CATEGORIES, RESOURCE_CATEGORY_ORDER };
export type { ResourceCategoryDefinition, ResourceCategoryId, ResourceId } from '../sim/catalogs/resources';

export type ResourceDefinition = {
  id: ResourceId;
  label: string;
  shortLabel: string;
  material: MaterialKey;
  visual: HarvestVisual;
  mapColor: string;
  biomes: Biome[];
  category: ResourceCategoryId;
  iconKey: string;
};

const RESOURCE_WORLD_DEFS: Record<ResourceId, Omit<ResourceDefinition, 'id' | 'label' | 'shortLabel' | 'category' | 'iconKey'>> = {
  'kraft-twigs': {
    material: 'paper.brown', visual: 'twigBundle', mapColor: '#8b5f38',
    biomes: ['clearing', 'forest', 'meadow'],
  },
  'ribbonwood-sticks': {
    material: 'paper.salmon', visual: 'twigBundle', mapColor: '#b45e67',
    biomes: ['forest', 'scrapflats'],
  },
  'mossy-paper-fiber': {
    material: 'paper.monstera', visual: 'fiberTuft', mapColor: '#4f823f',
    biomes: ['clearing', 'forest', 'meadow'],
  },
  'confetti-stones': {
    material: 'paper.purple', visual: 'stoneCluster', mapColor: '#8252a0',
    biomes: ['meadow', 'scrapflats'],
  },
  'graphite-cardstone': {
    material: 'paper.grey', visual: 'stoneCluster', mapColor: '#696c70',
    biomes: ['forest', 'scrapflats'],
  },
  'bluefold-pebbles': {
    material: 'paper.aqua', visual: 'stoneCluster', mapColor: '#4c91a8',
    biomes: ['meadow', 'dunes'],
  },
  'sunbaked-cardboard': {
    material: 'paper.brown.warm', visual: 'stoneCluster', mapColor: '#af7e42',
    biomes: ['dunes', 'scrapflats'],
  },
  'ochre-paperclay': {
    material: 'paper.brown.warm', visual: 'stoneCluster', mapColor: '#b9824f',
    biomes: ['clearing', 'meadow', 'dunes'],
  },
  'carbon-soil': {
    material: 'paper.grey', visual: 'stoneCluster', mapColor: '#4d4945',
    biomes: ['forest', 'scrapflats'],
  },
  'carbon-copy-shale': {
    material: 'paper.grey', visual: 'stoneCluster', mapColor: '#53616a',
    biomes: ['clearing', 'forest', 'dunes', 'scrapflats'],
  },
  'buttonbloom-seeds': {
    material: 'paper.rainbow', visual: 'fiberTuft', mapColor: '#d27891',
    biomes: ['clearing', 'meadow'],
  },
  'mend-me-seeds': {
    material: 'paper.green', visual: 'fiberTuft', mapColor: '#759457',
    biomes: ['clearing', 'forest', 'meadow', 'dunes', 'scrapflats'],
  },
};

export const RESOURCE_DEFS = Object.fromEntries(
  (Object.keys(RESOURCE_CORE_DEFS) as ResourceId[]).map((id) => [
    id,
    { ...RESOURCE_CORE_DEFS[id], ...RESOURCE_WORLD_DEFS[id] },
  ]),
) as Record<ResourceId, ResourceDefinition>;

export const BIOME_RESOURCES: Record<Biome, ResourceId[]> = {
  clearing: ['kraft-twigs', 'mossy-paper-fiber', 'bluefold-pebbles'],
  forest: ['kraft-twigs', 'ribbonwood-sticks', 'mossy-paper-fiber', 'graphite-cardstone'],
  meadow: ['mossy-paper-fiber', 'confetti-stones', 'bluefold-pebbles', 'kraft-twigs'],
  dunes: ['sunbaked-cardboard', 'bluefold-pebbles'],
  scrapflats: ['sunbaked-cardboard', 'graphite-cardstone', 'confetti-stones', 'ribbonwood-sticks'],
};
