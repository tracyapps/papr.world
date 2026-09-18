import { describe, expect, it } from 'vitest';
import { CLOSE } from './closeReason';
import { classifyJoinFailure, rejoinDelayMs, shouldRejoinAfterClose } from './rejoin';

describe('finding the neighborhood again', () => {
  it('backs off gently and settles at once a minute', () => {
    expect(rejoinDelayMs(0)).toBe(2_000);
    expect(rejoinDelayMs(1)).toBeGreaterThan(rejoinDelayMs(0));
    expect(rejoinDelayMs(50)).toBe(60_000);
  });

  it('rejoins after a restart, a sleep, or a failed reconnect', () => {
    const free = { removed: false, leftOnPurpose: false };
    for (const code of [CLOSE.serverShutdown, CLOSE.abnormal, CLOSE.failedToReconnect, CLOSE.goingAway]) {
      expect(shouldRejoinAfterClose(code, free)).toBe(true);
    }
  });

  it('stays out after leaving on purpose or being removed', () => {
    expect(shouldRejoinAfterClose(CLOSE.consented, { removed: false, leftOnPurpose: false })).toBe(false);
    expect(shouldRejoinAfterClose(CLOSE.abnormal, { removed: true, leftOnPurpose: false })).toBe(false);
    expect(shouldRejoinAfterClose(CLOSE.abnormal, { removed: false, leftOnPurpose: true })).toBe(false);
  });

  it('keeps trying through outages but stops when trying cannot help', () => {
    expect(classifyJoinFailure('WebSocket connection failed')).toEqual({ kind: 'retry' });
    expect(classifyJoinFailure('bad-auth').kind).toBe('fatal');
    expect(classifyJoinFailure('not-allowed').kind).toBe('fatal');
    expect(classifyJoinFailure('bad-protocol')).toMatchObject({ kind: 'fatal', notice: expect.stringMatching(/Reload/) });
  });
});
