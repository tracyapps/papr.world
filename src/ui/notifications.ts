// The notification badge behind the Logs button.
//
// The badge used to count everything ever recorded (`activityLog.length +
// travelLog.length + diaryEntries.length`), so an hour into a session it read
// "99+" and meant nothing — a badge that cannot be cleared tells the player
// nothing. This module is the model that replaces it: what counts as *new*,
// which kinds of news the player asked to hear about, and what has already
// been looked at. The badge counts items since the player last looked, and
// only in the categories they switched on.
//
// Everything here is plain data in, plain numbers out. No DOM, no game-state
// mutation, so the counting rules are unit-tested directly. The wiring — which
// DOM element means "the chat is unread", when the mailbox tab was opened —
// lives in activityLog.ts.
//
// Seen-timestamps are a *local* preference, kept beside the other settings in
// localStorage, deliberately not part of the game save: an old save must keep
// loading, and where the player last looked is a property of this browser, not
// of the world.

import type { GameState } from '../sim/state';
import { mailArrivesAt, mailHasArrived } from '../sim/mail';

export type NotifyCategory =
  | 'messages'
  | 'mail'
  | 'social'
  | 'activity'
  | 'travel'
  | 'conversations';

export type NotifyCategoryDef = {
  id: NotifyCategory;
  /** The checkbox label in Settings, and the word the badge speaks. */
  label: string;
  /** One plain line under the label, saying what the switch actually covers. */
  blurb: string;
  /** Words for one item, singular and plural, used in the accessible name. */
  noun: readonly [singular: string, plural: string];
};

/**
 * The six kinds of news, in the order they are shown and spoken. Order is
 * canonical so the Settings list and the badge's summary never disagree.
 */
export const NOTIFY_CATEGORIES: readonly NotifyCategoryDef[] = [
  {
    id: 'messages',
    label: 'Messages from neighbors',
    blurb: 'Chat lines that arrived while the chat was folded away',
    noun: ['message', 'messages'],
  },
  {
    id: 'mail',
    label: 'Letters and parcels',
    blurb: 'Mail waiting unread in your scrapbook mailbox',
    noun: ['letter', 'letters'],
  },
  {
    id: 'social',
    label: 'People waiting on you',
    blurb: 'Friend requests to answer, and neighbors knocking at your door',
    noun: ['request', 'requests'],
  },
  {
    id: 'activity',
    label: 'Your own activity',
    blurb: 'Your garden, harvest, gathering, crafting, and building notes',
    noun: ['activity', 'activities'],
  },
  {
    id: 'travel',
    label: 'Places you discover',
    blurb: 'New parts of the map your travels uncover',
    noun: ['discovery', 'discoveries'],
  },
  {
    id: 'conversations',
    label: 'Critter conversations',
    blurb: 'Things you remember a critter saying',
    noun: ['conversation', 'conversations'],
  },
];

export const NOTIFY_CATEGORY_IDS: readonly NotifyCategory[] =
  NOTIFY_CATEGORIES.map((category) => category.id);

/**
 * What a fresh install hears about, per the owner's ask: things *other people*
 * do — a neighbor's message, a letter arriving, someone at the door — never
 * your own journal. Your own activity, discoveries, and remembered
 * conversations are quiet until you ask for them.
 */
export const DEFAULT_NOTIFY_CATEGORIES: readonly NotifyCategory[] = [
  'messages',
  'mail',
  'social',
];

/**
 * Coerce a stored setting into a real category list: drop anything that is not
 * a known id, dedupe, and return canonical order. A non-array (a missing key in
 * an older save, or a hand-edited value) falls back to the defaults; an honest
 * empty array means "everything off" and is kept as such.
 */
export function sanitizeNotifyCategories(value: unknown): NotifyCategory[] {
  if (!Array.isArray(value)) return [...DEFAULT_NOTIFY_CATEGORIES];
  const chosen = new Set<NotifyCategory>();
  for (const entry of value) {
    if (typeof entry === 'string' && (NOTIFY_CATEGORY_IDS as readonly string[]).includes(entry)) {
      chosen.add(entry as NotifyCategory);
    }
  }
  return NOTIFY_CATEGORY_IDS.filter((id) => chosen.has(id));
}

/**
 * What the game has to offer right now, per source, as plain numbers and
 * timestamps. `messages`/`social` are already-reduced counts (the chat panel
 * and the guests store own those); the three log streams and mail are handed
 * over as timestamps so the same value can both be counted and marked seen.
 */
export type NotificationSources = {
  messages: number;
  social: number;
  /** Arrival timestamps of mail that has actually landed (not still in the post). */
  mail: readonly number[];
  activity: readonly number[];
  travel: readonly number[];
  conversations: readonly number[];
};

/**
 * What the player has already looked at. `logsAt` is shared by all three log
 * streams because one drawer shows all three at once; `mailAt` is the newest
 * arrival the mailbox tab has shown; `requests` are the friend requests that
 * have been on screen.
 */
export type NotificationSeen = {
  logsAt: number;
  mailAt: number;
  requests: readonly string[];
};

export const EMPTY_SEEN: NotificationSeen = { logsAt: 0, mailAt: 0, requests: [] };

export function newestOf(values: readonly number[]): number {
  let newest = 0;
  for (const value of values) if (value > newest) newest = value;
  return newest;
}

/**
 * The mark to store after the drawer has been opened: the newest item it showed.
 * Deliberately the newest *item* and not `Date.now()` — a mark that only moves
 * when something new actually appears is idempotent, so re-marking on every
 * tick while the drawer is open cannot feed the refresh loop that re-marks it.
 */
export function logsSeenAfter(sources: NotificationSources): number {
  return Math.max(newestOf(sources.activity), newestOf(sources.travel), newestOf(sources.conversations));
}

/** The mark to store after the mailbox tab has been opened. */
export function mailSeenAfter(sources: NotificationSources): number {
  return newestOf(sources.mail);
}

/**
 * Friend requests the player has not seen yet. Knocks are deliberately not
 * counted here: a knock leaves the guests store the moment it is answered or
 * lapses, so it clears itself and needs no seen-set of its own.
 */
export function countUnseenRequests(
  incoming: readonly { accountId: string }[],
  seen: NotificationSeen,
): number {
  const known = new Set(seen.requests);
  return incoming.filter((request) => !known.has(request.accountId)).length;
}

/** Everything in `social`: requests still waiting on an answer, plus open knocks. */
export function socialNew(
  incoming: readonly { accountId: string }[],
  knocks: number,
  seen: NotificationSeen,
): number {
  return Math.max(0, Math.floor(knocks)) + countUnseenRequests(incoming, seen);
}

/** How many items in one category are new, given what has been seen. */
export function countNew(
  category: NotifyCategory,
  sources: NotificationSources,
  seen: NotificationSeen,
): number {
  switch (category) {
    case 'messages':
      return Math.max(0, Math.floor(sources.messages));
    case 'social':
      return Math.max(0, Math.floor(sources.social));
    case 'mail':
      return sources.mail.filter((at) => at > seen.mailAt).length;
    case 'activity':
      return sources.activity.filter((at) => at > seen.logsAt).length;
    case 'travel':
      return sources.travel.filter((at) => at > seen.logsAt).length;
    case 'conversations':
      return sources.conversations.filter((at) => at > seen.logsAt).length;
  }
}

export type NotifyCounts = Record<NotifyCategory, number>;

/**
 * Per-category new counts for the categories the player switched on; everything
 * else is zero. A switched-off category can never contribute to the badge, even
 * if the underlying log is busy — that is the whole point of the setting.
 */
export function buildCounts(
  enabled: readonly NotifyCategory[],
  sources: NotificationSources,
  seen: NotificationSeen,
): NotifyCounts {
  const counts = {} as NotifyCounts;
  for (const category of NOTIFY_CATEGORIES) {
    counts[category.id] = enabled.includes(category.id) ? countNew(category.id, sources, seen) : 0;
  }
  return counts;
}

/** The number on the badge. */
export function totalNew(counts: NotifyCounts): number {
  let total = 0;
  for (const id of NOTIFY_CATEGORY_IDS) total += counts[id];
  return total;
}

/**
 * The button's accessible name. A bare number is not a name, so this speaks the
 * breakdown in words — "Logs, 3 new — 2 messages, 1 letter" — and stays honest
 * when there is nothing to say or nothing switched on, where it is just "Logs".
 */
export function describeNotify(
  enabled: readonly NotifyCategory[],
  counts: NotifyCounts,
): string {
  const parts: string[] = [];
  let total = 0;
  for (const category of NOTIFY_CATEGORIES) {
    if (!enabled.includes(category.id)) continue;
    const count = counts[category.id];
    if (count <= 0) continue;
    total += count;
    parts.push(`${count} ${count === 1 ? category.noun[0] : category.noun[1]}`);
  }
  return total === 0 ? 'Logs' : `Logs, ${total} new — ${parts.join(', ')}`;
}

/**
 * Reduce a game state plus the two externally-owned counts into sources. Mail
 * still in the post is left out; a mill parcel is stamped with the moment it
 * lands, ordinary mail with when it was sent, so "newest arrival" orders both.
 */
export function collectNotificationSources(
  state: Readonly<GameState>,
  extras: { messages: number; social: number; now?: number },
): NotificationSources {
  const now = extras.now ?? Date.now();
  const player = state.player;
  return {
    messages: extras.messages,
    social: extras.social,
    mail: player.mailbox
      .filter((mail) => mailHasArrived(mail, now))
      .map((mail) => (mailArrivesAt(mail) > 0 ? mailArrivesAt(mail) : mail.at)),
    activity: player.activityLog.map((entry) => entry.at),
    travel: player.travelLog.map((entry) => entry.at),
    conversations: player.diaryEntries.map((entry) => entry.recordedAt),
  };
}

// ---- The store -------------------------------------------------------------
//
// The seen-marks are a local setting, so they live here beside the counting and
// persist to localStorage under their own key — never in the game save. The
// badge and any panel that clears it read the one copy, so they cannot drift.

const SEEN_STORAGE_KEY = 'pencil…s.notifications.v1';

let seen: NotificationSeen | null = null;
const listeners = new Set<() => void>();

function sanitizeSeen(value: unknown): NotificationSeen {
  if (!value || typeof value !== 'object') return { ...EMPTY_SEEN };
  const raw = value as Partial<NotificationSeen>;
  const time = (candidate: unknown) =>
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0 ? candidate : 0;
  return {
    logsAt: time(raw.logsAt),
    mailAt: time(raw.mailAt),
    requests: Array.isArray(raw.requests)
      ? [...new Set(raw.requests.filter((id): id is string => typeof id === 'string'))]
      : [],
  };
}

function loadSeen(): NotificationSeen {
  if (seen) return seen;
  seen = { ...EMPTY_SEEN };
  try {
    const stored = localStorage.getItem(SEEN_STORAGE_KEY);
    if (stored) seen = sanitizeSeen(JSON.parse(stored));
  } catch {
    // No storage, or a corrupt entry: an empty mark is a fine default.
  }
  return seen;
}

function persist() {
  try {
    localStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(loadSeen()));
  } catch {
    // Session-only marks if storage is unavailable.
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function getNotificationSeen(): NotificationSeen {
  return loadSeen();
}

export function subscribeNotifications(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opening the drawer shows all three log streams at once, so one mark covers them. */
export function markLogsSeen(at: number) {
  const current = loadSeen();
  if (!(at > current.logsAt)) return;
  seen = { ...current, logsAt: at };
  persist();
  emit();
}

/** Opening the mailbox tab. */
export function markMailSeen(at: number) {
  const current = loadSeen();
  if (!(at > current.mailAt)) return;
  seen = { ...current, mailAt: at };
  persist();
  emit();
}

/** Opening the friends list. Replaces the set, so answered asks stop being remembered. */
export function markRequestsSeen(accountIds: readonly string[]) {
  const current = loadSeen();
  const next = [...new Set(accountIds)];
  if (current.requests.length === next.length && next.every((id) => current.requests.includes(id))) {
    return;
  }
  seen = { ...current, requests: next };
  persist();
  emit();
}
