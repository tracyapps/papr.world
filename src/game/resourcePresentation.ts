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
 * One drawing, two possible orientations in the world — `world/pageRuntime.ts`
 * picks per-resource by its existing `HarvestVisual` (`twigBundle`/
 * `stoneCluster` lie flat on the ground and get scattered several-at-a-time
 * as small ground decals; `fiberTuft` stands up like a blade of grass and
 * gets scattered as small standing cutouts). You never draw a whole pile —
 * one twig, one pebble, one blade per file — the game scatters copies.
 *
 * Read through `getResourceArt()`, never indexed directly.
 */
export type ResourceArt = {
  /** Compiled runtime PNG, same convention as `TOOL_ART`/`DECOR_DEFS`. */
  sourceUrl: string;
  /** Width ÷ height of the source art, exactly as drawn. */
  aspectRatio: number;
};

export const RESOURCE_ART = {
  // The first real example — see docs/resource-artwork-guide.md for how
  // this one was made and what's different (nothing, structurally) between
  // a "sticks" resource and a "stones" one.
  'terracotta-pebbles': {
    // Public-path convention, same as TREE_DEFS/DECOR_DEFS in pageRuntime.ts
    // (assets/ is the Vite public dir, served as-is at /assets/...) — not
    // the import.meta.url convention TOOL_ART uses, which is for a
    // different consumer (a DOM <img>, not a THREE.js scene texture).
    sourceUrl: '/assets/runtime/resources/terracotta-pebbles.png',
    aspectRatio: 240 / 190,
  },
} as const satisfies Partial<Record<ResourceId, ResourceArt>>;

/** Artwork for a resource, or null when it has none yet. */
export function getResourceArt(resource: ResourceId): ResourceArt | null {
  return (RESOURCE_ART as Partial<Record<ResourceId, ResourceArt>>)[resource] ?? null;
}
