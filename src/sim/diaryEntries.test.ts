import { afterEach, describe, expect, it } from 'vitest';
import {
  DIARY_ENTRY_LIMIT,
  SAVE_STORAGE_KEY,
  createDefaultGameState,
  initializeGameState,
  setGameStateForTests,
  type DiaryEntry,
} from './state';

afterEach(() => setGameStateForTests(null));

function fakeStorage(value: string) {
  return {
    value,
    getItem(key: string) { return key === SAVE_STORAGE_KEY ? this.value : null; },
    setItem(_key: string, value: string) { this.value = value; },
  };
}

const validEntry: DiaryEntry = {
  id: 'place:0,0:materials:0',
  critterId: 'squirrel-1',
  pageId: '0,0',
  kind: 'materials',
  text: 'Keep an eye out for paper fiber around this forest.',
  recordedAt: 1_000,
};

describe('diary entry save shape (Phase 2.4 data shape)', () => {
  it('defaults to an empty diary on a fresh save', () => {
    expect(createDefaultGameState().player.diaryEntries).toEqual([]);
  });

  it('loads an older save with no diaryEntries field as an empty diary', () => {
    const oldState = createDefaultGameState();
    delete (oldState.player as unknown as Record<string, unknown>).diaryEntries;
    const storage = fakeStorage(JSON.stringify(oldState));

    expect(initializeGameState(storage).player.diaryEntries).toEqual([]);
  });

  it('round-trips a well-formed entry, with and without the player-authored note seam', () => {
    const withNote: DiaryEntry = { ...validEntry, id: 'place:0,0:materials:1', note: 'my own note' };
    const saved = createDefaultGameState();
    saved.player.diaryEntries = [validEntry, withNote];
    const storage = fakeStorage(JSON.stringify(saved));

    const loaded = initializeGameState(storage).player.diaryEntries;
    expect(loaded).toEqual([validEntry, withNote]);
  });

  it('drops malformed entries instead of keeping a broken diary', () => {
    const saved = createDefaultGameState();
    (saved.player as unknown as { diaryEntries: unknown[] }).diaryEntries = [
      validEntry,
      { ...validEntry, id: 42 }, // wrong id type
      { ...validEntry, recordedAt: 'yesterday' }, // wrong recordedAt type
      { critterId: 'squirrel-1' }, // missing required fields entirely
      'not even an object',
    ];
    const storage = fakeStorage(JSON.stringify(saved));

    expect(initializeGameState(storage).player.diaryEntries).toEqual([validEntry]);
  });

  it('caps an oversized diary at DIARY_ENTRY_LIMIT on load', () => {
    const saved = createDefaultGameState();
    saved.player.diaryEntries = Array.from({ length: DIARY_ENTRY_LIMIT + 25 }, (_, index) => ({
      ...validEntry,
      id: `place:0,0:materials:${index}`,
    }));
    const storage = fakeStorage(JSON.stringify(saved));

    expect(initializeGameState(storage).player.diaryEntries).toHaveLength(DIARY_ENTRY_LIMIT);
  });
});
