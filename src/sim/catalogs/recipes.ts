import type { ResourceCategoryId, ResourceId } from './resources';
import { TOOL_DEFS, TRIM_TOOLS_READY, type ToolId } from './tools';

export type IngredientRequirement =
  | { kind: 'exact'; resource: ResourceId; quantity: number }
  | { kind: 'family'; family: ResourceCategoryId; quantity: number };

export type RecipeOutput =
  | { kind: 'item'; itemId: string; label: string }
  | { kind: 'tool'; toolId: ToolId; label: string };

export type RecipeDefinition = {
  id: string;
  name: string;
  planName: string;
  description: string;
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
    durationSeconds: 6,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 4 },
      { kind: 'family', family: 'fiber', quantity: 3 },
      { kind: 'family', family: 'stones', quantity: 2 },
    ],
    output: { kind: 'tool', toolId: 'flimsy-shovel', label: 'Flimsy Shovel' },
  },
  'creased-hoe': {
    id: 'creased-hoe',
    name: 'Creased Hoe',
    planName: 'Plan: one well-creased garden blade',
    description: 'Sows seeds, lifts plants back out, and rakes soil into an open hole.',
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
    durationSeconds: 11,
    minimumMakerLevel: 2,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 4 },
      { kind: 'exact', resource: 'graphite-cardstone', quantity: 3 },
      { kind: 'family', family: 'cardboard', quantity: 3 },
    ],
    output: { kind: 'tool', toolId: 'sturdy-scissors', label: 'Sturdy Scissors' },
  },
  'folding-hook': {
    id: 'folding-hook',
    name: 'Folding Hook',
    planName: 'Plan: hook with one suspicious bend',
    description: 'Tugs loose paper flaps and tiny drawer handles.',
    durationSeconds: 4.5,
    minimumMakerLevel: 1,
    ingredients: [
      { kind: 'family', family: 'sticks', quantity: 2 },
      { kind: 'family', family: 'fiber', quantity: 1 },
    ],
    output: { kind: 'item', itemId: 'folding-hook', label: 'Folding Hook' },
  },
  'tape-tapper': {
    id: 'tape-tapper',
    name: 'Tape Tapper',
    planName: 'Plan: sticky percussion wand',
    description: 'Pokes, stamps, and convinces stubborn tabs to behave.',
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

export const STARTER_PLAN_IDS: RecipeId[] = [
  'flimsy-shovel',
  'creased-hoe',
  'folding-hook',
  'tape-tapper',
  'crease-scout',
];

/**
 * Recipes whose tool has no world interaction yet.
 *
 * They stay in the catalog so their costs and progression are settled work,
 * but are filtered out of the plan list until `TRIM_TOOLS_READY` flips.
 * Crafting something you cannot then use is worse than not seeing it.
 */
export function isRecipeAvailable(recipeId: RecipeId): boolean {
  const output = RECIPE_DEFS[recipeId].output;
  if (output.kind !== 'tool') return true;
  if (TOOL_DEFS[output.toolId].verb === 'trim') return TRIM_TOOLS_READY;
  return true;
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
