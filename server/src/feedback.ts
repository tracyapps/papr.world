// Product-feedback intake for the invited alpha. This is intentionally
// separate from future player/message/drawing safety reports.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ALPHA_FEEDBACK_STATUSES,
  MAX_FEEDBACK_SCREENSHOT_BYTES,
  type AlphaFeedback,
  type AlphaFeedbackReviewRecord,
  type AlphaFeedbackStatus,
} from '../../shared/src/index';

export const MAX_SCREENSHOT_BYTES = MAX_FEEDBACK_SCREENSHOT_BYTES;

export type FeedbackRecord = AlphaFeedbackReviewRecord;

type FeedbackFile = { version: 1; records: FeedbackRecord[] };

export class FeedbackStore {
  private path: string;
  private screenshotsDir: string;
  private records = new Map<string, FeedbackRecord>();

  constructor(dataDir: string) {
    this.path = join(dataDir, 'feedback.json');
    this.screenshotsDir = join(dataDir, 'feedback-screenshots');
    this.load();
  }

  append(submission: AlphaFeedback): FeedbackRecord {
    const existing = this.records.get(submission.id);
    if (existing) return existing;
    const record: FeedbackRecord = {
      submission,
      status: 'new',
      receivedAt: Date.now(),
      auditNotes: [],
    };
    this.records.set(submission.id, record);
    this.flush();
    return record;
  }

  list(): FeedbackRecord[] {
    return [...this.records.values()].sort((a, b) => b.receivedAt - a.receivedAt);
  }

  get(id: string): FeedbackRecord | null {
    return this.records.get(id) ?? null;
  }

  review(
    id: string,
    change: { status?: AlphaFeedbackStatus; note?: string },
    now = Date.now(),
  ): FeedbackRecord | null {
    const record = this.records.get(id);
    if (!record) return null;
    if (change.status && ALPHA_FEEDBACK_STATUSES.includes(change.status)) {
      record.status = change.status;
    }
    const note = typeof change.note === 'string'
      ? change.note.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 500)
      : '';
    if (note) {
      record.auditNotes.push({ at: now, note });
      record.auditNotes = record.auditNotes.slice(-100);
    }
    this.flush();
    return record;
  }

  saveScreenshot(id: string, mime: string, data: Buffer): boolean {
    if (!this.safeScreenshotId(id) || !['image/webp', 'image/png'].includes(mime)) return false;
    if (data.length === 0 || data.length > MAX_SCREENSHOT_BYTES) return false;
    mkdirSync(this.screenshotsDir, { recursive: true });
    // Upload retries are idempotent. Once an id owns an image, neither a
    // repeated request nor a different allowed extension may replace it.
    if (this.readScreenshot(id)) return true;
    const extension = mime === 'image/png' ? 'png' : 'webp';
    const path = join(this.screenshotsDir, `${id}.${extension}`);
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, data);
    renameSync(tmp, path);
    return true;
  }

  readScreenshot(id: string): { mime: 'image/webp' | 'image/png'; data: Buffer } | null {
    if (!this.safeScreenshotId(id)) return null;
    for (const [extension, mime] of [['webp', 'image/webp'], ['png', 'image/png']] as const) {
      const path = join(this.screenshotsDir, `${id}.${extension}`);
      if (existsSync(path)) return { mime, data: readFileSync(path) };
    }
    return null;
  }

  exportRedacted(): {
    version: 1;
    exportedAt: number;
    records: Array<Omit<FeedbackRecord, 'auditNotes'> & { submission: AlphaFeedback }>;
  } {
    return {
      version: 1,
      exportedAt: Date.now(),
      records: this.list().map((record) => {
        const { accountId: _accountId, ...safeContext } = record.submission.context;
        return {
          submission: { ...record.submission, context: safeContext },
          status: record.status,
          receivedAt: record.receivedAt,
        };
      }),
    };
  }

  flush(): void {
    const file: FeedbackFile = { version: 1, records: this.list() };
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf8');
    renameSync(tmp, this.path);
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const file = JSON.parse(readFileSync(this.path, 'utf8')) as FeedbackFile;
      if (file.version !== 1 || !Array.isArray(file.records)) return;
      for (const record of file.records) {
        if (record?.submission?.id) this.records.set(record.submission.id, record);
      }
    } catch (error) {
      console.error(`feedback: failed to read ${this.path}, starting empty`, error);
    }
  }

  private safeScreenshotId(id: string): boolean {
    return /^[a-zA-Z0-9_-]{1,128}$/.test(id);
  }
}
