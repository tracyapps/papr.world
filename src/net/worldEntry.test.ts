import { describe, expect, it, vi } from 'vitest';
import { consumeWorldEntryHandoff, WORLD_ENTRY_HANDOFF_KEY } from './worldEntry';

const worldId = '25e7894b-3808-489c-9b80-e9ef90cb03c2';

function storageFor(value: unknown) {
  return {
    getItem: vi.fn().mockReturnValue(value === null ? null : JSON.stringify(value)),
    removeItem: vi.fn(),
  };
}

describe('managed world entry handoff', () => {
  it('consumes a matching unexpired token exactly once', () => {
    const storage = storageFor({
      accountId: 'account-1', worldId, worldName: 'Moss garden', playerName: 'Fern',
      sessionToken: 'a-valid-looking-session-token', expiresAt: 2_000,
    });
    expect(consumeWorldEntryHandoff(storage, worldId, 1_000)).toMatchObject({
      accountId: 'account-1', worldId, worldName: 'Moss garden', playerName: 'Fern',
    });
    expect(storage.removeItem).toHaveBeenCalledWith(WORLD_ENTRY_HANDOFF_KEY);
  });

  it('rejects expired or cross-world credentials and still erases them', () => {
    const expired = storageFor({ worldId, sessionToken: 'a-valid-looking-session-token', expiresAt: 1 });
    expect(consumeWorldEntryHandoff(expired, worldId, 2)).toBeNull();
    expect(expired.removeItem).toHaveBeenCalledOnce();

    const wrongWorld = storageFor({
      worldId, sessionToken: 'a-valid-looking-session-token', expiresAt: 2_000,
    });
    expect(consumeWorldEntryHandoff(
      wrongWorld,
      '12cc258a-e7e8-4986-95eb-925d20c43d32',
      1_000,
    )).toBeNull();
  });
});

describe('resuming a world entry without the desk handoff', () => {
  const token = 'a-fresh-clerk-session-token';
  const me = {
    claimed: true,
    account: { id: 'account-1', displayName: 'Fern' },
    worlds: [{ id: worldId, name: 'Moss garden', capabilities: ['enter'] }],
  };
  const fetcherFor = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('rebuilds the entry from the account with a fresh token', async () => {
    const { resumeWorldEntry } = await import('./worldEntry');
    const fetcher = fetcherFor(me);
    const entry = await resumeWorldEntry(worldId, 'https://rooms.test', async () => token, fetcher, 1_000);
    expect(entry).toMatchObject({
      accountId: 'account-1', worldName: 'Moss garden', playerName: 'Fern', sessionToken: token,
    });
    expect(fetcher).toHaveBeenCalledWith('https://rooms.test/account/me', {
      headers: { authorization: `Bearer ${token}` },
    });
  });

  it('gives up quietly when signed out or not allowed in', async () => {
    const { resumeWorldEntry } = await import('./worldEntry');
    expect(await resumeWorldEntry(worldId, 'https://rooms.test', async () => null, fetcherFor(me))).toBeNull();
    const elsewhere = { ...me, worlds: [{ id: 'another', name: 'x', capabilities: ['enter'] }] };
    expect(await resumeWorldEntry(worldId, 'https://rooms.test', async () => token, fetcherFor(elsewhere))).toBeNull();
    expect(await resumeWorldEntry(worldId, 'https://rooms.test', async () => token, fetcherFor({}, 401))).toBeNull();
  });
});
