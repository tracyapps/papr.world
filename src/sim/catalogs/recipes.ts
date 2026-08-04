import type { ResourceCategoryId, ResourceId } from './resources';
import { TOOL_DEFS, toolsInFamily, type ToolFamilyId, type ToolId } from './tools';

export type IngredientRequirement =
  | { kind: 'exact'; resource: ResourceId; quantity: number }
  | { kind: 'family'; family: ResourceCategoryId; quantity: number };

export type RecipeOutput =
  | { kind: 'item'; itemId: string; label: string }
  | { kind: 'tool'; toolId: ToolId; label: string };

/**
 * Whether a recipe is playable yet.
 *
 * One field replaces what used to be a scatter of readiness flags, so there
 * is a single answer to "can this be made?" that the Thing Maker, the
 * scrapbook, and the tool rail all read. `planned` recipes stay in the
 * catalog — their costs and artwork are settled work — but never appear
 * anywhere a player can see them.
 *
 * **Crafting something you cannot then use is worse than not seeing it.**
 */
export type RecipeStatus = 'ready' | 'planned';

export type RecipeDefinition = {
  id: string;
  name: string;
  planName: string;
  description: string;
  status: RecipeStatus;
  durationSeconds: number;
  minimumMakerLevel: number;
  ingredients: IngredientRequirement[];
  output: RecipeOutput;
};

export const RECIPE_DEFS = {
  'flimsy-shovel': {
    id: 'flimsy-shovel',
    name: 'Flimsy Shovel',
    planName: 'Plan: one optimistic folded scoop',
    description: 'Opens shallow soil layers without pretending to be indestructible.',
    status: 'ready',
    durationSeconds: 6,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 4 },
      { kind: 'family', family: 'fiber', quantity: 3 },
      { kind: 'family', family: 'stones', quantity: 2 },
    ],
    output: { kind: 'tool', toolId: 'flimsy-shovel', label: 'Flimsy Shovel' },
  },
  'okayish-shovel': {
    id: 'okayish-shovel',
    name: 'Okayish Shovel',
    planName: 'Plan: a scoop with a folded spine',
    description: 'Reaches the compact layer under a bed you have already opened.',
    status: 'ready',
    durationSeconds: 10,
    minimumMakerLevel: 2,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 5 },
      { kind: 'family', family: 'cardboard', quantity: 4 },
      { kind: 'exact', resource: 'graphite-cardstone', quantity: 2 },
    ],
    output: { kind: 'tool', toolId: 'okayish-shovel', label: 'Okayish Shovel' },
  },
  'heavy-duty-shovel': {
    id: 'heavy-duty-shovel',
    name: 'Heavy-duty Shovel',
    planName: 'Plan: layered board and a bound handle',
    description: 'Opens deep seams where the local geology has one to give.',
    status: 'ready',
    durationSeconds: 16,
    minimumMakerLevel: 3,
    ingredients: [
      { kind: 'family', family: 'cardboard', quantity: 6 },
      { kind: 'exact', resource: 'graphite-cardstone', quantity: 4 },
      { kind: 'family', family: 'stones', quantity: 4 },
      { kind: 'family', family: 'fiber', quantity: 3 },
    ],
    output: { kind: 'tool', toolId: 'heavy-duty-shovel', label: 'Heavy-duty Shovel' },
  },
  'creased-hoe': {
    id: 'creased-hoe',
    name: 'Creased Hoe',
    planName: 'Plan: one well-creased garden blade',
    description: 'Sows seeds, lifts plants back out, and rakes soil into an open hole.',
    status: 'ready',
    durationSeconds: 7,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 3 },
      { kind: 'family', family: 'cardboard', quantity: 2 },
      { kind: 'family', family: 'fiber', quantity: 2 },
    ],
    output: { kind: 'tool', toolId: 'creased-hoe', label: 'Creased Hoe' },
  },
  'kids-scissors': {
    id: 'kids-scissors',
    name: 'Kids Scissors',
    planName: 'Plan: round-tipped snippers',
    description: 'Trims renewable shoots and soft growth without hurting the tree.',
    status: 'ready',
    durationSeconds: 6,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 2 },
      { kind: 'family', family: 'stones', quantity: 3 },
      { kind: 'family', family: 'fiber', quantity: 2 },
    ],
    output: { kind: 'tool', toolId: 'kids-scissors', label: 'Kids Scissors' },
  },
  'sturdy-scissors': {
    id: 'sturdy-scissors',
    name: 'Sturdy Scissors',
    planName: 'Plan: shears with a serious hinge',
    description: 'Collects bark curls and structural branches from grown trees.',
    status: 'ready',
    durationSeconds: 11,
    minimumMakerLevel: 2,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 4 },
      { kind: 'exact', resource: 'graphite-cardstone', quantity: 3 },
      { kind: 'family', family: 'cardboard', quantity: 3 },
    ],
    output: { kind: 'tool', toolId: 'sturdy-scissors', label: 'Sturdy Scissors' },
  },
  // --- Not playable yet ----------------------------------------------------
  // Kept for their costs and artwork; hidden everywhere by `status`.
  // `folding-hook` was deleted outright — nobody could say what it did, and a
  // recipe nobody can describe is not settled work worth keeping.
  'tape-tapper': {
    id: 'tape-tapper',
    name: 'Tape Tapper',
    planName: 'Plan: sticky percussion wand',
    description: 'Pokes, stamps, and convinces stubborn tabs to behave.',
    // Waiting on tape existing as a material and a `stamp` interaction.
    status: 'planned',
    durationSeconds: 6.5,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: 'family', family: 'cardboard', quantity: 2 },
      { kind: 'family', family: 'fiber', quantity: 2 },
    ],
    output: { kind: 'item', itemId: 'tape-tapper', label: 'Tape Tapper' },
  },
  'crease-scout': {
    id: 'crease-scout',
    name: 'Crease Scout',
    planName: 'Plan: folded finder',
    description: 'Sniffs out promising seams in the paper terrain.',
    // Nothing surfaces seams yet, so this would sit inert in the scrapbook.
    // Same reasoning as the scissors before trimming landed: it comes back
    // on when it has something to find.
    status: 'planned',
    durationSeconds: 9,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: 'family', family: 'cardboard', quantity: 2 },
      { kind: 'family', family: 'fiber', quantity: 2 },
      { kind: 'family', family: 'stones', quantity: 3 },
    ],
    output: { kind: 'item', itemId: 'crease-scout', label: 'Crease Scout' },
  },
} as const satisfies Record<string, RecipeDefinition>;

export type RecipeId = keyof typeof RECIPE_DEFS;

export function isRecipeAvailable(recipeId: RecipeId): boolean {
  return RECIPE_DEFS[recipeId]?.status === 'ready';
}

/**
 * Plans you begin with: the first rung of every ladder, nothing more.
 *
 * Derived rather than listed, so adding a tool cannot leave a starter list
 * silently out of date — which is exactly how the scissors ended up
 * craftable in the catalog and invisible in the machine.
 *
 * Everything above tier 1 is a plan you have to find. Until those sources
 * exist, higher rungs show with an empty plan slot, which is the honest
 * state: you can see what it will cost and that you cannot make it yet.
 */
export const STARTER_PLAN_IDS: RecipeId[] = (Object.keys(RECIPE_DEFS) as RecipeId[])
  .filter((recipeId) => {
    const recipe = RECIPE_DEFS[recipeId];
    if (recipe.status !== 'ready' || recipe.output.kind !== 'tool') return false;
    return TOOL_DEFS[recipe.output.toolId].tier === 1;
  });

/** The recipe that makes a given tool, if one exists. */
export function recipeForTool(toolId: ToolId): RecipeId | null {
  return (Object.keys(RECIPE_DEFS) as RecipeId[]).find((recipeId) => {
    const output = RECIPE_DEFS[recipeId].output;
    return output.kind === 'tool' && output.toolId === toolId;
  }) ?? null;
}

/** A family's recipes, weakest rung first. Missing rungs are simply absent. */
export function recipesInFamily(family: ToolFamilyId): RecipeId[] {
  return toolsInFamily(family)
    .map(recipeForTool)
    .filter((recipeId): recipeId is RecipeId => recipeId !== null && isRecipeAvailable(recipeId));
}

/** Ready recipes that are not part of a tool ladder. */
export function looseRecipes(): RecipeId[] {
  return (Object.keys(RECIPE_DEFS) as RecipeId[])
    .filter((recipeId) => isRecipeAvailable(recipeId) && RECIPE_DEFS[recipeId].output.kind !== 'tool');
}

/**
 * The rung below this one, or null when this is the first.
 *
 * You climb a ladder a rung at a time. Making tier 3 without ever having held
 * tier 2 would let a lucky material find skip the part where the tool teaches
 * you what it is for.
 */
export function previousTierTool(toolId: ToolId): ToolId | null {
  const tool = TOOL_DEFS[toolId];
  const ladder = toolsInFamily(tool.family);
  const index = ladder.indexOf(toolId);
  return index > 0 ? ladder[index - 1] : null;
}

export const MAKER_UPGRADE_INGREDIENTS: Record<number, IngredientRequirement[]> = {
  2: [
    { kind: 'family', family: 'sticks', quantity: 6 },
    { kind: 'family', family: 'fiber', quantity: 4 },
    { kind: 'family', family: 'stones', quantity: 4 },
  ],
  3: [
    { kind: 'family', family: 'cardboard', quantity: 6 },
    { kind: 'exact', resource: 'graphite-cardstone', quantity: 4 },
    { kind: 'family', family: 'fiber', quantity: 5 },
  ],
};

export function getCraftDuration(recipe: RecipeDefinition, makerLevel: number) {
  return recipe.durationSeconds / (1 + Math.max(0, makerLevel - 1) * 0.38);
}
