/**
 * The material vocabulary: the axes every material is described along, and
 * nothing else.
 *
 * From `docs/materials-and-resources-v1.md`: a material has an identity, a
 * family, an acquisition route, a processing stage, and optional structural
 * performance — and **none of those is inferred from its name, artwork,
 * rarity, or tool tier**. Keeping the axes separate is what lets the catalog
 * grow without renaming everything each time balancing changes:
 *
 * - tool tier answers *"can I reach this source?"* — `tools.ts`
 * - source tier answers *"where is the raw material?"* — `obtaining.ts`,
 *   `geology.ts`
 * - **processing stage** answers *"how many transformations are behind this?"*
 * - **structural class** answers *"what scale of building can use this?"*
 * - **tags** answer *"what can a recipe ask for without naming me exactly?"*
 * - rarity answers *"how often does it appear?"* — not yet modelled
 * - biome affinity answers *"where is it easier to find?"* — `obtaining.ts`
 *
 * This file is deliberately vocabulary only — no `ResourceId`, no imports from
 * the resource catalog. The per-material values live on each resource in
 * `resources.ts`, so one definition can be validated as a whole. That is also
 * why the dependency runs resources → materials and never back.
 */

/**
 * How many transformations sit behind a material.
 *
 * A stage is *not* a quality ladder and *not* a tool tier: a tier-3 tree can
 * yield a raw stage-0 wood, and a stage-3 wallpaper can be structurally
 * useless. Useful in the scrapbook and in authoring tools; **never
 * auto-prefixed to an item's name** — no "Tier 3 X" anywhere a player reads.
 */
export type ProcessStage = 0 | 1 | 2 | 3 | 4;

export type ProcessStageDefinition = {
  stage: ProcessStage;
  /** Catalog-facing label. Not automatically shown to players. */
  label: string;
  meaning: string;
};

export const PROCESS_STAGES = {
  0: { stage: 0, label: 'Raw', meaning: 'Harvested or excavated; no recipe behind it.' },
  1: { stage: 1, label: 'Prepared', meaning: 'Cleaned, crushed, pulped, spun, or bundled.' },
  2: { stage: 2, label: 'Formed', meaning: 'A usable sheet, textile, board, or masonry unit.' },
  3: { stage: 3, label: 'Composite', meaning: 'Several formed materials combined for performance.' },
  4: { stage: 4, label: 'Architectural', meaning: 'A specialized large-scale component.' },
} as const satisfies Record<ProcessStage, ProcessStageDefinition>;

export const PROCESS_STAGE_IDS: ProcessStage[] = [0, 1, 2, 3, 4];

/**
 * What scale of building a material can be part of.
 *
 * Metadata, not a synonym for processing stage. For V1 a blueprint slot may
 * simply require a minimum class; a later building simulation can add
 * `supportProvided` / `loadImposed` without renaming a single material or
 * invalidating a recipe.
 *
 * **Current assignments are deliberately conservative.** Nothing raw claims
 * class 2 or above yet, because resource-costed building does not exist —
 * see the open decision about minimum-class gates versus a visible load
 * system in `docs/materials-and-resources-v1.md`.
 */
export type StructuralClass = 0 | 1 | 2 | 3 | 4;

export type StructuralClassDefinition = {
  class: StructuralClass;
  /** Player-facing label. This one is safe to show. */
  label: string;
  typicalUse: string;
};

export const STRUCTURAL_CLASSES = {
  0: { class: 0, label: 'Finish', typicalUse: 'Paper, wallpaper, clothing, trim, glass decoration.' },
  1: { class: 1, label: 'Light', typicalUse: 'Small props, furniture, planters, fences.' },
  2: { class: 2, label: 'Structural', typicalUse: 'Single-story walls, doors, floors, ordinary roofs.' },
  3: { class: 3, label: 'Load-bearing', typicalUse: 'Second stories, long roofs, balconies, large openings.' },
  4: { class: 4, label: 'Long-span', typicalUse: 'Towers, halls, bridges, landmark-scale builds.' },
} as const satisfies Record<StructuralClass, StructuralClassDefinition>;

export const STRUCTURAL_CLASS_IDS: StructuralClass[] = [0, 1, 2, 3, 4];

export type MaterialTagDefinition = {
  id: string;
  label: string;
  meaning: string;
};

/**
 * What a recipe can ask for without naming a resource exactly.
 *
 * Categories (`RESOURCE_CATEGORIES`) are scrapbook folders — how a player
 * files a thing. Tags are recipe behavior — what a thing *is* for the purpose
 * of making something out of it. One material may carry several.
 *
 * Only tags something actually carries live here; a tag with no material is a
 * promise the catalog cannot keep, and the validation test rejects one. The
 * design doc also reserves `brick`, `pigment`, `canvas`, and `glass` — those
 * arrive with the materials that earn them, not before.
 */
export const MATERIAL_TAGS = {
  wood: { id: 'wood', label: 'Wood', meaning: 'Woody pieces a recipe can treat interchangeably.' },
  'species-wood': { id: 'species-wood', label: 'Species wood', meaning: 'Wood from one named tree, where the species is the point.' },
  'soft-fiber': { id: 'soft-fiber', label: 'Soft fiber', meaning: 'Short, pulpable, stuffable plant matter.' },
  'long-fiber': { id: 'long-fiber', label: 'Long fiber', meaning: 'Strands long enough to spin, bind, or weave.' },
  stone: { id: 'stone', label: 'Stone', meaning: 'Geological pieces for aggregate, masonry, and grinding.' },
  clay: { id: 'clay', label: 'Clay', meaning: 'Plastic earth that holds a shape and can be fired.' },
  soil: { id: 'soil', label: 'Soil', meaning: 'Loose earth for landscaping, filling, and growing.' },
  board: { id: 'board', label: 'Board', meaning: 'Flat layered stock — the ancestor of every panel.' },
  seed: { id: 'seed', label: 'Seed', meaning: 'Plantable; belongs to the garden loop, not the workshop.' },
  food: { id: 'food', label: 'Food', meaning: 'Grown and picked; eaten or given, not built with.' },
} as const satisfies Record<string, MaterialTagDefinition>;

export type MaterialTag = keyof typeof MATERIAL_TAGS;

export const MATERIAL_TAG_IDS = Object.keys(MATERIAL_TAGS) as MaterialTag[];

/** Everything the axes above say about one material, in one block. */
export type MaterialMetadata = {
  processStage: ProcessStage;
  structuralClass: StructuralClass;
  tags: readonly MaterialTag[];
};
