// Small persistent memory per animal. This is intentionally separate from
// friendship points: affection answers "how close are we?", while conversation
// memory answers "what happened between us?".

import { DIARY_ENTRY_LIMIT, getGameState, updateGameState } from '../sim/state';

/**
 * One thing this critter told the player, kept so it can pick the thread back
 * up later. Distinct from the scrapbook `DiaryEntry` (which is the player's
 * record of the whole world): this is the *animal's* own memory of the
 * conversation, and it is what powers "I mentioned this yesterday — I had
 * another look."
 */
export type ConversationJournalEntry = {
  id: string;
  /** Topic kind: 'materials' | 'harvest' | 'wayfinding' | 'fun' | 'self' | 'trait' | 'tool' | 'next'. */
  kind: string;
  text: string;
  pageId: string;
  at: number;
  /** Set once the critter has added to this thread, so it is only continued once. */
  continued?: boolean;
};

export type ConversationMemory = {
  flags: string[];
  seen: Record<string, number>;
  visits: number;
  /** When the player last spoke with this critter, in epoch ms. */
  lastChatAt?: number;
  /** Newest first; a short list of what this critter has told the player. */
  journal?: ConversationJournalEntry[];
  /** Hashes of recently-used reply lines, so a critter stops reusing them. */
  recentLines?: string[];
};

const JOURNAL_LIMIT = 12;
const RECENT_LINE_LIMIT = 24;
/** A thread is only "yesterday's" once it has had time to become yesterday's. */
export const CONTINUATION_MIN_GAP_MS = 20 * 60 * 1000;

export function getConversationMemory(critterId: string): ConversationMemory {
  const existing = getGameState().player.conversations[critterId];
  if (existing) return existing;
  updateGameState((state) => {
    state.player.conversations[critterId] = { flags: [], seen: {}, visits: 0 };
  });
  return getGameState().player.conversations[critterId];
}

export function beginConversationVisit(critterId: string): ConversationMemory {
  updateGameState((state) => {
    const memory = state.player.conversations[critterId] ??= { flags: [], seen: {}, visits: 0 };
    memory.visits += 1;
  });
  return getConversationMemory(critterId);
}

export function addConversationFlags(critterId: string, flags: string[]) {
  updateGameState((state) => {
    const memory = state.player.conversations[critterId] ??= { flags: [], seen: {}, visits: 0 };
    for (const flag of flags) {
      if (!memory.flags.includes(flag)) memory.flags.push(flag);
    }
  });
}

/**
 * Close out a visit: stamp the time so the next conversation can tell whether
 * a thread is genuinely from an earlier sitting.
 */
export function endConversationVisit(critterId: string, at = Date.now()): void {
  updateGameState((state) => {
    const memory = state.player.conversations[critterId] ??= { flags: [], seen: {}, visits: 0 };
    memory.lastChatAt = at;
  });
}

/** Record something the critter said, for later continuation. Newest first. */
export function recordJournalEntry(entry: {
  id: string;
  critterId: string;
  kind: string;
  text: string;
  pageId: string;
  at?: number;
}): void {
  updateGameState((state) => {
    const memory = state.player.conversations[entry.critterId] ??= { flags: [], seen: {}, visits: 0 };
    const journal = memory.journal ??= [];
    if (journal.some((existing) => existing.id === entry.id)) return;
    journal.unshift({
      id: entry.id,
      kind: entry.kind,
      text: entry.text.slice(0, 400),
      pageId: entry.pageId,
      at: entry.at ?? Date.now(),
    });
    if (journal.length > JOURNAL_LIMIT) journal.length = JOURNAL_LIMIT;
  });
}

/**
 * The thread this critter could pick back up, or null.
 *
 * Only entries from *before this sitting* qualify (a gap of at least
 * `CONTINUATION_MIN_GAP_MS`), and each entry is continued exactly once — so a
 * critter has a fresh "and then today…" for a while, rather than saying it
 * every time you walk past.
 */
export function takeContinuableThread(critterId: string, now = Date.now()): ConversationJournalEntry | null {
  const memory = getConversationMemory(critterId);
  const journal = memory.journal ?? [];
  const candidate = journal.find((entry) => !entry.continued && now - entry.at >= CONTINUATION_MIN_GAP_MS);
  if (!candidate) return null;
  updateGameState((state) => {
    const record = state.player.conversations[critterId];
    const found = record?.journal?.find((entry) => entry.id === candidate.id);
    if (found) found.continued = true;
  });
  return candidate;
}

/** Remember a reply line so it is not reused soon. */
export function noteRecentLine(critterId: string, lineId: string): void {
  updateGameState((state) => {
    const memory = state.player.conversations[critterId] ??= { flags: [], seen: {}, visits: 0 };
    const recent = memory.recentLines ??= [];
    if (recent.includes(lineId)) return;
    recent.unshift(lineId);
    if (recent.length > RECENT_LINE_LIMIT) recent.length = RECENT_LINE_LIMIT;
  });
}

export function isRecentLine(critterId: string, lineId: string): boolean {
  return Boolean(getConversationMemory(critterId).recentLines?.includes(lineId));
}

export function markConversationSeen(critterId: string, key: string): number {
  let previous = 0;
  updateGameState((state) => {
    const memory = state.player.conversations[critterId] ??= { flags: [], seen: {}, visits: 0 };
    previous = memory.seen[key] ?? 0;
    memory.seen[key] = previous + 1;
  });
  return previous;
}

/**
 * Write down one thing a critter has told the player — the scrapbook diary's
 * data shape (roadmap Phase 2.4).
 *
 * `id` is the caller's job to make stable (the conversation-flag key it rode
 * in on is the natural choice), which gives free dedup on the same check
 * `activityLog` uses. Newest first, capped at `DIARY_ENTRY_LIMIT` the same
 * way a save is capped on load, so an unbroken play session cannot grow the
 * save past what normalization will trim it back to anyway.
 */
export function recordDiaryEntry(entry: {
  id: string;
  critterId: string;
  speakerName?: string;
  pageId: string;
  kind: string;
  text: string;
}) {
  updateGameState((state) => {
    if (state.player.diaryEntries.some((existing) => existing.id === entry.id)) return;
    state.player.diaryEntries.unshift({
      id: entry.id,
      critterId: entry.critterId,
      ...(entry.speakerName ? { speakerName: entry.speakerName } : {}),
      pageId: entry.pageId,
      kind: entry.kind,
      text: entry.text,
      recordedAt: Date.now(),
    });
    if (state.player.diaryEntries.length > DIARY_ENTRY_LIMIT) {
      state.player.diaryEntries.length = DIARY_ENTRY_LIMIT;
    }
  });
}
