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

type AccountMe = {
  claimed?: boolean;
  account?: { id?: unknown; displayName?: unknown };
  worlds?: Array<{ id?: unknown; name?: unknown; capabilities?: unknown }>;
};

/**
 * No handoff from My desk — a reload, a bookmark, a second tab. If the
 * browser is still signed in, build the same entry from the account itself
 * with a FRESH token, instead of telling the player they were logged out.
 * Returns null (and the caller shows the desk message) when signed out or
 * the account cannot enter this world.
 */
export async function resumeWorldEntry(
  worldId: string,
  httpEndpoint: string,
  getToken: () => Promise<string | null>,
  fetcher: typeof fetch = (input, init) => fetch(input, init),
  now = Date.now(),
): Promise<WorldEntryHandoff | null> {
  const sessionToken = await getToken();
  if (!sessionToken || sessionToken.length < 20) return null;
  try {
    const response = await fetcher(`${httpEndpoint}/account/me`, {
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    if (!response.ok) return null;
    const home = await response.json() as AccountMe;
    if (home.claimed !== true || typeof home.account?.id !== 'string') return null;
    const world = home.worlds?.find((entry) => entry.id === worldId
      && Array.isArray(entry.capabilities)
      && entry.capabilities.includes('enter'));
    if (!world) return null;
    return {
      accountId: home.account.id,
      worldId,
      worldName: typeof world.name === 'string' ? world.name : 'your world',
      playerName: typeof home.account.displayName === 'string' ? home.account.displayName : 'Paper Friend',
      sessionToken,
      expiresAt: now + 45_000,
    };
  } catch {
    return null;
  }
}
