import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AlphaFeedback } from '../../shared/src/index';
import { FeedbackStore, MAX_SCREENSHOT_BYTES } from './feedback';

const temporaryDirectories: string[] = [];

function tempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'paper-feedback-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function submission(id = 'report-1'): AlphaFeedback {
  return {
    version: 1,
    id,
    category: 'bug',
    summary: 'Bridge seam',
    details: 'A seam appeared at the high point.',
    screenshotId: id,
    context: {
      clientBuild: 'test', protocolVersion: 2, mode: 'shared', roomId: 'neighborhood',
      accountId: 'private-paper-id', pageId: '0,0', biome: 'clearing', x: 1, z: 2,
      browser: 'Firefox', platform: 'macOS', recentGameEvents: [],
    },
    createdAt: 123,
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('feedback review store', () => {
  it('stores only capped web images under a server-controlled filename', () => {
    const directory = tempDirectory();
    const store = new FeedbackStore(directory);
    expect(store.saveScreenshot('../report-1', 'image/webp', Buffer.from([1, 2, 3]))).toBe(false);
    expect(store.saveScreenshot('report-1', 'image/gif', Buffer.from([1, 2, 3]))).toBe(false);
    expect(store.saveScreenshot(
      'report-1', 'image/webp', Buffer.alloc(MAX_SCREENSHOT_BYTES + 1),
    )).toBe(false);
    expect(store.saveScreenshot('report-1', 'image/webp', Buffer.from([1, 2, 3]))).toBe(true);
    expect(store.saveScreenshot('report-1', 'image/png', Buffer.from([9, 9, 9]))).toBe(true);
    expect([...store.readScreenshot('report-1')!.data]).toEqual([1, 2, 3]);
  });

  it('updates status and appends audit notes without changing the original report', () => {
    const directory = tempDirectory();
    const store = new FeedbackStore(directory);
    store.append(submission());
    store.review('report-1', { status: 'reviewing', note: 'Reproduced on Firefox.' }, 500);
    store.review('report-1', { status: 'resolved', note: 'Fixed in bridge-height pass.' }, 600);

    const record = store.list()[0];
    expect(record.status).toBe('resolved');
    expect(record.submission.summary).toBe('Bridge seam');
    expect(record.auditNotes).toEqual([
      { at: 500, note: 'Reproduced on Firefox.' },
      { at: 600, note: 'Fixed in bridge-height pass.' },
    ]);
    expect(JSON.parse(readFileSync(join(directory, 'feedback.json'), 'utf8')))
      .toMatchObject({ records: [{ status: 'resolved' }] });
  });

  it('redacts account identity and internal audit notes from analysis export', () => {
    const store = new FeedbackStore(tempDirectory());
    store.append(submission());
    store.review('report-1', { status: 'duplicate', note: 'Same as report-0.' }, 700);

    const exported = JSON.stringify(store.exportRedacted());
    expect(exported).toContain('Bridge seam');
    expect(exported).toContain('duplicate');
    expect(exported).not.toContain('private-paper-id');
    expect(exported).not.toContain('Same as report-0');
  });
});
