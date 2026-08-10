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

import { Room, type Client } from '@colyseus/core';
import { randomUUID } from 'node:crypto';
import {
  ClientMessage,
  ServerMessage,
  LIMITS,
  PROTOCOL_VERSION,
  SERVER_TICK_HZ,
  clampMove,
  sanitizeAvatar,
  sanitizeChat,
  sanitizeName,
  sanitizePlacePiece,
  sanitizeAccountCredentials,
  isFiniteNumber,
  type ChatIntent,
  type GatherIntent,
  type JoinOptions,
  type MoveIntent,
  type PlacePieceIntent,
  type PlacedPiece,
  type RejectionReason,
  type ResourceNode,
  type RoomSave,
} from '../../../shared/src/index';
import { accounts, roomStore } from '../stores';
import {
  ChatSchema,
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

export class PaperRoom extends Room<PaperRoomState> {
  private sessions = new Map<string, Session>();

  override onCreate(): void {
    this.maxClients = LIMITS.playersPerRoom;
    this.setState(new PaperRoomState());
    this.setPatchRate(1000 / SERVER_TICK_HZ);

    // The world remembers: restore pieces/nodes if this neighborhood has a
    // save; otherwise seed it fresh. (Player positions and chat are transient
    // on purpose — see RoomSave in shared/.)
    const save = roomStore.load(this.roomName);
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
    if (options.account !== undefined) {
      const creds = sanitizeAccountCredentials(options.account);
      if (!creds || !accounts.verify(creds.id, creds.secret, sanitizeName(options.name))) {
        throw new Error('bad-auth');
      }
      return creds.id;
    }
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

    this.state.players.set(client.sessionId, player);
    this.sessions.set(client.sessionId, { lastMoveAt: Date.now(), lastChatAt: 0 });
  }

  override onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
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

    const line = new ChatSchema();
    line.id = randomUUID();
    line.playerId = player.id;
    line.name = player.name;
    line.text = text;
    line.at = now;

    this.state.chat.push(line);
    while (this.state.chat.length > LIMITS.chatHistory) this.state.chat.shift();

    this.broadcast(ServerMessage.Chat, {
      id: line.id,
      playerId: line.playerId,
      name: line.name,
      text: line.text,
      at: line.at,
    });
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
    roomStore.saveNow(this.roomName, () => this.snapshot());
    accounts.flush();
  }

  /** Debounced write of the durable half of room state. */
  private persist(): void {
    roomStore.scheduleSave(this.roomName, () => this.snapshot());
  }

  private snapshot(): Omit<RoomSave, 'version' | 'savedAt'> {
    const pieces: PlacedPiece[] = [];
    this.state.pieces.forEach((p) => {
      pieces.push({
        id: p.id,
        templateKey: p.templateKey,
        x: p.x,
        z: p.z,
        rotY: p.rotY,
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
    return { pieces, nodes };
  }

  private hydrate(save: RoomSave): void {
    for (const p of save.pieces) {
      const piece = new PieceSchema();
      piece.id = p.id;
      piece.templateKey = p.templateKey;
      piece.x = p.x;
      piece.z = p.z;
      piece.rotY = p.rotY;
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
