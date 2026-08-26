// Safety reports — the contextual "this message" / "this player" primitive.
//
// Kept deliberately separate from protocol/feedback.ts, which is about the
// BUILD: is it broken, is it confusing, what would make it better. A report is
// about a PERSON, and the two have different access, different retention, and
// different people reading them. Mixing them would mean either handing
// moderation evidence to anyone who can triage a bug, or locking bug reports
// behind moderation-grade access. Neither is right, so they never share a
// queue, a file, or an export.
//
// What a report carries and what it does not:
//   · the reported ACCOUNT id, never a session id (sessions evaporate)
//   · the exact message text, snapshotted at report time, so an edit or a
//     disconnect cannot erase the evidence
//   · the reporter's account, so a pattern of bad-faith reporting is visible
//   · the reporter's own words, optional and never required
//
// It does not carry: the reporter's or reported player's position, their
// save, their drawings, or anything else the moderator did not ask about.

import { LIMITS } from './constants';

export const MODERATION_STATUSES = ['new', 'reviewing', 'actioned', 'dismissed'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export type ModerationReport = {
  version: 1;
  id: string;
  /** Which neighborhood it happened in. */
  inviteCode: string;
  /** Account that filed it. */
  reporterAccountId: string;
  /** Account being reported. */
  reportedAccountId: string;
  /** Display name at the time, so the queue is readable months later. */
  reportedName: string;
  /**
   * The exact line, snapshotted here rather than referenced by id. A report
   * whose evidence can disappear is not evidence.
   */
  messageId?: string;
  messageText?: string;
  messageAt?: number;
  /** The reporter's own words. Optional; never required to file. */
  details?: string;
  createdAt: number;
};

export type ModerationRecord = {
  report: ModerationReport;
  status: ModerationStatus;
  /** Private notes. Never shown to the reporter or the reported. */
  notes: { at: number; text: string }[];
  updatedAt: number;
};

/** Strip control characters by code point and clamp. */
function tidy(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return '';
  let out = '';
  for (const character of raw) {
    const point = character.codePointAt(0) ?? 0;
    if (point < 0x20 && point !== 0x0a) continue;
    if (point === 0x7f) continue;
    out += character;
  }
  return out.trim().slice(0, max);
}

export type ReportDraft = {
  inviteCode: string;
  reporterAccountId: string;
  reportedAccountId: string;
  reportedName: string;
  messageId?: string;
  messageText?: string;
  messageAt?: number;
  details?: string;
};

/**
 * Validate a report the server is about to store.
 *
 * Returns null only when the report could not identify anybody — an empty
 * `details` is fine, because requiring somebody to explain themselves before
 * they can report is friction in exactly the wrong place.
 */
export function sanitizeReport(draft: ReportDraft, id: string, now: number): ModerationReport | null {
  const reporterAccountId = tidy(draft.reporterAccountId, 128);
  const reportedAccountId = tidy(draft.reportedAccountId, 128);
  if (!reporterAccountId || !reportedAccountId) return null;
  // Reporting yourself is a mis-click, not a report.
  if (reporterAccountId === reportedAccountId) return null;

  const details = tidy(draft.details, LIMITS.reportDetailsMax);
  const messageText = tidy(draft.messageText, LIMITS.chatMaxLength);
  const messageId = tidy(draft.messageId, 128);

  return {
    version: 1,
    id,
    inviteCode: tidy(draft.inviteCode, 16),
    reporterAccountId,
    reportedAccountId,
    reportedName: tidy(draft.reportedName, LIMITS.nameMaxLength) || 'paper friend',
    ...(messageId ? { messageId } : {}),
    ...(messageText ? { messageText } : {}),
    ...(typeof draft.messageAt === 'number' && Number.isFinite(draft.messageAt)
      ? { messageAt: draft.messageAt }
      : {}),
    ...(details ? { details } : {}),
    createdAt: now,
  };
}

/**
 * The export a moderator can take away.
 *
 * Reporter identity is removed: the queue needs it (to see a pattern), an
 * exported file passed around does not. Private notes go too.
 */
export type RedactedModerationRecord = {
  report: Omit<ModerationReport, 'reporterAccountId'>;
  status: ModerationStatus;
  updatedAt: number;
};

export function redactReport(record: ModerationRecord): RedactedModerationRecord {
  const { reporterAccountId: _dropped, ...report } = record.report;
  return { report, status: record.status, updatedAt: record.updatedAt };
}
