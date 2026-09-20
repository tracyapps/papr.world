// The shape inventory — the cutout shapes a player has drawn, kept on this
// device under "My shapes" in the shape picker.
//
// Every shape a player uses is kept (owner's call, 2026-09-20), so a drawing is
// never lost by choosing something else next. A design also carries its own
// copy of its shape, so a saved look never depends on this list: deleting a
// shape here changes what can be picked next, not what anyone is wearing.
//
// localStorage, like the wardrobe, and every load passes through
// `sanitizeCustomShape` so a corrupt entry is skipped rather than drawn.

import { DESIGN_LIMITS, sanitizeCustomShape, type CustomShape } from '../../../shared/src/index';

const STORAGE_KEY = 'pp.shapes.v1';

/** Shapes kept per player. Generous: a shape is a few hundred bytes. */
export const SHAPE_INVENTORY_MAX = 40;

export type SavedShape = {
  id: string;
  name: string;
  shape: CustomShape;
  createdAt: number;
  updatedAt: number;
};

type ShapeFile = { version: 1; shapes: unknown[] };

function cleanName(raw: unknown): string {
  return typeof raw === 'string'
    ? raw.replace(/\s+/g, ' ').trim().slice(0, DESIGN_LIMITS.nameMaxLength)
    : '';
}

function sanitizeSaved(raw: unknown): SavedShape | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<SavedShape>;
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.id)) return null;
  const shape = sanitizeCustomShape(value.shape);
  if (!shape) return null;
  const now = Date.now();
  return {
    id: value.id,
    name: cleanName(value.name) || 'My shape',
    shape,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : now,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : now,
  };
}

function readAll(): SavedShape[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<ShapeFile>;
    const shapes: SavedShape[] = [];
    for (const entry of Array.isArray(parsed.shapes) ? parsed.shapes : []) {
      const saved = sanitizeSaved(entry);
      if (saved && !shapes.some((s) => s.id === saved.id)) shapes.push(saved);
    }
    return shapes.slice(0, SHAPE_INVENTORY_MAX);
  } catch {
    return [];
  }
}

function writeAll(shapes: SavedShape[]): boolean {
  try {
    const file: ShapeFile = { version: 1, shapes };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
    changed();
    return true;
  } catch {
    return false;
  }
}

const listeners = new Set<() => void>();

/** Anything showing the list redraws when it changes. */
export function onShapesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changed() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.warn('shape inventory listener failed', error);
    }
  }
}

/** Newest first: what you drew last is what you most likely want again. */
export function listShapes(): SavedShape[] {
  return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getShape(id: string): SavedShape | null {
  return readAll().find((s) => s.id === id) ?? null;
}

export function newShapeId(): string {
  const random = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `shape-${random.replace(/[^A-Za-z0-9-]/g, '').slice(0, 40)}`;
}

/** "My shape 1", "My shape 2", … the first number not already taken. */
export function defaultShapeName(existing: readonly SavedShape[] = readAll()): string {
  const taken = new Set(existing.map((s) => s.name));
  for (let n = 1; n <= SHAPE_INVENTORY_MAX + 1; n++) {
    const name = `My shape ${n}`;
    if (!taken.has(name)) return name;
  }
  return 'My shape';
}

function sameShape(a: CustomShape, b: CustomShape): boolean {
  return JSON.stringify(a.pieces) === JSON.stringify(b.pieces);
}

export type KeepResult =
  | { kept: 'new' | 'updated' | 'already'; saved: SavedShape }
  | { kept: 'full' | 'failed' };

/**
 * Keep a shape the player just used.
 *
 *   - `replaceId` set: they were editing that saved shape, so it is updated in
 *     place (same id, same name unless a new one is given).
 *   - the same shape is already in the list: nothing new is added.
 *   - otherwise it is added under a default name, unless the list is full.
 */
export function keepShape(
  shape: CustomShape,
  options: { replaceId?: string | null; name?: string; now?: number } = {},
): KeepResult {
  const clean = sanitizeCustomShape(shape);
  if (!clean) return { kept: 'failed' };
  const now = options.now ?? Date.now();
  const all = readAll();

  if (options.replaceId) {
    const index = all.findIndex((s) => s.id === options.replaceId);
    if (index >= 0) {
      const saved: SavedShape = {
        ...all[index]!,
        shape: clean,
        name: cleanName(options.name) || all[index]!.name,
        updatedAt: now,
      };
      all[index] = saved;
      return writeAll(all) ? { kept: 'updated', saved } : { kept: 'failed' };
    }
  }

  const twin = all.find((s) => sameShape(s.shape, clean));
  if (twin) return { kept: 'already', saved: twin };

  if (all.length >= SHAPE_INVENTORY_MAX) return { kept: 'full' };
  const saved: SavedShape = {
    id: newShapeId(),
    name: cleanName(options.name) || defaultShapeName(all),
    shape: clean,
    createdAt: now,
    updatedAt: now,
  };
  return writeAll([...all, saved]) ? { kept: 'new', saved } : { kept: 'failed' };
}

export function renameShape(id: string, name: string): boolean {
  const all = readAll();
  const index = all.findIndex((s) => s.id === id);
  const cleaned = cleanName(name);
  if (index < 0 || !cleaned) return false;
  all[index] = { ...all[index]!, name: cleaned, updatedAt: Date.now() };
  return writeAll(all);
}

export function deleteShape(id: string): boolean {
  const all = readAll();
  const next = all.filter((s) => s.id !== id);
  if (next.length === all.length) return false;
  return writeAll(next);
}

// ---- The shape in progress ---------------------------------------------------------
//
// A new shape being drawn is held here as it goes, so closing the studio, a
// dropped connection, or a stray Escape never costs a drawing. It is cleared
// the moment the shape is used.

const DRAFT_KEY = 'pp.shapes.draft.v1';

export function readShapeDraft(): CustomShape | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? sanitizeCustomShape(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** Keeps the shape in progress; null (or nothing worth keeping) clears it. */
export function writeShapeDraft(shape: CustomShape | null): void {
  try {
    const clean = shape ? sanitizeCustomShape(shape) : null;
    if (clean) localStorage.setItem(DRAFT_KEY, JSON.stringify(clean));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Storage full or blocked: the drawing simply is not kept between visits.
  }
}
