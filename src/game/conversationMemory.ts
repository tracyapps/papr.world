// Small persistent memory per animal. This is intentionally separate from
// friendship points: affection answers "how close are we?", while conversation
// memory answers "what happened between us?".

import { DIARY_ENTRY_LIMIT, getGameState, updateGameState } from '../sim/state';

export type ConversationMemory = {
  flags: string[];
  seen: Record<string, number>;
  visits: number;
};

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
  pageId: string;
  kind: string;
  text: string;
}) {
  updateGameState((state) => {
    if (state.player.diaryEntries.some((existing) => existing.id === entry.id)) return;
    state.player.diaryEntries.unshift({
      id: entry.id,
      critterId: entry.critterId,
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
