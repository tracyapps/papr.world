import { describe, expect, it } from 'vitest';
import { BIOME_IDS } from './catalogs/biomes';
import { BIOME_SCATTER, biomesFor, isBiomeExclusive, obtainRoutesFor, toolRequiredFor } from './catalogs/obtaining';
import { RESOURCE_CORE_DEFS, type ResourceId } from './catalogs/resources';
import { DIG_TABLES } from './catalogs/geology';
import { RECIPE_DEFS, type RecipeId } from './catalogs/recipes';
import { TOOL_DEFS } from './catalogs/tools';
import { gameReference, referenceResources, referenceTools } from './catalogs/reference';

const resourceIds = Object.keys(RESOURCE_CORE_DEFS) as ResourceId[];

describe('obtaining is the single source of truth', () => {
  it('describes every material, or says plainly that it has no route', () => {
    for (const resource of resourceIds) {
      expect(Array.isArray(obtainRoutesFor(resource))).toBe(true);
    }
  });

  it('derives scatter from one table rather than two lists that can disagree', () => {
    for (const biome of BIOME_IDS) {
      for (const resource of BIOME_SCATTER[biome]) {
        const routes = obtainRoutesFor(resource);
        const scattered = routes.find((route) => route.kind === 'scattered');
        expect(scattered?.kind === 'scattered' && scattered.biomes).toContain(biome);
      }
    }
  });

  it('computes exclusivity rather than taking anyone’s word for it', () => {
    // The claim a critter makes out loud. If bark curls ever become
    // obtainable elsewhere, this flips on its own and the dialogue stops
    // saying "the only place" — which is the entire point of deriving it.
    expect(isBiomeExclusive('redwood-bark-curls')).toBe(true);
    expect(biomesFor('redwood-bark-curls')).toEqual(['forest']);
    expect(isBiomeExclusive('kraft-twigs')).toBe(false);
  });

  it('names a real tool for anything you cannot pick up by hand', () => {
    for (const resource of resourceIds) {
      const toolId = toolRequiredFor(resource);
      if (toolId) expect(toolId in TOOL_DEFS).toBe(true);
    }
    expect(toolRequiredFor('redwood-bark-curls')).toBe('sturdy-scissors');
    // Anything lying on the ground needs nothing at all.
    expect(toolRequiredFor('kraft-twigs')).toBeNull();
  });

  it('makes depth, not a stat on the tool, decide which shovel you need', () => {
    // The shovel ladder has no power number anywhere. A tier-3 material is
    // tier-3 because of where it sits in the ground; move it up a layer and
    // the required tool moves with it, here and in the reference and in
    // anything a critter says.
    const deepOnly = referenceResources()
      .filter((entry) => entry.routes.some((route) => route.kind === 'dug'))
      .filter((entry) => entry.routes.every((route) => route.kind !== 'scattered'));
    for (const entry of deepOnly) {
      const shallowest = Math.min(...entry.routes
        .filter((route): route is Extract<typeof route, { kind: 'dug' }> => route.kind === 'dug')
        .map((route) => route.layer));
      expect(entry.toolRequired && TOOL_DEFS[entry.toolRequired].tier).toBe(shallowest);
    }
  });

  it('keeps every layer of every biome stocked, so no dig is a dead end', () => {
    for (const biome of BIOME_IDS) {
      for (const layer of [1, 2, 3] as const) {
        expect(DIG_TABLES[biome][layer].length).toBeGreaterThan(0);
      }
    }
  });

  it('gives the deeper layers something the surface does not', () => {
    // A tier upgrade has to buy access to different material, not more of
    // the same. If a biome's layers ever become identical, the shovel above
    // it stops having a reason to exist.
    for (const biome of BIOME_IDS) {
      const surface = new Set(DIG_TABLES[biome][1].map((entry) => entry.resource));
      const deep = DIG_TABLES[biome][3].map((entry) => entry.resource);
      expect(deep.some((resource) => !surface.has(resource))).toBe(true);
    }
  });

  it('requires a tool that can actually do the job', () => {
    const toolId = toolRequiredFor('redwood-bark-curls');
    expect(toolId && TOOL_DEFS[toolId].verb).toBe('trim');
    expect(toolId && TOOL_DEFS[toolId].tier).toBeGreaterThanOrEqual(2);
  });
});

describe('the published reference', () => {
  it('covers every material and tool in the catalogs', () => {
    expect(referenceResources()).toHaveLength(resourceIds.length);
    expect(referenceTools()).toHaveLength(Object.keys(TOOL_DEFS).length);
  });

  it('never publishes a material as current when nothing can produce it', () => {
    for (const entry of referenceResources()) {
      if (entry.status !== 'ready') continue;
      const isSeed = entry.category === 'seeds';
      expect(entry.routes.length > 0 || isSeed).toBe(true);
    }
  });

  it('routes planned content to coming-soon rather than the live pages', () => {
    const planned = gameReference().recipes.filter((recipe) => recipe.status !== 'ready');
    for (const recipe of planned) {
      expect(RECIPE_DEFS[recipe.id as RecipeId].status).toBe('planned');
    }
    // Guards the roadmap split: anything ready in the catalog must be
    // published as ready, so nothing playable hides on Coming Soon.
    for (const recipe of gameReference().recipes.filter((entry) => entry.status === 'ready')) {
      expect(RECIPE_DEFS[recipe.id as RecipeId].status).toBe('ready');
    }
  });

  it('quotes tool names from the catalog, so a rename carries everywhere', () => {
    for (const tool of referenceTools()) {
      expect(tool.name).toBe(TOOL_DEFS[tool.id].name);
      expect(tool.tier).toBe(TOOL_DEFS[tool.id].tier);
    }
  });

  it('assembles without throwing on any catalog shape', () => {
    const reference = gameReference();
    expect(reference.biomes).toHaveLength(BIOME_IDS.length);
    expect(reference.rules.trees.fullRecoverySeconds).toBeGreaterThan(0);
  });
});
