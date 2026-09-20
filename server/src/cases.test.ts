import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIMITS, type AccountInventory } from '../../shared/src/index';
import { applyRemove, applySet, applyShow, applyStock, applyTake, newCaseRecord, sanitizeCaseRecord } from './cases';
import { MailStore } from './mail';

const MIN = 60_000;
const NOW = 2_000_000_000_000;

function pouch(partial: Partial<AccountInventory> = {}): AccountInventory {
  return { revision: 1, chips: 0, resources: {}, tools: {}, items: {}, ...partial };
}

function freeCase(owner = 'ada') {
  const record = newCaseRecord('case-1', owner);
  record.mode = 'free';
  return record;
}

describe('a new case', () => {
  it('starts as an empty show case with one item per visitor per day', () => {
    const record = newCaseRecord('case-1', 'ada');
    expect(record).toMatchObject({ mode: 'show', label: '', items: [], limit: { count: 1, windowMinutes: 1440 } });
  });
});

describe('applySet', () => {
  it('changes the label and limit, and null removes the limit', () => {
    const record = newCaseRecord('case-1', 'ada');
    expect(applySet(record, { id: 'case-1', label: ' Twigs ', limit: { count: 3, windowMinutes: 60 } }).ok).toBe(true);
    expect(record.label).toBe('Twigs');
    expect(record.limit).toEqual({ count: 3, windowMinutes: 60 });
    applySet(record, { id: 'case-1', limit: null });
    expect(record.limit).toBeNull();
    applySet(record, { id: 'case-1', label: 'Twigs' });
    expect(record.limit).toBeNull();
  });

  it('changes mode only while empty', () => {
    const record = freeCase();
    const owner = pouch({ resources: { twig: 5 } });
    applyStock(owner, record, { id: 'case-1', kind: 'resource', itemId: 'twig', quantity: 2 });
    expect(applySet(record, { id: 'case-1', mode: 'show' })).toEqual({ ok: false, outcome: 'not-empty' });
    expect(record.mode).toBe('free');
    applyRemove(owner, record, 0);
    expect(applySet(record, { id: 'case-1', mode: 'show' }).ok).toBe(true);
    expect(record.mode).toBe('show');
  });
});

describe('stocking and unstocking', () => {
  it('moves goods out of the pouch and merges the same item', () => {
    const record = freeCase();
    const owner = pouch({ resources: { twig: 10 } });
    expect(applyStock(owner, record, { id: 'case-1', kind: 'resource', itemId: 'twig', quantity: 4 }).ok).toBe(true);
    expect(applyStock(owner, record, { id: 'case-1', kind: 'resource', itemId: 'twig', quantity: 3 }).ok).toBe(true);
    expect(owner.resources.twig).toBe(3);
    expect(record.items).toEqual([{ kind: 'resource', itemId: 'twig', quantity: 7 }]);
  });

  it('refuses what the pouch does not have, and changes nothing', () => {
    const record = freeCase();
    const owner = pouch({ resources: { twig: 1 } });
    expect(applyStock(owner, record, { id: 'case-1', kind: 'resource', itemId: 'twig', quantity: 2 })).toEqual({ ok: false, outcome: 'no-stock' });
    expect(owner.resources.twig).toBe(1);
    expect(record.items).toEqual([]);
  });

  it('refuses stock in a show case, and a trinket in a free case', () => {
    const show = newCaseRecord('case-1', 'ada');
    expect(applyStock(pouch({ resources: { twig: 1 } }), show, { id: 'case-1', kind: 'resource', itemId: 'twig', quantity: 1 }))
      .toEqual({ ok: false, outcome: 'wrong-mode' });
    expect(applyShow(freeCase(), { id: 'case-1', defId: 'shiny', seed: 1 })).toEqual({ ok: false, outcome: 'wrong-mode' });
  });

  it('is full at the slot limit, but still tops up a stack already there', () => {
    const record = freeCase();
    const owner = pouch({ resources: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`r${i}`, 5])) });
    for (let index = 0; index < LIMITS.caseSlots; index += 1) {
      expect(applyStock(owner, record, { id: 'case-1', kind: 'resource', itemId: `r${index}`, quantity: 1 }).ok).toBe(true);
    }
    expect(applyStock(owner, record, { id: 'case-1', kind: 'resource', itemId: 'r9', quantity: 1 })).toEqual({ ok: false, outcome: 'full' });
    expect(applyStock(owner, record, { id: 'case-1', kind: 'resource', itemId: 'r0', quantity: 1 }).ok).toBe(true);
  });

  it('returns a whole stack to the pouch on remove', () => {
    const record = freeCase();
    const owner = pouch({ resources: { twig: 5 } });
    applyStock(owner, record, { id: 'case-1', kind: 'resource', itemId: 'twig', quantity: 5 });
    expect(owner.resources.twig).toBe(0);
    expect(applyRemove(owner, record, 0).ok).toBe(true);
    expect(owner.resources.twig).toBe(5);
    expect(applyRemove(owner, record, 0)).toEqual({ ok: false, outcome: 'invalid' });
  });

  it('shows a trinket once, and takes it off again', () => {
    const record = newCaseRecord('case-1', 'ada');
    applyShow(record, { id: 'case-1', defId: 'shiny', seed: 3 });
    applyShow(record, { id: 'case-1', defId: 'shiny', seed: 3 });
    expect(record.items).toEqual([{ kind: 'trinket', defId: 'shiny', seed: 3 }]);
    expect(applyRemove(pouch(), record, 0).ok).toBe(true);
    expect(record.items).toEqual([]);
  });
});

describe('taking', () => {
  const sam = { accountId: 'sam', name: 'Sam' };

  function stocked() {
    const record = freeCase();
    applyStock(pouch({ resources: { twig: 10 } }), record, { id: 'case-1', kind: 'resource', itemId: 'twig', quantity: 3 });
    return record;
  }

  it('moves one into the visitor pouch and writes a log line', () => {
    const record = stocked();
    const visitor = pouch();
    const result = applyTake(visitor, record, 0, sam, NOW);
    expect(result).toEqual({ ok: true, taken: { kind: 'resource', itemId: 'twig' } });
    expect(visitor.resources.twig).toBe(1);
    expect(record.items[0]).toMatchObject({ quantity: 2 });
    expect(record.log[0]).toMatchObject({ accountId: 'sam', name: 'Sam', itemId: 'twig', quantity: 1, at: NOW });
  });

  it('stops at the per-visitor limit and says when more opens up', () => {
    const record = stocked();
    const visitor = pouch();
    applyTake(visitor, record, 0, sam, NOW);
    const again = applyTake(visitor, record, 0, sam, NOW + 5 * MIN);
    expect(again).toEqual({ ok: false, outcome: 'limit', resetsAt: NOW + 24 * 60 * MIN });
    expect(visitor.resources.twig).toBe(1);
    expect(applyTake(visitor, record, 0, sam, NOW + 24 * 60 * MIN + 1).ok).toBe(true);
    expect(visitor.resources.twig).toBe(2);
  });

  it('keeps each visitor to their own allowance', () => {
    const record = stocked();
    expect(applyTake(pouch(), record, 0, sam, NOW).ok).toBe(true);
    expect(applyTake(pouch(), record, 0, { accountId: 'kit', name: 'Kit' }, NOW).ok).toBe(true);
  });

  it('honours a raised limit and no limit at all', () => {
    const record = stocked();
    applySet(record, { id: 'case-1', limit: { count: 2, windowMinutes: 60 } });
    const visitor = pouch();
    expect(applyTake(visitor, record, 0, sam, NOW).ok).toBe(true);
    expect(applyTake(visitor, record, 0, sam, NOW + 1).ok).toBe(true);
    expect(applyTake(visitor, record, 0, sam, NOW + 2)).toMatchObject({ ok: false, outcome: 'limit' });
    applySet(record, { id: 'case-1', limit: null });
    expect(applyTake(pouch(), record, 0, { accountId: 'kit', name: 'Kit' }, NOW).ok).toBe(true);
  });

  it('removes an emptied stack', () => {
    const record = freeCase();
    applyStock(pouch({ tools: { mallet: 1 } }), record, { id: 'case-1', kind: 'tool', itemId: 'mallet', quantity: 1 });
    applyTake(pouch(), record, 0, sam, NOW);
    expect(record.items).toEqual([]);
    expect(applyTake(pouch(), record, 0, { accountId: 'kit', name: 'Kit' }, NOW)).toEqual({ ok: false, outcome: 'empty' });
  });

  it('refuses a show case, the owner, and a trinket slot', () => {
    expect(applyTake(pouch(), newCaseRecord('case-1', 'ada'), 0, sam, NOW)).toEqual({ ok: false, outcome: 'wrong-mode' });
    expect(applyTake(pouch(), stocked(), 0, { accountId: 'ada', name: 'Ada' }, NOW)).toEqual({ ok: false, outcome: 'invalid' });
    const shown = newCaseRecord('case-1', 'ada');
    applyShow(shown, { id: 'case-1', defId: 'shiny', seed: 1 });
    expect(applyTake(pouch(), shown, 0, sam, NOW)).toEqual({ ok: false, outcome: 'wrong-mode' });
  });

  it('keeps only the newest log lines', () => {
    const record = freeCase();
    applyStock(pouch({ resources: { twig: 999 } }), record, { id: 'case-1', kind: 'resource', itemId: 'twig', quantity: 999 });
    applySet(record, { id: 'case-1', limit: null });
    for (let index = 0; index < LIMITS.caseLogMax + 10; index += 1) {
      applyTake(pouch(), record, 0, { accountId: `v${index}`, name: `V${index}` }, NOW + index);
    }
    expect(record.log).toHaveLength(LIMITS.caseLogMax);
    expect(record.log[0].name).toBe(`V${LIMITS.caseLogMax + 9}`);
  });
});

describe('reading a record from disk', () => {
  it('keeps a good one and drops the goods that do not belong to its mode', () => {
    const record = sanitizeCaseRecord({
      id: 'case-1', owner: 'ada', mode: 'show', label: 'Hi',
      items: [{ kind: 'resource', itemId: 'twig', quantity: 3 }, { kind: 'trinket', defId: 'shiny', seed: 2 }],
      limit: { count: 2, windowMinutes: 60 }, log: [], takes: { sam: [1, 2, 'x'] },
    });
    expect(record?.items).toEqual([{ kind: 'trinket', defId: 'shiny', seed: 2 }]);
    expect(record?.takes).toEqual({ sam: [1, 2] });
  });

  it('refuses a record with no id or owner, and defaults a missing limit', () => {
    expect(sanitizeCaseRecord({ id: 'case-1' })).toBeNull();
    expect(sanitizeCaseRecord({ owner: 'ada' })).toBeNull();
    expect(sanitizeCaseRecord('nope')).toBeNull();
    expect(sanitizeCaseRecord({ id: 'case-1', owner: 'ada' })?.limit).toEqual({ count: 1, windowMinutes: 1440 });
    expect(sanitizeCaseRecord({ id: 'case-1', owner: 'ada', limit: null })?.limit).toBeNull();
  });
});

describe('the store', () => {
  let directory = '';
  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'pp-cases-')); });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));
  const fresh = () => new MailStore(directory);

  it('stocks from the owner pouch and takes into the visitor pouch, all of it surviving a restart', () => {
    const store = fresh();
    store.createCase('case-1', 'ada');
    store.grant('ada', { kind: 'resource', itemId: 'twig', quantity: 5 });
    expect(store.caseSet('case-1', 'ada', { id: 'case-1', mode: 'free' })?.change.ok).toBe(true);
    expect(store.caseStock('case-1', 'ada', { id: 'case-1', kind: 'resource', itemId: 'twig', quantity: 4 })?.change.ok).toBe(true);
    expect(store.inventory('ada').resources.twig).toBe(1);

    const taken = store.caseTake('case-1', { accountId: 'sam', name: 'Sam' }, 0, NOW);
    expect(taken?.change).toEqual({ ok: true, taken: { kind: 'resource', itemId: 'twig' } });

    const restarted = fresh();
    expect(restarted.inventory('sam').resources.twig).toBe(1);
    expect(restarted.inventory('ada').resources.twig).toBe(1);
    expect(restarted.caseRecord('case-1')).toMatchObject({
      mode: 'free', items: [{ kind: 'resource', itemId: 'twig', quantity: 3 }],
    });
    // The limit survives too: Sam already took today.
    expect(restarted.caseTake('case-1', { accountId: 'sam', name: 'Sam' }, 0, NOW + MIN)?.change).toMatchObject({ ok: false, outcome: 'limit' });
  });

  it('lets only the owner change or stock a case', () => {
    const store = fresh();
    store.createCase('case-1', 'ada');
    store.grant('sam', { kind: 'resource', itemId: 'twig', quantity: 5 });
    expect(store.caseSet('case-1', 'sam', { id: 'case-1', mode: 'free' })?.change).toEqual({ ok: false, outcome: 'not-yours' });
    expect(store.caseStock('case-1', 'sam', { id: 'case-1', kind: 'resource', itemId: 'twig', quantity: 1 })?.change).toMatchObject({ ok: false, outcome: 'not-yours' });
    expect(store.inventory('sam').resources.twig).toBe(5);
  });

  it('writes nothing for a refusal, and nothing exists for a piece that is not a case', () => {
    const store = fresh();
    store.createCase('case-1', 'ada');
    store.inventory('ada');
    const before = readFileSync(join(directory, 'mail.json'), 'utf8');
    store.caseStock('case-1', 'ada', { id: 'case-1', kind: 'resource', itemId: 'twig', quantity: 1 });
    expect(readFileSync(join(directory, 'mail.json'), 'utf8')).toBe(before);
    expect(store.caseTake('nope', { accountId: 'sam', name: 'Sam' }, 0, NOW)).toBeNull();
  });

  it('createCase is idempotent, and tells listeners about pouch changes', () => {
    const store = fresh();
    const first = store.createCase('case-1', 'ada');
    store.caseSet('case-1', 'ada', { id: 'case-1', label: 'Mine' });
    expect(store.createCase('case-1', 'someone-else')).toMatchObject({ owner: first.owner, label: 'Mine' });

    const seen: string[] = [];
    store.subscribeInventory((accountId) => seen.push(accountId));
    store.grant('ada', { kind: 'resource', itemId: 'twig', quantity: 2 });
    store.caseSet('case-1', 'ada', { id: 'case-1', mode: 'free' });
    store.caseStock('case-1', 'ada', { id: 'case-1', kind: 'resource', itemId: 'twig', quantity: 2 });
    expect(seen).toEqual(['ada', 'ada']);
  });
});
