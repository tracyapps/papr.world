// The moderation queue — safety reports about people.
//
// Structurally a sibling of FeedbackStore, and deliberately NOT the same
// store. alpha-testing.md draws the line: "Product feedback and safety
// reports are different systems. A bug or idea is about the build; reporting
// a player, message, or shared drawing is contextual moderation evidence with
// stricter access and retention."
//
// So this keeps its own file, its own reviewer token, and its own export.
// Nothing here ever appears in the feedback export, and vice versa.

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  LIMITS,
  redactReport,
  sanitizeReport,
  type ModerationRecord,
  type ModerationStatus,
  type ReportDraft,
} from '../../shared/src/index';

type StoreFile = { version: 1; records: ModerationRecord[] };

function writeAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, path);
}

export class ModerationStore {
  private records: ModerationRecord[] = [];
  private path: string;
  /** reporterAccountId -> recent report timestamps. */
  private windows = new Map<string, number[]>();

  constructor(dataDir: string) {
    this.path = join(dataDir, 'moderation.json');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as StoreFile;
      this.records = parsed.records ?? [];
    } catch (err) {
      console.error(`moderation: failed to read ${this.path}, starting empty`, err);
    }
  }

  /**
   * Written through on every change, never debounced.
   *
   * Feedback can afford a debounce; a safety report cannot. If the process
   * dies in the next second, the report has to still be there.
   */
  private save(): void {
    writeAtomic(this.path, JSON.stringify({ version: 1, records: this.records } satisfies StoreFile, null, 2));
  }

  /**
   * Rate limit per reporter. Set high enough that nobody reporting in good
   * faith will ever meet it — the only job here is stopping a script.
   */
  private rateLimited(reporterAccountId: string, now: number): boolean {
    const recent = (this.windows.get(reporterAccountId) ?? [])
      .filter((at) => now - at < LIMITS.reportWindowMs);
    if (recent.length >= LIMITS.reportsPerWindow) {
      this.windows.set(reporterAccountId, recent);
      return true;
    }
    recent.push(now);
    this.windows.set(reporterAccountId, recent);
    return false;
  }

  /** Returns the receipt id, or null if refused. */
  file(draft: ReportDraft, now = Date.now()): string | null {
    if (this.rateLimited(draft.reporterAccountId, now)) return null;

    const report = sanitizeReport(draft, randomUUID(), now);
    if (!report) return null;

    this.records.unshift({ report, status: 'new', notes: [], updatedAt: now });
    this.save();
    return report.id;
  }

  list(): ModerationRecord[] {
    return this.records;
  }

  get(id: string): ModerationRecord | null {
    return this.records.find((record) => record.report.id === id) ?? null;
  }

  /**
   * Change status and/or append a note.
   *
   * The reporter's own words are never edited — a note is appended alongside
   * them. Someone reading this in six months needs to see what was actually
   * said, not a moderator's summary of it.
   */
  review(id: string, change: { status?: ModerationStatus; note?: string }): ModerationRecord | null {
    const record = this.get(id);
    if (!record) return null;
    const now = Date.now();
    if (change.status) record.status = change.status;
    if (change.note?.trim()) record.notes.push({ at: now, text: change.note.trim().slice(0, 2000) });
    record.updatedAt = now;
    this.save();
    return record;
  }

  /** Reporter identity and private notes removed. */
  exportRedacted(): ReturnType<typeof redactReport>[] {
    return this.records.map(redactReport);
  }
}
