import { describe, expect, it } from 'vitest';
import { LIMITS } from './constants';
import {
  DEFAULT_CASE_LIMIT,
  caseAllowance,
  decodeCaseItems,
  describeCaseLimit,
  encodeCaseItems,
  sanitizeCaseItems,
  sanitizeCaseLabel,
  sanitizeCaseLimit,
  sanitizeCaseSet,
  sanitizeCaseShow,
  sanitizeCaseSlot,
  sanitizeCaseStock,
  type CaseItem,
} from './cases';

const ID = '2b0f4f1e-6f57-4c3f-9a51-0f3c9d2d7a11';
const MIN = 60_000;

describe('case items', () => {
  it('keeps well-formed stacks and trinkets', () => {
    const items: CaseItem[] = [
      { kind: 'resource', itemId: 'twig', quantity: 4 },
      { kind: 'trinket', defId: 'shiny-1', seed: 7 },
    ];
    expect(sanitizeCaseItems(items)).toEqual(items);
  });

  it('drops malformed entries and cuts to the slot limit', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({ kind: 'item', itemId: `thing-${index}`, quantity: 1 }));
    expect(sanitizeCaseItems(many)).toHaveLength(LIMITS.caseSlots);
    expect(sanitizeCaseItems([{ kind: 'resource', itemId: '', quantity: 1 }, null, 4, { kind: 'chips', quantity: 3 }])).toEqual([]);
    expect(sanitizeCaseItems([{ kind: 'item', itemId: 'x', quantity: 0 }])).toEqual([]);
    expect(sanitizeCaseItems([{ kind: 'item', itemId: 'x', quantity: 1.5 }])).toEqual([]);
    expect(sanitizeCaseItems('nope')).toEqual([]);
  });

  it('rejects a trinket whose id is not a plain id', () => {
    expect(sanitizeCaseItems([{ kind: 'trinket', defId: '../../etc', seed: 1 }])).toEqual([]);
    expect(sanitizeCaseItems([{ kind: 'trinket', defId: 'ok.id-1', seed: 'x' }])).toEqual([{ kind: 'trinket', defId: 'ok.id-1', seed: 0 }]);
  });

  it('round-trips through the synced string, and survives garbage', () => {
    const items: CaseItem[] = [{ kind: 'tool', itemId: 'basic-mallet', quantity: 2 }];
    expect(decodeCaseItems(encodeCaseItems(items))).toEqual(items);
    expect(decodeCaseItems('')).toEqual([]);
    expect(decodeCaseItems('{not json')).toEqual([]);
    expect(decodeCaseItems('x'.repeat(5000))).toEqual([]);
  });
});

describe('case intents', () => {
  it('cleans a label', () => {
    expect(sanitizeCaseLabel('  Free   twigs\n for all  ')).toBe('Free twigs for all');
    expect(sanitizeCaseLabel('x'.repeat(200))).toHaveLength(LIMITS.caseLabelMax);
    expect(sanitizeCaseLabel(42)).toBe('');
  });

  it('checks limits against their bounds', () => {
    expect(sanitizeCaseLimit({ count: 2, windowMinutes: 60 })).toEqual({ count: 2, windowMinutes: 60 });
    expect(sanitizeCaseLimit({ count: 0, windowMinutes: 60 })).toBeNull();
    expect(sanitizeCaseLimit({ count: 21, windowMinutes: 60 })).toBeNull();
    expect(sanitizeCaseLimit({ count: 1, windowMinutes: 5 })).toBeNull();
    expect(sanitizeCaseLimit({ count: 1, windowMinutes: 7 * 24 * 60 + 1 })).toBeNull();
    expect(sanitizeCaseLimit({ count: 1.5, windowMinutes: 60 })).toBeNull();
    expect(sanitizeCaseLimit(null)).toBeNull();
  });

  it('reads a set intent, where null removes the limit and absent leaves it', () => {
    expect(sanitizeCaseSet({ id: ID, mode: 'free', label: ' hi ', limit: null }))
      .toEqual({ id: ID, mode: 'free', label: 'hi', limit: null });
    expect(sanitizeCaseSet({ id: ID })).toEqual({ id: ID });
    expect(sanitizeCaseSet({ id: ID, mode: 'priced' })).toBeNull();
    expect(sanitizeCaseSet({ id: ID, limit: { count: 0, windowMinutes: 60 } })).toBeNull();
    expect(sanitizeCaseSet({ id: 'has space' })).toBeNull();
    expect(sanitizeCaseSet(null)).toBeNull();
  });

  it('reads stock, show and slot intents', () => {
    expect(sanitizeCaseStock({ id: ID, kind: 'resource', itemId: 'twig', quantity: 3 }))
      .toEqual({ id: ID, kind: 'resource', itemId: 'twig', quantity: 3 });
    expect(sanitizeCaseStock({ id: ID, kind: 'chips', itemId: 'x', quantity: 3 })).toBeNull();
    expect(sanitizeCaseStock({ id: ID, kind: 'resource', itemId: 'twig', quantity: LIMITS.mailAttachmentMax + 1 })).toBeNull();
    expect(sanitizeCaseShow({ id: ID, defId: 'shiny-1', seed: 3 })).toEqual({ id: ID, defId: 'shiny-1', seed: 3 });
    expect(sanitizeCaseShow({ id: ID, defId: '', seed: 3 })).toBeNull();
    expect(sanitizeCaseSlot({ id: ID, index: 2 })).toEqual({ id: ID, index: 2 });
    expect(sanitizeCaseSlot({ id: ID, index: LIMITS.caseSlots })).toBeNull();
    expect(sanitizeCaseSlot({ id: ID, index: -1 })).toBeNull();
  });
});

describe('the per-visitor limit', () => {
  const now = 1_000_000_000;

  it('is unlimited without a limit', () => {
    expect(caseAllowance(null, [now - 1, now - 2], now)).toEqual({ remaining: null, resetsAt: null });
  });

  it('counts takes inside the window and says when the oldest ages out', () => {
    const limit = { count: 2, windowMinutes: 60 };
    expect(caseAllowance(limit, [], now)).toEqual({ remaining: 2, resetsAt: null });
    const once = caseAllowance(limit, [now - 10 * MIN], now);
    expect(once).toEqual({ remaining: 1, resetsAt: now + 50 * MIN });
    const twice = caseAllowance(limit, [now - 10 * MIN, now - 30 * MIN], now);
    expect(twice).toEqual({ remaining: 0, resetsAt: now + 30 * MIN });
  });

  it('gives allowance back as takes age out', () => {
    const limit = DEFAULT_CASE_LIMIT;
    const day = limit.windowMinutes * MIN;
    expect(caseAllowance(limit, [now - day - 1], now).remaining).toBe(1);
    expect(caseAllowance(limit, [now - day + 1], now).remaining).toBe(0);
  });

  it('never goes negative when the owner lowers the limit', () => {
    expect(caseAllowance({ count: 1, windowMinutes: 60 }, [now - MIN, now - 2 * MIN, now - 3 * MIN], now).remaining).toBe(0);
  });

  it('says the rule in words', () => {
    expect(describeCaseLimit(DEFAULT_CASE_LIMIT)).toBe('1 item per visitor per day');
    expect(describeCaseLimit({ count: 3, windowMinutes: 60 })).toBe('3 items per visitor per hour');
    expect(describeCaseLimit({ count: 2, windowMinutes: 7 * 24 * 60 })).toBe('2 items per visitor per week');
    expect(describeCaseLimit({ count: 1, windowMinutes: 180 })).toBe('1 item per visitor per 3 hours');
    expect(describeCaseLimit({ count: 1, windowMinutes: 45 })).toBe('1 item per visitor per 45 minutes');
    expect(describeCaseLimit(null)).toBe('no limit per visitor');
  });
});
