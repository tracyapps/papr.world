// What a dropped neighborhood connection actually means.
//
// WHY THIS EXISTS: `room.onLeave(code)` hands back a WebSocket close code and
// nothing else. Every disconnection used to read the same to a player -- "the
// connection closed" -- which is true, useless, and indistinguishable from
// the three very different things that cause it: they left on purpose, the
// server was redeployed, or the network went quiet long enough that the
// server gave up on them.
//
// The distinction matters to the person playing (only one of these is worth
// waiting out) and it matters to whoever is debugging a hosted server, which
// is why `detail` says out loud what to go and check.

/** Close codes Colyseus and the WebSocket spec actually produce. */
export const CLOSE = {
  normal: 1000,
  goingAway: 1001,
  noStatus: 1005,
  abnormal: 1006,
  consented: 4000,
  serverShutdown: 4001,
  withError: 4002,
  failedToReconnect: 4003,
  mayTryReconnect: 4010,
} as const;

export type CloseReason = {
  /** The code, so a bug report can carry it. */
  code: number;
  /** One sentence for the player. No jargon, no blame. */
  notice: string;
  /** For the console: what this code means and what to check. */
  detail: string;
  /** Whether trying again immediately is likely to work. */
  worthRetrying: boolean;
};

export function describeClose(code: number): CloseReason {
  switch (code) {
    case CLOSE.consented:
    case CLOSE.normal:
      return {
        code,
        notice: 'You left the neighborhood. Solo play is still here.',
        detail: 'Normal close — this end asked to leave.',
        worthRetrying: false,
      };

    case CLOSE.goingAway:
    case CLOSE.serverShutdown:
      return {
        code,
        notice: 'The neighborhood is restarting. Try again in a moment.',
        detail: 'The server shut down or is being redeployed. On Railway this '
          + 'is a normal deploy; it is also what App Sleeping looks like.',
        worthRetrying: true,
      };

    case CLOSE.abnormal:
    case CLOSE.noStatus:
      return {
        code,
        notice: 'The neighborhood connection dropped. Try again in a moment.',
        detail: 'Closed with no goodbye — either the network went away, or the '
          + 'server stopped hearing from this browser and hung up. The server '
          + 'waits pingInterval x pingMaxRetries before doing that (currently '
          + '8s x 5 = 40s). A proxy or a sleeping laptop can also cause this.',
        worthRetrying: true,
      };

    case CLOSE.mayTryReconnect:
      return {
        code,
        notice: 'The neighborhood dropped you briefly. Try again in a moment.',
        detail: 'The server is holding the seat open for a reconnection.',
        worthRetrying: true,
      };

    case CLOSE.failedToReconnect:
      return {
        code,
        notice: 'The neighborhood could not take you back. Try entering again.',
        detail: 'A reconnection attempt ran out of time.',
        worthRetrying: false,
      };

    case CLOSE.withError:
      return {
        code,
        notice: 'The neighborhood ran into a problem and closed the visit.',
        detail: 'The room raised an error. The server log has the stack.',
        worthRetrying: false,
      };

    default:
      return {
        code,
        notice: 'The neighborhood connection closed. Solo play is still here.',
        detail: `Unrecognised close code ${code}.`,
        worthRetrying: true,
      };
  }
}
