import { describe, expect, it, vi } from 'vitest';
import { authorizeManagedWorldEntry } from './worldAuthorization';

const worldId = '25e7894b-3808-489c-9b80-e9ef90cb03c2';
const clerk = { secretKey: 'secret', jwtKey: '', authorizedParties: ['https://papr.world'] };

describe('managed world authorization', () => {
  it('requires both a verified Clerk identity and enter membership', async () => {
    const verifyToken = vi.fn().mockResolvedValue('user_fern');
    const authorizeWorldEntry = vi.fn().mockResolvedValue({ accountId: 'account-fern' });
    await expect(authorizeManagedWorldEntry(
      { database: { authorizeWorldEntry }, clerk, verifyToken },
      worldId,
      'session-token',
    )).resolves.toBe('account-fern');
    expect(authorizeWorldEntry).toHaveBeenCalledWith('user_fern', worldId);
  });

  it('refuses bad tokens, missing databases, and absent membership', async () => {
    const database = { authorizeWorldEntry: vi.fn().mockResolvedValue(null) };
    await expect(authorizeManagedWorldEntry(
      { database, clerk, verifyToken: vi.fn().mockRejectedValue(new Error('bad token')) },
      worldId,
      'bad-token',
    )).resolves.toBeNull();
    expect(database.authorizeWorldEntry).not.toHaveBeenCalled();

    await expect(authorizeManagedWorldEntry(
      { database, clerk, verifyToken: vi.fn().mockResolvedValue('user_fern') },
      worldId,
      'session-token',
    )).resolves.toBeNull();
    await expect(authorizeManagedWorldEntry(
      { database: null, clerk, verifyToken: vi.fn() },
      worldId,
      'session-token',
    )).resolves.toBeNull();
  });
});
