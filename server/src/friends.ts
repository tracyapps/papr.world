// Friendships: a mutual, accepted edge between two accounts.
//
// Account-level, like blocks and mail - a friend is still a friend in the next
// neighborhood - so this lives in its own store and never in room state
// (docs/accounts-worlds-and-social.md: "Do not put global friendship ... in
// Colyseus room state").
//
// Three properties that matter more than they look:
//
//   MUTUAL OR NOTHING. Asking creates a pending request; only the other person
//   saying yes makes a friendship. If both people ask each other, that is a yes.
//
//   QUIET NO. Declining tells the asker nothing. A request they are not
//   answered simply lapses. Nobody is told "they refused you".
//
//   BLOCKS WIN. Blocking someone ends any friendship and any pending request
//   between you, and they can never ask you again. From their side a request to
//   you looks exactly as if it had been sent.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LIMITS, sanitizeFriendRequestMessage, sanitizeName } from '../../shared/src/index';

type Edge = { name: string; since: number };
type Request = {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  at: number;
  /** The optional note the asker attached. Absent when there was none. */
  message?: string;
  /**
   * `'gone'` — a request that will never be delivered or answered, kept only so
   * the asker's own list looks the same as it would after a real send.
   *
   * WHY THIS EXISTS. A block is silent: the blocked person is told nothing, and
   * the asker is shown a success. But a success that stored nothing left a tell
   * — the request never appeared in the asker's own outgoing list, so "I asked,
   * and it is not in my list" meant "they have blocked me". A refused request
   * (`silently-dropped`) and a declined one are therefore recorded as a
   * tombstone: visible in `outgoing()` to the asker alone, never in `incoming()`,
   * and never answerable. See `tombstone()` and `answer()`.
   */
  state?: 'gone';
};

type StoreFile = {
  version: 1;
  /** accountId -> friendId -> how that friend was named when last seen. */
  friends: Record<string, Record<string, Edge>>;
  requests: Request[];
};

export type RequestStatus =
  /** A pending request now exists. */
  | 'sent'
  /** They had already asked you, so this made you friends. */
  | 'accepted'
  | 'already-friends'
  | 'already-sent'
  /** Somebody's list is full (yours, or theirs). */
  | 'full'
  /** Not a durable account, or yourself. */
  | 'invalid'
  /** You blocked them. Unblock first. */
  | 'you-blocked'
  /** They blocked you. Looks identical to 'sent' from your side; nothing is stored. */
  | 'silently-dropped';

export type AnswerStatus = 'accepted' | 'declined' | 'none' | 'full';

function writeAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, contents, 'utf8');
  renameSync(temporary, path);
}

export class FriendStore {
  private friends = new Map<string, Map<string, Edge>>();
  private requests: Request[] = [];
  private path: string;
  private isBlocked: (listener: string, speaker: string) => boolean;
  private now: () => number;

  constructor(
    dataDir: string,
    isBlocked: (listener: string, speaker: string) => boolean = () => false,
    now: () => number = Date.now,
  ) {
    this.path = join(dataDir, 'friends.json');
    this.isBlocked = isBlocked;
    this.now = now;
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<StoreFile>;
      for (const [accountId, edges] of Object.entries(parsed.friends ?? {})) {
        if (!accountId || !edges || typeof edges !== 'object') continue;
        const map = new Map<string, Edge>();
        for (const [friendId, edge] of Object.entries(edges)) {
          if (!friendId || !edge || typeof edge.since !== 'number') continue;
          map.set(friendId, { name: sanitizeName(edge.name), since: edge.since });
        }
        if (map.size > 0) this.friends.set(accountId, map);
      }
      for (const raw of parsed.requests ?? []) {
        if (typeof raw?.from !== 'string' || typeof raw?.to !== 'string' || typeof raw?.at !== 'number') continue;
        const message = sanitizeFriendRequestMessage(raw.message);
        this.requests.push({
          from: raw.from,
          to: raw.to,
          fromName: sanitizeName(raw.fromName),
          toName: sanitizeName(raw.toName),
          at: raw.at,
          ...(message ? { message } : {}),
          ...(raw.state === 'gone' ? { state: 'gone' as const } : {}),
        });
      }
    } catch (error) {
      // Starting empty would silently unfriend everyone, so say so loudly.
      console.error(`friends: failed to read ${this.path}, starting empty`, error);
    }
  }

  /** Friendships change rarely and matter to people, so write through. */
  private flush(): void {
    const friends: StoreFile['friends'] = {};
    for (const [accountId, edges] of this.friends) {
      if (edges.size > 0) friends[accountId] = Object.fromEntries(edges);
    }
    writeAtomic(this.path, JSON.stringify({ version: 1, friends, requests: this.requests } satisfies StoreFile, null, 2));
  }

  /** Drop requests nobody answered. Lazy: called by every read that lists them. */
  private prune(): void {
    const cutoff = this.now() - LIMITS.friendRequestTtlMs;
    const kept = this.requests.filter((request) => request.at >= cutoff);
    if (kept.length !== this.requests.length) {
      this.requests = kept;
      this.flush();
    }
  }

  areFriends(a: string, b: string): boolean {
    return this.friends.get(a)?.has(b) ?? false;
  }

  /** Everyone `accountId` is friends with, oldest friendship first. */
  list(accountId: string): { accountId: string; name: string; since: number }[] {
    return [...(this.friends.get(accountId) ?? [])]
      .map(([friendId, edge]) => ({ accountId: friendId, name: edge.name, since: edge.since }))
      .sort((a, b) => a.since - b.since);
  }

  /** Requests made to `accountId`, newest first. A tombstone is never one of them. */
  incoming(accountId: string): { accountId: string; name: string; at: number; message?: string }[] {
    this.prune();
    return this.requests
      .filter((request) => request.to === accountId && request.state !== 'gone')
      .map((request) => ({
        accountId: request.from,
        name: request.fromName,
        at: request.at,
        ...(request.message ? { message: request.message } : {}),
      }))
      .sort((a, b) => b.at - a.at);
  }

  /** Requests `accountId` has made, newest first. */
  outgoing(accountId: string): { accountId: string; name: string; at: number; message?: string }[] {
    this.prune();
    return this.requests
      .filter((request) => request.from === accountId)
      .map((request) => ({
        accountId: request.to,
        name: request.toName,
        at: request.at,
        ...(request.message ? { message: request.message } : {}),
      }))
      .sort((a, b) => b.at - a.at);
  }

  request(from: string, fromName: string, to: string, toName: string, message?: string): RequestStatus {
    if (!from || !to || from === to || from.startsWith('guest:') || to.startsWith('guest:')) return 'invalid';
    // You blocked them: say so plainly — that is your own doing, not a secret.
    if (this.isBlocked(from, to)) return 'you-blocked';
    // Blocking purges any friendship, so this can sit above the block check
    // without ever masking one.
    if (this.areFriends(from, to)) return 'already-friends';
    this.prune();

    // Asking twice is asking twice, whatever became of the first one. This has
    // to come BEFORE the blocked check: otherwise a repeat request answers
    // 'silently-dropped' where an honest one answers 'already-sent', and the
    // asker has a second oracle to read a block from.
    if (this.requests.some((request) => request.from === from && request.to === to)) return 'already-sent';

    // They already asked you: a request back is a yes. A tombstone is not a
    // question, so it does not count here.
    if (this.requests.some((request) => (
      request.state !== 'gone' && request.from === to && request.to === from
    ))) {
      return this.answer(from, to, true) === 'accepted' ? 'accepted' : 'full';
    }

    // They blocked you: report success, and record a tombstone so the asker's
    // own list cannot be read as an answer (see `tombstone`).
    if (this.isBlocked(to, from)) {
      this.tombstone(from, fromName, to, toName, message);
      return 'silently-dropped';
    }

    if ((this.friends.get(from)?.size ?? 0) >= LIMITS.friendsMax) return 'full';
    if (this.requests.filter((request) => request.from === from).length >= LIMITS.friendRequestsMax) return 'full';
    if (this.requests.filter((request) => request.to === to && request.state !== 'gone').length >= LIMITS.friendRequestsMax) {
      // Their inbox is full. Look the same as a success from here; a person
      // should not be able to learn how many requests someone has waiting.
      this.tombstone(from, fromName, to, toName, message);
      return 'silently-dropped';
    }

    const note = sanitizeFriendRequestMessage(message);
    this.requests.push({
      from, to, at: this.now(),
      fromName: sanitizeName(fromName), toName: sanitizeName(toName),
      ...(note ? { message: note } : {}),
    });
    this.flush();
    return 'sent';
  }

  /**
   * Record a request that will never be delivered, for the asker's eyes only.
   *
   * The asker asked; as far as they are concerned, a request exists. Writing a
   * tombstone is what makes that true, so their outgoing list cannot be used as
   * a lie detector for a block or a full inbox. `incoming()` skips every
   * tombstone, so the person it names never learns it was written, and it is
   * never answerable (`answer` skips it too).
   *
   * Bounded by the same per-asker cap as a real request, so somebody who keeps
   * knocking on a blocked door cannot grow the file without limit.
   */
  private tombstone(from: string, fromName: string, to: string, toName: string, message?: string): void {
    if (this.requests.some((request) => request.from === from && request.to === to)) return;
    if (this.requests.filter((request) => request.from === from).length >= LIMITS.friendRequestsMax) return;
    // The note rides along too. A real send keeps it, so a tombstone that
    // dropped it would be a second tell: "I wrote a note and my note is gone".
    const note = sanitizeFriendRequestMessage(message);
    this.requests.push({
      from, to, at: this.now(),
      fromName: sanitizeName(fromName), toName: sanitizeName(toName),
      ...(note ? { message: note } : {}),
      state: 'gone',
    });
    this.flush();
  }

  /** `me` answers a request that `from` made to them. */
  answer(me: string, from: string, accept: boolean): AnswerStatus {
    this.prune();
    const index = this.requests.findIndex((request) => (
      request.from === from && request.to === me && request.state !== 'gone'
    ));
    if (index === -1) return 'none';
    const [request] = this.requests.splice(index, 1);
    if (!accept) {
      // A quiet no: the asker must not be able to tell a decline from a request
      // that simply lapsed, so their own copy is left in place as a tombstone.
      // Deleting it here is what made "I asked, and then it vanished" read as
      // "they said no".
      this.requests.push({ ...request, state: 'gone' });
      this.flush();
      return 'declined';
    }
    if ((this.friends.get(me)?.size ?? 0) >= LIMITS.friendsMax
      || (this.friends.get(from)?.size ?? 0) >= LIMITS.friendsMax) {
      this.requests.splice(index, 0, request);
      return 'full';
    }
    const since = this.now();
    this.edge(me, from).set(from, { name: request.fromName, since });
    this.edge(from, me).set(me, { name: request.toName, since });
    // Any request going the other way is now moot.
    this.requests = this.requests.filter((other) => !(
      (other.from === me && other.to === from) || (other.from === from && other.to === me)));
    this.flush();
    return 'accepted';
  }

  private edge(owner: string, _other: string): Map<string, Edge> {
    let map = this.friends.get(owner);
    if (!map) {
      map = new Map();
      this.friends.set(owner, map);
    }
    return map;
  }

  /**
   * End a friendship, or withdraw a request `me` made. Returns which happened.
   * Removing is mutual: it takes the friend off both lists.
   */
  remove(me: string, other: string): 'unfriended' | 'withdrawn' | 'none' {
    if (this.friends.get(me)?.delete(other)) {
      this.friends.get(other)?.delete(me);
      this.flush();
      return 'unfriended';
    }
    const before = this.requests.length;
    this.requests = this.requests.filter((request) => !(request.from === me && request.to === other));
    if (this.requests.length !== before) {
      this.flush();
      return 'withdrawn';
    }
    return 'none';
  }

  /** A block ends everything between two accounts, both directions. */
  purge(a: string, b: string): void {
    const droppedA = this.friends.get(a)?.delete(b) ?? false;
    const droppedB = this.friends.get(b)?.delete(a) ?? false;
    const hadFriend = droppedA || droppedB;
    const before = this.requests.length;
    this.requests = this.requests.filter((request) => !(
      (request.from === a && request.to === b) || (request.from === b && request.to === a)));
    if (hadFriend || this.requests.length !== before) this.flush();
  }

  /** Keep the name on a friend's list current; called when they join. */
  rename(accountId: string, name: string): void {
    const clean = sanitizeName(name);
    let changed = false;
    for (const [owner, edges] of this.friends) {
      const edge = edges.get(accountId);
      if (owner !== accountId && edge && edge.name !== clean) {
        edge.name = clean;
        changed = true;
      }
    }
    if (changed) this.flush();
  }
}
