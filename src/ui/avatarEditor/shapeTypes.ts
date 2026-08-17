// Silhouette template shape — shared by the hand-edited catalog code and the
// GENERATED shapes module (shapes.generated.ts).
//
// Shape source of truth lives in assets/avatar-shapes/ (one SVG per shape +
// shapes.json metadata). Edit there, then `npm run shapes:compile` (or
// `shapes:watch` while iterating) — never edit shapes.generated.ts by hand.

import type { AvatarRef } from '../../../shared/src/index';

export type ShapeCategory = 'folks' | 'shapes' | 'animals' | 'tokens' | 'nostalgia';

export type SilhouetteTemplate = {
  key: string;
  label: string;
  category: ShapeCategory;
  /** Read to screen-reader users in the picker; concrete enough to choose by. */
  spoken: string;
  /** Search terms for the shape picker — lowercase, player-facing words. */
  keywords: string[];
  /** Collision body — gameplay reads THIS, never the art. */
  preset: AvatarRef['preset'];
  /** Closed SVG path data in the 0 0 100 140 sheet. */
  path: string;
};

/** Display + sort order for categories in the picker. */
export const CATEGORY_ORDER: ShapeCategory[] = [
  'folks',
  'shapes',
  'animals',
  'tokens',
  'nostalgia',
];
