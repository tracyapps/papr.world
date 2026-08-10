import type { BuildPieceKey } from '../../world/buildPieces';
import type { IngredientRequirement } from './recipes';

export type BuildStepVerb = 'assemble' | 'build' | 'decorate';
export type BuildJoin = 'fold' | 'tape' | 'fastener';

export type BuildAssemblyStep = {
  id: string;
  label: string;
  verb: BuildStepVerb;
  durationSeconds: number;
  materials: readonly IngredientRequirement[];
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
    steps: [{ id: 'build', label: 'Building', verb: 'build', durationSeconds: 2.4, materials: [] }],
  },
  'planter-box': {
    templateKey: 'planter-box', minimumToolTier: 1,
    steps: [{ id: 'build', label: 'Building', verb: 'build', durationSeconds: 2.1, materials: [] }],
  },
  'path-plank': {
    templateKey: 'path-plank', minimumToolTier: 1,
    steps: [{ id: 'build', label: 'Building', verb: 'build', durationSeconds: 1.4, materials: [] }],
  },
  'paper-lamp': {
    templateKey: 'paper-lamp', minimumToolTier: 1,
    steps: [{ id: 'build', label: 'Building', verb: 'build', durationSeconds: 2.2, materials: [] }],
  },
} as const satisfies Record<BuildPieceKey, BuildAssemblyDefinition>;

export function buildAssemblyDef(templateKey: string): BuildAssemblyDefinition | null {
  return BUILD_ASSEMBLY_DEFS[templateKey as BuildPieceKey] ?? null;
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
