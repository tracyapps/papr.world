import {
  DEFAULT_ROOM,
  LEGACY_INVITE_CODE,
  sanitizeName,
  sanitizeInviteCode,
  type AvatarDesign,
  type AvatarRef,
} from '../../shared/src/index';
import { findPaperColor } from '../ui/avatarEditor/catalog';

const LOCAL_ENDPOINT = 'ws://localhost:2567';

export type SharedModeConfig = {
  endpoint: string;
  httpEndpoint: string;
  name: string;
  room: string;
  inviteCode: string;
  intent: 'create' | 'join';
};

/**
 * Shared play is deliberately opt-in while the neighborhood slice is under
 * construction. Solo URLs never open a socket or mint a paper passport.
 */
export function readSharedModeConfig(
  url: URL,
  fallbackName = 'Paper Friend',
): SharedModeConfig | null {
  if (url.searchParams.get('shared') !== '1') return null;

  const override = url.searchParams.get('server');
  const configured = import.meta.env.VITE_SHARED_WS_ENDPOINT;
  const endpointUrl = new URL(override || configured || LOCAL_ENDPOINT);

  if (endpointUrl.protocol !== 'ws:' && endpointUrl.protocol !== 'wss:') {
    throw new Error(
      `The shared-world server address must start with ws:// or wss://, but it is "${endpointUrl.protocol}". `
      + 'If you set VITE_SHARED_WS_ENDPOINT to an https:// address, change it to wss://.',
    );
  }

  // ── The two misconfigurations that actually happen on a first deploy ────
  //
  // Both used to surface as "neighborhood could not be opened", which named
  // the wrong thing entirely and sent people looking at their invite code.
  // Caught here instead, where we still know exactly what went wrong.
  const pageIsSecure = url.protocol === 'https:';

  if (pageIsSecure && !override && !configured) {
    throw new Error(
      'This build does not know where the neighborhood server is, so it is falling back to '
      + `${LOCAL_ENDPOINT}, which cannot work from ${url.host}. `
      + 'Set VITE_SHARED_WS_ENDPOINT to your server\'s wss:// address and REDEPLOY — '
      + 'Vite bakes it in at build time, so saving the variable alone changes nothing.',
    );
  }

  if (pageIsSecure && endpointUrl.protocol === 'ws:') {
    throw new Error(
      `This page is served over https, so it cannot open an insecure ws:// connection to `
      + `${endpointUrl.host}. Use wss:// instead.`,
    );
  }

  endpointUrl.username = '';
  endpointUrl.password = '';

  const requestedInvite = url.searchParams.get('invite');
  const inviteCode = requestedInvite
    ? sanitizeInviteCode(requestedInvite)
    : LEGACY_INVITE_CODE;
  if (!inviteCode) throw new Error('That neighborhood invite code is not valid.');

  return {
    endpoint: endpointUrl.toString().replace(/\/$/, ''),
    httpEndpoint: httpEndpointForWebSocket(endpointUrl),
    name: sanitizeName(url.searchParams.get('name') || fallbackName),
    room: DEFAULT_ROOM,
    inviteCode,
    intent: url.searchParams.get('intent') === 'join' ? 'join' : 'create',
  };
}

const INVITE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const INVITE_DIGITS = '23456789';

/** Generate the friendly code on the inviting player's device. */
export function generateInviteCode(
  randomIndex: (max: number) => number = (max) => {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    return value[0] % max;
  },
): string {
  const pick = (alphabet: string) => alphabet[randomIndex(alphabet.length)];
  return `${pick(INVITE_LETTERS)}${pick(INVITE_LETTERS)}${pick(INVITE_LETTERS)}${pick(INVITE_LETTERS)}-${pick(INVITE_DIGITS)}${pick(INVITE_DIGITS)}`;
}

export function buildSharedPlayUrl(
  current: URL,
  options: { inviteCode: string; intent: 'create' | 'join'; name?: string },
): URL {
  const inviteCode = sanitizeInviteCode(options.inviteCode);
  if (!inviteCode) throw new Error('That neighborhood invite code is not valid.');
  const next = new URL(current.toString());
  next.searchParams.set('shared', '1');
  next.searchParams.set('invite', inviteCode);
  next.searchParams.set('intent', options.intent);
  if (options.name) next.searchParams.set('name', sanitizeName(options.name));
  else next.searchParams.delete('name');
  return next;
}

export function buildSoloUrl(current: URL): URL {
  const next = new URL(current.toString());
  // Keep an optional hosted endpoint so opening Friends again still knows
  // where to connect. Without `shared=1`, it cannot open a socket on its own.
  for (const key of ['shared', 'invite', 'intent', 'name']) {
    next.searchParams.delete(key);
  }
  return next;
}

export function httpEndpointForWebSocket(endpoint: string | URL): string {
  const url = typeof endpoint === 'string' ? new URL(endpoint) : new URL(endpoint.toString());
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error('Expected a WebSocket server address.');
  }
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '';
  url.search = '';
  url.hash = '';
  return url.toString().replace(/\/$/, '');
}

/** A small, safe visual identity for peers that do not have the full drawing. */
export function avatarRefForDesign(design: AvatarDesign | null): AvatarRef {
  if (!design) {
    return { preset: 'medium', drawingKey: '', edgeColor: '#e8e2d0' };
  }
  return {
    preset: design.preset,
    drawingKey: design.id,
    edgeColor: findPaperColor(design.paper.color).fill,
  };
}
