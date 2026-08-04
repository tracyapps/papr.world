import { BIOME_IDS, type Biome } from './biomes';
import {
  biomesFor,
  isBiomeExclusive,
  obtainRoutesFor,
  toolRequiredFor,
  type ObtainRoute,
} from './obtaining';
import { RECIPE_DEFS, isRecipeAvailable, previousTierTool, recipeForTool, type RecipeId } from './recipes';
import { RESOURCE_CATEGORIES, RESOURCE_CORE_DEFS, type ResourceId } from './resources';
import { SEED_DEFS } from './seeds';
import { TOOL_DEFS, TOOL_FAMILIES, TOOL_FAMILY_ORDER, toolsInFamily, type ToolId } from './tools';
import { MAX_TREE_GROWTH, TREE_REGROWTH_PER_SECOND, trimProfileForTier } from './trees';

/**
 * One assembled description of everything the game currently runs on.
 *
 * This is the join, not a second copy. Every field is read out of the
 * catalogs the game itself plays by, so anything that reads this — the public
 * reference site, a critter explaining where to find something, a future
 * recipe hint — is quoting the same tables the simulation uses. There is no
 * way for it to describe a rule that is not the rule.
 *
 * Renderer-free on purpose: a plain Node build script can load it without a
 * canvas, which is what lets the documentation site regenerate on every push.
 *
 * **Nothing here is authored.** If a fact is not derivable from a catalog it
 * does not belong in this file — it belongs in the catalog first.
 */

/** Shared across the catalogs: is this in the game, or still ahead of us? */
export type ContentStatus = 'ready' | 'planned';

export type ReferenceResource = {
  id: ResourceId;
  label: string;
  shortLabel: string;
  category: string;
  categoryLabel: string;
  routes: ObtainRoute[];
  biomes: Biome[];
  exclusive: boolean;
  toolRequired: ToolId | null;
  toolRequiredLabel: string | null;
  usedIn: RecipeId[];
  status: ContentStatus;
};

export type ReferenceTool = {
  id: ToolId;
  name: string;
  description: string;
  limitation: string;
  family: string;
  familyLabel: string;
  tier: number;
  verb: string;
  recipe: RecipeId | null;
  requires: ToolId | null;
  status: ContentStatus;
};

/** Which recipes consume a material, so a page can say what it is *for*. */
function recipesUsing(resource: ResourceId): RecipeId[] {
  const category = RESOURCE_CORE_DEFS[resource].category;
  return (Object.keys(RECIPE_DEFS) as RecipeId[]).filter((recipeId) => (
    isRecipeAvailable(recipeId)
    && RECIPE_DEFS[recipeId].ingredients.some((ingredient) => (
      ingredient.kind === 'exact'
        ? ingredient.resource === resource
        : ingredient.family === category
    ))
  ));
}

export function referenceResources(): ReferenceResource[] {
  return (Object.keys(RESOURCE_CORE_DEFS) as ResourceId[]).map((id) => {
    const core = RESOURCE_CORE_DEFS[id];
    const toolRequired = toolRequiredFor(id);
    const routes = obtainRoutesFor(id);
    return {
      id,
      label: core.label,
      shortLabel: core.shortLabel,
      category: core.category,
      categoryLabel: RESOURCE_CATEGORIES[core.category].label,
      routes,
      biomes: biomesFor(id),
      exclusive: isBiomeExclusive(id),
      toolRequired,
      toolRequiredLabel: toolRequired ? TOOL_DEFS[toolRequired].name : null,
      usedIn: recipesUsing(id),
      // A material with no route is one the game defines but cannot yet
      // hand you — it belongs on the roadmap, not the materials page.
      status: routes.length > 0 || id in SEED_DEFS ? 'ready' : 'planned',
    };
  });
}

export function referenceTools(): ReferenceTool[] {
  return TOOL_FAMILY_ORDER.flatMap((family) => toolsInFamily(family).map((id): ReferenceTool => {
    const tool = TOOL_DEFS[id];
    const recipe = recipeForTool(id);
    return {
      id,
      name: tool.name,
      description: tool.description,
      limitation: tool.limitation,
      family: tool.family,
      familyLabel: TOOL_FAMILIES[tool.family].label,
      tier: tool.tier,
      verb: tool.verb,
      recipe,
      requires: previousTierTool(id),
      status: recipe && isRecipeAvailable(recipe) ? 'ready' : 'planned',
    };
  }));
}

export function referenceRecipes() {
  return (Object.keys(RECIPE_DEFS) as RecipeId[]).map((id) => {
    const recipe = RECIPE_DEFS[id];
    return {
      id,
      name: recipe.name,
      planName: recipe.planName,
      description: recipe.description,
      durationSeconds: recipe.durationSeconds,
      minimumMakerLevel: recipe.minimumMakerLevel,
      ingredients: recipe.ingredients,
      output: recipe.output,
      status: (recipe.status === 'ready' ? 'ready' : 'planned') as ContentStatus,
    };
  });
}

export function referenceBiomes() {
  const resources = referenceResources();
  return BIOME_IDS.map((id) => ({
    id,
    resources: resources.filter((resource) => resource.biomes.includes(id)).map((resource) => resource.id),
    exclusives: resources
      .filter((resource) => resource.exclusive && resource.biomes[0] === id)
      .map((resource) => resource.id),
  }));
}

/** Tuning constants worth publishing, so the numbers cannot be misquoted. */
export function referenceRules() {
  return {
    trees: {
      maxGrowth: MAX_TREE_GROWTH,
      regrowthPerSecond: TREE_REGROWTH_PER_SECOND,
      fullRecoverySeconds: MAX_TREE_GROWTH / TREE_REGROWTH_PER_SECOND,
      stages: [
        { stage: 'flourishing', from: 75, to: 100 },
        { stage: 'trimmed', from: 40, to: 74 },
        { stage: 'cropped', from: 1, to: 39 },
        { stage: 'resting', from: 0, to: 0 },
      ],
      trimByTier: [1, 2, 3].map((tier) => ({ tier, ...trimProfileForTier(tier) })),
    },
    seeds: Object.values(SEED_DEFS).map((seed) => ({
      id: seed.id,
      name: seed.name,
      spacing: seed.spacing,
      stageSeconds: [...seed.stageSeconds],
    })),
  };
}

/** The whole picture, for a build step or a debug console. */
export function gameReference() {
  return {
    generatedAt: new Date().toISOString(),
    biomes: referenceBiomes(),
    resources: referenceResources(),
    tools: referenceTools(),
    recipes: referenceRecipes(),
    rules: referenceRules(),
  };
}

export type GameReference = ReturnType<typeof gameReference>;
