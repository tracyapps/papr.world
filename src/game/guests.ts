// Friends, the front door, and who is inside: what this player knows and can do
// about other people coming into homes. Renderer-free and socket-free, like the
// sim: the network layer sets a transport when a shared session is live and
// forwards what the server says; the screens read it and subscribe.
//
// Design: docs/house-and-home.md ("Who can come in").
//
// Three rules shape it:
//   * The client asks, the server decides. `requestEntry` says "may I?"; the
//     answer is an outcome, and only `admitted` puts you through the door.
//   * Nothing needs quick hands. A knock waits for minutes, a "let in" is good
//     for minutes, and every result is a sentence (`describeEntryResult`).
//   * Solo play has none of this: with no transport, everything here is quiet.

import {
  DEFAULT_HOME_POLICY,
  isGuestAccount,
  type EntryResult,
  type FriendNotice,
  type FriendsSnapshot,
  type HomeExit,
  type HomePolicy,
  type KnockCleared,
  type KnockNotice,
} from '../../shared/src/index';

/** What the game can ask the room to do. Set by the network layer while connected. */
export type GuestTransport = {
  requestFriend: (accountId: string) => void;
  answerFriend: (accountId: string, accept: boolean) => void;
  removeFriend: (accountId: string) => void;
  setHomePolicy: (policy: HomePolicy) => void;
  enterHome: (host: string) => void;
  leaveHome: () => void;
  answerKnock: (visitor: string, admit: boolean) => void;
  askToLeave: (accountId: string) => void;
};

/** What the screens do when the server's answer changes where you are. */
export type GuestHandlers = {
  /** The server put you inside this home; go through the door. */
  admitted: (host: string, hostName: string) => void;
  /** The owner asked you to step out; the server has already moved you. */
  evicted: (host: string) => void;
  /** Words for the polite live toast. */
  say: (text: string) => void;
};

export type EntryPhase =
  | 'idle'
  /** You asked; waiting to hear. */
  | 'asking'
  /** You knocked; the owner has been told. */
  | 'knocking';

export type Invitation = { host: string; hostName: string; until: number };

const EMPTY_FRIENDS: FriendsSnapshot = { friends: [], incoming: [], outgoing: [] };
/** A "let in" is good for this long on the server; the client stops offering it a little sooner. */
export const INVITATION_MS = 110_000;

let transport: GuestTransport | null = null;
let handlers: GuestHandlers | null = null;
let selfAccount = '';
let friends: FriendsSnapshot = EMPTY_FRIENDS;
let policy: HomePolicy = { ...DEFAULT_HOME_POLICY };
let knocks: Array<KnockNotice & { lapsesAt: number }> = [];
let phase: EntryPhase = 'idle';
let entryHost = '';
let entryHostName = '';
let entryIsOwn = false;
let invitations: Invitation[] = [];
/** The latest thing said about coming in, kept so a panel can show it after the toast is gone. */
let entryNote = '';
/** The home the server has us inside. '' while outside, or while it does not know. */
let serverInside = '';
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

function say(text: string) {
  handlers?.say(text);
}

export function subscribeGuests(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setGuestHandlers(next: GuestHandlers | null) {
  handlers = next;
}

/** Whether a shared session is live and the player has somebody to be friends with. */
export function guestsAvailable(): boolean {
  return transport !== null;
}

export function setSelfAccount(accountId: string) {
  selfAccount = accountId;
}

export function getSelfAccount(): string {
  return selfAccount;
}

/** Guests (no passport) have no home and no friends; the server refuses both. */
export function selfIsGuest(): boolean {
  return !selfAccount || isGuestAccount(selfAccount);
}

export function setGuestTransport(next: GuestTransport | null) {
  transport = next;
  if (next === null) resetGuests();
  else changed();
}

/** A dropped or ended session: forget everything the room told us. */
export function resetGuests() {
  friends = EMPTY_FRIENDS;
  policy = { ...DEFAULT_HOME_POLICY };
  knocks = [];
  phase = 'idle';
  entryHost = '';
  entryHostName = '';
  entryIsOwn = false;
  invitations = [];
  entryNote = '';
  serverInside = '';
  changed();
}

// ---- Friends ----------------------------------------------------------------

export function getFriends(): FriendsSnapshot {
  return friends;
}

export function receiveFriends(snapshot: FriendsSnapshot) {
  friends = snapshot;
  changed();
}

export type FriendState = 'friends' | 'incoming' | 'outgoing' | 'none';

/** How you and this account stand: friends, they asked you, you asked them, or neither. */
export function friendStateOf(accountId: string): FriendState {
  if (friends.friends.some((entry) => entry.accountId === accountId)) return 'friends';
  if (friends.incoming.some((entry) => entry.accountId === accountId)) return 'incoming';
  if (friends.outgoing.some((entry) => entry.accountId === accountId)) return 'outgoing';
  return 'none';
}

export function requestFriend(accountId: string) {
  transport?.requestFriend(accountId);
}

export function answerFriend(accountId: string, accept: boolean) {
  transport?.answerFriend(accountId, accept);
}

export function removeFriend(accountId: string) {
  transport?.removeFriend(accountId);
}

export function describeFriendNotice(notice: FriendNotice): string {
  const name = notice.name || 'that player';
  switch (notice.kind) {
    case 'requested': return `Friend request sent to ${name}.`;
    case 'incoming': return `${name} would like to be friends. You can answer in your friends list.`;
    case 'accepted': return `You and ${name} are friends now.`;
    case 'already-friends': return `You and ${name} are already friends.`;
    case 'already-requested': return `You already asked ${name}. They will see it when they are next around.`;
    case 'removed': return `${name} is no longer on your friends list.`;
    case 'full': return 'A friends list is full, so that could not go through.';
    default: return '';
  }
}

export function receiveFriendNotice(notice: FriendNotice) {
  const text = describeFriendNotice(notice);
  if (text) say(text);
}

// ---- Your own door ----------------------------------------------------------

export function getHomePolicy(): HomePolicy {
  return policy;
}

export function receiveHomePolicy(next: HomePolicy) {
  policy = next;
  changed();
}

/** Change one or more door settings. The server confirms with the whole policy. */
export function setHomePolicy(change: Partial<HomePolicy>) {
  transport?.setHomePolicy({ ...policy, ...change });
}

// ---- Knocks at your door ----------------------------------------------------

export function getKnocks(): KnockNotice[] {
  return knocks;
}

export function receiveKnock(notice: KnockNotice, now = Date.now()) {
  const wait = Math.max(0, notice.expiresAt - notice.at);
  knocks = [
    ...knocks.filter((entry) => entry.visitor !== notice.visitor),
    { ...notice, lapsesAt: now + wait },
  ];
  say(`${notice.name} is at your door. You can let them in or say not right now.`);
  changed();
}

export function receiveKnockCleared(cleared: KnockCleared) {
  const before = knocks.length;
  knocks = knocks.filter((entry) => entry.visitor !== cleared.visitor);
  if (knocks.length !== before) changed();
}

/** Let a knocker in, or say not right now. Neither needs to be quick. */
export function answerKnock(visitor: string, admit: boolean) {
  knocks = knocks.filter((entry) => entry.visitor !== visitor);
  transport?.answerKnock(visitor, admit);
  changed();
}

/** Knocks quietly lapse; call now and then (about once a second is plenty). */
export function pruneKnocks(now = Date.now()) {
  const before = knocks.length;
  knocks = knocks.filter((entry) => entry.lapsesAt > now);
  invitations = invitations.filter((entry) => entry.until > now);
  if (knocks.length !== before) changed();
}

export function askToLeave(accountId: string) {
  transport?.askToLeave(accountId);
}

// ---- Coming in --------------------------------------------------------------

/** The last sentence about coming in (an answer, or an invitation), for a panel to show. */
export function getEntryNote(): string {
  return entryNote;
}

export function getEntryPhase(): EntryPhase {
  return phase;
}

export function getEntryTarget(): { host: string; hostName: string } | null {
  return phase === 'idle' ? null : { host: entryHost, hostName: entryHostName };
}

/**
 * True while the room is deciding where you stand (you have just told it you
 * went through your own door), so the position it hears must wait for the answer.
 */
export function presenceHeld(): boolean {
  return phase === 'asking' && entryIsOwn;
}

/** The home the server has confirmed you are inside, or '' . */
export function getServerInside(): string {
  return serverInside;
}

/** A standing invitation to this home (the owner let you in and it has not run out). */
export function invitationTo(host: string, now = Date.now()): Invitation | null {
  return invitations.find((entry) => entry.host === host && entry.until > now) ?? null;
}

/**
 * Ask to come into someone's home. The answer arrives as `receiveEntryResult`.
 * Returns false when there is no live session to ask.
 */
export function requestEntry(host: string, hostName: string): boolean {
  if (!transport) return false;
  if (phase === 'asking') return true;
  // Asking again while you have knocked is just the same knock (the room says
  // "already knocked"), or, if the owner has let you in since, your way through.
  phase = 'asking';
  entryHost = host;
  entryHostName = hostName;
  entryIsOwn = false;
  entryNote = '';
  // While knocking, asking again is just the same knock; the room says "already knocked".
  transport.enterHome(host);
  changed();
  return true;
}

/**
 * You have gone through your own door. Tell the room (so friends inside can see
 * you, and you them). If the room cannot place you (a guest has no home on
 * record) nothing changes: you simply stay pinned to your doorstep as before.
 */
export function announceOwnHome(): boolean {
  if (!transport || selfIsGuest()) return false;
  phase = 'asking';
  entryHost = selfAccount;
  entryHostName = 'your home';
  entryIsOwn = true;
  transport.enterHome(selfAccount);
  changed();
  return true;
}

/** You have gone out through the door, from your own home or a visit. */
export function announceLeftHome() {
  if (phase === 'asking' && entryIsOwn) phase = 'idle';
  if (serverInside || phase === 'asking') transport?.leaveHome();
  serverInside = '';
  changed();
}

export function receiveEntryResult(result: EntryResult, now = Date.now()) {
  const name = result.hostName || 'them';
  const mine = result.host === entryHost;

  if (result.outcome === 'admitted') {
    if (phase === 'asking' && mine) {
      // You asked and the room put you inside.
      const own = entryIsOwn;
      phase = 'idle';
      entryNote = '';
      serverInside = result.host;
      changed();
      if (!own) handlers?.admitted(result.host, name);
      return;
    }
    // Admitted without having asked to walk in: the owner answered your knock.
    // The room has not moved you, and you may be a long way off, so it is an
    // invitation you take up at the door, never a jolt. (A late echo of a door
    // you have already gone through, or your own, is not news.)
    if (serverInside === result.host || result.host === selfAccount) return;
    phase = 'idle';
    invitations = [
      ...invitations.filter((entry) => entry.host !== result.host),
      { host: result.host, hostName: name, until: now + INVITATION_MS },
    ];
    entryNote = `${name} let you in. Go to their door and press E, or use the button, to come in.`;
    say(entryNote);
    changed();
    return;
  }

  if (!mine && phase !== 'idle') return;
  if (mine && entryIsOwn) {
    // Your own door: a refusal only means the room cannot place you (no home on
    // record yet, or two doors in quick succession). You stay pinned to your
    // doorstep as before, and there is nothing to say about it.
    phase = 'idle';
    changed();
    return;
  }
  if (result.outcome === 'knocked') {
    phase = 'knocking';
    entryHost = result.host;
    entryHostName = name;
  } else {
    phase = 'idle';
  }
  entryNote = describeEntryResult(result);
  say(entryNote);
  changed();
}

export function describeEntryResult(result: EntryResult): string {
  const name = result.hostName || 'them';
  switch (result.outcome) {
    case 'admitted': return `Come in.`;
    case 'knocked':
      return `You knocked at ${name}'s door. They have been told, and their answer will show up here. You do not have to wait by the door.`;
    case 'no-answer': return `${name} is not home. A note about your knock is waiting in their mailbox.`;
    case 'declined': return `${name} cannot come to the door right now.`;
    case 'closed': return 'The door is closed.';
    case 'busy': return 'You knocked a moment ago. Give it a little while before knocking again.';
    default: return '';
  }
}

/** The owner asked you to leave: the room has already moved you out. */
export function receiveHomeExit(exit: HomeExit) {
  serverInside = '';
  phase = 'idle';
  handlers?.evicted(exit.host);
  changed();
}
