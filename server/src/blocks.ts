// Personal block lists.
//
// Three properties, from docs/communal-multiplayer.md §2.4, and all three
// matter more than they look:
//
//   ACCOUNT-LEVEL. Keyed by passport, not session. A block that evaporated
//   when either person reconnected would be worse than none, because the
//   player would believe they were protected when they were not.
//
//   PERSONAL. Your block is yours. It hides them from you and nobody else.
//   It is not a vote, not a report, and carries no penalty for them.
//
//   INSTANT AND SILENT. No appeal, no review, and the blocked person is never
//   told. Notifying them turns "I don't want to read this" into a
//   confrontation, which is precisely what the person blocking was avoiding.
//
// Enforcement is server-side: a blocked account's chat is simply never sent
// to you. That is why chat had to leave synced room state — see the note on
// ChatHistory in shared/src/protocol/messages.ts.

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LIMITS } from '../../shared/src/index';

type StoreFile = {
  version: 1;
  /** accountId -> the accounts it has blocked. */
  blocks: Record<string, string[]>;
};

function writeAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, path);
}

export class BlockStore {
  private blocks = new Map<string, Set<string>>();
  private path: string;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'blocks.json');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as StoreFile;
      for (const [accountId, blocked] of Object.entries(parsed.blocks ?? {})) {
        this.blocks.set(accountId, new Set(blocked));
      }
    } catch (err) {
      // A corrupt store must not brick the server. But starting empty here
      // means somebody's block silently stops working, so say so loudly.
      console.error(`blocks: failed to read ${this.path}, starting empty`, err);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 1000);
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const blocks: Record<string, string[]> = {};
    for (const [accountId, set] of this.blocks) {
      if (set.size > 0) blocks[accountId] = [...set];
    }
    writeAtomic(this.path, JSON.stringify({ version: 1, blocks } satisfies StoreFile, null, 2));
  }

  /** Everyone `accountId` has blocked. */
  list(accountId: string): string[] {
    return [...(this.blocks.get(accountId) ?? [])];
  }

  /**
   * Would a message from `speaker` reach `listener`?
   *
   * One direction only, and that is deliberate: if A blocks B, A stops seeing
   * B. B keeps seeing A. Making it mutual would let anyone silence themselves
   * in someone else's view, which is a way to hide from moderation.
   */
  isBlocked(listener: string, speaker: string): boolean {
    return this.blocks.get(listener)?.has(speaker) ?? false;
  }

  /** Returns false if the list is full — the caller should say so. */
  add(accountId: string, blockedId: string): boolean {
    if (!accountId || !blockedId || accountId === blockedId) return false;
    const set = this.blocks.get(accountId) ?? new Set<string>();
    if (set.has(blockedId)) return true;
    if (set.size >= LIMITS.blockListMax) return false;
    set.add(blockedId);
    this.blocks.set(accountId, set);
    // Blocking is an urgent, emotional action. Write it through immediately
    // rather than on the debounce — a crash in the next second must not undo
    // the one thing the player just asked for.
    this.flush();
    return true;
  }

  remove(accountId: string, blockedId: string): void {
    const set = this.blocks.get(accountId);
    if (!set?.delete(blockedId)) return;
    if (set.size === 0) this.blocks.delete(accountId);
    this.scheduleSave();
  }
}
