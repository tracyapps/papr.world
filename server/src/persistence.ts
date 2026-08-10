// Room persistence — "the world remembers" (Phase A of
// docs/communal-multiplayer.md).
//
// v1 is a JSON file per neighborhood: transparent, diffable, trivially
// backed up, and easily fast enough for ≤16 players and 500 pieces. The
// RoomStore interface is the seam — swap in SQLite later without touching
// the room. Writes are atomic (temp + rename) and debounced off the hot path.
//
// What persists: pieces and nodes. What deliberately does not: player
// positions (transient) and chat (privacy default — see RoomSave in shared/).

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SAVE_VERSION, type RoomSave } from '../../shared/src/index';

const SAVE_DEBOUNCE_MS = 5000;

export class RoomStore {
  private dataDir: string;
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  private pathFor(roomId: string): string {
    // Room ids are our own (e.g. "neighborhood"), but never trust a name in a
    // file path: keep a strict allowlist of characters.
    const safe = roomId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return join(this.dataDir, `room-${safe}.json`);
  }

  /** Load a save if one exists; migrate older versions here as they appear. */
  load(roomId: string): RoomSave | null {
    const path = this.pathFor(roomId);
    if (!existsSync(path)) return null;
    try {
      const save = JSON.parse(readFileSync(path, 'utf8')) as RoomSave;
      if (save.version !== SAVE_VERSION) {
        // First real migration writes itself here. Until then, refuse quietly
        // rather than misread — the file stays on disk untouched.
        console.error(
          `persistence: ${path} is save v${save.version}, expected v${SAVE_VERSION}; ignoring`,
        );
        return null;
      }
      return save;
    } catch (err) {
      console.error(`persistence: failed to read ${path}; treating as no save`, err);
      return null;
    }
  }

  /**
   * Debounced save. `snapshot` is called at write time (not schedule time) so
   * the file always gets the freshest state. Bursts of edits cost one write.
   */
  scheduleSave(roomId: string, snapshot: () => Omit<RoomSave, 'version' | 'savedAt'>): void {
    if (this.timers.has(roomId)) return;
    this.timers.set(
      roomId,
      setTimeout(() => {
        this.timers.delete(roomId);
        this.saveNow(roomId, snapshot);
      }, SAVE_DEBOUNCE_MS),
    );
  }

  /** Immediate save — call on room dispose / server shutdown. */
  saveNow(roomId: string, snapshot: () => Omit<RoomSave, 'version' | 'savedAt'>): void {
    const pending = this.timers.get(roomId);
    if (pending) {
      clearTimeout(pending);
      this.timers.delete(roomId);
    }
    const save: RoomSave = { version: SAVE_VERSION, savedAt: Date.now(), ...snapshot() };
    const path = this.pathFor(roomId);
    mkdirSync(this.dataDir, { recursive: true });
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(save, null, 2), 'utf8');
    renameSync(tmp, path);
  }
}
