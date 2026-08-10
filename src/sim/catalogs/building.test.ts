import { describe, expect, it } from 'vitest';
import {
  BUILD_ASSEMBLY_DEFS,
  nextBuildStep,
  validateBuildAssembly,
  type BuildAssemblyDefinition,
} from './building';
import { BUILD_PIECE_DEFS } from '../../world/buildPieces';

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
          materials: [], producesPart: 'frame',
        },
        {
          id: 'walls', label: 'Making wall panels', verb: 'build', durationSeconds: 2,
          materials: [], producesPart: 'wall-panels',
        },
        {
          id: 'shell', label: 'Assembling', verb: 'assemble', durationSeconds: 3,
          materials: [{ kind: 'exact', resource: 'mossy-paper-fiber', quantity: 1 }],
          requiresParts: ['frame', 'wall-panels'], join: 'tape',
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
        materials: [], requiresParts: ['missing-roof'], join: 'tape',
      }],
    };

    expect(validateBuildAssembly(invalid)).toContain('Step join requires unknown part missing-roof.');
  });
});
