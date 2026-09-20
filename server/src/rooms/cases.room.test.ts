// Display cases, end to end: real clients against a real PaperRoom over a real
// socket. The unit tests cover each rule; this proves they are wired to the
// messages, that the synced state carries what visitors need, and that a
// blocked visitor hears exactly what an empty case says.

import { rmSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const dataDir = vi.hoisted(() => {
  const { mkdtempSync: make } = require('node:fs') as typeof import('node:fs');
  const { tmpdir: tmp } = require('node:os') as typeof import('node:os');
  const { join: joinPath } = require('node:path') as typeof import('node:path');
  const dir = make(joinPath(tmp(), 'pp-cases-room-'));
  process.env.PP_DATA_DIR = dir;
  delete process.env.PAPR_OWNER_ACCOUNT;
  return dir;
});

import { Client, type Room } from '@colyseus/sdk';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import {
  ClientMessage,
  DISPLAY_CASE_TEMPLATE,
  LEGACY_INVITE_CODE,
  LIMITS,
  PROTOCOL_VERSION,
  ServerMessage,
  decodeCaseItems,
  type CaseDetail,
  type CaseResult,
} from '../../../shared/src/index';

let server: Server;
let endpoint = '';
let stores: typeof import('../stores');
const rooms: Room[] = [];

type Visitor = {
  room: Room;
  accountId: string;
  results: CaseResult[];
  details: CaseDetail[];
};

async function join(name: string, signedIn = true): Promise<Visitor> {
  const account = signedIn ? stores.accounts.create(name) : null;
  const client = new Client(endpoint);
  const room = await client.joinOrCreate('neighborhood', {
    protocol: PROTOCOL_VERSION,
    name,
    avatar: { preset: 'medium', drawingKey: '', edgeColor: '#3a3226' },
    intent: 'create',
    inviteCode: LEGACY_INVITE_CODE,
    ...(account ? { account } : {}),
  });
  rooms.push(room);
  const visitor: Visitor = { room, accountId: account?.id ?? `guest:${room.sessionId}`, results: [], details: [] };
  room.onMessage(ServerMessage.CaseResult, (m: CaseResult) => visitor.results.push(m));
  room.onMessage(ServerMessage.CaseDetail, (m: CaseDetail) => visitor.details.push(m));
  for (const type of [
    ServerMessage.ChatHistory, ServerMessage.Blocks, ServerMessage.Mailbox, ServerMessage.Inventory,
    ServerMessage.HomePolicy, ServerMessage.Rejected, ServerMessage.MailSent, ServerMessage.PlayerCard,
    ServerMessage.Friends,
  ]) room.onMessage(type, () => {});
  return visitor;
}

async function until(check: () => boolean, what: string, timeoutMs = 4000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

type SyncedCase = { id: string; owner: string; mode: string; label: string; items: string; limitCount: number; limitWindow: number };
type SyncedState = {
  pieces?: Map<string, { id: string; templateKey: string; makerId: string }>;
  cases?: Map<string, SyncedCase>;
};
const synced = (v: Visitor) => v.room.state as SyncedState | undefined;
const caseOf = (v: Visitor, id: string) => synced(v)?.cases?.get(id);
const last = (v: Visitor) => v.results[v.results.length - 1];

/** Ada builds a case where she stands (or at a chosen spot); returns its piece id. */
async function placeCase(owner: Visitor, watcher: Visitor, x = 1, z = 1): Promise<string> {
  const before = new Set(synced(watcher)?.pieces?.keys() ?? []);
  owner.room.send(ClientMessage.PlacePiece, {
    templateKey: DISPLAY_CASE_TEMPLATE, x, z, rotY: 0, page: '0,0', material: '',
  });
  let id = '';
  await until(() => {
    for (const piece of synced(watcher)?.pieces?.values() ?? []) {
      if (!before.has(piece.id) && piece.makerId === owner.accountId) id = piece.id;
    }
    return id !== '' && !!caseOf(watcher, id);
  }, 'the case to arrive');
  return id;
}

const wait = (visitor: Visitor, count: number, what: string) =>
  until(() => visitor.results.length >= count, what);

beforeAll(async () => {
  stores = await import('../stores');
  const { PaperRoom } = await import('./PaperRoom');
  server = new Server({ transport: new WebSocketTransport() });
  server.define('neighborhood', PaperRoom).filterBy(['worldId', 'inviteCode']);
  await server.listen(0);
  const address = (server as unknown as { transport: { server?: { address(): { port: number } } } }).transport.server?.address();
  endpoint = `ws://localhost:${address?.port}`;
}, 20000);

afterEach(async () => {
  const leaving = rooms.splice(0).map((room) => Promise.race([
    room.leave().catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 500)),
  ]));
  await Promise.all(leaving);
  await new Promise((resolve) => setTimeout(resolve, 50));
});

afterAll(async () => {
  await Promise.race([
    server.gracefullyShutdown(false).catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, 2000)),
  ]);
  rmSync(dataDir, { recursive: true, force: true });
}, 10000);

describe('placing a case', () => {
  it('shows every neighbor an empty show case with the default limit', async () => {
    const sam = await join('Sam');
    const ada = await join('Ada');
    const id = await placeCase(ada, sam);
    expect(caseOf(sam, id)).toMatchObject({ owner: ada.accountId, mode: 'show', label: '', items: '[]', limitCount: 1, limitWindow: 1440 });
  });

  it('caps how many cases one account may stand', async () => {
    const sam = await join('Sam');
    const ada = await join('Ada');
    for (let index = 0; index < LIMITS.casesPerPlayer; index += 1) await placeCase(ada, sam, 1 + index * 0.1, 1);
    ada.room.send(ClientMessage.PlacePiece, { templateKey: DISPLAY_CASE_TEMPLATE, x: 3, z: 3, rotY: 0, page: '0,0', material: '' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const mine = [...(synced(sam)?.pieces?.values() ?? [])].filter((p) => p.makerId === ada.accountId);
    expect(mine).toHaveLength(LIMITS.casesPerPlayer);
  });

  it('leaves a guest\'s case a plain decoration', async () => {
    const sam = await join('Sam');
    const guest = await join('Wanderer', false);
    const before = new Set(synced(sam)?.pieces?.keys() ?? []);
    guest.room.send(ClientMessage.PlacePiece, { templateKey: DISPLAY_CASE_TEMPLATE, x: 1, z: 1, rotY: 0, page: '0,0', material: '' });
    await until(() => [...(synced(sam)?.pieces?.keys() ?? [])].some((id) => !before.has(id)), 'the piece');
    expect([...(synced(sam)?.cases?.keys() ?? [])].every((id) => before.has(id) || !!caseOf(sam, id))).toBe(true);
    const fresh = [...(synced(sam)?.pieces?.values() ?? [])].find((p) => !before.has(p.id));
    expect(fresh && caseOf(sam, fresh.id)).toBeFalsy();
  });
});

describe('a show case', () => {
  it('carries a label and trinkets for everyone, and refuses a take', async () => {
    const sam = await join('Sam');
    const ada = await join('Ada');
    const id = await placeCase(ada, sam);
    ada.room.send(ClientMessage.CaseSet, { id, label: 'Things I found' });
    await wait(ada, 1, 'the label');
    ada.room.send(ClientMessage.CaseShow, { id, defId: 'shiny-1', seed: 4 });
    await until(() => caseOf(sam, id)?.label === 'Things I found' && decodeCaseItems(caseOf(sam, id)?.items ?? '').length === 1, 'the show');
    expect(decodeCaseItems(caseOf(sam, id)!.items)).toEqual([{ kind: 'trinket', defId: 'shiny-1', seed: 4 }]);

    sam.room.send(ClientMessage.CaseTake, { id, index: 0 });
    await wait(sam, 1, 'the refusal');
    expect(last(sam)).toMatchObject({ action: 'take', outcome: 'wrong-mode' });
  });

  it('lets only the owner change it', async () => {
    const sam = await join('Sam');
    const ada = await join('Ada');
    const id = await placeCase(ada, sam);
    sam.room.send(ClientMessage.CaseSet, { id, label: 'Sam was here' });
    await wait(sam, 1, 'the refusal');
    expect(last(sam)).toMatchObject({ action: 'set', outcome: 'not-yours' });
    expect(caseOf(ada, id)?.label).toBe('');
  });
});

describe('a free case', () => {
  async function stockedCase(twigs = 3) {
    const sam = await join('Sam');
    const ada = await join('Ada');
    stores.mail.grant(ada.accountId, { kind: 'resource', itemId: 'twig', quantity: 5 });
    const id = await placeCase(ada, sam);
    ada.room.send(ClientMessage.CaseSet, { id, mode: 'free' });
    await wait(ada, 1, 'the mode');
    ada.room.send(ClientMessage.CaseStock, { id, kind: 'resource', itemId: 'twig', quantity: twigs });
    await until(() => decodeCaseItems(caseOf(sam, id)?.items ?? '').length === 1, 'the stock');
    ada.results.length = 0;
    return { sam, ada, id };
  }

  it('moves stock out of the owner\'s pouch and into a visitor\'s, once per allowance', async () => {
    const { sam, ada, id } = await stockedCase();
    expect(stores.mail.inventory(ada.accountId).resources.twig).toBe(2);

    sam.room.send(ClientMessage.CaseTake, { id, index: 0 });
    await wait(sam, 1, 'the take');
    expect(last(sam)).toMatchObject({ action: 'take', outcome: 'ok', taken: { kind: 'resource', itemId: 'twig' } });
    expect(stores.mail.inventory(sam.accountId).resources.twig).toBe(1);
    await until(() => decodeCaseItems(caseOf(ada, id)?.items ?? '')[0]?.kind === 'resource'
      && (decodeCaseItems(caseOf(ada, id)!.items)[0] as { quantity: number }).quantity === 2, 'the case to show two left');

    sam.room.send(ClientMessage.CaseTake, { id, index: 0 });
    await wait(sam, 2, 'the limit');
    expect(last(sam)).toMatchObject({ action: 'take', outcome: 'limit' });
    expect(last(sam).resetsAt).toBeGreaterThan(Date.now());
    expect(stores.mail.inventory(sam.accountId).resources.twig).toBe(1);
    expect(sam.details[sam.details.length - 1]).toMatchObject({ id, remaining: 0 });
  });

  it('tells the owner, and only the owner, who took what', async () => {
    const { sam, ada, id } = await stockedCase();
    sam.room.send(ClientMessage.CaseTake, { id, index: 0 });
    await wait(sam, 1, 'the take');
    ada.room.send(ClientMessage.CaseRequest, { id });
    await until(() => ada.details.some((d) => (d.log?.length ?? 0) > 0), 'the log');
    const log = ada.details.find((d) => (d.log?.length ?? 0) > 0)!.log!;
    expect(log[0]).toMatchObject({ accountId: sam.accountId, name: 'Sam', itemId: 'twig', quantity: 1 });
    expect(sam.details.every((d) => d.log === undefined)).toBe(true);
  });

  it('answers a blocked visitor exactly as an empty case would, and gives them nothing', async () => {
    const { sam, ada, id } = await stockedCase();
    stores.blocks.add(ada.accountId, sam.accountId);
    sam.room.send(ClientMessage.CaseTake, { id, index: 0 });
    await wait(sam, 1, 'the answer');
    expect(last(sam)).toMatchObject({ action: 'take', outcome: 'empty' });
    expect(stores.mail.inventory(sam.accountId).resources.twig ?? 0).toBe(0);
    sam.room.send(ClientMessage.CaseRequest, { id });
    await until(() => sam.details.length > 0, 'the detail');
    expect(sam.details[sam.details.length - 1]).toMatchObject({ remaining: 0, resetsAt: null });
  });

  it('gives a guest a look but no pouch to take into', async () => {
    const { ada, id } = await stockedCase();
    const guest = await join('Wanderer', false);
    guest.room.send(ClientMessage.CaseTake, { id, index: 0 });
    await wait(guest, 1, 'the answer');
    expect(last(guest)).toMatchObject({ outcome: 'guest' });
    expect(stores.mail.inventory(ada.accountId).resources.twig).toBe(2);
  });

  it('refuses a take from too far away', async () => {
    const sam = await join('Sam');
    const ada = await join('Ada');
    stores.mail.grant(ada.accountId, { kind: 'resource', itemId: 'twig', quantity: 2 });
    const id = await placeCase(ada, sam, 30, 30);
    ada.room.send(ClientMessage.CaseSet, { id, mode: 'free' });
    sam.room.send(ClientMessage.CaseTake, { id, index: 0 });
    await wait(sam, 1, 'the answer');
    expect(last(sam)).toMatchObject({ outcome: 'too-far' });
  });

  it('returns a stack to the owner on remove, and refuses a mode change while stocked', async () => {
    const { ada, id } = await stockedCase();
    ada.room.send(ClientMessage.CaseSet, { id, mode: 'show' });
    await wait(ada, 1, 'the refusal');
    expect(last(ada)).toMatchObject({ action: 'set', outcome: 'not-empty' });
    ada.room.send(ClientMessage.CaseRemove, { id, index: 0 });
    await until(() => decodeCaseItems(caseOf(ada, id)?.items ?? 'x').length === 0, 'the empty case');
    expect(stores.mail.inventory(ada.accountId).resources.twig).toBe(5);
  });

  it('ignores a message that is not shaped like one', async () => {
    const { sam, id } = await stockedCase();
    sam.room.send(ClientMessage.CaseTake, { id, index: 'zero' });
    sam.room.send(ClientMessage.CaseTake, null);
    sam.room.send(ClientMessage.CaseSet, { id: 'no such piece', label: 'x' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(sam.results).toEqual([]);
    expect(stores.mail.inventory(sam.accountId).resources.twig ?? 0).toBe(0);
  });
});
