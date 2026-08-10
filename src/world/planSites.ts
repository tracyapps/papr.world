import { BIOME_IDS } from '../sim/catalogs/biomes';
import { biomesFor } from '../sim/catalogs/obtaining';
import {
  RECIPE_DEFS,
  isRecipeAvailable,
  isWorldPlan,
  type RecipeId,
} from '../sim/catalogs/recipes';
import { RESOURCE_CORE_DEFS, type ResourceId } from '../sim/catalogs/resources';
import { dominantBiomeAt } from './fields';
import type { Biome } from './types';

/**
 * Where every findable plan is.
 *
 * **A plan has one location, derived from its id — not a chance of turning up
 * when you dig.** That is the load-bearing decision in this file and it is
 * worth stating plainly, because a random roll would be easier to write and
 * would quietly make two features impossible:
 *
 * - **The plan detector could not exist.** "Warmer" only means something if
 *   there is a *there* to be nearer to. Against a roll, hot and cold are
 *   noise.
 * - **Two players could not talk about it.** "I found the bench plan out past
 *   the dunes" has to be true for everyone, or the world stops being shared.
 *
 * It also makes the whole system testable without rendering anything: a site
 * is a pure function of a recipe id, so a test can assert that every plan sits
 * somewhere sensible, forever, without a browser.
 *
 * See `docs/plans-and-blueprints.md` and Phase 1 of `docs/roadmap.md`.
 */

export type PlanSite = {
  recipeId: RecipeId;
  x: number;
  z: number;
  /** The biome the site landed in. Recomputed, never stored as truth. */
  biome: Biome;
  /**
   * How this site was chosen.
   *
   * - `preferred` — landed in a biome that supplies the plan's signature
   *   ingredient. What siting is for.
   * - `unbiased` — the plan has no regionally distinctive ingredient, so there
   *   was nothing to bias toward and any spot is as good as any other. This is
   *   the *current* state of every recipe, and it is data, not a bug: see
   *   `planIngredientBiomes`.
   * - `fallback` — there was a preference and the ring had nothing matching it.
   *   The only one of the three worth investigating; it means the tier ring
   *   wants widening.
   */
  siting: 'preferred' | 'unbiased' | 'fallback';
};

/**
 * How far out an everything-else plan sits.
 *
 * Tool tiers are deliberately irrelevant here: those plans belong to the
 * knowledge tree. Furniture, clothing, structure, and decoration recipes can
 * grow their own authored distance bands when that content exists.
 */
const DEFAULT_RING = { min: 220, max: 620 };

/** How many deterministic candidates to try before accepting a fallback. */
const SITING_ATTEMPTS = 48;

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rollFrom(seed: number, salt: number): number {
  let value = Math.imul(seed ^ salt, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return (value >>> 0) / 0xffffffff;
}

/**
 * Plans that may be found in the world.
 *
 * `planSource` is the boundary: tool plans are starter knowledge or knowledge
 * tree grants, never holes, shops, or gifts. Future furniture, clothing,
 * structure, and decoration plans opt into this route explicitly.
 */
export function findablePlanIds(): RecipeId[] {
  return (Object.keys(RECIPE_DEFS) as RecipeId[])
    .filter((recipeId) => isRecipeAvailable(recipeId) && isWorldPlan(recipeId));
}

/**
 * Biomes that supply what this plan is *distinctively* made of.
 *
 * Two filters, and the second one is the important one:
 *
 * 1. Only `exact` ingredients count. Family requirements — "three sticks" —
 *    are satisfiable almost everywhere, so letting them vote would make every
 *    plan belong to every biome.
 * 2. **An ingredient available in every biome is dropped**, because it carries
 *    no signal. `graphite-cardstone` can be dug at layer 3 anywhere, so
 *    "somewhere you can get cardstone" means "anywhere" and biasing toward it
 *    is the same as not biasing at all.
 *
 * Without filter 2 this function returned all five biomes for every recipe and
 * the bias silently did nothing while appearing to work — which is worse than
 * doing nothing openly. An empty result is the honest answer: *this plan has no
 * regional home yet.*
 *
 * That is the current state of every recipe in the game, and it resolves itself
 * as data rather than code: the moment a recipe asks for a regional material —
 * `redwood-bark-curls` is forest-only and already in the catalog — that plan
 * acquires a home and siting starts steering toward it, with no change here.
 */
export function planIngredientBiomes(recipeId: RecipeId): Biome[] {
  const everywhere = BIOME_IDS.length;
  const wanted = new Set<Biome>();

  for (const ingredient of RECIPE_DEFS[recipeId].ingredients) {
    if (ingredient.kind !== 'exact') continue;
    const biomes = biomesFor(ingredient.resource);
    if (biomes.length === 0 || biomes.length >= everywhere) continue;
    for (const biome of biomes) wanted.add(biome);
  }

  return [...wanted];
}

/** Every `exact` material a plan asks for. */
export function planExactIngredients(recipeId: RecipeId): ResourceId[] {
  return RECIPE_DEFS[recipeId].ingredients
    .filter((ingredient): ingredient is Extract<typeof ingredient, { kind: 'exact' }> => ingredient.kind === 'exact')
    .map((ingredient) => ingredient.resource)
    .filter((resource) => resource in RESOURCE_CORE_DEFS);
}

const siteCache = new Map<RecipeId, PlanSite>();

/**
 * Where this plan is, always and everywhere.
 *
 * Walks a deterministic sequence of candidate points in a tier-appropriate
 * ring and takes the first one standing in a biome that supplies the plan's
 * own materials — so arriving somewhere new means being able to finish the
 * loop there, rather than carrying a plan home to a region that has the parts.
 *
 * Falls back to the first candidate rather than failing. A plan that exists
 * nowhere is worse than a plan in a slightly odd place, and siting must be
 * total: `findablePlanIds()` promises every one of these has an answer.
 */
export function planSiteFor(recipeId: RecipeId): PlanSite {
  if (!isWorldPlan(recipeId)) {
    throw new Error(`Tool plan ${recipeId} belongs to the knowledge tree, not world siting.`);
  }
  const cached = siteCache.get(recipeId);
  if (cached) return cached;

  const seed = hashText(`plan-site:${recipeId}`);
  const ring = DEFAULT_RING;
  const preferred = new Set(planIngredientBiomes(recipeId));

  let fallback: PlanSite | null = null;

  for (let attempt = 0; attempt < SITING_ATTEMPTS; attempt += 1) {
    // Golden-angle stepping spreads successive attempts around the ring
    // instead of clustering them, so a plan whose biome is rare still finds
    // it rather than probing the same arc 48 times.
    const angle = rollFrom(seed, 17) * Math.PI * 2 + attempt * 2.399963;
    const radius = ring.min + rollFrom(seed, 101 + attempt * 7) * (ring.max - ring.min);
    const x = Math.round(Math.cos(angle) * radius);
    const z = Math.round(Math.sin(angle) * radius);
    const biome = dominantBiomeAt(x, z);

    if (preferred.size === 0) {
      const site: PlanSite = { recipeId, x, z, biome, siting: 'unbiased' };
      siteCache.set(recipeId, site);
      return site;
    }
    if (preferred.has(biome)) {
      const site: PlanSite = { recipeId, x, z, biome, siting: 'preferred' };
      siteCache.set(recipeId, site);
      return site;
    }
    fallback ??= { recipeId, x, z, biome, siting: 'fallback' };
  }

  const site = fallback as PlanSite;
  siteCache.set(recipeId, site);
  return site;
}

/** Every plan site, for the map and for tests. */
export function allPlanSites(): PlanSite[] {
  return findablePlanIds().map(planSiteFor);
}

/** Test seam. Siting is pure, so this only matters if a table is hot-edited. */
export function clearPlanSiteCache(): void {
  siteCache.clear();
}
