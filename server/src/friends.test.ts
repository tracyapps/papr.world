// Friendship is mutual or it is nothing, and a block ends it silently.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIMITS } from '../../shared/src/index';
import { BlockStore } from './blocks';
import { FriendStore } from './friends';

let dir = '';
let clock = 1_000_000;
let blocks: BlockStore;
const fresh = () => new FriendStore(dir, (listener, speaker) => blocks.isBlocked(listener, speaker), () => clock);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pp-friends-'));
  clock = 1_000_000;
  blocks = new BlockStore(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('FriendStore requests', () => {
  it('needs a yes: a request is not a friendship', () => {
    const friends = fresh();
    expect(friends.request('anna', 'Anna', 'boris', 'Boris')).toBe('sent');
    expect(friends.areFriends('anna', 'boris')).toBe(false);
    expect(friends.incoming('boris')).toEqual([{ accountId: 'anna', name: 'Anna', at: clock }]);
    expect(friends.outgoing('anna')).toEqual([{ accountId: 'boris', name: 'Boris', at: clock }]);

    expect(friends.answer('boris', 'anna', true)).toBe('accepted');
    expect(friends.areFriends('anna', 'boris')).toBe(true);
    expect(friends.areFriends('boris', 'anna')).toBe(true);
    expect(friends.incoming('boris')).toEqual([]);
    expect(friends.list('anna')[0]).toMatchObject({ accountId: 'boris', name: 'Boris' });
    expect(friends.list('boris')[0]).toMatchObject({ accountId: 'anna', name: 'Anna' });
  });

  it('treats both people asking as a yes', () => {
    const friends = fresh();
    friends.request('anna', 'Anna', 'boris', 'Boris');
    expect(friends.request('boris', 'Boris', 'anna', 'Anna')).toBe('accepted');
    expect(friends.areFriends('anna', 'boris')).toBe(true);
    expect(friends.incoming('anna')).toEqual([]);
    expect(friends.outgoing('anna')).toEqual([]);
  });

  it('says no quietly: the asker cannot tell a decline from a request that lapsed', () => {
    const friends = fresh();
    friends.request('anna', 'Anna', 'boris', 'Boris');
    expect(friends.answer('boris', 'anna', false)).toBe('declined');
    expect(friends.areFriends('anna', 'boris')).toBe(false);
    expect(friends.incoming('boris')).toEqual([]);
    // The asker's own list keeps the request, so "it vanished" is not a way to
    // read "they said no" — the same reason a block leaves a tombstone.
    expect(friends.outgoing('anna')).toEqual([{ accountId: 'boris', name: 'Boris', at: clock }]);
  });

  it('does not double up a request or befriend a friend', () => {
    const friends = fresh();
    friends.request('anna', 'Anna', 'boris', 'Boris');
    expect(friends.request('anna', 'Anna', 'boris', 'Boris')).toBe('already-sent');
    friends.answer('boris', 'anna', true);
    expect(friends.request('anna', 'Anna', 'boris', 'Boris')).toBe('already-friends');
  });

  it('refuses guests and yourself', () => {
    const friends = fresh();
    expect(friends.request('guest:abc', 'Guest', 'boris', 'Boris')).toBe('invalid');
    expect(friends.request('anna', 'Anna', 'guest:abc', 'Guest')).toBe('invalid');
    expect(friends.request('anna', 'Anna', 'anna', 'Anna')).toBe('invalid');
  });

  it('answers only a request that exists', () => {
    const friends = fresh();
    expect(friends.answer('boris', 'anna', true)).toBe('none');
    friends.request('anna', 'Anna', 'boris', 'Boris');
    // A third party cannot answer it.
    expect(friends.answer('clara', 'anna', true)).toBe('none');
  });

  it('lets an unanswered request lapse', () => {
    const friends = fresh();
    friends.request('anna', 'Anna', 'boris', 'Boris');
    clock += LIMITS.friendRequestTtlMs + 1;
    expect(friends.incoming('boris')).toEqual([]);
    expect(friends.answer('boris', 'anna', true)).toBe('none');
  });
});

describe('FriendStore blocks and removal', () => {
  it('looks like success to somebody who has been blocked — even in their own list', () => {
    const friends = fresh();
    blocks.add('boris', 'anna');
    expect(friends.request('anna', 'Anna', 'boris', 'Boris')).toBe('silently-dropped');
    // Nothing reaches the person who blocked you...
    expect(friends.incoming('boris')).toEqual([]);
    // ...and the asker's own list reads exactly like a real send, so it cannot
    // be used to test who has blocked whom.
    expect(friends.outgoing('anna')).toEqual([{ accountId: 'boris', name: 'Boris', at: clock }]);
    expect(friends.request('anna', 'Anna', 'boris', 'Boris')).toBe('already-sent');
  });

  it('leaves a blocked asker’s list shaped exactly like an honest one', () => {
    const honest = fresh();
    honest.request('anna', 'Anna', 'boris', 'Boris');
    const honestOutgoing = honest.outgoing('anna');

    const blocked = fresh();
    blocks.add('dana', 'clara');
    expect(blocked.request('clara', 'Clara', 'dana', 'Dana')).toBe('silently-dropped');
    expect(blocked.outgoing('clara')).toEqual(
      honestOutgoing.map((entry) => ({ ...entry, accountId: 'dana', name: 'Dana' })),
    );
  });

  it('tells you plainly when it is you who blocked them', () => {
    const friends = fresh();
    blocks.add('anna', 'boris');
    expect(friends.request('anna', 'Anna', 'boris', 'Boris')).toBe('you-blocked');
  });

  it('ends a friendship and any pending request when purged', () => {
    const friends = fresh();
    friends.request('anna', 'Anna', 'boris', 'Boris');
    friends.answer('boris', 'anna', true);
    friends.request('anna', 'Anna', 'clara', 'Clara');
    friends.purge('anna', 'boris');
    friends.purge('clara', 'anna');
    expect(friends.areFriends('anna', 'boris')).toBe(false);
    expect(friends.areFriends('boris', 'anna')).toBe(false);
    expect(friends.incoming('clara')).toEqual([]);
  });

  it('unfriends both ways, or withdraws your own request', () => {
    const friends = fresh();
    friends.request('anna', 'Anna', 'boris', 'Boris');
    expect(friends.remove('anna', 'boris')).toBe('withdrawn');
    expect(friends.incoming('boris')).toEqual([]);
    friends.request('anna', 'Anna', 'boris', 'Boris');
    friends.answer('boris', 'anna', true);
    expect(friends.remove('boris', 'anna')).toBe('unfriended');
    expect(friends.areFriends('anna', 'boris')).toBe(false);
    expect(friends.remove('boris', 'anna')).toBe('none');
  });
});

describe('FriendStore limits and durability', () => {
  it('survives a restart, requests and all', () => {
    const friends = fresh();
    friends.request('anna', 'Anna', 'boris', 'Boris');
    friends.answer('boris', 'anna', true);
    friends.request('clara', 'Clara', 'anna', 'Anna');
    const again = fresh();
    expect(again.areFriends('anna', 'boris')).toBe(true);
    expect(again.incoming('anna').map((request) => request.accountId)).toEqual(['clara']);
  });

  it('stops at the friend limit and the pending limit', () => {
    const friends = fresh();
    for (let index = 0; index < LIMITS.friendRequestsMax; index += 1) {
      expect(friends.request('anna', 'Anna', `other-${index}`, 'Other')).toBe('sent');
    }
    expect(friends.request('anna', 'Anna', 'one-more', 'Other')).toBe('full');
  });

  it('keeps a friend\'s name on the list current', () => {
    const friends = fresh();
    friends.request('anna', 'Anna', 'boris', 'Boris');
    friends.answer('boris', 'anna', true);
    friends.rename('boris', 'Boris the Bold');
    expect(friends.list('anna')[0].name).toBe('Boris the Bold');
  });
});

describe('FriendStore request notes', () => {
  it('carries an optional note to the recipient, and back to the asker', () => {
    const friends = fresh();
    expect(friends.request('anna', 'Anna', 'boris', 'Boris', 'we met at the pond')).toBe('sent');
    expect(friends.incoming('boris')).toEqual([
      { accountId: 'anna', name: 'Anna', at: clock, message: 'we met at the pond' },
    ]);
    expect(friends.outgoing('anna')).toEqual([
      { accountId: 'boris', name: 'Boris', at: clock, message: 'we met at the pond' },
    ]);
  });

  it('omits the field entirely when there is no note', () => {
    const friends = fresh();
    friends.request('anna', 'Anna', 'boris', 'Boris');
    expect(friends.incoming('boris')).toEqual([{ accountId: 'anna', name: 'Anna', at: clock }]);
    expect(friends.incoming('boris')[0]).not.toHaveProperty('message');
  });

  it('sanitizes the note: control characters out, trimmed, clamped, empty dropped', () => {
    const friends = fresh();
    friends.request('anna', 'Anna', 'boris', 'Boris', `  hi\u0001\u0007 there  `);
    expect(friends.incoming('boris').find((request) => request.accountId === 'anna')?.message)
      .toBe('hi there');

    friends.request('clara', 'Clara', 'boris', 'Boris', 'x'.repeat(LIMITS.friendRequestMessageMax + 20));
    expect(friends.incoming('boris').find((request) => request.accountId === 'clara')?.message)
      .toHaveLength(LIMITS.friendRequestMessageMax);

    friends.request('dana', 'Dana', 'boris', 'Boris', '   ');
    const dana = friends.incoming('boris').find((request) => request.accountId === 'dana');
    expect(dana).toEqual({ accountId: 'dana', name: 'Dana', at: clock });
  });

  it('survives a restart, note and all', () => {
    fresh().request('anna', 'Anna', 'boris', 'Boris', 'remember me');
    expect(fresh().incoming('boris')[0].message).toBe('remember me');
  });

  it('keeps the asker’s own copy on a decline, note and all, and nothing for the recipient', () => {
    const friends = fresh();
    friends.request('anna', 'Anna', 'boris', 'Boris', 'a note');
    expect(friends.answer('boris', 'anna', false)).toBe('declined');
    expect(friends.incoming('boris')).toEqual([]);
    expect(friends.outgoing('anna')).toEqual([
      { accountId: 'boris', name: 'Boris', at: clock, message: 'a note' },
    ]);
  });

  it('is not a reason to reveal anything to somebody who blocked you', () => {
    const friends = fresh();
    blocks.add('boris', 'anna');
    expect(friends.request('anna', 'Anna', 'boris', 'Boris', 'a note')).toBe('silently-dropped');
    expect(friends.incoming('boris')).toEqual([]);
    // The asker's own list still reads like a normal send, note included.
    expect(friends.outgoing('anna')).toEqual([
      { accountId: 'boris', name: 'Boris', at: clock, message: 'a note' },
    ]);
  });
});
