import type { ResourceId } from '../sim/catalogs/resources';

/**
 * Artwork for resources that have it.
 *
 * Deliberately partial, same rule as `toolPresentation.ts`. A material's
 * existence in the game — its name, category, and where it's obtained — is
 * a catalog decision (`sim/catalogs/resources.ts`); its unique drawing
 * arrives separately and often later. Requiring an entry here would mean
 * either blocking a resource on art or checking in a placeholder that
 * quietly ships as "the real thing." A resource without art keeps its
 * current generic treatment — a `HarvestVisual` primitive cluster on the
 * ground (`world/pageRuntime.ts`), a flat `mapColor` swatch in the
 * scrapbook (`ui/scrapbook.ts`) — and simply gets better-looking the moment
 * its entry lands here. Nothing needs to change at any of those call
 * sites when that happens; they already read through `getResourceArt()`.
 *
 * See `docs/resource-artwork-guide.md` for the full picture: what each
 * consumer currently shows, and the exact steps to add one resource's art
 * so it carries to the ground, the scrapbook, the build-material picker
 * (where applicable), and the public reference site from one entry.
 *
 * Read through `getResourceArt()`, never indexed directly.
 */
export type ResourceArt = {
  /** Compiled runtime PNG, same convention as `TOOL_ART`/`DECOR_DEFS`. */
  sourceUrl: string;
  /** Width ÷ height of the source art, for cutout billboard sizing. */
  aspectRatio: number;
};

export const RESOURCE_ART = {
  // Empty on purpose — see the doc comment above. The first entry might
  // look like:
  //
  // 'kraft-twigs': {
  //   sourceUrl: new URL('../../assets/source/resources/kraft-twigs.svg', import.meta.url).href,
  //   aspectRatio: 1.4,
  // },
} as const satisfies Partial<Record<ResourceId, ResourceArt>>;

/** Artwork for a resource, or null when it has none yet. */
export function getResourceArt(resource: ResourceId): ResourceArt | null {
  return (RESOURCE_ART as Partial<Record<ResourceId, ResourceArt>>)[resource] ?? null;
}
