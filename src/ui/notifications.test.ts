import { describe, expect, it } from 'vitest';
import { createDefaultGameState } from '../sim/state';
import type { MailItem } from '../../shared/src/index';
import {
  DEFAULT_NOTIFY_CATEGORIES,
  EMPTY_SEEN,
  buildCounts,
  collectNotificationSources,
  countNew,
  countUnseenRequests,
  describeNotify,
  getNotificationSeen,
  logsSeenAfter,
  mailSeenAfter,
  markLogsSeen,
  markMailSeen,
  markRequestsSeen,
  newestOf,
  sanitizeNotifyCategories,
  socialNew,
  subscribeNotifications,
  totalNew,
  type NotificationSeen,
  type NotificationSources,
} from './notifications';

function sources(overrides: Partial<NotificationSources> = {}): NotificationSources {
  return {
    messages: 0,
    social: 0,
    mail: [],
    activity: [],
    travel: [],
    conversations: [],
    ...overrides,
  };
}

function seen(overrides: Partial<NotificationSeen> = {}): NotificationSeen {
  return { ...EMPTY_SEEN, ...overrides };
}

describe('notification category defaults', () => {
  it('starts with what other people do, not the player\'s own journal', () => {
    expect([...DEFAULT_NOTIFY_CATEGORIES]).toEqual(['messages', 'mail', 'social']);
  });
});

describe('sanitizeNotifyCategories', () => {
  it('falls back to the defaults for anything that is not an array', () => {
    expect(sanitizeNotifyCategories(undefined)).toEqual([...DEFAULT_NOTIFY_CATEGORIES]);
    expect(sanitizeNotifyCategories('mail')).toEqual([...DEFAULT_NOTIFY_CATEGORIES]);
    expect(sanitizeNotifyCategories({ mail: true })).toEqual([...DEFAULT_NOTIFY_CATEGORIES]);
  });

  it('keeps an honest empty array as everything-off', () => {
    expect(sanitizeNotifyCategories([])).toEqual([]);
  });

  it('drops unknown ids, dedupes, and returns canonical order', () => {
    expect(sanitizeNotifyCategories(['travel', 'mail', 'bogus', 'mail', 'activity']))
      .toEqual(['mail', 'activity', 'travel']);
  });
});

describe('countNew', () => {
  it('counts only log entries newer than the drawer mark', () => {
    const s = sources({ activity: [10, 20, 30], travel: [5], conversations: [40] });
    expect(countNew('activity', s, seen({ logsAt: 20 }))).toBe(1);
    expect(countNew('travel', s, seen({ logsAt: 20 }))).toBe(0);
    expect(countNew('conversations', s, seen({ logsAt: 20 }))).toBe(1);
  });

  it('treats an unseen stream as all new', () => {
    expect(countNew('activity', sources({ activity: [1, 2] }), EMPTY_SEEN)).toBe(2);
  });

  it('counts the newest-threshold exactly at the boundary as seen', () => {
    expect(countNew('travel', sources({ travel: [7] }), seen({ logsAt: 7 }))).toBe(0);
  });

  it('counts only arrived mail newer than the mailbox mark', () => {
    const s = sources({ mail: [100, 200, 300] });
    expect(countNew('mail', s, seen({ mailAt: 200 }))).toBe(1);
  });

  it('passes messages and social through as counts, never negative', () => {
    const s = sources({ messages: 3, social: 2 });
    expect(countNew('messages', s, EMPTY_SEEN)).toBe(3);
    expect(countNew('social', s, EMPTY_SEEN)).toBe(2);
    expect(countNew('messages', sources({ messages: -4 }), EMPTY_SEEN)).toBe(0);
  });
});

describe('buildCounts and totalNew', () => {
  it('zeroes anything the player switched off', () => {
    const s = sources({ messages: 2, mail: [100], activity: [1], travel: [1] });
    const counts = buildCounts(['messages', 'mail'], s, EMPTY_SEEN);
    expect(counts.messages).toBe(2);
    expect(counts.mail).toBe(1);
    expect(counts.activity).toBe(0);
    expect(counts.travel).toBe(0);
    expect(counts.social).toBe(0);
    expect(counts.conversations).toBe(0);
    expect(totalNew(counts)).toBe(3);
  });

  it('is all zeroes when every category is off', () => {
    const s = sources({ messages: 9, social: 9, mail: [1], activity: [1] });
    const counts = buildCounts([], s, EMPTY_SEEN);
    expect(totalNew(counts)).toBe(0);
  });
});

describe('describeNotify', () => {
  it('is a bare word, not a number, when there is nothing new', () => {
    expect(describeNotify(['messages', 'mail', 'social'], buildCounts(['messages'], sources(), EMPTY_SEEN)))
      .toBe('Logs');
  });

  it('is still just "Logs" when everything is switched off', () => {
    const counts = buildCounts([], sources({ messages: 5, mail: [1] }), EMPTY_SEEN);
    expect(describeNotify([], counts)).toBe('Logs');
  });

  it('names what is new, in words, with a total', () => {
    const s = sources({ messages: 2, mail: [100], social: 1 });
    const enabled = ['messages', 'mail', 'social'] as const;
    expect(describeNotify(enabled, buildCounts([...enabled], s, EMPTY_SEEN)))
      .toBe('Logs, 4 new — 2 messages, 1 letter, 1 request');
  });

  it('uses the singular for a lone item', () => {
    const counts = buildCounts(['mail'], sources({ mail: [1] }), EMPTY_SEEN);
    expect(describeNotify(['mail'], counts)).toBe('Logs, 1 new — 1 letter');
  });

  it('never mentions a category the player switched off', () => {
    const s = sources({ messages: 2, activity: [1] });
    const counts = buildCounts(['messages', 'activity'], s, EMPTY_SEEN);
    expect(describeNotify(['messages'], counts)).toBe('Logs, 2 new — 2 messages');
  });
});

describe('seen marks', () => {
  it('marks logs seen up to the newest entry across all three streams', () => {
    const s = sources({ activity: [10], travel: [30], conversations: [20] });
    expect(logsSeenAfter(s)).toBe(30);
    expect(newestOf([])).toBe(0);
    expect(logsSeenAfter(sources())).toBe(0);
  });

  it('marks mail seen up to the newest arrival', () => {
    expect(mailSeenAfter(sources({ mail: [50, 900, 300] }))).toBe(900);
  });
});

describe('social: requests seen, knocks self-clearing', () => {
  const incoming = [{ accountId: 'acct-ana' }, { accountId: 'acct-bo' }];

  it('counts requests not yet on screen', () => {
    expect(countUnseenRequests(incoming, EMPTY_SEEN)).toBe(2);
    expect(countUnseenRequests(incoming, seen({ requests: ['acct-ana'] }))).toBe(1);
    expect(countUnseenRequests(incoming, seen({ requests: ['acct-ana', 'acct-bo'] }))).toBe(0);
  });

  it('adds open knocks, which leave the store when answered or lapsed', () => {
    expect(socialNew(incoming, 1, seen({ requests: ['acct-ana', 'acct-bo'] }))).toBe(1);
    expect(socialNew(incoming, 0, seen({ requests: ['acct-ana'] }))).toBe(1);
    expect(socialNew([], 0, EMPTY_SEEN)).toBe(0);
  });
});

describe('collectNotificationSources', () => {
  function mailItem(partial: Partial<MailItem> & Pick<MailItem, 'id'>): MailItem {
    return {
      fromAccountId: 'world',
      fromName: 'Pip',
      kind: 'gift',
      payload: {},
      at: 0,
      ...partial,
    };
  }

  it('stamps arriving mail with when it lands and ordinary mail with when it was sent', () => {
    const state = createDefaultGameState();
    state.player.mailbox = [
      mailItem({ id: 'letter', at: 1_000 }),
      mailItem({ id: 'parcel', at: 500, payload: { arrivesAt: 9_000 } }),
      mailItem({ id: 'in-the-post', at: 10, payload: { arrivesAt: 99_000 } }),
    ];
    const collected = collectNotificationSources(state, { messages: 0, social: 0, now: 50_000 });
    expect([...collected.mail].sort((a, b) => a - b)).toEqual([1_000, 9_000]);
  });

  it('reads log timestamps and carries the externally-owned counts through', () => {
    const state = createDefaultGameState();
    state.player.activityLog = [
      { id: 'harvest:1', kind: 'harvest', message: 'Harvested berries.', at: 100 },
    ];
    state.player.travelLog = [{ id: 'travel:1,0', pageId: '1,0', biome: 'meadow', at: 300 }];
    state.player.diaryEntries = [{
      id: 'story:1', critterId: '0,0#raccoon', speakerName: 'Bandit', pageId: '0,0',
      kind: 'wayfinding', text: 'The mill is west of here.', recordedAt: 200,
    }];
    const collected = collectNotificationSources(state, { messages: 4, social: 2, now: 0 });
    expect(collected.activity).toEqual([100]);
    expect(collected.travel).toEqual([300]);
    expect(collected.conversations).toEqual([200]);
    expect(collected.messages).toBe(4);
    expect(collected.social).toBe(2);
  });
});

// No localStorage in this environment: the store must degrade to in-memory
// marks rather than throw, and a mark must only ever move forward.
describe('seen store', () => {
  it('moves a log mark forward only, ignoring an older one', () => {
    markLogsSeen(500);
    expect(getNotificationSeen().logsAt).toBe(500);
    markLogsSeen(100);
    expect(getNotificationSeen().logsAt).toBe(500);
  });

  it('keeps friend-request marks in sync with what is on screen, deduped', () => {
    markRequestsSeen(['acct-ana', 'acct-bo', 'acct-ana']);
    expect(getNotificationSeen().requests).toEqual(['acct-ana', 'acct-bo']);
  });

  it('announces a change to subscribers, once, and stops when unsubscribed', () => {
    let calls = 0;
    const off = subscribeNotifications(() => { calls += 1; });
    markMailSeen(1);
    expect(calls).toBe(1);
    markMailSeen(1); // unchanged: no second event
    expect(calls).toBe(1);
    off();
    markMailSeen(2);
    expect(calls).toBe(1);
  });
});
