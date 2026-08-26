import type { GameState } from '../state';
import { toolRequiredFor } from './obtaining';
import { RECIPE_DEFS, type RecipeId } from './recipes';
import { RESOURCE_CORE_DEFS, type ResourceId } from './resources';
import { TOOL_DEFS, type ToolId } from './tools';

/**
 * The knowledge tree — Phase 1.1 of `docs/roadmap.md`, designed in
 * `docs/knowledge-tree.md`.
 *
 * A node is a **skill**, not a recipe, and it is a **map of what exists**,
 * not a new progression currency. This catalog is the tree's own shape only:
 * node ids, prerequisite edges, an approximate real-world learning duration,
 * a finite task list, and what the node grants. Everything else —
 * ingredient lists, tool tiers, which materials a tool reaches — is
 * referenced by id into the catalogs that already know it.
 *
 * --- Branches, and two kinds of node -------------------------------------
 *
 * 2026-08-07: the tree grew from 3 branches tied 1:1 to the tool ladder into
 * 7 branches sketched from a design brainstorm — cooking, fine arts and
 * textiles, building and construction, transportation, and more — most of
 * which have no game system behind them yet. (An intermediate pass briefly
 * had 10; a follow-up mockup merged fiber arts with art & design, and
 * folded woodworking and structures into building & construction — matching
 * that mockup's 7 colour bands is what's authored below.) Rather than
 * fabricate fake recipes or tool ids for content that doesn't exist, every
 * node declares a `readiness`:
 *
 * - `'ready'` nodes are real: they grant actual `RecipeId` plans, reference
 *   real recipes/tools in their tasks, and behave exactly as Phase 1.1 always
 *   specified. Current grants happen to be tools; later branches distribute
 *   furniture, clothing, structure, and decoration plans the same way.
 * - `'concept'` nodes are honest placeholders — a name, a branch, a
 *   one-line summary, and prerequisite edges, nothing more. No fake grant,
 *   no invented recipe, no precision (`learningHours`) the design hasn't
 *   earned yet. They exist so the *shape and scale* of the tree can be seen
 *   and iterated on before any of that content is real.
 *
 * This is the same instinct as `RecipeStatus: 'ready' | 'planned'` in
 * `recipes.ts` — settled work stays in the catalog rather than being
 * invented twice, but nothing pretends to be more finished than it is.
 *
 * The brainstorm list this was built from is not final — names, order, and
 * branch boundaries are all expected to move. See `docs/knowledge-tree.md`
 * for the mechanical rules (one node at a time, patience-or-doing, and plans
 * granted throughout the tree) that do not change regardless of content.
 */

export type TechBranchId =
  | 'caring-for-the-land'
  | 'materials'
  | 'building-construction'
  | 'interior-design'
  | 'fine-arts-textiles'
  | 'cooking'
  | 'transportation';

export type TechBranchDef = {
  id: TechBranchId;
  label: string;
  summary: string;
};

export const TECH_BRANCHES = {
  'caring-for-the-land': {
    id: 'caring-for-the-land',
    label: 'Caring for the Land',
    summary: 'Ground, soil, and everything grown in it.',
  },
  materials: {
    id: 'materials',
    label: 'Materials & Refinement',
    summary: 'Turning raw finds into something worth building with.',
  },
  'building-construction': {
    id: 'building-construction',
    label: 'Building & Construction',
    summary: 'From a trimmed branch to a piece of furniture to a whole structure.',
  },
  'interior-design': {
    id: 'interior-design',
    label: 'Interior Design',
    summary: 'Making a finished room feel like somewhere to be.',
  },
  'fine-arts-textiles': {
    id: 'fine-arts-textiles',
    label: 'Fine Arts & Textiles',
    summary: 'Thread, cloth, paint, and the things made from them.',
  },
  cooking: {
    id: 'cooking',
    label: 'Cooking',
    summary: 'From a grown ingredient to a meal worth sharing.',
  },
  transportation: {
    id: 'transportation',
    label: 'Transportation',
    summary: 'Faster ways to get somewhere than walking.',
  },
} as const satisfies Record<string, TechBranchDef>;

export const TECH_BRANCH_ORDER: TechBranchId[] = [
  'caring-for-the-land',
  'materials',
  'building-construction',
  'interior-design',
  'fine-arts-textiles',
  'cooking',
  'transportation',
];

/**
 * Either way to pay a node's cost. Authored alongside the catalog so the
 * clock never has to restate the tree — see `docs/knowledge-tree.md`
 * → "Tasks: the other way to pay". Only meaningful for `'ready'` nodes.
 */
export type TechTaskDef =
  | { kind: 'make'; recipeId: RecipeId; quantity: number; weight: number }
  | { kind: 'own-tool'; toolId: ToolId; weight: number };

type TechNodeBase = {
  id: TechNodeId;
  name: string;
  summary: string;
  branch: TechBranchId;
  /** Node ids that must already be owned before this one is reachable. */
  requires: string[];
};

export type TechNodeDef = TechNodeBase & (
  | {
    readiness: 'ready';
    /** Approximate hours to finish by waiting alone, at the prototype's pace. */
    learningHours: number;
    tasks: TechTaskDef[];
    /**
     * Plans this node teaches directly. An array because a node can teach
     * several related creations, though plans should be staggered across the
     * tree rather than bundled into one catch-all lesson.
     */
    grants: RecipeId[];
  }
  | {
    readiness: 'concept';
    /**
     * Freeform, honest preview of what this will eventually grant — never a
     * real id, because nothing behind it exists yet. Optional: most concept
     * nodes don't need one to make their place in the tree legible.
     */
    previewGrants?: string[];
  }
);

// --- The catalog -----------------------------------------------------------
//
// Ready nodes are the tool ladders already backed by real interactions, folded into
// their natural branches. Concept nodes (the rest) are the brainstorm list,
// lightly reordered where an obvious prerequisite was out of sequence, with
// a handful of deliberate cross-branch edges — the tree is mostly readable
// branch-by-branch, but a few advanced nodes deliberately reach into another
// branch's earlier work, per the design conversation that produced this.

export const TECH_DEFS = {
  // --- Caring for the Land -------------------------------------------------
  'digging-1': {
    id: 'digging-1',
    name: 'Digging 1',
    summary: 'Break open shallow paper soil for the first time.',
    branch: 'caring-for-the-land',
    requires: [],
    readiness: 'ready',
    learningHours: 1,
    tasks: [{ kind: 'make', recipeId: 'flimsy-shovel', quantity: 1, weight: 1 }],
    grants: ['flimsy-shovel'],
  },
  'digging-2': {
    id: 'digging-2',
    name: 'Digging 2',
    summary: 'Reach the compact layer under ground you have already opened.',
    branch: 'caring-for-the-land',
    requires: ['digging-1'],
    readiness: 'ready',
    learningHours: 6,
    tasks: [
      { kind: 'own-tool', toolId: 'flimsy-shovel', weight: 1 },
      { kind: 'make', recipeId: 'flimsy-shovel', quantity: 2, weight: 2 },
    ],
    grants: ['okayish-shovel'],
  },
  'digging-3': {
    id: 'digging-3',
    name: 'Digging 3',
    summary: 'Open deep seams where the local geology has one to give.',
    branch: 'caring-for-the-land',
    requires: ['digging-2'],
    readiness: 'ready',
    learningHours: 18,
    tasks: [
      { kind: 'own-tool', toolId: 'okayish-shovel', weight: 1 },
      { kind: 'make', recipeId: 'okayish-shovel', quantity: 2, weight: 2 },
    ],
    grants: ['heavy-duty-shovel'],
  },
  'gardening-1': {
    id: 'gardening-1',
    name: 'Gardening 1',
    summary: 'Sow, lift, and rake soil back into an open bed.',
    branch: 'caring-for-the-land',
    requires: [],
    readiness: 'ready',
    learningHours: 1,
    tasks: [{ kind: 'make', recipeId: 'creased-hoe', quantity: 1, weight: 1 }],
    grants: ['creased-hoe'],
  },
  'gardening-2': {
    id: 'gardening-2',
    name: 'Gardening 2',
    summary: 'Tend growing plants and learn which crops return for another harvest.',
    branch: 'caring-for-the-land',
    requires: ['gardening-1'],
    readiness: 'concept',
    previewGrants: ['Tending bonuses', 'Repeat harvests'],
  },
  'soil-mechanics': {
    id: 'soil-mechanics',
    name: 'Soil Mechanics',
    summary: "Reading what's actually under a bed before you plant it.",
    branch: 'caring-for-the-land',
    requires: ['gardening-2', 'digging-2'],
    readiness: 'concept',
    previewGrants: ['Soil condition notes', 'Bed suitability'],
  },
  'seeds-planting': {
    id: 'seeds-planting',
    name: 'Seeds & Planting',
    summary: 'Read crop timing, spacing, and expected yield before a seed goes into the ground.',
    branch: 'caring-for-the-land',
    requires: ['soil-mechanics'],
    readiness: 'concept',
    previewGrants: ['Growth-time notes', 'Harvest-yield notes'],
  },
  'growing-food': {
    id: 'growing-food',
    name: 'Growing Food',
    summary: 'Harvest carrots, corn, cabbage, tomatoes, and berries into the food scrapbook.',
    branch: 'caring-for-the-land',
    requires: ['seeds-planting'],
    readiness: 'concept',
    previewGrants: ['Food harvests', 'Whole-crop gathering'],
  },
  'organic-gardening': {
    id: 'organic-gardening',
    name: 'Organic Gardening',
    summary: 'Companion planting and natural pest control — no shortcuts.',
    branch: 'caring-for-the-land',
    requires: ['growing-food'],
    readiness: 'concept',
    previewGrants: ['Companion planting', 'Natural pest control'],
  },
  'advanced-gardening': {
    id: 'advanced-gardening',
    name: 'Advanced Gardening',
    summary: 'The top of the garden-bed ladder, before a field ever enters it.',
    branch: 'caring-for-the-land',
    requires: ['organic-gardening'],
    readiness: 'concept',
    previewGrants: ['Garden-bed planning', 'Improved tending'],
  },
  'basic-farming-techniques': {
    id: 'basic-farming-techniques',
    name: 'Basic Farming Techniques',
    summary: 'Lay out repeatable crop rows and work more than one garden bed as a field.',
    branch: 'caring-for-the-land',
    requires: ['advanced-gardening'],
    readiness: 'concept',
    previewGrants: ['Crop rows', 'Field plots'],
  },
  'irrigation-systems': {
    id: 'irrigation-systems',
    name: 'Irrigation Systems',
    summary: 'Getting water to a bed without carrying it there by hand.',
    branch: 'caring-for-the-land',
    requires: ['basic-farming-techniques'],
    readiness: 'concept',
    previewGrants: ['Water routing', 'Irrigated plots'],
  },
  'harvesting-tech': {
    id: 'harvesting-tech',
    name: 'Harvesting Tech',
    summary: 'Gather ripe rows efficiently and move a larger harvest into storage.',
    branch: 'caring-for-the-land',
    requires: ['basic-farming-techniques'],
    readiness: 'concept',
    previewGrants: ['Harvest tools', 'Bulk gathering'],
  },
  'farming-equipment-automation': {
    id: 'farming-equipment-automation',
    name: 'Farming Equipment & Automation',
    summary: 'Machines that do the walking for you.',
    branch: 'caring-for-the-land',
    requires: ['irrigation-systems', 'harvesting-tech'],
    readiness: 'concept',
    previewGrants: ['Automated tending', 'Farm equipment'],
  },
  'advanced-farming': {
    id: 'advanced-farming',
    name: 'Advanced Farming',
    summary: 'Field-scale growing, tuned and efficient.',
    branch: 'caring-for-the-land',
    requires: ['farming-equipment-automation'],
    readiness: 'concept',
    previewGrants: ['Field-scale yields', 'Crop rotation'],
  },
  'animal-husbandry': {
    id: 'animal-husbandry',
    name: 'Animal Husbandry',
    summary: "The land's other kind of tending.",
    branch: 'caring-for-the-land',
    requires: ['advanced-farming'],
    readiness: 'concept',
  },

  // --- Building & Construction: woodworking sub-thread ----------------------
  'trimming-1': {
    id: 'trimming-1',
    name: 'Tree Trimming Basics',
    summary: 'Cut soft new growth without harming the tree it came from.',
    branch: 'building-construction',
    requires: [],
    readiness: 'ready',
    learningHours: 1,
    tasks: [{ kind: 'make', recipeId: 'kids-scissors', quantity: 1, weight: 1 }],
    grants: ['kids-scissors'],
  },
  'trimming-2': {
    id: 'trimming-2',
    name: 'Advanced Tree Trimming',
    summary: 'Take bark curls and structural branches — the only shears a redwood respects.',
    branch: 'building-construction',
    requires: ['trimming-1'],
    readiness: 'ready',
    learningHours: 8,
    tasks: [
      { kind: 'own-tool', toolId: 'kids-scissors', weight: 1 },
      { kind: 'make', recipeId: 'kids-scissors', quantity: 2, weight: 2 },
    ],
    grants: ['sturdy-scissors'],
  },
  'building-1': {
    id: 'building-1',
    name: 'Building 1',
    summary: 'Place the first small pieces that make the clearing feel like yours.',
    branch: 'building-construction',
    requires: [],
    readiness: 'ready',
    learningHours: 1,
    tasks: [{ kind: 'make', recipeId: 'squeaky-hammer', quantity: 1, weight: 1 }],
    grants: ['squeaky-hammer'],
  },
  'building-2': {
    id: 'building-2',
    name: 'Building 2',
    summary: 'Make stronger joins with a broad, steady mallet.',
    branch: 'building-construction',
    requires: ['building-1'],
    readiness: 'ready',
    learningHours: 7,
    tasks: [
      { kind: 'own-tool', toolId: 'squeaky-hammer', weight: 1 },
      { kind: 'make', recipeId: 'squeaky-hammer', quantity: 2, weight: 2 },
    ],
    grants: ['basic-mallet'],
  },
  'building-3': {
    id: 'building-3',
    name: 'Building 3',
    summary: 'Fit and unfit careful assemblies with a proper claw hammer.',
    branch: 'building-construction',
    requires: ['building-2'],
    readiness: 'ready',
    learningHours: 20,
    tasks: [
      { kind: 'own-tool', toolId: 'basic-mallet', weight: 1 },
      { kind: 'make', recipeId: 'basic-mallet', quantity: 2, weight: 2 },
    ],
    grants: ['standard-hammer'],
  },
  'lumber-types': {
    id: 'lumber-types',
    name: 'Lumber Types',
    summary: 'Which wood is which, and what each is actually good for.',
    branch: 'building-construction',
    requires: ['trimming-2'],
    readiness: 'concept',
  },
  'woodworking-safety': {
    id: 'woodworking-safety',
    name: 'Woodworking Safety',
    summary: 'The boring lesson that comes before every sharp tool after this one.',
    branch: 'building-construction',
    requires: ['lumber-types'],
    readiness: 'concept',
  },
  'basic-woodworking': {
    id: 'basic-woodworking',
    name: 'Basic Woodworking',
    summary: 'Cutting, joining, and shaping — the fundamentals.',
    branch: 'building-construction',
    requires: ['woodworking-safety'],
    readiness: 'concept',
  },
  'advanced-woodworking': {
    id: 'advanced-woodworking',
    name: 'Advanced Woodworking',
    summary: 'Joinery and finishing work worth showing off.',
    branch: 'building-construction',
    requires: ['basic-woodworking'],
    readiness: 'concept',
  },

  // --- Materials & Refinement --------------------------------------------
  'materials-refinement-1': {
    id: 'materials-refinement-1',
    name: 'Materials & Refinement 1',
    summary: 'Turning a raw find into something worth building with.',
    branch: 'materials',
    requires: ['lumber-types'],
    readiness: 'concept',
  },
  'materials-refinement-2': {
    id: 'materials-refinement-2',
    name: 'Materials & Refinement 2',
    summary: 'Finer processing, and more of what it started as.',
    branch: 'materials',
    requires: ['materials-refinement-1'],
    readiness: 'concept',
  },
  'advanced-rare-materials': {
    id: 'advanced-rare-materials',
    name: 'Advanced & Rare Materials',
    summary: 'The stuff that only turns up once you know what to look for.',
    branch: 'materials',
    requires: ['materials-refinement-2'],
    readiness: 'concept',
  },

  // --- Building & Construction: tinkering sub-thread ------------------------
  'building-tinkering-basics': {
    id: 'building-tinkering-basics',
    name: 'Building & Tinkering',
    summary: 'Taking things apart, and getting them back together better.',
    branch: 'building-construction',
    requires: ['materials-refinement-1'],
    readiness: 'concept',
  },
  'fixing-improvements': {
    id: 'fixing-improvements',
    name: 'Fixing & Improvements',
    summary: 'Repairs that leave a thing better than you found it.',
    branch: 'building-construction',
    requires: ['building-tinkering-basics'],
    readiness: 'concept',
  },
  'small-furniture-building': {
    id: 'small-furniture-building',
    name: 'Small Furniture Building',
    summary: 'Stools, shelves, and the first things you build to keep.',
    branch: 'building-construction',
    requires: ['fixing-improvements'],
    readiness: 'concept',
  },
  'large-furniture-building': {
    id: 'large-furniture-building',
    name: 'Large Furniture Building',
    summary: 'Bigger joins, bigger pieces, bigger mistakes if you rush it.',
    branch: 'building-construction',
    requires: ['small-furniture-building'],
    readiness: 'concept',
  },
  'painting-and-staining': {
    id: 'painting-and-staining',
    name: 'Painting & Staining',
    summary: 'The finish that turns "built" into "yours".',
    branch: 'building-construction',
    requires: ['large-furniture-building'],
    readiness: 'concept',
  },

  // --- Building & Construction: structures sub-thread -----------------------
  'intro-to-structures': {
    id: 'intro-to-structures',
    name: 'Intro to Structures',
    summary: 'The jump from furniture to something you can walk inside.',
    branch: 'building-construction',
    requires: ['large-furniture-building'],
    readiness: 'concept',
  },
  'structural-analysis': {
    id: 'structural-analysis',
    name: 'Structural Analysis',
    summary: 'Why a structure stands, in terms you can plan around.',
    branch: 'building-construction',
    requires: ['intro-to-structures'],
    readiness: 'concept',
  },
  'foundation-design': {
    id: 'foundation-design',
    name: 'Foundation Design',
    summary: 'Everything above ground depends on this being right.',
    branch: 'building-construction',
    requires: ['structural-analysis'],
    readiness: 'concept',
  },
  'structural-dynamics': {
    id: 'structural-dynamics',
    name: 'Structural Dynamics',
    summary: 'How a structure behaves under load, not just at rest.',
    branch: 'building-construction',
    requires: ['foundation-design'],
    readiness: 'concept',
  },
  'advanced-structures': {
    id: 'advanced-structures',
    name: 'Advanced Structures',
    summary: 'Bigger builds, and the confidence to attempt them.',
    branch: 'building-construction',
    requires: ['structural-dynamics'],
    readiness: 'concept',
  },
  'blueprint-making': {
    id: 'blueprint-making',
    name: 'Blueprint Making',
    summary: 'Planning a whole build before the first cut.',
    branch: 'building-construction',
    requires: ['advanced-structures'],
    readiness: 'concept',
  },
  'auto-cad': {
    id: 'auto-cad',
    name: 'Auto CAD',
    summary: 'Letting the drawing do some of the thinking for you.',
    branch: 'building-construction',
    requires: ['blueprint-making'],
    readiness: 'concept',
  },

  // --- Interior Design -------------------------------------------------------
  'interior-design-concepts': {
    id: 'interior-design-concepts',
    name: 'Interior Design Concepts',
    summary: 'Making a finished room feel like somewhere to be.',
    branch: 'interior-design',
    requires: ['painting-and-staining'],
    readiness: 'concept',
  },
  'color-theory-basics': {
    id: 'color-theory-basics',
    name: 'Color Theory Basics',
    summary: 'Why some rooms feel calm and others feel like a mistake.',
    branch: 'interior-design',
    requires: ['interior-design-concepts'],
    readiness: 'concept',
  },
  'balance-and-flow': {
    id: 'balance-and-flow',
    name: 'Balance & Flow',
    summary: "Arranging a room so it moves the way you'd walk through it.",
    branch: 'interior-design',
    requires: ['color-theory-basics'],
    readiness: 'concept',
  },
  'interior-lighting': {
    id: 'interior-lighting',
    name: 'Interior Lighting',
    summary: 'The difference between a lit room and a warm one.',
    branch: 'interior-design',
    requires: ['balance-and-flow'],
    readiness: 'concept',
  },
  'creating-spaces': {
    id: 'creating-spaces',
    name: 'Creating Spaces',
    summary: 'Turning one big room into several small, right ones.',
    branch: 'interior-design',
    requires: ['interior-lighting'],
    readiness: 'concept',
  },
  'organization-techniques': {
    id: 'organization-techniques',
    name: 'Organization Techniques',
    summary: 'A place for everything, and a reason it lives there.',
    branch: 'interior-design',
    requires: ['creating-spaces'],
    readiness: 'concept',
  },
  'elevating-space-with-decoration': {
    id: 'elevating-space-with-decoration',
    name: 'Elevating Space with Decoration',
    summary: 'The last ten percent that makes a room feel finished.',
    branch: 'interior-design',
    requires: ['organization-techniques'],
    readiness: 'concept',
  },

  // --- Fine Arts & Textiles: fiber sub-thread -------------------------------
  'intro-to-fibers': {
    id: 'intro-to-fibers',
    name: 'Intro to Fibers',
    summary: 'What thread and cloth actually are, before you make either.',
    branch: 'fine-arts-textiles',
    requires: [],
    readiness: 'concept',
  },
  sewing: {
    id: 'sewing',
    name: 'Sewing',
    summary: 'Joining fabric on purpose, and keeping it joined.',
    branch: 'fine-arts-textiles',
    requires: ['intro-to-fibers'],
    readiness: 'concept',
  },
  weaving: {
    id: 'weaving',
    name: 'Weaving',
    summary: 'Making the cloth, not just working with it.',
    branch: 'fine-arts-textiles',
    requires: ['intro-to-fibers'],
    readiness: 'concept',
  },
  mending: {
    id: 'mending',
    name: 'Mending',
    summary: 'A visible patch instead of a thrown-out shirt.',
    branch: 'fine-arts-textiles',
    requires: ['sewing'],
    readiness: 'concept',
  },
  'clothing-from-patterns': {
    id: 'clothing-from-patterns',
    name: 'Clothing from Patterns',
    summary: 'Following someone else\'s good idea, precisely.',
    branch: 'fine-arts-textiles',
    requires: ['sewing'],
    readiness: 'concept',
  },
  'clothing-pattern-creation': {
    id: 'clothing-pattern-creation',
    name: 'Clothing Pattern Creation',
    summary: 'Drafting your own good idea for someone else to follow.',
    branch: 'fine-arts-textiles',
    requires: ['clothing-from-patterns'],
    readiness: 'concept',
  },

  // --- Cooking -----------------------------------------------------------
  'cooking-basics': {
    id: 'cooking-basics',
    name: 'Cooking Basics',
    summary: 'You cook what you grow — the first step past raw ingredients.',
    branch: 'cooking',
    requires: ['growing-food'],
    readiness: 'concept',
  },
  'knife-skills': {
    id: 'knife-skills',
    name: 'Knife Skills',
    summary: 'Everything after this goes faster and safer because of it.',
    branch: 'cooking',
    requires: ['cooking-basics'],
    readiness: 'concept',
  },
  'food-prep-and-care': {
    id: 'food-prep-and-care',
    name: 'Food Prep & Care',
    summary: 'Keeping ingredients good, from harvest to the pan.',
    branch: 'cooking',
    requires: ['knife-skills'],
    readiness: 'concept',
  },
  'spices-and-flavor': {
    id: 'spices-and-flavor',
    name: 'Spices & Flavor',
    summary: 'The difference between fed and delighted.',
    branch: 'cooking',
    requires: ['food-prep-and-care'],
    readiness: 'concept',
  },
  grilling: {
    id: 'grilling',
    name: 'Grilling',
    summary: 'Cooking over open flame, on purpose this time.',
    branch: 'cooking',
    requires: ['spices-and-flavor'],
    readiness: 'concept',
  },
  'advanced-cooking': {
    id: 'advanced-cooking',
    name: 'Advanced Cooking',
    summary: 'Technique that used to be a recipe becomes a habit.',
    branch: 'cooking',
    requires: ['grilling'],
    readiness: 'concept',
  },
  'cooking-for-others': {
    id: 'cooking-for-others',
    name: 'Cooking for Others',
    summary: 'The same meal, timed and plated for more than one person.',
    branch: 'cooking',
    requires: ['advanced-cooking'],
    readiness: 'concept',
  },
  'advanced-cooking-at-scale': {
    id: 'advanced-cooking-at-scale',
    name: 'Advanced Cooking at Scale',
    summary: 'Feeding a crowd needs a field, not a garden bed.',
    branch: 'cooking',
    requires: ['cooking-for-others', 'farming-equipment-automation'],
    readiness: 'concept',
  },

  // --- Fine Arts & Textiles: art sub-thread ---------------------------------
  'art-and-design-basics': {
    id: 'art-and-design-basics',
    name: 'Art & Design Basics',
    summary: 'Looking closely, on purpose, before making anything.',
    branch: 'fine-arts-textiles',
    requires: [],
    readiness: 'concept',
  },
  'painting-and-drawing-1': {
    id: 'painting-and-drawing-1',
    name: 'Painting & Drawing 1',
    summary: 'Getting what you see onto paper, roughly.',
    branch: 'fine-arts-textiles',
    requires: ['art-and-design-basics'],
    readiness: 'concept',
  },
  'painting-and-drawing-2': {
    id: 'painting-and-drawing-2',
    name: 'Painting & Drawing 2',
    summary: 'Getting what you see onto paper, on purpose.',
    branch: 'fine-arts-textiles',
    requires: ['painting-and-drawing-1'],
    readiness: 'concept',
  },
  'advanced-art-concepts': {
    id: 'advanced-art-concepts',
    name: 'Advanced Art Concepts',
    summary: 'A style of your own, not just a steadier hand.',
    branch: 'fine-arts-textiles',
    requires: ['painting-and-drawing-2'],
    readiness: 'concept',
  },

  // --- Transportation --------------------------------------------------------
  'transportation-basics': {
    id: 'transportation-basics',
    name: 'Transportation Basics',
    summary: 'Wheels, axles, and why they want real materials under them.',
    branch: 'transportation',
    requires: ['materials-refinement-2'],
    readiness: 'concept',
  },
  'personal-transport': {
    id: 'personal-transport',
    name: 'Personal Transport',
    summary: 'Faster than walking, still under your own power.',
    branch: 'transportation',
    requires: ['transportation-basics'],
    readiness: 'concept',
  },
  'small-engines': {
    id: 'small-engines',
    name: 'Small Engines',
    summary: 'The first machine that moves you instead of the other way round.',
    branch: 'transportation',
    requires: ['personal-transport', 'advanced-rare-materials'],
    readiness: 'concept',
  },
  automotive: {
    id: 'automotive',
    name: 'Automotive',
    summary: 'A vehicle that has to hold together at real speed.',
    branch: 'transportation',
    requires: ['small-engines', 'advanced-structures'],
    readiness: 'concept',
  },
  'rocket-science': {
    id: 'rocket-science',
    name: 'Rocket Science',
    summary: "The joke tech that isn't really a joke once it's this close.",
    branch: 'transportation',
    requires: ['automotive', 'auto-cad'],
    readiness: 'concept',
  },
} as const satisfies Record<string, {
  id: string;
  name: string;
  summary: string;
  branch: TechBranchId;
  requires: string[];
  readiness: 'ready' | 'concept';
  learningHours?: number;
  tasks?: TechTaskDef[];
  grants?: RecipeId[];
  previewGrants?: string[];
}>;

export type TechNodeId = keyof typeof TECH_DEFS;

export const TECH_NODE_ORDER: TechNodeId[] = Object.keys(TECH_DEFS) as TechNodeId[];

/** The real lesson that grants a recipe, or null when it comes from elsewhere. */
export function techNodeGrantingRecipe(recipeId: RecipeId): TechNodeId | null {
  const recipe = RECIPE_DEFS[recipeId];
  if (recipe.planSource !== 'knowledge-tree') return null;
  return TECH_NODE_ORDER.find((nodeId) => {
    const node = TECH_DEFS[nodeId];
    return node.readiness === 'ready' && (node.grants as readonly RecipeId[]).includes(recipeId);
  }) ?? null;
}

/** Nodes on one branch, in catalog order (which is also dependency order). */
export function techNodesInBranch(branch: TechBranchId): TechNodeId[] {
  return TECH_NODE_ORDER.filter((id) => TECH_DEFS[id].branch === branch);
}

export function techBranchLabel(branch: TechBranchId): string {
  return TECH_BRANCHES[branch].label;
}

// --- Timeline column: derived, never hand-positioned -----------------------

const columnCache = new Map<TechNodeId, number>();

/**
 * A node's column in the shared timeline: 0 for anything with no
 * prerequisites, otherwise one past the deepest prerequisite's own column
 * (longest path from a root, the standard layering used to auto-position a
 * dependency graph).
 *
 * This is what makes "some branches can be started at the same time, but
 * some require other branches to be completed first" — the brainstorm's own
 * words for the layout — fall out of the real `requires` graph instead of
 * being hand-positioned card by card. Every node with `requires: []` lands
 * in column 0 regardless of branch, which is exactly "started at the same
 * time"; a node that reaches into another branch is pushed at least one
 * column past whatever it depends on there, which is exactly "requires that
 * to be completed first" — visible in the layout without a connecting line.
 *
 * Memoized because the view recomputes this for every node on every render;
 * the underlying graph never changes at runtime, so the cache never needs
 * invalidating.
 */
export function techNodeColumn(nodeId: TechNodeId): number {
  const cached = columnCache.get(nodeId);
  if (cached !== undefined) return cached;
  const reqs = TECH_DEFS[nodeId].requires as TechNodeId[];
  const column = reqs.length === 0 ? 0 : 1 + Math.max(...reqs.map(techNodeColumn));
  columnCache.set(nodeId, column);
  return column;
}

/** One past the highest column any node occupies — the timeline's width. */
export function techTreeColumnCount(): number {
  return Math.max(...TECH_NODE_ORDER.map(techNodeColumn)) + 1;
}

// --- Status: reads only, never writes -------------------------------------

/**
 * `not-built` beats every other status regardless of prerequisites — a
 * concept node has no system behind it yet, so nothing about "locked" or
 * "available" (both of which promise you can eventually act on this) would
 * be true. Same principle as `RecipeStatus: 'planned'`: never claim a thing
 * is closer to reachable than it actually is.
 */
export type TechNodeStatus = 'owned' | 'available' | 'locked' | 'not-built';

/**
 * A node reads as owned once every plan it grants is knowledge the player
 * already holds. This deliberately reuses the *current* plan system
 * (`player.plans`) rather than inventing tree-only state — 1.1 is a view,
 * and today's starter tools already satisfy tier-1 nodes on a fresh save,
 * which is the correct, honest answer: a new player already knows Digging 1.
 *
 * Always false for a concept node — there is nothing to own yet.
 */
export function isTechNodeOwned(nodeId: TechNodeId, state: GameState): boolean {
  const node = TECH_DEFS[nodeId];
  if (node.readiness === 'concept') return false;
  return node.grants.every((recipeId) => state.player.plans.includes(recipeId));
}

/** The prerequisite nodes still standing between the player and this one. */
export function missingTechPrerequisites(nodeId: TechNodeId, state: GameState): TechNodeId[] {
  return (TECH_DEFS[nodeId].requires as TechNodeId[]).filter((reqId) => !isTechNodeOwned(reqId, state));
}

export function techNodeStatus(nodeId: TechNodeId, state: GameState): TechNodeStatus {
  if (TECH_DEFS[nodeId].readiness === 'concept') return 'not-built';
  if (isTechNodeOwned(nodeId, state)) return 'owned';
  return missingTechPrerequisites(nodeId, state).length === 0 ? 'available' : 'locked';
}

// --- Derived unlock icons: never hand-authored -----------------------------

/**
 * Resources a tool reaches, read back out of `obtainedBy` rather than
 * hand-listed. See knowledge-tree.md: "The small tier is derived, never
 * hand-authored" — the exact reasoning `obtaining.ts` itself was built for.
 */
export function resourcesUnlockedByTool(toolId: ToolId): ResourceId[] {
  return (Object.keys(RESOURCE_CORE_DEFS) as ResourceId[])
    .filter((resource) => toolRequiredFor(resource) === toolId);
}

function familyNeedsTool(family: string, toolId: ToolId): boolean {
  return (Object.keys(RESOURCE_CORE_DEFS) as ResourceId[])
    .some((resource) => RESOURCE_CORE_DEFS[resource].category === family && toolRequiredFor(resource) === toolId);
}

/**
 * Ready recipes this tool makes reachable, because at least one ingredient
 * needs it. Also derived — see `resourcesUnlockedByTool` above for why.
 */
export function recipesUnlockedByTool(toolId: ToolId): RecipeId[] {
  return (Object.keys(RECIPE_DEFS) as RecipeId[]).filter((recipeId) => {
    const recipe = RECIPE_DEFS[recipeId];
    if (recipe.status !== 'ready') return false;
    return recipe.ingredients.some((ingredient) => (
      ingredient.kind === 'exact'
        ? toolRequiredFor(ingredient.resource) === toolId
        : familyNeedsTool(ingredient.family, toolId)
    ));
  });
}

/**
 * The node's whole "what does this get me" answer: large icons (the plans
 * granted) and small icons (what granted tools then reach), both labelled —
 * see the accessibility notes in knowledge-tree.md. Empty for a concept
 * node — there is nothing real to derive yet.
 */
export function techNodeUnlocks(nodeId: TechNodeId): {
  grants: RecipeId[];
  resources: ResourceId[];
  recipes: RecipeId[];
} {
  const node = TECH_DEFS[nodeId];
  if (node.readiness === 'concept') return { grants: [], resources: [], recipes: [] };

  const resources = new Set<ResourceId>();
  const recipes = new Set<RecipeId>();
  for (const recipeId of node.grants) {
    const output = RECIPE_DEFS[recipeId].output;
    if (output.kind !== 'tool') continue;
    const toolId = output.toolId;
    for (const resource of resourcesUnlockedByTool(toolId)) resources.add(resource);
    for (const unlockedRecipeId of recipesUnlockedByTool(toolId)) recipes.add(unlockedRecipeId);
  }
  return {
    grants: node.grants,
    resources: [...resources],
    recipes: [...recipes],
  };
}

/**
 * A concept node's freeform preview of what it will eventually grant, if the
 * author wrote one — never a real id, since nothing behind it exists yet.
 * A small accessor rather than letting callers reach for `.previewGrants`
 * directly: most concept node literals never declare the field at all
 * (rather than declaring it `undefined`), so TypeScript sees it as absent,
 * not optional, on any given entry. This is the one place that knows how to
 * ask safely.
 */
export function techNodePreviewGrants(nodeId: TechNodeId): string[] {
  const node = TECH_DEFS[nodeId];
  if (node.readiness !== 'concept') return [];
  return 'previewGrants' in node && Array.isArray(node.previewGrants) ? node.previewGrants : [];
}

// --- Presentation text, kept here so the view never restates game facts ----

export function describeTechTask(task: TechTaskDef): string {
  if (task.kind === 'own-tool') {
    return `Own a ${TOOL_DEFS[task.toolId].name}`;
  }
  const recipe = RECIPE_DEFS[task.recipeId];
  const label = task.quantity === 1 || recipe.output.label.endsWith('s')
    ? recipe.output.label
    : `${recipe.output.label}s`;
  return `Make ${task.quantity} ${label}`;
}

/**
 * Approximate, coarse, and never a countdown — per knowledge-tree.md:
 * "About a day left," never "ready Thursday 4:35pm."
 */
export function formatLearningDuration(hours: number): string {
  if (hours < 1.5) return 'about an hour';
  if (hours < 20) return `about ${Math.round(hours)} hours`;
  if (hours < 36) return 'about a day';
  const days = Math.round(hours / 24);
  return `about ${days} days`;
}
