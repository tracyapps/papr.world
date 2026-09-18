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
  isFiniteNumber,
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
} from '../../../shared/src/index';
import { accounts, avatarDesigns, blocks, isOwner, mail, moderation, OWNER_ACCOUNT, roomStore } from '../stores';
import { readAdminConfig, verifyClerkSessionToken } from '../admin';
import { database } from '../runtime';
import { authorizeManagedWorldEntry } from '../worldAuthorization';
import {
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

    // Mail belongs to accounts, not rooms. Every live room listens so a
    // recipient sees a delivery immediately even when sender and recipient
    // are visiting different neighborhood codes.
    this.unsubscribeMail = mail.subscribe((accountId) => this.sendMailboxToAccount(accountId));
    this.unsubscribeInventory = mail.subscribeInventory((accountId) =>
      this.sendInventoryToAccount(accountId));

    // Light housekeeping tick: refill spent resource nodes.
    this.setSimulationInterval(() => this.refillNodes(), 1000);
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

    player.isOwner = isOwner(player.accountId);

    this.state.players.set(client.sessionId, player);
    this.sessions.set(client.sessionId, { lastMoveAt: Date.now(), lastChatAt: 0, lastMailAt: 0 });

    // The backlog, filtered the same way live chat is — otherwise a block
    // would hold for new lines and then hand you everything you blocked the
    // moment you reconnected.
    client.send(ServerMessage.ChatHistory, {
      lines: this.chatLog.filter((line) => !blocks.isBlocked(player.accountId, line.accountId)),
    });

    // Echo their own block list so the client can label people correctly
    // without keeping its own copy that could drift.
    client.send(ServerMessage.Blocks, { accountIds: blocks.list(player.accountId) });
    this.sendMailbox(client, player.accountId);
    this.sendInventory(client, player.accountId);
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
    this.sendMailbox(client, player.accountId);
    this.sendInventory(client, player.accountId);
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
    this.persist();
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
      });
    });
    return { pieces, nodes, bannedAccountIds, homes };
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
    // Absent on saves written before home markers existed.
    for (const h of save.homes ?? []) {
      const home = new HomeSchema();
      home.accountId = h.accountId;
      home.name = h.name;
      home.x = h.x;
      home.z = h.z;
      home.page = h.page;
      this.state.homes.set(home.accountId, home);
    }
  }
}
