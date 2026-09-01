// PaperRoom — the authoritative neighborhood room.
//
// Every gameplay change flows through here: the client REQUESTS via messages,
// this room VALIDATES using the shared rules, and only then mutates state.
// Colyseus streams the resulting state diffs back to all clients. The client
// never gets to decide the truth — matching technical-plan.md's "keep the
// server authoritative".
//
// First-slice scope on purpose: presence (move), chat, placed pieces, and a
// stub gather. Persistence, permissions, and richer entities come later; the
// message/validation seams are already here to hang them on.
//
// Moderation lives here too, because it has to: personal blocks, contextual
// safety reports, and owner removal are all decided server-side. The client
// asks; this room decides. See blocks.ts and moderation.ts for why each works
// the way it does.

import { Room, type Client } from '@colyseus/core';
import { randomUUID } from 'node:crypto';
import {
  ClientMessage,
  ServerMessage,
  LIMITS,
  LEGACY_INVITE_CODE,
  PROTOCOL_VERSION,
  SERVER_TICK_HZ,
  clampMove,
  sanitizeAvatar,
  sanitizeChat,
  sanitizeInviteCode,
  sanitizeName,
  sanitizePlacePiece,
  sanitizeAccountCredentials,
  isFiniteNumber,
  type BlockIntent,
  type ChatBroadcast,
  type ChatIntent,
  type GatherIntent,
  type JoinOptions,
  type MoveIntent,
  type PlacePieceIntent,
  type PlacedPiece,
  type RejectionReason,
  type RemoveIntent,
  type ReportIntent,
  type ResourceNode,
  type RoomSave,
} from '../../../shared/src/index';
import { accounts, blocks, isOwner, moderation, OWNER_ACCOUNT, roomStore } from '../stores';
import {
  NodeSchema,
  PaperRoomState,
  PieceSchema,
  PlayerSchema,
} from '../schema/PaperRoomState';

/** Per-session bookkeeping the schema shouldn't carry. */
type Session = {
  lastMoveAt: number;
  lastChatAt: number;
};

const DEFAULT_PERSISTENCE_ID = 'neighborhood';

/**
 * How long a dropped visitor's seat is held open.
 *
 * Matched to the client SDK's own retry schedule (15 attempts on exponential
 * backoff, capped at 5s apiece, which runs to roughly a minute). Longer would
 * keep a room alive for someone who is not coming back; shorter would give up
 * while their browser is still politely knocking.
 */
const RECONNECT_GRACE_SECONDS = 60;

/**
 * WebSocket close code 4000. Colyseus reads it as "this departure was meant",
 * which routes it to onLeave rather than onDrop — so a removal ends the visit
 * instead of holding a seat open for the person who was just removed.
 */
const CONSENTED_CLOSE = 4000;

type PaperRoomOptions = {
  state: PaperRoomState;
  metadata: { inviteCode: string };
};

export class PaperRoom extends Room<PaperRoomOptions> {
  override state = new PaperRoomState();
  private sessions = new Map<string, Session>();
  private persistenceId = DEFAULT_PERSISTENCE_ID;
  private inviteCode = LEGACY_INVITE_CODE;

  /**
   * Recent chat, in memory rather than in synced state, so each line can be
   * delivered to some people and withheld from others.
   */
  private chatLog: ChatBroadcast[] = [];

  /** Accounts refused entry to this neighborhood. Restored from the save. */
  private banned = new Set<string>();

  override onCreate(options: JoinOptions): void {
    const inviteCode = sanitizeInviteCode(options?.inviteCode);
    if (!inviteCode || inviteCode !== options.inviteCode) throw new Error('bad-invite-code');
    this.inviteCode = inviteCode;
    this.persistenceId = inviteCode === LEGACY_INVITE_CODE
      ? DEFAULT_PERSISTENCE_ID
      : `invite-${inviteCode}`;
    this.maxClients = LIMITS.playersPerRoom;
    this.setPatchRate(1000 / SERVER_TICK_HZ);

    // The world remembers: restore pieces/nodes if this neighborhood has a
    // save; otherwise seed it fresh. (Player positions and chat are transient
    // on purpose — see RoomSave in shared/.)
    const save = roomStore.load(this.persistenceId);
    if (save) this.hydrate(save);
    else this.seedResourceNodes();

    this.onMessage(ClientMessage.Move, (client, msg: MoveIntent) =>
      this.handleMove(client, msg),
    );
    this.onMessage(ClientMessage.Chat, (client, msg: ChatIntent) =>
      this.handleChat(client, msg),
    );
    this.onMessage(ClientMessage.PlacePiece, (client, msg: PlacePieceIntent) =>
      this.handlePlacePiece(client, msg),
    );
    this.onMessage(ClientMessage.Gather, (client, msg: GatherIntent) =>
      this.handleGather(client, msg),
    );
    this.onMessage(ClientMessage.Block, (client, msg: BlockIntent) =>
      this.handleBlock(client, msg, true),
    );
    this.onMessage(ClientMessage.Unblock, (client, msg: BlockIntent) =>
      this.handleBlock(client, msg, false),
    );
    this.onMessage(ClientMessage.Report, (client, msg: ReportIntent) =>
      this.handleReport(client, msg),
    );
    this.onMessage(ClientMessage.Remove, (client, msg: RemoveIntent) =>
      this.handleRemove(client, msg),
    );

    // Light housekeeping tick: refill spent resource nodes.
    this.setSimulationInterval(() => this.refillNodes(), 1000);
  }

  /**
   * Gate the join: protocol check, then passport verification.
   *
   * Returns the durable accountId, which Colyseus hands to onJoin as `auth`.
   * No credentials = guest (`guest:<sessionId>` — real for the visit, not
   * durable). Bad credentials = refused outright, NOT downgraded to guest:
   * silently becoming a guest would let someone build a week of work onto an
   * identity they think is durable.
   */
  override onAuth(client: Client, options: JoinOptions): string {
    if (!options || options.protocol !== PROTOCOL_VERSION) {
      throw new Error('bad-protocol');
    }
    if (sanitizeInviteCode(options.inviteCode) !== options.inviteCode) {
      throw new Error('bad-invite-code');
    }
    if (options.account !== undefined) {
      const creds = sanitizeAccountCredentials(options.account);
      if (!creds || !accounts.verify(creds.id, creds.secret, sanitizeName(options.name))) {
        throw new Error('bad-auth');
      }
      // Removal has to mean something. Checked here, before the room is
      // touched at all, so a removed account cannot even see the state.
      if (this.banned.has(creds.id)) throw new Error('banned');
      return creds.id;
    }

    // Guests are refused once an owner is configured — i.e. on any real
    // deployment. A guest's identity is `guest:<sessionId>`, which is new on
    // every connection, so a guest cannot be meaningfully removed, banned or
    // blocked. Allowing them would make all three of those controls a lie.
    // Locally, with no owner set, guests stay welcome for quick dogfooding.
    if (OWNER_ACCOUNT) throw new Error('guest-not-allowed');

    return `guest:${client.sessionId}`;
  }

  override onJoin(client: Client, options: JoinOptions, auth?: string): void {
    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.accountId = auth ?? `guest:${client.sessionId}`;
    player.name = sanitizeName(options.name);
    const avatar = sanitizeAvatar(options.avatar);
    player.avatar.preset = avatar.preset;
    player.avatar.drawingKey = avatar.drawingKey;
    player.avatar.edgeColor = avatar.edgeColor;
    // Spawn at the clearing until the client sends its first real position.
    player.x = 0;
    player.z = 0;
    player.facing = 0;
    player.page = '0,0';

    player.isOwner = isOwner(player.accountId);

    this.state.players.set(client.sessionId, player);
    this.sessions.set(client.sessionId, { lastMoveAt: Date.now(), lastChatAt: 0 });

    // The backlog, filtered the same way live chat is — otherwise a block
    // would hold for new lines and then hand you everything you blocked the
    // moment you reconnected.
    client.send(ServerMessage.ChatHistory, {
      lines: this.chatLog.filter((line) => !blocks.isBlocked(player.accountId, line.accountId)),
    });

    // Echo their own block list so the client can label people correctly
    // without keeping its own copy that could drift.
    client.send(ServerMessage.Blocks, { accountIds: blocks.list(player.accountId) });
  }

  /**
   * A deliberate departure: they closed the tab, went back to solo, or were
   * removed by the owner. Their paper self is put away.
   */
  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
  }

  /**
   * The socket died without a goodbye — bad wifi, a closed laptop lid, a
   * redeploy, a proxy hiccup.
   *
   * WHY THIS IS NOT onLeave: those are genuinely different events and used to
   * be treated the same, which meant a two-second network blip cost somebody
   * their avatar, their position, and the chat they were in the middle of.
   * Colyseus routes an unexpected close here instead, and `allowReconnection`
   * holds the seat open. Room state is NOT torn down during the wait, so
   * everyone else keeps seeing them standing where they were, and they slip
   * back into the same body rather than arriving as a stranger.
   *
   * The client SDK retries on its own with exponential backoff — roughly a
   * minute of trying, which is what this grace window is matched to. If the
   * window closes, it becomes an ordinary departure.
   */
  override async onDrop(client: Client): Promise<void> {
    if (!this.state.players.has(client.sessionId)) {
      this.onLeave(client);
      return;
    }

    try {
      await this.allowReconnection(client, RECONNECT_GRACE_SECONDS);
      // Resolved means they made it back; onReconnect does the re-briefing.
    } catch {
      this.onLeave(client);
    }
  }

  /**
   * They made it back into the same seat.
   *
   * Two things have to happen here and nowhere else. First the ban check:
   * `onAuth` does NOT run again on a reconnection — the seat was authorised
   * when they first joined — so if a ban landed while they were away, this is
   * the only place it can be enforced. Second the re-briefing: they kept
   * everything that lives in room state (their avatar, where they stood, the
   * pieces on the ground) and lost everything delivered as MESSAGES, which is
   * the chat backlog and their own block list.
   */
  override onReconnect(client: Client): void {
    // `client.auth` is whatever onAuth returned, which here is the account id,
    // and Colyseus carries it across a reconnection. Read the ban from THAT
    // rather than from the player, because the owner may have cleared the
    // player out of room state entirely while this person was away — and that
    // is precisely the case the check exists for.
    const accountId = typeof client.auth === 'string' ? client.auth : '';

    if (accountId && this.banned.has(accountId)) {
      client.send(ServerMessage.Removed, { reason: 'banned' });
      client.leave(CONSENTED_CLOSE);
      return;
    }

    const player = this.state.players.get(client.sessionId);

    // No player and no ban means an ordinary removal landed while they were
    // away. Same outcome, different sentence.
    if (!player) {
      client.send(ServerMessage.Removed, { reason: 'removed-by-owner' });
      client.leave(CONSENTED_CLOSE);
      return;
    }

    client.send(ServerMessage.ChatHistory, {
      lines: this.chatLog.filter((line) => !blocks.isBlocked(player.accountId, line.accountId)),
    });
    client.send(ServerMessage.Blocks, { accountIds: blocks.list(player.accountId) });
  }

  // ---- Handlers -------------------------------------------------------------

  private handleMove(client: Client, msg: MoveIntent): void {
    const player = this.state.players.get(client.sessionId);
    const session = this.sessions.get(client.sessionId);
    if (!player || !session || !msg) return;

    const now = Date.now();
    const dt = (now - session.lastMoveAt) / 1000;
    const { point, ok } = clampMove({ x: player.x, z: player.z }, msg, dt);
    player.x = point.x;
    player.z = point.z;
    if (isFiniteNumber(msg.facing)) player.facing = msg.facing;
    if (typeof msg.page === 'string') player.page = msg.page;
    session.lastMoveAt = now;

    if (!ok) this.reject(client, ClientMessage.Move, 'too-far');
  }

  private handleChat(client: Client, msg: ChatIntent): void {
    const player = this.state.players.get(client.sessionId);
    const session = this.sessions.get(client.sessionId);
    if (!player || !session || !msg) return;

    const now = Date.now();
    // Simple flood guard: at most ~2 lines/second.
    if (now - session.lastChatAt < 500) {
      this.reject(client, ClientMessage.Chat, 'rate-limited');
      return;
    }

    const text = sanitizeChat(msg.text);
    if (!text) {
      this.reject(client, ClientMessage.Chat, 'invalid');
      return;
    }
    session.lastChatAt = now;

    const line: ChatBroadcast = {
      id: randomUUID(),
      playerId: player.id,
      accountId: player.accountId,
      name: player.name,
      text,
      at: now,
    };

    this.chatLog.push(line);
    while (this.chatLog.length > LIMITS.chatHistory) this.chatLog.shift();

    // Delivered person by person rather than broadcast, because that is the
    // whole point: someone who blocked this speaker simply never receives it.
    // The speaker always sees their own line — a block is about what YOU read,
    // not a punishment applied to them.
    for (const recipient of this.clients) {
      const listener = this.state.players.get(recipient.sessionId);
      if (!listener) continue;
      if (listener.accountId !== player.accountId
        && blocks.isBlocked(listener.accountId, player.accountId)) continue;
      recipient.send(ServerMessage.Chat, line);
    }
  }

  private handlePlacePiece(client: Client, msg: PlacePieceIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !msg) return;

    if (this.state.pieces.size >= LIMITS.placedPiecesPerRoom) {
      this.reject(client, ClientMessage.PlacePiece, 'not-allowed');
      return;
    }
    let mine = 0;
    this.state.pieces.forEach((p) => {
      if (p.makerId === player.accountId) mine += 1;
    });
    if (mine >= LIMITS.placedPiecesPerPlayer) {
      this.reject(client, ClientMessage.PlacePiece, 'not-allowed');
      return;
    }
    const intent = sanitizePlacePiece(msg);
    if (!intent) {
      this.reject(client, ClientMessage.PlacePiece, 'invalid');
      return;
    }

    const piece = new PieceSchema();
    piece.id = randomUUID();
    piece.templateKey = intent.templateKey;
    piece.x = intent.x;
    piece.z = intent.z;
    piece.rotY = intent.rotY;
    piece.material = intent.material;
    piece.makerId = player.accountId; // durable credit, never the session id
    piece.page = intent.page || player.page;

    this.state.pieces.set(piece.id, piece);
    this.persist();
  }

  private handleGather(client: Client, msg: GatherIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !msg) return;

    const node = this.state.nodes.get(msg.nodeId);
    if (!node || node.respawnAt !== 0 || node.remaining <= 0) {
      this.reject(client, ClientMessage.Gather, 'node-empty');
      return;
    }

    node.remaining -= 1;
    if (node.remaining <= 0) {
      // Spent: hide until it refills 30s later.
      node.respawnAt = Date.now() + 30_000;
    }
    this.persist();
    // Inventory grant lands here once the scrapbook data model exists.
  }

  /**
   * Block or unblock an account. Personal, instant, and never announced to
   * the other person — see the header of blocks.ts for why each of those
   * matters. There is no rejection for blocking somebody who is not here:
   * you should be able to block from a line you read ten minutes ago.
   */
  private handleBlock(client: Client, msg: BlockIntent, add: boolean): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !msg) return;

    const target = typeof msg.accountId === 'string' ? msg.accountId.trim() : '';
    if (!target || target === player.accountId) {
      this.reject(client, add ? ClientMessage.Block : ClientMessage.Unblock, 'invalid');
      return;
    }

    if (add) {
      if (!blocks.add(player.accountId, target)) {
        this.reject(client, ClientMessage.Block, 'not-allowed');
        return;
      }
    } else {
      blocks.remove(player.accountId, target);
    }

    client.send(ServerMessage.Blocks, { accountIds: blocks.list(player.accountId) });
  }

  /**
   * File a safety report.
   *
   * The evidence is assembled HERE, from the server's own chat log, not from
   * whatever the client sends. A client-supplied message body would be a way
   * to fabricate a quote and attribute it to someone.
   */
  private handleReport(client: Client, msg: ReportIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !msg) return;

    const reportedAccountId = typeof msg.accountId === 'string' ? msg.accountId.trim() : '';
    if (!reportedAccountId) {
      this.reject(client, ClientMessage.Report, 'invalid');
      return;
    }

    // Look the line up server-side; ignore anything the client claims it said.
    const quoted = typeof msg.messageId === 'string'
      ? this.chatLog.find((line) => line.id === msg.messageId)
      : undefined;

    // Their current name if they are here, the name on the quoted line
    // otherwise — a report read next month should say who it was about.
    let reportedName = quoted?.name ?? '';
    this.state.players.forEach((other) => {
      if (other.accountId === reportedAccountId) reportedName = other.name;
    });

    const receiptId = moderation.file({
      inviteCode: this.inviteCode,
      reporterAccountId: player.accountId,
      reportedAccountId,
      reportedName,
      ...(quoted
        ? { messageId: quoted.id, messageText: quoted.text, messageAt: quoted.at }
        : {}),
      ...(typeof msg.details === 'string' ? { details: msg.details } : {}),
    });

    if (!receiptId) {
      this.reject(client, ClientMessage.Report, 'rate-limited');
      return;
    }

    client.send(ServerMessage.ReportFiled, { receiptId });
  }

  /**
   * Owner-only removal.
   *
   * The client's `isOwner` flag is a hint for drawing the UI; it is never
   * trusted here. Authority is the account id, checked against the server's
   * own PAPR_OWNER_ACCOUNT on every single call.
   */
  private handleRemove(client: Client, msg: RemoveIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !msg) return;

    if (!isOwner(player.accountId)) {
      this.reject(client, ClientMessage.Remove, 'not-allowed');
      return;
    }

    const target = typeof msg.accountId === 'string' ? msg.accountId.trim() : '';
    if (!target || target === player.accountId) {
      this.reject(client, ClientMessage.Remove, 'invalid');
      return;
    }

    if (msg.ban) {
      this.banned.add(target);
      // Straight to disk: a ban that a crash could undo is not a ban.
      roomStore.saveNow(this.persistenceId, () => this.snapshot());
    }

    // Tell them what happened before the socket closes, so they get an
    // explanation rather than a mystery disconnection.
    for (const other of [...this.clients]) {
      const occupant = this.state.players.get(other.sessionId);
      if (occupant?.accountId !== target) continue;
      other.send(ServerMessage.Removed, { reason: msg.ban ? 'banned' : 'removed-by-owner' });
      other.leave(CONSENTED_CLOSE);
    }

    // Someone can be mid-reconnection when the owner removes them: their
    // socket is gone, so the loop above never sees them, but their paper self
    // is still standing in the room holding a reserved seat. Clear it. A ban
    // would stop them at onReconnect anyway; a plain removal would not, and an
    // owner who removed somebody should not watch them walk back in.
    for (const [sessionId, occupant] of [...this.state.players.entries()]) {
      if (occupant.accountId !== target) continue;
      if (this.clients.some((c) => c.sessionId === sessionId)) continue;
      this.state.players.delete(sessionId);
      this.sessions.delete(sessionId);
    }
  }

  // ---- Helpers --------------------------------------------------------------

  private reject(client: Client, action: string, reason: RejectionReason): void {
    client.send(ServerMessage.Rejected, { action, reason });
  }

  private seedResourceNodes(): void {
    const seeds = [
      { id: 'clearing-scrap-1', kind: 'scrap.lined', x: 4, z: -3, page: '0,0' },
      { id: 'clearing-scrap-2', kind: 'scrap.construction', x: -5, z: 2, page: '0,0' },
    ];
    for (const s of seeds) {
      const node = new NodeSchema();
      node.id = s.id;
      node.kind = s.kind;
      node.x = s.x;
      node.z = s.z;
      node.page = s.page;
      node.remaining = 3;
      node.respawnAt = 0;
      this.state.nodes.set(node.id, node);
    }
  }

  private refillNodes(): void {
    const now = Date.now();
    let changed = false;
    this.state.nodes.forEach((node) => {
      if (node.respawnAt !== 0 && now >= node.respawnAt) {
        node.remaining = 3;
        node.respawnAt = 0;
        changed = true;
      }
    });
    if (changed) this.persist();
  }

  // ---- Persistence ----------------------------------------------------------

  override onDispose(): void {
    roomStore.saveNow(this.persistenceId, () => this.snapshot());
    accounts.flush();
  }

  /** Debounced write of the durable half of room state. */
  private persist(): void {
    roomStore.scheduleSave(this.persistenceId, () => this.snapshot());
  }

  private snapshot(): Omit<RoomSave, 'version' | 'savedAt'> {
    const bannedAccountIds = [...this.banned];
    const pieces: PlacedPiece[] = [];
    this.state.pieces.forEach((p) => {
      pieces.push({
        id: p.id,
        templateKey: p.templateKey,
        x: p.x,
        z: p.z,
        rotY: p.rotY,
        material: p.material,
        makerId: p.makerId,
        page: p.page,
      });
    });
    const nodes: ResourceNode[] = [];
    this.state.nodes.forEach((n) => {
      nodes.push({
        id: n.id,
        kind: n.kind,
        x: n.x,
        z: n.z,
        page: n.page,
        remaining: n.remaining,
        // Schema uses 0 for "available now"; the plain type uses null.
        respawnAt: n.respawnAt === 0 ? null : n.respawnAt,
      });
    });
    return { pieces, nodes, bannedAccountIds };
  }

  private hydrate(save: RoomSave): void {
    // Absent on saves written before removal existed.
    for (const id of save.bannedAccountIds ?? []) this.banned.add(id);

    for (const p of save.pieces) {
      const piece = new PieceSchema();
      piece.id = p.id;
      piece.templateKey = p.templateKey;
      piece.x = p.x;
      piece.z = p.z;
      piece.rotY = p.rotY;
      // Absent on saves written before this field existed.
      piece.material = p.material ?? '';
      piece.makerId = p.makerId;
      piece.page = p.page;
      this.state.pieces.set(piece.id, piece);
    }
    for (const n of save.nodes) {
      const node = new NodeSchema();
      node.id = n.id;
      node.kind = n.kind;
      node.x = n.x;
      node.z = n.z;
      node.page = n.page;
      node.remaining = n.remaining;
      node.respawnAt = n.respawnAt ?? 0;
      this.state.nodes.set(node.id, node);
    }
  }
}
