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
  sanitizeWorldId,
  sanitizePlacePiece,
  sanitizeAccountCredentials,
  sanitizeClaimMail,
  sanitizeSendMail,
  sanitizeAvatarDesign,
  sanitizeSetHome,
  sanitizeHomePolicy,
  sanitizeAccountRef,
  isGuestAccount,
  joinHomeParts,
  splitHomeParts,
  homePolicyOrDefault,
  DEFAULT_HOME_POLICY,
  INTERIOR_SPACE,
  HOME_EXIT_RADIUS,
  isFiniteNumber,
  DISPLAY_CASE_TEMPLATE,
  encodeCaseItems,
  sanitizeCaseRequest,
  sanitizeCaseSet,
  sanitizeCaseShow,
  sanitizeCaseSlot,
  sanitizeCaseStock,
  type CaseAction,
  type CaseOutcome,
  type CaseResult,
  type BlockIntent,
  type ChatBroadcast,
  type ChatIntent,
  type ClaimMailIntent,
  type GatherIntent,
  type JoinOptions,
  type MoveIntent,
  type PlacePieceIntent,
  type PlacedPiece,
  type RejectionReason,
  type WearDesignIntent,
  type PlayerCardIntent,
  type PlayerCardInfo,
  type SetHomeIntent,
  type HomeMarker,
  type RemoveIntent,
  type ReportIntent,
  type ResourceNode,
  type RoomSave,
  type SendMailIntent,
  type HomePolicy,
  type FriendRequestIntent,
  type FriendAnswerIntent,
  type FriendRemoveIntent,
  type FriendsSnapshot,
  type FriendNoticeKind,
  type EnterHomeIntent,
  type KnockAnswerIntent,
  type AskToLeaveIntent,
  type EntryOutcome,
} from '../../../shared/src/index';
import { accounts, avatarDesigns, blocks, friends, isOwner, mail, moderation, OWNER_ACCOUNT, roomStore } from '../stores';
import { KnockBook, decideAccess } from '../homeAccess';
import { readAdminConfig, verifyClerkSessionToken } from '../admin';
import { database } from '../runtime';
import { authorizeManagedWorldEntry } from '../worldAuthorization';
import { publicCase, visitorAllowance, type CaseEdit, type CaseRecord } from '../cases';
import {
  CaseSchema,
  HomeSchema,
  NodeSchema,
  PaperRoomState,
  PieceSchema,
  PlayerSchema,
} from '../schema/PaperRoomState';

/** Per-session bookkeeping the schema shouldn't carry. */
type Session = {
  lastMoveAt: number;
  lastChatAt: number;
  lastMailAt: number;
  lastEntryAt: number;
  /**
   * Set when `player.inside` changes. The next move may jump between the
   * surface and the interior space (the anti-teleport clamp would otherwise
   * crawl a player 56,000 units), and is checked against where that jump may
   * land.
   */
  jump: 'enter' | 'exit' | null;
  /** The home just left, so an exit can be checked against its door. */
  exitHost: string;
};

/** Never let a burst of door requests through: at most about four a second. */
const ENTRY_INTERVAL_MS = 250;

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
  metadata: { inviteCode?: string; worldId?: string };
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

  /** Private door settings by account. Only `open` is mirrored into synced state. */
  private policies = new Map<string, HomePolicy>();
  /** Knocks and "let in" permits for the doors in this neighborhood. */
  private knocks = new KnockBook();
  /** Chat line id -> the home it was said in ('' outdoors), so history keeps to its room. */
  private chatScopes = new Map<string, string>();
  private unsubscribeMail: (() => void) | null = null;
  private unsubscribeInventory: (() => void) | null = null;

  /** Authenticate before matchmaking is allowed to create or reveal a room. */
  static override async onAuth(
    _token: string,
    options: JoinOptions,
  ): Promise<string> {
    if (!options || options.protocol !== PROTOCOL_VERSION) throw new Error('bad-protocol');
    if (options.intent !== 'create' && options.intent !== 'join') throw new Error('bad-intent');

    const worldId = sanitizeWorldId(options.worldId);
    if (worldId) {
      if (worldId !== options.worldId) throw new Error('bad-auth');
      const accountId = await authorizeManagedWorldEntry(
        { database, clerk: readAdminConfig(), verifyToken: verifyClerkSessionToken },
        worldId,
        typeof options.sessionToken === 'string' ? options.sessionToken : '',
      );
      if (!accountId) throw new Error(database ? 'not-allowed' : 'bad-auth');
      return accountId;
    }

    if (sanitizeInviteCode(options.inviteCode) !== options.inviteCode) {
      throw new Error('bad-invite-code');
    }
    if (options.account !== undefined) {
      const creds = sanitizeAccountCredentials(options.account);
      if (!creds || !accounts.verify(creds.id, creds.secret, sanitizeName(options.name))) {
        throw new Error('bad-auth');
      }
      return creds.id;
    }
    if (OWNER_ACCOUNT) throw new Error('guest-not-allowed');
    return 'guest';
  }

  override onCreate(options: JoinOptions): void {
    if (options.intent !== 'create' && options.intent !== 'join') throw new Error('bad-intent');
    const worldId = sanitizeWorldId(options?.worldId);
    if (worldId) {
      if (worldId !== options.worldId) throw new Error('bad-world-id');
      this.persistenceId = `world-${worldId}`;
    } else {
      const inviteCode = sanitizeInviteCode(options?.inviteCode);
      if (!inviteCode || inviteCode !== options.inviteCode) throw new Error('bad-invite-code');
      this.inviteCode = inviteCode;
      this.persistenceId = inviteCode === LEGACY_INVITE_CODE
        ? DEFAULT_PERSISTENCE_ID
        : `invite-${inviteCode}`;
      // Colyseus disposes an empty room process, not its saved world. A join
      // link may recreate that process only when durable state proves the code
      // already existed. Otherwise guessing a code could silently mint a world.
      if (options.intent === 'join' && !roomStore.has(this.persistenceId)) {
        throw new Error('neighborhood-not-found');
      }
    }
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
    this.onMessage(ClientMessage.SendMail, (client, msg: SendMailIntent) =>
      this.handleSendMail(client, msg),
    );
    this.onMessage(ClientMessage.ClaimMail, (client, msg: ClaimMailIntent) =>
      this.handleClaimMail(client, msg),
    );
    this.onMessage(ClientMessage.WearDesign, (client, msg: WearDesignIntent) =>
      this.handleWearDesign(client, msg),
    );
    this.onMessage(ClientMessage.RequestPlayerCard, (client, msg: PlayerCardIntent) =>
      this.handlePlayerCardRequest(client, msg),
    );
    this.onMessage(ClientMessage.SetHome, (client, msg: SetHomeIntent) =>
      this.handleSetHome(client, msg),
    );
    this.onMessage(ClientMessage.FriendRequest, (client, msg: FriendRequestIntent) =>
      this.handleFriendRequest(client, msg),
    );
    this.onMessage(ClientMessage.FriendAnswer, (client, msg: FriendAnswerIntent) =>
      this.handleFriendAnswer(client, msg),
    );
    this.onMessage(ClientMessage.FriendRemove, (client, msg: FriendRemoveIntent) =>
      this.handleFriendRemove(client, msg),
    );
    this.onMessage(ClientMessage.SetHomePolicy, (client, msg: HomePolicy) =>
      this.handleSetHomePolicy(client, msg),
    );
    this.onMessage(ClientMessage.EnterHome, (client, msg: EnterHomeIntent) =>
      this.handleEnterHome(client, msg),
    );
    this.onMessage(ClientMessage.LeaveHome, (client) => this.handleLeaveHome(client));
    this.onMessage(ClientMessage.KnockAnswer, (client, msg: KnockAnswerIntent) =>
      this.handleKnockAnswer(client, msg),
    );
    this.onMessage(ClientMessage.AskToLeave, (client, msg: AskToLeaveIntent) =>
      this.handleAskToLeave(client, msg),
    );
    this.onMessage(ClientMessage.CaseSet, (client, msg: unknown) => this.handleCaseSet(client, msg));
    this.onMessage(ClientMessage.CaseStock, (client, msg: unknown) => this.handleCaseStock(client, msg));
    this.onMessage(ClientMessage.CaseShow, (client, msg: unknown) => this.handleCaseShow(client, msg));
    this.onMessage(ClientMessage.CaseRemove, (client, msg: unknown) => this.handleCaseRemove(client, msg));
    this.onMessage(ClientMessage.CaseTake, (client, msg: unknown) => this.handleCaseTake(client, msg));
    this.onMessage(ClientMessage.CaseRequest, (client, msg: unknown) => this.handleCaseRequest(client, msg));

    // Mail belongs to accounts, not rooms. Every live room listens so a
    // recipient sees a delivery immediately even when sender and recipient
    // are visiting different neighborhood codes.
    this.unsubscribeMail = mail.subscribe((accountId) => this.sendMailboxToAccount(accountId));
    this.unsubscribeInventory = mail.subscribeInventory((accountId) =>
      this.sendInventoryToAccount(accountId));

    // Light housekeeping tick: refill spent resource nodes.
    this.setSimulationInterval(() => {
      this.refillNodes();
      this.expireKnocks();
    }, 1000);
  }

  override onJoin(client: Client, options: JoinOptions, auth?: string): void {
    const authenticatedAccountId = auth === 'guest'
      ? `guest:${client.sessionId}`
      : auth ?? `guest:${client.sessionId}`;
    // Saved room bans are available only after onCreate hydrates the room,
    // but onJoin still runs before state is sent to this client.
    if (this.banned.has(authenticatedAccountId)) throw new Error('banned');
    const player = new PlayerSchema();
    player.id = client.sessionId;
    player.accountId = authenticatedAccountId;
    player.name = sanitizeName(options.name);
    const avatar = sanitizeAvatar(options.avatar);
    player.avatar.preset = avatar.preset;
    // A worn drawing key survives only when the joining account actually
    // holds that design (avatar Phase D): a key from nothing, someone else's
    // wardrobe, or a guest renders the paper fallback instead. The room
    // consumes the account's fact; it never sees the art itself.
    player.avatar.drawingKey = avatarDesigns.resolveDrawingKey(authenticatedAccountId, avatar.drawingKey);
    player.avatar.edgeColor = avatar.edgeColor;
    // Spawn at the clearing until the client sends its first real position.
    player.x = 0;
    player.z = 0;
    player.facing = 0;
    player.page = '0,0';
    player.inside = '';

    player.isOwner = isOwner(player.accountId);

    this.state.players.set(client.sessionId, player);
    this.sessions.set(client.sessionId, {
      lastMoveAt: Date.now(), lastChatAt: 0, lastMailAt: 0, lastEntryAt: 0, jump: null, exitHost: '',
    });

    // The backlog, filtered the same way live chat is — otherwise a block
    // would hold for new lines and then hand you everything you blocked the
    // moment you reconnected.
    client.send(ServerMessage.ChatHistory, { lines: this.historyFor(player) });

    // Echo their own block list so the client can label people correctly
    // without keeping its own copy that could drift.
    client.send(ServerMessage.Blocks, { accountIds: blocks.list(player.accountId) });
    this.sendMailbox(client, player.accountId);
    this.sendInventory(client, player.accountId);
    this.briefOnGuests(client, player);
    if (!isGuestAccount(player.accountId)) {
      friends.rename(player.accountId, player.name);
      this.pushFriendsAround(player.accountId);
    }
  }

  /**
   * A deliberate departure: they closed the tab, went back to solo, or were
   * removed by the owner. Their paper self is put away.
   */
  override onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    this.state.players.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
    if (!player) return;
    // A knock from somebody who has gone needs no answer.
    for (const knock of this.knocks.withdraw(player.accountId)) this.clearKnockNotice(knock.host, knock.visitor);
    if (!isGuestAccount(player.accountId)) this.pushFriendsAround(player.accountId);
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

    client.send(ServerMessage.ChatHistory, { lines: this.historyFor(player) });
    client.send(ServerMessage.Blocks, { accountIds: blocks.list(player.accountId) });
    this.sendMailbox(client, player.accountId);
    this.sendInventory(client, player.accountId);
    this.briefOnGuests(client, player);
  }

  // ---- Handlers -------------------------------------------------------------

  private handleMove(client: Client, msg: MoveIntent): void {
    const player = this.state.players.get(client.sessionId);
    const session = this.sessions.get(client.sessionId);
    if (!player || !session || !msg) return;

    const now = Date.now();
    const dt = (now - session.lastMoveAt) / 1000;

    // The first move after going in or out is a jump between the surface and
    // the interior space. It is accepted only if it lands where that door
    // leads; anything else is put at the door instead of crawling there.
    if (session.jump && isFiniteNumber(msg.x) && isFiniteNumber(msg.z)) {
      const landing = this.landingFor(player, session);
      const near = Math.hypot(msg.x - landing.x, msg.z - landing.z) <= landing.radius;
      player.x = near ? msg.x : landing.x;
      player.z = near ? msg.z : landing.z;
      if (isFiniteNumber(msg.facing)) player.facing = msg.facing;
      if (typeof msg.page === 'string') player.page = msg.page;
      session.lastMoveAt = now;
      session.jump = null;
      return;
    }

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
    this.chatScopes.set(line.id, player.inside);
    while (this.chatLog.length > LIMITS.chatHistory) {
      const dropped = this.chatLog.shift();
      if (dropped) this.chatScopes.delete(dropped.id);
    }

    // Delivered person by person rather than broadcast, because that is the
    // whole point: someone who blocked this speaker simply never receives it.
    // The speaker always sees their own line — a block is about what YOU read,
    // not a punishment applied to them.
    for (const recipient of this.clients) {
      const listener = this.state.players.get(recipient.sessionId);
      if (!listener) continue;
      // A house keeps its chat to those inside it, and the lawn does not hear it.
      if (listener.inside !== player.inside) continue;
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
    const isCase = intent.templateKey === DISPLAY_CASE_TEMPLATE && !isGuestAccount(player.accountId);
    if (isCase) {
      let cases = 0;
      this.state.pieces.forEach((p) => {
        if (p.makerId === player.accountId && p.templateKey === DISPLAY_CASE_TEMPLATE) cases += 1;
      });
      if (cases >= LIMITS.casesPerPlayer) {
        this.reject(client, ClientMessage.PlacePiece, 'not-allowed');
        return;
      }
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
    // A display case is a piece with a held stock; its record is made with it.
    // (A guest's case stays a plain decoration: a guest has no pouch to stock it from.)
    if (isCase) this.syncCase(mail.createCase(piece.id, player.accountId));
    this.persist();
  }

  // ---- Display cases -----------------------------------------------------------
  //
  // The client asks; every rule is here or in ../cases.ts. Results go back as
  // `CaseResult` (quiet, never an error), and the case itself flows to
  // everyone through synced state.

  /** Mirror a case record into synced state, where the whole room can read it. */
  private syncCase(record: CaseRecord): void {
    const shown = publicCase(record);
    let schema = this.state.cases.get(shown.id);
    if (!schema) {
      schema = new CaseSchema();
      schema.id = shown.id;
      this.state.cases.set(shown.id, schema);
    }
    schema.owner = shown.owner;
    schema.mode = shown.mode;
    schema.label = shown.label;
    schema.items = encodeCaseItems(shown.items);
    schema.limitCount = shown.limit?.count ?? 0;
    schema.limitWindow = shown.limit?.windowMinutes ?? 0;
  }

  /**
   * Who is asking, and which case, and are they close enough. `null` means a
   * reply has already gone out.
   */
  private caseContext(client: Client, id: string | undefined, action: CaseAction) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !id) return null;
    const now = Date.now();
    const piece = this.state.pieces.get(id);
    if (!piece || piece.templateKey !== DISPLAY_CASE_TEMPLATE) {
      this.reject(client, `case-${action}`, 'invalid');
      return null;
    }
    const record = mail.caseRecord(id);
    if (!record) {
      this.reject(client, `case-${action}`, 'invalid');
      return null;
    }
    if (player.inside !== '' || piece.page !== player.page
      || Math.hypot(piece.x - player.x, piece.z - player.z) > LIMITS.caseReach + 1) {
      this.answerCase(client, id, action, 'too-far');
      return null;
    }
    return { player, record, now };
  }

  private answerCase(
    client: Client,
    id: string,
    action: CaseAction,
    outcome: CaseOutcome,
    extra: Partial<CaseResult> = {},
  ): void {
    client.send(ServerMessage.CaseResult, { id, action, outcome, ...extra } satisfies CaseResult);
  }

  /** What this asker personally needs: their own allowance, and the log if it is their case. */
  private sendCaseDetail(client: Client, player: { accountId: string }, record: CaseRecord, now: number): void {
    const mine = record.owner === player.accountId;
    // A blocked visitor is told what an empty case says: nothing for them right now.
    const blocked = !mine && blocks.isBlocked(record.owner, player.accountId);
    const allowance = blocked ? { remaining: 0, resetsAt: null } : visitorAllowance(record, player.accountId, now);
    client.send(ServerMessage.CaseDetail, {
      id: record.id,
      remaining: record.mode === 'free' ? allowance.remaining : null,
      resetsAt: allowance.resetsAt,
      ...(mine ? { log: record.log.map((entry) => ({ ...entry })) } : {}),
    });
  }

  private handleCaseSet(client: Client, raw: unknown): void {
    const intent = sanitizeCaseSet(raw);
    if (!intent) return this.reject(client, 'case-set', 'invalid');
    const context = this.caseContext(client, intent.id, 'set');
    if (!context) return;
    if (isGuestAccount(context.player.accountId)) return this.answerCase(client, intent.id, 'set', 'guest');
    const result = mail.caseSet(intent.id, context.player.accountId, intent);
    if (!result) return this.reject(client, 'case-set', 'invalid');
    this.finishCaseChange(client, context.player, 'set', intent.id, result, context.now);
  }

  private handleCaseStock(client: Client, raw: unknown): void {
    const intent = sanitizeCaseStock(raw);
    if (!intent) return this.reject(client, 'case-stock', 'invalid');
    const context = this.caseContext(client, intent.id, 'stock');
    if (!context) return;
    if (isGuestAccount(context.player.accountId)) return this.answerCase(client, intent.id, 'stock', 'guest');
    const result = mail.caseStock(intent.id, context.player.accountId, intent);
    if (!result) return this.reject(client, 'case-stock', 'invalid');
    this.finishCaseChange(client, context.player, 'stock', intent.id, result, context.now);
  }

  private handleCaseShow(client: Client, raw: unknown): void {
    const intent = sanitizeCaseShow(raw);
    if (!intent) return this.reject(client, 'case-show', 'invalid');
    const context = this.caseContext(client, intent.id, 'show');
    if (!context) return;
    if (isGuestAccount(context.player.accountId)) return this.answerCase(client, intent.id, 'show', 'guest');
    const result = mail.caseShow(intent.id, context.player.accountId, intent);
    if (!result) return this.reject(client, 'case-show', 'invalid');
    this.finishCaseChange(client, context.player, 'show', intent.id, result, context.now);
  }

  private handleCaseRemove(client: Client, raw: unknown): void {
    const slot = sanitizeCaseSlot(raw);
    if (!slot) return this.reject(client, 'case-remove', 'invalid');
    const context = this.caseContext(client, slot.id, 'remove');
    if (!context) return;
    if (isGuestAccount(context.player.accountId)) return this.answerCase(client, slot.id, 'remove', 'guest');
    const result = mail.caseRemove(slot.id, context.player.accountId, slot.index);
    if (!result) return this.reject(client, 'case-remove', 'invalid');
    this.finishCaseChange(client, context.player, 'remove', slot.id, result, context.now);
  }

  private handleCaseTake(client: Client, raw: unknown): void {
    const slot = sanitizeCaseSlot(raw);
    if (!slot) return this.reject(client, 'case-take', 'invalid');
    const context = this.caseContext(client, slot.id, 'take');
    if (!context) return;
    const { player, record, now } = context;
    if (isGuestAccount(player.accountId)) return this.answerCase(client, slot.id, 'take', 'guest');
    // Silent: a block reads exactly like an empty case.
    if (record.owner !== player.accountId && blocks.isBlocked(record.owner, player.accountId)) {
      return this.answerCase(client, slot.id, 'take', 'empty');
    }
    const result = mail.caseTake(slot.id, { accountId: player.accountId, name: player.name }, slot.index, now);
    if (!result) return this.reject(client, 'case-take', 'invalid');
    this.finishCaseChange(client, player, 'take', slot.id, result, now);
  }

  private handleCaseRequest(client: Client, raw: unknown): void {
    const intent = sanitizeCaseRequest(raw);
    if (!intent) return this.reject(client, 'case-request', 'invalid');
    const player = this.state.players.get(client.sessionId);
    const record = mail.caseRecord(intent.id);
    if (!player || !record || !this.state.pieces.has(intent.id)) return this.reject(client, 'case-request', 'invalid');
    this.sendCaseDetail(client, player, record, Date.now());
  }

  private finishCaseChange(
    client: Client,
    player: { accountId: string },
    action: CaseAction,
    id: string,
    result: CaseEdit,
    now: number,
  ): void {
    const { change, record } = result;
    if (!change.ok) {
      this.answerCase(client, id, action, change.outcome, change.resetsAt === undefined ? {} : { resetsAt: change.resetsAt });
      // A refused take still teaches the visitor their own allowance.
      if (action === 'take') this.sendCaseDetail(client, player, record, now);
      return;
    }
    this.syncCase(record);
    this.answerCase(client, id, action, 'ok', change.taken ? { taken: change.taken } : {});
    this.sendCaseDetail(client, player, record, now);
  }

  private handleGather(client: Client, msg: GatherIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !msg) return;

    const node = this.state.nodes.get(msg.nodeId);
    if (!node || node.respawnAt !== 0 || node.remaining <= 0) {
      this.reject(client, ClientMessage.Gather, 'node-empty');
      return;
    }
    if (player.accountId.startsWith('guest:')) {
      this.reject(client, ClientMessage.Gather, 'guest-not-allowed');
      return;
    }
    if (node.page !== player.page || Math.hypot(node.x - player.x, node.z - player.z) > 4) {
      this.reject(client, ClientMessage.Gather, 'too-far');
      return;
    }

    node.remaining -= 1;
    if (node.remaining <= 0) {
      // Spent: hide until it refills 30s later.
      node.respawnAt = Date.now() + 30_000;
    }
    mail.grant(player.accountId, { kind: 'resource', itemId: node.kind, quantity: 1 });
    this.persist();
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
      this.applyBlockAtTheDoor(player.accountId, target);
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

  /**
   * Durable private letters. Notes only until shared inventory becomes
   * authoritative; accepting client-claimed parcels today would let a sender
   * duplicate anything by lying about what their local bag contains.
   */
  private handleSendMail(client: Client, msg: SendMailIntent): void {
    const player = this.state.players.get(client.sessionId);
    const session = this.sessions.get(client.sessionId);
    if (!player || !session || !msg) return;
    if (player.accountId.startsWith('guest:')) {
      this.reject(client, ClientMessage.SendMail, 'guest-not-allowed');
      return;
    }

    const now = Date.now();
    if (now - session.lastMailAt < LIMITS.mailSendIntervalMs) {
      this.reject(client, ClientMessage.SendMail, 'rate-limited');
      return;
    }
    const intent = sanitizeSendMail(msg);
    if (!intent || intent.toAccountId === player.accountId || !accounts.has(intent.toAccountId)) {
      this.reject(client, ClientMessage.SendMail, 'invalid');
      return;
    }
    // Personal blocks cover private delivery too. A generic refusal does not
    // reveal whether the account exists or whether the recipient blocked them.
    if (blocks.isBlocked(intent.toAccountId, player.accountId)) {
      this.reject(client, ClientMessage.SendMail, 'not-allowed');
      return;
    }

    session.lastMailAt = now;
    const delivered = intent.attachment
      ? mail.deliverParcel({
        fromAccountId: player.accountId, fromName: player.name,
        toAccountId: intent.toAccountId, text: intent.text,
        attachment: intent.attachment, at: now,
      })?.item
      : mail.deliver({
        fromAccountId: player.accountId, fromName: player.name,
        toAccountId: intent.toAccountId, text: intent.text, at: now,
      });
    if (!delivered) {
      this.reject(client, ClientMessage.SendMail, 'not-allowed');
      return;
    }
    client.send(ServerMessage.MailSent, { mailId: delivered.id, toAccountId: intent.toAccountId });
  }

  private handleClaimMail(client: Client, msg: ClaimMailIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.accountId.startsWith('guest:')) {
      this.reject(client, ClientMessage.ClaimMail, 'guest-not-allowed');
      return;
    }
    const intent = sanitizeClaimMail(msg);
    if (!intent || !mail.claim(player.accountId, intent.mailId)) {
      this.reject(client, ClientMessage.ClaimMail, 'invalid');
      return;
    }
    this.sendMailbox(client, player.accountId);
  }

  /**
   * Wear a design into shared play (avatar Phase D). Wearing is the explicit
   * act that publishes art: the design is validated, stored on the wearer's
   * account (bounded like any wardrobe), and the resolved key broadcasts so
   * everyone in the room re-renders the real drawing. Guests keep the
   * template fallback — there is no account to hold what they would wear.
   */
  private handleWearDesign(client: Client, msg: WearDesignIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.accountId.startsWith('guest:')) {
      this.reject(client, ClientMessage.WearDesign, 'guest-not-allowed');
      return;
    }
    const raw = (msg ?? {}) as Partial<WearDesignIntent>;
    const design = sanitizeAvatarDesign(raw.design);
    const edgeColor = typeof raw.edgeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.edgeColor)
      ? raw.edgeColor
      : null;
    if (!design || !edgeColor) {
      this.reject(client, ClientMessage.WearDesign, 'invalid');
      return;
    }
    if (!avatarDesigns.saveDesign(player.accountId, design)) {
      this.reject(client, ClientMessage.WearDesign, 'not-allowed');
      return;
    }
    player.avatar.preset = design.preset;
    player.avatar.drawingKey = design.id;
    player.avatar.edgeColor = edgeColor;
  }

  /**
   * The player card (avatar-and-identity.md §3). A live avatar already tells
   * a viewer someone's name and current look through room state; this fills
   * in what only the account itself holds: the papering-since date and any
   * wardrobe designs opted into `sharedOnCard`.
   *
   * `found: false` is the one answer for every reason to say no — no such
   * account, a guest with nothing account-owned to show, or the target has
   * blocked the asker — so opening cards can never be used to probe a block
   * list, the same posture `handleSendMail` already holds for mail.
   */
  private handlePlayerCardRequest(client: Client, msg: PlayerCardIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const accountId = typeof msg?.accountId === 'string' ? msg.accountId.trim() : '';
    const notFound: PlayerCardInfo = { accountId, found: false };

    if (
      !accountId
      || accountId.startsWith('guest:')
      || (accountId !== player.accountId && blocks.isBlocked(accountId, player.accountId))
    ) {
      client.send(ServerMessage.PlayerCard, notFound);
      return;
    }

    const account = accounts.getForClaim(accountId);
    if (!account) {
      client.send(ServerMessage.PlayerCard, notFound);
      return;
    }

    const sharedDesignIds = avatarDesigns.listFor(accountId)
      .filter((design) => design.sharedOnCard)
      .map((design) => design.id);

    client.send(ServerMessage.PlayerCard, {
      accountId,
      found: true,
      papersSince: account.createdAt,
      sharedDesignIds,
    } satisfies PlayerCardInfo);
  }

  /**
   * A home marker (avatar-and-identity.md / land-and-dwellings.md): the one
   * spot a signed-in player's neighbors can see, wherever that player's own
   * "Home" bookmark currently sits. Moving home is just overwriting this one
   * record - there is no old marker to clean up separately.
   */
  private handleSetHome(client: Client, msg: SetHomeIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (player.accountId.startsWith('guest:')) {
      this.reject(client, ClientMessage.SetHome, 'guest-not-allowed');
      return;
    }
    const intent = sanitizeSetHome(msg);
    if (!intent) {
      this.reject(client, ClientMessage.SetHome, 'invalid');
      return;
    }
    let home = this.state.homes.get(player.accountId);
    if (!home) {
      home = new HomeSchema();
      home.accountId = player.accountId;
      this.state.homes.set(player.accountId, home);
    }
    home.name = player.name;
    home.x = intent.x;
    home.z = intent.z;
    home.page = intent.page;
    home.parts = joinHomeParts(intent.parts ?? []);
    home.building = intent.building ?? '';
    home.open = this.policyOf(player.accountId).open;
    this.persist();
  }

  // ---- Friends and guests ---------------------------------------------------
  //
  // Design: docs/house-and-home.md ("Who can come in"). The client asks; every
  // decision below is made here, and a blocked account is always told exactly
  // what a closed door would tell them.

  private policyOf(accountId: string): HomePolicy {
    return this.policies.get(accountId) ?? { ...DEFAULT_HOME_POLICY };
  }

  /** Every live session belonging to an account (they may have two tabs open). */
  private clientsOf(accountId: string): Client[] {
    return this.clients.filter((c) => this.state.players.get(c.sessionId)?.accountId === accountId);
  }

  private playerByAccount(accountId: string): PlayerSchema | undefined {
    for (const player of this.state.players.values()) if (player.accountId === accountId) return player;
    return undefined;
  }

  /** What a joining or returning player needs to know about their own doors and friends. */
  private briefOnGuests(client: Client, player: PlayerSchema): void {
    client.send(ServerMessage.HomePolicy, this.policyOf(player.accountId));
    this.sendFriends(client, player.accountId);
    for (const knock of this.knocks.waiting(player.accountId)) {
      client.send(ServerMessage.KnockNotice, {
        visitor: knock.visitor, name: knock.visitorName, at: knock.at, expiresAt: knock.expiresAt,
      });
    }
  }

  /** Chat a player is entitled to read: their own room's, minus anyone they blocked. */
  private historyFor(player: PlayerSchema): ChatBroadcast[] {
    return this.chatLog.filter((line) =>
      (this.chatScopes.get(line.id) ?? '') === player.inside
      && !blocks.isBlocked(player.accountId, line.accountId));
  }

  private friendsSnapshot(accountId: string): FriendsSnapshot {
    if (isGuestAccount(accountId)) return { friends: [], incoming: [], outgoing: [] };
    return {
      friends: friends.list(accountId).map((friend) => {
        const live = this.playerByAccount(friend.accountId);
        return { accountId: friend.accountId, name: live?.name ?? friend.name, online: Boolean(live) };
      }),
      incoming: friends.incoming(accountId),
      outgoing: friends.outgoing(accountId),
    };
  }

  private sendFriends(client: Client, accountId: string): void {
    client.send(ServerMessage.Friends, this.friendsSnapshot(accountId));
  }

  private pushFriends(accountId: string): void {
    for (const client of this.clientsOf(accountId)) this.sendFriends(client, accountId);
  }

  /** Tell an account's friends the room around them changed (someone came or went). */
  private pushFriendsAround(accountId: string): void {
    for (const friend of friends.list(accountId)) this.pushFriends(friend.accountId);
  }

  private notifyFriend(accountId: string, kind: FriendNoticeKind, otherId: string, otherName: string): void {
    for (const client of this.clientsOf(accountId)) {
      client.send(ServerMessage.FriendNotice, { kind, accountId: otherId, name: otherName });
    }
  }

  private handleFriendRequest(client: Client, msg: FriendRequestIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const target = sanitizeAccountRef(msg?.accountId);
    if (!target) {
      this.reject(client, ClientMessage.FriendRequest, 'invalid');
      return;
    }
    if (isGuestAccount(player.accountId) || isGuestAccount(target)) {
      this.reject(client, ClientMessage.FriendRequest, 'guest-not-allowed');
      return;
    }
    if (!accounts.has(target)) {
      this.reject(client, ClientMessage.FriendRequest, 'invalid');
      return;
    }
    const other = this.playerByAccount(target);
    const otherName = other?.name ?? 'paper friend';
    const status = friends.request(player.accountId, player.name, target, otherName);
    switch (status) {
      case 'invalid':
        this.reject(client, ClientMessage.FriendRequest, 'invalid');
        return;
      case 'you-blocked':
        this.reject(client, ClientMessage.FriendRequest, 'not-allowed');
        return;
      case 'full':
        this.notifyFriend(player.accountId, 'full', target, otherName);
        return;
      case 'already-friends':
        this.notifyFriend(player.accountId, 'already-friends', target, otherName);
        return;
      case 'already-sent':
        this.notifyFriend(player.accountId, 'already-requested', target, otherName);
        return;
      case 'accepted':
        this.notifyFriend(player.accountId, 'accepted', target, otherName);
        this.notifyFriend(target, 'accepted', player.accountId, player.name);
        break;
      case 'sent':
        this.notifyFriend(player.accountId, 'requested', target, otherName);
        this.notifyFriend(target, 'incoming', player.accountId, player.name);
        break;
      case 'silently-dropped':
        // Looks exactly like 'sent'. The other side hears nothing.
        this.notifyFriend(player.accountId, 'requested', target, otherName);
        break;
    }
    this.pushFriends(player.accountId);
    this.pushFriends(target);
  }

  private handleFriendAnswer(client: Client, msg: FriendAnswerIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const from = sanitizeAccountRef(msg?.accountId);
    if (!from || isGuestAccount(player.accountId)) {
      this.reject(client, ClientMessage.FriendAnswer, 'invalid');
      return;
    }
    const result = friends.answer(player.accountId, from, msg.accept === true);
    if (result === 'accepted') {
      const other = this.playerByAccount(from);
      const name = other?.name ?? friends.list(player.accountId).find((f) => f.accountId === from)?.name ?? 'paper friend';
      this.notifyFriend(player.accountId, 'accepted', from, name);
      this.notifyFriend(from, 'accepted', player.accountId, player.name);
    } else if (result === 'full') {
      this.notifyFriend(player.accountId, 'full', from, 'paper friend');
    }
    // A "no" is quiet: the asker is never told.
    this.pushFriends(player.accountId);
    this.pushFriends(from);
  }

  private handleFriendRemove(client: Client, msg: FriendRemoveIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const other = sanitizeAccountRef(msg?.accountId);
    if (!other) {
      this.reject(client, ClientMessage.FriendRemove, 'invalid');
      return;
    }
    const result = friends.remove(player.accountId, other);
    if (result !== 'none') this.notifyFriend(player.accountId, 'removed', other, this.playerByAccount(other)?.name ?? 'paper friend');
    // The other person's list updates without a message: nobody is told they
    // were removed, they simply are not on the list any more.
    this.pushFriends(player.accountId);
    this.pushFriends(other);
  }

  private handleSetHomePolicy(client: Client, msg: HomePolicy): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (isGuestAccount(player.accountId)) {
      this.reject(client, ClientMessage.SetHomePolicy, 'guest-not-allowed');
      return;
    }
    const policy = sanitizeHomePolicy(msg);
    if (!policy) {
      this.reject(client, ClientMessage.SetHomePolicy, 'invalid');
      return;
    }
    this.policies.set(player.accountId, policy);
    const home = this.state.homes.get(player.accountId);
    if (home) home.open = policy.open;
    this.persist();
    for (const own of this.clientsOf(player.accountId)) own.send(ServerMessage.HomePolicy, policy);
  }

  private tellEntry(client: Client, host: string, hostName: string, outcome: EntryOutcome): void {
    client.send(ServerMessage.EntryResult, { host, hostName, outcome });
  }

  /** Put a player inside a home. The next move is allowed to jump into the interior space. */
  private placeInside(player: PlayerSchema, session: Session, host: string): void {
    if (player.inside === host) return;
    if (player.inside) session.exitHost = player.inside;
    player.inside = host;
    session.jump = 'enter';
  }

  /** Put a player back outside. The next move is allowed to jump back to the door. */
  private placeOutside(player: PlayerSchema, session: Session): void {
    if (!player.inside) return;
    session.exitHost = player.inside;
    player.inside = '';
    session.jump = 'exit';
  }

  /** Where the next jump may land: the interior space, or the door of the home just left. */
  private landingFor(player: PlayerSchema, session: Session): { x: number; z: number; radius: number } {
    if (session.jump === 'enter') {
      return { x: INTERIOR_SPACE.x, z: INTERIOR_SPACE.z, radius: INTERIOR_SPACE.radius };
    }
    const home = this.state.homes.get(session.exitHost);
    if (home) return { x: home.x, z: home.z, radius: HOME_EXIT_RADIUS };
    // The home is gone from the record; stay where the last surface position was.
    return { x: player.x, z: player.z, radius: Infinity };
  }

  private handleEnterHome(client: Client, msg: EnterHomeIntent): void {
    const player = this.state.players.get(client.sessionId);
    const session = this.sessions.get(client.sessionId);
    if (!player || !session) return;
    const host = sanitizeAccountRef(msg?.host);
    if (!host) {
      this.reject(client, ClientMessage.EnterHome, 'invalid');
      return;
    }
    const now = Date.now();
    const home = this.state.homes.get(host);
    const hostName = home?.name ?? 'someone';
    if (now - session.lastEntryAt < ENTRY_INTERVAL_MS) {
      this.tellEntry(client, host, hostName, 'busy');
      return;
    }
    session.lastEntryAt = now;

    if (player.inside === host) {
      this.tellEntry(client, host, hostName, 'admitted');
      return;
    }

    const decision = decideAccess({
      host,
      visitor: player.accountId,
      hostHasHome: Boolean(home),
      policy: this.policyOf(host),
      isFriend: friends.areFriends(host, player.accountId),
      blockedEitherWay: blocks.isBlocked(host, player.accountId) || blocks.isBlocked(player.accountId, host),
      banned: this.banned.has(player.accountId),
      hasPermit: this.knocks.hasPermit(host, player.accountId),
    });

    if (decision === 'closed') {
      this.tellEntry(client, host, hostName, 'closed');
      return;
    }
    if (decision === 'admit') {
      this.knocks.consumePermit(host, player.accountId);
      // Coming in answers any knock the visitor still had waiting.
      for (const knock of this.knocks.withdraw(player.accountId)) this.clearKnockNotice(knock.host, knock.visitor);
      this.placeInside(player, session, host);
      this.tellEntry(client, host, hostName, 'admitted');
      return;
    }

    // Knock.
    const knocked = this.knocks.knock(host, player.accountId, player.name);
    if (knocked === 'cooldown') {
      this.tellEntry(client, host, hostName, 'busy');
      return;
    }
    if (knocked === 'pending') {
      this.tellEntry(client, host, hostName, 'knocked');
      return;
    }
    const hostClients = this.clientsOf(host);
    if (hostClients.length === 0) {
      // Nobody home. Leave one short note, at most once in a while, and take
      // the knock back down: there is nobody to answer it.
      this.knocks.revoke(host, player.accountId);
      if (this.knocks.noteDue(host, player.accountId)) {
        mail.deliver({
          fromAccountId: 'world',
          fromName: 'Your front door',
          toAccountId: host,
          text: `${player.name} knocked while you were away.`,
          at: now,
        });
      }
      this.tellEntry(client, host, hostName, 'no-answer');
      return;
    }
    const knock = this.knocks.waiting(host).find((entry) => entry.visitor === player.accountId);
    for (const own of hostClients) {
      own.send(ServerMessage.KnockNotice, {
        visitor: player.accountId,
        name: player.name,
        at: knock?.at ?? now,
        expiresAt: knock?.expiresAt ?? now + LIMITS.knockTtlMs,
      });
    }
    this.tellEntry(client, host, hostName, 'knocked');
  }

  private handleLeaveHome(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    const session = this.sessions.get(client.sessionId);
    if (!player || !session) return;
    this.placeOutside(player, session);
  }

  private clearKnockNotice(host: string, visitor: string): void {
    for (const own of this.clientsOf(host)) own.send(ServerMessage.KnockCleared, { visitor });
  }

  private handleKnockAnswer(client: Client, msg: KnockAnswerIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const visitor = sanitizeAccountRef(msg?.visitor);
    if (!visitor) {
      this.reject(client, ClientMessage.KnockAnswer, 'invalid');
      return;
    }
    const blocked = blocks.isBlocked(player.accountId, visitor) || blocks.isBlocked(visitor, player.accountId);
    const knock = this.knocks.answer(player.accountId, visitor, msg.admit === true && !blocked);
    // Either way the notice comes down, on every tab the owner has open.
    this.clearKnockNotice(player.accountId, visitor);
    if (!knock) return;
    const outcome: EntryOutcome = msg.admit === true && !blocked ? 'admitted' : 'declined';
    for (const guest of this.clientsOf(visitor)) {
      // Being let in must not be slowed by the pause that guards knocking.
      const guestSession = this.sessions.get(guest.sessionId);
      if (guestSession) guestSession.lastEntryAt = 0;
      this.tellEntry(guest, player.accountId, player.name, outcome);
    }
  }

  private handleAskToLeave(client: Client, msg: AskToLeaveIntent): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const target = sanitizeAccountRef(msg?.accountId);
    if (!target || target === player.accountId) {
      this.reject(client, ClientMessage.AskToLeave, 'invalid');
      return;
    }
    // Only the home's owner may ask somebody to leave it.
    for (const other of this.clients) {
      const guest = this.state.players.get(other.sessionId);
      if (!guest || guest.accountId !== target || guest.inside !== player.accountId) continue;
      this.ejectFromHome(other, guest);
    }
    this.knocks.revoke(player.accountId, target);
  }

  private ejectFromHome(client: Client, guest: PlayerSchema): void {
    const session = this.sessions.get(client.sessionId);
    if (!session || !guest.inside) return;
    const host = guest.inside;
    this.placeOutside(guest, session);
    client.send(ServerMessage.HomeExit, { host, reason: 'asked-to-leave' });
  }

  /**
   * A block lands at the door as well as in chat: friendship and knocks between
   * the two end, and if the blocked person is standing in the blocker's home
   * they are asked to leave. Nobody is told it was a block.
   */
  private applyBlockAtTheDoor(blocker: string, blocked: string): void {
    friends.purge(blocker, blocked);
    this.pushFriends(blocker);
    this.pushFriends(blocked);
    for (const [host, visitor] of [[blocker, blocked], [blocked, blocker]] as const) {
      if (this.knocks.revoke(host, visitor)) this.clearKnockNotice(host, visitor);
    }
    for (const other of this.clients) {
      const guest = this.state.players.get(other.sessionId);
      if (guest?.accountId === blocked && guest.inside === blocker) this.ejectFromHome(other, guest);
    }
  }

  /** Knocks nobody answered: take the notice down and tell the visitor, kindly, nobody came. */
  private expireKnocks(): void {
    for (const knock of this.knocks.expire()) {
      this.clearKnockNotice(knock.host, knock.visitor);
      const home = this.state.homes.get(knock.host);
      for (const guest of this.clientsOf(knock.visitor)) {
        this.tellEntry(guest, knock.host, home?.name ?? 'someone', 'no-answer');
      }
    }
  }

  // ---- Helpers --------------------------------------------------------------

  private reject(client: Client, action: string, reason: RejectionReason): void {
    client.send(ServerMessage.Rejected, { action, reason });
  }

  private sendMailbox(client: Client, accountId: string): void {
    client.send(ServerMessage.Mailbox, {
      items: accountId.startsWith('guest:') ? [] : mail.list(accountId),
      claimedIds: accountId.startsWith('guest:') ? [] : mail.listClaimed(accountId),
    });
  }

  private sendInventory(client: Client, accountId: string): void {
    client.send(ServerMessage.Inventory, accountId.startsWith('guest:')
      ? { revision: 0, chips: 0, resources: {}, tools: {}, items: {} }
      : mail.inventory(accountId));
  }

  private sendMailboxToAccount(accountId: string): void {
    for (const client of this.clients) {
      const player = this.state.players.get(client.sessionId);
      if (player?.accountId === accountId) this.sendMailbox(client, accountId);
    }
  }

  private sendInventoryToAccount(accountId: string): void {
    for (const client of this.clients) {
      const player = this.state.players.get(client.sessionId);
      if (player?.accountId === accountId) this.sendInventory(client, accountId);
    }
  }

  private seedResourceNodes(): void {
    const seeds = [
      { id: 'clearing-kraft-1', kind: 'kraft-twigs', x: 2, z: -1, page: '0,0' },
      { id: 'clearing-confetti-1', kind: 'confetti-stones', x: -2, z: 1, page: '0,0' },
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
    this.unsubscribeMail?.();
    this.unsubscribeMail = null;
    this.unsubscribeInventory?.();
    this.unsubscribeInventory = null;
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
    const homes: HomeMarker[] = [];
    this.state.homes.forEach((h) => {
      homes.push({
        accountId: h.accountId,
        name: h.name,
        x: h.x,
        z: h.z,
        page: h.page,
        parts: splitHomeParts(h.parts),
        building: h.building,
        open: h.open,
      });
    });
    const homePolicies: Record<string, HomePolicy> = {};
    for (const [accountId, policy] of this.policies) {
      // Only what differs from the default is worth keeping.
      if (policy.friends !== DEFAULT_HOME_POLICY.friends
        || policy.others !== DEFAULT_HOME_POLICY.others
        || policy.open !== DEFAULT_HOME_POLICY.open) homePolicies[accountId] = policy;
    }
    return { pieces, nodes, bannedAccountIds, homes, homePolicies };
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
    // Display cases live in the mail store (goods must move atomically with
    // pouches). A case piece with no record, say after a restore from an older
    // backup, gets an empty one rather than a dead shelf.
    this.state.pieces.forEach((piece) => {
      if (piece.templateKey !== DISPLAY_CASE_TEMPLATE) return;
      if (isGuestAccount(piece.makerId)) return;
      this.syncCase(mail.caseRecord(piece.id) ?? mail.createCase(piece.id, piece.makerId));
    });
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
    // Absent on saves written before home markers existed.
    for (const h of save.homes ?? []) {
      const home = new HomeSchema();
      home.accountId = h.accountId;
      home.name = h.name;
      home.x = h.x;
      home.z = h.z;
      home.page = h.page;
      // Absent on saves written before guests existed.
      home.parts = joinHomeParts(h.parts ?? []);
      home.building = h.building ?? '';
      home.open = h.open === true;
      this.state.homes.set(home.accountId, home);
    }
    for (const [accountId, raw] of Object.entries(save.homePolicies ?? {})) {
      this.policies.set(accountId, homePolicyOrDefault(raw));
    }
  }
}
