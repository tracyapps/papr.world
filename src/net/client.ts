// Client networking layer over @colyseus/sdk.
//
// This is the ONLY place the client talks to the server. It is deliberately
// Imported only through sharedSession.ts, whose URL gate keeps ordinary solo
// play entirely offline — see src/net/README.md for the local dogfood URL.
//
// Shape of the deal (technical-plan.md "Keep the server authoritative"):
//   * Outbound: we send INTENTS (sendMove/sendChat/...). We never assert truth.
//   * Inbound: the server's room state is the truth. We forward player/piece/
//     node changes to callbacks the renderer wires up, and push remote-player
//     positions into an interpolation buffer for smooth motion.
//
// State objects from the SDK are dynamically-generated schema instances, so
// they're read through small `any`-localized readers here rather than importing
// the server's Schema classes into the client bundle.

import { Client, getStateCallbacks, type Room } from '@colyseus/sdk';
import {
  CLIENT_INTENT_HZ,
  ClientMessage,
  DEFAULT_ROOM,
  PROTOCOL_VERSION,
  ServerMessage,
  type AccountCredentials,
  type AvatarRef,
  type ChatBroadcast,
  type ChatIntent,
  type GatherIntent,
  type JoinOptions,
  type MoveIntent,
  type PlacePieceIntent,
  type PlacedPiece,
  type PlayerState,
  type Rejected,
} from '../../shared/src/index';
import { RemotePlayerBuffer, type RemoteSample } from './remotePlayers';

export type NetCallbacks = {
  /** A remote player joined (self is filtered out). */
  onPlayerJoin?: (player: PlayerState) => void;
  /** A remote player left. */
  onPlayerLeave?: (id: string) => void;
  /** A build piece appeared. */
  onPieceAdd?: (piece: PlacedPiece) => void;
  /** A build piece was removed. */
  onPieceRemove?: (id: string) => void;
  /** A chat line was accepted by the server. */
  onChat?: (line: ChatBroadcast) => void;
  /** An intent was refused — surface a quiet hint. */
  onRejected?: (info: Rejected) => void;
  /** Connection dropped. */
  onLeave?: (code: number) => void;
};

export type NetConnection = {
  /** Our own session id, so the renderer can skip drawing ourselves twice. */
  readonly sessionId: string;
  /** Smoothly-interpolated transform for a remote player, or null. */
  sampleRemote: (id: string, now?: number) => RemoteSample | null;
  /** Ids of remote players currently tracked. */
  remoteIds: () => string[];
  sendMove: (intent: MoveIntent) => void;
  sendChat: (text: string) => void;
  sendPlacePiece: (intent: PlacePieceIntent) => void;
  sendGather: (nodeId: string) => void;
  disconnect: () => void;
};

export type ConnectOptions = {
  /** e.g. "ws://localhost:2567" for solo/LAN, or "wss://your-host" hosted. */
  endpoint: string;
  name: string;
  avatar: AvatarRef;
  room?: string;
  inviteCode: string;
  intent: 'create' | 'join';
  /**
   * Paper passport from src/net/passport.ts. Omit to join as a guest —
   * fine for a first look, but nothing made will be credited durably.
   */
  account?: AccountCredentials;
};

/**
 * Join a neighborhood room. Resolves once the room and our session exist.
 * The renderer supplies callbacks to create/destroy its own meshes; this layer
 * owns none of that.
 */
export async function connect(
  options: ConnectOptions,
  callbacks: NetCallbacks = {},
): Promise<NetConnection> {
  const client = new Client(options.endpoint);
  const joinOptions: JoinOptions = {
    protocol: PROTOCOL_VERSION,
    name: options.name,
    avatar: options.avatar,
    inviteCode: options.inviteCode,
    account: options.account,
  };

  const room: Room = options.intent === 'join'
    ? await client.join(options.room ?? DEFAULT_ROOM, joinOptions)
    : await client.joinOrCreate(options.room ?? DEFAULT_ROOM, joinOptions);
  const buffer = new RemotePlayerBuffer();
  const selfId = room.sessionId;
  const stateCallbacks = getStateCallbacks(room);
  if (!stateCallbacks) throw new Error('The neighborhood did not provide schema state.');

  wirePlayers(room, stateCallbacks, selfId, buffer, callbacks);
  wirePieces(room, stateCallbacks, callbacks);
  wireChat(room, stateCallbacks, callbacks);
  wireMessages(room, callbacks);
  room.onLeave((code) => callbacks.onLeave?.(code));

  // Throttle outbound movement so we don't flood past the server tick.
  const minMoveGap = 1000 / CLIENT_INTENT_HZ;
  let lastMoveSent = 0;

  return {
    sessionId: selfId,
    sampleRemote: (id, now) => buffer.sample(id, now),
    remoteIds: () => buffer.ids(),
    sendMove: (intent) => {
      const now = Date.now();
      if (now - lastMoveSent < minMoveGap) return;
      lastMoveSent = now;
      room.send(ClientMessage.Move, intent);
    },
    sendChat: (text) => {
      const payload: ChatIntent = { text };
      room.send(ClientMessage.Chat, payload);
    },
    sendPlacePiece: (intent) => room.send(ClientMessage.PlacePiece, intent),
    sendGather: (nodeId) => {
      const payload: GatherIntent = { nodeId };
      room.send(ClientMessage.Gather, payload);
    },
    disconnect: () => {
      void room.leave();
    },
  };
}

// ---- State readers (SDK schema instances are dynamically typed) --------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function readPlayer(id: string, raw: any): PlayerState {
  return {
    id,
    accountId: raw.accountId ?? '',
    name: raw.name,
    avatar: {
      preset: raw.avatar?.preset ?? 'medium',
      drawingKey: raw.avatar?.drawingKey ?? '',
      edgeColor: raw.avatar?.edgeColor ?? '#3a3226',
    },
    x: raw.x,
    z: raw.z,
    facing: raw.facing,
    page: raw.page,
  };
}

function readPiece(id: string, raw: any): PlacedPiece {
  return {
    id,
    templateKey: raw.templateKey,
    x: raw.x,
    z: raw.z,
    rotY: raw.rotY,
    makerId: raw.makerId,
    page: raw.page,
  };
}

function readChat(raw: any): ChatBroadcast {
  return {
    id: raw.id,
    playerId: raw.playerId,
    name: raw.name,
    text: raw.text,
    at: raw.at,
  };
}

function wirePlayers(
  room: Room,
  $: NonNullable<ReturnType<typeof getStateCallbacks>>,
  selfId: string,
  buffer: RemotePlayerBuffer,
  callbacks: NetCallbacks,
): void {
  // Register through the root proxy. joinOrCreate resolves after the schema
  // handshake but before the first full ROOM_STATE; binding the handshake's
  // temporary collection directly would miss that initial collection swap.
  $(room.state as any).players.onAdd((raw: any, id: string) => {
    if (id === selfId) return; // don't render ourselves as a remote
    buffer.push(id, raw.x, raw.z, raw.facing);
    $(raw).onChange(() => buffer.push(id, raw.x, raw.z, raw.facing));
    callbacks.onPlayerJoin?.(readPlayer(id, raw));
  });
  $(room.state as any).players.onRemove((_raw: any, id: string) => {
    if (id === selfId) return;
    buffer.remove(id);
    callbacks.onPlayerLeave?.(id);
  });
}

function wirePieces(
  room: Room,
  $: NonNullable<ReturnType<typeof getStateCallbacks>>,
  callbacks: NetCallbacks,
): void {
  $(room.state as any).pieces.onAdd((raw: any, id: string) =>
    callbacks.onPieceAdd?.(readPiece(id, raw)));
  $(room.state as any).pieces.onRemove((_raw: any, id: string) =>
    callbacks.onPieceRemove?.(id));
}

function wireMessages(room: Room, callbacks: NetCallbacks): void {
  room.onMessage(ServerMessage.Rejected, (info: Rejected) => callbacks.onRejected?.(info));
}

/**
 * Room state supplies late-join history; the broadcast supplies the quickest
 * live delivery. De-duplicate by the server id because a new line uses both.
 */
function wireChat(
  room: Room,
  $: NonNullable<ReturnType<typeof getStateCallbacks>>,
  callbacks: NetCallbacks,
): void {
  if (!callbacks.onChat) return;
  const seen = new Set<string>();
  const deliver = (line: ChatBroadcast) => {
    if (!line.id || seen.has(line.id)) return;
    seen.add(line.id);
    callbacks.onChat?.(line);
  };
  $(room.state as any).chat.onAdd((raw: any) => deliver(readChat(raw)));
  room.onMessage(ServerMessage.Chat, deliver);
}
