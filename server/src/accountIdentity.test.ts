import { describe, expect, it, vi } from 'vitest';
import { claimPaperPassport, InvalidPassportError } from './accountIdentity';

const passport = {
  id: '25e7894b-3808-489c-9b80-e9ef90cb03c2',
  secretHash: 'not exposed to the identity database',
  lastName: 'Wren',
  createdAt: 1_700_000_000_000,
  lastSeenAt: 1_700_000_100_000,
};

describe('paper-passport identity claim', () => {
  it('keeps the passport UUID canonical when attaching a Clerk identity', async () => {
    const claimClerkIdentity = vi.fn().mockResolvedValue(undefined);
    const result = await claimPaperPassport(
      { verify: () => true, getForClaim: () => passport },
      { claimClerkIdentity },
      'user_clerk_owner',
      { id: passport.id, secret: 'device-secret-long-enough' },
    );

    expect(result).toEqual({
      id: passport.id,
      displayName: 'Wren',
      createdAt: passport.createdAt,
      lastSeenAt: passport.lastSeenAt,
    });
    expect(claimClerkIdentity).toHaveBeenCalledWith('user_clerk_owner', result);
    expect(JSON.stringify(result)).not.toContain(passport.secretHash);
  });

  it('does not touch Postgres when the device passport is invalid', async () => {
    const claimClerkIdentity = vi.fn().mockResolvedValue(undefined);
    await expect(claimPaperPassport(
      { verify: () => false, getForClaim: () => passport },
      { claimClerkIdentity },
      'user_clerk_owner',
      { id: passport.id, secret: 'wrong-secret' },
    )).rejects.toBeInstanceOf(InvalidPassportError);
    expect(claimClerkIdentity).not.toHaveBeenCalled();
  });
});
