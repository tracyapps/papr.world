// Small persistent memory per animal. This is intentionally separate from
// friendship points: affection answers "how close are we?", while conversation
// memory answers "what happened between us?".

import { getGameState, updateGameState } from '../sim/state';

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
