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

import type { AccountInventory, AvatarRef, MailItem } from './state';
import type { AvatarDesign } from './avatarDesign';
import type {
  AskToLeaveIntent,
  EnterHomeIntent,
  EntryResult,
  FriendAnswerIntent,
  FriendNotice,
  FriendRemoveIntent,
  FriendRequestIntent,
  FriendsSnapshot,
  HomeExit,
  HomePolicy,
  KnockAnswerIntent,
  KnockCleared,
  KnockNotice,
} from './guests';
import type {
  CaseDetail,
  CaseRemoveIntent,
  CaseRequestIntent,
  CaseResult,
  CaseSetIntent,
  CaseShowIntent,
  CaseStockIntent,
  CaseTakeIntent,
} from './cases';

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
  /** Legacy neighborhood-code route. Omitted for account-managed worlds. */
  inviteCode?: string;
  /** Durable database world selected from the signed-in account desk. */
  worldId?: string;
  /** Short-lived Clerk session token. Never place this in a URL. */
  sessionToken?: string;
  /**
   * Creating may mint a new neighborhood. Joining may only open a live or
   * previously persisted one. The server enforces this distinction.
   */
  intent: 'create' | 'join';
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
  /** Send a durable letter to another paper-passport account. */
  SendMail: 'send-mail',
  /** Move one unclaimed parcel into the server-owned account inventory. */
  ClaimMail: 'claim-mail',
  /** Wear a design into shared play: validate, store on the account, broadcast. */
  WearDesign: 'wear-design',
  /**
   * Ask for another player's card — the account-owned facts a live avatar
   * can't reveal on its own (papering-since date, any wardrobe designs
   * they've opted to show). See avatar-and-identity.md §3.
   */
  RequestPlayerCard: 'request-player-card',
  /**
   * Publish where this account's home is, once per connect — the server
   * stamps the display name from the live player, never trusting a claimed
   * one. See `HomeMarker` in state.ts.
   */
  SetHome: 'set-home',
  /** Ask another account to be friends. Mutual once they say yes. */
  FriendRequest: 'friend-request',
  /** Answer a friend request that was made to me. */
  FriendAnswer: 'friend-answer',
  /** Remove a friend, or withdraw a request I made. */
  FriendRemove: 'friend-remove',
  /** Set who may come through my front door. */
  SetHomePolicy: 'set-home-policy',
  /** Go in, or knock: the server decides which. My own home always works. */
  EnterHome: 'enter-home',
  /** Step back out of the home I am inside. */
  LeaveHome: 'leave-home',
  /** Answer a knock: let them in, or not right now. */
  KnockAnswer: 'knock-answer',
  /** Ask a guest to leave my home. */
  AskToLeave: 'ask-to-leave',
  /** Owner: change a display case's mode, label or per-visitor limit. */
  CaseSet: 'case-set',
  /** Owner: move a stack from my pouch into a free case. */
  CaseStock: 'case-stock',
  /** Owner: put a trinket's look on a show case. */
  CaseShow: 'case-show',
  /** Owner: take a stack back into my pouch, or a trinket off the case. */
  CaseRemove: 'case-remove',
  /** Take one from a free case. */
  CaseTake: 'case-take',
  /** Ask what a case means for me: my allowance, and the log if it is mine. */
  CaseRequest: 'case-request',
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
  /** Which material option the piece was built from; see PlacedPiece. */
  material: string;
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

export type SendMailIntent = {
  /** Durable passport id, never a transient room session id. */
  toAccountId: string;
  text: string;
  attachment?: MailAttachmentIntent;
};

export type MailAttachmentIntent =
  | { kind: 'chips'; quantity: number }
  | { kind: 'resource' | 'tool' | 'item'; itemId: string; quantity: number };

export type ClaimMailIntent = { mailId: string };

/**
 * Wear a design into shared play (avatar Phase D). The server validates and
 * stores the design on the account, then broadcasts the resolved drawingKey —
 * wearing is the explicit act that publishes your art.
 */
export type WearDesignIntent = {
  design: AvatarDesign;
  /**
   * The fallback tint for remote renderers, in the client's own AvatarRef.
   * The server cannot derive it (paper catalogs are client art), so the
   * wearer sends the same hex their local ref carried, validated as one.
   */
  edgeColor: string;
};

/** Durable account id of the player whose card is being opened. */
export type PlayerCardIntent = {
  accountId: string;
};

export type SetHomeIntent = {
  x: number;
  z: number;
  page: string;
  /** Finished house parts, for neighbors to draw. Older clients omit it. */
  parts?: string[];
  /** The part under construction, or ''. */
  building?: string;
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
  [ClientMessage.SendMail]: SendMailIntent;
  [ClientMessage.ClaimMail]: ClaimMailIntent;
  [ClientMessage.WearDesign]: WearDesignIntent;
  [ClientMessage.RequestPlayerCard]: PlayerCardIntent;
  [ClientMessage.SetHome]: SetHomeIntent;
  [ClientMessage.FriendRequest]: FriendRequestIntent;
  [ClientMessage.FriendAnswer]: FriendAnswerIntent;
  [ClientMessage.FriendRemove]: FriendRemoveIntent;
  [ClientMessage.SetHomePolicy]: HomePolicy;
  [ClientMessage.EnterHome]: EnterHomeIntent;
  [ClientMessage.LeaveHome]: Record<string, never>;
  [ClientMessage.KnockAnswer]: KnockAnswerIntent;
  [ClientMessage.AskToLeave]: AskToLeaveIntent;
  [ClientMessage.CaseSet]: CaseSetIntent;
  [ClientMessage.CaseStock]: CaseStockIntent;
  [ClientMessage.CaseShow]: CaseShowIntent;
  [ClientMessage.CaseRemove]: CaseRemoveIntent;
  [ClientMessage.CaseTake]: CaseTakeIntent;
  [ClientMessage.CaseRequest]: CaseRequestIntent;
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
  /** The recipient's complete bounded inbox, sent on join/reconnect/delivery. */
  Mailbox: 'mailbox',
  /** Private confirmation that a durable letter reached the server store. */
  MailSent: 'mail-sent',
  /** Complete server-owned transferable balance for this passport. */
  Inventory: 'inventory',
  /**
   * Answers a player-card request. `found: false` covers "no such account",
   * "guest, nothing to show", and "they've blocked you" identically — the
   * asker must never be able to tell those apart (avatar-and-identity.md §3:
   * "nothing to show", not "blocked you", which invites testing).
   */
  PlayerCard: 'player-card',
  /** My friends and pending requests, whole, on join and after every change. */
  Friends: 'friends',
  /** One-off news about a friendship, for a toast: asked, accepted, removed. */
  FriendNotice: 'friend-notice',
  /** My own door settings, echoed on join and after every change. Private. */
  HomePolicy: 'home-policy',
  /** How a request to go in ended. See `EntryOutcome`. */
  EntryResult: 'entry-result',
  /** Somebody is at my door. */
  KnockNotice: 'knock-notice',
  /** That knock no longer needs an answer. */
  KnockCleared: 'knock-cleared',
  /** The server has taken me out of a home. */
  HomeExit: 'home-exit',
  /** How a display-case action ended. See `CaseOutcome`. */
  CaseResult: 'case-result',
  /** My allowance at a case, and the log if the case is mine. */
  CaseDetail: 'case-detail',
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

export type MailboxSnapshot = { items: MailItem[]; claimedIds: string[] };

export type PlayerCardInfo = {
  accountId: string;
  found: boolean;
  /** Server epoch ms the account was created — rendered as "papering since". */
  papersSince?: number;
  /** Design ids this account has opted (`sharedOnCard`) to show, newest first. */
  sharedDesignIds?: string[];
};

export type MailSent = {
  mailId: string;
  toAccountId: string;
};

export type ServerPayloads = {
  [ServerMessage.Chat]: ChatBroadcast;
  [ServerMessage.ChatHistory]: ChatHistory;
  [ServerMessage.Blocks]: BlockList;
  [ServerMessage.ReportFiled]: ReportFiled;
  [ServerMessage.Removed]: RemovedNotice;
  [ServerMessage.Rejected]: Rejected;
  [ServerMessage.Mailbox]: MailboxSnapshot;
  [ServerMessage.MailSent]: MailSent;
  [ServerMessage.Inventory]: AccountInventory;
  [ServerMessage.PlayerCard]: PlayerCardInfo;
  [ServerMessage.Friends]: FriendsSnapshot;
  [ServerMessage.FriendNotice]: FriendNotice;
  [ServerMessage.HomePolicy]: HomePolicy;
  [ServerMessage.EntryResult]: EntryResult;
  [ServerMessage.KnockNotice]: KnockNotice;
  [ServerMessage.KnockCleared]: KnockCleared;
  [ServerMessage.HomeExit]: HomeExit;
  [ServerMessage.CaseResult]: CaseResult;
  [ServerMessage.CaseDetail]: CaseDetail;
};
