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
  /** Human-facing matchmaking key. Internal Colyseus room ids stay private. */
  inviteCode: string;
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
  /** Stop delivering this account's chat to me. Personal, instant, silent. */
  Block: 'block',
  /** Undo a block. */
  Unblock: 'unblock',
  /** File a safety report about a message or a player. */
  Report: 'report',
  /** Owner only: remove someone from this neighborhood. */
  Remove: 'remove',
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

/**
 * Blocking is deliberately account-scoped, not session-scoped: a block that
 * evaporated when somebody reconnected would be worse than no block at all.
 */
export type BlockIntent = {
  accountId: string;
};

/**
 * A safety report about a specific thing, not a general complaint.
 *
 * `messageId` is optional because you can report a player without a
 * particular line - but when it is present the server attaches that exact
 * message, which is the difference between evidence and hearsay.
 *
 * Note what is NOT here: no free-form target, no category taxonomy to learn.
 * Reporting should take one click and a sentence.
 */
export type ReportIntent = {
  accountId: string;
  messageId?: string;
  details?: string;
};

/** Owner only. The server checks; the client merely asks. */
export type RemoveIntent = {
  accountId: string;
  /** Also refuse them if they come back with the same code. */
  ban?: boolean;
};

export type ClientPayloads = {
  [ClientMessage.Move]: MoveIntent;
  [ClientMessage.Chat]: ChatIntent;
  [ClientMessage.PlacePiece]: PlacePieceIntent;
  [ClientMessage.Gather]: GatherIntent;
  [ClientMessage.Block]: BlockIntent;
  [ClientMessage.Unblock]: BlockIntent;
  [ClientMessage.Report]: ReportIntent;
  [ClientMessage.Remove]: RemoveIntent;
};

// ---- Server -> Client -------------------------------------------------------

export const ServerMessage = {
  /** A new chat line, delivered only to recipients who have not blocked it. */
  Chat: 'chat',
  /**
   * The recent backlog, sent once on join.
   *
   * Chat used to live in synced room Schema, which meant every client got
   * every line and a block could not be honoured - the server had no way to
   * give two people different views of the same state. History-on-join plus
   * per-recipient broadcasts is what makes blocking real rather than
   * cosmetic. It also keeps the synced state small.
   */
  ChatHistory: 'chat-history',
  /** Your own block list, echoed on join and after every change. */
  Blocks: 'blocks',
  /** A report was filed; carries the receipt so it can be referred to. */
  ReportFiled: 'report-filed',
  /** You have been removed from this neighborhood, and why. */
  Removed: 'removed',
  /** An intent was refused; surface a quiet UI hint. */
  Rejected: 'rejected',
} as const;
export type ServerMessageType = (typeof ServerMessage)[keyof typeof ServerMessage];

export type ChatBroadcast = {
  id: string;
  /** Session id — transient, only useful for "who is that on screen". */
  playerId: string;
  /**
   * Durable account id of the speaker.
   *
   * Carried because blocking and reporting both act on the ACCOUNT: a
   * session id would stop meaning anything the moment they reconnected, so a
   * block made from a chat line has to be able to name something durable.
   */
  accountId: string;
  name: string;
  text: string;
  at: number;
};

export type ChatHistory = {
  lines: ChatBroadcast[];
};

export type BlockList = {
  /** Account ids this player has blocked. */
  accountIds: string[];
};

export type ReportFiled = {
  /** Show it to the reporter so they can quote it if they follow up. */
  receiptId: string;
};

export type RemovedNotice = {
  /** Plain words for the person it happened to. */
  reason: 'removed-by-owner' | 'banned';
};

export type RejectionReason =
  | 'bad-protocol'
  | 'bad-auth'
  | 'rate-limited'
  | 'too-far'
  | 'not-allowed'
  | 'node-empty'
  | 'room-full'
  | 'banned'
  | 'guest-not-allowed'
  | 'invalid';

export type Rejected = {
  /** Which client message was refused. */
  action: ClientMessageType;
  reason: RejectionReason;
};

export type ServerPayloads = {
  [ServerMessage.Chat]: ChatBroadcast;
  [ServerMessage.ChatHistory]: ChatHistory;
  [ServerMessage.Blocks]: BlockList;
  [ServerMessage.ReportFiled]: ReportFiled;
  [ServerMessage.Removed]: RemovedNotice;
  [ServerMessage.Rejected]: Rejected;
};
