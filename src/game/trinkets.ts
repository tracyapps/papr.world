import { getGameState, updateGameState, type TrinketInstance } from '../sim/state';
import {
  getTrinketDef,
  pickTrinketDef,
  type TrinketFamilyId,
  type TrinketShapeId,
} from '../sim/catalogs/trinkets';

/**
 * Trinket *state*: handing them out, keeping them, and setting them down.
 *
 * Deliberately free of three.js and the DOM. The visuals live beside this in
 * `trinketVisuals.ts` and subscribe to the same save, which keeps two promises:
 * the quest runtime can grant a trinket without dragging a renderer into a
 * headless test, and "where a trinket is" stays a pure data question.
 *
 * Two rules make a trinket different from every other object in the world:
 *
 * 1. **You never get a duplicate.** `grantTrinket` is handed the exact set of
 *    definitions the player already owns and asks the catalog for something
 *    new. A player who finishes forty quests ends up with forty different
 *    little objects, which is the entire point of collecting them.
 * 2. **Where a trinket *is* is a single field.** `placed === null` means it
 *    sits on the bio-card shelf; a placement means it is out in the world. It
 *    is never in both places, so there is no "displayed or dropped?" ambiguity
 *    to reconcile, and picking one back up is exact.
 */

/** Soft cap on stored trinkets, mirroring the load-time normalization. */
export const MAX_TRINKETS = 400;

let nextInstanceSerial = 1;

function trinketInstanceId(defId: string, now: number): string {
  return `trinket-${defId}-${now.toString(36)}-${nextInstanceSerial++}`;
}

/** The set of catalog ids the player already holds — the no-duplicates guard. */
export function ownedTrinketDefIds(): Set<string> {
  return new Set(getGameState().player.trinkets.map((trinket) => trinket.defId));
}

export function getTrinkets(): readonly TrinketInstance[] {
  return getGameState().player.trinkets;
}

export function getTrinketInstance(id: string): TrinketInstance | null {
  return getGameState().player.trinkets.find((trinket) => trinket.id === id) ?? null;
}

/**
 * Give the player a trinket they do not already own.
 *
 * `seed` decides which of the eligible variations they receive, so the same
 * quest handed to two players produces two different objects. Returns the new
 * instance, or null if the catalog is somehow empty.
 */
export function grantTrinket(options: {
  family: TrinketFamilyId;
  shapes?: TrinketShapeId[];
  tag?: string;
  seed?: number;
  source: string;
  fromName?: string;
}): TrinketInstance | null {
  const now = Date.now();
  const seed = options.seed ?? (now & 0xffffffff);
  const owned = ownedTrinketDefIds();
  const def = pickTrinketDef({ family: options.family, shapes: options.shapes, tag: options.tag }, owned, seed);
  if (!def) return null;

  const instance: TrinketInstance = {
    id: trinketInstanceId(def.id, now),
    defId: def.id,
    seed,
    acquiredAt: now,
    source: options.source,
    ...(options.fromName ? { fromName: options.fromName } : {}),
    placed: null,
  };
  updateGameState((state) => {
    state.player.trinkets.push(instance);
    // Trim the oldest *shelved* trinket rather than blindly shifting: a placed
    // decoration is visible in the world, and silently deleting the object a
    // player set down would be a far worse surprise than losing an old keepsake
    // they can re-earn. Placed trinkets are never the thing that gets dropped.
    while (state.player.trinkets.length > MAX_TRINKETS) {
      const index = state.player.trinkets.findIndex((entry) => entry.placed === null);
      if (index < 0) break;
      state.player.trinkets.splice(index, 1);
    }
  });
  return instance;
}

/** Set a kept trinket down in the world. It stops being on the shelf. */
export function placeTrinket(id: string, pageId: string, x: number, z: number, rotY = 0): boolean {
  const instance = getTrinketInstance(id);
  if (!instance) return false;
  updateGameState((state) => {
    const record = state.player.trinkets.find((trinket) => trinket.id === id);
    if (!record) return;
    record.placed = { pageId, x, z, rotY };
  });
  return true;
}

/** Take a placed trinket back up, returning it to the shelf. */
export function pickUpTrinket(id: string): boolean {
  const instance = getTrinketInstance(id);
  if (!instance || !instance.placed) return false;
  updateGameState((state) => {
    const record = state.player.trinkets.find((trinket) => trinket.id === id);
    if (record) record.placed = null;
  });
  return true;
}

export function trinketsOnPage(pageId: string): readonly TrinketInstance[] {
  return getGameState().player.trinkets.filter((trinket) => trinket.placed?.pageId === pageId);
}

export function keptTrinkets(): readonly TrinketInstance[] {
  return getGameState().player.trinkets.filter((trinket) => trinket.placed === null);
}

/** Grouped for the scrapbook / bio card: trinkets by family. */
export function trinketsByFamily(): Map<TrinketFamilyId, TrinketInstance[]> {
  const grouped = new Map<TrinketFamilyId, TrinketInstance[]>();
  for (const trinket of getGameState().player.trinkets) {
    const family = getTrinketDef(trinket.defId)?.family;
    if (!family) continue;
    const list = grouped.get(family) ?? [];
    list.push(trinket);
    grouped.set(family, list);
  }
  return grouped;
}

/** Number of trinkets the player holds (kept or placed). */
export function trinketCount(): number {
  return getGameState().player.trinkets.length;
}
