// Safety reports. The properties that matter are about EVIDENCE: that it is
// captured, that it cannot be forged, and that it does not leak the reporter.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIMITS, sanitizeReport, type ReportDraft } from '../../shared/src/index';
import { ModerationStore } from './moderation';

let dir = '';
const fresh = () => new ModerationStore(dir);

const draft = (over: Partial<ReportDraft> = {}): ReportDraft => ({
  inviteCode: 'WREN-42',
  reporterAccountId: 'anna',
  reportedAccountId: 'boris',
  reportedName: 'boris',
  messageId: 'msg-1',
  messageText: 'something unkind',
  messageAt: 1_700_000_000_000,
  details: 'this was aimed at me',
  ...over,
});

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pp-moderation-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('sanitizeReport', () => {
  it('does not require the reporter to explain themselves', () => {
    const report = sanitizeReport({ ...draft(), details: '' }, 'id-1', 1);
    // Requiring a justification is friction in exactly the wrong place.
    expect(report).not.toBeNull();
    expect(report?.details).toBeUndefined();
  });

  it('refuses a report that names nobody', () => {
    expect(sanitizeReport({ ...draft(), reportedAccountId: '' }, 'id', 1)).toBeNull();
    expect(sanitizeReport({ ...draft(), reporterAccountId: '' }, 'id', 1)).toBeNull();
  });

  it('refuses a report about yourself', () => {
    expect(sanitizeReport({ ...draft(), reportedAccountId: 'anna' }, 'id', 1)).toBeNull();
  });

  it('strips control characters but keeps the newlines somebody typed', () => {
    // Built rather than pasted, so this file stays free of literal control
    // characters and readable in any editor.
    const NUL = String.fromCharCode(0);
    const BELL = String.fromCharCode(7);
    const noisy = `first line\nsecond${NUL}line${BELL}here`;

    const report = sanitizeReport({ ...draft(), details: noisy }, 'id', 1);

    // A person writing a report will press Enter. Everything else below space
    // only ever arrives from a script, so it goes.
    expect(report?.details).toBe('first line\nsecondlinehere');
  });

  it('clamps the reporter words to the documented limit', () => {
    const report = sanitizeReport(
      { ...draft(), details: 'x'.repeat(LIMITS.reportDetailsMax + 500) },
      'id',
      1,
    );
    expect(report?.details?.length).toBe(LIMITS.reportDetailsMax);
  });
});

describe('ModerationStore', () => {
  it('keeps the report and its evidence, and survives a restart', () => {
    const receipt = fresh().file(draft());
    expect(receipt).toBeTruthy();

    // No flush() - safety reports are written through, never debounced.
    const record = fresh().list()[0];
    expect(record.report.messageText).toBe('something unkind');
    expect(record.report.reportedAccountId).toBe('boris');
    expect(record.status).toBe('new');
  });

  it('appends notes beside the reporter words rather than editing them', () => {
    const store = fresh();
    const id = store.file(draft())!;
    store.review(id, { status: 'reviewing', note: 'spoke to them' });

    const record = store.get(id)!;
    expect(record.status).toBe('reviewing');
    expect(record.notes[0].text).toBe('spoke to them');
    // The original text is untouched - somebody reading this in six months
    // needs what was actually said, not a summary of it.
    expect(record.report.details).toBe('this was aimed at me');
  });

  it('drops the reporter and the private notes from an export', () => {
    const store = fresh();
    const id = store.file(draft())!;
    store.review(id, { note: 'private note' });

    const [exported] = store.exportRedacted();
    expect('reporterAccountId' in exported.report).toBe(false);
    expect('notes' in exported).toBe(false);
    // The evidence itself still travels.
    expect(exported.report.messageText).toBe('something unkind');
  });

  it('rate limits a script without rationing genuine reports', () => {
    const store = fresh();
    const now = 1_700_000_000_000;
    for (let i = 0; i < LIMITS.reportsPerWindow; i += 1) {
      expect(store.file(draft({ reportedAccountId: `boris-${i}` }), now)).toBeTruthy();
    }
    expect(store.file(draft({ reportedAccountId: 'one-more' }), now)).toBeNull();

    // The window is per reporter, so one flooder cannot silence anyone else.
    expect(store.file(draft({ reporterAccountId: 'clara' }), now)).toBeTruthy();

    // And it lifts.
    expect(store.file(draft(), now + LIMITS.reportWindowMs + 1)).toBeTruthy();
  });

  it('newest first, so the queue opens on what just happened', () => {
    const store = fresh();
    store.file(draft({ details: 'first' }));
    store.file(draft({ details: 'second' }));
    expect(store.list()[0].report.details).toBe('second');
  });
});
