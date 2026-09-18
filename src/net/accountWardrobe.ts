// Keeping the wardrobe on the account, not just in this browser.
//
// The browser's copy (src/ui/avatarEditor/wardrobe.ts) is still the one the
// game reads — it works offline, in solo play, and before sign-in has loaded.
// This module keeps the account's copy in step with it whenever the player
// is signed in:
//
//   * on start, a two-way merge: whichever copy of a look was changed most
//     recently wins, looks made elsewhere come down, looks made here go up;
//   * after that, every change in this browser (the studio's autosave
//     included) is pushed a moment later, and deletes follow too.
//
// Nothing here depends on being in a world. A dropped neighborhood, a server
// restart, or the desk's studio page all sync the same way, because this
// talks to the account over plain HTTP with a fresh sign-in token each time.
//
// Deletes are the only subtle part. "On the account but not here" can mean
// "made on another device" (pull it) or "deleted here while offline" (delete
// it there). The pending-delete list tells those apart. The reverse — "here
// but not on the account" — can mean "new here" (push) or "deleted on another
// device" (remove here); the synced-versions map tells those apart: a look
// this browser already synced, and has not changed since, that is now gone
// from the account was deleted elsewhere.

import { DESIGN_LIMITS, type AvatarDesign } from '../../shared/src/index';
import {
  applyAccountWardrobe,
  getWornId,
  listDesigns,
  onWardrobeChange,
  type WardrobeChange,
} from '../ui/avatarEditor/wardrobe';
import { getAccountToken, isSignedIn } from './accountAuth';
import { httpEndpointForWebSocket } from './sharedConfig';

const SYNCED_KEY = 'pp.wardrobe.synced.v1';
const PENDING_DELETES_KEY = 'pp.wardrobe.pending-deletes.v1';
/** Long enough that a drawing session is a handful of requests, not hundreds. */
const PUSH_DELAY_MS = 2500;
/** …but steady drawing never postpones a push by more than this. */
const PUSH_MAX_WAIT_MS = 15_000;

export type WardrobeSyncPlan = {
  /** Newer on the account (or only there): write into this browser. */
  pull: AvatarDesign[];
  /** Newer here (or only here): send to the account. */
  push: AvatarDesign[];
  /** Deleted here: delete on the account. */
  deleteRemote: string[];
  /** Deleted on another device: remove here. */
  deleteLocal: string[];
};

/**
 * Decide what a merge should do. Pure, so the rules above are tested rather
 * than trusted.
 */
export function planWardrobeSync(
  local: AvatarDesign[],
  remote: AvatarDesign[],
  synced: Record<string, number>,
  pendingDeletes: string[],
  wornId: string | null,
): WardrobeSyncPlan {
  const plan: WardrobeSyncPlan = { pull: [], push: [], deleteRemote: [], deleteLocal: [] };
  const localById = new Map(local.map((design) => [design.id, design]));
  const remoteById = new Map(remote.map((design) => [design.id, design]));
  const deleting = new Set(pendingDeletes);

  for (const design of remote) {
    if (deleting.has(design.id)) {
      plan.deleteRemote.push(design.id);
      continue;
    }
    const mine = localById.get(design.id);
    if (!mine || design.updatedAt > mine.updatedAt) plan.pull.push(design);
    else if (mine.updatedAt > design.updatedAt) plan.push.push(mine);
  }

  for (const design of local) {
    if (remoteById.has(design.id)) continue;
    const lastSynced = synced[design.id];
    const deletedElsewhere = lastSynced !== undefined
      && design.updatedAt <= lastSynced
      && design.id !== wornId;
    if (deletedElsewhere) plan.deleteLocal.push(design.id);
    else plan.push.push(design);
  }

  // Newest first, and never more than the wardrobe can hold.
  plan.pull.sort((a, b) => b.updatedAt - a.updatedAt);
  plan.push.sort((a, b) => b.updatedAt - a.updatedAt);
  plan.pull = plan.pull.slice(0, DESIGN_LIMITS.wardrobeMax);
  return plan;
}

// ---- Small persisted bookkeeping (ids and timestamps only, never art) -----

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: sync still works, it just forgets less well.
  }
}

function readSynced(): Record<string, number> {
  const value = readJson<Record<string, unknown>>(SYNCED_KEY, {});
  const out: Record<string, number> = {};
  for (const [id, at] of Object.entries(value)) if (typeof at === 'number') out[id] = at;
  return out;
}

function readPendingDeletes(): string[] {
  const value = readJson<unknown>(PENDING_DELETES_KEY, []);
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string').slice(0, 100) : [];
}

// ---- The account API --------------------------------------------------------

/**
 * Where the account service lives, whether or not this page is in a world.
 * Same server as the neighborhood; see hosting.md.
 */
export function accountApiBase(
  configured: string | undefined = import.meta.env.VITE_SHARED_WS_ENDPOINT,
  dev: boolean = import.meta.env.DEV,
): string | null {
  if (configured) {
    try {
      return httpEndpointForWebSocket(configured);
    } catch {
      return null;
    }
  }
  return dev ? 'http://localhost:2567' : null;
}

export type WardrobeSyncStatus =
  | { state: 'off'; message: string }
  | { state: 'syncing'; message: string }
  | { state: 'saved'; message: string; at: number }
  | { state: 'error'; message: string };

type SyncOptions = {
  apiBase?: string | null;
  fetcher?: typeof fetch;
  onStatus?: (status: WardrobeSyncStatus) => void;
  /** Called after a pull changed what is in this browser. */
  onPulled?: () => void;
};

let started = false;
let statusListeners = new Set<(status: WardrobeSyncStatus) => void>();
let lastStatus: WardrobeSyncStatus = { state: 'off', message: 'Looks are saved in this browser.' };

export function getWardrobeSyncStatus(): WardrobeSyncStatus {
  return lastStatus;
}

export function subscribeWardrobeSync(listener: (status: WardrobeSyncStatus) => void): () => void {
  statusListeners.add(listener);
  listener(lastStatus);
  return () => statusListeners.delete(listener);
}

function publish(status: WardrobeSyncStatus): void {
  lastStatus = status;
  for (const listener of statusListeners) listener(status);
}

/** Flush hook for pagehide; set once sync is running. */
let flushNow: (() => Promise<void>) | null = null;

/**
 * Push anything waiting right away (the studio calls this on close). The
 * promise settles when the account has it — or after `maxWaitMs`, so a
 * caller about to navigate away never hangs on a slow network.
 */
export function flushWardrobeSync(maxWaitMs = 4000): Promise<void> {
  const pending = flushNow?.() ?? Promise.resolve();
  return Promise.race([pending, new Promise<void>((resolve) => setTimeout(resolve, maxWaitMs))]);
}

/**
 * Start keeping the account wardrobe in step. Safe to call more than once;
 * only the first call does anything. Resolves after the first merge (or
 * immediately when there is no one signed in).
 */
export async function startAccountWardrobeSync(options: SyncOptions = {}): Promise<void> {
  if (started) return;
  started = true;
  if (options.onStatus) statusListeners.add(options.onStatus);
  const apiBase = options.apiBase === undefined ? accountApiBase() : options.apiBase;
  const fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
  if (!apiBase || !(await isSignedIn())) {
    publish({ state: 'off', message: 'Looks are saved in this browser. Sign in at My desk to keep them on your account too.' });
    started = false;
    return;
  }

  const request = async (path: string, init: RequestInit = {}): Promise<Response> => {
    const token = await getAccountToken();
    if (!token) throw new Error('signed-out');
    return fetcher(`${apiBase}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        authorization: `Bearer ${token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
  };

  const synced = readSynced();
  let pendingDeletes = readPendingDeletes();
  const saveBookkeeping = () => {
    writeJson(SYNCED_KEY, synced);
    writeJson(PENDING_DELETES_KEY, pendingDeletes);
  };

  const pushDesign = async (design: AvatarDesign): Promise<boolean> => {
    const response = await request('/account/designs', {
      method: 'PUT',
      body: JSON.stringify(design),
      keepalive: true,
    });
    if (response.ok) {
      synced[design.id] = design.updatedAt;
      return true;
    }
    if (response.status === 409) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      publish({ state: 'error', message: body.error ?? 'Your account wardrobe is full — delete a look first.' });
    }
    return false;
  };

  const deleteRemote = async (id: string): Promise<boolean> => {
    const response = await request(`/account/designs/${encodeURIComponent(id)}`, { method: 'DELETE' });
    // Already gone is as good as deleted.
    if (response.ok || response.status === 404) {
      delete synced[id];
      pendingDeletes = pendingDeletes.filter((pending) => pending !== id);
      return true;
    }
    return false;
  };

  // ── First merge ────────────────────────────────────────────────────────
  publish({ state: 'syncing', message: 'Bringing your looks from your account…' });
  try {
    const response = await request('/account/designs');
    if (response.status === 409) {
      publish({ state: 'off', message: 'Claim your paper passport at My desk to keep looks on your account.' });
      started = false;
      return;
    }
    if (!response.ok) throw new Error(`list ${response.status}`);
    const body = await response.json() as { designs?: AvatarDesign[] };
    const plan = planWardrobeSync(
      listDesigns(),
      Array.isArray(body.designs) ? body.designs : [],
      synced,
      pendingDeletes,
      getWornId(),
    );
    if (plan.pull.length > 0 || plan.deleteLocal.length > 0) {
      applyAccountWardrobe(plan.pull, plan.deleteLocal);
      for (const design of plan.pull) synced[design.id] = design.updatedAt;
      for (const id of plan.deleteLocal) delete synced[id];
      options.onPulled?.();
    }
    for (const id of plan.deleteRemote) await deleteRemote(id);
    for (const design of plan.push) await pushDesign(design);
    saveBookkeeping();
    if (lastStatus.state !== 'error') {
      publish({ state: 'saved', message: 'Your looks are saved to your account.', at: Date.now() });
    }
  } catch (error) {
    console.info('[wardrobe] account sync paused:', error instanceof Error ? error.message : error);
    publish({ state: 'error', message: 'Could not reach your account just now — looks are safe in this browser and will sync later.' });
  }

  // ── Then, follow every change ─────────────────────────────────────────
  const waiting = new Map<string, AvatarDesign>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** One push at a time, in order. */
  let draining: Promise<void> = Promise.resolve();

  const drain = async () => {
    timer = null;
    const batch = [...waiting.values()];
    waiting.clear();
    const deletes = [...pendingDeletes];
    if (batch.length === 0 && deletes.length === 0) return;
    publish({ state: 'syncing', message: 'Saving to your account…' });
    let ok = true;
    try {
      for (const id of deletes) ok = (await deleteRemote(id)) && ok;
      for (const design of batch) {
        const pushed = await pushDesign(design);
        if (!pushed) {
          ok = false;
          // Try again next time something changes (or on the next page load).
          if (lastStatus.state !== 'error') waiting.set(design.id, design);
        }
      }
    } catch {
      ok = false;
      for (const design of batch) waiting.set(design.id, design);
    }
    saveBookkeeping();
    if (ok) publish({ state: 'saved', message: 'Saved to your account.', at: Date.now() });
    else if (lastStatus.state !== 'error') {
      publish({ state: 'error', message: 'Could not reach your account just now — saved in this browser, will retry.' });
    }
  };

  let waitingSince = 0;
  const schedule = (delay = PUSH_DELAY_MS) => {
    const now = Date.now();
    if (!timer) waitingSince = now;
    else if (now - waitingSince >= PUSH_MAX_WAIT_MS) return; // let the pending push happen
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      draining = draining.then(drain);
    }, delay);
  };

  onWardrobeChange((change: WardrobeChange) => {
    if (change.kind === 'pulled') return;
    if (change.kind === 'saved') {
      waiting.set(change.design.id, change.design);
      pendingDeletes = pendingDeletes.filter((id) => id !== change.design.id);
    } else {
      waiting.delete(change.id);
      if (!pendingDeletes.includes(change.id)) pendingDeletes.push(change.id);
    }
    saveBookkeeping();
    schedule();
  });

  flushNow = () => {
    if (timer || waiting.size > 0 || pendingDeletes.length > 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      draining = draining.then(drain);
    }
    return draining;
  };
  // Leaving the page (or backgrounding it on a phone) sends what is waiting.
  window.addEventListener('pagehide', () => void flushNow?.());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushNow?.();
  });
  window.addEventListener('online', () => schedule(500));
}

/** Test seam: forget that sync was started. */
export function resetWardrobeSyncForTests(): void {
  started = false;
  flushNow = null;
  statusListeners = new Set();
  lastStatus = { state: 'off', message: 'Looks are saved in this browser.' };
}
