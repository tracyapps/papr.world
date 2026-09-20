import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntryResult } from '../../shared/src/index';
import {
  announceLeftHome,
  announceOwnHome,
  answerKnock,
  describeEntryResult,
  describeFriendNotice,
  friendStateOf,
  getEntryPhase,
  getKnocks,
  getServerInside,
  invitationTo,
  presenceHeld,
  pruneKnocks,
  receiveEntryResult,
  receiveFriends,
  receiveHomeExit,
  receiveKnock,
  receiveKnockCleared,
  requestEntry,
  resetGuests,
  setGuestHandlers,
  setGuestTransport,
  setSelfAccount,
  setHomePolicy,
  receiveHomePolicy,
  type GuestTransport,
} from './guests';

function fakeTransport() {
  return {
    requestFriend: vi.fn(),
    answerFriend: vi.fn(),
    removeFriend: vi.fn(),
    setHomePolicy: vi.fn(),
    enterHome: vi.fn(),
    leaveHome: vi.fn(),
    answerKnock: vi.fn(),
    askToLeave: vi.fn(),
  } satisfies GuestTransport;
}

const said: string[] = [];
const admitted: string[] = [];
const evicted: string[] = [];
let transport = fakeTransport();

const result = (outcome: EntryResult['outcome'], host = 'acct-ada'): EntryResult => ({ host, hostName: 'Ada', outcome });

beforeEach(() => {
  said.length = 0;
  admitted.length = 0;
  evicted.length = 0;
  transport = fakeTransport();
  setSelfAccount('acct-sam');
  setGuestHandlers({
    admitted: (host) => admitted.push(host),
    evicted: (host) => evicted.push(host),
    say: (text) => said.push(text),
  });
  setGuestTransport(transport);
});

afterEach(() => {
  setGuestTransport(null);
  setGuestHandlers(null);
  resetGuests();
});

describe('coming in', () => {
  it('does nothing without a live session', () => {
    setGuestTransport(null);
    expect(requestEntry('acct-ada', 'Ada')).toBe(false);
  });

  it('walks straight in when the room says admitted', () => {
    requestEntry('acct-ada', 'Ada');
    expect(transport.enterHome).toHaveBeenCalledWith('acct-ada');
    receiveEntryResult(result('admitted'));
    expect(admitted).toEqual(['acct-ada']);
    expect(getServerInside()).toBe('acct-ada');
    expect(getEntryPhase()).toBe('idle');
  });

  it('a knock waits, and the owner letting you in is an invitation, not a jolt', () => {
    requestEntry('acct-ada', 'Ada');
    receiveEntryResult(result('knocked'));
    expect(getEntryPhase()).toBe('knocking');
    expect(said.at(-1)).toContain('knocked');

    // Ada says yes while you are off doing something else.
    receiveEntryResult(result('admitted'), 1000);
    expect(admitted).toEqual([]);
    expect(getServerInside()).toBe('');
    expect(invitationTo('acct-ada', 1000)).not.toBeNull();
    expect(said.at(-1)).toContain('let you in');

    // Taking it up: ask again, the room places you.
    requestEntry('acct-ada', 'Ada');
    receiveEntryResult(result('admitted'), 2000);
    expect(admitted).toEqual(['acct-ada']);
    expect(getServerInside()).toBe('acct-ada');
  });

  it('an invitation runs out', () => {
    requestEntry('acct-ada', 'Ada');
    receiveEntryResult(result('knocked'));
    receiveEntryResult(result('admitted'), 1000);
    expect(invitationTo('acct-ada', 1000 + 200_000)).toBeNull();
  });

  it.each([
    ['declined', 'cannot come to the door'],
    ['closed', 'The door is closed'],
    ['busy', 'knocked a moment ago'],
    ['no-answer', 'not home'],
  ] as const)('%s is said in words and lets you carry on', (outcome, words) => {
    requestEntry('acct-ada', 'Ada');
    receiveEntryResult(result(outcome));
    expect(said.at(-1)).toContain(words);
    expect(getEntryPhase()).toBe('idle');
    expect(admitted).toEqual([]);
  });

  it('a blocked visitor hears exactly what a closed door says', () => {
    expect(describeEntryResult(result('closed'))).toBe('The door is closed.');
  });

  it('ignores an answer about somebody else\'s door while you are asking at another', () => {
    requestEntry('acct-ada', 'Ada');
    receiveEntryResult(result('closed', 'acct-bo'));
    expect(getEntryPhase()).toBe('asking');
  });

  it('a late echo of a door you already went through is not news', () => {
    requestEntry('acct-ada', 'Ada');
    receiveEntryResult(result('admitted'));
    receiveEntryResult(result('admitted'));
    expect(said).toEqual([]);
    expect(invitationTo('acct-ada')).toBeNull();
  });
});

describe('your own door', () => {
  it('holds your position until the room answers, then confirms you are inside', () => {
    expect(announceOwnHome()).toBe(true);
    expect(transport.enterHome).toHaveBeenCalledWith('acct-sam');
    expect(presenceHeld()).toBe(true);
    receiveEntryResult(result('admitted', 'acct-sam'));
    expect(presenceHeld()).toBe(false);
    expect(getServerInside()).toBe('acct-sam');
    expect(admitted).toEqual([]);
  });

  it('a refusal changes nothing you can hear', () => {
    announceOwnHome();
    receiveEntryResult(result('closed', 'acct-sam'));
    expect(presenceHeld()).toBe(false);
    expect(getServerInside()).toBe('');
    expect(said).toEqual([]);
  });

  it('a guest has no home to announce', () => {
    setSelfAccount('guest:abc');
    expect(announceOwnHome()).toBe(false);
    expect(transport.enterHome).not.toHaveBeenCalled();
  });

  it('leaving tells the room only when the room thinks you are inside', () => {
    announceLeftHome();
    expect(transport.leaveHome).not.toHaveBeenCalled();
    announceOwnHome();
    receiveEntryResult(result('admitted', 'acct-sam'));
    announceLeftHome();
    expect(transport.leaveHome).toHaveBeenCalledTimes(1);
    expect(getServerInside()).toBe('');
  });
});

describe('being asked to leave', () => {
  it('clears where you are and hands the move to the screen', () => {
    requestEntry('acct-ada', 'Ada');
    receiveEntryResult(result('admitted'));
    receiveHomeExit({ host: 'acct-ada', reason: 'asked-to-leave' });
    expect(getServerInside()).toBe('');
    expect(evicted).toEqual(['acct-ada']);
  });
});

describe('knocks at your door', () => {
  const knock = { visitor: 'acct-bo', name: 'Bo', at: 1000, expiresAt: 1000 + 300_000 };

  it('lists a knock, announces it, and takes it down when answered', () => {
    receiveKnock(knock, 5000);
    expect(getKnocks()).toHaveLength(1);
    expect(said.at(-1)).toContain('Bo is at your door');
    answerKnock('acct-bo', true);
    expect(transport.answerKnock).toHaveBeenCalledWith('acct-bo', true);
    expect(getKnocks()).toHaveLength(0);
  });

  it('a second knock from the same person replaces the first', () => {
    receiveKnock(knock, 5000);
    receiveKnock({ ...knock, at: 2000, expiresAt: 302_000 }, 6000);
    expect(getKnocks()).toHaveLength(1);
  });

  it('lapses quietly on the local clock, whatever the server clock says', () => {
    receiveKnock({ ...knock, at: 9_000_000_000, expiresAt: 9_000_300_000 }, 5000);
    pruneKnocks(5000 + 299_000);
    expect(getKnocks()).toHaveLength(1);
    said.length = 0;
    pruneKnocks(5000 + 301_000);
    expect(getKnocks()).toHaveLength(0);
    expect(said).toEqual([]);
  });

  it('comes down when the server says it no longer needs an answer', () => {
    receiveKnock(knock, 5000);
    receiveKnockCleared({ visitor: 'acct-bo' });
    expect(getKnocks()).toHaveLength(0);
  });
});

describe('friends and settings', () => {
  it('says where you stand with someone', () => {
    receiveFriends({
      friends: [{ accountId: 'a', name: 'A', online: true }],
      incoming: [{ accountId: 'b', name: 'B', at: 1 }],
      outgoing: [{ accountId: 'c', name: 'C', at: 1 }],
    });
    expect(friendStateOf('a')).toBe('friends');
    expect(friendStateOf('b')).toBe('incoming');
    expect(friendStateOf('c')).toBe('outgoing');
    expect(friendStateOf('d')).toBe('none');
  });

  it('every friend notice is a sentence', () => {
    for (const kind of ['requested', 'incoming', 'accepted', 'already-friends', 'already-requested', 'removed', 'full'] as const) {
      expect(describeFriendNotice({ kind, accountId: 'x', name: 'Ada' }).length).toBeGreaterThan(10);
    }
  });

  it('sends the whole policy with one setting changed', () => {
    receiveHomePolicy({ friends: 'walk', others: 'knock', open: false });
    setHomePolicy({ open: true });
    expect(transport.setHomePolicy).toHaveBeenCalledWith({ friends: 'walk', others: 'knock', open: true });
  });
});
