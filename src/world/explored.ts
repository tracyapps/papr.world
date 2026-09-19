// Where you have been, remembered across reloads.
//
// The minimap's fog lifts in fine cells (a third of a unit) so its edge looks
// soft, but that is far too fine to keep forever. Alongside it, this keeps a
// COARSE record — 2-unit cells, one bit each, 625 bits per 50-unit page —
// that is small enough to save and cheap enough to ask about every frame.
//
// It is the foundation for any map: the minimap reads it after a reload so
// the paths you walked yesterday are still drawn, and the treasure map uses
// it to tell "somewhere you have been" from "somewhere you only heard of".

import { PAGE_SIZE } from './types';

export const EXPLORED_CELL = 2;
const CELLS_PER_SIDE = PAGE_SIZE / EXPLORED_CELL; // 25
const BYTES_PER_PAGE = Math.ceil((CELLS_PER_SIDE * CELLS_PER_SIDE) / 8); // 79
const STORAGE_KEY = 'pp.explored.v1';
/** ~3,000 pages is ~350 KB saved; far more walking than an alpha will see. */
const MAX_PAGES = 3000;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const pages = new Map<string, Uint8Array>();
let dirty = false;
let storage: StorageLike | null = null;

function pageKey(px: number, pz: number): string {
  return `${px},${pz}`;
}

/** Page + bit index of the coarse cell containing a world point. */
function locate(x: number, z: number) {
  const px = Math.round(x / PAGE_SIZE);
  const pz = Math.round(z / PAGE_SIZE);
  // Local coordinates from the page's min corner (pages are centred on px*PAGE_SIZE).
  const localX = x - (px * PAGE_SIZE - PAGE_SIZE / 2);
  const localZ = z - (pz * PAGE_SIZE - PAGE_SIZE / 2);
  const column = Math.min(CELLS_PER_SIDE - 1, Math.max(0, Math.floor(localX / EXPLORED_CELL)));
  const row = Math.min(CELLS_PER_SIDE - 1, Math.max(0, Math.floor(localZ / EXPLORED_CELL)));
  return { key: pageKey(px, pz), bit: row * CELLS_PER_SIDE + column };
}

/** Has the player been within sight of this point (coarsely)? */
export function isExploredCoarse(x: number, z: number): boolean {
  const { key, bit } = locate(x, z);
  const bits = pages.get(key);
  return bits ? (bits[bit >> 3]! & (1 << (bit & 7))) !== 0 : false;
}

/** Mark every coarse cell whose centre lies within `radius` of a point. */
export function markExplored(x: number, z: number, radius: number): void {
  const reach = radius + EXPLORED_CELL / 2;
  for (let cz = z - reach; cz <= z + reach; cz += EXPLORED_CELL) {
    for (let cx = x - reach; cx <= x + reach; cx += EXPLORED_CELL) {
      // Snap to the centre of the cell this sample falls in.
      const centreX = (Math.floor(cx / EXPLORED_CELL) + 0.5) * EXPLORED_CELL;
      const centreZ = (Math.floor(cz / EXPLORED_CELL) + 0.5) * EXPLORED_CELL;
      if (Math.hypot(centreX - x, centreZ - z) > radius) continue;
      const { key, bit } = locate(centreX, centreZ);
      let bits = pages.get(key);
      if (!bits) {
        if (pages.size >= MAX_PAGES) continue;
        bits = new Uint8Array(BYTES_PER_PAGE);
        pages.set(key, bits);
      }
      const mask = 1 << (bit & 7);
      if ((bits[bit >> 3]! & mask) === 0) {
        bits[bit >> 3] = bits[bit >> 3]! | mask;
        dirty = true;
      }
    }
  }
}

/** 0..1 — how much of a page has been seen. The treasure map inks by this. */
export function exploredFraction(px: number, pz: number): number {
  const bits = pages.get(pageKey(px, pz));
  if (!bits) return 0;
  let count = 0;
  for (const byte of bits) {
    let value = byte;
    while (value) {
      count += value & 1;
      value >>= 1;
    }
  }
  return count / (CELLS_PER_SIDE * CELLS_PER_SIDE);
}

export function exploredPageKeys(): string[] {
  return [...pages.keys()];
}

// ---- Saving -----------------------------------------------------------------

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text);
    if (binary.length !== BYTES_PER_PAGE) return null;
    const bytes = new Uint8Array(BYTES_PER_PAGE);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export function saveExplored(): void {
  if (!storage || !dirty) return;
  const out: Record<string, string> = {};
  for (const [key, bits] of pages) out[key] = toBase64(bits);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, pages: out }));
    dirty = false;
  } catch {
    // Storage full or blocked: the minimap still works for this visit.
  }
}

/** Load what was saved and keep saving now and then. Call once at startup. */
export function initializeExplored(store: StorageLike = localStorage, autosave = true): void {
  storage = store;
  pages.clear();
  try {
    const raw = store.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as { version?: number; pages?: Record<string, unknown> }) : null;
    if (parsed?.version === 1 && parsed.pages && typeof parsed.pages === 'object') {
      for (const [key, value] of Object.entries(parsed.pages)) {
        if (!/^-?\d+,-?\d+$/.test(key) || typeof value !== 'string') continue;
        const bits = fromBase64(value);
        if (bits) pages.set(key, bits);
        if (pages.size >= MAX_PAGES) break;
      }
    }
  } catch {
    // A damaged record starts fresh rather than breaking the map.
  }
  dirty = false;
  if (autosave && typeof window !== 'undefined') {
    window.setInterval(saveExplored, 5000);
    window.addEventListener('pagehide', saveExplored);
  }
}
