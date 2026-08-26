// Pure validation + rules shared by client and server.
//
// The server MUST call these before trusting any intent (it is authoritative).
// The client MAY call the same helpers for instant UI feedback before a round
// trip. Because the logic lives here once, both sides always agree.

import { LIMITS } from './constants';
import type { AvatarRef } from './state';
import type { AccountCredentials, PlacePieceIntent } from './messages';

const AVATAR_PRESETS: AvatarRef['preset'][] = [
  'small',
  'medium',
  'wide',
  'tall',
  'wheeled',
  'hovering',
];

/** Drop ASCII control characters (code < 0x20 and 0x7f) without regex-escape ambiguity. */
function stripControlChars(text: string): string {
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

/** Trim + clamp a chat line. Returns null if there's nothing worth sending. */
export function sanitizeChat(raw: unknown): string | null {
  const text = typeof raw === 'string' ? raw : '';
  const cleaned = stripControlChars(text).trim().slice(0, LIMITS.chatMaxLength);
  return cleaned.length > 0 ? cleaned : null;
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
  };
}

/** True when a finite number came through. Guards against NaN/Infinity spoofs. */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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
