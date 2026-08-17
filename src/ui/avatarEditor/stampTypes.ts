// Stamp template shape — shared by the hand-edited catalog code and the
// GENERATED stamps module (stamps.generated.ts).
//
// Stamp source of truth lives in assets/avatar-stamps/ (one SVG per stamp +
// stamps.json metadata). Edit there, then `npm run stamps:compile` (or
// `stamps:watch` while drawing) — never edit stamps.generated.ts by hand.

/** Which recolourable part of a stamp a path belongs to. */
export type StampRole =
  /** The player's chosen crayon colour — outlines, pupils, hair. */
  | 'ink'
  /** The paper stock the cutout is cut from — eye whites, wings. */
  | 'paper'
  /** A darker tint of that stock — creases, nostrils, blush. */
  | 'shadow';

export type StampCategory = 'eyes' | 'faces' | 'hair' | 'limbs' | 'extras';

/**
 * Where a stamp sits relative to the cutout.
 *
 * `on` is clipped to the silhouette — a face cannot slide off a face. `behind`
 * is a separate piece of paper glued behind the cutout, so it may hang outside
 * it entirely; that is the whole reason stamps exist, since strokes are
 * clipped and could never make an arm.
 */
export type StampLayer = 'on' | 'behind';

export type StampPart = {
  role: StampRole;
  /** Path data, normalized: centred on (0, 0), longest side STAMP_NATURAL_SIZE. */
  path: string;
};

export type StampTemplate = {
  key: string;
  label: string;
  category: StampCategory;
  /** Read to screen-reader users in the tray; concrete enough to choose by. */
  spoken: string;
  /** Search terms — lowercase, player-facing words. */
  keywords: string[];
  layer: StampLayer;
  /** Size this stamp wants to be placed at, relative to its natural size. */
  defaultScale: number;
  /** Normalized extents, for sensible first placement. */
  width: number;
  height: number;
  parts: StampPart[];
};

/** Display + sort order for categories in the stamp tray. */
export const STAMP_CATEGORY_ORDER: StampCategory[] = [
  'eyes',
  'faces',
  'hair',
  'limbs',
  'extras',
];
