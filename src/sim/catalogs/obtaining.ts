import { BIOME_IDS, type Biome } from './biomes';
import { DIG_TABLES } from './geology';
import { RESOURCE_CORE_DEFS, type ResourceId } from './resources';
import { TOOL_DEFS, toolsInFamily, type ToolId } from './tools';
import { SPECIES_YIELD, type TreeSpecies } from './trees';

/**
 * How every material in the game can be got — the one table that answers
 * "how do I get this?".
 *
 * Before this existed the answer was spread across four places that did not
 * know about each other: `BIOME_RESOURCES` (what scatters), the dig tables
 * (what digging turns up), `SPECIES_YIELD` (what trimming gives), and a
 * `biomes` field on each resource that had quietly acquired two different
 * meanings. Nothing could answer the question, so nothing could *say* the
 * answer — not a critter, not a reference page, not a recipe hint.
 *
 * Everything downstream is derived from here rather than restated:
 * `BIOME_RESOURCES` is generated, the dig and trim routes are read back out
 * of the tables that actually run, and the reference site and dialogue both
 * quote this. A material cannot be described as obtainable somewhere the
 * game does not actually give it, because there is no second place to say so.
 */

export type ObtainRoute =
  /** Lies loose on the ground and can be picked up by hand. */
  | { kind: 'scattered'; biomes: Biome[] }
  /** Turned up by digging. `layer` is the shovel tier that reaches it. */
  | { kind: 'dug'; biomes: Biome[]; layer: 1 | 2 | 3 }
  /** Cut from a living tree. */
  | { kind: 'trimmed'; species: TreeSpecies; minimumTier: 1 | 2 | 3 }
  /** Grown in a garden bed. */
  | { kind: 'grown'; from: ResourceId }
  /** Made at the Thing Maker. */
  | { kind: 'crafted' };

/**
 * Where loose piles of each material generate.
 *
 * The only hand-authored part of obtaining, because scattering is a design
 * decision rather than a consequence of another system. A material absent
 * here simply never lies on the ground — which is what makes
 * `redwood-bark-curls` exclusive to a redwood and a pair of sturdy shears.
 */
const SCATTERED_IN: Partial<Record<ResourceId, Biome[]>> = {
  'kraft-twigs': ['clearing', 'forest', 'meadow'],
  'ribbonwood-sticks': ['forest', 'scrapflats'],
  'mossy-paper-fiber': ['clearing', 'forest', 'meadow'],
  'confetti-stones': ['meadow', 'scrapflats'],
  'graphite-cardstone': ['forest', 'scrapflats'],
  // Desert stone got its own identity rather than sharing meadow's aqua
  // pebbles — a material should visually remember where it came from.
  'bluefold-pebbles': ['meadow'],
  'terracotta-pebbles': ['dunes'],
  'sunbaked-cardboard': ['dunes', 'scrapflats'],
  // Seed packets lie about near the kind of ground they want to grow in —
  // the farm finds the player almost as often as the player finds the farm.
  'raspberry-bush-seeds': ['clearing', 'meadow'],
  'crinkle-carrot-seeds': ['clearing', 'meadow'],
  'ribbon-corn-seeds': ['meadow', 'scrapflats'],
  'folded-cabbage-seeds': ['clearing', 'forest'],
  'paper-tomato-seeds': ['meadow', 'dunes'],
};

/** Seeds you can gather from a plant you grew. */
const GROWN_FROM: Partial<Record<ResourceId, ResourceId>> = {
  'buttonbloom-seeds': 'buttonbloom-seeds',
  'raspberries': 'raspberry-bush-seeds',
  'crinkle-carrots': 'crinkle-carrot-seeds',
  'ribbon-corn': 'ribbon-corn-seeds',
  'folded-cabbage': 'folded-cabbage-seeds',
  'paper-tomato': 'paper-tomato-seeds',
};

const DIG_LAYERS: Array<1 | 2 | 3> = [1, 2, 3];

/**
 * Where and how deep a material can be dug, read from the live tables.
 *
 * Grouped by layer because that *is* the shovel ladder: the shallowest layer
 * holding a material is the weakest shovel that can reach it. Nothing about
 * tool strength is asserted anywhere — it falls out of where the material
 * sits in the ground, which is the whole point of the depth model.
 */
function dugRoutes(resource: ResourceId): Array<{ layer: 1 | 2 | 3; biomes: Biome[] }> {
  return DIG_LAYERS
    .map((layer) => ({
      layer,
      biomes: BIOME_IDS.filter((biome) => DIG_TABLES[biome][layer].some((entry) => entry.resource === resource)),
    }))
    .filter((route) => route.biomes.length > 0);
}

/** The lowest tool tier in a family that can perform a job at all. */
function lowestTierFor(species: TreeSpecies): 1 | 2 | 3 {
  const scissors = toolsInFamily('scissors');
  const usable = scissors.find((toolId) => species !== 'redwood' || TOOL_DEFS[toolId].tier >= 2);
  return usable ? TOOL_DEFS[usable].tier : 1;
}

/** Every way a material can be obtained, derived from the live tables. */
export function obtainRoutesFor(resource: ResourceId): ObtainRoute[] {
  const routes: ObtainRoute[] = [];

  const scattered = SCATTERED_IN[resource];
  if (scattered?.length) routes.push({ kind: 'scattered', biomes: [...scattered] });

  for (const dug of dugRoutes(resource)) {
    routes.push({ kind: 'dug', biomes: dug.biomes, layer: dug.layer });
  }

  for (const species of Object.keys(SPECIES_YIELD) as TreeSpecies[]) {
    const table = SPECIES_YIELD[species];
    const gives = table.primary === resource || table.secondary === resource || table.variety === resource;
    if (gives) routes.push({ kind: 'trimmed', species, minimumTier: lowestTierFor(species) });
  }

  const grown = GROWN_FROM[resource];
  if (grown) routes.push({ kind: 'grown', from: grown });

  return routes;
}

/**
 * Loose-pile contents per biome, derived rather than maintained.
 *
 * This used to be a second hand-written list beside `SCATTERED_IN`, which
 * meant the two could disagree and nothing would notice.
 */
export const BIOME_SCATTER: Record<Biome, ResourceId[]> = Object.fromEntries(
  BIOME_IDS.map((biome) => [
    biome,
    (Object.keys(RESOURCE_CORE_DEFS) as ResourceId[])
      .filter((resource) => SCATTERED_IN[resource]?.includes(biome)),
  ]),
) as Record<Biome, ResourceId[]>;

/**
 * Biomes a material can be obtained in at all, across every route.
 *
 * A material whose answer is exactly one biome is *exclusive* to it — which
 * is how a critter knows to say "it's the only place you'll find it" without
 * anyone asserting that in prose.
 */
export function biomesFor(resource: ResourceId): Biome[] {
  const found = new Set<Biome>();
  for (const route of obtainRoutesFor(resource)) {
    if (route.kind === 'scattered' || route.kind === 'dug') {
      for (const biome of route.biomes) found.add(biome);
    }
    if (route.kind === 'trimmed') {
      // Redwoods only grow in forest; other trees are broader.
      if (route.species === 'redwood') found.add('forest');
      else for (const biome of ['clearing', 'forest', 'meadow'] as Biome[]) found.add(biome);
    }
  }
  return BIOME_IDS.filter((biome) => found.has(biome));
}

export function isBiomeExclusive(resource: ResourceId): boolean {
  return biomesFor(resource).length === 1;
}

/** The tool a material needs, or null when hands are enough. */
export function toolRequiredFor(resource: ResourceId): ToolId | null {
  const routes = obtainRoutesFor(resource);
  // Anything you can simply pick up needs nothing.
  if (routes.some((route) => route.kind === 'scattered')) return null;

  const trimmed = routes.find((route) => route.kind === 'trimmed');
  if (trimmed?.kind === 'trimmed') {
    return toolsInFamily('scissors').find((toolId) => TOOL_DEFS[toolId].tier >= trimmed.minimumTier) ?? null;
  }
  // The *shallowest* layer holding it decides the shovel. A material that
  // also appears in a deep seam should not demand the deep-seam shovel.
  const shallowest = routes
    .filter((route): route is Extract<ObtainRoute, { kind: 'dug' }> => route.kind === 'dug')
    .sort((a, b) => a.layer - b.layer)[0];
  if (shallowest) {
    return toolsInFamily('shovel').find((toolId) => TOOL_DEFS[toolId].tier >= shallowest.layer) ?? null;
  }
  return null;
}
