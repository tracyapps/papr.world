// Pure validation + rules shared by client and server.
//
// The server MUST call these before trusting any intent (it is authoritative).
// The client MAY call the same helpers for instant UI feedback before a round
// trip. Because the logic lives here once, both sides always agree.

import { LIMITS } from './constants';
import type { AvatarRef } from './state';

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

function isHexColor(value: unknown): boolean {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function distance2D(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
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
