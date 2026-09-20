// The door: who gets in, who knocks, and who is simply not told anything.

import { describe, expect, it } from 'vitest';
import { DEFAULT_HOME_POLICY, LIMITS, type HomePolicy } from '../../shared/src/index';
import { KnockBook, decideAccess, type AccessInput } from './homeAccess';

const base = (over: Partial<AccessInput> = {}, policy: Partial<HomePolicy> = {}): AccessInput => ({
  host: 'sam',
  visitor: 'ada',
  hostHasHome: true,
  policy: { ...DEFAULT_HOME_POLICY, ...policy },
  isFriend: false,
  blockedEitherWay: false,
  banned: false,
  hasPermit: false,
  ...over,
});

describe('decideAccess', () => {
  it('defaults: a friend walks in, a stranger knocks', () => {
    expect(decideAccess(base({ isFriend: true }))).toBe('admit');
    expect(decideAccess(base())).toBe('knock');
  });

  it('honours each setting for each kind of visitor', () => {
    expect(decideAccess(base({ isFriend: true }, { friends: 'knock' }))).toBe('knock');
    expect(decideAccess(base({ isFriend: true }, { friends: 'closed' }))).toBe('closed');
    expect(decideAccess(base({}, { others: 'closed' }))).toBe('closed');
    // Closing to strangers does not close to friends.
    expect(decideAccess(base({ isFriend: true }, { others: 'closed' }))).toBe('admit');
  });

  it('lets everybody in during an open house', () => {
    expect(decideAccess(base({}, { open: true, others: 'closed', friends: 'closed' }))).toBe('admit');
  });

  it('lets the owner into their own home, but only if it exists', () => {
    expect(decideAccess(base({ visitor: 'sam' }, { friends: 'closed', others: 'closed' }))).toBe('admit');
    expect(decideAccess(base({ visitor: 'sam', hostHasHome: false }))).toBe('closed');
  });

  it('lets a permit through a closed door, once it has been granted', () => {
    expect(decideAccess(base({ hasPermit: true }, { others: 'knock' }))).toBe('admit');
  });

  it('is closed when there is no home to go into', () => {
    expect(decideAccess(base({ hostHasHome: false }, { open: true }))).toBe('closed');
  });

  it('lets a block beat everything: an open house, a friend, a permit', () => {
    const blocked = { blockedEitherWay: true };
    expect(decideAccess(base({ ...blocked }, { open: true }))).toBe('closed');
    expect(decideAccess(base({ ...blocked, isFriend: true }))).toBe('closed');
    expect(decideAccess(base({ ...blocked, hasPermit: true }))).toBe('closed');
  });

  it('lets a ban beat everything too', () => {
    expect(decideAccess(base({ banned: true, hasPermit: true }, { open: true }))).toBe('closed');
  });

  it('gives a blocked visitor exactly the answer a closed door gives', () => {
    expect(decideAccess(base({ blockedEitherWay: true }))).toBe(decideAccess(base({}, { others: 'closed' })));
  });
});

describe('KnockBook', () => {
  const setup = () => {
    let clock = 10_000;
    const book = new KnockBook(() => clock);
    return { book, advance: (ms: number) => { clock += ms; }, now: () => clock };
  };

  it('holds a knock until it is answered, and does not double it', () => {
    const { book } = setup();
    expect(book.knock('sam', 'ada', 'Ada')).toBe('new');
    expect(book.knock('sam', 'ada', 'Ada')).toBe('pending');
    expect(book.waiting('sam').map((knock) => knock.visitor)).toEqual(['ada']);
    expect(book.waiting('bea')).toEqual([]);
  });

  it('lets in with a permit that opens the door once', () => {
    const { book } = setup();
    book.knock('sam', 'ada', 'Ada');
    expect(book.answer('sam', 'ada', true)?.visitorName).toBe('Ada');
    expect(book.hasPermit('sam', 'ada')).toBe(true);
    book.consumePermit('sam', 'ada');
    expect(book.hasPermit('sam', 'ada')).toBe(false);
    expect(book.waiting('sam')).toEqual([]);
  });

  it('says "not right now" without granting anything', () => {
    const { book } = setup();
    book.knock('sam', 'ada', 'Ada');
    book.answer('sam', 'ada', false);
    expect(book.hasPermit('sam', 'ada')).toBe(false);
  });

  it('answers only a knock that exists, and only once', () => {
    const { book } = setup();
    expect(book.answer('sam', 'ada', true)).toBeNull();
    book.knock('sam', 'ada', 'Ada');
    expect(book.answer('sam', 'ada', true)).not.toBeNull();
    expect(book.answer('sam', 'ada', true)).toBeNull();
  });

  it('is not a buzzer: one knock per door per window', () => {
    const { book, advance } = setup();
    book.knock('sam', 'ada', 'Ada');
    book.answer('sam', 'ada', false);
    expect(book.knock('sam', 'ada', 'Ada')).toBe('cooldown');
    // A different door is unaffected.
    expect(book.knock('bea', 'ada', 'Ada')).toBe('new');
    advance(LIMITS.knockCooldownMs + 1);
    expect(book.knock('sam', 'ada', 'Ada')).toBe('new');
  });

  it('lets a knock lapse quietly and reports it so the notice can be cleared', () => {
    const { book, advance } = setup();
    book.knock('sam', 'ada', 'Ada');
    advance(LIMITS.knockTtlMs + 1);
    expect(book.waiting('sam')).toEqual([]);
    const lapsed = book.expire();
    expect(lapsed.map((knock) => knock.visitor)).toEqual(['ada']);
    expect(book.answer('sam', 'ada', true)).toBeNull();
  });

  it('lets a permit lapse if nobody steps through', () => {
    const { book, advance } = setup();
    book.knock('sam', 'ada', 'Ada');
    book.answer('sam', 'ada', true);
    advance(LIMITS.entryPermitTtlMs + 1);
    expect(book.hasPermit('sam', 'ada')).toBe(false);
  });

  it('revokes a permit and a pending knock when a block lands', () => {
    const { book } = setup();
    book.knock('sam', 'ada', 'Ada');
    book.answer('sam', 'ada', true);
    book.knock('sam', 'bea', 'Bea');
    expect(book.revoke('sam', 'ada')).toBeNull();
    expect(book.hasPermit('sam', 'ada')).toBe(false);
    expect(book.revoke('sam', 'bea')?.visitor).toBe('bea');
    expect(book.waiting('sam')).toEqual([]);
  });

  it('withdraws every knock from a visitor who left', () => {
    const { book } = setup();
    book.knock('sam', 'ada', 'Ada');
    book.knock('bea', 'ada', 'Ada');
    expect(book.withdraw('ada')).toHaveLength(2);
    expect(book.waiting('sam')).toEqual([]);
  });

  it('writes one absence note per visitor per door in a long window', () => {
    const { book, advance } = setup();
    expect(book.noteDue('sam', 'ada')).toBe(true);
    expect(book.noteDue('sam', 'ada')).toBe(false);
    expect(book.noteDue('sam', 'bea')).toBe(true);
    advance(LIMITS.knockNoteIntervalMs + 1);
    expect(book.noteDue('sam', 'ada')).toBe(true);
  });
});
