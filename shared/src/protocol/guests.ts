// Guests: friends, who may come into a home, and knocking at the door.
//
// Design: docs/house-and-home.md ("Who can come in") and docs/scenes-and-interiors.md.
// Renderer-free and networking-free like the rest of this tree.
//
// Two rules run through everything here:
//   * The client asks, the server decides. Nothing on the wire says "let me
//     in"; it says "may I?" and gets an outcome.
//   * A block is silent. A person who has been blocked gets exactly the answer
//     a closed door gives, so there is nothing to test or argue with.

import { LIMITS } from './constants';

// ---- Entry settings ---------------------------------------------------------

/** What happens when a friend comes to the door. */
export type FriendEntry = 'walk' | 'knock' | 'closed';
/** What happens when anyone else comes to the door. */
export type OtherEntry = 'knock' | 'closed';

/**
 * The owner's settings for their own front door. Private to the owner and the
 * server, except `open`, which is public on purpose: an open house shows a sign
 * everyone can see.
 */
export type HomePolicy = {
  friends: FriendEntry;
  others: OtherEntry;
  /** Open house: everyone may walk in. */
  open: boolean;
};

export const DEFAULT_HOME_POLICY: HomePolicy = { friends: 'walk', others: 'knock', open: false };

const FRIEND_ENTRIES: readonly FriendEntry[] = ['walk', 'knock', 'closed'];
const OTHER_ENTRIES: readonly OtherEntry[] = ['knock', 'closed'];

/** A well-formed policy or null. Missing fields fall back to the defaults. */
export function sanitizeHomePolicy(raw: unknown): HomePolicy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<HomePolicy>;
  const friends = value.friends ?? DEFAULT_HOME_POLICY.friends;
  const others = value.others ?? DEFAULT_HOME_POLICY.others;
  const open = value.open ?? DEFAULT_HOME_POLICY.open;
  if (!FRIEND_ENTRIES.includes(friends)) return null;
  if (!OTHER_ENTRIES.includes(others)) return null;
  if (typeof open !== 'boolean') return null;
  return { friends, others, open };
}

/** Same as `sanitizeHomePolicy` but never null: bad saved data becomes the default. */
export function homePolicyOrDefault(raw: unknown): HomePolicy {
  return sanitizeHomePolicy(raw) ?? { ...DEFAULT_HOME_POLICY };
}

// ---- Entering a home --------------------------------------------------------

/**
 * How a request to come in ended. Deliberately few, and none says *why*:
 * `closed` covers "the door is closed", "you are blocked" and "they are not
 * home to anyone", identically.
 */
export type EntryOutcome =
  /** Come in. The server has already moved you inside. */
  | 'admitted'
  /** You knocked; the owner has been told. Wait for an answer. */
  | 'knocked'
  /** You knocked but the owner is away; a note was left for them. */
  | 'no-answer'
  /** The owner said "not right now". */
  | 'declined'
  /** The door is closed to you. */
  | 'closed'
  /** You knocked a moment ago. Try again later. */
  | 'busy';

export type EntryResult = {
  host: string;
  /** The home's name as last published, for a sentence to read aloud. */
  hostName: string;
  outcome: EntryOutcome;
};

export type EnterHomeIntent = { host: string };
export type KnockAnswerIntent = { visitor: string; admit: boolean };
/** Owner asks one guest to leave. Not a block; they can come back if the door allows. */
export type AskToLeaveIntent = { accountId: string };

/** Sent to the owner when somebody knocks. */
export type KnockNotice = {
  visitor: string;
  name: string;
  at: number;
  /** Server epoch ms after which the knock quietly lapses. */
  expiresAt: number;
};

/** A knock that no longer needs an answer (answered elsewhere, or lapsed). */
export type KnockCleared = { visitor: string };

/** The server took you out of a home. Says nothing about why beyond "asked to leave". */
export type HomeExit = { host: string; reason: 'asked-to-leave' };

// ---- Friends ----------------------------------------------------------------

export type FriendRecord = {
  accountId: string;
  /** Their name as last seen, so the list reads right while they are away. */
  name: string;
  /** Only ever true for a friend standing in this same room. */
  online: boolean;
};

export type FriendRequestRecord = {
  accountId: string;
  name: string;
  at: number;
  /** The note the asker attached, if any (see `FriendRequestIntent.message`). */
  message?: string;
};

/** Everything a player knows about their own friendships. Sent whole on every change. */
export type FriendsSnapshot = {
  friends: FriendRecord[];
  /** Asked me. */
  incoming: FriendRequestRecord[];
  /** I asked them. */
  outgoing: FriendRequestRecord[];
};

export type FriendRequestIntent = { accountId: string; message?: string };
export type FriendAnswerIntent = { accountId: string; accept: boolean };
export type FriendRemoveIntent = { accountId: string };

export type FriendNoticeKind =
  /** You asked. */
  | 'requested'
  /** Somebody asked you. */
  | 'incoming'
  /** You are friends now (either direction of asking). */
  | 'accepted'
  | 'already-friends'
  | 'already-requested'
  /** A friend was removed, or your own request was withdrawn. */
  | 'removed'
  /** A list is full. */
  | 'full';

export type FriendNotice = {
  kind: FriendNoticeKind;
  accountId: string;
  name: string;
};

/** A reference to another account: trimmed, bounded, no control characters. */
export function sanitizeAccountRef(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || value.length > 80) return null;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return null;
  }
  return value;
}

/** Guests get a throwaway id for one visit; they have no home and no friends. */
export function isGuestAccount(accountId: string): boolean {
  return accountId.startsWith('guest:');
}

// ---- Home marker: what neighbors can see of a house -------------------------

const PART_ID = /^[a-z0-9-]{1,16}$/;

/**
 * The finished parts of a house, as published for neighbors to draw. The shared
 * layer has no catalog, so this checks shape only; the client keeps just the
 * ids it knows (`isDwellingPartId`), same split as recipe ids elsewhere.
 */
export function sanitizeHomeParts(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string' || !PART_ID.test(item) || out.includes(item)) continue;
    out.push(item);
    if (out.length >= LIMITS.homePartsMax) break;
  }
  return out;
}

/** A part id, or '' when it is not one. */
export function sanitizeHomeBuilding(raw: unknown): string {
  return typeof raw === 'string' && PART_ID.test(raw) ? raw : '';
}

/** Parts travel in the synced schema as one comma-joined string. */
export function joinHomeParts(parts: readonly string[]): string {
  return parts.join(',');
}

export function splitHomeParts(joined: string): string[] {
  return sanitizeHomeParts(joined ? joined.split(',') : []);
}
