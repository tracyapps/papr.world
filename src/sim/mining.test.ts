import { describe, expect, it } from 'vitest';
import {
  MAX_ROCK_GROWTH,
  ROCK_REGROWTH_PER_SECOND,
  resolveMineYield,
  rockGrowthAt,
  rockIsReady,
  type RockGrowthState,
} from './catalogs/mining';
import { applyGameCommand } from './commands';
import { createDefaultGameState } from './state';
import { decorRockFormation } from '../world/mineableDecor';

const NOW = 1_700_000_000_000;

describe('surface rock regrowth', () => {
  it('treats an untouched formation as ready and reforms from elapsed time', () => {
    expect(rockIsReady(undefined, NOW)).toBe(true);
    const record: RockGrowthState = { growth: 0, minedAt: NOW, mines: 1 };
    expect(rockGrowthAt(record, NOW + 60_000)).toBeCloseTo(ROCK_REGROWTH_PER_SECOND * 60, 5);
    expect(rockGrowthAt(record, NOW + 6 * 60_000)).toBe(MAX_ROCK_GROWTH);
  });

  it('maps only rock artwork into the mine registry', () => {
    expect(decorRockFormation('boulder-large')).toBe('boulder');
    expect(decorRockFormation('lichen-rock')).toBe('lichen-rock');
    expect(decorRockFormation('shrub-alpine')).toBeNull();
    expect(decorRockFormation('termite-mound')).toBeNull();
  });
});

describe('mine command', () => {
  function mine(state: ReturnType<typeof createDefaultGameState>, now = NOW) {
    return applyGameCommand(state, {
      type: 'mineRock',
      target: {
        pageId: '4,-2', rockKey: 'rock:4.2:-7.1', formation: 'boulder', biome: 'rocky-highlands', x: 4.2, z: -7.1,
      },
      now,
    });
  }

  it('requires the mining verb, depletes the formation, and leaves regional stone drops', () => {
    const state = createDefaultGameState();
    state.player.tools['spork'] = 1;
    state.player.equippedTool = 'spork';

    const result = mine(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(state.world.pages['4,-2'].rockGrowth['rock:4.2:-7.1']).toMatchObject({ growth: 0, mines: 1 });
    expect(result.drops?.['granite-cardstone']).toBe(3);
    expect(Object.values(state.world.pages['4,-2'].resourceDrops ?? {})).not.toHaveLength(0);
    expect(state.player.activityLog[0]).toMatchObject({ kind: 'gathering', at: NOW });
    expect(state.player.activityLog[0]?.message).toContain('Granite cardstone');
    expect(mine(state, NOW + 1000).ok).toBe(false);
    expect(mine(state, NOW + 6 * 60_000).ok).toBe(true);
  });

  it('refuses an equipped shovel', () => {
    const state = createDefaultGameState();
    state.player.tools['flimsy-shovel'] = 1;
    state.player.equippedTool = 'flimsy-shovel';
    expect(mine(state).ok).toBe(false);
  });

  it('resolves the same regional reward after reload', () => {
    const args = { rockKey: 'stable', formation: 'cliff-slab', biome: 'badlands', mines: 2 } as const;
    expect(resolveMineYield(args)).toEqual(resolveMineYield(args));
    expect(resolveMineYield(args)[0]).toEqual({ resource: 'granite-cardstone', quantity: 3 });
  });
});
