// Guards the generated shape catalog.
//
// The compiler fits artwork drawn at any size into the design sheet and bakes
// the transform into the coordinates. That bake is the thing worth testing:
// if it ever drifts, shapes silently hang off the sheet, clip against the
// cut edge, or float above the ground line — all of which look like "the
// renderer is broken" and none of which are.

import { describe, expect, it } from 'vitest';
import { DESIGN_CUTOUT, DESIGN_GROUND_Y, DESIGN_SHEET } from '../../../shared/src/index';
import { CATEGORY_ORDER, SILHOUETTES } from './catalog';

/**
 * Points along the drawn curve — not the control points.
 *
 * The distinction matters: a bezier's control points routinely sit outside the
 * ink (that is how a curve bulges), so measuring them would fail a shape that
 * fits perfectly. The compiler fits the flattened curve, so the test has to
 * measure the flattened curve too.
 */
function inkPoints(path: string): Array<[number, number]> {
  const tokens = path.match(/[MLCQZ]|-?\d+(?:\.\d+)?/g) ?? [];
  const out: Array<[number, number]> = [];
  let x = 0;
  let y = 0;
  let i = 0;
  const next = () => Number(tokens[i++]);

  while (i < tokens.length) {
    const command = tokens[i++];
    if (command === 'Z') continue;
    if (command === 'M' || command === 'L') {
      x = next();
      y = next();
      out.push([x, y]);
    } else if (command === 'C') {
      const [c1x, c1y, c2x, c2y, nx, ny] = [next(), next(), next(), next(), next(), next()];
      for (let s = 1; s <= 24; s += 1) {
        const t = s / 24;
        const u = 1 - t;
        out.push([
          u * u * u * x + 3 * u * u * t * c1x! + 3 * u * t * t * c2x! + t * t * t * nx!,
          u * u * u * y + 3 * u * u * t * c1y! + 3 * u * t * t * c2y! + t * t * t * ny!,
        ]);
      }
      x = nx!;
      y = ny!;
    } else if (command === 'Q') {
      const [cx, cy, nx, ny] = [next(), next(), next(), next()];
      for (let s = 1; s <= 24; s += 1) {
        const t = s / 24;
        const u = 1 - t;
        out.push([
          u * u * x + 2 * u * t * cx! + t * t * nx!,
          u * u * y + 2 * u * t * cy! + t * t * ny!,
        ]);
      }
      x = nx!;
      y = ny!;
    }
  }
  return out;
}

describe('generated silhouettes', () => {
  it('leaves a ring of sheet outside the cutout box for stamps', () => {
    // If these ever meet, appendages have nowhere to go and every arm gets
    // clipped at the sheet edge.
    expect(DESIGN_CUTOUT.x).toBeGreaterThan(0);
    expect(DESIGN_CUTOUT.x + DESIGN_CUTOUT.width).toBeLessThan(DESIGN_SHEET.width);
    expect(DESIGN_CUTOUT.y).toBeGreaterThan(0);
    expect(DESIGN_CUTOUT.y + DESIGN_CUTOUT.height).toBeLessThanOrEqual(DESIGN_SHEET.height);
  });

  it('ships a catalog', () => {
    expect(SILHOUETTES.length).toBeGreaterThan(20);
  });

  it('has unique, kebab-case keys that never collide with "custom"', () => {
    const keys = SILHOUETTES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9-]+$/);
      expect(key).not.toBe('custom');
    }
  });

  it('keeps the fallback silhouette sanitizeAvatarDesign degrades to', () => {
    // shared/protocol/avatarDesign.ts falls back to 'round-pal' for an unknown
    // or unusable silhouette; deleting it would strand every corrupt design.
    expect(SILHOUETTES.some((s) => s.key === 'round-pal')).toBe(true);
  });

  it('describes every shape for screen readers and search', () => {
    for (const shape of SILHOUETTES) {
      expect(shape.label.length).toBeGreaterThan(0);
      expect(shape.spoken.length).toBeGreaterThanOrEqual(10);
      expect(shape.keywords.length).toBeGreaterThanOrEqual(2);
      expect(shape.keywords).toEqual(shape.keywords.map((k) => k.toLowerCase()));
      expect(CATEGORY_ORDER).toContain(shape.category);
    }
  });

  it('fits every path inside the cutout box', () => {
    for (const shape of SILHOUETTES) {
      // Reduce first, assert once: an expect() per sampled point is tens of
      // thousands of assertions and turns a 10ms test into a slow one.
      const pairs = inkPoints(shape.path);
      const xs = pairs.map(([x]) => x);
      const ys = pairs.map(([, y]) => y);
      // The cutout box, not the whole sheet: the ring around it belongs to
      // stamped-on arms, legs and hair, and a silhouette must not eat into it.
      expect(
        [
          Math.min(...xs) >= DESIGN_CUTOUT.x,
          Math.max(...xs) <= DESIGN_CUTOUT.x + DESIGN_CUTOUT.width,
        ],
        `${shape.key} runs outside the cutout box horizontally`,
      ).toEqual([true, true]);
      expect(
        [
          Math.min(...ys) >= DESIGN_CUTOUT.y,
          Math.max(...ys) <= DESIGN_CUTOUT.y + DESIGN_CUTOUT.height,
        ],
        `${shape.key} runs outside the cutout box vertically`,
      ).toEqual([true, true]);
    }
  });

  it('fills the sheet and stands on the shared ground line', () => {
    for (const shape of SILHOUETTES) {
      const pairs = inkPoints(shape.path);
      const xs = pairs.map(([x]) => x);
      const ys = pairs.map(([, y]) => y);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);

      // One uniform scale, longest side governing: whichever side the fit was
      // limited by has to actually reach the sheet, or the shape is drawn too
      // small next to its neighbours.
      const fillsWidth = width > DESIGN_CUTOUT.width * 0.9;
      const fillsHeight = height > DESIGN_CUTOUT.height * 0.9;
      expect(fillsWidth || fillsHeight, `${shape.key} is undersized`).toBe(true);

      // Bottom-anchored: feet on the shared ground line, not floating.
      expect(Math.max(...ys), `${shape.key} is off the ground`).toBeGreaterThan(DESIGN_GROUND_Y - 3);
      expect(Math.max(...ys), `${shape.key} sinks below the ground`).toBeLessThan(
        DESIGN_GROUND_Y + 1,
      );
      // Centred horizontally on the cutout box, within rounding.
      const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
      expect(
        Math.abs(centre - (DESIGN_CUTOUT.x + DESIGN_CUTOUT.width / 2)),
        `${shape.key} is off-centre`,
      ).toBeLessThan(1);
    }
  });
});
