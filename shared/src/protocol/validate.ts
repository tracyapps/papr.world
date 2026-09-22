// Pure validation + rules shared by client and server.
//
// The server MUST call these before trusting any intent (it is authoritative).
// The client MAY call the same helpers for instant UI feedback before a round
// trip. Because the logic lives here once, both sides always agree.

import { DEFAULT_MAILBOX_PRIMARY, DEFAULT_MAILBOX_SECONDARY, DEFAULT_MAILBOX_STYLE, LIMITS } from './constants';
import { sanitizeHomeBuilding, sanitizeHomeParts, sanitizeMailboxColor, sanitizeMailboxStyle } from './guests';
import type { AccountInventory, AccountTech, AvatarRef, MailItem, SoloMigrationSnapshot } from './state';
import type {
  AccountCredentials,
  ClaimMailIntent,
  MailAttachmentIntent,
  PlacePieceIntent,
  SendMailIntent,
  SetHomeIntent,
} from './messages';

const AVATAR_PRESETS: AvatarRef['preset'][] = [
  'small',
  'medium',
  'wide',
  'tall',
  'wheeled',
  'hovering',
];

/** Drop ASCII control characters (code < 0x20 and 0x7f) without regex-escape ambiguity. */
export function stripControlChars(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) continue;
    out += text[i];
  }
  return out;
}

/** Collapse whitespace, strip control chars, clamp length, fall back if empty. */
export function sanitizeName(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : '';
  const cleaned = stripControlChars(text)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIMITS.nameMaxLength);
  return cleaned.length > 0 ? cleaned : 'paper friend';
}

/**
 * Normalize a pasted invite into `ABCD-23` form. Ambiguous I/O/0/1 glyphs are
 * excluded so a spoken or handwritten code has one obvious spelling.
 */
export function sanitizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const compact = raw.toUpperCase().replace(/[\s-]+/g, '');
  if (!/^[A-HJ-NP-Z]{4}[2-9]{2}$/.test(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

/** Accept canonical UUIDs used by durable account and world records. */
export function sanitizeWorldId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
    ? value
    : null;
}

/** Trim + clamp a chat line. Returns null if there's nothing worth sending. */
export function sanitizeChat(raw: unknown): string | null {
  const text = typeof raw === 'string' ? raw : '';
  const cleaned = stripControlChars(text).trim().slice(0, LIMITS.chatMaxLength);
  return cleaned.length > 0 ? cleaned : null;
}

/** Trim and bound a private letter using the same control-character rules as chat. */
export function sanitizeMailText(raw: unknown): string | null {
  const text = typeof raw === 'string' ? raw : '';
  const cleaned = stripControlChars(text).trim().slice(0, LIMITS.mailTextMaxLength);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * The optional note that may ride along with a friend request. Same rules as
 * chat and mail — trimmed, control characters stripped, bounded — and null
 * when there is nothing worth sending, so an empty note is simply omitted.
 */
export function sanitizeFriendRequestMessage(raw: unknown): string | null {
  const text = typeof raw === 'string' ? raw : '';
  const cleaned = stripControlChars(text).trim().slice(0, LIMITS.friendRequestMessageMax);
  return cleaned.length > 0 ? cleaned : null;
}

export function sanitizeSendMail(raw: unknown): SendMailIntent | null {
  const value = (raw ?? {}) as Partial<SendMailIntent>;
  const toAccountId = typeof value.toAccountId === 'string' ? value.toAccountId.trim() : '';
  const text = sanitizeMailText(value.text);
  if (!toAccountId || toAccountId.length > 160 || !text) return null;
  const attachment = value.attachment === undefined
    ? undefined : sanitizeMailAttachment(value.attachment);
  if (value.attachment !== undefined && !attachment) return null;
  return { toAccountId, text, ...(attachment ? { attachment } : {}) };
}

export function sanitizeMailAttachment(raw: unknown): MailAttachmentIntent | null {
  const value = (raw ?? {}) as Partial<MailAttachmentIntent> & { itemId?: unknown };
  if (!Number.isSafeInteger(value.quantity) || (value.quantity ?? 0) < 1
    || (value.quantity ?? 0) > LIMITS.mailAttachmentMax) return null;
  const quantity = value.quantity as number;
  if (value.kind === 'chips') return { kind: 'chips', quantity };
  if (value.kind !== 'resource' && value.kind !== 'tool' && value.kind !== 'item') return null;
  const itemId = typeof value.itemId === 'string' ? value.itemId.trim() : '';
  if (!itemId || itemId.length > 128) return null;
  return { kind: value.kind, itemId, quantity };
}

export function sanitizeClaimMail(raw: unknown): ClaimMailIntent | null {
  const value = (raw ?? {}) as Partial<ClaimMailIntent>;
  const mailId = typeof value.mailId === 'string' ? value.mailId.trim() : '';
  return mailId && mailId.length <= 160 ? { mailId } : null;
}

/** Validate a server inventory snapshot before exposing it to UI state. */
export function sanitizeAccountInventory(raw: unknown): AccountInventory | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<AccountInventory>;
  if (!Number.isSafeInteger(value.revision) || (value.revision ?? -1) < 0) return null;
  if (!Number.isSafeInteger(value.chips) || (value.chips ?? -1) < 0) return null;
  const safeBag = (bag: unknown): Record<string, number> | null => {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return null;
    const result: Record<string, number> = {};
    for (const [key, count] of Object.entries(bag)) {
      if (!key || key.length > 128 || !Number.isSafeInteger(count) || (count as number) < 0) return null;
      result[key] = Math.min(count as number, LIMITS.inventoryStackMax);
    }
    return result;
  };
  const resources = safeBag(value.resources);
  const tools = safeBag(value.tools);
  const items = safeBag(value.items);
  if (!resources || !tools || !items) return null;
  return {
    revision: value.revision as number,
    chips: Math.min(value.chips as number, LIMITS.inventoryStackMax),
    resources, tools, items,
  };
}

/** Validate a server tech record before exposing it to UI state. */
export function sanitizeAccountTech(raw: unknown): AccountTech | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<AccountTech>;
  if (!Number.isSafeInteger(value.revision) || (value.revision ?? 0) < 1) return null;
  if (!Array.isArray(value.plans)) return null;
  const plans = [...new Set(
    value.plans.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128),
  )].slice(0, LIMITS.accountPlansMax);
  return { revision: value.revision as number, plans };
}

/**
 * Validate a self-reported solo-save snapshot before it is even shown on
 * the review screen, let alone imported. Every count is clamped to
 * `soloMigrationStackMax` (far below `inventoryStackMax`) rather than
 * rejected outright, on the theory that a tampered save should be
 * visibly capped in the review the player confirms, not silently refused
 * with no explanation.
 */
export function sanitizeSoloMigrationSnapshot(raw: unknown): SoloMigrationSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<SoloMigrationSnapshot>;
  if (!Number.isFinite(value.chips)) return null;
  const safeBag = (bag: unknown): Record<string, number> | null => {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return null;
    const entries = Object.entries(bag);
    if (entries.length > LIMITS.soloMigrationBagKeysMax) return null;
    const result: Record<string, number> = {};
    for (const [key, count] of entries) {
      if (!key || key.length > 128 || !Number.isFinite(count)) return null;
      const clamped = Math.max(0, Math.min(LIMITS.soloMigrationStackMax, Math.floor(count as number)));
      if (clamped > 0) result[key] = clamped;
    }
    return result;
  };
  const resources = safeBag(value.resources);
  const tools = safeBag(value.tools);
  const items = safeBag(value.items);
  if (!resources || !tools || !items) return null;
  if (!Array.isArray(value.plans) || value.plans.length > LIMITS.soloMigrationPlansMax) return null;
  const plans = [...new Set(
    value.plans.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128),
  )];
  return {
    chips: Math.max(0, Math.min(LIMITS.soloMigrationStackMax, Math.floor(value.chips as number))),
    resources,
    tools,
    items,
    plans,
  };
}

/** Validate persisted or network-delivered mail before it reaches a player save. */
export function sanitizeMailItem(raw: unknown): MailItem | null {
  const value = (raw ?? {}) as Partial<MailItem>;
  if (typeof value.id !== 'string' || !value.id.trim() || value.id.length > 160) return null;
  if (typeof value.fromAccountId !== 'string' || value.fromAccountId.length > 160) return null;
  if (typeof value.fromName !== 'string' || value.fromName.length > 80) return null;
  if (typeof value.kind !== 'string' || value.kind.length > 40) return null;
  if (typeof value.at !== 'number' || !Number.isFinite(value.at)) return null;
  if (!value.payload || typeof value.payload !== 'object' || Array.isArray(value.payload)) return null;

  const payload: Record<string, string | number> = {};
  for (const [key, item] of Object.entries(value.payload)) {
    if (!key || key.length > 64) continue;
    if (typeof item === 'string') payload[key] = item.slice(0, 500);
    else if (typeof item === 'number' && Number.isFinite(item)) payload[key] = item;
  }
  return {
    id: value.id,
    fromAccountId: value.fromAccountId,
    fromName: value.fromName,
    kind: value.kind,
    payload,
    at: Math.max(0, value.at),
  };
}

/** Normalize an untrusted avatar reference into a safe, complete one. */
export function sanitizeAvatar(raw: unknown): AvatarRef {
  const value = (raw ?? {}) as Partial<AvatarRef>;
  const preset = AVATAR_PRESETS.includes(value.preset as AvatarRef['preset'])
    ? (value.preset as AvatarRef['preset'])
    : 'medium';
  const drawingKey =
    typeof value.drawingKey === 'string' ? value.drawingKey.slice(0, 128) : '';
  const edgeColor = isHexColor(value.edgeColor) ? (value.edgeColor as string) : '#3a3226';
  return { preset, drawingKey, edgeColor };
}

/**
 * Shape-check untrusted passport credentials before the server looks them up.
 * Returns null rather than throwing so a malformed join can fall back to
 * guest handling (or be refused) by policy, not by accident.
 */
export function sanitizeAccountCredentials(raw: unknown): AccountCredentials | null {
  const value = (raw ?? {}) as Partial<AccountCredentials>;
  if (typeof value.id !== 'string' || typeof value.secret !== 'string') return null;
  const id = value.id.trim();
  const secret = value.secret.trim();
  // UUIDs are 36 chars; allow a little slack but refuse anything silly.
  if (id.length < 8 || id.length > 64) return null;
  if (secret.length < 16 || secret.length > 128) return null;
  return { id, secret };
}

function isHexColor(value: unknown): boolean {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function distance2D(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * A point on the ground plus how much personal space it claims.
 *
 * `spacing` is the minimum centre-to-centre distance two pieces may have.
 * The land-and-dwellings design rule is "spacing, not ownership": a new piece
 * simply cannot be too close to something already standing, so the rule can
 * run deterministically on any client and on the authoritative server alike.
 */
export type SpacedPoint = { x: number; z: number; spacing: number };

/**
 * Whether two spaced points are too close to one another.
 *
 * Each side contributes half of its own spacing, so a tidy piece may sit
 * closer to a tidy neighbour than to a sprawling one — the same "the larger
 * of the two wins" spirit the plant-crowding rule uses.
 */
export function piecesOverlap(a: SpacedPoint, b: SpacedPoint): boolean {
  return distance2D(a.x, a.z, b.x, b.z) < (a.spacing + b.spacing) / 2;
}

/**
 * Normalize an untrusted place-piece intent into a complete, safe one.
 *
 * Returns null when the intent is fundamentally unusable (no template or a
 * non-finite coordinate). The server MUST run this before trusting the
 * intent; the client may run the same helper so the two can never disagree.
 */
export function sanitizePlacePiece(raw: unknown): PlacePieceIntent | null {
  const value = (raw ?? {}) as Partial<PlacePieceIntent>;
  if (typeof value.templateKey !== 'string' || value.templateKey.length === 0) {
    return null;
  }
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.z)) {
    return null;
  }
  return {
    templateKey: value.templateKey.slice(0, 64),
    x: value.x,
    z: value.z,
    rotY: isFiniteNumber(value.rotY) ? value.rotY : 0,
    page: typeof value.page === 'string' ? value.page.slice(0, 32) : '',
    // Bounded the same defensive way as templateKey. Whether this string is
    // one of that piece type's real material options is checked downstream
    // (resolveBuildMaterial), same as templateKey's own membership in
    // BUILD_PIECE_DEFS is checked downstream rather than here.
    material: typeof value.material === 'string' ? value.material.slice(0, 64) : '',
  };
}

/** True when a finite number came through. Guards against NaN/Infinity spoofs. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Same shape and bar as `sanitizePlacePiece` — a home marker is just a
 *  position and a page, no template or material to check. */
export function sanitizeSetHome(raw: unknown): SetHomeIntent | null {
  const value = (raw ?? {}) as Partial<SetHomeIntent>;
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.z)) return null;
  return {
    x: value.x,
    z: value.z,
    page: typeof value.page === 'string' ? value.page.slice(0, 32) : '',
    parts: sanitizeHomeParts(value.parts),
    building: sanitizeHomeBuilding(value.building),
    mailboxStyle: sanitizeMailboxStyle(value.mailboxStyle, DEFAULT_MAILBOX_STYLE),
    mailboxPrimary: sanitizeMailboxColor(value.mailboxPrimary, DEFAULT_MAILBOX_PRIMARY),
    mailboxSecondary: sanitizeMailboxColor(value.mailboxSecondary, DEFAULT_MAILBOX_SECONDARY),
  };
}

export type MovePoint = { x: number; z: number };

/**
 * Anti-teleport clamp. Given the last accepted position, a requested one, and
 * the elapsed seconds, return the position the server should actually store:
 * the request if it's reachable at max speed, otherwise the point on the line
 * toward it that IS reachable. `ok` is false when a clamp happened.
 */
export function clampMove(
  prev: MovePoint,
  next: MovePoint,
  dtSeconds: number,
): { point: MovePoint; ok: boolean } {
  if (!isFiniteNumber(next.x) || !isFiniteNumber(next.z)) {
    return { point: prev, ok: false };
  }
  const budget = LIMITS.maxMoveSpeed * Math.max(dtSeconds, 1 / 60);
  const dist = distance2D(prev.x, prev.z, next.x, next.z);
  if (dist <= budget) return { point: { x: next.x, z: next.z }, ok: true };
  const t = budget / dist;
  return {
    point: { x: prev.x + (next.x - prev.x) * t, z: prev.z + (next.z - prev.z) * t },
    ok: false,
  };
}
