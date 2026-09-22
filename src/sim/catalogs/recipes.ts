import type { ResourceCategoryId, ResourceId } from './resources';
import type { BuildPieceKey } from '../../world/buildPieces';
import type { AbilityId } from './abilities';
import { TOOL_DEFS, toolsInFamily, type ToolFamilyId, type ToolId } from './tools';

export type IngredientRequirement =
  | { kind: 'exact'; resource: ResourceId; quantity: number }
  | { kind: 'family'; family: ResourceCategoryId; quantity: number };

export type RecipeOutput =
  | { kind: 'item'; itemId: string; label: string }
  | { kind: 'tool'; toolId: ToolId; label: string }
  // A plan for a piece put together in place with a hammer (its steps,
  // materials and hammer tier live in `BUILD_ASSEMBLY_DEFS`), not something
  // the Thing Maker crafts. It is a recipe so the plan is knowledge like any
  // other: learned from a tree node, kept in `player.plans`, carried by the
  // account tech store. `isCraftableRecipe` keeps it out of every crafting
  // surface, and `buildPlanForPiece` is how the build code finds it.
  | { kind: 'build-piece'; templateKey: BuildPieceKey; label: string }
  // Know-how: a plan that switches a rule on instead of making a thing (see
  // `abilities.ts`). Same plumbing as a build-piece plan — learned from a
  // tree node, kept in `player.plans` — and equally never craftable.
  | { kind: 'ability'; abilityId: AbilityId; label: string };

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
  'tending-hoe': {
    id: 'tending-hoe',
    name: 'Tending Hoe',
    planName: 'Plan: a braced blade for taller beds',
    planSource: 'knowledge-tree',
    description: 'Shapes taller garden beds while keeping all the basic hoe’s planting and mending work.',
    status: 'ready',
    durationSeconds: 11,
    minimumMakerLevel: 2,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 5 },
      { kind: 'family', family: 'cardboard', quantity: 4 },
      { kind: 'exact', resource: 'binding-cord', quantity: 1 },
    ],
    output: { kind: 'tool', toolId: 'tending-hoe', label: 'Tending Hoe' },
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
  spork: {
    id: 'spork',
    name: 'Spork',
    planName: 'Plan: a bent spork, pressed into service',
    planSource: 'starter',
    description: 'Works renewable surface rock formations without changing the shape of the land.',
    status: 'ready',
    durationSeconds: 7,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 3 },
      { kind: 'family', family: 'stones', quantity: 3 },
      { kind: 'family', family: 'fiber', quantity: 2 },
    ],
    output: { kind: 'tool', toolId: 'spork', label: 'Spork' },
  },
  'basic-pickaxe': {
    id: 'basic-pickaxe',
    name: 'Basic Pickaxe',
    planName: 'Plan: a proper folded pick head',
    planSource: 'knowledge-tree',
    description: 'A steadier pick for the same renewable surface rock.',
    status: 'ready',
    durationSeconds: 10,
    minimumMakerLevel: 2,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 5 },
      { kind: 'family', family: 'stones', quantity: 4 },
      { kind: 'family', family: 'fiber', quantity: 3 },
    ],
    output: { kind: 'tool', toolId: 'basic-pickaxe', label: 'Basic Pickaxe' },
  },
  'heavyduty-pickaxe': {
    id: 'heavyduty-pickaxe',
    name: 'Heavy-duty Pickaxe',
    planName: 'Plan: a double head and a bound handle',
    planSource: 'knowledge-tree',
    description: 'The current top rung for renewable surface mining.',
    status: 'ready',
    durationSeconds: 16,
    minimumMakerLevel: 3,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 6 },
      { kind: 'family', family: 'stones', quantity: 6 },
      { kind: 'exact', resource: 'graphite-cardstone', quantity: 3 },
      { kind: 'family', family: 'fiber', quantity: 4 },
    ],
    output: { kind: 'tool', toolId: 'heavyduty-pickaxe', label: 'Heavy-duty Pickaxe' },
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
  // --- Build-piece plans ----------------------------------------------------
  // Knowing how to put a piece together. Never crafted: `ingredients` is empty
  // and `durationSeconds` is unused because the build steps own both. Each is
  // taught by a different ready node (see techTree.ts) rather than bundled.
  'garden-arbor': {
    id: 'garden-arbor',
    name: 'Garden Arbor',
    planName: 'Plan: two posts and a folded top, bound together',
    planSource: 'knowledge-tree',
    description: 'An arch for climbing plants, built in place from posts, a folded top, and a binding.',
    status: 'ready',
    durationSeconds: 0,
    minimumMakerLevel: 1,
    ingredients: [],
    output: { kind: 'build-piece', templateKey: 'garden-arbor', label: 'Garden Arbor' },
  },
  'picnic-table': {
    id: 'picnic-table',
    name: 'Picnic Table',
    planName: 'Plan: a flat top, two benches, and a very good knot',
    planSource: 'knowledge-tree',
    description: 'A table with benches, built in place for as many people as the meadow will hold.',
    status: 'ready',
    durationSeconds: 0,
    minimumMakerLevel: 1,
    ingredients: [],
    output: { kind: 'build-piece', templateKey: 'picnic-table', label: 'Picnic Table' },
  },
  'display-case': {
    id: 'display-case',
    name: 'Display Case',
    planName: 'Plan: a frame, a clear front, and a shelf worth looking at',
    planSource: 'knowledge-tree',
    description: 'A glass-fronted case, built in place. Show keepsakes in it, or stock it for neighbors to take.',
    status: 'ready',
    durationSeconds: 0,
    minimumMakerLevel: 1,
    ingredients: [],
    output: { kind: 'build-piece', templateKey: 'display-case', label: 'Display Case' },
  },
  'footbridge': {
    id: 'footbridge',
    name: 'Footbridge',
    planName: 'Plan: supports, a deck, and rails that mean it',
    planSource: 'knowledge-tree',
    description: 'A walkable arch over a stream or pond, built in place from supports, a deck, and rails.',
    status: 'ready',
    durationSeconds: 0,
    minimumMakerLevel: 1,
    ingredients: [],
    output: { kind: 'build-piece', templateKey: 'footbridge', label: 'Footbridge' },
  },
  // Know-how plans: taught by a tree node like any other plan, but they switch
  // a rule on rather than make anything. `abilityPlanId` and `hasAbility` are
  // how the game checks them.
  'shallow-water-planting': {
    id: 'shallow-water-planting',
    name: 'Shallow-Water Planting',
    planName: 'Know-how: how a root holds in still water',
    planSource: 'knowledge-tree',
    description: 'Lotus and marsh reeds take root straight in shallow water, with no bed dug first.',
    status: 'ready',
    durationSeconds: 0,
    minimumMakerLevel: 1,
    ingredients: [],
    output: { kind: 'ability', abilityId: 'shallow-water-planting', label: 'Shallow-Water Planting' },
  },
  // The Wood Mill's later trades (see millRefining.ts `requiresAbility`).
  'finer-refining': {
    id: 'finer-refining',
    name: 'Finer Refining',
    planName: 'Know-how: the big press, and what to feed it',
    planSource: 'knowledge-tree',
    description: 'Chisel presses bound lumber into layerboard and packs terracotta into red brick.',
    status: 'ready',
    durationSeconds: 0,
    minimumMakerLevel: 1,
    ingredients: [],
    output: { kind: 'ability', abilityId: 'finer-refining', label: 'Finer Refining' },
  },
  'heavy-refining': {
    id: 'heavy-refining',
    name: 'Heavy Refining',
    planName: 'Know-how: crossgrain, facing, and what a floor has to carry',
    planSource: 'knowledge-tree',
    description: 'Chisel cross-binds layerboard into structural timber and faces brick into masonry.',
    status: 'ready',
    durationSeconds: 0,
    minimumMakerLevel: 1,
    ingredients: [],
    output: { kind: 'ability', abilityId: 'heavy-refining', label: 'Heavy Refining' },
  },
  // What a home's parts wait on (see catalogs/dwellings.ts).
  'house-floors': {
    id: 'house-floors',
    name: 'House Floors',
    planName: 'Know-how: what a floor is laid on',
    planSource: 'knowledge-tree',
    description: 'Lay a real floor under your home, in place of bare ground.',
    status: 'ready',
    durationSeconds: 0,
    minimumMakerLevel: 1,
    ingredients: [],
    output: { kind: 'ability', abilityId: 'house-floors', label: 'House Floors' },
  },
  'house-walls': {
    id: 'house-walls',
    name: 'House Walls',
    planName: 'Know-how: walls that stand up on their own',
    planSource: 'knowledge-tree',
    description: 'Raise walls around your floor.',
    status: 'ready',
    durationSeconds: 0,
    minimumMakerLevel: 1,
    ingredients: [],
    output: { kind: 'ability', abilityId: 'house-walls', label: 'House Walls' },
  },
  'house-roofs': {
    id: 'house-roofs',
    name: 'House Roofs',
    planName: 'Know-how: a roof that sheds the rain',
    planSource: 'knowledge-tree',
    description: 'Put a proper roof on your home, in place of the tent roof.',
    status: 'ready',
    durationSeconds: 0,
    minimumMakerLevel: 1,
    ingredients: [],
    output: { kind: 'ability', abilityId: 'house-roofs', label: 'House Roofs' },
  },
  'house-stairs': {
    id: 'house-stairs',
    name: 'Stairs and Upper Floors',
    planName: 'Know-how: carrying a floor up in the air',
    planSource: 'knowledge-tree',
    description: 'Build a stair and a second storey.',
    status: 'ready',
    durationSeconds: 0,
    minimumMakerLevel: 1,
    ingredients: [],
    output: { kind: 'ability', abilityId: 'house-stairs', label: 'Stairs and Upper Floors' },
  },
  'house-rooms': {
    id: 'house-rooms',
    name: 'Extra Rooms',
    planName: 'Know-how: one house, more than one room',
    planSource: 'knowledge-tree',
    description: 'Add more rooms to your home.',
    status: 'ready',
    durationSeconds: 0,
    minimumMakerLevel: 1,
    ingredients: [],
    output: { kind: 'ability', abilityId: 'house-rooms', label: 'Extra Rooms' },
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
 * A plan that is knowledge and nothing else: a build piece (put up in place)
 * or an ability (a rule switched on). Knowing it is the whole of what it is.
 */
export type KnowledgeOutput = Extract<RecipeOutput, { kind: 'build-piece' | 'ability' }>;
export function isKnowledgeOutput(output: RecipeOutput): output is KnowledgeOutput {
  return output.kind === 'build-piece' || output.kind === 'ability';
}

/**
 * Whether the Thing Maker can actually make this. A knowledge-only plan is
 * known, not crafted, so it is available without being craftable — every
 * crafting surface asks this rather than `isRecipeAvailable` alone.
 */
export function isCraftableRecipe(recipeId: RecipeId): boolean {
  const recipe = RECIPE_DEFS[recipeId];
  return recipe?.status === 'ready' && !isKnowledgeOutput(recipe.output);
}

/** The plan that teaches an ability. */
export function abilityPlanId(abilityId: AbilityId): RecipeId | null {
  return (Object.keys(RECIPE_DEFS) as RecipeId[]).find((recipeId) => {
    const output = RECIPE_DEFS[recipeId].output;
    return output.kind === 'ability' && output.abilityId === abilityId;
  }) ?? null;
}

/**
 * Whether the player has learned an ability. Takes the plan list rather than
 * game state so the catalog stays free of the state module.
 */
export function hasAbility(plans: readonly string[], abilityId: AbilityId): boolean {
  const planId = abilityPlanId(abilityId);
  return planId !== null && plans.includes(planId);
}

/** The plan a build piece needs, or null for pieces anyone can build. */
export function buildPlanForPiece(templateKey: string): RecipeId | null {
  return (Object.keys(RECIPE_DEFS) as RecipeId[]).find((recipeId) => {
    const output = RECIPE_DEFS[recipeId].output;
    return output.kind === 'build-piece' && output.templateKey === templateKey;
  }) ?? null;
}

/**
 * The plan still standing between this player and starting a piece, or null
 * when they can. Takes the plan list rather than game state so the catalog
 * stays free of the state module.
 */
export function unlearnedBuildPlan(plans: readonly string[], templateKey: string): RecipeId | null {
  const planId = buildPlanForPiece(templateKey);
  return planId && !plans.includes(planId) ? planId : null;
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
    .filter((recipeId) => isCraftableRecipe(recipeId) && RECIPE_DEFS[recipeId].output.kind !== 'tool');
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
