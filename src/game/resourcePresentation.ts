import { parseBuildMaterial } from '../sim/catalogs/building';
import type { ResourceId } from '../sim/catalogs/resources';
import { GENERATED_RESOURCE_ART } from './resourceArt.generated';

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
 * generated art lands here. Nothing needs to change at any of those call
 * sites when that happens; they already read through `getResourceArt()`.
 *
 * `npm run assets:compile` fills several standard loose silhouettes from a
 * tile at `materials/resources/<form>/<resource-id>.svg`, then writes
 * `resourceArt.generated.ts`. Direct seed cutouts are generated from
 * `resources/seeds/<resource-id>.svg`. The legacy map below is only a bridge
 * for art that has not moved into that pipeline yet.
 *
 * See `docs/resource-asset-pipeline.md` for the artist workflow.
 *
 * Read through `getResourceArt()`, never indexed directly.
 */
export type ResourceArtVariant = {
  /** Compiled runtime PNG, same convention as `TOOL_ART`/`DECOR_DEFS`. */
  sourceUrl: string;
  /** Width ÷ height of the source art, exactly as drawn. */
  aspectRatio: number;
};

export type ResourceArt = ResourceArtVariant & {
  /** Deterministic alternatives generated from the same default tile. */
  variants: readonly ResourceArtVariant[];
};

const LEGACY_RESOURCE_ART = {
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
    variants: [{
      sourceUrl: '/assets/runtime/resources/terracotta-pebbles.png',
      aspectRatio: 240 / 190,
    }],
  },
} as const satisfies Partial<Record<ResourceId, ResourceArt>>;

type GeneratedArtRecord = {
  /** The tiling surface the loose pieces were cut from. Null for seeds,
   *  which are drawn as direct cutouts and have no tiling form. */
  surfaceUrl: string | null;
  colorways: readonly { id: string; label: string; sourceUrl: string }[];
  variants: readonly ResourceArtVariant[];
};

const generatedResourceArt = GENERATED_RESOURCE_ART as Partial<Record<ResourceId, GeneratedArtRecord>>;

/**
 * Generated folder-driven art wins over a legacy hand-authored entry. Keeping
 * the old map as a fallback lets resources migrate one tile at a time without
 * making existing saves or artwork disappear between compiler runs.
 */
export const RESOURCE_ART: Partial<Record<ResourceId, ResourceArt>> = {
  ...LEGACY_RESOURCE_ART,
  ...Object.fromEntries(Object.entries(generatedResourceArt).flatMap(([resource, generated]) => {
    const first = generated?.variants[0];
    if (!first || !generated) return [];
    return [[resource, { ...first, variants: generated.variants }]];
  })),
};

/** Artwork for a resource, or null when it has none yet. */
export function getResourceArt(resource: ResourceId): ResourceArt | null {
  return RESOURCE_ART[resource] ?? null;
}

/**
 * The resource's tiling material, when it has one.
 *
 * This is what lets a drawn pattern become the *surface of the thing* rather
 * than a picture of the thing: a pile of pebbles keeps its real geometry and
 * wears this tile, the same way a wall or a floor does. Null for a resource
 * with no art yet, and for seeds — those are authored as direct cutouts and
 * genuinely have no tiling form.
 */
export function getResourceSurfaceUrl(resource: ResourceId): string | null {
  return generatedResourceArt[resource]?.surfaceUrl ?? null;
}

/** Select one stable loose drawing without changing scrapbook/reference art. */
export function resourceArtVariant(art: ResourceArt, seed: number): ResourceArtVariant {
  const variants = art.variants.length > 0 ? art.variants : [art];
  const index = Math.abs(Math.trunc(seed)) % variants.length;
  return variants[index];
}

/**
 * The tile a build material names, colorway included.
 *
 * `sim/` validates that a build material names a real resource and stops
 * there, on purpose — whether that resource has been drawn yet, and what
 * `kraft-twigs.terracotta` looks like, are presentation facts. This is where
 * they are answered. Null means the material is a retired paper key, or names
 * a resource nobody has drawn yet; either way the caller falls back to the
 * piece's original look rather than rendering nothing.
 */
export function getBuildSurfaceUrl(material: string): string | null {
  const parsed = parseBuildMaterial(material);
  if (!parsed) return null;
  const record = generatedResourceArt[parsed.resource];
  if (!record) return null;
  if (!parsed.colorway) return record.surfaceUrl;
  const colorway = record.colorways.find((entry) => entry.id === parsed.colorway);
  return colorway?.sourceUrl ?? record.surfaceUrl;
}

/**
 * Every drawn resource and the surfaces it offers — its default tile first,
 * then each colorway. A colorway costs no more than the plain tile: it is the
 * same paper, dyed differently.
 */
export function resourceBuildSurfaces(): Array<[ResourceId, Array<{ colorway: string | null; label: string }>]> {
  return (Object.keys(generatedResourceArt) as ResourceId[]).flatMap((resource) => {
    const record = generatedResourceArt[resource];
    if (!record?.surfaceUrl) return [];
    const surfaces = [
      { colorway: null, label: 'As drawn' },
      ...record.colorways.map((entry) => ({ colorway: entry.id, label: entry.label })),
    ];
    return [[resource, surfaces] as [ResourceId, Array<{ colorway: string | null; label: string }>]];
  });
}
