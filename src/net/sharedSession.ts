import type { PlacedPiece } from '../../shared/src/index';
import { avatar } from '../game/avatar';
import { getYaw } from '../game/camera';
import { showPetToast } from '../game/petting';
import { getWornDesign } from '../ui/avatarEditor/wardrobe';
import { initializeSharedChat } from '../ui/sharedChat';
import { getCurrentPageId } from '../world/streaming';
import { connect, type NetConnection } from './client';
import { getOrCreatePassport } from './passport';
import {
  addRemoteAvatar,
  clearRemoteAvatars,
  initializeRemoteAvatarVisuals,
  remoteAvatarCount,
  removeRemoteAvatar,
  updateRemoteAvatar,
} from './remoteAvatarVisuals';
import { avatarRefForDesign, readSharedModeConfig } from './sharedConfig';
import {
  addSharedPiece,
  initializeSharedPieceVisuals,
  removeSharedPiece,
  sharedPieceCount,
  syncSharedPieceVisibility,
} from './sharedPieceVisuals';

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
  if (pageUrl.searchParams.get('shared') === '1') enabled = true;
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
  });
  ui.setStatus('connecting…');
  publishStatus({
    phase: 'preparing',
    message: 'Preparing your paper passport…',
    name: config.name,
    inviteCode: config.inviteCode,
    intent: config.intent,
  });
  initializeRemoteAvatarVisuals();
  initializeSharedPieceVisuals();

  // Minting the passport and joining the room are two different things that
  // fail for two different reasons. Wrapping them in one try meant a passport
  // problem was reported as "the neighborhood could not be opened", which
  // named the wrong component and — because the mint is what WRITES the
  // passport — also left localStorage empty for anyone told to read it.
  let account;
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

  try {
    publishStatus({
      phase: 'connecting',
      message: config.intent === 'join'
        ? `Looking for neighborhood ${config.inviteCode}…`
        : `Opening neighborhood ${config.inviteCode}…`,
      name: config.name,
      inviteCode: config.inviteCode,
      intent: config.intent,
    });
    liveConnection = await connect(
      {
        endpoint: config.endpoint,
        name: config.name,
        avatar: avatarRefForDesign(getWornDesign()),
        room: config.room,
        inviteCode: config.inviteCode,
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
        onPieceAdd: addSharedPiece,
        onPieceRemove: removeSharedPiece,
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
        onRemoved: ui.showRemoved,
        onRejected: (info) => {
          // A first movement can be clamped while the server catches up to the
          // real spawn. It is a correction, not a player-facing failure.
          if (info.action === 'move' && info.reason === 'too-far') return;
          showPetToast(`The neighborhood could not ${info.action}: ${info.reason}.`);
        },
        onLeave: () => {
          clearRemoteAvatars();
          connected = false;
          connection = null;
          ui.setStatus('offline');
          ui.addNotice('The neighborhood connection closed. Solo play is still here.');
          publishStatus({
            phase: 'offline',
            message: 'The neighborhood connection closed. Your solo world is still safe.',
            name: config.name,
            inviteCode: config.inviteCode,
            intent: config.intent,
          });
        },
      },
    );
    connection = liveConnection;
    connected = true;
    ui.setStatus(`online as ${config.name}`, true);
    ui.addNotice(`You are visiting neighborhood ${config.inviteCode}.`);
    publishStatus({
      phase: 'online',
      message: `Online in neighborhood ${config.inviteCode}.`,
      name: config.name,
      inviteCode: config.inviteCode,
      intent: config.intent,
    });
  } catch (error) {
    clearRemoteAvatars();
    connected = false;
    connection = null;
    ui.setStatus('offline');
    // Say which server, because "could not be opened" on its own sends people
    // to check their invite code when the address is usually the problem.
    const where = `at ${config.endpoint}`;
    const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
    const message = config.intent === 'join'
      ? `Neighborhood ${config.inviteCode} was not found ${where}.${detail}`
      : `Neighborhood ${config.inviteCode} could not be opened ${where}.${detail}`;
    ui.addNotice(`${message} Solo play is still available.`);
    publishStatus({
      phase: 'offline', message, name: config.name,
      inviteCode: config.inviteCode, intent: config.intent,
    });
    console.warn('Shared neighborhood connection failed', error);
  }
}

export function disconnectSharedSession(): void {
  connection?.disconnect();
  connection = null;
  connected = false;
  clearRemoteAvatars();
  publishStatus({
    phase: 'solo', message: 'Returning to your solo world…', name: playerName,
    inviteCode, intent: null,
  });
}

export function updateSharedSession(): void {
  if (!connection || !connected) return;
  connection.sendMove({
    x: avatar.position.x,
    z: avatar.position.z,
    facing: getYaw(),
    page: getCurrentPageId(),
  });
  for (const id of connection.remoteIds()) {
    const sample = connection.sampleRemote(id);
    if (sample) updateRemoteAvatar(id, sample, avatar.position);
  }
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
