// Display cases, server side: the rules, as plain functions.
//
// A case is a held stock of goods, so it lives next to the account inventories
// in `mail.ts` (one file, one flush), where "debit the owner and stock the
// case" and "take from the case and credit the visitor" can each be one
// atomic step with a rollback. This file holds only the rules. Nothing here
// touches disk, a clock, or a room: the caller passes `now` and the inventory.
//
// Design: docs/house-and-home.md ("Display cases"); wire types in
// shared/src/protocol/cases.ts.

import {
  DEFAULT_CASE_LIMIT,
  LIMITS,
  caseAllowance,
  sanitizeCaseId,
  sanitizeCaseItems,
  sanitizeCaseLabel,
  sanitizeCaseLimit,
  sanitizeCaseMode,
  type AccountInventory,
  type CaseItem,
  type CaseLimit,
  type CaseLogEntry,
  type CaseMode,
  type CaseOutcome,
  type CaseSetIntent,
  type CaseShowIntent,
  type CaseStackKind,
  type CaseStockIntent,
  type CaseState,
} from '../../shared/src/index';

/** Everything the server keeps about one case. */
export type CaseRecord = {
  id: string;
  owner: string;
  mode: CaseMode;
  label: string;
  items: CaseItem[];
  limit: CaseLimit | null;
  /** Newest first, at most `LIMITS.caseLogMax`. Owner only. */
  log: CaseLogEntry[];
  /** Visitor account id -> server epoch ms of each take. Private. */
  takes: Record<string, number[]>;
};

export type CaseChange =
  | { ok: true; taken?: { kind: CaseStackKind; itemId: string } }
  | { ok: false; outcome: CaseOutcome; resetsAt?: number };

/** The result of one edit: how it went, and the case as it now stands. */
export type CaseEdit = { change: CaseChange; record: CaseRecord };

const REFUSED = (outcome: CaseOutcome, resetsAt?: number): CaseChange =>
  resetsAt === undefined ? { ok: false, outcome } : { ok: false, outcome, resetsAt };

/** How many different visitors' takes a case remembers before dropping the stale ones. */
const TAKES_TRACKED_MAX = 400;

export function newCaseRecord(id: string, owner: string): CaseRecord {
  return {
    id, owner, mode: 'show', label: '', items: [], limit: { ...DEFAULT_CASE_LIMIT }, log: [], takes: {},
  };
}

/** What everyone in the room may see. */
export function publicCase(record: CaseRecord): CaseState {
  return {
    id: record.id,
    owner: record.owner,
    mode: record.mode,
    label: record.label,
    items: record.items.map((item) => ({ ...item })),
    limit: record.limit ? { ...record.limit } : null,
  };
}

export function cloneCase(record: CaseRecord): CaseRecord {
  return {
    ...record,
    items: record.items.map((item) => ({ ...item })),
    limit: record.limit ? { ...record.limit } : null,
    log: record.log.map((entry) => ({ ...entry })),
    takes: Object.fromEntries(Object.entries(record.takes).map(([id, at]) => [id, [...at]])),
  };
}

/** A record from disk, or null. Bad fields fall back; a bad id or owner drops the whole thing. */
export function sanitizeCaseRecord(raw: unknown): CaseRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<CaseRecord>;
  const id = sanitizeCaseId(value.id);
  if (!id || typeof value.owner !== 'string' || value.owner.length === 0 || value.owner.length > 128) return null;
  const mode = sanitizeCaseMode(value.mode) ?? 'show';
  // Only the items that belong to the mode: a hand-edited file cannot smuggle a stack into a show case.
  const items = sanitizeCaseItems(value.items).filter((item) =>
    mode === 'show' ? item.kind === 'trinket' : item.kind !== 'trinket');
  const limit = value.limit === null ? null : sanitizeCaseLimit(value.limit) ?? { ...DEFAULT_CASE_LIMIT };
  const log: CaseLogEntry[] = [];
  if (Array.isArray(value.log)) {
    for (const entry of value.log) {
      const line = sanitizeLogEntry(entry);
      if (line) log.push(line);
      if (log.length >= LIMITS.caseLogMax) break;
    }
  }
  const takes: Record<string, number[]> = {};
  if (value.takes && typeof value.takes === 'object' && !Array.isArray(value.takes)) {
    for (const [visitor, times] of Object.entries(value.takes).slice(0, TAKES_TRACKED_MAX)) {
      if (!visitor || visitor.length > 128 || !Array.isArray(times)) continue;
      const kept = times.filter((at): at is number => typeof at === 'number' && Number.isFinite(at)).slice(-LIMITS.caseSlots * 20);
      if (kept.length > 0) takes[visitor] = kept;
    }
  }
  return { id, owner: value.owner, mode, label: sanitizeCaseLabel(value.label), items, limit, log, takes };
}

function sanitizeLogEntry(raw: unknown): CaseLogEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<CaseLogEntry>;
  if (typeof value.at !== 'number' || !Number.isFinite(value.at)) return null;
  if (typeof value.accountId !== 'string' || typeof value.name !== 'string') return null;
  if (value.kind !== 'resource' && value.kind !== 'tool' && value.kind !== 'item') return null;
  if (typeof value.itemId !== 'string' || value.itemId.length === 0 || value.itemId.length > 128) return null;
  const quantity = Number.isSafeInteger(value.quantity) && (value.quantity as number) > 0 ? (value.quantity as number) : 1;
  return {
    at: value.at, accountId: value.accountId.slice(0, 128), name: value.name.slice(0, LIMITS.nameMaxLength),
    kind: value.kind, itemId: value.itemId, quantity,
  };
}

function bagFor(inventory: AccountInventory, kind: CaseStackKind): Record<string, number> {
  return kind === 'resource' ? inventory.resources : kind === 'tool' ? inventory.tools : inventory.items;
}

// ---- Owner actions ------------------------------------------------------------

/**
 * Change mode, label or limit. The mode may change only while the case is
 * empty: a stack cannot turn into a trinket, and quietly moving goods between
 * kinds of holding would be a place for them to go missing.
 */
export function applySet(record: CaseRecord, intent: CaseSetIntent): CaseChange {
  if (intent.mode !== undefined && intent.mode !== record.mode) {
    if (record.items.length > 0) return REFUSED('not-empty');
    record.mode = intent.mode;
  }
  if (intent.label !== undefined) record.label = sanitizeCaseLabel(intent.label);
  if (intent.limit !== undefined) record.limit = intent.limit ? { ...intent.limit } : null;
  return { ok: true };
}

/** Move a stack from the owner's pouch into the case. */
export function applyStock(ownerInventory: AccountInventory, record: CaseRecord, intent: CaseStockIntent): CaseChange {
  if (record.mode !== 'free') return REFUSED('wrong-mode');
  const bag = bagFor(ownerInventory, intent.kind);
  if ((bag[intent.itemId] ?? 0) < intent.quantity) return REFUSED('no-stock');
  const existing = record.items.find((item) =>
    item.kind === intent.kind && 'itemId' in item && item.itemId === intent.itemId);
  if (existing && existing.kind !== 'trinket') {
    if (existing.quantity + intent.quantity > LIMITS.inventoryStackMax) return REFUSED('full');
    existing.quantity += intent.quantity;
  } else {
    if (record.items.length >= LIMITS.caseSlots) return REFUSED('full');
    record.items.push({ kind: intent.kind, itemId: intent.itemId, quantity: intent.quantity });
  }
  bag[intent.itemId] = (bag[intent.itemId] ?? 0) - intent.quantity;
  return { ok: true };
}

/** Put a trinket's look on a show case. A trinket already there is left as it is. */
export function applyShow(record: CaseRecord, intent: CaseShowIntent): CaseChange {
  if (record.mode !== 'show') return REFUSED('wrong-mode');
  const already = record.items.some((item) =>
    item.kind === 'trinket' && item.defId === intent.defId && item.seed === intent.seed);
  if (already) return { ok: true };
  if (record.items.length >= LIMITS.caseSlots) return REFUSED('full');
  record.items.push({ kind: 'trinket', defId: intent.defId, seed: intent.seed });
  return { ok: true };
}

/** Take a whole stack back into the owner's pouch, or a trinket off the case. */
export function applyRemove(ownerInventory: AccountInventory, record: CaseRecord, index: number): CaseChange {
  const item = record.items[index];
  if (!item) return REFUSED('invalid');
  if (item.kind !== 'trinket') {
    const bag = bagFor(ownerInventory, item.kind);
    bag[item.itemId] = Math.min(LIMITS.inventoryStackMax, (bag[item.itemId] ?? 0) + item.quantity);
  }
  record.items.splice(index, 1);
  return { ok: true };
}

// ---- Visitors -----------------------------------------------------------------

/** What a visitor still has, right now. */
export function visitorAllowance(record: CaseRecord, visitor: string, now: number) {
  return caseAllowance(record.limit, record.takes[visitor] ?? [], now);
}

/**
 * Take one unit from the stack at `index` into the visitor's pouch.
 *
 * Checked in an order that says the truest thing first: not a free case, then
 * nothing there, then the visitor's own limit. Whether the visitor is blocked
 * or a guest is decided by the room before this is called.
 */
export function applyTake(
  visitorInventory: AccountInventory,
  record: CaseRecord,
  index: number,
  visitor: { accountId: string; name: string },
  now: number,
): CaseChange {
  if (record.mode !== 'free') return REFUSED('wrong-mode');
  if (visitor.accountId === record.owner) return REFUSED('invalid');
  const item = record.items[index];
  if (!item || item.kind === 'trinket' || item.quantity < 1) return REFUSED('empty');

  const allowance = visitorAllowance(record, visitor.accountId, now);
  if (allowance.remaining !== null && allowance.remaining < 1) {
    return REFUSED('limit', allowance.resetsAt ?? undefined);
  }

  const bag = bagFor(visitorInventory, item.kind);
  bag[item.itemId] = Math.min(LIMITS.inventoryStackMax, (bag[item.itemId] ?? 0) + 1);
  const taken = { kind: item.kind, itemId: item.itemId };
  item.quantity -= 1;
  if (item.quantity <= 0) record.items.splice(index, 1);

  const times = record.takes[visitor.accountId] ?? [];
  times.push(now);
  record.takes[visitor.accountId] = times;
  pruneTakes(record, now);

  record.log.unshift({
    at: now, accountId: visitor.accountId, name: visitor.name.slice(0, LIMITS.nameMaxLength),
    kind: taken.kind, itemId: taken.itemId, quantity: 1,
  });
  if (record.log.length > LIMITS.caseLogMax) record.log.length = LIMITS.caseLogMax;
  return { ok: true, taken };
}

/** Forget takes older than the longest window a limit can have, and cap how many visitors are tracked. */
export function pruneTakes(record: CaseRecord, now: number): void {
  const horizon = now - 7 * 24 * 60 * 60_000;
  for (const [visitor, times] of Object.entries(record.takes)) {
    const recent = times.filter((at) => at > horizon);
    if (recent.length === 0) delete record.takes[visitor];
    else record.takes[visitor] = recent;
  }
  const visitors = Object.keys(record.takes);
  if (visitors.length > TAKES_TRACKED_MAX) {
    visitors
      .sort((a, b) => Math.max(...record.takes[a]) - Math.max(...record.takes[b]))
      .slice(0, visitors.length - TAKES_TRACKED_MAX)
      .forEach((visitor) => delete record.takes[visitor]);
  }
}
