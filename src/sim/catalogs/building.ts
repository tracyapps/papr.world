import type { BuildPieceKey } from '../../world/buildPieces';
import type { IngredientRequirement } from './recipes';
import { RESOURCE_CORE_DEFS, type ResourceId } from './resources';

export type BuildStepVerb = 'assemble' | 'build' | 'decorate';
export type BuildJoin = 'fold' | 'tape' | 'fastener';

export type BuildAssemblyStep = {
  id: string;
  label: string;
  verb: BuildStepVerb;
  durationSeconds: number;
  materials: readonly IngredientRequirement[];
  /**
   * Units of the piece's *chosen* material this step consumes.
   *
   * Separate from `materials` because the cost is not a fixed ingredient — it
   * is however much of whatever you decided to build the thing out of. Kept
   * per step rather than per piece so an advanced structure can charge more
   * at its heavier steps without the small furniture getting more expensive
   * too: modest now, room to grow.
   */
  materialUnits: number;
  /** Named intermediate part this step leaves at the site. */
  producesPart?: string;
  /** Named parts that must have been made at earlier steps. */
  requiresParts?: readonly string[];
  /** Authored join method. `tape` steps spend tape through `materials` once it enters the resource catalog. */
  join?: BuildJoin;
};

export type BuildAssemblyDefinition = {
  templateKey: string;
  minimumToolTier: 1 | 2 | 3;
  steps: readonly BuildAssemblyStep[];
};

/**
 * Construction rules, deliberately separate from spatial/visual piece data.
 * Tier-one objects are one short step today. Higher-tier structures can add
 * part-producing steps and tape-consuming joins without changing placement,
 * saves, or the timed-action display.
 */
export const BUILD_ASSEMBLY_DEFS = {
  'paper-bench': {
    templateKey: 'paper-bench', minimumToolTier: 1,
    steps: [{ id: 'build', label: 'Building', verb: 'build', durationSeconds: 2.4, materials: [], materialUnits: 4 }],
  },
  'planter-box': {
    templateKey: 'planter-box', minimumToolTier: 1,
    steps: [{ id: 'build', label: 'Building', verb: 'build', durationSeconds: 2.1, materials: [], materialUnits: 3 }],
  },
  'path-plank': {
    templateKey: 'path-plank', minimumToolTier: 1,
    steps: [{ id: 'build', label: 'Building', verb: 'build', durationSeconds: 1.4, materials: [], materialUnits: 2 }],
  },
  'paper-lamp': {
    templateKey: 'paper-lamp', minimumToolTier: 1,
    steps: [{ id: 'build', label: 'Building', verb: 'build', durationSeconds: 2.2, materials: [], materialUnits: 3 }],
  },
  'garden-arbor': {
    templateKey: 'garden-arbor', minimumToolTier: 2,
    steps: [
      { id: 'posts', label: 'Shaping arbor posts', verb: 'build', durationSeconds: 3.2, materials: [], materialUnits: 4, producesPart: 'arbor-posts' },
      { id: 'lintel', label: 'Folding the arbor top', verb: 'build', durationSeconds: 2.8, materials: [], materialUnits: 3, producesPart: 'arbor-lintel' },
      { id: 'join', label: 'Binding the arbor', verb: 'assemble', durationSeconds: 3.5, materials: [{ kind: 'exact', resource: 'binding-cord', quantity: 1 }], materialUnits: 1, requiresParts: ['arbor-posts', 'arbor-lintel'], join: 'fastener' },
    ],
  },
  'picnic-table': {
    templateKey: 'picnic-table', minimumToolTier: 2,
    steps: [
      { id: 'top', label: 'Laying out the tabletop', verb: 'build', durationSeconds: 3.4, materials: [], materialUnits: 5, producesPart: 'tabletop' },
      { id: 'benches', label: 'Making two benches', verb: 'build', durationSeconds: 3.6, materials: [], materialUnits: 5, producesPart: 'benches' },
      { id: 'assemble', label: 'Assembling the picnic table', verb: 'assemble', durationSeconds: 4, materials: [{ kind: 'exact', resource: 'binding-cord', quantity: 1 }], materialUnits: 2, requiresParts: ['tabletop', 'benches'], join: 'fastener' },
    ],
  },
  'footbridge': {
    templateKey: 'footbridge', minimumToolTier: 2,
    steps: [
      { id: 'supports', label: 'Setting bridge supports', verb: 'build', durationSeconds: 3.5, materials: [{ kind: 'exact', resource: 'stone-aggregate', quantity: 1 }], materialUnits: 4, producesPart: 'bridge-supports' },
      { id: 'deck', label: 'Folding the bridge deck', verb: 'build', durationSeconds: 4.2, materials: [], materialUnits: 6, producesPart: 'bridge-deck' },
      { id: 'rails', label: 'Making bridge rails', verb: 'build', durationSeconds: 3.2, materials: [], materialUnits: 3, producesPart: 'bridge-rails' },
      { id: 'assemble', label: 'Joining the footbridge', verb: 'assemble', durationSeconds: 4.8, materials: [{ kind: 'exact', resource: 'binding-cord', quantity: 2 }], materialUnits: 2, requiresParts: ['bridge-supports', 'bridge-deck', 'bridge-rails'], join: 'fastener' },
    ],
  },
} as const satisfies Record<BuildPieceKey, BuildAssemblyDefinition>;

/** Everything a finished piece costs in its chosen material, across all steps. */
export function buildMaterialUnits(templateKey: string): number {
  const definition = BUILD_ASSEMBLY_DEFS[templateKey as BuildPieceKey];
  return definition ? definition.steps.reduce((total, step) => total + step.materialUnits, 0) : 0;
}

export function buildAssemblyDef(templateKey: string): BuildAssemblyDefinition | null {
  return BUILD_ASSEMBLY_DEFS[templateKey as BuildPieceKey] ?? null;
}

/**
 * A build surface is a material you gathered.
 *
 * The id is a `ResourceId`, optionally with a colorway after a dot —
 * `kraft-twigs`, `kraft-twigs.terracotta`. It stays a plain string in the
 * protocol (it always was), so nothing here costs a `PROTOCOL_VERSION` bump,
 * and resource ids never contain a dot, which is what makes the split
 * unambiguous against the legacy keys below.
 *
 * sim/ stays renderer-free: this validates that the resource *exists*, and
 * nothing more. Which resources have compiled artwork, and what a colorway
 * looks like, are presentation facts that belong to the render layer.
 */
export type BuildMaterialId = string;

/**
 * The six curated paper textures the picker used to offer.
 *
 * They tied to no resource and cost nothing, which is the gap this replaces.
 * They stay **valid** — every piece built before today records one, and an
 * older client may still send one — so they keep rendering exactly as they
 * always have. They are simply no longer offered. Do not add to this list.
 */
export const LEGACY_BUILD_MATERIALS = [
  'paper.brown.warm',
  'paper.brown',
  'paper.cork',
  'paper.grey',
  'paper.green',
  'paper.plaid',
] as const;

export type LegacyBuildMaterial = (typeof LEGACY_BUILD_MATERIALS)[number];

export function isLegacyBuildMaterial(value: string): value is LegacyBuildMaterial {
  return (LEGACY_BUILD_MATERIALS as readonly string[]).includes(value);
}

/** Player-facing names for the retired textures, still needed to label an old piece. */
export const LEGACY_BUILD_MATERIAL_LABELS: Record<LegacyBuildMaterial, string> = {
  'paper.brown.warm': 'Warm Kraft',
  'paper.brown': 'Brown Paper',
  'paper.cork': 'Corkboard',
  'paper.grey': 'Grey Wood-Print',
  'paper.green': 'Construction Green',
  'paper.plaid': 'Blue Plaid',
};

/** The resource and colorway inside a build material id, or null if it names no real resource. */
export function parseBuildMaterial(
  value: string,
): { resource: ResourceId; colorway: string | null } | null {
  const dot = value.indexOf('.');
  const head = dot === -1 ? value : value.slice(0, dot);
  if (!(head in RESOURCE_CORE_DEFS)) return null;
  const colorway = dot === -1 ? null : value.slice(dot + 1);
  return { resource: head as ResourceId, colorway: colorway || null };
}

export function formatBuildMaterial(resource: ResourceId, colorway?: string | null): BuildMaterialId {
  return colorway ? `${resource}.${colorway}` : resource;
}

/** The resource a piece is made of, or null when it predates resource-backed materials. */
export function buildMaterialResource(value: string): ResourceId | null {
  return parseBuildMaterial(value)?.resource ?? null;
}

export function isBuildMaterial(value: string): boolean {
  return isLegacyBuildMaterial(value) || parseBuildMaterial(value) !== null;
}

/**
 * What every piece looked like before a `material` was ever recorded.
 *
 * Must match `buildPieceVisuals.ts`'s previously-hardcoded material for that
 * piece's customizable surface exactly, so a piece built before this field
 * existed — or a malformed/omitted value from an older client — renders
 * pixel-identical to how it always has. See that file for which surface on
 * each piece this default applies to (never all of a piece's materials —
 * e.g. a planter's soil and a lamp's shade are deliberately fixed).
 */
export const DEFAULT_BUILD_MATERIAL: Record<BuildPieceKey, LegacyBuildMaterial> = {
  'paper-bench': 'paper.brown.warm',
  'planter-box': 'paper.cork',
  'path-plank': 'paper.plaid',
  'paper-lamp': 'paper.brown',
  'garden-arbor': 'paper.green',
  'picnic-table': 'paper.brown.warm',
  'footbridge': 'paper.cork',
};

/** The material a piece should render/build with: the requested one if it's
 * real, otherwise that piece type's original look. */
export function resolveBuildMaterial(templateKey: BuildPieceKey, requested?: string): BuildMaterialId {
  if (requested && isBuildMaterial(requested)) return requested;
  return DEFAULT_BUILD_MATERIAL[templateKey];
}

function partsFromCompleted(definition: BuildAssemblyDefinition, completedStepIds: readonly string[]) {
  const completed = new Set(completedStepIds);
  return new Set(definition.steps
    .filter((step) => completed.has(step.id) && step.producesPart)
    .map((step) => step.producesPart!));
}

/** The next incomplete step whose prerequisite parts are present. */
export function nextBuildStep(
  definition: BuildAssemblyDefinition,
  completedStepIds: readonly string[],
): BuildAssemblyStep | null {
  const completed = new Set(completedStepIds);
  const parts = partsFromCompleted(definition, completedStepIds);
  for (const step of definition.steps) {
    if (completed.has(step.id)) continue;
    if ((step.requiresParts ?? []).some((part) => !parts.has(part))) return null;
    return step;
  }
  return null;
}

/** Catalog validation also works for planned structure definitions in tests/tools. */
export function validateBuildAssembly(definition: BuildAssemblyDefinition): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const parts = new Set<string>();
  if (definition.steps.length === 0) errors.push('Assembly has no steps.');

  for (const step of definition.steps) {
    if (!step.id || ids.has(step.id)) errors.push(`Duplicate build step ${step.id || '(empty)'}.`);
    ids.add(step.id);
    if (!Number.isFinite(step.durationSeconds) || step.durationSeconds <= 0) {
      errors.push(`Step ${step.id} needs a positive duration.`);
    }
    for (const part of step.requiresParts ?? []) {
      if (!parts.has(part)) errors.push(`Step ${step.id} requires unknown part ${part}.`);
    }
    if (step.producesPart) parts.add(step.producesPart);
    for (const material of step.materials) {
      if (!Number.isSafeInteger(material.quantity) || material.quantity < 1) {
        errors.push(`Step ${step.id} has an invalid material quantity.`);
      }
    }
  }
  return errors;
}
