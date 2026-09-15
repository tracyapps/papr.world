import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIMITS } from '../../shared/src/index';
import { MailStore } from './mail';

let directory = '';
const fresh = () => new MailStore(directory);

beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'pp-mail-')); });
afterEach(() => rmSync(directory, { recursive: true, force: true }));

describe('MailStore', () => {
  it('writes a letter through before acknowledging delivery', () => {
    const store = fresh();
    const delivered = store.deliver({
      fromAccountId: 'anna', fromName: 'Anna', toAccountId: 'boris', text: 'Hello!', at: 1_000,
    });

    expect(delivered).toMatchObject({ fromAccountId: 'anna', fromName: 'Anna', kind: 'note', at: 1_000 });
    expect(fresh().list('boris')).toEqual([delivered]);
  });

  it('notifies live listeners only after the letter is readable from disk', () => {
    const store = fresh();
    let observed = '';
    const unsubscribe = store.subscribe((accountId) => {
      observed = `${accountId}:${fresh().list(accountId)[0]?.payload.text}`;
    });

    store.deliver({ fromAccountId: 'anna', fromName: 'Anna', toAccountId: 'boris', text: 'Already safe' });
    unsubscribe();
    store.deliver({ fromAccountId: 'anna', fromName: 'Anna', toAccountId: 'clara', text: 'No listener' });

    expect(observed).toBe('boris:Already safe');
  });

  it('keeps different accounts private and returns defensive copies', () => {
    const store = fresh();
    store.deliver({ fromAccountId: 'anna', fromName: 'Anna', toAccountId: 'boris', text: 'For Boris' });
    store.deliver({ fromAccountId: 'anna', fromName: 'Anna', toAccountId: 'clara', text: 'For Clara' });

    const boris = store.list('boris');
    expect(boris).toHaveLength(1);
    expect(boris[0]?.payload.text).toBe('For Boris');
    expect(store.list('clara')[0]?.payload.text).toBe('For Clara');
    boris[0]!.payload.text = 'changed outside';
    expect(store.list('boris')[0]?.payload.text).toBe('For Boris');
  });

  it('retains only the newest bounded inbox across restart', () => {
    const store = fresh();
    for (let index = 0; index <= LIMITS.mailboxMax; index += 1) {
      store.deliver({
        fromAccountId: 'anna', fromName: 'Anna', toAccountId: 'boris', text: `Letter ${index}`, at: index,
      });
    }

    const reloaded = fresh().list('boris');
    expect(reloaded).toHaveLength(LIMITS.mailboxMax);
    expect(reloaded[0]?.payload.text).toBe(`Letter ${LIMITS.mailboxMax}`);
    expect(reloaded.at(-1)?.payload.text).toBe('Letter 1');
  });

  it('drops malformed saved entries without exposing another inbox', () => {
    writeFileSync(join(directory, 'mail.json'), JSON.stringify({
      version: 1,
      mailboxes: {
        boris: [
          { id: 'valid', fromAccountId: 'anna', fromName: 'Anna', kind: 'note', payload: { text: 'Hi' }, at: 1 },
          { id: 42, fromAccountId: 'anna', fromName: 'Anna', kind: 'note', payload: {}, at: 1 },
        ],
      },
    }));

    expect(fresh().list('boris').map((item) => item.id)).toEqual(['valid']);
    expect(fresh().list('anna')).toEqual([]);
  });

  it('starts empty instead of throwing when the file is corrupt', () => {
    writeFileSync(join(directory, 'mail.json'), '{ definitely not json');
    expect(() => fresh()).not.toThrow();
    expect(fresh().list('boris')).toEqual([]);
  });

  it('persists a versioned object rather than secrets or sender credentials', () => {
    fresh().deliver({ fromAccountId: 'anna', fromName: 'Anna', toAccountId: 'boris', text: 'Hello' });
    const raw = readFileSync(join(directory, 'mail.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.version).toBe(2);
    expect(raw).not.toContain('secret');
  });

  it('creates an empty server-owned inventory without accepting a client balance', () => {
    const inventory = fresh().inventory('anna');
    expect(inventory).toMatchObject({
      revision: 1,
      chips: 0,
      resources: {},
    });
    inventory.resources['buttonbloom-seeds'] = 999;
    expect(fresh().inventory('anna').resources['buttonbloom-seeds']).toBeUndefined();
  });

  it('atomically spends a sender parcel and credits it exactly once on claim', () => {
    const store = fresh();
    store.grant('anna', { kind: 'resource', itemId: 'buttonbloom-seeds', quantity: 2 });
    const sent = store.deliverParcel({
      fromAccountId: 'anna', fromName: 'Anna', toAccountId: 'boris', text: 'Grow these.',
      attachment: { kind: 'resource', itemId: 'buttonbloom-seeds', quantity: 2 }, at: 5,
    });

    expect(sent?.inventory.resources['buttonbloom-seeds']).toBe(0);
    expect(sent?.item.payload).toMatchObject({
      attachmentKind: 'resource', resource: 'buttonbloom-seeds', quantity: 2,
    });
    expect(fresh().inventory('anna').resources['buttonbloom-seeds']).toBe(0);
    expect(fresh().claim('boris', sent!.item.id)?.resources['buttonbloom-seeds']).toBe(2);
    expect(fresh().claim('boris', sent!.item.id)).toBeNull();
    expect(fresh().listClaimed('boris')).toEqual([sent!.item.id]);
  });

  it('refuses a parcel larger than the server balance without creating mail', () => {
    const store = fresh();
    store.grant('anna', { kind: 'resource', itemId: 'buttonbloom-seeds', quantity: 2 });
    expect(store.deliverParcel({
      fromAccountId: 'anna', fromName: 'Anna', toAccountId: 'boris', text: 'Too many.',
      attachment: { kind: 'resource', itemId: 'buttonbloom-seeds', quantity: 3 },
    })).toBeNull();
    expect(store.list('boris')).toEqual([]);
    expect(store.inventory('anna').resources['buttonbloom-seeds']).toBe(2);
  });

  it('migrates the v1 mailbox file and preserves its letters', () => {
    writeFileSync(join(directory, 'mail.json'), JSON.stringify({
      version: 1,
      mailboxes: {
        boris: [{
          id: 'old', fromAccountId: 'anna', fromName: 'Anna', kind: 'note',
          payload: { text: 'Still here' }, at: 1,
        }],
      },
    }));
    const store = fresh();
    expect(store.list('boris')[0]?.id).toBe('old');
    expect(store.inventory('boris').revision).toBe(1);
  });
});
