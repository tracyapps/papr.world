import { describe, expect, it } from 'vitest';
import { DESIGN_LIMITS, DESIGN_SHEET, sanitizeAvatarDesign, sanitizeCustomShape } from './avatarDesign';

const triangle = [20, 30, 80, 30, 50, 120];

function design(extra: Record<string, unknown>) {
  return {
    version: 1,
    id: 'd1',
    name: 'test',
    silhouette: 'custom',
    paper: { color: 'kraft', pattern: 'plain' },
    strokes: [],
    preset: 'medium',
    sharedOnCard: false,
    createdAt: 1,
    updatedAt: 1,
    ...extra,
  };
}

describe('sanitizeCustomShape', () => {
  it('keeps a well-formed piece', () => {
    expect(sanitizeCustomShape({ pieces: [{ op: 'add', points: triangle }] })).toEqual({
      pieces: [{ op: 'add', points: triangle }],
    });
  });

  it('needs at least one piece that adds', () => {
    expect(sanitizeCustomShape({ pieces: [{ op: 'subtract', points: triangle }] })).toBeNull();
    expect(sanitizeCustomShape({ pieces: [] })).toBeNull();
    expect(sanitizeCustomShape(null)).toBeNull();
    expect(sanitizeCustomShape('shape')).toBeNull();
  });

  it('drops a piece with fewer than three anchors or a bad number', () => {
    const shape = sanitizeCustomShape({
      pieces: [
        { op: 'add', points: triangle },
        { op: 'add', points: [1, 2, 3, 4] },
        { op: 'subtract', points: [1, 2, 3, 4, Number.NaN, 5] },
      ],
    });
    expect(shape?.pieces).toHaveLength(1);
  });

  it('treats an unknown op as add, and clamps points onto the sheet', () => {
    const shape = sanitizeCustomShape({ pieces: [{ op: 'weird', points: [-10, -10, 500, 0, 60, 900] }] });
    expect(shape?.pieces[0]).toEqual({
      op: 'add',
      points: [0, 0, DESIGN_SHEET.width, 0, 60, DESIGN_SHEET.height],
    });
  });

  it('rounds coordinates to a tenth', () => {
    const shape = sanitizeCustomShape({ pieces: [{ op: 'add', points: [10.123456, 20.987654, 30, 30, 40, 50] }] });
    expect(shape?.pieces[0]?.points.slice(0, 2)).toEqual([10.1, 21]);
  });

  it('keeps only valid, unique, sorted sharp indexes', () => {
    const shape = sanitizeCustomShape({
      pieces: [{ op: 'add', points: triangle, sharp: [2, 0, 2, 7, -1, 1.5, 'x'] }],
    });
    expect(shape?.pieces[0]?.sharp).toEqual([0, 2]);
  });

  it('bounds pieces and anchors', () => {
    const many = Array.from({ length: DESIGN_LIMITS.maxShapePieces + 5 }, () => ({ op: 'add', points: triangle }));
    expect(sanitizeCustomShape({ pieces: many })?.pieces).toHaveLength(DESIGN_LIMITS.maxShapePieces);

    const big = Array.from({ length: DESIGN_LIMITS.maxShapeAnchors * 2 + 40 }, (_, i) => (i % 100) + 1);
    const shape = sanitizeCustomShape({ pieces: [{ op: 'add', points: big }] });
    expect((shape?.pieces[0]?.points.length ?? 0) / 2).toBeLessThanOrEqual(DESIGN_LIMITS.maxShapeAnchors);
  });
});

describe('a design with a custom shape', () => {
  it('keeps the shape beside the legacy outline', () => {
    const result = sanitizeAvatarDesign(
      design({ customOutline: triangle, customShape: { pieces: [{ op: 'add', points: triangle }] } }),
    );
    expect(result?.silhouette).toBe('custom');
    expect(result?.customOutline).toEqual(triangle);
    expect(result?.customShape?.pieces).toHaveLength(1);
  });

  it('is fine with only the shape', () => {
    const result = sanitizeAvatarDesign(design({ customShape: { pieces: [{ op: 'add', points: triangle }] } }));
    expect(result?.silhouette).toBe('custom');
    expect(result?.customOutline).toBeUndefined();
  });

  it('is fine with only the legacy outline (a design saved before shapes could be edited)', () => {
    const result = sanitizeAvatarDesign(design({ customOutline: triangle }));
    expect(result?.silhouette).toBe('custom');
    expect(result?.customShape).toBeUndefined();
  });

  it('falls back to a template when neither is usable', () => {
    const result = sanitizeAvatarDesign(design({ customOutline: [1, 2], customShape: { pieces: [] } }));
    expect(result?.silhouette).toBe('round-pal');
    expect(result?.customShape).toBeUndefined();
  });

  it('ignores a custom shape on a template silhouette', () => {
    const result = sanitizeAvatarDesign(
      design({ silhouette: 'round-pal', customShape: { pieces: [{ op: 'add', points: triangle }] } }),
    );
    expect(result?.customShape).toBeUndefined();
  });
});
