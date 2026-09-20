import { describe, expect, it } from 'vitest';
import {
  MATERIAL_TAG_IDS,
  PROCESS_STAGE_IDS,
  STRUCTURAL_CLASS_IDS,
  type MaterialTag,
} from './materials';
import {
  RESOURCE_CATEGORIES,
  RESOURCE_CORE_DEFS,
  RESOURCE_IDS,
  resourcesWithTag,
  type ResourceId,
} from './resources';
import { obtainRoutesFor } from './obtaining';
import { MILL_REFINEMENTS, type MillRefinement } from './millRefining';

const refinements = MILL_REFINEMENTS as readonly MillRefinement[];

/**
 * The catalog validation the materials design asks for.
 *
 * Its job is to make a whole class of quiet mistake loud: a material with no
 * way to get it, a tag nothing carries, a refinement that consumes something
 * more worked than what it produces, two refinements fighting over one output. None of these break a build or fail a render — they
 * just make the world subtly wrong, months later, in a way that is expensive
 * to trace back.
 */

describe('every material is described along the same axes', () => {
  it('gives each resource a valid processing stage and structural class', () => {
    for (const id of RESOURCE_IDS) {
      const def = RESOURCE_CORE_DEFS[id];
      expect(PROCESS_STAGE_IDS, `${id} processStage`).toContain(def.processStage);
      expect(STRUCTURAL_CLASS_IDS, `${id} structuralClass`).toContain(def.structuralClass);
    }
  });

  it('gives each resource at least one tag, all from the controlled vocabulary', () => {
    for (const id of RESOURCE_IDS) {
      const tags = RESOURCE_CORE_DEFS[id].tags;
      expect(tags.length, `${id} has no tags`).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(MATERIAL_TAG_IDS, `${id} carries unknown tag ${tag}`).toContain(tag);
      }
      expect(new Set(tags).size, `${id} repeats a tag`).toBe(tags.length);
    }
  });

  it('keeps no tag in the vocabulary that nothing carries', () => {
    for (const tag of MATERIAL_TAG_IDS) {
      expect(resourcesWithTag(tag).length, `nothing is tagged ${tag}`).toBeGreaterThan(0);
    }
  });

  it('files every resource under a real category', () => {
    for (const id of RESOURCE_IDS) {
      expect(Object.keys(RESOURCE_CATEGORIES)).toContain(RESOURCE_CORE_DEFS[id].category);
    }
  });
});

describe('the refining board cannot contradict the material catalog', () => {
  it('names only resources that exist, on both sides of every refinement', () => {
    for (const refinement of refinements) {
      expect(RESOURCE_IDS, `${refinement.id} outputs a missing resource`).toContain(refinement.output);
      for (const input of refinement.inputs) {
        if (input.kind === 'exact') {
          expect(RESOURCE_IDS, `${refinement.id} wants a missing resource`).toContain(input.resource);
        }
      }
    }
  });

  it('lets only one refinement claim a given material', () => {
    const outputs = refinements.map((refinement) => refinement.output);
    expect(new Set(outputs).size).toBe(outputs.length);
  });
});

/** Routes that hand you the material as the world made it, not as a shop or workshop did. */
function worldRoutes(resource: ResourceId) {
  // Refining at the mill is working stock up, not the world handing it over.
  return obtainRoutesFor(resource).filter((route) => route.kind !== 'bought' && route.kind !== 'refined');
}

describe('no material exists without a way to get it', () => {
  it('can say out loud how every single resource is obtained', () => {
    for (const id of RESOURCE_IDS) {
      expect(obtainRoutesFor(id).length, `${id} cannot be obtained any way at all`).toBeGreaterThan(0);
    }
  });

  it('keeps raw materials raw: anything the world hands you directly is stage 0', () => {
    for (const id of RESOURCE_IDS) {
      if (worldRoutes(id).length === 0) continue;
      expect(
        RESOURCE_CORE_DEFS[id].processStage,
        `${id} is found in the world but claims to be worked`,
      ).toBe(0);
    }
  });

  it('keeps refined-only materials out of stage 0', () => {
    for (const refinement of refinements) {
      expect(
        RESOURCE_CORE_DEFS[refinement.output].processStage,
        `${refinement.output} is only ever refined but sits at stage 0`,
      ).toBeGreaterThan(0);
    }
  });
});
