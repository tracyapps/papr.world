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

import { Client, getStateCallbacks, MatchMakeError, type Room } from '@colyseus/sdk';
import {
  CLIENT_INTENT_HZ,
  ClientMessage,
  DEFAULT_ROOM,
  PROTOCOL_VERSION,
  ServerMessage,
  decodeCaseItems,
  type CaseDetail,
  type CaseRemoveIntent,
  type CaseResult,
  type CaseSetIntent,
  type CaseShowIntent,
  type CaseState,
  type CaseStockIntent,
  type CaseTakeIntent,
  type AccountCredentials,
  type AccountInventory,
  type AvatarRef,
  type BlockIntent,
  type AskToLeaveIntent,
  type BlockList,
  type ChatBroadcast,
  type ChatHistory,
  type ChatIntent,
  type ClaimMailIntent,
  type EnterHomeIntent,
  type EntryResult,
  type FriendAnswerIntent,
  type FriendNotice,
  type FriendRemoveIntent,
  type FriendRequestIntent,
  type FriendsSnapshot,
  type HomeExit,
  type HomePolicy,
  type KnockAnswerIntent,
  type KnockCleared,
  type KnockNotice,
  type GatherIntent,
  type JoinOptions,
  type MoveIntent,
  type MailboxSnapshot,
  type MailSent,
  type PlacePieceIntent,
  type PlacedPiece,
  type PlayerState,
  type Rejected,
  type RemoveIntent,
  type RemovedNotice,
  type ReportFiled,
  type ReportIntent,
  type ResourceNode,
  type SendMailIntent,
  type HomeMarker,
  type PlayerCardInfo,
  type PlayerCardIntent,
  type SetHomeIntent,
  type WearDesignIntent,
  splitHomeParts,
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
  /** A server-owned gather node appeared or changed. */
  onNodeAdd?: (node: ResourceNode) => void;
  onNodeUpdate?: (node: ResourceNode) => void;
  onNodeRemove?: (id: string) => void;
  /** A chat line was accepted by the server. */
  onChat?: (line: ChatBroadcast) => void;
  /** The backlog, once, on join. Already filtered by your blocks. */
  onChatHistory?: (lines: ChatBroadcast[]) => void;
  /** Your own block list, on join and after every change. */
  onBlocks?: (accountIds: string[]) => void;
  /** A safety report was filed; carries the receipt. */
  onReportFiled?: (receiptId: string) => void;
  /** Complete bounded account inbox, on join/reconnect and live delivery. */
  onMailbox?: (items: MailboxSnapshot['items']) => void;
  /** Server-owned claimed ids accompany the mailbox snapshot. */
  onClaimedMail?: (ids: string[]) => void;
  /** Passport-scoped transferable balance. */
  onInventory?: (inventory: AccountInventory) => void;
  /** Private receipt for a letter durably accepted by the server. */
  onMailSent?: (receipt: MailSent) => void;
  /** You were removed from the neighborhood. */
  onRemoved?: (notice: RemovedNotice) => void;
  /** An intent was refused — surface a quiet hint. */
  onRejected?: (info: Rejected) => void;
  /**
   * The socket died and the SDK has started trying to get it back. This is
   * NOT the end of the visit — the server holds the seat for about a minute.
   */
  onDropped?: (code: number) => void;
  /** It worked: same seat, same avatar, same neighbourhood. */
  onReconnected?: () => void;
  /** The visit is over, for one of the reasons in closeReason.ts. */
  onLeave?: (code: number) => void;
  /** Answers a player-card request (avatar-and-identity.md §3). */
  onPlayerCard?: (info: PlayerCardInfo) => void;
  /** A neighbor's home marker appeared (self is filtered out by the caller). */
  onHomeAdd?: (home: HomeMarker) => void;
  /** A neighbor's home marker moved or was renamed. */
  onHomeUpdate?: (home: HomeMarker) => void;
  /** A neighbor's home marker was withdrawn (they left the account entirely). */
  onHomeRemove?: (accountId: string) => void;
  /** A remote player went into a home (its owner's account id) or came out (''). */
  onPlayerInside?: (id: string, inside: string) => void;
  /** Your whole friends list, requests included. On join and after every change. */
  onFriends?: (snapshot: FriendsSnapshot) => void;
  /** One sentence's worth of news about a friendship. */
  onFriendNotice?: (notice: FriendNotice) => void;
  /** Your own door settings, on join and after every change. */
  onHomePolicy?: (policy: HomePolicy) => void;
  /** How your request to come in ended. */
  onEntryResult?: (result: EntryResult) => void;
  /** Somebody is at your door. */
  onKnockNotice?: (notice: KnockNotice) => void;
  /** A knock no longer needs an answer. */
  onKnockCleared?: (cleared: KnockCleared) => void;
  /** The owner asked you to leave. */
  onHomeExit?: (exit: HomeExit) => void;
  /** A display case appeared, or changed (mode, label, limit, or what it holds). */
  onCaseChange?: (state: CaseState) => void;
  onCaseRemove?: (id: string) => void;
  /** How your display-case action ended. */
  onCaseResult?: (result: CaseResult) => void;
  /** Your allowance at a case, and its log if it is yours. */
  onCaseDetail?: (detail: CaseDetail) => void;
};

export type NetConnection = {
  /** Our own session id, so the renderer can skip drawing ourselves twice. */
  readonly sessionId: string;
  /** Smoothly-interpolated transform for a remote player, or null. */
  sampleRemote: (id: string, now?: number) => RemoteSample | null;
  /** Ids of remote players currently tracked. */
  remoteIds: () => string[];
  /** Whether the server says WE may remove people. Drawn from room state. */
  isOwner: () => boolean;
  /** The account behind a session id, for blocking and reporting. */
  accountFor: (sessionId: string) => string | null;
  sendMove: (intent: MoveIntent) => void;
  sendChat: (text: string) => void;
  sendPlacePiece: (intent: PlacePieceIntent) => void;
  sendGather: (nodeId: string) => void;
  /** Stop receiving this account's chat. Personal, instant, never announced. */
  sendBlock: (accountId: string) => void;
  sendUnblock: (accountId: string) => void;
  /** File a safety report about a player, optionally about one message. */
  sendReport: (report: ReportIntent) => void;
  /** Owner only; the server checks and refuses everyone else. */
  sendRemove: (intent: RemoveIntent) => void;
  sendMail: (intent: SendMailIntent) => void;
  sendClaimMail: (intent: ClaimMailIntent) => void;
  /** Publish the worn design to the account wardrobe and everyone watching. */
  sendWearDesign: (intent: WearDesignIntent) => void;
  /** Ask for another player's card (avatar-and-identity.md §3). */
  sendPlayerCardRequest: (intent: PlayerCardIntent) => void;
  /** Publish where your own Home marker sits, for neighbors to see. */
  sendSetHome: (intent: SetHomeIntent) => void;
  /** Ask to be friends, with an optional short note that rides along. */
  sendFriendRequest: (accountId: string, message?: string) => void;
  sendFriendAnswer: (accountId: string, accept: boolean) => void;
  sendFriendRemove: (accountId: string) => void;
  sendSetHomePolicy: (policy: HomePolicy) => void;
  /** Ask to come into a home (your own included). The answer is an EntryResult. */
  sendEnterHome: (host: string) => void;
  sendLeaveHome: () => void;
  /** Owner: let a knocker in, or not right now. */
  sendKnockAnswer: (visitor: string, admit: boolean) => void;
  /** Owner: ask one guest to step out. Not a block. */
  sendAskToLeave: (accountId: string) => void;
  /** Display cases. The server decides; the answer is a CaseResult. */
  sendCaseSet: (intent: CaseSetIntent) => void;
  sendCaseStock: (intent: CaseStockIntent) => void;
  sendCaseShow: (intent: CaseShowIntent) => void;
  sendCaseRemove: (intent: CaseRemoveIntent) => void;
  sendCaseTake: (intent: CaseTakeIntent) => void;
  sendCaseRequest: (id: string) => void;
  disconnect: () => void;
};

export type ConnectOptions = {
  /** e.g. "ws://localhost:2567" for solo/LAN, or "wss://your-host" hosted. */
  endpoint: string;
  name: string;
  avatar: AvatarRef;
  room?: string;
  inviteCode?: string;
  worldId?: string;
  sessionToken?: string;
  intent: 'create' | 'join';
  /**
   * Paper passport from src/net/passport.ts. Omit to join as a guest —
   * fine for a first look, but nothing made will be credited durably.
   */
  account?: AccountCredentials;
};

type MatchmakerClient = Pick<Client, 'join' | 'joinOrCreate'>;

/**
 * Matchmaking policy kept separate so the empty-room recovery behavior can
 * be proven without opening a socket.
 */
export async function enterNeighborhoodRoom(
  client: MatchmakerClient,
  roomName: string,
  options: JoinOptions,
): Promise<Room> {
  if (options.intent === 'create') return client.joinOrCreate(roomName, options);
  try {
    return await client.join(roomName, options);
  } catch (error) {
    // 521 is Colyseus MATCHMAKE_INVALID_CRITERIA: no live room matched this
    // invite. Do not disguise authentication, capacity, or transport failures
    // as an empty neighborhood.
    if (!(error instanceof MatchMakeError) || error.code !== 521) throw error;
    // Empty rooms disappear from matchmaking. Ask the server to reopen the
    // process; PaperRoom permits this only when that code has a saved world.
    return client.joinOrCreate(roomName, options);
  }
}

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
    intent: options.intent,
    ...(options.inviteCode ? { inviteCode: options.inviteCode } : {}),
    ...(options.worldId ? { worldId: options.worldId } : {}),
    ...(options.sessionToken ? { sessionToken: options.sessionToken } : {}),
    ...(options.account ? { account: options.account } : {}),
  };

  const room = await enterNeighborhoodRoom(client, options.room ?? DEFAULT_ROOM, joinOptions);
  const buffer = new RemotePlayerBuffer();
  const selfId = room.sessionId;
  const stateCallbacks = getStateCallbacks(room);
  if (!stateCallbacks) throw new Error('The neighborhood did not provide schema state.');

  wirePlayers(room, stateCallbacks, selfId, buffer, callbacks);
  wirePieces(room, stateCallbacks, callbacks);
  wireNodes(room, stateCallbacks, callbacks);
  wireHomes(room, stateCallbacks, callbacks);
  wireCases(room, stateCallbacks, callbacks);
  wireMessages(room, callbacks);
  // Three distinct endings, and they used to be one.
  //
  // The SDK reconnects by itself: on an unexpected close it fires onDrop and
  // then retries with exponential backoff, reusing THIS room object and this
  // state, so nothing below needs re-wiring and no avatars need rebuilding.
  // Messages sent while it is away are queued and flushed on return.
  //
  // onLeave now only fires when it is genuinely over — a deliberate leave, a
  // removal, or the retries running out (code 4003).
  room.onDrop((code: number) => callbacks.onDropped?.(code));
  room.onReconnect(() => callbacks.onReconnected?.());
  room.onLeave((code) => callbacks.onLeave?.(code));

  // Throttle outbound movement so we don't flood past the server tick.
  const minMoveGap = 1000 / CLIENT_INTENT_HZ;
  let lastMoveSent = 0;

  return {
    sessionId: selfId,
    sampleRemote: (id, now) => buffer.sample(id, now),
    remoteIds: () => buffer.ids(),
    // Read live from room state rather than cached: the server owns this, and
    // it is only ever used to decide whether to DRAW a control. Every removal
    // is authorised again server-side.
    isOwner: () => Boolean((room.state as any)?.players?.get(selfId)?.isOwner),
    accountFor: (sessionId) =>
      ((room.state as any)?.players?.get(sessionId)?.accountId as string | undefined) ?? null,
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
    sendBlock: (accountId) => {
      const payload: BlockIntent = { accountId };
      room.send(ClientMessage.Block, payload);
    },
    sendUnblock: (accountId) => {
      const payload: BlockIntent = { accountId };
      room.send(ClientMessage.Unblock, payload);
    },
    sendReport: (report) => room.send(ClientMessage.Report, report),
    sendRemove: (intent) => room.send(ClientMessage.Remove, intent),
    sendMail: (intent) => room.send(ClientMessage.SendMail, intent),
    sendClaimMail: (intent) => room.send(ClientMessage.ClaimMail, intent),
    sendWearDesign: (intent) => room.send(ClientMessage.WearDesign, intent),
    sendPlayerCardRequest: (intent) => room.send(ClientMessage.RequestPlayerCard, intent),
    sendSetHome: (intent) => room.send(ClientMessage.SetHome, intent),
    sendFriendRequest: (accountId, message) => {
      const payload: FriendRequestIntent = { accountId, ...(message ? { message } : {}) };
      room.send(ClientMessage.FriendRequest, payload);
    },
    sendFriendAnswer: (accountId, accept) => {
      const payload: FriendAnswerIntent = { accountId, accept };
      room.send(ClientMessage.FriendAnswer, payload);
    },
    sendFriendRemove: (accountId) => {
      const payload: FriendRemoveIntent = { accountId };
      room.send(ClientMessage.FriendRemove, payload);
    },
    sendSetHomePolicy: (policy) => room.send(ClientMessage.SetHomePolicy, policy),
    sendEnterHome: (host) => {
      const payload: EnterHomeIntent = { host };
      room.send(ClientMessage.EnterHome, payload);
    },
    sendLeaveHome: () => room.send(ClientMessage.LeaveHome, {}),
    sendKnockAnswer: (visitor, admit) => {
      const payload: KnockAnswerIntent = { visitor, admit };
      room.send(ClientMessage.KnockAnswer, payload);
    },
    sendAskToLeave: (accountId) => {
      const payload: AskToLeaveIntent = { accountId };
      room.send(ClientMessage.AskToLeave, payload);
    },
    sendCaseSet: (intent) => room.send(ClientMessage.CaseSet, intent),
    sendCaseStock: (intent) => room.send(ClientMessage.CaseStock, intent),
    sendCaseShow: (intent) => room.send(ClientMessage.CaseShow, intent),
    sendCaseRemove: (intent) => room.send(ClientMessage.CaseRemove, intent),
    sendCaseTake: (intent) => room.send(ClientMessage.CaseTake, intent),
    sendCaseRequest: (id) => room.send(ClientMessage.CaseRequest, { id }),
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
    inside: raw.inside ?? '',
  };
}

function readPiece(id: string, raw: any): PlacedPiece {
  return {
    id,
    templateKey: raw.templateKey,
    x: raw.x,
    z: raw.z,
    rotY: raw.rotY,
    material: raw.material ?? '',
    makerId: raw.makerId,
    page: raw.page,
  };
}

function readNode(id: string, raw: any): ResourceNode {
  return {
    id,
    kind: raw.kind ?? '',
    x: raw.x,
    z: raw.z,
    page: raw.page ?? '',
    remaining: raw.remaining,
    respawnAt: raw.respawnAt || null,
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
    let lastInside: string = raw.inside ?? '';
    $(raw).onChange(() => {
      buffer.push(id, raw.x, raw.z, raw.facing);
      const inside: string = raw.inside ?? '';
      if (inside !== lastInside) {
        lastInside = inside;
        callbacks.onPlayerInside?.(id, inside);
      }
    });
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

function wireNodes(
  room: Room,
  $: NonNullable<ReturnType<typeof getStateCallbacks>>,
  callbacks: NetCallbacks,
): void {
  $(room.state as any).nodes.onAdd((raw: any, id: string) => {
    callbacks.onNodeAdd?.(readNode(id, raw));
    $(raw).onChange(() => callbacks.onNodeUpdate?.(readNode(id, raw)));
  });
  $(room.state as any).nodes.onRemove((_raw: any, id: string) => callbacks.onNodeRemove?.(id));
}

function readHome(accountId: string, raw: any): HomeMarker {
  return {
    accountId,
    name: raw.name,
    x: raw.x,
    z: raw.z,
    page: raw.page,
    parts: splitHomeParts(raw.parts ?? ''),
    building: raw.building ?? '',
    open: Boolean(raw.open),
  };
}

/**
 * Home markers (avatar-and-identity.md / land-and-dwellings.md): keyed by
 * accountId rather than session id, since a home persists whether or not
 * that player is currently online.
 */
function wireHomes(
  room: Room,
  $: NonNullable<ReturnType<typeof getStateCallbacks>>,
  callbacks: NetCallbacks,
): void {
  $(room.state as any).homes.onAdd((raw: any, accountId: string) => {
    callbacks.onHomeAdd?.(readHome(accountId, raw));
    $(raw).onChange(() => callbacks.onHomeUpdate?.(readHome(accountId, raw)));
  });
  $(room.state as any).homes.onRemove((_raw: any, accountId: string) =>
    callbacks.onHomeRemove?.(accountId));
}

function readCase(id: string, raw: any): CaseState {
  const count = Number(raw.limitCount) || 0;
  const windowMinutes = Number(raw.limitWindow) || 0;
  return {
    id,
    owner: raw.owner ?? '',
    mode: raw.mode === 'free' ? 'free' : 'show',
    label: raw.label ?? '',
    items: decodeCaseItems(raw.items ?? ''),
    limit: count > 0 && windowMinutes > 0 ? { count, windowMinutes } : null,
  };
}

/** Display cases, keyed by the id of the piece they are. */
function wireCases(
  room: Room,
  $: NonNullable<ReturnType<typeof getStateCallbacks>>,
  callbacks: NetCallbacks,
): void {
  $(room.state as any).cases.onAdd((raw: any, id: string) => {
    callbacks.onCaseChange?.(readCase(id, raw));
    $(raw).onChange(() => callbacks.onCaseChange?.(readCase(id, raw)));
  });
  $(room.state as any).cases.onRemove((_raw: any, id: string) => callbacks.onCaseRemove?.(id));
}

/**
 * Every server-sent event.
 *
 * Chat used to arrive two ways at once — synced room state for the backlog and
 * a broadcast for the live line — which needed de-duplication by id. It now
 * arrives only as messages, because synced state is identical for everybody
 * and therefore could never honour a personal block. History comes once on
 * join, already filtered; live lines are sent per recipient.
 */
function wireMessages(room: Room, callbacks: NetCallbacks): void {
  room.onMessage(ServerMessage.Chat, (line: ChatBroadcast) => callbacks.onChat?.(line));
  room.onMessage(ServerMessage.ChatHistory, (history: ChatHistory) =>
    callbacks.onChatHistory?.(history.lines ?? []));
  room.onMessage(ServerMessage.Blocks, (list: BlockList) =>
    callbacks.onBlocks?.(list.accountIds ?? []));
  room.onMessage(ServerMessage.ReportFiled, (filed: ReportFiled) =>
    callbacks.onReportFiled?.(filed.receiptId));
  room.onMessage(ServerMessage.Mailbox, (snapshot: MailboxSnapshot) => {
    callbacks.onMailbox?.(snapshot.items ?? []);
    callbacks.onClaimedMail?.(snapshot.claimedIds ?? []);
  });
  room.onMessage(ServerMessage.MailSent, (receipt: MailSent) => callbacks.onMailSent?.(receipt));
  room.onMessage(ServerMessage.Inventory, (inventory: AccountInventory) =>
    callbacks.onInventory?.(inventory));
  room.onMessage(ServerMessage.Removed, (notice: RemovedNotice) =>
    callbacks.onRemoved?.(notice));
  room.onMessage(ServerMessage.Rejected, (info: Rejected) => callbacks.onRejected?.(info));
  room.onMessage(ServerMessage.PlayerCard, (info: PlayerCardInfo) => callbacks.onPlayerCard?.(info));
  room.onMessage(ServerMessage.Friends, (snapshot: FriendsSnapshot) => callbacks.onFriends?.({
    friends: snapshot.friends ?? [],
    incoming: snapshot.incoming ?? [],
    outgoing: snapshot.outgoing ?? [],
  }));
  room.onMessage(ServerMessage.FriendNotice, (notice: FriendNotice) => callbacks.onFriendNotice?.(notice));
  room.onMessage(ServerMessage.HomePolicy, (policy: HomePolicy) => callbacks.onHomePolicy?.(policy));
  room.onMessage(ServerMessage.EntryResult, (result: EntryResult) => callbacks.onEntryResult?.(result));
  room.onMessage(ServerMessage.KnockNotice, (notice: KnockNotice) => callbacks.onKnockNotice?.(notice));
  room.onMessage(ServerMessage.KnockCleared, (cleared: KnockCleared) => callbacks.onKnockCleared?.(cleared));
  room.onMessage(ServerMessage.HomeExit, (exit: HomeExit) => callbacks.onHomeExit?.(exit));
  room.onMessage(ServerMessage.CaseResult, (result: CaseResult) => callbacks.onCaseResult?.(result));
  room.onMessage(ServerMessage.CaseDetail, (detail: CaseDetail) => callbacks.onCaseDetail?.(detail));
}
