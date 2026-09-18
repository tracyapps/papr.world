import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SAVE_STORAGE_KEY, initializeGameState, setGameStateForTests } from './state';
// Importing the quest runtime registers the active-quest validator on `state`,
// which is exactly what a real boot does before the save is read.
import '../game/quests';
import { takeContinuableThread } from '../game/conversationMemory';

/** A storage stub holding one hand-written save. */
function storageHolding(save: unknown) {
  const map = new Map<string, string>([[SAVE_STORAGE_KEY, JSON.stringify(save)]]);
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value); },
  };
}

function baseSave(player: Record<string, unknown>) {
  return { schemaVersion: 1, player, world: {} };
}

beforeEach(() => setGameStateForTests(null));
afterEach(() => setGameStateForTests(null));

describe('save normalization — hostile input must not crash a conversation', () => {
  it('repairs a conversation memory whose journal is not an array', () => {
    const state = initializeGameState(storageHolding(baseSave({
      conversations: { c1: { flags: 'not-an-array', seen: 5, visits: 'x', journal: 7, recentLines: 'nope' } },
    })));

    const memory = state.player.conversations.c1;
    expect(memory.flags).toEqual([]);
    expect(memory.seen).toEqual({});
    expect(memory.visits).toBe(0);
    expect(memory.journal).toBeUndefined();
    expect(memory.recentLines).toBeUndefined();
    // The real regression: this used to throw `journal.find is not a function`.
    expect(() => takeContinuableThread('c1', Date.now())).not.toThrow();
    expect(takeContinuableThread('c1', Date.now())).toBeNull();
  });

  it('keeps well-formed journal entries and drops malformed ones', () => {
    const state = initializeGameState(storageHolding(baseSave({
      conversations: {
        c1: {
          flags: ['a'], seen: { k: 2 }, visits: 3,
          journal: [
            { id: 'keep', kind: 'materials', text: 'Twigs.', pageId: '0,0', at: 1_600_000_000_000 },
            { id: 'drop-no-kind', text: 'x', pageId: '0,0', at: 1 },
            'entirely wrong',
          ],
        },
      },
    })));
    const journal = state.player.conversations.c1.journal ?? [];
    expect(journal).toHaveLength(1);
    expect(journal[0].id).toBe('keep');
  });

  it('drops an active quest whose id no longer exists, freeing the giver', () => {
    const state = initializeGameState(storageHolding(baseSave({
      quests: {
        active: {
          '0,0#raccoon': { questId: 'quest-that-was-renamed-away', giverId: '0,0#raccoon', acceptedAt: 1, baselines: [0], satisfied: [false], step: 0 },
        },
        completed: [], completedByCritter: {}, offered: {}, cooldownUntil: {},
      },
    })));
    expect(state.player.quests.active['0,0#raccoon']).toBeUndefined();
  });

  it('keeps a real active quest', () => {
    const state = initializeGameState(storageHolding(baseSave({
      quests: {
        active: {
          '0,0#raccoon': { questId: 'favor-first-shiny', giverId: '0,0#raccoon', acceptedAt: 1, baselines: [0], satisfied: [false], step: 0 },
        },
        completed: [], completedByCritter: {}, offered: {}, cooldownUntil: {},
      },
    })));
    expect(state.player.quests.active['0,0#raccoon']?.questId).toBe('favor-first-shiny');
  });

  it('drops malformed trinkets and keeps good ones', () => {
    const state = initializeGameState(storageHolding(baseSave({
      trinkets: [
        { id: 't1', defId: 'lucky-paperclip', seed: 3, acquiredAt: 5, source: 'quest:x', placed: null },
        { defId: 'no-id' },
        { id: 't2', defId: 'x', placed: { pageId: '0,0', x: 1, z: 2, rotY: 0 } },
        'nonsense',
      ],
    })));
    expect(state.player.trinkets).toHaveLength(2);
    expect(state.player.trinkets[0].placed).toBeNull();
    expect(state.player.trinkets[1].placed).toEqual({ pageId: '0,0', x: 1, z: 2, rotY: 0 });
  });

  it('defaults world knowledge to the clearing on a save that predates it', () => {
    const state = initializeGameState(storageHolding(baseSave({})));
    expect(state.player.visitedBiomes).toEqual(['clearing']);
    expect(state.player.visitedPages).toEqual(['0,0']);
    expect(state.player.metCritters).toEqual([]);
  });
});
