// AvatarDesign — the durable, renderer-free shape of a drawn avatar.
//
// Lives in shared/ because the server will eventually store and validate
// designs (docs/avatar-and-identity.md Phase D): vector strokes are small
// enough to sync, and the server can re-render exactly what players will
// see — the property that makes drawings moderatable at all.
//
// Coordinate space: a portrait "sheet" 0..100 wide, 0..140 tall (matching
// the in-world avatar plane's 1.1 × 1.55 proportions). All stroke points are
// clamped into it. Colors are free-form hex but validated; papers, patterns
// and silhouettes are catalog KEYS — the art itself never travels.

import type { AvatarRef } from './state';
import { isFiniteNumber } from './validate';

/**
 * Drawing sheet bounds (also the SVG viewBox the client renders with).
 *
 * Grown 2026-08-15 from the old 100 × 140. The sheet is now bigger than the
 * cutout on purpose: arms, legs and hair are separate pieces of paper glued
 * *behind* the silhouette, and they need somewhere to be. Doing this before
 * designs go over the wire (Phase D) makes it a constant; after, it is a
 * migration.
 */
export const DESIGN_SHEET = { width: 130, height: 180 } as const;

/**
 * Where the silhouette itself lives inside the sheet — the shape compiler
 * fits every cutout into exactly this box, so cutouts are the same size they
 * always were and the surrounding ring is appendage room.
 */
export const DESIGN_CUTOUT = { x: 15, y: 25, width: 100, height: 140 } as const;

/**
 * The line cutouts stand on, in sheet coordinates. Shapes are bottom-anchored
 * to it, and the in-world plane is positioned so it meets the terrain here —
 * which is why a stamp placed below it reads as a foot on the ground.
 */
export const DESIGN_GROUND_Y = DESIGN_CUTOUT.y + DESIGN_CUTOUT.height - 5;

export const DESIGN_LIMITS = {
  /** Saved designs per wardrobe (device now, account later). */
  wardrobeMax: 24,
  nameMaxLength: 40,
  /** Catalog key length cap (silhouette/paper/pattern). */
  keyMaxLength: 48,
  maxStrokes: 400,
  /** Points per stroke; the editor thins pointer input well below this. */
  maxPointsPerStroke: 600,
  strokeWidthMin: 0.5,
  strokeWidthMax: 8,
  /** Points in a drawn custom cutout outline (pairs of numbers). */
  maxOutlinePoints: 300,
  /** Stamps stuck on one design — plenty of face, not a collage engine. */
  maxStamps: 32,
  /** Stamp size multipliers, against each stamp's natural size. */
  stampScaleMin: 0.25,
  stampScaleMax: 4,

  /** Serialized size guard for the eventual wire/storage path. */
  maxBytes: 32_768,
} as const;

/**
 * What a stroke is made of. Crayon is opaque and flat; the other two are
 * translucent and *build up* — drawing over the same place twice deepens it,
 * and the paper's pattern still shows through. That layering is the whole
 * point, so they are separate media rather than an opacity slider.
 */
export type StrokeMedium = 'crayon' | 'watercolor' | 'spray';

/** One stroke: a polyline in sheet coordinates (or stamp-local, on a stamp). */
export type DesignStroke = {
  /** #rrggbb */
  color: string;
  /** Sheet units (see DESIGN_SHEET), clamped to DESIGN_LIMITS bounds. */
  width: number;
  /** Flat [x0, y0, x1, y1, ...] — half the JSON of point objects. */
  points: number[];
  /** Omitted for crayon, which is the default and the common case. */
  medium?: StrokeMedium;
};

const MEDIA: StrokeMedium[] = ['crayon', 'watercolor', 'spray'];

/**
 * One stamp stuck onto a design — a pre-drawn detail from the stamp catalog.
 *
 * Stamps exist because the hard part of a paper self is the small stuff:
 * eyes on an abstract blob, an arm on a flame. Drawing those freehand at
 * this scale is fiddly, and appendages could not be drawn at all — strokes
 * are clipped to the cutout.
 *
 * Like silhouettes, the ART never travels: a stamp on the wire is a catalog
 * key and five numbers. That makes stamps cheaper to validate than strokes
 * and trivially re-renderable server-side for moderation (§6.1).
 */
export type DesignStamp = {
  /** Catalog key; the catalog decides whether it sits on or behind the cutout. */
  key: string;
  /** Centre of the stamp, in sheet coordinates. */
  x: number;
  y: number;
  /** Multiplier on the stamp's natural size. */
  scale: number;
  /** Degrees, -180..180. */
  rotation: number;
  /** Mirrored horizontally — one arm asset serves both sides. */
  flip: boolean;
  /**
   * Give this stamp its own scrap of paper: a die-cut halo behind it, and a
   * lift out of the cutout's clip so it survives holes.
   *
   * Only meaningful for `on` stamps. Many silhouettes have negative space
   * inside their bounds — the gap between a frog's two eye humps, the wells in
   * a cassette — and a clipped face lands in one of those holes and loses half
   * of itself. The editor decides this automatically when a stamp is placed or
   * moved (it can hit-test the real cutout path; the renderer cannot), and
   * stores the answer here so rendering stays a pure function of the design
   * and the server can validate it like anything else.
   */
  backing?: boolean;
  /**
   * Hidden from the picture without being deleted — the layers-panel eye.
   * Omitted when visible, which is nearly always.
   */
  hidden?: boolean;
  /**
   * Ink colour (#rrggbb). Only the ink role is player-chosen; a stamp's
   * paper and shadow roles are derived from the design's paper stock, so
   * googly-eye whites always read as the same paper the cutout is made of.
   */
  color: string;
};

export type AvatarDesign = {
  /** Bump on breaking shape changes; sanitize migrates or refuses. */
  version: 1;
  /** Stable id — this is what AvatarRef.drawingKey points at. */
  id: string;
  /** Player-given name for the wardrobe ("rainy day snail"). */
  name: string;
  /**
   * Silhouette template key from the client catalog, or the special key
   * `"custom"` — the player drew their own cutout (see customOutline).
   */
  silhouette: string;
  /**
   * Only when silhouette === 'custom': the drawn cutout outline as a closed
   * polygon, flat [x0, y0, x1, y1, ...] in sheet coordinates. The renderer
   * closes it (Z); it never travels as path markup, only as numbers.
   */
  customOutline?: number[];
  /** Paper stock the cutout is scissored from. */
  paper: {
    /** Base color key from the paper catalog (e.g. "construction-red"). */
    color: string;
    /** Pattern key (e.g. "plain", "lined", "graph", "dot-grid"). */
    pattern: string;
  };
  /**
   * Stamps, in paint order within each layer (later entries sit on top).
   * Optional so designs saved before stamps existed still load.
   */
  stamps?: DesignStamp[];
  strokes: DesignStroke[];
  /**
   * Where the drawing sits in the stack, counted in "on" stamps painted
   * before it. Undefined means on top of everything, which is what you want
   * the first time you pick up a crayon.
   *
   * This is what lets a face sit *over* your scribbles or *under* them
   * without the drawing having to belong to any particular stamp — one
   * drawing, one place in the order, moved from the layers panel like
   * anything else.
   */
  drawingIndex?: number;
  /** The layers-panel eye, for the drawing layer. */
  drawingHidden?: boolean;
  /** Collision body — derived from the silhouette template, never measured. */
  preset: AvatarRef['preset'];
  /**
   * Opt-in per design (decision 2026-08-10): whether this saved design may
   * appear on the player's card for others. Default false everywhere.
   */
  sharedOnCard: boolean;
  createdAt: number;
  updatedAt: number;
};

const PRESETS: AvatarRef['preset'][] = [
  'small',
  'medium',
  'wide',
  'tall',
  'wheeled',
  'hovering',
];

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sanitizeKey(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const key = raw.trim().slice(0, DESIGN_LIMITS.keyMaxLength);
  return /^[a-z0-9-]+$/.test(key) ? key : fallback;
}

/**
 * @param bounds the box points are clamped into — the sheet for strokes on the
 *   cutout, a box around the origin for strokes that belong to a stamp (those
 *   live in the stamp's own local space, which is what makes them move, turn
 *   and scale with it for free).
 */
type StrokeBounds = { minX: number; minY: number; maxX: number; maxY: number };

function sanitizeStroke(
  raw: unknown,
  bounds: StrokeBounds = {
    minX: 0,
    minY: 0,
    maxX: DESIGN_SHEET.width,
    maxY: DESIGN_SHEET.height,
  },
): DesignStroke | null {
  const value = (raw ?? {}) as Partial<DesignStroke>;
  if (!isHex(value.color)) return null;
  if (!isFiniteNumber(value.width)) return null;
  if (!Array.isArray(value.points) || value.points.length < 4) return null;

  const width = clamp(value.width, DESIGN_LIMITS.strokeWidthMin, DESIGN_LIMITS.strokeWidthMax);
  // Keep an even number of coordinates, all finite, all in bounds.
  const budget = Math.min(value.points.length, DESIGN_LIMITS.maxPointsPerStroke * 2);
  const points: number[] = [];
  for (let i = 0; i + 1 < budget; i += 2) {
    const x = value.points[i];
    const y = value.points[i + 1];
    if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
    points.push(clamp(x, bounds.minX, bounds.maxX), clamp(y, bounds.minY, bounds.maxY));
  }
  if (points.length < 4) return null;
  const medium = MEDIA.includes(value.medium as StrokeMedium)
    ? (value.medium as StrokeMedium)
    : 'crayon';
  return { color: value.color, width, points, ...(medium === 'crayon' ? {} : { medium }) };
}



function sanitizeStamp(raw: unknown): DesignStamp | null {
  const value = (raw ?? {}) as Partial<DesignStamp>;
  const key = sanitizeKey(value.key, '');
  if (key.length === 0) return null;
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null;

  // A stamp may hang off the sheet a little — that is what a glued-on arm
  // does — but its anchor stays on the sheet so it can never be placed
  // somewhere the player cannot reach it again.
  const scale = isFiniteNumber(value.scale)
    ? clamp(value.scale, DESIGN_LIMITS.stampScaleMin, DESIGN_LIMITS.stampScaleMax)
    : 1;
  const rotation = isFiniteNumber(value.rotation) ? ((value.rotation % 360) + 540) % 360 - 180 : 0;

  return {
    key,
    x: clamp(value.x, 0, DESIGN_SHEET.width),
    y: clamp(value.y, 0, DESIGN_SHEET.height),
    scale,
    rotation,
    flip: value.flip === true,
    // Omitted when false/empty: a stamp with no backing and nothing drawn on
    // it serializes exactly as it did before either feature existed.
    ...(value.backing === true ? { backing: true } : {}),
    ...(value.hidden === true ? { hidden: true } : {}),
    color: isHex(value.color) ? value.color : '#2b2620',
  };
}

/**
 * Normalize an untrusted design into a safe, complete one — or null when it
 * is fundamentally unusable. The server MUST run this before storing a
 * design (Phase D); the client runs it on wardrobe load so a corrupted or
 * hand-edited save degrades to "rejected", never to broken rendering.
 */
export function sanitizeAvatarDesign(raw: unknown): AvatarDesign | null {
  const value = (raw ?? {}) as Partial<AvatarDesign> & { paper?: Partial<AvatarDesign['paper']> };
  if (value.version !== 1) return null;
  if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 64) return null;

  // Custom outline: only meaningful with the 'custom' silhouette, only kept
  // when it forms at least a triangle of finite, on-sheet points.
  let customOutline: number[] | undefined;
  let silhouette = sanitizeKey(value.silhouette, 'round-pal');
  if (silhouette === 'custom') {
    const raw = Array.isArray(value.customOutline) ? value.customOutline : [];
    const budget = Math.min(raw.length, DESIGN_LIMITS.maxOutlinePoints * 2);
    const points: number[] = [];
    let bad = false;
    for (let i = 0; i + 1 < budget; i += 2) {
      const x = raw[i];
      const y = raw[i + 1];
      if (!isFiniteNumber(x) || !isFiniteNumber(y)) {
        bad = true;
        break;
      }
      points.push(clamp(x, 0, DESIGN_SHEET.width), clamp(y, 0, DESIGN_SHEET.height));
    }
    if (!bad && points.length >= 6) {
      customOutline = points;
    } else {
      silhouette = 'round-pal'; // unusable outline degrades to a template
    }
  }

  const strokesRaw = Array.isArray(value.strokes)
    ? value.strokes.slice(0, DESIGN_LIMITS.maxStrokes)
    : [];
  const strokes: DesignStroke[] = [];
  for (const s of strokesRaw) {
    const stroke = sanitizeStroke(s);
    if (stroke) strokes.push(stroke);
  }

  const stampsRaw = Array.isArray(value.stamps)
    ? value.stamps.slice(0, DESIGN_LIMITS.maxStamps)
    : [];
  const stamps: DesignStamp[] = [];
  for (const s of stampsRaw) {
    const stamp = sanitizeStamp(s);
    if (stamp) stamps.push(stamp);
  }

  const name =
    typeof value.name === 'string'
      ? value.name.replace(/\s+/g, ' ').trim().slice(0, DESIGN_LIMITS.nameMaxLength)
      : '';

  const design: AvatarDesign = {
    version: 1,
    id: value.id,
    name: name.length > 0 ? name : 'untitled cutout',
    silhouette,
    ...(customOutline ? { customOutline } : {}),
    paper: {
      color: sanitizeKey(value.paper?.color, 'kraft'),
      pattern: sanitizeKey(value.paper?.pattern, 'plain'),
    },
    // Omitted entirely when empty: a design with no stamps serializes exactly
    // as it did before stamps existed.
    ...(stamps.length > 0 ? { stamps } : {}),
    ...(isFiniteNumber(value.drawingIndex)
      ? { drawingIndex: clamp(Math.round(value.drawingIndex), 0, DESIGN_LIMITS.maxStamps) }
      : {}),
    ...(value.drawingHidden === true ? { drawingHidden: true } : {}),
    strokes,
    preset: PRESETS.includes(value.preset as AvatarRef['preset'])
      ? (value.preset as AvatarRef['preset'])
      : 'medium',
    sharedOnCard: value.sharedOnCard === true,
    createdAt: isFiniteNumber(value.createdAt) ? value.createdAt : Date.now(),
    updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : Date.now(),
  };

  // Size guard for the eventual wire/storage path.
  if (JSON.stringify(design).length > DESIGN_LIMITS.maxBytes) return null;
  return design;
}
