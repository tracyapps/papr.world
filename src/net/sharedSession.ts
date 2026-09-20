import { sanitizeAvatarDesign, type AvatarDesign, type HomeMarker, type PlacedPiece } from '../../shared/src/index';
import type { Vector3 } from 'three';
import { avatar } from '../game/avatar';
import { getYaw } from '../game/camera';
import { showPetToast } from '../game/petting';
import {
  getServerInside,
  presenceHeld,
  receiveEntryResult,
  receiveFriendNotice,
  receiveFriends,
  receiveHomeExit,
  receiveHomePolicy,
  receiveKnock,
  receiveKnockCleared,
  selfIsGuest,
  setGuestTransport,
  setSelfAccount,
} from '../game/guests';
import { publishedLook } from '../game/dwellingLook';
import { isInteriorActive } from '../world/activeScene';
import { getWornDesign } from '../ui/avatarEditor/wardrobe';
import { initializeSharedChat } from '../ui/sharedChat';
import { handlePlayerCardResponse, setPlayerCardRequestHandler } from '../ui/playerCard';
import { getCurrentPageId } from '../world/streaming';
import { getPlace, HOME_PLACE_ID } from '../world/places';
import { connect, type NetConnection } from './client';
import { describeClose } from './closeReason';
import { getOrCreatePassport } from './passport';
import { mergeMailSnapshot } from '../sim/mail';
import { getGameState, onGameStateChanged, updateGameState } from '../sim/state';
import {
  clearSharedInventory,
  receiveSharedInventory,
  setSharedMailClaimHandler,
} from './sharedInventory';
import {
  addRemoteAvatar,
  clearRemoteAvatars,
  configureRemoteDesigns,
  initializeRemoteAvatarVisuals,
  remoteAvatarCount,
  removeRemoteAvatar,
  setRemoteInside,
  updateRemoteAvatar,
} from './remoteAvatarVisuals';
import { avatarRefForDesign, readSharedModeConfig } from './sharedConfig';
import {
  addSharedHome,
  clearSharedHomeVisuals,
  initializeSharedHomeVisuals,
  removeSharedHome,
} from './sharedHomeVisuals';
import { consumeWorldEntryHandoff, resumeWorldEntry } from './worldEntry';
import { getAccountToken } from './accountAuth';
import { classifyJoinFailure, rejoinDelayMs, shouldRejoinAfterClose } from './rejoin';
import {
  addSharedPiece,
  initializeSharedPieceVisuals,
  removeSharedPiece,
  sharedPieceCount,
  syncSharedPieceVisibility,
} from './sharedPieceVisuals';
import {
  clearSharedResourceVisuals,
  initializeSharedResourceVisuals,
  removeSharedResourceNode,
  syncSharedResourceVisibility,
  upsertSharedResourceNode,
} from './sharedResourceVisuals';

type SharedSessionDebug = {
  enabled: boolean;
  connected: boolean;
  name: string | null;
  inviteCode: string | null;
  phase: SharedSessionPhase;
  remotePlayers: number;
  remotePositions: Array<{ id: string; x: number; z: number }>;
  sharedPieces: number;
};

export type SharedSessionPhase =
  | 'solo'
  | 'preparing'
  | 'connecting'
  | 'online'
  | 'offline'
  | 'setup-error';

export type SharedSessionStatus = {
  phase: SharedSessionPhase;
  message: string;
  name: string | null;
  inviteCode: string | null;
  intent: 'create' | 'join' | null;
};

let connection: NetConnection | null = null;
let enabled = false;
let connected = false;
/** Set when the player chose to leave; a lost visit is rejoined, a left one is not. */
let leftOnPurpose = false;
let playerName: string | null = null;
let inviteCode: string | null = null;
let status: SharedSessionStatus = {
  phase: 'solo',
  message: 'Playing in your solo world.',
  name: null,
  inviteCode: null,
  intent: null,
};
const statusListeners = new Set<(next: SharedSessionStatus) => void>();

function publishStatus(next: SharedSessionStatus): void {
  status = next;
  for (const listener of statusListeners) listener({ ...status });
}

export function getSharedSessionStatus(): SharedSessionStatus {
  return { ...status };
}

export function subscribeSharedSessionStatus(
  listener: (next: SharedSessionStatus) => void,
): () => void {
  statusListeners.add(listener);
  listener(getSharedSessionStatus());
  return () => statusListeners.delete(listener);
}

export async function initializeSharedSession(): Promise<void> {
  const pageUrl = new URL(window.location.href);
  if (pageUrl.searchParams.get('shared') === '1' || pageUrl.searchParams.has('world')) enabled = true;
  if (!enabled) {
    publishStatus({
      phase: 'solo', message: 'Playing in your solo world.', name: null,
      inviteCode: null, intent: null,
    });
    return;
  }

  let config;
  try {
    config = readSharedModeConfig(pageUrl, sharedNameForThisTab());
  } catch (error) {
    const ui = initializeSharedChat(() => {});
    ui.setStatus('setup error');
    const message = error instanceof Error ? error.message : 'The shared-world address is invalid.';
    ui.addNotice(message);
    publishStatus({
      phase: 'setup-error', message, name: null, inviteCode: null, intent: null,
    });
    return;
  }
  if (!config) return;
  let managedEntry = config.worldId
    ? consumeWorldEntryHandoff(sessionStorage, config.worldId)
    : null;
  if (config.worldId && !managedEntry) {
    // A reload or a return visit: no handoff from My desk, but if this
    // browser is still signed in, the account can vouch for a fresh entry.
    managedEntry = await resumeWorldEntry(config.worldId, config.httpEndpoint, getAccountToken);
  }
  if (config.worldId && !managedEntry) {
    const ui = initializeSharedChat(() => {});
    const message = 'This world entry pass is missing or expired. Return to My desk and open the world again.';
    ui.setStatus('sign-in needed');
    ui.addNotice(message);
    publishStatus({
      phase: 'setup-error', message, name: null, inviteCode: null, intent: null,
    });
    return;
  }
  if (managedEntry) config.name = managedEntry.playerName;
  const destination = managedEntry?.worldName ?? `neighborhood ${config.inviteCode}`;
  playerName = config.name;
  inviteCode = config.inviteCode;
  sessionStorage.setItem('pp.shared-name.v1', config.name);

  let liveConnection: NetConnection | null = null;
  const ui = initializeSharedChat({
    onSend: (text) => liveConnection?.sendChat(text),
    onBlock: (accountId) => liveConnection?.sendBlock(accountId),
    onUnblock: (accountId) => liveConnection?.sendUnblock(accountId),
    onReport: (report) => liveConnection?.sendReport(report),
    onRemove: (accountId, ban) => liveConnection?.sendRemove({ accountId, ban }),
    onSendMail: (toAccountId, text, attachment) =>
      liveConnection?.sendMail({ toAccountId, text, ...(attachment ? { attachment } : {}) }),
  });
  ui.setStatus('connecting…');
  publishStatus({
    phase: 'preparing',
    message: managedEntry ? 'Checking your world access…' : 'Preparing your paper passport…',
    name: config.name,
    inviteCode: config.inviteCode,
    intent: config.intent,
  });
  initializeRemoteAvatarVisuals();
  initializeSharedPieceVisuals();
  initializeSharedResourceVisuals((nodeId) => liveConnection?.sendGather(nodeId));
  initializeSharedHomeVisuals();

  // Minting the passport and joining the room are two different things that
  // fail for two different reasons. Wrapping them in one try meant a passport
  // problem was reported as "the neighborhood could not be opened", which
  // named the wrong component and — because the mint is what WRITES the
  // passport — also left localStorage empty for anyone told to read it.
  let account: Awaited<ReturnType<typeof getOrCreatePassport>> | undefined;
  if (managedEntry) {
    ui.setSelfAccountId(managedEntry.accountId);
  } else {
    try {
      account = await getOrCreatePassport(config.httpEndpoint, config.name);

      // Printed once, deliberately. It is the id an owner needs for
      // PAPR_OWNER_ACCOUNT and the id to quote in a bug report, and digging it
      // out of localStorage by hand is a miserable first experience. The secret
      // is never printed.
      console.info(
        `papr.world paper passport: ${account.id}\n`
        + '(this is your account id — the value PAPR_OWNER_ACCOUNT wants. Never share the secret.)',
      );
      ui.setSelfAccountId(account.id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      ui.setStatus('offline');
      ui.addNotice(`${detail} Solo play is still available.`);
      publishStatus({
        phase: 'setup-error',
        message: detail,
        name: config.name,
        inviteCode: config.inviteCode,
        intent: config.intent,
      });
      console.warn('Paper passport could not be minted', error);
      return;
    }
  }
  // Unifies the two ways a session ends up with an account: a Clerk-managed
  // world entry hands one over already, a legacy join mints its own passport.
  const selfAccountId = managedEntry?.accountId ?? account?.id ?? '';

  // ── Joining, and joining again ─────────────────────────────────────────
  //
  // The first join and every rejoin after a lost visit go through `join`.
  // A rejoin asks sign-in for a fresh token (account worlds) or reuses the
  // paper passport (invite neighborhoods); see rejoin.ts for the rules.
  let removed = false;
  let rejoinAttempt = 0;
  let rejoinTimer: ReturnType<typeof setTimeout> | null = null;
  let joining = false;
  let stopped = false;
  let missingTokenTries = 0;

  const stop = (notice: string) => {
    stopped = true;
    if (rejoinTimer) clearTimeout(rejoinTimer);
    rejoinTimer = null;
    ui.setStatus('offline');
    ui.addNotice(notice);
    publishStatus({
      phase: 'offline', message: `${notice} Your solo world is still safe.`,
      name: config.name, inviteCode: config.inviteCode, intent: config.intent,
    });
  };

  const scheduleRejoin = () => {
    if (stopped || removed || leftOnPurpose || rejoinTimer || joining) return;
    const delay = rejoinDelayMs(rejoinAttempt);
    rejoinAttempt += 1;
    const seconds = Math.round(delay / 1000);
    ui.setStatus('reconnecting…');
    publishStatus({
      phase: 'offline',
      message: `Finding the neighborhood again in ${seconds}s… Your solo world is still safe.`,
      name: config.name, inviteCode: config.inviteCode, intent: config.intent,
    });
    rejoinTimer = setTimeout(() => {
      rejoinTimer = null;
      // A hidden tab (or a sleeping laptop) waits; coming back triggers it.
      if (document.visibilityState === 'hidden') return;
      void rejoin();
    }, delay);
  };

  const rejoin = async () => {
    if (stopped || removed || leftOnPurpose || joining || connected) return;
    let token: string | undefined;
    if (config.worldId) {
      token = (await getAccountToken()) ?? undefined;
      if (!token) {
        // Sign-in can be slow to wake up with the laptop; give it a few
        // tries before telling anyone they are signed out.
        missingTokenTries += 1;
        console.info(`[neighborhood] no sign-in token for rejoin (try ${missingTokenTries})`);
        if (missingTokenTries >= 4) {
          stop('Your sign-in has ended. Return to My desk to open this world again.');
        } else {
          scheduleRejoin();
        }
        return;
      }
      missingTokenTries = 0;
    }
    const result = await join(token);
    if (result === 'ok') {
      rejoinAttempt = 0;
      ui.addNotice('Back in the neighborhood.');
    } else if (result === 'retry') {
      scheduleRejoin();
    }
  };

  // Waking up, un-hiding the tab, or getting the network back are all good
  // moments to try right away instead of waiting out the timer.
  const tryNow = () => {
    if (stopped || removed || leftOnPurpose || connected || joining) return;
    if (!rejoinTimer && rejoinAttempt === 0) return; // nothing was lost
    if (rejoinTimer) clearTimeout(rejoinTimer);
    rejoinTimer = null;
    void rejoin();
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tryNow();
  });
  window.addEventListener('online', tryNow);

  const join = async (sessionToken: string | undefined): Promise<'ok' | 'retry' | 'fatal'> => {
    joining = true;
    try {
    try {
      publishStatus({
        phase: 'connecting',
        message: `Opening ${destination}…`,
        name: config.name,
        inviteCode: config.inviteCode,
        intent: config.intent,
      });
      // Remote avatars fetch worn designs over HTTP by id (avatar Phase D);
      // this is the only moment the endpoint is reliably known.
      configureRemoteDesigns(config.httpEndpoint);
      liveConnection = await connect(
        {
          endpoint: config.endpoint,
          name: config.name,
          avatar: avatarRefForDesign(getWornDesign()),
          room: config.room,
          inviteCode: config.inviteCode ?? undefined,
          worldId: config.worldId ?? undefined,
          sessionToken,
          intent: config.intent,
          account,
        },
        {
          onPlayerJoin: (player) => {
            addRemoteAvatar(player);
            ui.addNotice(`${player.name} wandered in.`);
          },
          onPlayerLeave: (id) => {
            removeRemoteAvatar(id);
            ui.addNotice('A neighbor wandered home.');
          },
          onPlayerInside: setRemoteInside,
          onFriends: receiveFriends,
          onFriendNotice: receiveFriendNotice,
          onHomePolicy: receiveHomePolicy,
          onEntryResult: (result) => receiveEntryResult(result),
          onKnockNotice: (notice) => receiveKnock(notice),
          onKnockCleared: receiveKnockCleared,
          onHomeExit: receiveHomeExit,
          onPieceAdd: addSharedPiece,
          onPieceRemove: removeSharedPiece,
          onNodeAdd: upsertSharedResourceNode,
          onNodeUpdate: upsertSharedResourceNode,
          onNodeRemove: removeSharedResourceNode,
          onChat: ui.addChat,
          onChatHistory: (lines) => {
            ui.setHistory(lines);
            // Room state has arrived by now, so this is the first moment we can
            // know whether the server considers us the owner.
            ui.setOwner(Boolean(liveConnection?.isOwner()));
          },
          onBlocks: ui.setBlocks,
          onReportFiled: (receiptId) =>
            ui.addNotice(`Report filed. Its reference is ${receiptId.slice(0, 8)}.`),
          onMailbox: (items) => {
            // Server list is newest first. Deliver oldest first because the
            // local merge prepends, preserving the authoritative order while
            // retaining solo/system mail already in the scrapbook.
            updateGameState((state) => {
              mergeMailSnapshot(state, items);
            });
          },
          onClaimedMail: (ids) => {
            updateGameState((state) => {
              const retained = new Set(state.player.mailbox.map((item) => item.id));
              state.player.claimedMailIds = [...new Set([
                ...state.player.claimedMailIds,
                ...ids.filter((id) => retained.has(id)),
              ])].slice(0, 200);
            });
          },
          onInventory: (inventory) => {
            if (receiveSharedInventory(inventory)) ui.setInventory(inventory);
          },
          onMailSent: () => ui.addNotice('Your letter is safely in their mailbox.'),
          onPlayerCard: handlePlayerCardResponse,
          onHomeAdd: (home) => {
            if (home.accountId !== selfAccountId) addSharedHome(home);
          },
          onHomeUpdate: (home) => {
            if (home.accountId !== selfAccountId) addSharedHome(home);
          },
          onHomeRemove: (accountId) => {
            if (accountId !== selfAccountId) removeSharedHome(accountId);
          },
          onRemoved: (notice) => {
            // Removed or banned by the owner: never find our way back in.
            removed = true;
            ui.showRemoved(notice);
          },
          onRejected: (info) => {
            // A first movement can be clamped while the server catches up to the
            // real spawn. It is a correction, not a player-facing failure.
            if (info.action === 'move' && info.reason === 'too-far') return;
            // Guests cannot publish a worn design — there is no account to hold
            // it — and saying so on every wear would be noise, not information.
            if (info.action === 'wear-design' && info.reason === 'guest-not-allowed') return;
            showPetToast(`The neighborhood could not ${info.action}: ${info.reason}.`);
          },
          onDropped: () => {
            // Deliberately quiet and deliberately not "offline". Nothing has
            // been lost yet: their avatar is still standing in the room and the
            // seat is held. Saying "disconnected" here would send someone off to
            // re-enter a neighbourhood they have not actually left.
            ui.setStatus('reconnecting…');
            ui.addNotice('Lost the thread for a moment — finding the neighborhood again.');
            publishStatus({
              phase: 'online',
              message: 'Reconnecting to the neighborhood…',
              name: config.name,
              inviteCode: config.inviteCode,
              intent: config.intent,
            });
          },
          onReconnected: () => {
            ui.setStatus(`online as ${config.name}`, true);
            ui.addNotice('Back in the neighborhood.');
            publishStatus({
              phase: 'online',
              message: `Online in ${destination}.`,
              name: config.name,
              inviteCode: config.inviteCode,
              intent: config.intent,
            });
          },
          onLeave: (code) => {
            // The close code is the only evidence there is about WHY a visit
            // ended, and it used to be thrown away. Leaving on purpose and
            // being hung up on by a server that stopped hearing from you are
            // different events and should not read the same.
            const reason = describeClose(code);
            clearRemoteAvatars();
            clearSharedResourceVisuals();
            clearSharedInventory();
            clearSharedHomeVisuals();
            setGuestTransport(null);
            connected = false;
            connection = null;
            ui.setStatus('offline');
            ui.addNotice(`${reason.notice} (code ${reason.code})`);
            console.info(`[neighborhood] connection closed — ${reason.detail}`);
            publishStatus({
              phase: 'offline',
              message: `${reason.notice} Your solo world is still safe.`,
              name: config.name,
              inviteCode: config.inviteCode,
              intent: config.intent,
            });
            if (shouldRejoinAfterClose(code, { removed, leftOnPurpose })) {
              ui.addNotice('Finding the neighborhood again on its own — no need to reload.');
              scheduleRejoin();
            }
          },
        },
      );
      connection = liveConnection;
      setSharedMailClaimHandler((mailId) => liveConnection?.sendClaimMail({ mailId }));
      // The join's AvatarRef carries only a design id; publish the design
      // itself so the server can resolve that key even before any wardrobe
      // import — and so today's look, not last import's, is what neighbors see.
      publishWornDesign(getWornDesign());
      publishedHomeSignature = '';
      setSelfAccount(selfAccountId);
      publishHome();
      const room = liveConnection;
      setGuestTransport({
        requestFriend: (accountId) => room.sendFriendRequest(accountId),
        answerFriend: (accountId, accept) => room.sendFriendAnswer(accountId, accept),
        removeFriend: (accountId) => room.sendFriendRemove(accountId),
        setHomePolicy: (policy) => room.sendSetHomePolicy(policy),
        enterHome: (host) => room.sendEnterHome(host),
        leaveHome: () => room.sendLeaveHome(),
        answerKnock: (visitor, admit) => room.sendKnockAnswer(visitor, admit),
        askToLeave: (accountId) => room.sendAskToLeave(accountId),
      });
      connected = true;
      ui.setStatus(`online as ${config.name}`, true);
      if (rejoinAttempt === 0) ui.addNotice(`You are visiting ${destination}.`);
      publishStatus({
        phase: 'online',
        message: `Online in ${destination}.`,
        name: config.name,
        inviteCode: config.inviteCode,
        intent: config.intent,
      });
    } catch (error) {
      clearRemoteAvatars();
      clearSharedResourceVisuals();
      clearSharedHomeVisuals();
      setGuestTransport(null);
      connected = false;
      connection = null;
      ui.setStatus('offline');
      // Say which server, because "could not be opened" on its own sends people
      // to check their invite code when the address is usually the problem.
      const where = `at ${config.endpoint}`;
      const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
      const message = managedEntry
        ? `${managedEntry.worldName} could not be opened ${where}.${detail}`
        : config.intent === 'join'
          ? `Neighborhood ${config.inviteCode} was not found ${where}.${detail}`
          : `Neighborhood ${config.inviteCode} could not be opened ${where}.${detail}`;
      console.warn('Shared neighborhood connection failed', error);
      const failure = classifyJoinFailure(error instanceof Error ? error.message : String(error));
      if (failure.kind === 'fatal') {
        console.info('[neighborhood] join refused:', error instanceof Error ? error.message : error);
        stop(failure.notice);
        return 'fatal';
      }
      // Only the first failure is worth a notice; later retries speak
      // through the status line so the chat is not a wall of the same line.
      if (rejoinAttempt === 0) {
        ui.addNotice(`${message} Solo play is still available — trying again shortly.`);
        publishStatus({
          phase: 'offline', message, name: config.name,
          inviteCode: config.inviteCode, intent: config.intent,
        });
      }
    }
    } finally {
      joining = false;
    }
    return connected ? 'ok' : 'retry';
  };

  const firstJoin = await join(managedEntry?.sessionToken);
  if (firstJoin === 'retry') scheduleRejoin();
}

/**
 * Publish a worn design into shared play (avatar Phase D). Wearing is the
 * explicit act that puts art on the account: the room validates the design,
 * stores it on the wearer's account wardrobe, and broadcasts the resolved
 * key so everyone present re-renders the real drawing. Quiet without a live
 * session — solo play has no audience and no connection to carry it.
 */
export function publishWornDesign(input: AvatarDesign | null): void {
  // Send the stored (rounded, size-checked) form — never raw editor floats.
  const design = input ? sanitizeAvatarDesign(input) : null;
  if (!design) return;
  const ref = avatarRefForDesign(design);
  if (!ref.drawingKey) return;
  connection?.sendWearDesign({ design, edgeColor: ref.edgeColor });
}

/**
 * Publish where this account's Home bookmark currently sits, so neighbors
 * can see a staked-out lot appear there (avatar-and-identity.md,
 * land-and-dwellings.md "a nice touch: see the 'under construction' house
 * when someone signs up"). A no-op for guests — the server refuses it, and
 * there is no durable account behind a guest's Home to show anyone anyway.
 */
export function publishHome(): void {
  const home = getPlace(HOME_PLACE_ID);
  // A guest has no account to hold a home, and saying so on every change of
  // house would be noise, not information.
  if (!home || !connection || selfIsGuest()) return;
  const look = publishedLook(getGameState().world.dwelling);
  publishedHomeSignature = homeSignature(home.x, home.z, look);
  connection.sendSetHome({
    x: home.x,
    z: home.z,
    page: getCurrentPageId(),
    parts: look.parts,
    building: look.building,
  });
}

/** What was last sent, so a change of house or spot is sent again and nothing else is. */
let publishedHomeSignature = '';

function homeSignature(x: number, z: number, look: { parts: string[]; building: string }): string {
  return `${x.toFixed(2)}|${z.toFixed(2)}|${look.parts.join(',')}|${look.building}`;
}

/** Neighbors see the house as it is: send it again when a part is finished or started, or Home moves. */
function republishHomeIfChanged(): void {
  if (!connection || !connected) return;
  const home = getPlace(HOME_PLACE_ID);
  if (!home) return;
  const look = publishedLook(getGameState().world.dwelling);
  if (homeSignature(home.x, home.z, look) !== publishedHomeSignature) publishHome();
}
onGameStateChanged(republishHomeIfChanged);

/**
 * Ask the server for another player's card (avatar-and-identity.md §3). A
 * no-op in solo play — there is no one else's account to ask about — and the
 * caller never blocks on this: `handlePlayerCardResponse` patches the answer
 * into whichever card is open, if any still is by the time it arrives.
 */
export function requestPlayerCard(accountId: string): void {
  connection?.sendPlayerCardRequest({ accountId });
}

// `connection` is read fresh on every call, so this survives reconnects and
// leaving/rejoining without needing to be re-registered per session.
setPlayerCardRequestHandler(requestPlayerCard);

export function disconnectSharedSession(): void {
  leftOnPurpose = true;
  connection?.disconnect();
  connection = null;
  connected = false;
  clearRemoteAvatars();
  clearSharedResourceVisuals();
  clearSharedInventory();
  clearSharedHomeVisuals();
  setGuestTransport(null);
  publishStatus({
    phase: 'solo', message: 'Returning to your solo world…', name: playerName,
    inviteCode, intent: null,
  });
}

/**
 * Send this player's place and draw everyone else.
 *
 * Indoors, where the room hears you depends on whether the room knows you are
 * inside. If it does (your own home, or a visit), it hears your real place in
 * the room, and the people inside with you are drawn there. If it does not (a
 * guest has no home on record), friends see you at your door, on the surface
 * page outside, which is what the caller passes as `presence`.
 * (Design: docs/scenes-and-interiors.md.)
 */
export function updateSharedSession(presence?: { position: Vector3; page: string }): void {
  if (!connection || !connected) return;
  const inside = getServerInside();
  // The room is about to decide, or has decided and the screen has not yet
  // moved through the door: what it would hear now is the wrong place.
  if (presenceHeld() || (inside && !isInteriorActive())) return;
  const real = inside !== '' && isInteriorActive();
  const at = real ? avatar.position : presence?.position ?? avatar.position;
  connection.sendMove({
    x: at.x,
    z: at.z,
    facing: getYaw(),
    page: presence?.page ?? getCurrentPageId(),
  });
  for (const id of connection.remoteIds()) {
    const sample = connection.sampleRemote(id);
    if (sample) updateRemoteAvatar(id, sample, at, real ? inside : '');
  }
  syncSharedResourceVisibility();
}

/** Publish a finished local assembly; the server assigns its durable id/maker. */
export function publishSharedPlacedPiece(piece: PlacedPiece): void {
  if (!connection || !connected) return;
  connection.sendPlacePiece({
    templateKey: piece.templateKey,
    x: piece.x,
    z: piece.z,
    rotY: piece.rotY,
    page: piece.page,
    material: piece.material,
  });
  syncSharedPieceVisibility();
}

export function getSharedSessionDebug(): SharedSessionDebug {
  const remotePositions = connection?.remoteIds().flatMap((id) => {
    const sample = connection?.sampleRemote(id);
    return sample ? [{ id, x: sample.x, z: sample.z }] : [];
  }) ?? [];
  return {
    enabled,
    connected,
    name: playerName,
    inviteCode,
    phase: status.phase,
    remotePlayers: remoteAvatarCount(),
    remotePositions,
    sharedPieces: sharedPieceCount(),
  };
}

function sharedNameForThisTab(): string {
  const existing = sessionStorage.getItem('pp.shared-name.v1');
  if (existing) return existing;
  return `Paper Friend ${Math.floor(100 + Math.random() * 900)}`;
}
