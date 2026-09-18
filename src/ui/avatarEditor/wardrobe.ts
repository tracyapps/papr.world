// The wardrobe — saved avatar designs on this device.
//
// localStorage is the working copy; when the player is signed in, every
// change also syncs to the account wardrobe (src/net/accountWardrobe.ts), so a
// look survives a cleared browser, a dropped world, or a different device.
// Every load passes through sanitizeAvatarDesign so a hand-edited or corrupt
// entry degrades to "skipped", never to broken rendering.

import {
  DESIGN_LIMITS,
  sanitizeAvatarDesign,
  type AvatarDesign,
} from '../../../shared/src/index';

const STORAGE_KEY = 'pp.wardrobe.v1';
/** Which design is currently worn. */
const WORN_KEY = 'pp.wardrobe.worn.v1';

type WardrobeFile = { version: 1; designs: unknown[] };

function readAll(): AvatarDesign[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<WardrobeFile>;
    if (!Array.isArray(parsed.designs)) return [];
    const designs: AvatarDesign[] = [];
    for (const entry of parsed.designs) {
      const design = sanitizeAvatarDesign(entry);
      if (design) designs.push(design);
    }
    return designs;
  } catch {
    return [];
  }
}

function writeAll(designs: AvatarDesign[]): void {
  const file: WardrobeFile = { version: 1, designs };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
}

/**
 * Something in the wardrobe changed on THIS device, by the player's hand.
 *
 * The account sync (src/net/accountWardrobe.ts) listens here so every save —
 * the studio's autosave included — travels to the account without each
 * caller having to remember to send it. Changes that arrive FROM the account
 * are written with `applyAccountWardrobe` and deliberately do not emit, or
 * a pull would echo straight back out as a push.
 */
export type WardrobeChange =
  | { kind: 'saved'; design: AvatarDesign }
  | { kind: 'deleted'; id: string };

const changeListeners = new Set<(change: WardrobeChange) => void>();

export function onWardrobeChange(listener: (change: WardrobeChange) => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function emitChange(change: WardrobeChange): void {
  for (const listener of changeListeners) {
    try {
      listener(change);
    } catch (error) {
      console.warn('wardrobe listener failed', error);
    }
  }
}

/**
 * Write what the account sync decided, quietly: designs pulled down from the
 * account, and ids removed because they were deleted on another device.
 * Respects the wardrobe cap — anything that would not fit is skipped and
 * returned so the caller can say so.
 */
export function applyAccountWardrobe(
  pulled: AvatarDesign[],
  removeIds: string[] = [],
): { skipped: AvatarDesign[] } {
  const remove = new Set(removeIds);
  const designs = readAll().filter((d) => !remove.has(d.id));
  const skipped: AvatarDesign[] = [];
  for (const incoming of pulled) {
    const design = sanitizeAvatarDesign(incoming);
    if (!design) continue;
    const index = designs.findIndex((d) => d.id === design.id);
    if (index >= 0) designs[index] = design;
    else if (designs.length < DESIGN_LIMITS.wardrobeMax) designs.push(design);
    else skipped.push(design);
  }
  writeAll(designs);
  if (remove.has(getWornId() ?? '')) localStorage.removeItem(WORN_KEY);
  return { skipped };
}

export function listDesigns(): AvatarDesign[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getDesign(id: string): AvatarDesign | null {
  return readAll().find((d) => d.id === id) ?? null;
}

/**
 * Insert or update. Returns false when the wardrobe is full (caller shows a
 * friendly "your wardrobe is stuffed" rather than silently dropping work).
 */
export function saveDesign(design: AvatarDesign): boolean {
  const designs = readAll();
  const index = designs.findIndex((d) => d.id === design.id);
  if (index >= 0) {
    designs[index] = design;
  } else {
    if (designs.length >= DESIGN_LIMITS.wardrobeMax) return false;
    designs.push(design);
  }
  writeAll(designs);
  emitChange({ kind: 'saved', design: structuredClone(design) });
  return true;
}

export function deleteDesign(id: string): void {
  writeAll(readAll().filter((d) => d.id !== id));
  if (getWornId() === id) localStorage.removeItem(WORN_KEY);
  emitChange({ kind: 'deleted', id });
}

/**
 * Rename in place. The name is normalized exactly the way the studio's save
 * step normalizes it, so a name can never enter the wardrobe through one
 * door that the other would reject.
 */
export function renameDesign(id: string, name: string): AvatarDesign | null {
  const designs = readAll();
  const design = designs.find((d) => d.id === id);
  if (!design) return null;
  const normalized = name.replace(/\s+/g, ' ').trim().slice(0, DESIGN_LIMITS.nameMaxLength);
  design.name = normalized.length > 0 ? normalized : 'untitled cutout';
  design.updatedAt = Date.now();
  writeAll(designs);
  emitChange({ kind: 'saved', design: structuredClone(design) });
  return structuredClone(design);
}

/** "rainy day snail" → "rainy day snail (copy)", always within the name limit. */
export function duplicateName(name: string): string {
  const suffix = ' (copy)';
  if (name.length + suffix.length <= DESIGN_LIMITS.nameMaxLength) return `${name}${suffix}`;
  return name.slice(0, DESIGN_LIMITS.nameMaxLength - suffix.length) + suffix;
}

/**
 * Copy a design into a new slot, or null when the wardrobe is full.
 *
 * The copy starts PRIVATE: `sharedOnCard` is opt-in per design (decision
 * 2026-08-10), and consent must never be inherited silently by a duplicate
 * the player has not re-read — the copy is re-shared on purpose or not at all.
 */
export function duplicateDesign(id: string): AvatarDesign | null {
  const designs = readAll();
  const source = designs.find((d) => d.id === id);
  if (!source || designs.length >= DESIGN_LIMITS.wardrobeMax) return null;
  const now = Date.now();
  const copy: AvatarDesign = {
    ...structuredClone(source),
    id: crypto.randomUUID(),
    name: duplicateName(source.name),
    sharedOnCard: false,
    createdAt: now,
    updatedAt: now,
  };
  designs.push(copy);
  writeAll(designs);
  emitChange({ kind: 'saved', design: structuredClone(copy) });
  return structuredClone(copy);
}

/**
 * The per-design consent flag (docs/avatar-and-identity.md §2.2).
 *
 * Deliberately does NOT bump `updatedAt`: sharing is a setting *about* the
 * design, not a change to it, and a wardrobe that quietly reorders itself
 * every time a toggle flips feels unstable for no reason.
 */
export function setSharedOnCard(id: string, shared: boolean): AvatarDesign | null {
  const designs = readAll();
  const design = designs.find((d) => d.id === id);
  if (!design) return null;
  design.sharedOnCard = shared;
  writeAll(designs);
  emitChange({ kind: 'saved', design: structuredClone(design) });
  return structuredClone(design);
}

export function getWornId(): string | null {
  return localStorage.getItem(WORN_KEY);
}

export function setWornId(id: string): void {
  localStorage.setItem(WORN_KEY, id);
}

/** The design currently worn, if it still exists. */
export function getWornDesign(): AvatarDesign | null {
  const id = getWornId();
  return id ? getDesign(id) : null;
}
