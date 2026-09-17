import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { AccountTechStore } from './accountTech';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function newStoreDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'papr-account-tech-'));
  dirs.push(dir);
  return dir;
}

describe('AccountTechStore', () => {
  it('starts every account with an empty record on first read', () => {
    const store = new AccountTechStore(newStoreDir());
    expect(store.techFor('account-1')).toEqual({ revision: 1, plans: [] });
  });

  it('grants plan ids as a union, deduped in first-seen order', () => {
    const store = new AccountTechStore(newStoreDir());
    store.grantPlans('account-1', ['kids-scissors', 'okayish-shovel']);
    // The record was created at revision 1 and each growing grant bumps it
    // once, so the second grant returns revision 3.
    const granted = store.grantPlans('account-1', ['okayish-shovel', 'sturdy-scissors']);
    expect(granted).toEqual({
      revision: 3,
      plans: ['kids-scissors', 'okayish-shovel', 'sturdy-scissors'],
    });
  });

  it('leaves the record untouched when a grant adds nothing new', () => {
    const store = new AccountTechStore(newStoreDir());
    store.grantPlans('account-1', ['kids-scissors']);
    // The first grant moved revision 1 → 2; replaying the same grant must
    // not move it again, so an accidental double-credit is invisible.
    const replayed = store.grantPlans('account-1', ['kids-scissors']);
    expect(replayed).toEqual({ revision: 2, plans: ['kids-scissors'] });
    expect(store.techFor('account-1').revision).toBe(2);
  });

  it('drops invalid ids and bounds the record to accountPlansMax', () => {
    const store = new AccountTechStore(newStoreDir());
    const many = Array.from({ length: 600 }, (_, index) => `plan-${index}`);
    const granted = store.grantPlans('account-1', [...many, '', 'x'.repeat(129), 7 as unknown as string]);
    expect(granted.plans).toHaveLength(500);
    expect(granted.plans[0]).toBe('plan-0');
    expect(granted.plans[499]).toBe('plan-499');
  });

  it('keeps different accounts independent', () => {
    const store = new AccountTechStore(newStoreDir());
    store.grantPlans('account-1', ['kids-scissors']);
    expect(store.techFor('account-2')).toEqual({ revision: 1, plans: [] });
    expect(store.techFor('account-1').plans).toEqual(['kids-scissors']);
  });

  it('persists to disk and reloads on a fresh instance', () => {
    const dir = newStoreDir();
    const store = new AccountTechStore(dir);
    store.grantPlans('account-1', ['kids-scissors', 'okayish-shovel']);

    const onDisk = JSON.parse(readFileSync(join(dir, 'account-tech.json'), 'utf8'));
    expect(onDisk.tech['account-1']).toEqual({
      revision: 2,
      plans: ['kids-scissors', 'okayish-shovel'],
    });

    const reloaded = new AccountTechStore(dir);
    expect(reloaded.techFor('account-1')).toEqual({
      revision: 2,
      plans: ['kids-scissors', 'okayish-shovel'],
    });
  });

  it('drops malformed per-account records on load rather than refusing to start', () => {
    const dir = newStoreDir();
    const store = new AccountTechStore(dir);
    store.grantPlans('account-good', ['kids-scissors']);
    writeFileSync(
      join(dir, 'account-tech.json'),
      JSON.stringify({
        version: 1,
        tech: {
          'account-good': { revision: 2, plans: ['kids-scissors'] },
          'account-bad-shape': { revision: 0, plans: [] },
          'account-bad-plans': { revision: 2, plans: 'nope' },
        },
      }),
      'utf8',
    );

    const reloaded = new AccountTechStore(dir);
    expect(reloaded.techFor('account-good').plans).toEqual(['kids-scissors']);
    expect(reloaded.techFor('account-bad-shape')).toEqual({ revision: 1, plans: [] });
    expect(reloaded.techFor('account-bad-plans')).toEqual({ revision: 1, plans: [] });
  });

  it('returns independent copies so a caller cannot mutate stored state', () => {
    const store = new AccountTechStore(newStoreDir());
    store.grantPlans('account-1', ['kids-scissors']);
    const copy = store.techFor('account-1');
    copy.plans.push('smuggled-plan');
    expect(store.techFor('account-1').plans).toEqual(['kids-scissors']);
  });
});
