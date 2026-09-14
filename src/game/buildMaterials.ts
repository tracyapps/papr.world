import { buildMaterialUnits, formatBuildMaterial, type BuildMaterialId } from '../sim/catalogs/building';
import { RESOURCE_CORE_DEFS, type ResourceId } from '../sim/catalogs/resources';
import { getGameState } from '../sim/state';
import { getBuildSurfaceUrl, resourceBuildSurfaces } from './resourcePresentation';

/**
 * What you can build out of, right now, out of your own bag.
 *
 * The old picker offered six curated paper textures that tied to no resource
 * and cost nothing — its own doc comment admitted there was "no asset work in
 * offering a new one, only in curating". This replaces that with the honest
 * question: which materials have you actually gathered, and have you enough
 * for the piece in hand.
 *
 * Two facts have to meet here, from either side of the sim/render line: the
 * catalog knows what a resource *is* and what a piece costs, and the generated
 * art knows which resources have been drawn. Neither alone can answer "what
 * can I build with", so this is the one place that joins them, and both the
 * palette and placement read it rather than each working it out.
 */
export type BuildMaterialOffer = {
  id: BuildMaterialId;
  resource: ResourceId;
  colorway: string | null;
  label: string;
  textureUrl: string;
  /** How many of this resource are in the bag right now. */
  owned: number;
};

/** Every material the player holds that has artwork, newest colourway last. */
export function buildMaterialOffers(): BuildMaterialOffer[] {
  const inventory = getGameState().player.inventory;
  const offers: BuildMaterialOffer[] = [];

  for (const [resource, surfaces] of resourceBuildSurfaces()) {
    const owned = inventory[resource] ?? 0;
    if (owned <= 0) continue;
    const core = RESOURCE_CORE_DEFS[resource];
    for (const surface of surfaces) {
      const id = formatBuildMaterial(resource, surface.colorway);
      const textureUrl = getBuildSurfaceUrl(id);
      if (!textureUrl) continue;
      offers.push({
        id,
        resource,
        colorway: surface.colorway,
        label: surface.colorway ? `${core.shortLabel} · ${surface.label}` : core.shortLabel,
        textureUrl,
        owned,
      });
    }
  }

  return offers.sort((a, b) => a.label.localeCompare(b.label));
}

/** Can this piece be built out of this material, with what is in the bag? */
export function canAffordBuildMaterial(templateKey: string, material: BuildMaterialId): boolean {
  const offer = buildMaterialOffers().find((entry) => entry.id === material);
  return offer ? offer.owned >= buildMaterialUnits(templateKey) : false;
}

/**
 * The material to select when the current one will not do — the first
 * affordable one, or none at all when the bag cannot cover the piece.
 *
 * Returning null rather than falling back to a retired paper key is
 * deliberate: a piece built for free would be a way around the material
 * economy, not a shortcut through it.
 */
export function defaultBuildMaterial(templateKey: string): BuildMaterialId | null {
  const units = buildMaterialUnits(templateKey);
  return buildMaterialOffers().find((offer) => offer.owned >= units)?.id ?? null;
}
