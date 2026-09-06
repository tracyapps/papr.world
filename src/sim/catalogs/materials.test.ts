import { describe, expect, it } from 'vitest';
import {
  MATERIAL_TAG_IDS,
  PROCESS_STAGE_IDS,
  STRUCTURAL_CLASS_IDS,
  type MaterialTag,
} from './materials';
import {
  RESOURCE_CATEGORIES,
  RESOURCE_CORE_DEFS,
  RESOURCE_IDS,
  resourcesWithTag,
  type ResourceId,
} from './resources';
import { obtainRoutesFor } from './obtaining';
import { RECIPE_DEFS, type RecipeId } from './recipes';

const recipeIds = Object.keys(RECIPE_DEFS) as RecipeId[];

/**
 * The catalog validation the materials design asks for.
 *
 * Its job is to make a whole class of quiet mistake loud: a material with no
 * way to get it, a tag nothing carries, a recipe that consumes something more
 * worked than what it produces, two recipes fighting over one output, a chain
 * that eats its own tail. None of these break a build or fail a render — they
 * just make the world subtly wrong, months later, in a way that is expensive
 * to trace back.
 */

describe('every material is described along the same axes', () => {
  it('gives each resource a valid processing stage and structural class', () => {
    for (const id of RESOURCE_IDS) {
      const def = RESOURCE_CORE_DEFS[id];
      expect(PROCESS_STAGE_IDS, `${id} processStage`).toContain(def.processStage);
      expect(STRUCTURAL_CLASS_IDS, `${id} structuralClass`).toContain(def.structuralClass);
    }
  });

  it('gives each resource at least one tag, all from the controlled vocabulary', () => {
    for (const id of RESOURCE_IDS) {
      const tags = RESOURCE_CORE_DEFS[id].tags;
      expect(tags.length, `${id} has no tags`).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(MATERIAL_TAG_IDS, `${id} carries unknown tag ${tag}`).toContain(tag);
      }
      expect(new Set(tags).size, `${id} repeats a tag`).toBe(tags.length);
    }
  });

  it('keeps no tag in the vocabulary that nothing carries', () => {
    for (const tag of MATERIAL_TAG_IDS) {
      expect(resourcesWithTag(tag).length, `nothing is tagged ${tag}`).toBeGreaterThan(0);
    }
  });

  it('files every resource under a real category', () => {
    for (const id of RESOURCE_IDS) {
      expect(Object.keys(RESOURCE_CATEGORIES)).toContain(RESOURCE_CORE_DEFS[id].category);
    }
  });
});

/** What a recipe can produce as a material, and at what stage. */
function craftedOutputs(): Map<ResourceId, RecipeId[]> {
  const byResource = new Map<ResourceId, RecipeId[]>();
  for (const recipeId of recipeIds) {
    const output = RECIPE_DEFS[recipeId].output;
    if (output.kind !== 'resource') continue;
    const existing = byResource.get(output.resource) ?? [];
    byResource.set(output.resource, [...existing, recipeId]);
  }
  return byResource;
}

/**
 * The worst-case stage a recipe's ingredients can reach — a `family`
 * ingredient accepts anything in that category, so the check has to assume
 * the most-worked member of it.
 */
function highestInputStage(recipeId: RecipeId): number {
  let highest = -1;
  for (const ingredient of RECIPE_DEFS[recipeId].ingredients) {
    if (ingredient.kind === 'exact') {
      highest = Math.max(highest, RESOURCE_CORE_DEFS[ingredient.resource].processStage);
      continue;
    }
    for (const id of RESOURCE_IDS) {
      if (RESOURCE_CORE_DEFS[id].category !== ingredient.family) continue;
      highest = Math.max(highest, RESOURCE_CORE_DEFS[id].processStage);
    }
  }
  return highest;
}

describe('the recipe graph cannot contradict the material catalog', () => {
  it('names only resources that exist, on both sides of every recipe', () => {
    for (const recipeId of recipeIds) {
      const recipe = RECIPE_DEFS[recipeId];
      for (const ingredient of recipe.ingredients) {
        if (ingredient.kind === 'exact') {
          expect(RESOURCE_IDS, `${recipeId} wants missing resource`).toContain(ingredient.resource);
        } else {
          expect(Object.keys(RESOURCE_CATEGORIES), `${recipeId} wants missing family`).toContain(ingredient.family);
        }
      }
      if (recipe.output.kind === 'resource') {
        expect(RESOURCE_IDS, `${recipeId} outputs missing resource`).toContain(recipe.output.resource);
      }
    }
  });

  it('never produces something less worked than what it consumed', () => {
    for (const recipeId of recipeIds) {
      const output = RECIPE_DEFS[recipeId].output;
      if (output.kind !== 'resource') continue;
      const outputStage = RESOURCE_CORE_DEFS[output.resource].processStage;
      expect(
        outputStage,
        `${recipeId} produces stage ${outputStage} from stage ${highestInputStage(recipeId)} inputs`,
      ).toBeGreaterThan(highestInputStage(recipeId));
    }
  });

  it('lets only one playable recipe claim a given material', () => {
    for (const [resource, recipes] of craftedOutputs()) {
      const ready = recipes.filter((id) => RECIPE_DEFS[id].status === 'ready');
      expect(ready.length, `${resource} is claimed by ${ready.join(', ')}`).toBeLessThanOrEqual(1);
    }
  });

  it('has no chain that eventually makes one of its own ingredients', () => {
    const madeBy = craftedOutputs();
    const inputsOf = (resource: ResourceId): ResourceId[] => {
      const sources: ResourceId[] = [];
      for (const recipeId of madeBy.get(resource) ?? []) {
        for (const ingredient of RECIPE_DEFS[recipeId].ingredients) {
          if (ingredient.kind === 'exact') {
            sources.push(ingredient.resource);
            continue;
          }
          sources.push(...RESOURCE_IDS.filter((id) => RESOURCE_CORE_DEFS[id].category === ingredient.family));
        }
      }
      return sources;
    };

    const walk = (resource: ResourceId, seen: ResourceId[]): void => {
      if (seen.includes(resource)) {
        throw new Error(`recipe cycle: ${[...seen, resource].join(' → ')}`);
      }
      for (const input of inputsOf(resource)) walk(input, [...seen, resource]);
    };

    for (const resource of madeBy.keys()) expect(() => walk(resource, [])).not.toThrow();
  });
});

/** Routes that hand you the material as the world made it, not as a shop or workshop did. */
function worldRoutes(resource: ResourceId) {
  return obtainRoutesFor(resource).filter((route) => route.kind !== 'crafted' && route.kind !== 'bought');
}

describe('no material exists without a way to get it', () => {
  it('can say out loud how every single resource is obtained', () => {
    for (const id of RESOURCE_IDS) {
      expect(obtainRoutesFor(id).length, `${id} cannot be obtained any way at all`).toBeGreaterThan(0);
    }
  });

  it('keeps raw materials raw: anything the world hands you directly is stage 0', () => {
    for (const id of RESOURCE_IDS) {
      if (worldRoutes(id).length === 0) continue;
      expect(
        RESOURCE_CORE_DEFS[id].processStage,
        `${id} is found in the world but claims to be worked`,
      ).toBe(0);
    }
  });

  it('keeps crafted-only materials out of stage 0', () => {
    const madeBy = craftedOutputs();
    for (const id of madeBy.keys()) {
      if (worldRoutes(id).length > 0) continue;
      expect(
        RESOURCE_CORE_DEFS[id].processStage,
        `${id} is only ever crafted but sits at stage 0`,
      ).toBeGreaterThan(0);
    }
  });
});
