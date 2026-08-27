// The point of these is that the three kinds of disconnection stay
// distinguishable. If they ever collapse back into one message, the person
// playing cannot tell "wait a moment" from "you are done here".

import { describe, expect, it } from 'vitest';
import { CLOSE, describeClose } from './closeReason';

describe('describeClose', () => {
  it('does not tell someone who left on purpose to try again', () => {
    expect(describeClose(CLOSE.consented).worthRetrying).toBe(false);
    expect(describeClose(CLOSE.normal).worthRetrying).toBe(false);
  });

  it('treats a silent drop as worth waiting out', () => {
    // 1006 is the one a ping timeout produces, and it is the common case.
    expect(describeClose(CLOSE.abnormal).worthRetrying).toBe(true);
    expect(describeClose(CLOSE.abnormal).notice).toMatch(/try again/i);
  });

  it('names a restart as a restart', () => {
    expect(describeClose(CLOSE.serverShutdown).notice).toMatch(/restarting/i);
  });

  it('carries the code so a bug report can quote it', () => {
    expect(describeClose(4242).code).toBe(4242);
  });

  it('has something to say about a code it has never seen', () => {
    const unknown = describeClose(4242);
    expect(unknown.notice.length).toBeGreaterThan(0);
    expect(unknown.detail).toContain('4242');
    // Unknown means unknown — assume recoverable rather than sending someone
    // away from a neighbourhood that may be perfectly fine.
    expect(unknown.worthRetrying).toBe(true);
  });

  it('never leaves the player without a next step', () => {
    for (const code of Object.values(CLOSE)) {
      const reason = describeClose(code);
      expect(reason.notice.trim().length).toBeGreaterThan(10);
      expect(reason.detail.trim().length).toBeGreaterThan(10);
    }
  });
});
