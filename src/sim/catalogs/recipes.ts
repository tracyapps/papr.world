import type { ResourceCategoryId, ResourceId } from './resources';
import { TOOL_DEFS, toolsInFamily, type ToolFamilyId, type ToolId } from './tools';

export type IngredientRequirement =
  | { kind: 'exact'; resource: ResourceId; quantity: number }
  | { kind: 'family'; family: ResourceCategoryId; quantity: number };

export type RecipeOutput =
  | { kind: 'item'; itemId: string; label: string }
  | { kind: 'tool'; toolId: ToolId; label: string }
  // A recipe that hands back raw material rather than a tool or a one-off
  // item — grants into `player.inventory`, stacks like anything gathered
  // in the world. This is how multi-step "refined" materials work: gather
  // → craft → the result sits in the scrapbook as its own resource, usable
  // as an ingredient in later recipes just like anything foraged.
  | { kind: 'resource'; resource: ResourceId; quantity: number; label: string };

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
export type PlanSource = 'starter' | 'knowledge-tree';

export type RecipeDefinition = {
  id: string;
  name: string;
  planName: string;
  /** The one route allowed to grant this plan. */
  planSource: PlanSource;
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
    planSource: 'starter',
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
    planSource: 'knowledge-tree',
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
    planSource: 'knowledge-tree',
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
    name: 'Basic Garden Hoe',
    planName: 'Plan: one well-creased garden blade',
    planSource: 'starter',
    description: 'Sows seeds, lifts plants back out, and rakes soil into an open hole.',
    status: 'ready',
    durationSeconds: 7,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 3 },
      { kind: 'family', family: 'cardboard', quantity: 2 },
      { kind: 'family', family: 'fiber', quantity: 2 },
    ],
    output: { kind: 'tool', toolId: 'creased-hoe', label: 'Basic Garden Hoe' },
  },
  'kids-scissors': {
    id: 'kids-scissors',
    name: "Kid's Scissors",
    planName: 'Plan: round-tipped snippers',
    planSource: 'starter',
    description: 'Trims renewable shoots and soft growth without hurting the tree.',
    status: 'ready',
    durationSeconds: 6,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 2 },
      { kind: 'family', family: 'stones', quantity: 3 },
      { kind: 'family', family: 'fiber', quantity: 2 },
    ],
    output: { kind: 'tool', toolId: 'kids-scissors', label: "Kid's Scissors" },
  },
  'sturdy-scissors': {
    id: 'sturdy-scissors',
    name: 'Sturdy Scissors',
    planName: 'Plan: shears with a serious hinge',
    planSource: 'knowledge-tree',
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
  'squeaky-hammer': {
    id: 'squeaky-hammer',
    name: 'Squeaky Hammer',
    planName: 'Plan: a hammer with a very confident squeak',
    planSource: 'starter',
    description: 'Places the small build pieces you already know how to assemble.',
    status: 'ready',
    durationSeconds: 6,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 3 },
      { kind: 'family', family: 'cardboard', quantity: 2 },
      { kind: 'family', family: 'fiber', quantity: 2 },
    ],
    output: { kind: 'tool', toolId: 'squeaky-hammer', label: 'Squeaky Hammer' },
  },
  'basic-mallet': {
    id: 'basic-mallet',
    name: 'Basic Mallet',
    planName: 'Plan: a broad head for stubborn folds',
    planSource: 'knowledge-tree',
    description: 'A steadier mallet for the next scale of paper construction.',
    status: 'ready',
    durationSeconds: 10,
    minimumMakerLevel: 2,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 5 },
      { kind: 'family', family: 'cardboard', quantity: 4 },
      { kind: 'family', family: 'fiber', quantity: 3 },
    ],
    output: { kind: 'tool', toolId: 'basic-mallet', label: 'Basic Mallet' },
  },
  'standard-hammer': {
    id: 'standard-hammer',
    name: 'Standard Hammer',
    planName: 'Plan: a proper head, claw, and bound handle',
    planSource: 'knowledge-tree',
    description: 'The current top rung for careful assembly and future disassembly work.',
    status: 'ready',
    durationSeconds: 16,
    minimumMakerLevel: 3,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 6 },
      { kind: 'family', family: 'cardboard', quantity: 6 },
      { kind: 'exact', resource: 'graphite-cardstone', quantity: 3 },
      { kind: 'family', family: 'fiber', quantity: 4 },
    ],
    output: { kind: 'tool', toolId: 'standard-hammer', label: 'Standard Hammer' },
  },
  // --- Refined materials ----------------------------------------------------
  // Output is a resource, not a tool or item — see the `resource` variant of
  // `RecipeOutput` above. First entry in what should grow into its own
  // multi-step-materials tier (twigs + bark curls -> lumber; more later).
  'bound-lumber': {
    id: 'bound-lumber',
    name: 'Bound Lumber',
    planName: 'Plan: twigs and bark, bound and squared',
    planSource: 'starter',
    description: 'Twigs and bark curls, bundled and pressed flat into a sturdier building material.',
    status: 'ready',
    durationSeconds: 8,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: 'exact', resource: 'kraft-twigs', quantity: 4 },
      { kind: 'exact', resource: 'redwood-bark-curls', quantity: 2 },
    ],
    output: { kind: 'resource', resource: 'bound-lumber', quantity: 2, label: 'Bound Lumber' },
  },
  // --- Not playable yet ----------------------------------------------------
  // Kept for their costs and artwork; hidden everywhere by `status`.
  // `folding-hook` was deleted outright — nobody could say what it did, and a
  // recipe nobody can describe is not settled work worth keeping.
  'tape-tapper': {
    id: 'tape-tapper',
    name: 'Tape Tapper',
    planName: 'Plan: sticky percussion wand',
    planSource: 'knowledge-tree',
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
    planSource: 'knowledge-tree',
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
 * Plans you begin with: the explicitly authored starter set, nothing more.
 *
 * The source lives on each recipe so a future furniture or structure plan
 * cannot quietly bypass progression. Anything not in the starter set is
 * learned from an appropriately placed knowledge-tree node.
 */
export const STARTER_PLAN_IDS: RecipeId[] = (Object.keys(RECIPE_DEFS) as RecipeId[])
  .filter((recipeId) => isRecipeAvailable(recipeId) && RECIPE_DEFS[recipeId].planSource === 'starter');

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
