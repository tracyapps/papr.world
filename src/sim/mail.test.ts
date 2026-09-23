import { afterEach, describe, expect, it } from 'vitest';
import { LIMITS, type MailItem } from '../../shared/src/index';
import { applyGameCommand } from './commands';
import { createWelcomeMail, deliverMail, hasReadyUnclaimedMail, mailAttachment, mergeMailSnapshot } from './mail';

describe('physical mailbox arrival', () => {
  it('raises its message signal only when an unclaimed delayed parcel arrives', () => {
    const parcel = mail({ id: 'order', payload: { subject: 'Lumber', arrivesAt: 5_000 } });
    expect(hasReadyUnclaimedMail([parcel], [], 4_999)).toBe(false);
    expect(hasReadyUnclaimedMail([parcel], [], 5_000)).toBe(true);
    expect(hasReadyUnclaimedMail([parcel], ['order'], 5_000)).toBe(false);
  });
});
import {
  SAVE_STORAGE_KEY,
  createDefaultGameState,
  initializeGameState,
  setGameStateForTests,
} from './state';

afterEach(() => setGameStateForTests(null));

function mail(overrides: Partial<MailItem> = {}): MailItem {
  return {
    id: 'mail-1',
    fromAccountId: 'world',
    fromName: 'Pip',
    kind: 'gift',
    payload: {
      subject: 'A parcel',
      text: 'For you.',
      attachmentKind: 'resource',
      resource: 'kraft-twigs',
      quantity: 2,
    },
    at: 1_000,
    ...overrides,
  };
}

function storageFor(value: unknown) {
  return {
    value: JSON.stringify(value),
    getItem(key: string) { return key === SAVE_STORAGE_KEY ? this.value : null; },
    setItem(_key: string, value: string) { this.value = value; },
  };
}

describe('mailbox persistence', () => {
  it('starts a fresh player with a welcome parcel from Pip', () => {
    const welcome = createDefaultGameState().player.mailbox;

    expect(welcome).toHaveLength(1);
    expect(welcome[0]?.fromName).toBe('Pip');
    expect(mailAttachment(welcome[0]!)).toMatchObject({
      kind: 'resource', resource: 'buttonbloom-seeds', quantity: 1,
    });
  });

  it('adds the welcome parcel when loading a save from before mail existed', () => {
    const oldState = createDefaultGameState();
    delete (oldState.player as unknown as Record<string, unknown>).mailbox;
    delete (oldState.player as unknown as Record<string, unknown>).claimedMailIds;

    const loaded = initializeGameState(storageFor(oldState));

    expect(loaded.player.mailbox[0]?.id).toBe(createWelcomeMail(0).id);
    expect(loaded.player.claimedMailIds).toEqual([]);
  });

  it('drops malformed mail and keeps only safe primitive payload fields', () => {
    const saved = createDefaultGameState();
    (saved.player as unknown as { mailbox: unknown[] }).mailbox = [
      mail({ payload: { text: 'hello', quantity: 2, nested: 3 } }),
      { ...mail(), id: 42 },
      { ...mail(), at: 'yesterday' },
      'not mail',
    ];
    const loaded = initializeGameState(storageFor(saved));

    expect(loaded.player.mailbox).toHaveLength(1);
    expect(loaded.player.mailbox[0]?.payload).toEqual({ text: 'hello', quantity: 2, nested: 3 });
  });

  it('deduplicates delivery and caps the newest mail at the protocol limit', () => {
    const state = createDefaultGameState();
    state.player.mailbox = [];
    state.player.claimedMailIds = ['mail-0'];
    for (let index = 0; index <= LIMITS.mailboxMax; index += 1) {
      deliverMail(state, mail({ id: `mail-${index}`, at: index }));
    }

    expect(state.player.mailbox).toHaveLength(LIMITS.mailboxMax);
    expect(state.player.mailbox[0]?.id).toBe(`mail-${LIMITS.mailboxMax}`);
    expect(state.player.mailbox.at(-1)?.id).toBe('mail-1');
    expect(state.player.claimedMailIds).toEqual([]);
    expect(deliverMail(state, mail({ id: 'mail-1' }))).toBe(false);
  });
});

describe('mail attachments', () => {
  it('collects a resource parcel exactly once while retaining its letter', () => {
    const state = createDefaultGameState();
    state.player.mailbox = [mail()];
    state.player.claimedMailIds = [];
    const before = state.player.inventory['kraft-twigs'] ?? 0;

    expect(applyGameCommand(state, { type: 'collectMail', mailId: 'mail-1' }).ok).toBe(true);
    expect(state.player.inventory['kraft-twigs']).toBe(before + 2);
    expect(state.player.mailbox).toHaveLength(1);
    expect(state.player.claimedMailIds).toEqual(['mail-1']);

    expect(applyGameCommand(state, { type: 'collectMail', mailId: 'mail-1' }).ok).toBe(false);
    expect(state.player.inventory['kraft-twigs']).toBe(before + 2);
  });

  it('collects chips, tools, and general finished items into their proper bags', () => {
    const cases: Array<[MailItem, () => number]> = [
      [mail({ id: 'chips', payload: { attachmentKind: 'chips', quantity: 3 } }), () => state.player.chips],
      [mail({ id: 'tool', payload: { attachmentKind: 'tool', toolId: 'kids-scissors', quantity: 1 } }), () => state.player.tools['kids-scissors'] ?? 0],
      [mail({ id: 'item', payload: { attachmentKind: 'item', itemId: 'paper-star', label: 'paper star', quantity: 2 } }), () => state.player.items['paper-star'] ?? 0],
    ];
    const state = createDefaultGameState();
    state.player.mailbox = cases.map(([entry]) => entry);
    state.player.claimedMailIds = [];

    for (const [entry, count] of cases) {
      const before = count();
      expect(applyGameCommand(state, { type: 'collectMail', mailId: entry.id }).ok).toBe(true);
      expect(count()).toBeGreaterThan(before);
    }
  });

  it('refuses unknown or malformed attachments without marking them collected', () => {
    const state = createDefaultGameState();
    state.player.mailbox = [mail({ payload: { attachmentKind: 'resource', resource: 'not-real', quantity: 10 } })];
    state.player.claimedMailIds = [];

    expect(applyGameCommand(state, { type: 'collectMail', mailId: 'mail-1' }).ok).toBe(false);
    expect(state.player.claimedMailIds).toEqual([]);
  });
});

describe('network mailbox merge', () => {
  it('preserves authoritative newest-first order, deduplicates, and rejects malformed entries', () => {
    const state = createDefaultGameState();
    const welcomeId = state.player.mailbox[0]!.id;
    const newest = mail({ id: 'newest', at: 3 });
    const older = mail({ id: 'older', at: 2 });

    expect(mergeMailSnapshot(state, [newest, older, { id: 42 }])).toBe(2);
    expect(state.player.mailbox.map((item) => item.id)).toEqual(['newest', 'older', welcomeId]);
    expect(mergeMailSnapshot(state, [newest, older])).toBe(0);
  });
});
