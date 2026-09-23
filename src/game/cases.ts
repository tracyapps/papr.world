// Display cases: what the player's side knows, and the words for it.
//
// Free of three.js and the DOM, like guests.ts. The panel (`casePanel.ts`)
// draws it; `net/sharedSession.ts` feeds it from the room and hands it a
// transport to ask with. Design: docs/house-and-home.md ("Display cases").
//
// Two kinds of case can stand near you:
//   * a shared case: a piece the neighborhood server knows about. Anyone in the
//     room can look; the owner stocks it; visitors take from it. The server
//     decides every count.
//   * a local case: a piece only this device knows (built in solo play). It is
//     always a Show case: keepsakes to look at. There is nobody to take from it,
//     and nothing to stock it from.
// One piece is never both: when a shared piece stands where a local one does,
// the shared one is the case (the local piece is only how the owner sees it).

import {
  DISPLAY_CASE_TEMPLATE,
  LIMITS,
  describeCaseLimit,
  type CaseDetail,
  type CaseItem,
  type CaseLimit,
  type CaseMode,
  type CaseRemoveIntent,
  type CaseResult,
  type CaseSetIntent,
  type CaseShowIntent,
  type CaseStackKind,
  type CaseState,
  type CaseStockIntent,
  type CaseTakeIntent,
  type PlacedPiece,
} from '../../shared/src/index';
import { TOOL_DEFS, type ToolId } from '../sim/catalogs/tools';
import { getTrinketDef } from '../sim/catalogs/trinkets';
import { getGameState, LOCAL_CASE_SLOTS, updateGameState } from '../sim/state';
import { RESOURCE_DEFS } from '../world/resources';
import type { ResourceId } from '../world/types';
import { getSelfAccount } from './guests';
import { getTrinketInstance } from './trinkets';

/** How close you stand to use a case. The server allows a little more. */
export const CASE_REACH = 2.6;

export type CaseHandle = {
  /** `shared:<piece id>` or `local:<piece id>`; stable while the piece stands. */
  key: string;
  source: 'shared' | 'local';
  id: string;
  x: number;
  z: number;
  page: string;
};

export type CaseView = {
  handle: CaseHandle;
  mode: CaseMode;
  label: string;
  items: CaseItem[];
  limit: CaseLimit | null;
  /** Whether it is yours to change. Every local case is. */
  mine: boolean;
  /** The server's word on this visitor's allowance, once asked. Shared cases only. */
  detail: CaseDetail | null;
};

export type CaseTransport = {
  set: (intent: CaseSetIntent) => void;
  stock: (intent: CaseStockIntent) => void;
  show: (intent: CaseShowIntent) => void;
  remove: (intent: CaseRemoveIntent) => void;
  take: (intent: CaseTakeIntent) => void;
  request: (id: string) => void;
};

export type CaseHandlers = { say: (text: string) => void };

let transport: CaseTransport | null = null;
let handlers: CaseHandlers | null = null;
let panelOpen = false;
const sharedStates = new Map<string, CaseState>();
const sharedPieces = new Map<string, PlacedPiece>();
const details = new Map<string, CaseDetail>();
const notes = new Map<string, string>();
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

export function subscribeCases(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setCaseHandlers(next: CaseHandlers | null) {
  handlers = next;
}

/** The panel says whether it is showing, so results are spoken once: in the panel, or as a toast. */
export function setCasePanelOpen(open: boolean) {
  panelOpen = open;
}

/** Whether a shared neighborhood is live, so cases can be stocked and taken from. */
export function casesAvailable(): boolean {
  return transport !== null;
}

export function setCaseTransport(next: CaseTransport | null) {
  transport = next;
  if (next === null) resetCases();
  else changed();
}

/** A dropped or ended session: forget everything the room told us. */
export function resetCases() {
  sharedStates.clear();
  sharedPieces.clear();
  details.clear();
  notes.clear();
  changed();
}

// ---- What the room tells us --------------------------------------------------

/** A shared piece appeared. Only display cases are kept. */
export function registerCasePiece(piece: PlacedPiece) {
  if (piece.templateKey !== DISPLAY_CASE_TEMPLATE) return;
  sharedPieces.set(piece.id, piece);
  changed();
}

export function unregisterCasePiece(id: string) {
  if (sharedPieces.delete(id)) changed();
}

export function receiveCase(state: CaseState) {
  sharedStates.set(state.id, state);
  changed();
}

export function removeCase(id: string) {
  sharedStates.delete(id);
  details.delete(id);
  notes.delete(`shared:${id}`);
  changed();
}

export function receiveCaseDetail(detail: CaseDetail) {
  details.set(detail.id, detail);
  changed();
}

export function receiveCaseResult(result: CaseResult, now = Date.now()) {
  const text = describeCaseResult(result, now);
  notes.set(`shared:${result.id}`, text);
  // The panel's status line is announced; a toast only when the panel is not there to say it.
  if (!panelOpen) handlers?.say(text);
  changed();
}

// ---- Finding cases -----------------------------------------------------------

function sameSpot(a: { x: number; z: number; rotY?: number }, b: { x: number; z: number; rotY?: number }) {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.z - b.z) < 0.01;
}

function sharedView(piece: PlacedPiece, state: CaseState): CaseView {
  return {
    handle: { key: `shared:${piece.id}`, source: 'shared', id: piece.id, x: piece.x, z: piece.z, page: piece.page },
    mode: state.mode,
    label: state.label,
    items: state.items,
    limit: state.limit,
    mine: getSelfAccount() !== '' && state.owner === getSelfAccount(),
    detail: details.get(piece.id) ?? null,
  };
}

/** Every case that stands anywhere we know of. */
export function listCases(): CaseView[] {
  const views: CaseView[] = [];
  for (const piece of sharedPieces.values()) {
    const state = sharedStates.get(piece.id);
    if (state) views.push(sharedView(piece, state));
  }
  const stood = [...sharedPieces.values()];
  const local = getGameState().world.localCases;
  for (const [pageId, page] of Object.entries(getGameState().world.pages)) {
    for (const piece of Object.values(page.placedPieces)) {
      if (piece.templateKey !== DISPLAY_CASE_TEMPLATE) continue;
      if (stood.some((shared) => sameSpot(shared, piece))) continue;
      const own = local[piece.id];
      views.push({
        handle: { key: `local:${piece.id}`, source: 'local', id: piece.id, x: piece.x, z: piece.z, page: piece.page || pageId },
        mode: 'show',
        label: own?.label ?? '',
        items: (own?.trinkets ?? []).map((trinket) => ({ kind: 'trinket', defId: trinket.defId, seed: trinket.seed })),
        limit: null,
        mine: true,
        detail: null,
      });
    }
  }
  return views;
}

export function getCaseView(key: string): CaseView | null {
  return listCases().find((view) => view.handle.key === key) ?? null;
}

/** The case within reach of this spot, if any. */
export function nearestCase(position: { x: number; z: number }, page: string, reach = CASE_REACH): CaseView | null {
  let best: CaseView | null = null;
  let bestDistance = reach;
  for (const view of listCases()) {
    if (view.handle.page !== page) continue;
    const distance = Math.hypot(view.handle.x - position.x, view.handle.z - position.z);
    if (distance <= bestDistance) {
      best = view;
      bestDistance = distance;
    }
  }
  return best;
}

export function getCaseNote(key: string): string {
  return notes.get(key) ?? '';
}

function note(handle: CaseHandle, text: string) {
  notes.set(handle.key, text);
  changed();
}

// ---- Asking ------------------------------------------------------------------

const NEEDS_SHARED = 'That needs a shared neighborhood, where the server keeps the case contents.';

/** Ask the server what this case means for you: your allowance, and the log if it is yours. */
export function requestCaseDetail(handle: CaseHandle) {
  if (handle.source === 'shared') transport?.request(handle.id);
}

/** Label, mode, or limit. Solo cases have only a label. */
export function setCase(handle: CaseHandle, patch: { mode?: CaseMode; label?: string; limit?: CaseLimit | null }) {
  if (handle.source === 'shared') {
    if (!transport) return note(handle, NEEDS_SHARED);
    transport.set({ id: handle.id, ...patch });
    return;
  }
  if (patch.mode === 'free') return note(handle, 'A free case needs a shared neighborhood, so neighbors have somewhere to take from.');
  if (patch.label !== undefined) {
    const label = patch.label.replace(/\s+/g, ' ').trim().slice(0, LIMITS.caseLabelMax);
    updateGameState((state) => {
      const entry = state.world.localCases[handle.id] ?? { label: '', trinkets: [] };
      entry.label = label;
      state.world.localCases[handle.id] = entry;
    });
    note(handle, 'Label saved.');
  }
}

/** Move a stack from your pouch into a free case. */
export function stockCase(handle: CaseHandle, kind: CaseStackKind, itemId: string, quantity: number) {
  if (handle.source !== 'shared' || !transport) return note(handle, NEEDS_SHARED);
  transport.stock({ id: handle.id, kind, itemId, quantity });
}

/** Show a keepsake inside a case. The keepsake stays on your shelf too. */
export function showTrinketOn(handle: CaseHandle, trinketId: string) {
  const trinket = getTrinketInstance(trinketId);
  if (!trinket) return note(handle, 'That keepsake is not on your shelf.');
  if (handle.source === 'shared') {
    if (!transport) return note(handle, NEEDS_SHARED);
    transport.show({ id: handle.id, defId: trinket.defId, seed: trinket.seed });
    return;
  }
  const outcome = { full: false };
  updateGameState((state) => {
    const entry = state.world.localCases[handle.id] ?? { label: '', trinkets: [] };
    if (!entry.trinkets.some((shown) => shown.defId === trinket.defId && shown.seed === trinket.seed)) {
      if (entry.trinkets.length >= LOCAL_CASE_SLOTS) outcome.full = true;
      else entry.trinkets.push({ defId: trinket.defId, seed: trinket.seed });
    }
    state.world.localCases[handle.id] = entry;
  });
  note(handle, outcome.full ? 'The case is full.' : 'Placed inside the case.');
}

/** Take a stack back into your pouch, or a keepsake off the case. */
export function removeCaseItem(handle: CaseHandle, index: number) {
  if (handle.source === 'shared') {
    if (!transport) return note(handle, NEEDS_SHARED);
    transport.remove({ id: handle.id, index });
    return;
  }
  updateGameState((state) => {
    state.world.localCases[handle.id]?.trinkets.splice(index, 1);
  });
  note(handle, 'Taken back out of the case.');
}

/** Take one from a free case. */
export function takeFromCase(handle: CaseHandle, index: number) {
  if (handle.source !== 'shared' || !transport) return note(handle, NEEDS_SHARED);
  transport.take({ id: handle.id, index });
}

// ---- Words -------------------------------------------------------------------

function spaced(id: string): string {
  return id.replace(/[-_.]+/g, ' ');
}

export function itemName(kind: CaseStackKind, itemId: string): string {
  if (kind === 'resource') return RESOURCE_DEFS[itemId as ResourceId]?.label ?? spaced(itemId);
  if (kind === 'tool') return TOOL_DEFS[itemId as ToolId]?.name ?? spaced(itemId);
  return spaced(itemId);
}

/** One line for one thing on a case, for a list and for a screen reader. */
export function describeCaseItem(item: CaseItem): string {
  if (item.kind === 'trinket') return getTrinketDef(item.defId)?.label ?? 'A keepsake';
  return `${itemName(item.kind, item.itemId)} × ${item.quantity}`;
}

/** "in 20 minutes", "in 3 hours", "in 2 days": rounded up, so it is never early. */
export function describeWait(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return minutes === 1 ? 'in about a minute' : `in ${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return hours === 1 ? 'in about an hour' : `in ${hours} hours`;
  return `in ${Math.ceil(hours / 24)} days`;
}

/** What a visitor is told about their own share, in one sentence. Empty for a case that gives nothing away. */
export function describeAllowance(view: CaseView, now = Date.now()): string {
  if (view.mode !== 'free' || view.mine) return '';
  const detail = view.detail;
  if (!detail) return 'Checking what you can take.';
  if (detail.remaining === null) return 'You can take as many as you like.';
  if (detail.remaining > 0) return `You can take ${detail.remaining} more.`;
  if (detail.resetsAt !== null) return `You have taken your share for now. More opens up ${describeWait(detail.resetsAt - now)}.`;
  return 'There is nothing for you to take right now.';
}

export function describeCaseRule(view: CaseView): string {
  return view.mode === 'free'
    ? `Free to take: ${describeCaseLimit(view.limit)}.`
    : 'For looking at. Nothing here can be taken.';
}

export function describeCaseResult(result: CaseResult, now = Date.now()): string {
  switch (result.outcome) {
    case 'ok':
      if (result.action === 'take') {
        return result.taken ? `You took one ${itemName(result.taken.kind, result.taken.itemId)}.` : 'You took one.';
      }
      if (result.action === 'stock') return 'Put in the case.';
      if (result.action === 'remove') return 'Taken back out.';
      if (result.action === 'show') return 'Placed inside the case.';
      return 'Saved.';
    case 'empty': return 'There is nothing to take right now.';
    case 'limit':
      return result.resetsAt !== undefined
        ? `You have taken your share for now. More opens up ${describeWait(result.resetsAt - now)}.`
        : 'You have taken your share for now.';
    case 'guest': return 'Guests have no pouch to put things in. Sign in to take from a case.';
    case 'too-far': return 'Step a little closer to the case.';
    case 'not-yours': return 'That case is not yours to change.';
    case 'wrong-mode':
      if (result.action === 'take') return 'This case is for looking at, not taking.';
      if (result.action === 'stock') return 'This case is for keepsakes. Switch it to Free to stock goods.';
      return 'This case gives things away. Switch it to Show to put keepsakes inside.';
    case 'full': return 'The case is full.';
    case 'no-stock': return 'You do not have that many in your pouch.';
    case 'not-empty': return 'Empty the case first to change what it is for.';
    default: return 'That did not work.';
  }
}
