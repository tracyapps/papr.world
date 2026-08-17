// Guards the generated stamp catalog and the way stamps are rendered.
//
// Two classes of bug this is here to catch:
//   * normalization drift — a stamp that is not centred on its own origin
//     rotates around the wrong point and jumps when you resize it;
//   * layer confusion — an arm rendered inside the clip group is invisible
//     outside the cutout, which is the entire reason stamps exist.

import { describe, expect, it } from 'vitest';
import { DESIGN_LIMITS, sanitizeAvatarDesign, type AvatarDesign } from '../../../shared/src/index';
import { STAMPS, STAMP_CATEGORY_ORDER, STAMP_NATURAL_SIZE, findStamp } from './catalog';
import { designToSvg } from './render';

const ROLES = ['ink', 'paper', 'shadow'];

/**
 * Extent of the *drawn curve*, not of the control points.
 *
 * Control points sit outside the ink wherever a curve bulges, so measuring
 * them would report a stamp as off-centre when the compiler centred it
 * perfectly — the compiler measures flattened curves, so this has to as well.
 */
function extent(path: string): { minX: number; maxX: number; minY: number; maxY: number } {
  const tokens = path.match(/[MLCZ]|-?\d+(?:\.\d+)?/g) ?? [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const see = (x: number, y: number) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };

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
      see(x, y);
    } else if (command === 'C') {
      const [c1x, c1y, c2x, c2y, nx, ny] = [next(), next(), next(), next(), next(), next()];
      for (let s = 1; s <= 24; s += 1) {
        const t = s / 24;
        const u = 1 - t;
        see(
          u * u * u * x + 3 * u * u * t * c1x! + 3 * u * t * t * c2x! + t * t * t * nx!,
          u * u * u * y + 3 * u * u * t * c1y! + 3 * u * t * t * c2y! + t * t * t * ny!,
        );
      }
      x = nx!;
      y = ny!;
    }
  }
  return { minX, maxX, minY, maxY };
}

function designWith(stamps: AvatarDesign['stamps']): AvatarDesign {
  return {
    version: 1,
    id: 'test-design',
    name: 'test',
    silhouette: 'round-pal',
    paper: { color: 'kraft', pattern: 'plain' },
    stamps,
    strokes: [],
    preset: 'medium',
    sharedOnCard: false,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('generated stamps', () => {
  it('ships a catalog with both layers represented', () => {
    expect(STAMPS.length).toBeGreaterThan(10);
    expect(STAMPS.some((s) => s.layer === 'on')).toBe(true);
    expect(STAMPS.some((s) => s.layer === 'behind')).toBe(true);
  });

  it('describes every stamp for screen readers and search', () => {
    for (const stamp of STAMPS) {
      expect(stamp.spoken.length, stamp.key).toBeGreaterThanOrEqual(10);
      expect(stamp.keywords.length, stamp.key).toBeGreaterThanOrEqual(2);
      expect(STAMP_CATEGORY_ORDER, stamp.key).toContain(stamp.category);
      expect(stamp.parts.length, stamp.key).toBeGreaterThan(0);
      for (const part of stamp.parts) expect(ROLES, stamp.key).toContain(part.role);
    }
  });

  it('normalizes every stamp to natural size, centred on its own origin', () => {
    for (const stamp of STAMPS) {
      const bounds = stamp.parts.map((p) => extent(p.path));
      const minX = Math.min(...bounds.map((b) => b.minX));
      const maxX = Math.max(...bounds.map((b) => b.maxX));
      const minY = Math.min(...bounds.map((b) => b.minY));
      const maxY = Math.max(...bounds.map((b) => b.maxY));

      // Centred: rotation and scaling both pivot on (0, 0), so an off-centre
      // stamp would swing away from where the player put it.
      expect(Math.abs(minX + maxX), `${stamp.key} is off-centre horizontally`).toBeLessThan(2);
      expect(Math.abs(minY + maxY), `${stamp.key} is off-centre vertically`).toBeLessThan(2);

      // Longest side is the natural size, so "scale 1" means the same thing
      // for every stamp and the tray reads as one consistent set.
      const longest = Math.max(maxX - minX, maxY - minY);
      expect(longest, `${stamp.key} is not normalized`).toBeGreaterThan(STAMP_NATURAL_SIZE - 3);
      expect(longest, `${stamp.key} is not normalized`).toBeLessThan(STAMP_NATURAL_SIZE + 3);
    }
  });

  it('finds stamps by key, and answers null for keys it does not have', () => {
    expect(findStamp(STAMPS[0]!.key)?.key).toBe(STAMPS[0]!.key);
    // Never substitute: a design naming a retired stamp should lose it, not
    // gain something the player never chose.
    expect(findStamp('no-such-stamp')).toBeNull();
  });
});

describe('rendering stamps', () => {
  const behind = STAMPS.find((s) => s.layer === 'behind')!;
  const on = STAMPS.find((s) => s.layer === 'on')!;
  const place = (key: string) => ({ key, x: 60, y: 80, scale: 1, rotation: 0, flip: false, color: '#2b2620' });

  it('puts "behind" stamps outside the clip and "on" stamps inside it', () => {
    const svg = designToSvg(designWith([place(behind.key), place(on.key)]));
    const clipAt = svg.indexOf('<g clip-path');
    const behindAt = svg.indexOf('data-stamp="0"');
    const onAt = svg.indexOf('data-stamp="1"');

    expect(behindAt).toBeGreaterThan(-1);
    expect(onAt).toBeGreaterThan(-1);
    // An appendage inside the clip group is invisible outside the cutout —
    // which would quietly defeat the whole feature.
    expect(behindAt).toBeLessThan(clipAt);
    expect(onAt).toBeGreaterThan(clipAt);
  });

  it('lifts a backed face out of the clip, onto its own paper', () => {
    const clipped = designToSvg(designWith([place(on.key)]));
    const backed = designToSvg(designWith([{ ...place(on.key), backing: true }]));
    const clipAt = (svg: string) => svg.indexOf('<g clip-path');

    // Unbacked: inside the clip, so a hole in the silhouette eats it.
    expect(clipped.indexOf('data-stamp="0"')).toBeGreaterThan(clipAt(clipped));
    // Backed: outside the clip, because the whole point is surviving holes.
    expect(backed.indexOf('data-stamp="0"')).toBeGreaterThan(clipAt(backed));
    expect(backed.indexOf('data-stamp="0"')).toBeGreaterThan(backed.indexOf('</g>'));
    // And it carries a fatter die-cut than an ordinary blade line.
    const widths = [...backed.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(Math.max(...widths)).toBeGreaterThan(4);
  });

  it('skips stamps whose key this build does not have', () => {
    const svg = designToSvg(designWith([place('no-such-stamp')]));
    expect(svg).not.toContain('data-stamp');
  });

  it('scales the cut edge against the stamp scale, so blade lines stay even', () => {
    const small = designToSvg(designWith([{ ...place(behind.key), scale: 0.5 }]));
    const large = designToSvg(designWith([{ ...place(behind.key), scale: 2 }]));
    const widthOf = (svg: string) => Number(svg.match(/stroke-width="([\d.]+)"/)?.[1]);
    expect(widthOf(small)).toBeGreaterThan(widthOf(large));
  });
});

describe('the drawing as a layer', () => {
  const on = STAMPS.find((s) => s.layer === 'on')!;
  const withDrawing = (drawingIndex?: number): AvatarDesign => ({
    ...designWith([
      { key: on.key, x: 60, y: 80, scale: 1, rotation: 0, flip: false, color: '#2b2620' },
    ]),
    strokes: [{ color: '#b3402e', width: 2, points: [40, 40, 60, 60] }],
    ...(drawingIndex === undefined ? {} : { drawingIndex }),
  });

  it('paints the drawing last by default, and before a stamp when moved back', () => {
    const onTop = designToSvg(withDrawing());
    expect(onTop.indexOf('<polyline')).toBeGreaterThan(onTop.indexOf('data-stamp="0"'));

    // drawingIndex 0 = nothing painted before it, so the face lands on top.
    const underneath = designToSvg(withDrawing(0));
    expect(underneath.indexOf('<polyline')).toBeLessThan(underneath.indexOf('data-stamp="0"'));
  });

  it('hides the drawing and the stamps independently', () => {
    expect(designToSvg({ ...withDrawing(), drawingHidden: true })).not.toContain('<polyline');
    const design = withDrawing();
    design.stamps![0]!.hidden = true;
    expect(designToSvg(design)).not.toContain('data-stamp');
  });
});

describe('sanitizing stamps', () => {
  const base = designWith([]);
  const place = (key: string) => ({
    key,
    x: 60,
    y: 80,
    scale: 1,
    rotation: 0,
    flip: false,
    color: '#2b2620',
  });

  it('clamps position, scale and rotation into range', () => {
    const design = sanitizeAvatarDesign({
      ...base,
      stamps: [{ key: 'eyes-dots', x: -50, y: 9999, scale: 99, rotation: 900, flip: 'yes', color: 'red' }],
    });
    const stamp = design?.stamps?.[0];
    expect(stamp?.x).toBe(0);
    expect(stamp?.scale).toBe(DESIGN_LIMITS.stampScaleMax);
    expect(stamp?.rotation).toBeGreaterThanOrEqual(-180);
    expect(stamp?.rotation).toBeLessThanOrEqual(180);
    // Anything not exactly true is false, and a bad colour falls back to ink
    // rather than rejecting the whole design.
    expect(stamp?.flip).toBe(false);
    expect(stamp?.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('drops unusable stamps and caps the count', () => {
    const design = sanitizeAvatarDesign({
      ...base,
      stamps: [
        { key: 'Bad Key!', x: 1, y: 1 },
        { key: 'eyes-dots', x: 'nope', y: 1 },
        ...Array.from({ length: DESIGN_LIMITS.maxStamps + 10 }, () => ({
          key: 'eyes-dots',
          x: 10,
          y: 10,
          scale: 1,
          rotation: 0,
          flip: false,
          color: '#2b2620',
        })),
      ],
    });
    expect(design?.stamps?.length).toBeLessThanOrEqual(DESIGN_LIMITS.maxStamps);
    expect(design?.stamps?.every((s) => /^[a-z0-9-]+$/.test(s.key))).toBe(true);
  });

  it('carries a hidden flag, and omits it when visible', () => {
    const shown = sanitizeAvatarDesign({
      ...base,
      stamps: [place('eyes-dots')],
    });
    expect(shown?.stamps?.[0]).not.toHaveProperty('hidden');
    const hidden = sanitizeAvatarDesign({
      ...base,
      stamps: [{ ...place('eyes-dots'), hidden: true }],
    });
    expect(hidden?.stamps?.[0]?.hidden).toBe(true);
  });

  it('leaves the field off entirely when there are no stamps', () => {
    const design = sanitizeAvatarDesign({ ...base, stamps: [] });
    expect(design).not.toBeNull();
    expect('stamps' in (design as object)).toBe(false);
  });

  it('still accepts designs saved before stamps existed', () => {
    const { stamps, ...withoutStamps } = base;
    void stamps;
    expect(sanitizeAvatarDesign(withoutStamps)).not.toBeNull();
  });
});
