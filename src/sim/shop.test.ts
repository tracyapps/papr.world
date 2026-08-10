import { describe, expect, it } from 'vitest';
import { applyGameCommand } from './commands';
import { RESOURCE_CORE_DEFS } from './catalogs/resources';
import { SEED_DEFS, type SeedId } from './catalogs/seeds';
import {
  SEED_STORE,
  SEED_STORE_BARTER,
  seedStoreBuyPrice,
  seedStorePurchaseLimit,
  seedStoreSellPrice,
} from './catalogs/shops';
import {
  SAVE_SCHEMA_VERSION,
  SAVE_STORAGE_KEY,
  createDefaultGameState,
  initializeGameState,
  setGameStateForTests,
} from './state';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('Pip’s Seed & Garden catalog', () => {
  it('states every seed it sells and every resource it buys', () => {
    expect(new Set(SEED_STORE.sells)).toEqual(new Set(Object.keys(SEED_DEFS)));
    expect(new Set(SEED_STORE.buys)).toEqual(new Set(Object.keys(RESOURCE_CORE_DEFS)));
  });

  it('uses one quiet flat price rule', () => {
    expect(seedStoreSellPrice('paper-tomato-seeds')).toBe(2);
    expect(seedStoreBuyPrice('mossy-paper-fiber')).toBe(1);
    expect(seedStoreBuyPrice('raspberries')).toBe(2);
    expect(seedStoreBuyPrice('buttonbloom-seeds')).toBe(1);
  });

  it('derives each Max purchase from the chosen payment inventory', () => {
    const wallet = { chips: 11, inventory: { [SEED_STORE_BARTER.resource]: 7 } };
    expect(seedStorePurchaseLimit('paper-tomato-seeds', 'chips', wallet)).toBe(5);
    expect(seedStorePurchaseLimit('paper-tomato-seeds', 'barter', wallet)).toBe(3);
  });
});

describe('seed-store save compatibility', () => {
  it('starts new and old saves with no shiny chips', () => {
    expect(createDefaultGameState().player.chips).toBe(0);

    const storage = new MemoryStorage();
    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify({
      schemaVersion: SAVE_SCHEMA_VERSION,
      player: {},
      world: {},
    }));
    setGameStateForTests(null);
    expect(initializeGameState(storage).player.chips).toBe(0);
    setGameStateForTests(null);
  });

  it('restores valid quiet activity entries and drops malformed ones', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify({
      schemaVersion: SAVE_SCHEMA_VERSION,
      player: {
        activityLog: [
          { id: 'ready:1', kind: 'garden', message: 'A tomato is ready.', at: 1234 },
          { id: 4, kind: 'noise', message: null, at: 'never' },
        ],
      },
      world: {},
    }));
    setGameStateForTests(null);

    const state = initializeGameState(storage);

    expect(state.player.activityLog).toEqual([
      { id: 'ready:1', kind: 'garden', message: 'A tomato is ready.', at: 1234 },
    ]);
    setGameStateForTests(null);
  });

  it('restores resumable build sites and gives older pages an empty site collection', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify({
      schemaVersion: SAVE_SCHEMA_VERSION,
      player: {},
      world: {
        pages: {
          '0,0': {
            buildSites: {
              frame: {
                templateKey: 'paper-bench', x: 3, z: 4, rotY: 0, page: '0,0',
                completedStepIds: [], startedAt: 100, changedAt: 200,
              },
            },
          },
          '1,0': {},
        },
      },
    }));
    setGameStateForTests(null);

    const state = initializeGameState(storage);

    expect(state.world.pages['0,0'].buildSites.frame).toMatchObject({
      templateKey: 'paper-bench', x: 3, z: 4, completedStepIds: [],
    });
    expect(state.world.pages['1,0'].buildSites).toEqual({});
    setGameStateForTests(null);
  });
});

describe('seed-store commands', () => {
  it('buys one seed with chips and places it directly in the seed pouch', () => {
    const state = createDefaultGameState();
    state.player.chips = 3;
    state.player.inventory['paper-tomato-seeds'] = 0;

    const result = applyGameCommand(state, {
      type: 'buySeed', shopId: 'seed-store', seedId: 'paper-tomato-seeds', payment: 'chips',
    });

    expect(result.ok).toBe(true);
    expect(state.player.chips).toBe(1);
    expect(state.player.inventory['paper-tomato-seeds']).toBe(1);
    expect(state.player.selectedSeed).toBe('paper-tomato-seeds');
  });

  it('buys several packets atomically with chips', () => {
    const state = createDefaultGameState();
    state.player.chips = 10;
    state.player.inventory['paper-tomato-seeds'] = 0;

    const result = applyGameCommand(state, {
      type: 'buySeed', shopId: 'seed-store', seedId: 'paper-tomato-seeds', payment: 'chips', quantity: 4,
    });

    expect(result.ok).toBe(true);
    expect(state.player.chips).toBe(2);
    expect(state.player.inventory['paper-tomato-seeds']).toBe(4);
  });

  it('buys several packets by barter and refuses an unaffordable batch without partial spending', () => {
    const state = createDefaultGameState();
    state.player.inventory[SEED_STORE_BARTER.resource] = 8;

    const bought = applyGameCommand(state, {
      type: 'buySeed', shopId: 'seed-store', seedId: 'folded-cabbage-seeds', payment: 'barter', quantity: 3,
    });
    const beforeRefusal = JSON.stringify(state.player);
    const refused = applyGameCommand(state, {
      type: 'buySeed', shopId: 'seed-store', seedId: 'folded-cabbage-seeds', payment: 'barter', quantity: 2,
    });

    expect(bought.ok).toBe(true);
    expect(state.player.inventory[SEED_STORE_BARTER.resource]).toBe(2);
    expect(state.player.inventory['folded-cabbage-seeds']).toBe(3);
    expect(refused.ok).toBe(false);
    expect(JSON.stringify(state.player)).toBe(beforeRefusal);
  });

  it('refuses fractional seed quantities without changing the player', () => {
    const state = createDefaultGameState();
    state.player.chips = 20;
    const before = JSON.stringify(state.player);

    const result = applyGameCommand(state, {
      type: 'buySeed', shopId: 'seed-store', seedId: 'ribbon-corn-seeds', payment: 'chips', quantity: 1.5,
    });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(state.player)).toBe(before);
  });

  it('refuses a purchase atomically when chips are short', () => {
    const state = createDefaultGameState();
    state.player.chips = 1;
    const before = JSON.stringify(state.player);

    const result = applyGameCommand(state, {
      type: 'buySeed', shopId: 'seed-store', seedId: 'ribbon-corn-seeds', payment: 'chips',
    });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(state.player)).toBe(before);
  });

  it('accepts equal-value fiber barter without changing the chip balance', () => {
    const state = createDefaultGameState();
    state.player.inventory[SEED_STORE_BARTER.resource] = SEED_STORE_BARTER.quantity;

    const result = applyGameCommand(state, {
      type: 'buySeed', shopId: 'seed-store', seedId: 'folded-cabbage-seeds', payment: 'barter',
    });

    expect(result.ok).toBe(true);
    expect(state.player.inventory[SEED_STORE_BARTER.resource]).toBe(0);
    expect(state.player.inventory['folded-cabbage-seeds']).toBe(1);
    expect(state.player.chips).toBe(0);
  });

  it('buys one held item from the player and pays its global value', () => {
    const state = createDefaultGameState();
    state.player.inventory.raspberries = 2;

    const result = applyGameCommand(state, {
      type: 'sellResource', shopId: 'seed-store', resource: 'raspberries', quantity: 1,
    });

    expect(result.ok).toBe(true);
    expect(state.player.inventory.raspberries).toBe(1);
    expect(state.player.chips).toBe(2);
  });

  it('refuses selling an item the player does not have without changing state', () => {
    const state = createDefaultGameState();
    const before = JSON.stringify(state.player);
    const result = applyGameCommand(state, {
      type: 'sellResource', shopId: 'seed-store', resource: 'raspberries', quantity: 1,
    });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(state.player)).toBe(before);
  });

  it('refuses a fractional quantity that rounds down to nothing', () => {
    const state = createDefaultGameState();
    const before = JSON.stringify(state.player);
    const result = applyGameCommand(state, {
      type: 'sellResource', shopId: 'seed-store', resource: 'buttonbloom-seeds', quantity: 0.5,
    });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(state.player)).toBe(before);
  });

  it('refuses buying a seed the shop does not sell without changing state', () => {
    const state = createDefaultGameState();
    state.player.chips = 20;
    const before = JSON.stringify(state.player);
    const result = applyGameCommand(state, {
      type: 'buySeed', shopId: 'seed-store', seedId: 'not-a-seed' as SeedId, payment: 'chips',
    });

    expect(result.ok).toBe(false);
    expect(JSON.stringify(state.player)).toBe(before);
  });
});
