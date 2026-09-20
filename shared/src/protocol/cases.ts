// Display cases: a piece that holds things for visitors to look at, or take.
//
// Design: docs/house-and-home.md ("Display cases"). Renderer-free and
// networking-free like the rest of this tree.
//
// Two modes, chosen by the owner per case:
//   * show - look and read the label. Holds keepsakes (trinkets); nothing can
//     be taken. The trinket stays on the owner's own shelf too: showing is a
//     copy of how it looks, so a case can never eat a keepsake.
//   * free - take one, up to the owner's limit per visitor per time window.
//     Holds stacks moved out of the owner's Neighborhood Pouch, so what a
//     visitor takes really was somebody's, and moves into the visitor's pouch.
//
// Priced cases are parked with player-to-player chip sales (economy.md), so
// there is no price anywhere in this file, on purpose.
//
// Two rules run through the server side of this:
//   * The client asks, the server decides. Every count, limit and owner check
//     is the server's.
//   * A block is silent. A blocked visitor is told "nothing to take right
//     now", exactly what an empty case says.

import { LIMITS } from './constants';

export type CaseMode = 'show' | 'free';

/** What a case holds. A stack is goods (`free` mode); a trinket is a look (`show` mode). */
export type CaseItem =
  | { kind: 'trinket'; defId: string; seed: number }
  | { kind: 'resource' | 'tool' | 'item'; itemId: string; quantity: number };

export type CaseStackKind = 'resource' | 'tool' | 'item';

/** N items per visitor per window. No limit at all is `null`, never a big number. */
export type CaseLimit = { count: number; windowMinutes: number };

export const CASE_LIMIT_BOUNDS = {
  countMin: 1,
  countMax: 20,
  windowMinMinutes: 10,
  windowMaxMinutes: 7 * 24 * 60,
} as const;

/** One item per visitor per day, until the owner says otherwise. */
export const DEFAULT_CASE_LIMIT: CaseLimit = { count: 1, windowMinutes: 24 * 60 };

/** The template key of the build piece. The one place this string lives on the shared side. */
export const DISPLAY_CASE_TEMPLATE = 'display-case';

/** Everything the room shows about a case. Private things (the log, a visitor's own count) are not here. */
export type CaseState = {
  /** The id of the placed piece it is. */
  id: string;
  /** Account id of the owner (the piece's maker). */
  owner: string;
  mode: CaseMode;
  label: string;
  items: CaseItem[];
  /** Only meaningful in `free` mode. */
  limit: CaseLimit | null;
};

// ---- Intents ------------------------------------------------------------------

export type CaseSetIntent = {
  id: string;
  mode?: CaseMode;
  label?: string;
  /** A limit, or `null` to remove it. Absent leaves it alone. */
  limit?: CaseLimit | null;
};
export type CaseStockIntent = { id: string; kind: CaseStackKind; itemId: string; quantity: number };
export type CaseShowIntent = { id: string; defId: string; seed: number };
/** Return a stack to the owner's pouch, or take a trinket off the case. */
export type CaseRemoveIntent = { id: string; index: number };
/** Take one unit from the stack at `index`. */
export type CaseTakeIntent = { id: string; index: number };
export type CaseRequestIntent = { id: string };

// ---- Results ------------------------------------------------------------------

export type CaseAction = 'set' | 'stock' | 'remove' | 'show' | 'take';

export type CaseOutcome =
  | 'ok'
  /** Nothing there to take. Also what a blocked visitor hears. */
  | 'empty'
  /** The visitor has taken their share for now. `resetsAt` says when more opens up. */
  | 'limit'
  /** Guests have no pouch to put things in. */
  | 'guest'
  | 'too-far'
  | 'not-yours'
  | 'wrong-mode'
  | 'full'
  /** The owner's pouch does not have that. */
  | 'no-stock'
  /** Change the case's mode only when it is empty. */
  | 'not-empty'
  | 'invalid';

export type CaseResult = {
  id: string;
  action: CaseAction;
  outcome: CaseOutcome;
  /** For a take: what was taken, so the words can name it. */
  taken?: { kind: CaseStackKind; itemId: string };
  /** For `limit`: server epoch ms when the visitor may take again. */
  resetsAt?: number;
};

/** One line of who took what. Owner only; a note, never a public tally. */
export type CaseLogEntry = {
  at: number;
  accountId: string;
  name: string;
  kind: CaseStackKind;
  itemId: string;
  quantity: number;
};

/** What the asker personally needs to know about a case. */
export type CaseDetail = {
  id: string;
  /** How many more this visitor may take now; `null` when there is no limit. */
  remaining: number | null;
  /** When one more opens up for them, or `null` when nothing is waiting. */
  resetsAt: number | null;
  /** The owner's log, newest first. Absent for everyone else. */
  log?: CaseLogEntry[];
};

// ---- Sanitizers ---------------------------------------------------------------

const ID_PATTERN = /^[A-Za-z0-9_.:\-]{1,80}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** A case id is a piece id, which is a UUID; anything else is refused. */
export function sanitizeCaseId(raw: unknown): string | null {
  return typeof raw === 'string' && ID_PATTERN.test(raw) ? raw : null;
}

export function sanitizeCaseMode(raw: unknown): CaseMode | null {
  return raw === 'show' || raw === 'free' ? raw : null;
}

/** Trimmed, single-spaced, no control characters, at most `caseLabelMax` long. */
export function sanitizeCaseLabel(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.slice(0, LIMITS.caseLabelMax).trim();
}

export function sanitizeCaseLimit(raw: unknown): CaseLimit | null {
  if (!isRecord(raw)) return null;
  const { count, windowMinutes } = raw;
  if (!isInt(count) || !isInt(windowMinutes)) return null;
  if (count < CASE_LIMIT_BOUNDS.countMin || count > CASE_LIMIT_BOUNDS.countMax) return null;
  if (windowMinutes < CASE_LIMIT_BOUNDS.windowMinMinutes
    || windowMinutes > CASE_LIMIT_BOUNDS.windowMaxMinutes) return null;
  return { count, windowMinutes };
}

export function sanitizeCaseItem(raw: unknown): CaseItem | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === 'trinket') {
    if (typeof raw.defId !== 'string' || !ID_PATTERN.test(raw.defId)) return null;
    const seed = isInt(raw.seed) ? raw.seed : 0;
    return { kind: 'trinket', defId: raw.defId, seed };
  }
  if (raw.kind === 'resource' || raw.kind === 'tool' || raw.kind === 'item') {
    if (typeof raw.itemId !== 'string' || raw.itemId.length === 0 || raw.itemId.length > 128) return null;
    if (!isInt(raw.quantity) || raw.quantity < 1 || raw.quantity > LIMITS.inventoryStackMax) return null;
    return { kind: raw.kind, itemId: raw.itemId, quantity: raw.quantity };
  }
  return null;
}

/** A well-formed, bounded item list; malformed entries are dropped, extras cut. */
export function sanitizeCaseItems(raw: unknown): CaseItem[] {
  if (!Array.isArray(raw)) return [];
  const items: CaseItem[] = [];
  for (const entry of raw) {
    const item = sanitizeCaseItem(entry);
    if (item) items.push(item);
    if (items.length >= LIMITS.caseSlots) break;
  }
  return items;
}

/** The wire form of a case's items inside synced state: one bounded JSON string. */
export function encodeCaseItems(items: readonly CaseItem[]): string {
  return JSON.stringify(items);
}

export function decodeCaseItems(text: string): CaseItem[] {
  if (typeof text !== 'string' || text.length === 0 || text.length > 4096) return [];
  try {
    return sanitizeCaseItems(JSON.parse(text));
  } catch {
    return [];
  }
}

export function sanitizeCaseSet(raw: unknown): CaseSetIntent | null {
  if (!isRecord(raw)) return null;
  const id = sanitizeCaseId(raw.id);
  if (!id) return null;
  const result: CaseSetIntent = { id };
  if (raw.mode !== undefined) {
    const mode = sanitizeCaseMode(raw.mode);
    if (!mode) return null;
    result.mode = mode;
  }
  if (raw.label !== undefined) {
    if (typeof raw.label !== 'string') return null;
    result.label = sanitizeCaseLabel(raw.label);
  }
  if (raw.limit !== undefined) {
    if (raw.limit === null) result.limit = null;
    else {
      const limit = sanitizeCaseLimit(raw.limit);
      if (!limit) return null;
      result.limit = limit;
    }
  }
  return result;
}

export function sanitizeCaseStock(raw: unknown): CaseStockIntent | null {
  if (!isRecord(raw)) return null;
  const id = sanitizeCaseId(raw.id);
  if (!id) return null;
  const item = sanitizeCaseItem({ kind: raw.kind, itemId: raw.itemId, quantity: raw.quantity });
  if (!item || item.kind === 'trinket') return null;
  if (item.quantity > LIMITS.mailAttachmentMax) return null;
  return { id, kind: item.kind, itemId: item.itemId, quantity: item.quantity };
}

export function sanitizeCaseShow(raw: unknown): CaseShowIntent | null {
  if (!isRecord(raw)) return null;
  const id = sanitizeCaseId(raw.id);
  const item = sanitizeCaseItem({ kind: 'trinket', defId: raw.defId, seed: raw.seed });
  if (!id || !item || item.kind !== 'trinket') return null;
  return { id, defId: item.defId, seed: item.seed };
}

/** Shared by remove and take: an id and a slot number. */
export function sanitizeCaseSlot(raw: unknown): { id: string; index: number } | null {
  if (!isRecord(raw)) return null;
  const id = sanitizeCaseId(raw.id);
  if (!id || !isInt(raw.index) || raw.index < 0 || raw.index >= LIMITS.caseSlots) return null;
  return { id, index: raw.index };
}

export function sanitizeCaseRequest(raw: unknown): CaseRequestIntent | null {
  if (!isRecord(raw)) return null;
  const id = sanitizeCaseId(raw.id);
  return id ? { id } : null;
}

// ---- The per-visitor limit ------------------------------------------------------

/**
 * How much of a visitor's allowance is left, from the times they took things.
 *
 * A take stops counting `windowMinutes` after it happened, so allowance returns
 * one item at a time as the oldest takes age out. `resetsAt` is when the next
 * one returns, or `null` when nothing is waiting to.
 */
export function caseAllowance(
  limit: CaseLimit | null,
  takes: readonly number[],
  now: number,
): { remaining: number | null; resetsAt: number | null } {
  if (!limit) return { remaining: null, resetsAt: null };
  const windowMs = limit.windowMinutes * 60_000;
  const counted = takes.filter((at) => at > now - windowMs).sort((a, b) => a - b);
  const remaining = Math.max(0, limit.count - counted.length);
  const resetsAt = counted.length > 0 ? counted[0] + windowMs : null;
  return { remaining, resetsAt };
}

/** "1 item per visitor per day" — the rule in words, for every screen that shows it. */
export function describeCaseLimit(limit: CaseLimit | null): string {
  if (!limit) return 'no limit per visitor';
  const things = limit.count === 1 ? '1 item' : `${limit.count} items`;
  const minutes = limit.windowMinutes;
  let window: string;
  if (minutes === 24 * 60) window = 'day';
  else if (minutes === 7 * 24 * 60) window = 'week';
  else if (minutes === 60) window = 'hour';
  else if (minutes % (24 * 60) === 0) window = `${minutes / (24 * 60)} days`;
  else if (minutes % 60 === 0) window = `${minutes / 60} hours`;
  else window = `${minutes} minutes`;
  return `${things} per visitor per ${window}`;
}
