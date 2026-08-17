// Phase A acceptance (docs/avatar-and-identity.md): a design survives
// save → sanitize → render, hostile input degrades safely, and every
// catalog entry actually renders.

import { describe, expect, it } from 'vitest';
import {
  DESIGN_LIMITS,
  DESIGN_SHEET,
  sanitizeAvatarDesign,
  type AvatarDesign,
} from '../../../shared/src/index';
import { PAPER_COLORS, PAPER_PATTERNS, SILHOUETTES, findSilhouette } from './catalog';
import { designToSvg } from './render';

function makeDesign(overrides: Partial<AvatarDesign> = {}): AvatarDesign {
  return {
    version: 1,
    id: 'test-design',
    name: 'rainy day snail',
    silhouette: 'snail',
    paper: { color: 'construction-blue', pattern: 'lined' },
    strokes: [{ color: '#b3402e', width: 2.5, points: [10, 10, 40, 60, 70, 20] }],
    preset: 'small',
    sharedOnCard: false,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

describe('sanitizeAvatarDesign', () => {
  it('round-trips a valid design unchanged where it matters', () => {
    const out = sanitizeAvatarDesign(makeDesign());
    expect(out).not.toBeNull();
    expect(out!.silhouette).toBe('snail');
    expect(out!.paper).toEqual({ color: 'construction-blue', pattern: 'lined' });
    expect(out!.strokes).toHaveLength(1);
    expect(out!.strokes[0]!.points).toEqual([10, 10, 40, 60, 70, 20]);
    expect(out!.sharedOnCard).toBe(false);
  });

  it('survives JSON round-trip (the wardrobe path)', () => {
    const out = sanitizeAvatarDesign(JSON.parse(JSON.stringify(makeDesign())));
    expect(out).toEqual(makeDesign());
  });

  it('clamps points onto the sheet and drops non-finite strokes', () => {
    const out = sanitizeAvatarDesign(
      makeDesign({
        strokes: [
          { color: '#b3402e', width: 99, points: [-50, 900, 40, 60] },
          { color: '#b3402e', width: 2, points: [Number.NaN, 3, 4, 5] },
        ],
      }),
    );
    expect(out!.strokes).toHaveLength(1);
    expect(out!.strokes[0]!.width).toBe(DESIGN_LIMITS.strokeWidthMax);
    expect(out!.strokes[0]!.points[0]).toBe(0);
    expect(out!.strokes[0]!.points[1]).toBe(DESIGN_SHEET.height);
  });

  it('refuses markup-bearing colors and unknown keys fall back', () => {
    const out = sanitizeAvatarDesign(
      makeDesign({
        silhouette: '"><script>alert(1)</script>' as string,
        paper: { color: 'not a key!', pattern: 'lined' },
        strokes: [{ color: 'red', width: 2, points: [1, 1, 2, 2] }],
      }),
    );
    expect(out!.silhouette).toBe('round-pal'); // fallback, not the payload
    expect(out!.paper.color).toBe('kraft');
    expect(out!.strokes).toHaveLength(0); // non-hex color dropped
  });

  it('caps stroke count and refuses oversized designs', () => {
    const many = Array.from({ length: DESIGN_LIMITS.maxStrokes + 50 }, () => ({
      color: '#b3402e',
      width: 2,
      points: [1, 1, 2, 2],
    }));
    const out = sanitizeAvatarDesign(makeDesign({ strokes: many }));
    expect(out!.strokes.length).toBeLessThanOrEqual(DESIGN_LIMITS.maxStrokes);
  });

  it('rejects the fundamentally unusable', () => {
    expect(sanitizeAvatarDesign(null)).toBeNull();
    expect(sanitizeAvatarDesign({})).toBeNull();
    expect(sanitizeAvatarDesign(makeDesign({ version: 2 as unknown as 1 }))).toBeNull();
    expect(sanitizeAvatarDesign(makeDesign({ id: '' }))).toBeNull();
  });
});

describe('custom outlines', () => {
  it('keeps a valid drawn outline and renders it as the cutout', () => {
    const out = sanitizeAvatarDesign(
      makeDesign({ silhouette: 'custom', customOutline: [50, 5, 95, 130, 5, 130] }),
    );
    expect(out!.silhouette).toBe('custom');
    expect(out!.customOutline).toEqual([50, 5, 95, 130, 5, 130]);
    const svg = designToSvg(out!);
    expect(svg).toContain('M50 5 L95 130 L5 130 Z');
  });

  it('clamps outline points onto the sheet', () => {
    const out = sanitizeAvatarDesign(
      makeDesign({ silhouette: 'custom', customOutline: [-10, 5, 95, 900, 5, 130] }),
    );
    expect(out!.customOutline![0]).toBe(0);
    expect(out!.customOutline![3]).toBe(DESIGN_SHEET.height);
  });

  it('degrades an unusable outline to a template, and drops stray outlines', () => {
    const tooFew = sanitizeAvatarDesign(
      makeDesign({ silhouette: 'custom', customOutline: [1, 2] }),
    );
    expect(tooFew!.silhouette).toBe('round-pal');
    expect(tooFew!.customOutline).toBeUndefined();

    const notCustom = sanitizeAvatarDesign(
      makeDesign({ silhouette: 'snail', customOutline: [50, 5, 95, 130, 5, 130] }),
    );
    expect(notCustom!.customOutline).toBeUndefined();

    const nan = sanitizeAvatarDesign(
      makeDesign({ silhouette: 'custom', customOutline: [Number.NaN, 2, 3, 4, 5, 6] }),
    );
    expect(nan!.silhouette).toBe('round-pal');
  });

  it('caps outline length', () => {
    const long = Array.from({ length: DESIGN_LIMITS.maxOutlinePoints * 2 + 100 }, (_, i) => i % 100);
    const out = sanitizeAvatarDesign(makeDesign({ silhouette: 'custom', customOutline: long }));
    expect(out!.customOutline!.length).toBeLessThanOrEqual(DESIGN_LIMITS.maxOutlinePoints * 2);
  });
});

describe('catalog', () => {
  it('has unique keys and a preset for every silhouette', () => {
    const keys = SILHOUETTES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SILHOUETTES) {
      expect(s.spoken.length).toBeGreaterThan(10); // real descriptions, not stubs
      expect(s.preset).toBeTruthy();
      expect(s.keywords.length).toBeGreaterThanOrEqual(2); // searchable, not decorative
      for (const k of s.keywords) expect(k).toBe(k.toLowerCase());
    }
  });

  it('reserves the "custom" key for drawn cutouts', () => {
    expect(SILHOUETTES.some((s) => s.key === 'custom')).toBe(false);
  });

  it('falls back to the first silhouette for unknown keys', () => {
    expect(findSilhouette('never-heard-of-it').key).toBe(SILHOUETTES[0]!.key);
  });
});

describe('designToSvg', () => {
  it('renders every silhouette × pattern without throwing', () => {
    for (const s of SILHOUETTES) {
      for (const pattern of PAPER_PATTERNS) {
        const svg = designToSvg(
          makeDesign({
            silhouette: s.key,
            preset: s.preset,
            paper: { color: PAPER_COLORS[0]!.key, pattern: pattern.key },
          }),
        );
        expect(svg).toContain('<svg');
        expect(svg).toContain('clipPath');
      }
    }
  });

  it('contains the strokes and the paper fill', () => {
    const svg = designToSvg(makeDesign());
    expect(svg).toContain('polyline');
    expect(svg).toContain('#7d9ec4'); // pond blue paper fill
  });

  it('never emits raw user text (sanitized designs only carry keys/hex)', () => {
    const design = sanitizeAvatarDesign(
      makeDesign({ name: '<img onerror=x>', id: 'weird"id' }),
    )!;
    const svg = designToSvg(design);
    expect(svg).not.toContain('<img');
    expect(svg).not.toContain('"id');
  });
});

describe('stroke media', () => {
  const base = {
    version: 1 as const,
    id: 'media-test',
    name: 'test',
    silhouette: 'round-pal',
    paper: { color: 'kraft', pattern: 'plain' },
    strokes: [],
    preset: 'medium' as const,
    sharedOnCard: false,
    createdAt: 0,
    updatedAt: 0,
  };

  it('keeps a known medium and drops an invented one', () => {
    const design = sanitizeAvatarDesign({
      ...base,
      strokes: [
        { color: '#b3402e', width: 2, points: [10, 10, 20, 20], medium: 'spray' },
        { color: '#b3402e', width: 2, points: [10, 10, 20, 20], medium: 'airbrush' },
      ],
    });
    expect(design?.strokes[0]?.medium).toBe('spray');
    // Unknown media fall back to crayon rather than rejecting the stroke: a
    // newer client's medium should degrade to a mark, not to a hole.
    expect(design?.strokes[1]?.medium).toBeUndefined();
  });

  it('renders translucent media translucent, and speckles the spray', () => {
    const design = sanitizeAvatarDesign({
      ...base,
      strokes: [
        { color: '#b3402e', width: 2, points: [10, 10, 20, 20], medium: 'watercolor' },
        { color: '#3f6ea6', width: 2, points: [30, 30, 40, 40], medium: 'spray' },
      ],
    })!;
    const svg = designToSvg(design);
    // Both build up by being separate translucent elements — no medium is
    // allowed to reach full opacity, or it would hide the paper pattern.
    const opacities = [...svg.matchAll(/stroke-opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(opacities.filter((o) => o < 1).length).toBe(2);
    expect(svg).toContain('feTurbulence');
    expect(svg).toContain('filter="url(#spray-');
  });

  it('leaves crayon strokes exactly as they were before media existed', () => {
    const design = sanitizeAvatarDesign({
      ...base,
      strokes: [{ color: '#b3402e', width: 2, points: [10, 10, 20, 20] }],
    })!;
    expect(design.strokes[0]).not.toHaveProperty('medium');
    expect(designToSvg(design)).toContain('stroke-opacity="1"');
  });
});
