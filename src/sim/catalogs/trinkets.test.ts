import { describe, expect, it } from 'vitest';
import {
  TRINKET_FAMILIES,
  TRINKET_FAMILY_ORDER,
  WINDUP_SHAPES,
  allTrinketDefs,
  getTrinketDef,
  pickTrinketDef,
  trinketDefsInFamily,
} from './trinkets';

describe('trinket catalog', () => {
  const defs = allTrinketDefs();

  it('offers a deep pool — the no-duplicates rule needs supply to outrun demand', () => {
    expect(defs.length).toBeGreaterThan(300);
  });

  it('has unique ids', () => {
    const ids = defs.map((def) => def.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('describes every trinket in full', () => {
    for (const def of defs) {
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(TRINKET_FAMILY_ORDER).toContain(def.family);
      expect(def.palette.base).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(def.palette.accent).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(def.palette.detail).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(def.rarity).toBeGreaterThanOrEqual(1);
      expect(def.rarity).toBeLessThanOrEqual(3);
      expect(def.scale).toBeGreaterThan(0.5);
      expect(def.scale).toBeLessThan(1.8);
    }
  });

  it('covers every family and every wind-up shape', () => {
    for (const family of TRINKET_FAMILY_ORDER) {
      expect(trinketDefsInFamily(family).length).toBeGreaterThan(0);
    }
    const shapesPresent = new Set(defs.map((def) => def.shape));
    for (const shape of WINDUP_SHAPES) expect(shapesPresent.has(shape)).toBe(true);
  });

  it('looks a def up by id, and returns null for a stranger', () => {
    const first = defs[0];
    expect(getTrinketDef(first.id)?.id).toBe(first.id);
    expect(getTrinketDef('not-a-real-trinket')).toBeNull();
  });
});

describe('uniqueness picking', () => {
  const defs = allTrinketDefs();

  it('never repeats a definition while fresh ones remain', () => {
    const owned = new Set<string>();
    for (let index = 0; index < 120; index += 1) {
      const picked = pickTrinketDef({}, owned, index * 7919);
      expect(owned.has(picked.id)).toBe(false);
      owned.add(picked.id);
    }
    expect(owned.size).toBe(120);
  });

  it('respects a family filter', () => {
    const picked = pickTrinketDef({ family: 'handmade' }, new Set(), 42);
    expect(picked.family).toBe('handmade');
  });

  it('respects a shape filter', () => {
    const picked = pickTrinketDef({ shapes: ['windup-fox'] }, new Set(), 7);
    expect(picked.shape).toBe('windup-fox');
  });

  it('falls back to a duplicate rather than handing back nothing', () => {
    const everything = new Set(defs.map((def) => def.id));
    const picked = pickTrinketDef({ family: 'found' }, everything, 1);
    expect(picked.family).toBe('found');
  });

  it('spreads the same quest across different trinkets for different seeds', () => {
    const picks = new Set(
      Array.from({ length: 40 }, (_, index) => pickTrinketDef({ family: 'story' }, new Set(), index * 104729).id),
    );
    // A single fixed reward would be a broken generator; several distinct ones
    // is the "two players, two keepsakes" behaviour the owner asked for.
    expect(picks.size).toBeGreaterThan(1);
    const sample = pickTrinketDef({ family: 'story' }, new Set(), 1001);
    expect(TRINKET_FAMILIES[sample.family].id).toBe('story');
  });
});
