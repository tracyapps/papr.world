import { describe, expect, it } from 'vitest';
import { pickConversationLine } from './conversationEngine';

describe('conversation line selection', () => {
  const lines = ['one', 'two', 'three', 'four'];

  it('cycles by default', () => {
    expect(pickConversationLine(lines, 0)).toBe('one');
    expect(pickConversationLine(lines, 4)).toBe('one');
  });

  it('makes random-mode picks reproducible for the same interaction', () => {
    const first = pickConversationLine(lines, 7, 'random', 'critter:scene:pet');
    const repeated = pickConversationLine(lines, 7, 'random', 'critter:scene:pet');

    expect(lines).toContain(first);
    expect(repeated).toBe(first);
  });

  it('uses the response count when randomizing repeat interactions', () => {
    const picks = Array.from({ length: 8 }, (_, index) => (
      pickConversationLine(lines, index, 'random', 'critter:scene:pet')
    ));

    expect(new Set(picks).size).toBeGreaterThan(1);
  });
});
