import { afterEach, describe, expect, it } from 'vitest';
import {
  SAVE_STORAGE_KEY,
  createDefaultGameState,
  initializeGameState,
  setGameStateForTests,
} from './state';

afterEach(() => setGameStateForTests(null));

function fakeStorage(value: string) {
  return {
    value,
    getItem(key: string) { return key === SAVE_STORAGE_KEY ? this.value : null; },
    setItem(_key: string, value: string) { this.value = value; },
  };
}

describe('placed-piece material save shape', () => {
  it('round-trips a chosen material', () => {
    const saved = createDefaultGameState();
    saved.world.pages['0,0'] = {
      ...saved.world.pages['0,0'],
      terrainEdits: {}, treeGrowth: {}, plantedCells: {}, placedEntities: {}, buildSites: {},
      placedPieces: {
        'piece-1': {
          id: 'piece-1', templateKey: 'paper-bench', x: 1, z: 2, rotY: 0,
          material: 'paper.grey', makerId: 'local-player', page: '0,0',
        },
      },
    };
    const storage = fakeStorage(JSON.stringify(saved));

    const loaded = initializeGameState(storage);
    expect(loaded.world.pages['0,0'].placedPieces['piece-1'].material).toBe('paper.grey');
  });

  it('defaults a save written before this field existed to an empty string, not a crash', () => {
    const saved = createDefaultGameState();
    const pieceWithoutMaterial = {
      id: 'piece-1', templateKey: 'paper-bench', x: 1, z: 2, rotY: 0,
      makerId: 'local-player', page: '0,0',
    };
    saved.world.pages['0,0'] = {
      ...saved.world.pages['0,0'],
      terrainEdits: {}, treeGrowth: {}, plantedCells: {}, placedEntities: {}, buildSites: {},
      placedPieces: { 'piece-1': pieceWithoutMaterial as never },
    };
    const storage = fakeStorage(JSON.stringify(saved));

    const loaded = initializeGameState(storage);
    expect(loaded.world.pages['0,0'].placedPieces['piece-1'].material).toBe('');
  });

  it('bounds an oversized material string the same way templateKey is bounded', () => {
    const saved = createDefaultGameState();
    saved.world.pages['0,0'] = {
      ...saved.world.pages['0,0'],
      terrainEdits: {}, treeGrowth: {}, plantedCells: {}, placedEntities: {}, buildSites: {},
      placedPieces: {
        'piece-1': {
          id: 'piece-1', templateKey: 'paper-bench', x: 1, z: 2, rotY: 0,
          material: 'x'.repeat(200), makerId: 'local-player', page: '0,0',
        },
      },
    };
    const storage = fakeStorage(JSON.stringify(saved));

    const loaded = initializeGameState(storage);
    expect(loaded.world.pages['0,0'].placedPieces['piece-1'].material).toHaveLength(64);
  });
});
