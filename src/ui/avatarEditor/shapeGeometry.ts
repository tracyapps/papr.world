// The maths behind a drawn cutout: pieces made of movable points, joined into
// one silhouette. Pure numbers in, numbers or path text out — no DOM, no
// storage — so all of it is testable and none of it can go wrong quietly.
//
// A shape is a list of pieces (see `CustomShape` in shared/). Each piece is a
// closed loop through its anchor points. An anchor is *smooth* (the curve
// flows through it) or a *sharp* corner. There are no handles to drag: a smooth
// anchor points the curve along the line between its two neighbours, and the
// length of that pull follows the gap on each side. It is the same idea as an
// auto-smooth point in a drawing app, and it keeps every anchor a single thing
// to grab, move, or reach by keyboard.
//
// The cutout is worked out from the pieces in order: what is added is united
// with what is there, what is subtracted is cut away. That is done on the
// flattened loops with the `polygon-clipping` library, which copes with loops
// that cross themselves, touch, or leave holes.

import polygonClipping from 'polygon-clipping';
import {
  DESIGN_CUTOUT,
  DESIGN_LIMITS,
  DESIGN_SHEET,
  type CustomShape,
  type ShapePiece,
} from '../../../shared/src/index';

export type Pt = { x: number; y: number };
export type Ring = Array<[number, number]>;
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

/** A piece needs this many anchors before it cuts anything out. */
export const MIN_ANCHORS = 3;

// ---- Reading a piece ----------------------------------------------------------

export function piecePoints(piece: ShapePiece): Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i + 1 < piece.points.length; i += 2) {
    points.push({ x: piece.points[i]!, y: piece.points[i + 1]! });
  }
  return points;
}

export function toFlat(points: readonly Pt[]): number[] {
  return points.flatMap((p) => [p.x, p.y]);
}

export function anchorCount(piece: ShapePiece): number {
  return Math.floor(piece.points.length / 2);
}

export function isSharp(piece: ShapePiece, index: number): boolean {
  return piece.sharp?.includes(index) ?? false;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clampToSheet(p: Pt): Pt {
  return {
    x: Math.min(DESIGN_SHEET.width, Math.max(0, p.x)),
    y: Math.min(DESIGN_SHEET.height, Math.max(0, p.y)),
  };
}

// ---- The curve through the anchors ---------------------------------------------

export type Segment = { p0: Pt; c1: Pt; c2: Pt; p3: Pt };

/**
 * One cubic curve per anchor, from it to the next (the last wraps to the
 * first). A sharp anchor pulls nothing; a smooth one pulls along the line
 * between its neighbours, a third of the way to the next anchor.
 */
export function pieceSegments(piece: ShapePiece): Segment[] {
  const pts = piecePoints(piece);
  const n = pts.length;
  if (n < 2) return [];
  const sharp = new Set(piece.sharp ?? []);
  const directions: Array<Pt | null> = pts.map((_, i) => {
    if (n < 3 || sharp.has(i)) return null;
    const before = pts[(i + n - 1) % n]!;
    const after = pts[(i + 1) % n]!;
    const length = dist(before, after);
    return length < 1e-6 ? null : { x: (after.x - before.x) / length, y: (after.y - before.y) / length };
  });
  const segments: Segment[] = [];
  const count = n === 2 ? 1 : n;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % n;
    const p0 = pts[i]!;
    const p3 = pts[j]!;
    const reach = dist(p0, p3) / 3;
    const d0 = directions[i];
    const d3 = directions[j];
    segments.push({
      p0,
      p3,
      c1: d0 ? { x: p0.x + d0.x * reach, y: p0.y + d0.y * reach } : p0,
      c2: d3 ? { x: p3.x - d3.x * reach, y: p3.y - d3.y * reach } : p3,
    });
  }
  return segments;
}

export function evalSegment(segment: Segment, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * segment.p0.x + b * segment.c1.x + c * segment.c2.x + d * segment.p3.x,
    y: a * segment.p0.y + b * segment.c1.y + c * segment.c2.y + d * segment.p3.y,
  };
}

function fmt(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Path text for one piece, curves and all — for drawing it while it is edited. */
export function pieceToPathD(piece: ShapePiece): string {
  const segments = pieceSegments(piece);
  if (segments.length === 0) return '';
  let d = `M${fmt(segments[0]!.p0.x)} ${fmt(segments[0]!.p0.y)}`;
  for (const s of segments) {
    d += ` C${fmt(s.c1.x)} ${fmt(s.c1.y)} ${fmt(s.c2.x)} ${fmt(s.c2.y)} ${fmt(s.p3.x)} ${fmt(s.p3.y)}`;
  }
  return `${d} Z`;
}

/** How finely a curve is cut into straight runs: about a sheet unit each. */
const FLATTEN_STEP = 1;

function flattenSegment(segment: Segment): Pt[] {
  const reach =
    dist(segment.p0, segment.c1) + dist(segment.c1, segment.c2) + dist(segment.c2, segment.p3);
  const steps = Math.min(40, Math.max(2, Math.ceil(reach / FLATTEN_STEP)));
  const out: Pt[] = [];
  for (let i = 1; i <= steps; i++) out.push(evalSegment(segment, i / steps));
  return out;
}

/** The loop as straight runs, without repeating the first point at the end. */
export function flattenPiece(piece: ShapePiece): Pt[] {
  const segments = pieceSegments(piece);
  if (segments.length === 0) return [];
  const ring: Pt[] = [segments[0]!.p0];
  for (const segment of segments) ring.push(...flattenSegment(segment));
  ring.pop(); // the last run ends where the first began
  return ring;
}

// ---- Joining the pieces --------------------------------------------------------

function toClosedRing(points: readonly Pt[]): Ring {
  const ring: Ring = points.map((p) => [p.x, p.y]);
  const first = ring[0]!;
  ring.push([first[0], first[1]]);
  return ring;
}

/**
 * The cutout itself: the pieces in order, added ones united in, subtracted
 * ones cut away. A piece that cannot be worked out (or has too few anchors) is
 * skipped rather than breaking the rest.
 */
export function resolveShape(shape: CustomShape): MultiPolygon {
  let result: MultiPolygon = [];
  for (const piece of shape.pieces) {
    if (anchorCount(piece) < MIN_ANCHORS) continue;
    const ring = flattenPiece(piece);
    if (ring.length < MIN_ANCHORS) continue;
    const polygon: Polygon = [toClosedRing(ring)];
    try {
      if (piece.op === 'add') {
        result = result.length === 0 ? polygonClipping.union(polygon) : polygonClipping.union(result, polygon);
      } else if (result.length > 0) {
        result = polygonClipping.difference(result, polygon);
      }
    } catch {
      // A knot the library cannot untangle: leave this piece out.
    }
  }
  return result;
}

export function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i + 1 < ring.length; i++) {
    sum += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  }
  return Math.abs(sum) / 2;
}

/** Whole-cutout area: outer loops minus holes. */
export function multiPolygonArea(multi: MultiPolygon): number {
  let total = 0;
  for (const polygon of multi) {
    polygon.forEach((ring, index) => {
      total += index === 0 ? ringArea(ring) : -ringArea(ring);
    });
  }
  return total;
}

/** Path text for the finished cutout; use it with an even-odd fill so holes stay open. */
export function multiPolygonToPathD(multi: MultiPolygon): string {
  let d = '';
  for (const polygon of multi) {
    for (const ring of polygon) {
      ring.forEach(([x, y], i) => {
        if (i === ring.length - 1) return; // closing point repeats the first
        d += `${i === 0 ? 'M' : 'L'}${fmt(x)} ${fmt(y)} `;
      });
      d += 'Z ';
    }
  }
  return d.trim();
}

/** The path for a shape, or '' when it cuts out nothing. */
export function shapeToPathD(shape: CustomShape): string {
  return multiPolygonToPathD(resolveShape(shape));
}

// ---- Simplifying ---------------------------------------------------------------

function pointToSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq < 1e-12) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Ramer–Douglas–Peucker, without recursion. Keeps both ends. */
export function simplifyLine(points: readonly Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let worst = -1;
    let worstDistance = tolerance;
    for (let i = start + 1; i < end; i++) {
      const d = pointToSegmentDistance(points[i]!, points[start]!, points[end]!);
      if (d > worstDistance) {
        worstDistance = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = true;
      stack.push([start, worst], [worst, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * The plain, flattened version of a cutout: its largest loop, with no more than
 * `maxPoints` points, as flat numbers. Kept on the design beside the editable
 * shape for any build that only knows about a single outline.
 */
export function outlineFromShape(
  shape: CustomShape,
  maxPoints: number = DESIGN_LIMITS.maxOutlinePoints,
): number[] | null {
  const multi = resolveShape(shape);
  let best: Ring | null = null;
  let bestArea = 0;
  for (const polygon of multi) {
    const outer = polygon[0];
    if (!outer) continue;
    const area = ringArea(outer);
    if (area > bestArea) {
      best = outer;
      bestArea = area;
    }
  }
  if (!best) return null;
  let points: Pt[] = best.map(([x, y]) => ({ x, y }));
  let tolerance = 0.15;
  let simplified = simplifyLine(points, tolerance);
  while (simplified.length - 1 > maxPoints && tolerance < 20) {
    tolerance *= 1.5;
    simplified = simplifyLine(points, tolerance);
  }
  points = simplified.slice(0, -1); // drop the repeated closing point
  if (points.length < MIN_ANCHORS) return null;
  return toFlat(points).map((v) => Math.round(v * 10) / 10);
}

// ---- Turning a pencil stroke into points -----------------------------------------

/** How many points a stroke keeps: fewer is smoother, more follows the hand. */
export type Detail = 'few' | 'balanced' | 'many';

export const DETAIL_TOLERANCE: Record<Detail, number> = { few: 2.4, balanced: 1.3, many: 0.65 };

/** A stroke that ends this close to where it began is a closed loop. */
export const CLOSE_SNAP = 7;

/** A turn sharper than this, at a point, makes that point a corner. */
const CORNER_ANGLE = (65 * Math.PI) / 180;

export type FittedStroke = {
  points: Pt[];
  /** Positions of the sharp corners. */
  sharp: number[];
  /** The stroke came back to its start, so nothing needs closing off. */
  closed: boolean;
};

function turnAngle(before: Pt, at: Pt, after: Pt): number {
  const a = Math.atan2(at.y - before.y, at.x - before.x);
  const b = Math.atan2(after.y - at.y, after.x - at.x);
  let turn = Math.abs(b - a);
  if (turn > Math.PI) turn = 2 * Math.PI - turn;
  return turn;
}

/**
 * A freehand stroke, as the few movable points it takes to follow it. A run of
 * hand-drawn samples goes in; anchors come out, with the sharp turns marked as
 * corners. A stroke that is too short to mean anything returns null.
 */
export function fitStroke(samples: readonly Pt[], detail: Detail): FittedStroke | null {
  const cleaned: Pt[] = [];
  for (const sample of samples) {
    const last = cleaned[cleaned.length - 1];
    if (!last || dist(last, sample) >= 0.3) cleaned.push(sample);
  }
  if (cleaned.length < 2) return null;
  let length = 0;
  for (let i = 1; i < cleaned.length; i++) length += dist(cleaned[i - 1]!, cleaned[i]!);
  if (length < 4) return null;

  const first = cleaned[0]!;
  const closed = cleaned.length >= 4 && dist(first, cleaned[cleaned.length - 1]!) <= CLOSE_SNAP && length > CLOSE_SNAP * 3;
  const line = closed ? [...cleaned.slice(0, -1), first] : cleaned;
  let points = simplifyLine(line, DETAIL_TOLERANCE[detail]);
  if (closed) points = points.slice(0, -1);
  if (points.length < 2) return null;

  const sharp: number[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const isEnd = i === 0 || i === n - 1;
    if (!closed && isEnd) {
      sharp.push(i);
      continue;
    }
    const before = points[(i + n - 1) % n]!;
    const after = points[(i + 1) % n]!;
    if (turnAngle(before, points[i]!, after) > CORNER_ANGLE) sharp.push(i);
  }
  return { points: points.map(clampToSheet), sharp, closed };
}

// ---- Editing points ------------------------------------------------------------

function withPoints(piece: ShapePiece, points: readonly Pt[], sharp: readonly number[]): ShapePiece {
  const list = [...new Set(sharp)].sort((a, b) => a - b);
  return { op: piece.op, points: toFlat(points), ...(list.length > 0 ? { sharp: list } : {}) };
}

export function movePoint(piece: ShapePiece, index: number, to: Pt): ShapePiece {
  const points = piecePoints(piece);
  if (!points[index]) return piece;
  points[index] = clampToSheet(to);
  return withPoints(piece, points, piece.sharp ?? []);
}

/** Every point of a piece by the same amount, held inside the sheet. */
export function translatePiece(piece: ShapePiece, dx: number, dy: number): ShapePiece {
  const points = piecePoints(piece);
  if (points.length === 0) return piece;
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const shiftX = Math.min(DESIGN_SHEET.width - maxX, Math.max(-minX, dx));
  const shiftY = Math.min(DESIGN_SHEET.height - maxY, Math.max(-minY, dy));
  return withPoints(
    piece,
    points.map((p) => ({ x: p.x + shiftX, y: p.y + shiftY })),
    piece.sharp ?? [],
  );
}

export function toggleSharp(piece: ShapePiece, index: number): ShapePiece {
  if (index < 0 || index >= anchorCount(piece)) return piece;
  const sharp = new Set(piece.sharp ?? []);
  if (sharp.has(index)) sharp.delete(index);
  else sharp.add(index);
  return withPoints(piece, piecePoints(piece), [...sharp]);
}

/**
 * A new smooth point on the curve, on the way from anchor `segmentIndex` to the
 * next one. `t` is how far along that curve (0 to 1).
 */
export function insertPoint(piece: ShapePiece, segmentIndex: number, t = 0.5): ShapePiece {
  const segment = pieceSegments(piece)[segmentIndex];
  if (!segment) return piece;
  const points = piecePoints(piece);
  points.splice(segmentIndex + 1, 0, clampToSheet(evalSegment(segment, t)));
  const sharp = (piece.sharp ?? []).map((i) => (i > segmentIndex ? i + 1 : i));
  return withPoints(piece, points, sharp);
}

/** Removes an anchor; a piece keeps at least three, so it still cuts something out. */
export function deletePoint(piece: ShapePiece, index: number): ShapePiece {
  const points = piecePoints(piece);
  if (points.length <= MIN_ANCHORS || !points[index]) return piece;
  points.splice(index, 1);
  const sharp = (piece.sharp ?? []).filter((i) => i !== index).map((i) => (i > index ? i - 1 : i));
  return withPoints(piece, points, sharp);
}

/**
 * Whether a stroke that carries on a piece finishes it: it came back to its own
 * start, or it ended right at the piece's first point.
 */
export function strokeClosesPiece(piece: ShapePiece, fitted: FittedStroke): boolean {
  if (fitted.closed) return true;
  const first = piecePoints(piece)[0];
  const end = fitted.points[fitted.points.length - 1];
  return !!first && !!end && fitted.points.length >= 2 && dist(first, end) <= CLOSE_SNAP;
}

/**
 * Carries on a piece with a new stroke that began at its last anchor.
 *
 * The old last anchor stops being an end: it stays a corner only if the line
 * turns sharply there, otherwise it is smooth. The new last anchor becomes the
 * end — unless the stroke closes the piece (see strokeClosesPiece), in which
 * case it joins up with the first anchor and nothing is left open.
 */
export function appendStroke(piece: ShapePiece, fitted: FittedStroke): ShapePiece {
  const points = piecePoints(piece);
  const oldLast = points.length - 1;
  const added = fitted.points.slice(1); // its first point is the anchor we continue from
  if (added.length === 0) return piece;
  const closes = strokeClosesPiece(piece, fitted);
  // A stroke that ends on the first anchor joins it instead of adding a twin.
  const joinsStart = closes && !fitted.closed;
  if (joinsStart) added.pop();
  const merged = [...points, ...added];

  const sharp = new Set((piece.sharp ?? []).filter((i) => i !== oldLast && !(joinsStart && i === 0)));
  const junctionAfter = added[0] ?? points[0]!;
  if (oldLast >= 1 && turnAngle(points[oldLast - 1]!, points[oldLast]!, junctionAfter) > CORNER_ANGLE) {
    sharp.add(oldLast);
  }
  const offset = points.length - 1;
  for (const i of fitted.sharp) if (i > 0 && i + offset < merged.length) sharp.add(i + offset);
  if (joinsStart) {
    const last = merged[merged.length - 1]!;
    if (turnAngle(last, merged[0]!, merged[1]!) > CORNER_ANGLE) sharp.add(0);
  } else if (!fitted.closed) {
    sharp.add(merged.length - 1);
  }
  return withPoints(piece, merged, [...sharp]);
}

/**
 * A plain outline (a design drawn before shapes could be edited) as one piece
 * of movable points: simplified to a handful, with the sharp turns kept as
 * corners.
 */
export function pieceFromOutline(outline: readonly number[]): ShapePiece | null {
  const points: Pt[] = [];
  for (let i = 0; i + 1 < outline.length; i += 2) points.push({ x: outline[i]!, y: outline[i + 1]! });
  if (points.length < MIN_ANCHORS) return null;
  const first = points[0]!;
  const fitted = fitStroke([...points, first], 'balanced');
  if (fitted && fitted.points.length >= MIN_ANCHORS) {
    return withPoints({ op: 'add', points: [] }, fitted.points, fitted.sharp);
  }
  // Too few points to simplify: keep them all, as corners, so nothing changes shape.
  return withPoints({ op: 'add', points: [] }, points, points.map((_, i) => i));
}

/** A brand-new piece from a fitted stroke. */
export function pieceFromStroke(fitted: FittedStroke, op: ShapePiece['op']): ShapePiece {
  return withPoints({ op, points: [] }, fitted.points, fitted.sharp);
}

// ---- Finding things under a finger ---------------------------------------------

export type Nearest = { distance: number; segment: number; t: number; point: Pt };

/** The closest spot on a piece's curve to a point, and which curve it is on. */
export function nearestOnPiece(piece: ShapePiece, target: Pt): Nearest | null {
  const segments = pieceSegments(piece);
  let best: Nearest | null = null;
  for (let index = 0; index < segments.length; index++) {
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const point = evalSegment(segments[index]!, t);
      const distance = dist(point, target);
      if (!best || distance < best.distance) best = { distance, segment: index, t, point };
    }
  }
  return best;
}

/** Whether a point is inside a piece's loop. */
export function pointInPiece(piece: ShapePiece, target: Pt): boolean {
  const ring = flattenPiece(piece);
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > target.y !== b.y > target.y && target.x < ((b.x - a.x) * (target.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

// ---- Placing the whole shape ---------------------------------------------------

export function shapeBounds(shape: CustomShape): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const outer = resolveShape(shape).flatMap((polygon) => polygon[0] ?? []);
  if (outer.length === 0) return null;
  return {
    minX: Math.min(...outer.map((p) => p[0])),
    minY: Math.min(...outer.map((p) => p[1])),
    maxX: Math.max(...outer.map((p) => p[0])),
    maxY: Math.max(...outer.map((p) => p[1])),
  };
}

/**
 * Scales and moves the whole shape to fill the standard cutout box — the size
 * the ready-made shapes are — standing on the same ground line, centred.
 */
export function fitShapeToCutout(shape: CustomShape): CustomShape {
  const bounds = shapeBounds(shape);
  if (!bounds) return shape;
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(DESIGN_CUTOUT.width / width, DESIGN_CUTOUT.height / height);
  const left = DESIGN_CUTOUT.x + (DESIGN_CUTOUT.width - width * scale) / 2;
  const top = DESIGN_CUTOUT.y + DESIGN_CUTOUT.height - height * scale;
  return {
    pieces: shape.pieces.map((piece) =>
      withPoints(
        piece,
        piecePoints(piece).map((p) =>
          clampToSheet({ x: left + (p.x - bounds.minX) * scale, y: top + (p.y - bounds.minY) * scale }),
        ),
        piece.sharp ?? [],
      ),
    ),
  };
}

// ---- Starter pieces --------------------------------------------------------------

export type StarterKind = 'oval' | 'square' | 'triangle';

/**
 * A ready-made piece to start from, for anyone who would rather shape points
 * than draw a line — and the way in when drawing with a pointer is not an
 * option. `half` is half its width and half its height.
 */
export function starterPiece(kind: StarterKind, op: ShapePiece['op'], center: Pt, half: Pt): ShapePiece {
  const at = (dx: number, dy: number): Pt => clampToSheet({ x: center.x + dx * half.x, y: center.y + dy * half.y });
  if (kind === 'oval') {
    const points = Array.from({ length: 8 }, (_, k) => {
      const angle = (k * Math.PI) / 4 - Math.PI / 2;
      return at(Math.cos(angle), Math.sin(angle));
    });
    return withPoints({ op, points: [] }, points, []);
  }
  if (kind === 'square') {
    const points = [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)];
    return withPoints({ op, points: [] }, points, [0, 1, 2, 3]);
  }
  return withPoints({ op, points: [] }, [at(0, -1), at(1, 1), at(-1, 1)], [0, 1, 2]);
}

// ---- Thumbnails -------------------------------------------------------------------

/**
 * The window to look through so a shape fills a picker tile: as tall and wide
 * as the shape needs, in the same proportions as the ready-made tiles, so
 * nothing is stretched.
 */
export function thumbnailBox(shape: CustomShape): { x: number; y: number; width: number; height: number } {
  const aspect = DESIGN_CUTOUT.width / DESIGN_CUTOUT.height;
  const bounds = shapeBounds(shape);
  if (!bounds) {
    return { x: DESIGN_CUTOUT.x - 3, y: DESIGN_CUTOUT.y - 3, width: DESIGN_CUTOUT.width + 6, height: DESIGN_CUTOUT.height + 6 };
  }
  const pad = 3;
  let width = bounds.maxX - bounds.minX + pad * 2;
  let height = bounds.maxY - bounds.minY + pad * 2;
  if (width / height > aspect) height = width / aspect;
  else width = height * aspect;
  return {
    x: (bounds.minX + bounds.maxX) / 2 - width / 2,
    y: (bounds.minY + bounds.maxY) / 2 - height / 2,
    width,
    height,
  };
}
