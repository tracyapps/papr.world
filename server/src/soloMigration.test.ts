import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { SoloMigrationStore } from './soloMigration';
import type { SoloMigrationReceipt } from '../../shared/src/index';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function newStoreDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'papr-solo-migration-'));
  dirs.push(dir);
  return dir;
}

const receipt: SoloMigrationReceipt = {
  at: 1_700_000_000_000,
  chips: 12,
  resources: { 'kraft-twigs': 4 },
  tools: { 'okayish-shovel': 1 },
  items: {},
  plans: ['kids-scissors'],
};

describe('SoloMigrationStore', () => {
  it('has no receipt for an account that has never imported', () => {
    const store = new SoloMigrationStore(newStoreDir());
    expect(store.receiptFor('account-1')).toBeNull();
  });

  it('reserves exactly once and refuses to reserve again for the same account', () => {
    const store = new SoloMigrationStore(newStoreDir());
    const first = store.reserveOnce('account-1', receipt);
    expect(first.reserved).toBe(true);
    expect(first.receipt).toEqual(receipt);
    expect(store.receiptFor('account-1')).toEqual(receipt);

    const laterAttempt: SoloMigrationReceipt = { ...receipt, chips: 999, at: 1_800_000_000_000 };
    const second = store.reserveOnce('account-1', laterAttempt);
    expect(second.reserved).toBe(false);
    // The FIRST receipt wins — a second attempt can never overwrite or
    // re-credit, which is the entire point of this store.
    expect(second.receipt).toEqual(receipt);
    expect(store.receiptFor('account-1')).toEqual(receipt);
  });

  it('keeps different accounts independent', () => {
    const store = new SoloMigrationStore(newStoreDir());
    store.reserveOnce('account-1', receipt);
    expect(store.receiptFor('account-2')).toBeNull();
    const forTwo = store.reserveOnce('account-2', { ...receipt, chips: 3 });
    expect(forTwo.reserved).toBe(true);
    expect(store.receiptFor('account-1')?.chips).toBe(12);
    expect(store.receiptFor('account-2')?.chips).toBe(3);
  });

  it('persists to disk and reloads on a fresh instance', () => {
    const dir = newStoreDir();
    const store = new SoloMigrationStore(dir);
    store.reserveOnce('account-1', receipt);

    const onDisk = JSON.parse(readFileSync(join(dir, 'solo-migrations.json'), 'utf8'));
    expect(onDisk.migrations['account-1']).toEqual(receipt);

    const reloaded = new SoloMigrationStore(dir);
    expect(reloaded.receiptFor('account-1')).toEqual(receipt);
  });

  it('returns independent copies so a caller cannot mutate stored state', () => {
    const store = new SoloMigrationStore(newStoreDir());
    store.reserveOnce('account-1', receipt);
    const copy = store.receiptFor('account-1');
    copy!.resources['kraft-twigs'] = 999;
    expect(store.receiptFor('account-1')?.resources['kraft-twigs']).toBe(4);
  });
});
