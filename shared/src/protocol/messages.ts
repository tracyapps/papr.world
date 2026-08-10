// Message contracts between client and server.
//
// Two directions:
//   * Client -> Server: intents. The client REQUESTS; the server decides.
//   * Server -> Client: discrete events that aren't just state (chat pings,
//     rejections). Continuous state (players, pieces, nodes) flows through
//     Colyseus room-state sync, not through these messages.
//
// Message names are plain string consts (not TS enums) so this file stays
// friendly to isolated-module / erasable-syntax transpilers like the client's.

import type { AvatarRef } from './state';

/** Credentials for a durable "paper passport" account (see server /account). */
export type AccountCredentials = {
  id: string;
  secret: string;
};

/** Sent as Colyseus room join options, validated on the server. */
export type JoinOptions = {
  protocol: number;
  name: string;
  avatar: AvatarRef;
  /**
   * Omitted = join as a guest (`guest:<sessionId>` identity, not durable).
   * Present = the server verifies and stamps the durable accountId.
   */
  account?: AccountCredentials;
};

// ---- Client -> Server -------------------------------------------------------

export const ClientMessage = {
  Move: 'move',
  Chat: 'chat',
  PlacePiece: 'place-piece',
  Gather: 'gather',
} as const;
export type ClientMessageType = (typeof ClientMessage)[keyof typeof ClientMessage];

export type MoveIntent = {
  x: number;
  z: number;
  facing: number;
  page: string;
};

export type ChatIntent = {
  text: string;
};

export type PlacePieceIntent = {
  templateKey: string;
  x: number;
  z: number;
  rotY: number;
  page: string;
};

export type GatherIntent = {
  nodeId: string;
};

export type ClientPayloads = {
  [ClientMessage.Move]: MoveIntent;
  [ClientMessage.Chat]: ChatIntent;
  [ClientMessage.PlacePiece]: PlacePieceIntent;
  [ClientMessage.Gather]: GatherIntent;
};

// ---- Server -> Client -------------------------------------------------------

export const ServerMessage = {
  /** A new chat line was accepted (also mirrored in room state history). */
  Chat: 'chat',
  /** An intent was refused; surface a quiet UI hint. */
  Rejected: 'rejected',
} as const;
export type ServerMessageType = (typeof ServerMessage)[keyof typeof ServerMessage];

export type ChatBroadcast = {
  id: string;
  playerId: string;
  name: string;
  text: string;
  at: number;
};

export type RejectionReason =
  | 'bad-protocol'
  | 'bad-auth'
  | 'rate-limited'
  | 'too-far'
  | 'not-allowed'
  | 'node-empty'
  | 'room-full'
  | 'invalid';

export type Rejected = {
  /** Which client message was refused. */
  action: ClientMessageType;
  reason: RejectionReason;
};

export type ServerPayloads = {
  [ServerMessage.Chat]: ChatBroadcast;
  [ServerMessage.Rejected]: Rejected;
};
