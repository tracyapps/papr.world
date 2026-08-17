// Avatar editor catalogs: papers, crayons — plus re-exported shapes.
//
// All art is ORIGINAL. Nostalgia entries are safe homage, deliberately
// unnamed (docs/avatar-and-identity.md, IP decision 2026-08-10): the dragon
// doodle has one beefy arm and no name; the tokens are generic objects.
//
// Papers/crayons/brushes are authored HERE. Silhouette shapes are NOT — they
// are generated from assets/avatar-shapes/ (one SVG per shape + shapes.json
// with spoken descriptions and search keywords). Edit those files and run
// `npm run shapes:compile` (or `shapes:watch`); see the artwork guide's
// "For Avatar Cutout Shapes" section for the full authoring workflow.

import type { StrokeMedium } from '../../../shared/src/index';

// ---- Paper stock ------------------------------------------------------------

export type PaperColor = { key: string; label: string; fill: string };

/** Construction-paper set. `fill` is the sheet color the cutout is made of. */
export const PAPER_COLORS: PaperColor[] = [
  { key: 'kraft', label: 'kraft brown', fill: '#c9a876' },
  { key: 'newsprint', label: 'newsprint', fill: '#e8e2d0' },
  { key: 'construction-red', label: 'brick red', fill: '#c96a5b' },
  { key: 'construction-orange', label: 'pumpkin orange', fill: '#d99a5b' },
  { key: 'construction-yellow', label: 'school-bus yellow', fill: '#e0c265' },
  { key: 'construction-green', label: 'clover green', fill: '#8fae72' },
  { key: 'construction-blue', label: 'pond blue', fill: '#7d9ec4' },
  { key: 'construction-purple', label: 'grape purple', fill: '#9a83b5' },
  { key: 'construction-pink', label: 'eraser pink', fill: '#dba3ad' },
  { key: 'charcoal', label: 'charcoal gray', fill: '#6b675f' },
];

export type PaperPattern = { key: string; label: string };

/**
 * Pattern keys only — the SVG for each pattern is built in render.ts so the
 * catalog stays data. "plain" must exist; it is the sanitize fallback.
 */
export const PAPER_PATTERNS: PaperPattern[] = [
  { key: 'plain', label: 'plain' },
  { key: 'lined', label: 'lined notebook' },
  { key: 'graph', label: 'graph paper' },
  { key: 'dot-grid', label: 'dot grid' },
  { key: 'torn-edge', label: 'plain, torn edge' },
];

// ---- Crayons ----------------------------------------------------------------

export type Crayon = { label: string; color: string };

/** Named, because "swatch 7" is not a color anyone chose on purpose. */
export const CRAYONS: Crayon[] = [
  { label: 'pencil gray', color: '#4a453c' },
  { label: 'ink black', color: '#2b2620' },
  { label: 'brick red', color: '#b3402e' },
  { label: 'poppy orange', color: '#d97b2a' },
  { label: 'sunflower yellow', color: '#d9b13b' },
  { label: 'leaf green', color: '#5d8a45' },
  { label: 'pond blue', color: '#3f6ea6' },
  { label: 'berry purple', color: '#7c5296' },
  { label: 'bubblegum pink', color: '#d1728a' },
  { label: 'cloud white', color: '#f2ede1' },
];

/**
 * What you are drawing WITH, as opposed to how thick.
 *
 * Crayon is opaque and flat. The other two are translucent and build up —
 * going over the same spot twice deepens it, and the paper's own pattern
 * keeps showing through. That is the reason they are separate media rather
 * than an opacity slider: the layering is the effect.
 */
export const STROKE_MEDIA: Array<{ key: StrokeMedium; label: string; hint: string }> = [
  { key: 'crayon', label: 'crayon', hint: 'solid and waxy' },
  { key: 'watercolor', label: 'watercolour', hint: 'thin washes that layer up' },
  { key: 'spray', label: 'spray paint', hint: 'speckled, builds as you pass over' },
];

export const BRUSH_WIDTHS: Array<{ label: string; width: number }> = [
  { label: 'fine tip', width: 1 },
  { label: 'crayon', width: 2.5 },
  { label: 'chunky crayon', width: 5 },
];

// ---- Silhouette templates ---------------------------------------------------
//
// Shape data is GENERATED: source of truth is assets/avatar-shapes/
// (shapes.json + one SVG per shape). Add or edit shapes there, then
// `npm run shapes:compile` (or `shapes:watch` while drawing). Types and
// category order live in shapeTypes.ts.

export { SILHOUETTES } from './shapes.generated';
export { CATEGORY_ORDER, type ShapeCategory, type SilhouetteTemplate } from './shapeTypes';

import { SILHOUETTES } from './shapes.generated';
import type { SilhouetteTemplate } from './shapeTypes';

// ---- Stamps -----------------------------------------------------------------
//
// Also GENERATED: assets/avatar-stamps/ (stamps.json + one SVG per stamp),
// compiled by `npm run stamps:compile`. Stamps are the pre-drawn details —
// eyes, mouths, and the appendages that hang outside the cutout, which
// freehand strokes can never make because strokes are clipped to it.

export { STAMPS, STAMP_NATURAL_SIZE } from './stamps.generated';
export {
  STAMP_CATEGORY_ORDER,
  type StampCategory,
  type StampLayer,
  type StampPart,
  type StampRole,
  type StampTemplate,
} from './stampTypes';

import { STAMPS } from './stamps.generated';
import type { StampTemplate } from './stampTypes';

/**
 * Lookup for a placed stamp's template, or null when the key is unknown — a
 * design can name a stamp this client does not have (an older build, or a
 * catalog entry that was retired), and the right answer is to skip it, not to
 * substitute something the player never chose.
 */
export function findStamp(key: string): StampTemplate | null {
  return STAMPS.find((s) => s.key === key) ?? null;
}

/** Lookup helper the editor and renderer share. */
export function findSilhouette(key: string): SilhouetteTemplate {
  return SILHOUETTES.find((s) => s.key === key) ?? SILHOUETTES[0]!;
}

export function findPaperColor(key: string): PaperColor {
  return PAPER_COLORS.find((p) => p.key === key) ?? PAPER_COLORS[0]!;
}
