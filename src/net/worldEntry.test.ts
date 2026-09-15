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
