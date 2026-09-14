import { describe, expect, it } from 'vitest';
import {
  BUILD_ASSEMBLY_DEFS,
  LEGACY_BUILD_MATERIALS,
  DEFAULT_BUILD_MATERIAL,
  buildMaterialResource,
  buildMaterialUnits,
  formatBuildMaterial,
  isBuildMaterial,
  isLegacyBuildMaterial,
  nextBuildStep,
  parseBuildMaterial,
  resolveBuildMaterial,
  validateBuildAssembly,
  type BuildAssemblyDefinition,
} from './building';
import { BUILD_PIECE_DEFS, type BuildPieceKey } from '../../world/buildPieces';

describe('build assembly catalog', () => {
  it('authors a timed assembly path for every placeable piece', () => {
    expect(Object.keys(BUILD_ASSEMBLY_DEFS).sort()).toEqual(Object.keys(BUILD_PIECE_DEFS).sort());

    for (const definition of Object.values(BUILD_ASSEMBLY_DEFS)) {
      expect(validateBuildAssembly(definition)).toEqual([]);
      expect(definition.steps.length).toBeGreaterThan(0);
      expect(definition.steps.every((step) => step.durationSeconds > 0)).toBe(true);
    }
  });

  it('supports separately made parts followed by a tape-consuming assembly step', () => {
    const structure: BuildAssemblyDefinition = {
      templateKey: 'future-paper-house',
      minimumToolTier: 2,
      steps: [
        {
          id: 'frame', label: 'Making frame', verb: 'build', durationSeconds: 2,
          materials: [], materialUnits: 2, producesPart: 'frame',
        },
        {
          id: 'walls', label: 'Making wall panels', verb: 'build', durationSeconds: 2,
          materials: [], materialUnits: 3, producesPart: 'wall-panels',
        },
        {
          id: 'shell', label: 'Assembling', verb: 'assemble', durationSeconds: 3,
          materials: [{ kind: 'exact', resource: 'mossy-paper-fiber', quantity: 1 }],
          materialUnits: 1, requiresParts: ['frame', 'wall-panels'], join: 'tape',
        },
      ],
    };

    expect(validateBuildAssembly(structure)).toEqual([]);
    expect(nextBuildStep(structure, [])?.id).toBe('frame');
    expect(nextBuildStep(structure, ['frame'])?.id).toBe('walls');
    expect(nextBuildStep(structure, ['frame', 'walls'])).toMatchObject({
      id: 'shell',
      join: 'tape',
      requiresParts: ['frame', 'wall-panels'],
    });
    expect(nextBuildStep(structure, ['frame', 'walls', 'shell'])).toBeNull();
  });

  it('rejects an assembly step whose required part is never produced', () => {
    const invalid: BuildAssemblyDefinition = {
      templateKey: 'broken-plan',
      minimumToolTier: 2,
      steps: [{
        id: 'join', label: 'Assembling', verb: 'assemble', durationSeconds: 2,
        materials: [], materialUnits: 0, requiresParts: ['missing-roof'], join: 'tape',
      }],
    };

    expect(validateBuildAssembly(invalid)).toContain('Step join requires unknown part missing-roof.');
  });
});

describe('build material choice', () => {
  it('gives every placeable piece a default that is itself a real option', () => {
    expect(Object.keys(DEFAULT_BUILD_MATERIAL).sort()).toEqual(Object.keys(BUILD_PIECE_DEFS).sort());
    for (const material of Object.values(DEFAULT_BUILD_MATERIAL)) {
      expect(isBuildMaterial(material)).toBe(true);
    }
  });

  it('accepts a resource the player could actually be holding', () => {
    expect(resolveBuildMaterial('paper-bench', 'kraft-twigs')).toBe('kraft-twigs');
    expect(resolveBuildMaterial('paper-bench', 'kraft-twigs.terracotta')).toBe('kraft-twigs.terracotta');
  });

  it('still accepts a retired paper key, so an existing piece keeps its look', () => {
    expect(resolveBuildMaterial('paper-bench', 'paper.grey')).toBe('paper.grey');
  });

  it('falls back to the original look for a missing or unrecognized material', () => {
    // Covers both an older save (material was never recorded, so undefined)
    // and a stray/malicious value from an out-of-date protocol client.
    for (const templateKey of Object.keys(BUILD_PIECE_DEFS) as BuildPieceKey[]) {
      expect(resolveBuildMaterial(templateKey, undefined)).toBe(DEFAULT_BUILD_MATERIAL[templateKey]);
      expect(resolveBuildMaterial(templateKey, 'not-a-real-material')).toBe(DEFAULT_BUILD_MATERIAL[templateKey]);
      expect(resolveBuildMaterial(templateKey, '')).toBe(DEFAULT_BUILD_MATERIAL[templateKey]);
    }
  });

  it('never lists the same retired option twice', () => {
    expect(new Set(LEGACY_BUILD_MATERIALS).size).toBe(LEGACY_BUILD_MATERIALS.length);
  });

  it('reads a resource and its colorway out of a material id', () => {
    expect(parseBuildMaterial('kraft-twigs')).toEqual({ resource: 'kraft-twigs', colorway: null });
    expect(parseBuildMaterial('kraft-twigs.terracotta')).toEqual({
      resource: 'kraft-twigs',
      colorway: 'terracotta',
    });
    expect(formatBuildMaterial('kraft-twigs', 'terracotta')).toBe('kraft-twigs.terracotta');
    expect(formatBuildMaterial('kraft-twigs')).toBe('kraft-twigs');
  });

  it('does not mistake a retired paper key for a resource', () => {
    // Every retired key contains a dot, same as a colorway does — what
    // separates them is that no resource is called `paper`.
    for (const legacy of LEGACY_BUILD_MATERIALS) {
      expect(parseBuildMaterial(legacy)).toBeNull();
      expect(buildMaterialResource(legacy)).toBeNull();
      expect(isLegacyBuildMaterial(legacy)).toBe(true);
      expect(isBuildMaterial(legacy)).toBe(true);
    }
  });

  it('names no resource for a material that does not exist', () => {
    expect(buildMaterialResource('not-a-resource')).toBeNull();
    expect(buildMaterialResource('not-a-resource.terracotta')).toBeNull();
    expect(isBuildMaterial('not-a-resource')).toBe(false);
  });
});

describe('what a piece costs', () => {
  it('charges every placeable piece something in its chosen material', () => {
    for (const templateKey of Object.keys(BUILD_PIECE_DEFS) as BuildPieceKey[]) {
      expect(buildMaterialUnits(templateKey)).toBeGreaterThan(0);
    }
  });

  it('adds the cost up across every step, so a multi-step structure can charge more', () => {
    const total = BUILD_ASSEMBLY_DEFS['paper-bench'].steps
      .reduce((sum, step) => sum + step.materialUnits, 0);
    expect(buildMaterialUnits('paper-bench')).toBe(total);
  });

  it('costs nothing for a piece that has no assembly plan', () => {
    expect(buildMaterialUnits('future-paper-house')).toBe(0);
  });
});
