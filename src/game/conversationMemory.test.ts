import { afterEach, describe, expect, it } from 'vitest';
import { createDefaultGameState, setGameStateForTests } from '../sim/state';
import {
  CONTINUATION_MIN_GAP_MS,
  getConversationMemory,
  isRecentLine,
  noteRecentLine,
  recordJournalEntry,
  takeContinuableThread,
} from './conversationMemory';

afterEach(() => setGameStateForTests(null));

const NOW = 1_700_000_000_000;

describe('critter journal (interaction-aware continuation)', () => {
  it('does not offer a thread from the same sitting', () => {
    setGameStateForTests(createDefaultGameState());
    recordJournalEntry({
      id: 'today', critterId: 'c1', kind: 'materials', text: 'Look for twigs.', pageId: '0,0', at: NOW - 1000,
    });
    expect(takeContinuableThread('c1', NOW)).toBeNull();
  });

  it('offers a thread from a previous visit, exactly once', () => {
    setGameStateForTests(createDefaultGameState());
    recordJournalEntry({
      id: 'yesterday', critterId: 'c1', kind: 'materials', text: 'Look for twigs.', pageId: '0,0',
      at: NOW - CONTINUATION_MIN_GAP_MS - 1000,
    });

    const first = takeContinuableThread('c1', NOW);
    expect(first?.kind).toBe('materials');
    expect(first?.text).toBe('Look for twigs.');
    // Continued once, never again.
    expect(takeContinuableThread('c1', NOW)).toBeNull();
  });

  it('picks the newest continuable thread first', () => {
    setGameStateForTests(createDefaultGameState());
    const old = NOW - CONTINUATION_MIN_GAP_MS - 60_000;
    recordJournalEntry({ id: 'older', critterId: 'c1', kind: 'fun', text: 'Older.', pageId: '0,0', at: old });
    recordJournalEntry({ id: 'newer', critterId: 'c1', kind: 'harvest', text: 'Newer.', pageId: '0,0', at: old + 30_000 });
    expect(takeContinuableThread('c1', NOW)?.kind).toBe('harvest');
  });

  it('keeps journals per critter', () => {
    setGameStateForTests(createDefaultGameState());
    recordJournalEntry({
      id: 'a', critterId: 'c1', kind: 'materials', text: 'A.', pageId: '0,0',
      at: NOW - CONTINUATION_MIN_GAP_MS - 1,
    });
    expect(getConversationMemory('c2').journal ?? []).toHaveLength(0);
    expect(takeContinuableThread('c1', NOW)?.text).toBe('A.');
  });
});

describe('recent-line memory (repeat advice)', () => {
  it('remembers a line was said and caps the list', () => {
    setGameStateForTests(createDefaultGameState());
    expect(isRecentLine('c1', 'tool:abc')).toBe(false);
    noteRecentLine('c1', 'tool:abc');
    expect(isRecentLine('c1', 'tool:abc')).toBe(true);

    for (let index = 0; index < 60; index += 1) noteRecentLine('c1', `tool:${index}`);
    const recent = getConversationMemory('c1').recentLines ?? [];
    expect(recent.length).toBeLessThanOrEqual(24);
    // Newest first, so a line said most recently is still suppressed.
    expect(recent[0]).toBe('tool:59');
  });

  it('does not double-store the same line', () => {
    setGameStateForTests(createDefaultGameState());
    noteRecentLine('c1', 'self:x');
    noteRecentLine('c1', 'self:x');
    expect((getConversationMemory('c1').recentLines ?? []).filter((id) => id === 'self:x')).toHaveLength(1);
  });
});
