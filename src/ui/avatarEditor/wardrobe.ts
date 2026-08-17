// The wardrobe — saved avatar designs on this device.
//
// localStorage now; imports into account storage once, explicitly, when
// designs sync (docs/avatar-and-identity.md Phase D — the same one-way
// import rule as solo saves). Every load passes through
// sanitizeAvatarDesign so a hand-edited or corrupt entry degrades to
// "skipped", never to broken rendering.

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
  return true;
}

export function deleteDesign(id: string): void {
  writeAll(readAll().filter((d) => d.id !== id));
  if (getWornId() === id) localStorage.removeItem(WORN_KEY);
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
