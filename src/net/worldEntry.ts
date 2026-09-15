import { sanitizeWorldId } from '../../shared/src/index';

export const WORLD_ENTRY_HANDOFF_KEY = 'pp.managed-world-entry.v1';

export type WorldEntryHandoff = {
  accountId: string;
  worldId: string;
  worldName: string;
  playerName: string;
  sessionToken: string;
  expiresAt: number;
};

/** Read and immediately erase the short-lived credential handed off by My desk. */
export function consumeWorldEntryHandoff(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  worldId: string,
  now = Date.now(),
): WorldEntryHandoff | null {
  const raw = storage.getItem(WORLD_ENTRY_HANDOFF_KEY);
  storage.removeItem(WORLD_ENTRY_HANDOFF_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<WorldEntryHandoff>;
    if (sanitizeWorldId(value.worldId) !== worldId) return null;
    if (typeof value.sessionToken !== 'string' || value.sessionToken.length < 20) return null;
    if (typeof value.expiresAt !== 'number' || value.expiresAt <= now) return null;
    return {
      accountId: typeof value.accountId === 'string' ? value.accountId : '',
      worldId,
      worldName: typeof value.worldName === 'string' ? value.worldName : 'your world',
      playerName: typeof value.playerName === 'string' ? value.playerName : 'Paper Friend',
      sessionToken: value.sessionToken,
      expiresAt: value.expiresAt,
    };
  } catch {
    return null;
  }
}
