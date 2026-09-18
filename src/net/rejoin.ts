// Finding the neighborhood again after the connection is truly gone.
//
// The Colyseus SDK already rides out short drops (about a minute of retries
// into a seat the server holds open — see PaperRoom.onDrop). What it cannot
// survive is the seat itself disappearing: the server redeployed or slept,
// or the laptop was closed for longer than the grace window. That used to
// leave the player sitting in a quiet solo world with "offline" in the corner
// until they noticed and reloaded — which, for account worlds, then looked
// like being logged out.
//
// Now a lost visit becomes a fresh join, on a gentle backoff, using a fresh
// sign-in token each time. These are the rules, kept pure so they are tested.

import { CLOSE } from './closeReason';

/** Seconds between attempts: quick at first, then a calm once a minute. */
export const REJOIN_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000, 60_000] as const;

export function rejoinDelayMs(attempt: number): number {
  const index = Math.max(0, Math.min(Math.floor(attempt), REJOIN_DELAYS_MS.length - 1));
  return REJOIN_DELAYS_MS[index]!;
}

/**
 * Should a closed visit be rejoined on its own? Not when the player left on
 * purpose, and never after being removed or banned by the world's owner —
 * those close with the "consented" code and must stay closed.
 */
export function shouldRejoinAfterClose(code: number, options: { removed: boolean; leftOnPurpose: boolean }): boolean {
  if (options.removed || options.leftOnPurpose) return false;
  return code !== CLOSE.consented && code !== CLOSE.normal;
}

export type JoinFailure =
  | { kind: 'retry' }
  | { kind: 'fatal'; notice: string };

/**
 * Sort a failed join into "try again later" and "trying again cannot help".
 * The server's onAuth throws short codes (PaperRoom.onAuth); anything that
 * is not one of those is a network or server-availability problem, which is
 * exactly what waiting fixes.
 */
export function classifyJoinFailure(message: string): JoinFailure {
  if (/bad-protocol/.test(message)) {
    return { kind: 'fatal', notice: 'papr.world was just updated. Reload the page to catch up.' };
  }
  if (/not-allowed/.test(message)) {
    return { kind: 'fatal', notice: 'This account can no longer enter this world. Return to My desk.' };
  }
  if (/bad-auth|guest-not-allowed|signed-out/.test(message)) {
    return { kind: 'fatal', notice: 'Your sign-in has ended. Return to My desk to open this world again.' };
  }
  if (/neighborhood-not-found|bad-invite-code|bad-world-id/.test(message)) {
    return { kind: 'fatal', notice: 'That neighborhood could not be found.' };
  }
  return { kind: 'retry' };
}
