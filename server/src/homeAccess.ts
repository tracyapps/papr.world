// Who may come through a home's front door, and the knocking book.
//
// Pure and clock-injected so every rule can be tested without a room. The room
// (PaperRoom) owns the sockets; this owns the decisions.
//
// Design: docs/house-and-home.md ("Who can come in").

import { LIMITS, type HomePolicy } from '../../shared/src/index';

export type AccessInput = {
  host: string;
  visitor: string;
  /** Does the host have a published home in this neighborhood? */
  hostHasHome: boolean;
  policy: HomePolicy;
  isFriend: boolean;
  /** Blocked in either direction. Checked at the door, not only at chat. */
  blockedEitherWay: boolean;
  /** Banned from this neighborhood. */
  banned: boolean;
  /** The owner said "let in" a moment ago and it has not been used or lapsed. */
  hasPermit: boolean;
};

export type AccessDecision = 'admit' | 'knock' | 'closed';

/**
 * The whole door policy in one place. Order matters: a block or a ban beats
 * everything, including an open house and a permit granted a minute ago.
 */
export function decideAccess(input: AccessInput): AccessDecision {
  // Your own front door is never locked to you.
  if (input.host === input.visitor) return input.hostHasHome ? 'admit' : 'closed';
  if (!input.hostHasHome || input.blockedEitherWay || input.banned) return 'closed';
  if (input.hasPermit) return 'admit';
  if (input.policy.open) return 'admit';
  const tier = input.isFriend ? input.policy.friends : input.policy.others;
  if (tier === 'walk') return 'admit';
  if (tier === 'knock') return 'knock';
  return 'closed';
}

export type Knock = {
  host: string;
  visitor: string;
  visitorName: string;
  at: number;
  expiresAt: number;
};

export type KnockResult = 'new' | 'pending' | 'cooldown';

const pairKey = (host: string, visitor: string) => `${host}\u0000${visitor}`;

/**
 * Pending knocks, "let in" permits, and the pause between knocks.
 *
 * Nothing here needs quick reflexes: a knock waits several minutes, and a
 * permit gives the visitor a couple of minutes to step through. The pause
 * between knocks is what stops a knock from becoming a buzzer.
 */
export class KnockBook {
  private pending = new Map<string, Knock>();
  private permits = new Map<string, number>();
  private lastKnock = new Map<string, number>();
  private lastNote = new Map<string, number>();
  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  knock(host: string, visitor: string, visitorName: string): KnockResult {
    const key = pairKey(host, visitor);
    if (this.pending.has(key)) return 'pending';
    const last = this.lastKnock.get(key);
    if (last !== undefined && this.now() - last < LIMITS.knockCooldownMs) return 'cooldown';
    const at = this.now();
    this.lastKnock.set(key, at);
    this.pending.set(key, { host, visitor, visitorName, at, expiresAt: at + LIMITS.knockTtlMs });
    return 'new';
  }

  /** Knocks waiting at `host`'s door, oldest first. */
  waiting(host: string): Knock[] {
    return [...this.pending.values()]
      .filter((knock) => knock.host === host && knock.expiresAt > this.now())
      .sort((a, b) => a.at - b.at);
  }

  /**
   * The owner answers. Returns the knock, or null if there was none (already
   * answered, lapsed, or never made). "Let in" grants a short permit.
   */
  answer(host: string, visitor: string, admit: boolean): Knock | null {
    const key = pairKey(host, visitor);
    const knock = this.pending.get(key);
    if (!knock) return null;
    this.pending.delete(key);
    if (knock.expiresAt <= this.now()) return null;
    if (admit) this.permits.set(key, this.now() + LIMITS.entryPermitTtlMs);
    return knock;
  }

  hasPermit(host: string, visitor: string): boolean {
    const until = this.permits.get(pairKey(host, visitor));
    return until !== undefined && until > this.now();
  }

  /** A permit is for one step through the door. */
  consumePermit(host: string, visitor: string): void {
    this.permits.delete(pairKey(host, visitor));
  }

  /** Take back a permit or a knock, e.g. when a block lands. */
  revoke(host: string, visitor: string): Knock | null {
    const key = pairKey(host, visitor);
    this.permits.delete(key);
    const knock = this.pending.get(key) ?? null;
    this.pending.delete(key);
    return knock;
  }

  /** Knocks that have lapsed. Removed, and returned so the owner's notice can be cleared. */
  expire(): Knock[] {
    const lapsed: Knock[] = [];
    const now = this.now();
    for (const [key, knock] of this.pending) {
      if (knock.expiresAt <= now) {
        this.pending.delete(key);
        lapsed.push(knock);
      }
    }
    for (const [key, until] of this.permits) if (until <= now) this.permits.delete(key);
    // Old pauses are only worth remembering while they still pause anything.
    for (const [key, at] of this.lastKnock) {
      if (now - at >= LIMITS.knockCooldownMs && !this.pending.has(key)) this.lastKnock.delete(key);
    }
    return lapsed;
  }

  /** Every knock this visitor has waiting anywhere (they left, or disconnected). */
  withdraw(visitor: string): Knock[] {
    const gone: Knock[] = [];
    for (const [key, knock] of this.pending) {
      if (knock.visitor !== visitor) continue;
      this.pending.delete(key);
      gone.push(knock);
    }
    return gone;
  }

  /**
   * May a note be left for an absent owner? At most one per visitor per door in
   * a long window, so knocking at an empty house cannot fill someone's mailbox.
   */
  noteDue(host: string, visitor: string): boolean {
    const key = pairKey(host, visitor);
    const last = this.lastNote.get(key);
    if (last !== undefined && this.now() - last < LIMITS.knockNoteIntervalMs) return false;
    this.lastNote.set(key, this.now());
    return true;
  }
}
