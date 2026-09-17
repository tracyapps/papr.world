import { describe, expect, it, vi } from 'vitest';
import {
  accountCarrySnapshot,
  claimPaperPassport,
  importSoloSaveIntoAccount,
  InvalidPassportError,
} from './accountIdentity';
import type { SoloMigrationReceipt } from '../../shared/src/index';

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

describe('account desk carry snapshot', () => {
  it('reads only the authenticated account key from the durable stores', () => {
    const inventory = vi.fn().mockReturnValue({ revision: 2, chips: 4, resources: {}, tools: {}, items: {} });
    const list = vi.fn().mockReturnValue([{ id: 'letter-1' }]);
    const listClaimed = vi.fn().mockReturnValue(['letter-1']);
    const receiptFor = vi.fn().mockReturnValue(null);
    const techFor = vi.fn().mockReturnValue({ revision: 1, plans: ['kids-scissors'] });

    expect(accountCarrySnapshot(
      { inventory, list, listClaimed },
      { receiptFor },
      { techFor },
      passport.id,
    )).toEqual({
      inventory: { revision: 2, chips: 4, resources: {}, tools: {}, items: {} },
      tech: { revision: 1, plans: ['kids-scissors'] },
      mailbox: [{ id: 'letter-1' }],
      claimedMailIds: ['letter-1'],
      soloMigration: null,
    });
    expect(inventory).toHaveBeenCalledWith(passport.id);
    expect(techFor).toHaveBeenCalledWith(passport.id);
    expect(list).toHaveBeenCalledWith(passport.id);
    expect(listClaimed).toHaveBeenCalledWith(passport.id);
    expect(receiptFor).toHaveBeenCalledWith(passport.id);
  });
});

describe('solo-save import', () => {
  const snapshot = {
    chips: 5,
    resources: { 'kraft-twigs': 3 },
    tools: { 'okayish-shovel': 1 },
    items: {},
    plans: ['kids-scissors'],
  };

  it('credits the pouch and the tech record once it reserves the migration', () => {
    const reservedReceipt: SoloMigrationReceipt = { ...snapshot, at: 1_000 };
    const reserveOnce = vi.fn().mockReturnValue({ receipt: reservedReceipt, reserved: true });
    const grant = vi.fn();
    const inventory = vi.fn().mockReturnValue({ revision: 3, chips: 5, resources: { 'kraft-twigs': 3 }, tools: { 'okayish-shovel': 1 }, items: {} });
    const grantPlans = vi.fn().mockReturnValue({ revision: 2, plans: ['kids-scissors'] });
    const techFor = vi.fn().mockReturnValue({ revision: 2, plans: ['kids-scissors'] });

    const result = importSoloSaveIntoAccount(
      { migrations: { reserveOnce }, mail: { grant, inventory }, tech: { grantPlans, techFor } },
      passport.id,
      snapshot,
      1_000,
    );

    expect(reserveOnce).toHaveBeenCalledWith(passport.id, { ...snapshot, at: 1_000 });
    expect(grant).toHaveBeenCalledWith(passport.id, { kind: 'chips', quantity: 5 });
    expect(grant).toHaveBeenCalledWith(passport.id, { kind: 'resource', itemId: 'kraft-twigs', quantity: 3 });
    expect(grant).toHaveBeenCalledWith(passport.id, { kind: 'tool', itemId: 'okayish-shovel', quantity: 1 });
    expect(grant).toHaveBeenCalledTimes(3);
    expect(grantPlans).toHaveBeenCalledWith(passport.id, ['kids-scissors']);
    expect(result.alreadyMigrated).toBe(false);
    expect(result.receipt).toEqual(reservedReceipt);
    expect(result.tech).toEqual({ revision: 2, plans: ['kids-scissors'] });
  });

  it('never credits twice — a second reservation attempt grants nothing, plans included', () => {
    const earlierReceipt: SoloMigrationReceipt = { ...snapshot, chips: 999, at: 500 };
    const reserveOnce = vi.fn().mockReturnValue({ receipt: earlierReceipt, reserved: false });
    const grant = vi.fn();
    const inventory = vi.fn().mockReturnValue({ revision: 1, chips: 999, resources: {}, tools: {}, items: {} });
    const grantPlans = vi.fn();
    const techFor = vi.fn().mockReturnValue({ revision: 1, plans: [] });

    const result = importSoloSaveIntoAccount(
      { migrations: { reserveOnce }, mail: { grant, inventory }, tech: { grantPlans, techFor } },
      passport.id,
      snapshot,
      2_000,
    );

    expect(grant).not.toHaveBeenCalled();
    expect(grantPlans).not.toHaveBeenCalled();
    expect(result.alreadyMigrated).toBe(true);
    expect(result.receipt).toEqual(earlierReceipt);
    expect(result.tech).toEqual({ revision: 1, plans: [] });
  });

  it('skips granting a bag with nothing in it, but always returns the pouch and tech record', () => {
    const emptyReceipt: SoloMigrationReceipt = {
      chips: 0, resources: {}, tools: {}, items: {}, plans: [], at: 42,
    };
    const reserveOnce = vi.fn().mockReturnValue({ receipt: emptyReceipt, reserved: true });
    const grant = vi.fn();
    const inventory = vi.fn().mockReturnValue({ revision: 1, chips: 0, resources: {}, tools: {}, items: {} });
    const grantPlans = vi.fn();
    const techFor = vi.fn().mockReturnValue({ revision: 1, plans: [] });

    const result = importSoloSaveIntoAccount(
      { migrations: { reserveOnce }, mail: { grant, inventory }, tech: { grantPlans, techFor } },
      passport.id,
      { chips: 0, resources: {}, tools: {}, items: {}, plans: [] },
      42,
    );

    expect(grant).not.toHaveBeenCalled();
    expect(grantPlans).not.toHaveBeenCalled();
    expect(inventory).toHaveBeenCalledWith(passport.id);
    expect(result.inventory).toEqual({ revision: 1, chips: 0, resources: {}, tools: {}, items: {} });
    expect(result.tech).toEqual({ revision: 1, plans: [] });
  });
});
