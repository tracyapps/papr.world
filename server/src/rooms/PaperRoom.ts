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
  isFiniteNumber,
  type ChatIntent,
  type GatherIntent,
  type JoinOptions,
  type MoveIntent,
  type PlacePieceIntent,
  type RejectionReason,
} from '../../../shared/src/index';
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

    this.seedResourceNodes();

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

  /** Deny the join outright if the client speaks a different protocol. */
  override onJoin(client: Client, options: JoinOptions): void {
    if (!options || options.protocol !== PROTOCOL_VERSION) {
      throw new Error('bad-protocol');
    }

    const player = new PlayerSchema();
    player.id = client.sessionId;
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
    if (
      typeof msg.templateKey !== 'string' ||
      !isFiniteNumber(msg.x) ||
      !isFiniteNumber(msg.z)
    ) {
      this.reject(client, ClientMessage.PlacePiece, 'invalid');
      return;
    }

    const piece = new PieceSchema();
    piece.id = randomUUID();
    piece.templateKey = msg.templateKey.slice(0, 64);
    piece.x = msg.x;
    piece.z = msg.z;
    piece.rotY = isFiniteNumber(msg.rotY) ? msg.rotY : 0;
    piece.ownerId = player.id;
    piece.page = typeof msg.page === 'string' ? msg.page : player.page;

    this.state.pieces.set(piece.id, piece);
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
    this.state.nodes.forEach((node) => {
      if (node.respawnAt !== 0 && now >= node.respawnAt) {
        node.remaining = 3;
        node.respawnAt = 0;
      }
    });
  }
}
