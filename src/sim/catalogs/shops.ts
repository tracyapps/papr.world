import { RESOURCE_CORE_DEFS, type ResourceId } from './resources';
import { SEED_DEFS, type SeedId } from './seeds';

export type ShopId = 'seed-store';

export type ShopDefinition = {
  id: ShopId;
  name: string;
  shopkeeper: string;
  sells: readonly SeedId[];
  buys: readonly ResourceId[];
};

/**
 * Shops declare both sides of their trade explicitly. The arrays are data,
 * rather than UI assumptions, so a future regional shop can share the same
 * commands while stocking and accepting a different subset.
 */
export const SEED_STORE: ShopDefinition = {
  id: 'seed-store',
  name: 'Pip’s Seed & Garden',
  shopkeeper: 'Pip',
  sells: Object.keys(SEED_DEFS) as SeedId[],
  buys: Object.keys(RESOURCE_CORE_DEFS) as ResourceId[],
};

/** Equal in value to one ₡2 seed packet, and available in the clearing. */
export const SEED_STORE_BARTER = {
  resource: 'mossy-paper-fiber' as const,
  quantity: 2,
};

/** Flat selling price used everywhere a seed packet is offered. */
export function seedStoreSellPrice(_seedId: SeedId): number {
  return 2;
}

/** Maximum packets affordable through one payment route right now. */
export function seedStorePurchaseLimit(
  seedId: SeedId,
  payment: 'chips' | 'barter',
  wallet: { chips: number; inventory: Readonly<Partial<Record<ResourceId, number>>> },
): number {
  if (payment === 'chips') return Math.floor(Math.max(0, wallet.chips) / seedStoreSellPrice(seedId));
  return Math.floor(
    Math.max(0, wallet.inventory[SEED_STORE_BARTER.resource] ?? 0) / SEED_STORE_BARTER.quantity,
  );
}

/**
 * A harvest funds its next seed; loose materials and spare seeds are worth
 * one chip. Keeping value category-based prevents shop-specific arbitrage.
 */
export function seedStoreBuyPrice(resource: ResourceId): number {
  return RESOURCE_CORE_DEFS[resource].category === 'food' ? 2 : 1;
}
