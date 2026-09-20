import { describe, expect, it } from 'vitest';
import {
  MAKER_HIT_BOX,
  MAX_MAKER_LEVEL,
  makerLook,
  makerLookLevel,
  type MakerPart,
} from './thingMakerLook';

const LEVELS = [1, 2, 3];

describe('thing maker look', () => {
  it('adds parts with every level and never takes one away', () => {
    for (const level of [2, 3]) {
      const before = makerLook(level - 1).parts;
      const now = makerLook(level).parts;
      expect(now.size).toBeGreaterThan(before.size);
      for (const part of before) expect(now.has(part)).toBe(true);
    }
  });

  it('gives level 3 every part, including the ones that spin', () => {
    const parts = makerLook(3).parts;
    for (const part of ['rollers', 'strands', 'console', 'belly', 'column', 'gauge', 'lever'] as MakerPart[]) {
      expect(parts.has(part)).toBe(true);
    }
  });

  it('keeps the low levels plain: no rollers or strands before level 3', () => {
    for (const level of [1, 2]) {
      expect(makerLook(level).parts.has('rollers')).toBe(false);
      expect(makerLook(level).parts.has('strands')).toBe(false);
    }
  });

  it('gives every level a bell, a face, a crank, a plan slot, buttons and a tray', () => {
    for (const level of LEVELS) {
      const parts = makerLook(level).parts;
      for (const part of ['bell', 'eyes', 'crank', 'slot', 'buttons', 'tray'] as MakerPart[]) {
        expect(parts.has(part)).toBe(true);
      }
    }
  });

  it('keeps the machine about the same height at every level', () => {
    const heights = LEVELS.map((level) => makerLook(level).height);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.1);
  });

  it('gets wider and more wide-eyed as it levels up', () => {
    expect(makerLook(1).bodyWidth).toBeLessThan(makerLook(2).bodyWidth);
    expect(makerLook(2).bodyWidth).toBeLessThan(makerLook(3).bodyWidth);
    expect(makerLook(1).eyeRadius).toBeLessThan(makerLook(2).eyeRadius);
    expect(makerLook(2).eyeRadius).toBeLessThan(makerLook(3).eyeRadius);
  });

  it('tolerates odd levels from an old or edited save', () => {
    expect(makerLookLevel(0)).toBe(1);
    expect(makerLookLevel(99)).toBe(MAX_MAKER_LEVEL);
    expect(makerLookLevel(Number.NaN)).toBe(1);
    expect(makerLookLevel(2.4)).toBe(2);
  });

  it('keeps the pointer target as big as the full machine', () => {
    expect(MAKER_HIT_BOX.width).toBeGreaterThan(2);
    expect(MAKER_HIT_BOX.height).toBeGreaterThan(1.4);
  });
});
