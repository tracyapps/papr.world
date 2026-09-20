import { describe, expect, it } from 'vitest';
import { DESIGN_CUTOUT, DESIGN_LIMITS, DESIGN_SHEET, type CustomShape, type ShapePiece } from '../../../shared/src/index';
import {
  appendStroke,
  deletePoint,
  fitShapeToCutout,
  fitStroke,
  flattenPiece,
  insertPoint,
  movePoint,
  multiPolygonArea,
  nearestOnPiece,
  outlineFromShape,
  pieceFromOutline,
  pieceFromStroke,
  piecePoints,
  pieceSegments,
  pieceToPathD,
  pointInPiece,
  resolveShape,
  shapeBounds,
  shapeToPathD,
  simplifyLine,
  starterPiece,
  strokeClosesPiece,
  thumbnailBox,
  toggleSharp,
  translatePiece,
  type Pt,
} from './shapeGeometry';

/** A square as four sharp corners, so it stays a square. */
function square(x: number, y: number, size: number, op: ShapePiece['op'] = 'add'): ShapePiece {
  return {
    op,
    points: [x, y, x + size, y, x + size, y + size, x, y + size],
    sharp: [0, 1, 2, 3],
  };
}

/** A circle drawn by hand: many samples, going round once and back to the start. */
function circleSamples(cx: number, cy: number, r: number, count = 80): Pt[] {
  return Array.from({ length: count + 1 }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
  });
}

describe('curves', () => {
  it('makes one curve per anchor, wrapping round to the first', () => {
    const segments = pieceSegments(square(10, 10, 20));
    expect(segments).toHaveLength(4);
    expect(segments[3]!.p3).toEqual({ x: 10, y: 10 });
  });

  it('keeps a sharp corner sharp and lets a smooth anchor pull the curve', () => {
    const sharp = pieceSegments(square(10, 10, 20));
    expect(sharp[0]!.c1).toEqual(sharp[0]!.p0);
    const smooth = pieceSegments({ ...square(10, 10, 20), sharp: [] });
    expect(smooth[0]!.c1).not.toEqual(smooth[0]!.p0);
  });

  it('writes a closed path', () => {
    expect(pieceToPathD(square(0, 0, 10))).toMatch(/^M0 0 C.* Z$/);
  });

  it('flattens to a loop that does not repeat its first point', () => {
    const ring = flattenPiece(square(10, 10, 20));
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    expect(first.x === last.x && first.y === last.y).toBe(false);
    expect(ring.length).toBeGreaterThanOrEqual(4);
  });
});

describe('joining pieces', () => {
  it('a single piece is its own area', () => {
    const shape: CustomShape = { pieces: [square(20, 20, 40)] };
    expect(multiPolygonArea(resolveShape(shape))).toBeCloseTo(1600, 0);
  });

  it('uniting two overlapping squares gives less than the sum and more than either', () => {
    const shape: CustomShape = { pieces: [square(20, 20, 40), square(40, 40, 40)] };
    // 1600 + 1600 - 400 overlap
    expect(multiPolygonArea(resolveShape(shape))).toBeCloseTo(2800, 0);
  });

  it('two separate squares stay two separate islands', () => {
    const shape: CustomShape = { pieces: [square(10, 10, 20), square(60, 60, 20)] };
    expect(resolveShape(shape)).toHaveLength(2);
  });

  it('subtracting a square from the middle leaves a hole', () => {
    const shape: CustomShape = { pieces: [square(20, 20, 60), square(40, 40, 20, 'subtract')] };
    const multi = resolveShape(shape);
    expect(multi).toHaveLength(1);
    expect(multi[0]).toHaveLength(2); // outer ring and one hole
    expect(multiPolygonArea(multi)).toBeCloseTo(3600 - 400, 0);
  });

  it('subtracting off the edge trims the shape', () => {
    const shape: CustomShape = { pieces: [square(20, 20, 40), square(50, 0, 40, 'subtract')] };
    // The cut overlaps x 50 to 60, y 20 to 40: 10 by 20.
    expect(multiPolygonArea(resolveShape(shape))).toBeCloseTo(1600 - 10 * 20, 0);
  });

  it('order matters: what is added after a subtract fills it back in', () => {
    const shape: CustomShape = {
      pieces: [square(20, 20, 60), square(40, 40, 20, 'subtract'), square(45, 45, 10)],
    };
    expect(multiPolygonArea(resolveShape(shape))).toBeCloseTo(3600 - 400 + 100, 0);
  });

  it('a subtract before anything is added does nothing', () => {
    const shape: CustomShape = { pieces: [square(0, 0, 10, 'subtract'), square(20, 20, 20)] };
    expect(multiPolygonArea(resolveShape(shape))).toBeCloseTo(400, 0);
  });

  it('skips a piece with too few anchors', () => {
    const shape: CustomShape = { pieces: [square(20, 20, 40), { op: 'add', points: [5, 5, 90, 90] }] };
    expect(multiPolygonArea(resolveShape(shape))).toBeCloseTo(1600, 0);
  });

  it('copes with a loop that crosses itself', () => {
    const bowtie: ShapePiece = { op: 'add', points: [20, 20, 60, 60, 60, 20, 20, 60], sharp: [0, 1, 2, 3] };
    expect(multiPolygonArea(resolveShape({ pieces: [bowtie] }))).toBeGreaterThan(0);
  });

  it('writes path text with one subpath per loop', () => {
    const shape: CustomShape = { pieces: [square(20, 20, 60), square(40, 40, 20, 'subtract')] };
    expect(shapeToPathD(shape).match(/M/g)).toHaveLength(2);
    expect(shapeToPathD({ pieces: [] })).toBe('');
  });
});

describe('the plain outline kept beside a shape', () => {
  it('is the largest loop, as flat numbers', () => {
    const outline = outlineFromShape({ pieces: [square(20, 20, 60), square(100, 150, 10)] });
    expect(outline).not.toBeNull();
    expect(outline!.length % 2).toBe(0);
    expect(Math.max(...outline!)).toBeLessThanOrEqual(80.1);
  });

  it('stays within the point limit however detailed the shape is', () => {
    const wiggly = fitStroke(circleSamples(65, 90, 40, 600), 'many')!;
    const piece = pieceFromStroke(wiggly, 'add');
    const outline = outlineFromShape({ pieces: [piece] }, 40);
    expect(outline!.length / 2).toBeLessThanOrEqual(40);
    expect(DESIGN_LIMITS.maxOutlinePoints).toBeGreaterThan(40);
  });

  it('is null when nothing is cut out', () => {
    expect(outlineFromShape({ pieces: [] })).toBeNull();
  });
});

describe('simplifyLine', () => {
  it('keeps the ends and drops points on a straight run', () => {
    const line: Pt[] = [0, 1, 2, 3, 4, 5].map((x) => ({ x, y: 0 }));
    expect(simplifyLine(line, 0.1)).toEqual([line[0], line[5]]);
  });

  it('keeps a real corner', () => {
    const line: Pt[] = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
    ];
    expect(simplifyLine(line, 0.5)).toHaveLength(3);
  });
});

describe('fitStroke', () => {
  it('turns a hand-drawn circle into a closed loop of a few smooth points', () => {
    const fitted = fitStroke(circleSamples(65, 90, 40), 'balanced')!;
    expect(fitted.closed).toBe(true);
    expect(fitted.points.length).toBeGreaterThanOrEqual(6);
    expect(fitted.points.length).toBeLessThan(40);
    expect(fitted.sharp).toEqual([]);
  });

  it('keeps more points when asked for more detail', () => {
    const wobbly = circleSamples(65, 90, 40, 200).map((p, i) => ({ x: p.x + Math.sin(i * 0.7) * 1.2, y: p.y }));
    const few = fitStroke(wobbly, 'few')!;
    const many = fitStroke(wobbly, 'many')!;
    expect(many.points.length).toBeGreaterThan(few.points.length);
  });

  it('marks the corners of a hand-drawn square', () => {
    const samples: Pt[] = [];
    const corners = [
      [20, 20],
      [80, 20],
      [80, 80],
      [20, 80],
      [20, 20],
    ] as const;
    for (let c = 0; c < 4; c++) {
      for (let i = 0; i < 20; i++) {
        const t = i / 20;
        samples.push({
          x: corners[c]![0] + (corners[c + 1]![0] - corners[c]![0]) * t,
          y: corners[c]![1] + (corners[c + 1]![1] - corners[c]![1]) * t,
        });
      }
    }
    samples.push({ x: 20, y: 21 });
    const fitted = fitStroke(samples, 'balanced')!;
    expect(fitted.closed).toBe(true);
    expect(fitted.points).toHaveLength(4);
    expect(fitted.sharp).toHaveLength(4);
  });

  it('leaves an open stroke open, with sharp ends', () => {
    const arc = circleSamples(65, 90, 40).slice(0, 40);
    const fitted = fitStroke(arc, 'balanced')!;
    expect(fitted.closed).toBe(false);
    expect(fitted.sharp).toContain(0);
    expect(fitted.sharp).toContain(fitted.points.length - 1);
  });

  it('ignores a tap or a tiny scribble', () => {
    expect(fitStroke([{ x: 10, y: 10 }], 'balanced')).toBeNull();
    expect(fitStroke([{ x: 10, y: 10 }, { x: 11, y: 10.5 }], 'balanced')).toBeNull();
  });

  it('keeps every point on the sheet', () => {
    const fitted = fitStroke([{ x: -20, y: -5 }, { x: 60, y: 90 }, { x: 400, y: 500 }], 'few')!;
    for (const p of fitted.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(DESIGN_SHEET.height);
    }
  });
});

describe('editing points', () => {
  const base = square(20, 20, 40);

  it('moves a point without touching the others or the corners', () => {
    const moved = movePoint(base, 2, { x: 90, y: 90 });
    expect(piecePoints(moved)[2]).toEqual({ x: 90, y: 90 });
    expect(piecePoints(moved)[0]).toEqual({ x: 20, y: 20 });
    expect(moved.sharp).toEqual([0, 1, 2, 3]);
  });

  it('will not move a point off the sheet', () => {
    const moved = movePoint(base, 0, { x: -50, y: 999 });
    expect(piecePoints(moved)[0]).toEqual({ x: 0, y: DESIGN_SHEET.height });
  });

  it('toggles a corner and back', () => {
    const smooth = toggleSharp(base, 1);
    expect(smooth.sharp).toEqual([0, 2, 3]);
    expect(toggleSharp(smooth, 1).sharp).toEqual([0, 1, 2, 3]);
  });

  it('inserts a point on the curve, shifting the corners after it', () => {
    const inserted = insertPoint(base, 0);
    expect(piecePoints(inserted)).toHaveLength(5);
    expect(piecePoints(inserted)[1]!.y).toBeCloseTo(20, 5);
    expect(inserted.sharp).toEqual([0, 2, 3, 4]);
  });

  it('deletes a point and keeps the corner numbers straight', () => {
    const deleted = deletePoint(insertPoint(base, 0), 1);
    expect(piecePoints(deleted)).toHaveLength(4);
    expect(deleted.sharp).toEqual([0, 1, 2, 3]);
  });

  it('will not delete down below three points', () => {
    const triangle: ShapePiece = { op: 'add', points: [10, 10, 50, 10, 30, 50] };
    expect(deletePoint(triangle, 0)).toBe(triangle);
  });

  it('moves a whole piece but stops at the sheet edge', () => {
    const moved = translatePiece(base, 1000, 0);
    const xs = piecePoints(moved).map((p) => p.x);
    expect(Math.max(...xs)).toBe(DESIGN_SHEET.width);
    expect(Math.max(...xs) - Math.min(...xs)).toBe(40);
  });

  it('carries on a piece from its last point', () => {
    const start = pieceFromStroke(
      { points: [{ x: 10, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 40 }], sharp: [0, 2], closed: false },
      'add',
    );
    const carried = appendStroke(start, {
      points: [{ x: 40, y: 40 }, { x: 10, y: 40 }, { x: 8, y: 20 }],
      sharp: [0, 2],
      closed: false,
    });
    expect(piecePoints(carried)).toHaveLength(5);
    // The line turned a right angle where it was carried on, so that stays a corner;
    // the new end is a corner too.
    expect(carried.sharp).toEqual([0, 2, 4]);
  });
});

describe('carrying a piece on and closing it', () => {
  const open = pieceFromStroke(
    { points: [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 }], sharp: [0, 2], closed: false },
    'add',
  );

  it('keeps a gentle bend smooth', () => {
    const carried = appendStroke(open, {
      points: [{ x: 60, y: 60 }, { x: 62, y: 90 }],
      sharp: [0, 1],
      closed: false,
    });
    expect(carried.sharp).toEqual([0, 3]);
  });

  it('joins the first point when the line ends on it, leaving nothing open', () => {
    const fitted = { points: [{ x: 60, y: 60 }, { x: 10, y: 60 }, { x: 11, y: 12 }], sharp: [0, 2], closed: false };
    expect(strokeClosesPiece(open, fitted)).toBe(true);
    const closed = appendStroke(open, fitted);
    // No twin of the first point, and the join is a corner because the line turns there.
    expect(piecePoints(closed)).toHaveLength(4);
    expect(closed.sharp).toContain(0);
    expect(closed.sharp).not.toContain(3);
  });

  it('does not close when the line ends away from the start', () => {
    const fitted = { points: [{ x: 60, y: 60 }, { x: 40, y: 80 }], sharp: [0, 1], closed: false };
    expect(strokeClosesPiece(open, fitted)).toBe(false);
  });
});

describe('finding things', () => {
  it('finds the nearest spot on the outline', () => {
    const near = nearestOnPiece(square(20, 20, 40), { x: 40, y: 10 })!;
    expect(near.distance).toBeCloseTo(10, 0);
    expect(near.segment).toBe(0);
  });

  it('knows inside from outside', () => {
    const piece = square(20, 20, 40);
    expect(pointInPiece(piece, { x: 40, y: 40 })).toBe(true);
    expect(pointInPiece(piece, { x: 90, y: 90 })).toBe(false);
  });
});

describe('fitShapeToCutout', () => {
  it('fills the standard cutout box and stands on its floor', () => {
    const fitted = fitShapeToCutout({ pieces: [square(5, 5, 20)] });
    const bounds = shapeBounds(fitted)!;
    expect(bounds.maxY).toBeCloseTo(DESIGN_CUTOUT.y + DESIGN_CUTOUT.height, 0);
    expect(bounds.maxX - bounds.minX).toBeLessThanOrEqual(DESIGN_CUTOUT.width + 0.5);
    expect((bounds.minX + bounds.maxX) / 2).toBeCloseTo(DESIGN_CUTOUT.x + DESIGN_CUTOUT.width / 2, 0);
  });

  it('leaves an empty shape alone', () => {
    const empty: CustomShape = { pieces: [] };
    expect(fitShapeToCutout(empty)).toBe(empty);
  });
});

describe('pieceFromOutline', () => {
  it('turns an old plain outline into a few movable points', () => {
    const ring = circleSamples(65, 90, 40, 200).slice(0, -1).flatMap((p) => [p.x, p.y]);
    const piece = pieceFromOutline(ring)!;
    expect(piece.op).toBe('add');
    expect(piece.points.length / 2).toBeGreaterThanOrEqual(6);
    expect(piece.points.length / 2).toBeLessThan(60);
  });

  it('keeps a small polygon exactly, as corners', () => {
    const piece = pieceFromOutline([20, 20, 80, 20, 50, 100])!;
    expect(piece.points).toEqual([20, 20, 80, 20, 50, 100]);
    expect(piece.sharp).toEqual([0, 1, 2]);
  });

  it('is null when there is nothing to make a loop from', () => {
    expect(pieceFromOutline([1, 2, 3, 4])).toBeNull();
  });
});

describe('starterPiece', () => {
  it('makes an oval of eight smooth points around its centre', () => {
    const piece = starterPiece('oval', 'add', { x: 65, y: 95 }, { x: 30, y: 40 });
    expect(piece.op).toBe('add');
    expect(piece.points.length / 2).toBe(8);
    expect(piece.sharp).toBeUndefined();
    const bounds = shapeBounds({ pieces: [piece] })!;
    expect(bounds.minX).toBeGreaterThan(30);
    expect(bounds.maxX).toBeLessThan(100);
    expect(multiPolygonArea(resolveShape({ pieces: [piece] }))).toBeGreaterThan(3000);
  });

  it('makes a square and a triangle out of corners', () => {
    const square4 = starterPiece('square', 'add', { x: 65, y: 95 }, { x: 20, y: 20 });
    expect(square4.points.length / 2).toBe(4);
    expect(square4.sharp).toEqual([0, 1, 2, 3]);
    expect(multiPolygonArea(resolveShape({ pieces: [square4] }))).toBeCloseTo(1600, 0);
    const tri = starterPiece('triangle', 'subtract', { x: 65, y: 95 }, { x: 10, y: 10 });
    expect(tri.op).toBe('subtract');
    expect(tri.points.length / 2).toBe(3);
  });

  it('stays on the sheet', () => {
    const piece = starterPiece('square', 'add', { x: 5, y: 5 }, { x: 50, y: 50 });
    for (const value of piece.points) expect(value).toBeGreaterThanOrEqual(0);
  });
});

describe('thumbnailBox', () => {
  it('keeps the tile proportions and holds the whole shape', () => {
    const wide: CustomShape = { pieces: [square(10, 60, 100)] };
    const box = thumbnailBox(wide);
    expect(box.width / box.height).toBeCloseTo(DESIGN_CUTOUT.width / DESIGN_CUTOUT.height, 5);
    expect(box.x).toBeLessThan(10);
    expect(box.x + box.width).toBeGreaterThan(110);
    expect(box.y).toBeLessThan(60);
    expect(box.y + box.height).toBeGreaterThan(160);
  });

  it('falls back to the cutout box for an empty shape', () => {
    const box = thumbnailBox({ pieces: [] });
    expect(box.width).toBe(DESIGN_CUTOUT.width + 6);
  });
});
