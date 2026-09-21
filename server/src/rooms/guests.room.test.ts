// Guests, end to end: two or three real clients against a real PaperRoom over a
// real socket. The unit tests cover each rule; this proves they are wired to
// the messages, that the synced state carries what neighbors need, and that a
// blocked person is treated exactly like a stranger at a closed door.

import { rmSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const dataDir = vi.hoisted(() => {
  const { mkdtempSync: make } = require('node:fs') as typeof import('node:fs');
  const { tmpdir: tmp } = require('node:os') as typeof import('node:os');
  const { join: joinPath } = require('node:path') as typeof import('node:path');
  const dir = make(joinPath(tmp(), 'pp-guests-room-'));
  process.env.PP_DATA_DIR = dir;
  delete process.env.PAPR_OWNER_ACCOUNT;
  return dir;
});

import { Client, type Room } from '@colyseus/sdk';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import {
  ClientMessage,
  INTERIOR_SPACE,
  LEGACY_INVITE_CODE,
  PROTOCOL_VERSION,
  ServerMessage,
  type EntryResult,
  type FriendNotice,
  type FriendsSnapshot,
  type HomeExit,
  type KnockNotice,
  type PlayerCardInfo,
} from '../../../shared/src/index';

let server: Server;
let endpoint = '';
let stores: typeof import('../stores');
const rooms: Room[] = [];

type Guest = {
  room: Room;
  accountId: string;
  entries: EntryResult[];
  knocks: KnockNotice[];
  cleared: string[];
  notices: FriendNotice[];
  friends: FriendsSnapshot | null;
  exits: HomeExit[];
  chat: string[];
  cards: PlayerCardInfo[];
};

async function join(name: string, signedIn = true): Promise<Guest> {
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
  const guest: Guest = {
    room, accountId: account?.id ?? `guest:${room.sessionId}`,
    entries: [], knocks: [], cleared: [], notices: [], friends: null, exits: [], chat: [], cards: [],
  };
  room.onMessage(ServerMessage.EntryResult, (m: EntryResult) => guest.entries.push(m));
  room.onMessage(ServerMessage.KnockNotice, (m: KnockNotice) => guest.knocks.push(m));
  room.onMessage(ServerMessage.KnockCleared, (m: { visitor: string }) => guest.cleared.push(m.visitor));
  room.onMessage(ServerMessage.FriendNotice, (m: FriendNotice) => guest.notices.push(m));
  room.onMessage(ServerMessage.Friends, (m: FriendsSnapshot) => { guest.friends = m; });
  room.onMessage(ServerMessage.HomeExit, (m: HomeExit) => guest.exits.push(m));
  room.onMessage(ServerMessage.Chat, (m: { text: string }) => guest.chat.push(m.text));
  room.onMessage(ServerMessage.PlayerCard, (m: PlayerCardInfo) => guest.cards.push(m));
  for (const type of [
    ServerMessage.ChatHistory, ServerMessage.Blocks, ServerMessage.Mailbox, ServerMessage.Inventory,
    ServerMessage.HomePolicy, ServerMessage.Rejected, ServerMessage.MailSent,
  ]) room.onMessage(type, () => {});
  return guest;
}

async function until(check: () => boolean, what: string, timeoutMs = 4000): Promise<void> {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

const lastEntry = (guest: Guest) => guest.entries[guest.entries.length - 1]?.outcome;
// The synced state arrives a moment after join, so every read tolerates it not being there yet.
type SyncedState = {
  players?: Map<string, { accountId: string; inside: string; x: number; z: number }>;
  homes?: Map<string, { parts: string; building: string; open: boolean; name: string }>;
};
const playerOf = (viewer: Guest, target: Guest) =>
  [...((viewer.room.state as SyncedState | undefined)?.players?.values() ?? [])]
    .find((p) => p.accountId === target.accountId);
const homeOf = (viewer: Guest, target: Guest) =>
  (viewer.room.state as SyncedState | undefined)?.homes?.get(target.accountId);

function publishHome(guest: Guest, parts: string[] = [], building = '') {
  guest.room.send(ClientMessage.SetHome, { x: 10, z: 10, page: '0,0', parts, building });
}
function enter(guest: Guest, host: Guest) { guest.room.send(ClientMessage.EnterHome, { host: host.accountId }); }
function move(guest: Guest, x: number, z: number) { guest.room.send(ClientMessage.Move, { x, z, facing: 0, page: '0,0' }); }

beforeAll(async () => {
  stores = await import('../stores');
  const { PaperRoom } = await import('./PaperRoom');
  server = new Server({ transport: new WebSocketTransport() });
  server.define('neighborhood', PaperRoom).filterBy(['worldId', 'inviteCode']);
  await server.listen(0);
  const address = (server as unknown as { transport: { server?: { address(): { port: number } } } }).transport.server?.address();
  endpoint = `ws://localhost:${address?.port}`;
}, 20000);

// A neighborhood holds sixteen people; leave between tests so they never share a full room.
afterEach(async () => {
  const leaving = rooms.splice(0).map((room) => Promise.race([
    room.leave().catch(() => {}),
    // A room a test already left never answers a second goodbye.
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

describe('seeing homes', () => {
  it('shows neighbors the parts, the scaffolding and the open sign', async () => {
    const sam = await join('Sam');
    const ada = await join('Ada');
    publishHome(sam, ['floor', 'walls'], 'roof');
    await until(() => homeOf(ada, sam)?.parts === 'floor,walls', 'Sam\'s parts reach Ada');
    expect(homeOf(ada, sam)).toMatchObject({ building: 'roof', open: false, name: 'Sam' });

    sam.room.send(ClientMessage.SetHomePolicy, { friends: 'walk', others: 'knock', open: true });
    await until(() => homeOf(ada, sam)?.open === true, 'the open sign reaches Ada');
  });

  it('does not let a guest publish a home', async () => {
    const guest = await join('Visitor', false);
    publishHome(guest, ['floor']);
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(homeOf(guest, guest)).toBeUndefined();
  });
});

describe('player cards', () => {
  it('answers with the avatar the account is currently wearing', async () => {
    const tapps = await join('Tapps');
    const neighbor = await join('Neighbor');
    const design = {
      version: 1 as const,
      id: 'purple-monster',
      name: 'Purple monster',
      silhouette: 'spikey-monster',
      paper: { color: 'construction-purple', pattern: 'plain' },
      strokes: [],
      preset: 'medium' as const,
      sharedOnCard: false,
      createdAt: 1_000,
      updatedAt: 1_000,
    };

    tapps.room.send(ClientMessage.WearDesign, { design, edgeColor: '#8b62a8' });
    await until(
      () => (playerOf(neighbor, tapps) as { avatar?: { drawingKey?: string } } | undefined)
        ?.avatar?.drawingKey === design.id,
      'the worn avatar reaches the neighbor',
    );
    neighbor.room.send(ClientMessage.RequestPlayerCard, { accountId: tapps.accountId });
    await until(() => neighbor.cards.length === 1, 'the player card answer arrives');

    expect(neighbor.cards[0]).toMatchObject({
      accountId: tapps.accountId,
      found: true,
      drawingKey: design.id,
    });
  });
});

describe('the door', () => {
  it('walks a friend in, knocks for a stranger, and keeps chat inside the house', async () => {
    const sam = await join('Sam2');
    const ada = await join('Ada2');
    const bea = await join('Bea2');
    publishHome(sam);
    await until(() => Boolean(homeOf(ada, sam)), 'home visible');

    // A stranger knocks; the owner is told; "let in" opens the door once.
    enter(ada, sam);
    await until(() => lastEntry(ada) === 'knocked', 'Ada told she knocked');
    await until(() => sam.knocks.length === 1, 'Sam hears the knock');
    expect(sam.knocks[0]).toMatchObject({ visitor: ada.accountId, name: 'Ada2' });
    sam.room.send(ClientMessage.KnockAnswer, { visitor: ada.accountId, admit: true });
    await until(() => lastEntry(ada) === 'admitted', 'Ada let in');
    await until(() => sam.cleared.includes(ada.accountId), 'Sam\'s notice comes down');
    enter(ada, sam);
    await until(() => playerOf(sam, ada)?.inside === sam.accountId, 'Ada is inside');

    // Her first move into the interior space is accepted, not clamped.
    move(ada, INTERIOR_SPACE.x + 1, INTERIOR_SPACE.z + 2);
    await until(() => (playerOf(sam, ada)?.x ?? 0) > 39000, 'the jump into the interior is accepted');

    // Sam goes in too. Chat inside is heard inside, and not by Bea on the lawn.
    enter(sam, sam);
    await until(() => playerOf(ada, sam)?.inside === sam.accountId, 'Sam inside');
    ada.room.send(ClientMessage.Chat, { text: 'nice tent' });
    await until(() => sam.chat.includes('nice tent'), 'Sam hears Ada inside');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(bea.chat).not.toContain('nice tent');
    bea.room.send(ClientMessage.Chat, { text: 'anyone home' });
    await until(() => ada.chat.length + sam.chat.length >= 1, 'chat flows outside', 500).catch(() => {});
    expect(ada.chat).not.toContain('anyone home');

    // Leaving puts her back at the door.
    ada.room.send(ClientMessage.LeaveHome, {});
    await until(() => playerOf(sam, ada)?.inside === '', 'Ada out');
    move(ada, 11, 10);
    await until(() => Math.abs((playerOf(sam, ada)?.x ?? 0) - 11) < 0.01, 'the jump back to the door is accepted');
  });

  it('keeps a jump honest: a "leave" that lands far from the door is put at the door', async () => {
    const sam = await join('Sam3');
    const ada = await join('Ada3');
    publishHome(sam);
    sam.room.send(ClientMessage.SetHomePolicy, { friends: 'walk', others: 'knock', open: true });
    await until(() => homeOf(ada, sam)?.open === true, 'open house');
    enter(ada, sam);
    await until(() => playerOf(sam, ada)?.inside === sam.accountId, 'inside');
    move(ada, INTERIOR_SPACE.x, INTERIOR_SPACE.z);
    ada.room.send(ClientMessage.LeaveHome, {});
    await until(() => playerOf(sam, ada)?.inside === '', 'out');
    move(ada, 900, 900);
    await until(() => Math.abs((playerOf(sam, ada)?.x ?? 0) - 10) < 0.01, 'snapped to the door, not teleported');
  });

  it('turns an unanswered knock at an empty house into a note in the mailbox', async () => {
    const bea = await join('Bea4');
    const sam = await join('Sam4');
    publishHome(sam);
    await until(() => Boolean(homeOf(bea, sam)), 'home visible');
    await sam.room.leave();
    await until(() => !playerOf(bea, sam), 'Sam gone');

    enter(bea, sam);
    await until(() => lastEntry(bea) === 'no-answer', 'Bea told nobody answered');
    const notes = stores.mail.list(sam.accountId);
    expect(notes).toHaveLength(1);
    expect(notes[0].payload.text).toBe('Bea4 knocked while you were away.');
  });
});

describe('friends', () => {
  it('needs a yes, then walks a friend straight in', async () => {
    const sam = await join('Sam5');
    const ada = await join('Ada5');
    publishHome(sam);
    await until(() => Boolean(homeOf(ada, sam)), 'home visible');

    ada.room.send(ClientMessage.FriendRequest, { accountId: sam.accountId });
    await until(() => sam.notices.some((n) => n.kind === 'incoming'), 'Sam is asked');
    await until(() => sam.friends?.incoming.length === 1, 'Sam sees the request');
    expect(ada.friends?.outgoing).toHaveLength(1);
    expect(ada.friends?.friends).toHaveLength(0);

    sam.room.send(ClientMessage.FriendAnswer, { accountId: ada.accountId, accept: true });
    await until(() => ada.notices.some((n) => n.kind === 'accepted'), 'Ada hears yes');
    await until(() => sam.friends?.friends.length === 1 && ada.friends?.friends.length === 1, 'both lists');
    expect(sam.friends?.friends[0]).toMatchObject({ accountId: ada.accountId, online: true });

    enter(ada, sam);
    await until(() => lastEntry(ada) === 'admitted', 'a friend walks in');
  });

  it('keeps a "no" quiet: the asker is not told, and their own list is untouched', async () => {
    const sam = await join('Sam6');
    const ada = await join('Ada6');
    ada.room.send(ClientMessage.FriendRequest, { accountId: sam.accountId });
    await until(() => sam.friends?.incoming.length === 1, 'asked');
    const before = ada.notices.length;
    sam.room.send(ClientMessage.FriendAnswer, { accountId: ada.accountId, accept: false });
    await until(() => (sam.friends?.incoming ?? []).length === 0, 'the request leaves Sam\'s list');
    // The asker's own list is unchanged — still showing the request they sent —
    // so "it vanished" can never be read as a no.
    expect(ada.friends?.outgoing).toHaveLength(1);
    expect(ada.notices.length).toBe(before);
  });

  it('does not let a guest ask or be asked', async () => {
    const sam = await join('Sam7');
    const guest = await join('Guest7', false);
    guest.room.send(ClientMessage.FriendRequest, { accountId: sam.accountId });
    sam.room.send(ClientMessage.FriendRequest, { accountId: guest.accountId });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(sam.friends?.incoming ?? []).toHaveLength(0);
    expect(sam.friends?.outgoing ?? []).toHaveLength(0);
  });
});

describe('blocks at the door', () => {
  it('asks a blocked guest to leave, and gives them the answer a closed door gives', async () => {
    const sam = await join('Sam8');
    const ada = await join('Ada8');
    publishHome(sam);
    sam.room.send(ClientMessage.SetHomePolicy, { friends: 'walk', others: 'knock', open: true });
    await until(() => homeOf(ada, sam)?.open === true, 'open house');
    enter(ada, sam);
    await until(() => playerOf(sam, ada)?.inside === sam.accountId, 'Ada inside');

    sam.room.send(ClientMessage.Block, { accountId: ada.accountId });
    await until(() => ada.exits.length === 1, 'Ada asked to leave');
    expect(ada.exits[0]).toEqual({ host: sam.accountId, reason: 'asked-to-leave' });
    await until(() => playerOf(sam, ada)?.inside === '', 'Ada out in the state');

    // Even an open house stays shut to her now, exactly like a closed door.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const before = ada.entries.length;
    enter(ada, sam);
    await until(() => ada.entries.length > before, 'an answer');
    expect(lastEntry(ada)).toBe('closed');
    // And blocking ended any friendship.
    ada.room.send(ClientMessage.FriendRequest, { accountId: sam.accountId });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(sam.friends?.incoming ?? []).toHaveLength(0);
  });

  it('lets an owner ask a guest to leave without blocking them', async () => {
    const sam = await join('Sam9');
    const ada = await join('Ada9');
    publishHome(sam);
    sam.room.send(ClientMessage.SetHomePolicy, { friends: 'walk', others: 'knock', open: true });
    await until(() => homeOf(ada, sam)?.open === true, 'open house');
    enter(ada, sam);
    await until(() => playerOf(sam, ada)?.inside === sam.accountId, 'inside');
    // Somebody else cannot send her out.
    const bea = await join('Bea9');
    bea.room.send(ClientMessage.AskToLeave, { accountId: ada.accountId });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(playerOf(sam, ada)?.inside).toBe(sam.accountId);
    sam.room.send(ClientMessage.AskToLeave, { accountId: ada.accountId });
    await until(() => ada.exits.length === 1, 'the owner can');
  });
});

describe('settings', () => {
  it('refuses a door setting that does not exist', async () => {
    const sam = await join('Sam10');
    const ada = await join('Ada10');
    publishHome(sam);
    sam.room.send(ClientMessage.SetHomePolicy, { friends: 'walk', others: 'walk', open: false });
    await new Promise((resolve) => setTimeout(resolve, 150));
    enter(ada, sam);
    await until(() => lastEntry(ada) === 'knocked', 'a stranger still knocks');
  });
});
