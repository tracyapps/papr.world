// The account-owned wardrobe — avatar Phase D's server half
// (docs/avatar-and-identity.md §7 D: "designs over the wire").
//
// Deliberately its own small file and its own JSON store, like
// `SoloMigrationStore` and `AccountTechStore`: designs are account data, not
// inventory (never spendable) and not world data (never in room state — rooms
// consume the resolved drawingKey, they do not own the art). Every entry
// passes `sanitizeAvatarDesign` on the way in AND on load, so a corrupted or
// hand-edited file degrades to "skipped", never to untrusted art on a page.
//
// Design ids are unguessable UUIDs. The worn design is public by design
// ("others always see your current avatar"); a saved-but-never-worn design is
// effectively private because its id never leaves the owner's client until
// they wear it into a shared world.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  DESIGN_LIMITS,
  sanitizeAvatarDesign,
  type AvatarDesign,
} from '../../shared/src/index';

type ImportReceipt = {
  /** Server epoch ms of the one-time device-wardrobe import. */
  at: number;
  /** Designs newly stored by the import. */
  imported: number;
  /** Designs the import refused: unreadable, or beyond the wardrobe cap. */
  skipped: number;
};

type StoreFile = {
  version: 1;
  designs: Record<string, AvatarDesign[]>;
  imports: Record<string, ImportReceipt>;
};

function writeAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, contents, 'utf8');
  renameSync(temporary, path);
}

function cloneDesign(design: AvatarDesign): AvatarDesign {
  return structuredClone(design);
}

export class AvatarDesignStore {
  private wardrobes = new Map<string, AvatarDesign[]>();
  private imports = new Map<string, ImportReceipt>();
  private path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'avatar-designs.json');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<StoreFile>;
      for (const [accountId, rawList] of Object.entries(parsed.designs ?? {})) {
        if (!accountId || !Array.isArray(rawList)) continue;
        const designs = rawList
          .flatMap((raw) => {
            const design = sanitizeAvatarDesign(raw);
            return design ? [design] : [];
          })
          // Same cap the live wardrobe enforces, so a hand-grown file cannot
          // balloon an account past what any client would have saved.
          .slice(0, DESIGN_LIMITS.wardrobeMax);
        if (designs.length > 0) this.wardrobes.set(accountId, designs);
      }
      for (const [accountId, receipt] of Object.entries(parsed.imports ?? {})) {
        if (
          accountId && receipt && typeof receipt === 'object'
          && Number.isFinite(receipt.at) && Number.isFinite(receipt.imported)
        ) {
          this.imports.set(accountId, {
            at: receipt.at,
            imported: receipt.imported,
            skipped: Number.isFinite(receipt.skipped) ? receipt.skipped : 0,
          });
        }
      }
    } catch (error) {
      console.error(`avatar-designs: failed to read ${this.path}, starting empty`, error);
    }
  }

  private flush(): void {
    const designs = Object.fromEntries(this.wardrobes);
    const imports = Object.fromEntries(this.imports);
    writeAtomic(this.path, JSON.stringify({ version: 1, designs, imports } satisfies StoreFile, null, 2));
  }

  /** The account's saved designs, most recently touched first. */
  listFor(accountId: string): AvatarDesign[] {
    return [...(this.wardrobes.get(accountId) ?? [])]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(cloneDesign);
  }

  getDesign(accountId: string, designId: string): AvatarDesign | null {
    const design = this.wardrobes.get(accountId)?.find((entry) => entry.id === designId);
    return design ? cloneDesign(design) : null;
  }

  /**
   * Public lookup by design id alone — the remote-rendering read. The fetcher
   * (another player's client) only ever holds the id the wearer's AvatarRef
   * carried, which the room already validated against the owning account.
   */
  findDesign(designId: string): AvatarDesign | null {
    for (const designs of this.wardrobes.values()) {
      const design = designs.find((entry) => entry.id === designId);
      if (design) return cloneDesign(design);
    }
    return null;
  }

  /**
   * The room's ownership gate: a worn drawingKey survives only when it names
   * a design this account actually holds. Guests own nothing, so they always
   * render the template fallback — a guest identity is new every connection
   * and has no wardrobe to speak of.
   */
  resolveDrawingKey(accountId: string, drawingKey: string): string {
    if (!drawingKey || accountId.startsWith('guest:')) return '';
    return this.wardrobes.get(accountId)?.some((entry) => entry.id === drawingKey)
      ? drawingKey
      : '';
  }

  /**
   * Insert or update by id (the caller has already sanitized). Returns false
   * when the wardrobe is full — the client shows "stuffed", same as local.
   */
  saveDesign(accountId: string, design: AvatarDesign): boolean {
    const designs = this.wardrobes.get(accountId) ?? [];
    const index = designs.findIndex((entry) => entry.id === design.id);
    if (index >= 0) {
      designs[index] = cloneDesign(design);
    } else {
      if (designs.length >= DESIGN_LIMITS.wardrobeMax) return false;
      designs.push(cloneDesign(design));
    }
    this.wardrobes.set(accountId, designs);
    this.flush();
    return true;
  }

  deleteDesign(accountId: string, designId: string): boolean {
    const designs = this.wardrobes.get(accountId);
    if (!designs?.some((entry) => entry.id === designId)) return false;
    this.wardrobes.set(accountId, designs.filter((entry) => entry.id !== designId));
    this.flush();
    return true;
  }

  importReceiptFor(accountId: string): ImportReceipt | null {
    const existing = this.imports.get(accountId);
    return existing ? { ...existing } : null;
  }

  /**
   * The one-time device-wardrobe import — the same explicit, reviewed,
   * never-twice shape as the solo-save migration. A second attempt returns
   * the original receipt and stores nothing, so there is no import habit to
   * drift into a background sync.
   */
  importWardrobe(
    accountId: string,
    rawDesigns: unknown[],
    at = Date.now(),
  ): { receipt: ImportReceipt; alreadyImported: boolean; designs: AvatarDesign[] } {
    const existing = this.imports.get(accountId);
    if (existing) {
      return { receipt: { ...existing }, alreadyImported: true, designs: this.listFor(accountId) };
    }

    const designs = this.wardrobes.get(accountId) ?? [];
    const known = new Set(designs.map((entry) => entry.id));
    let imported = 0;
    let skipped = 0;
    for (const raw of rawDesigns.slice(0, DESIGN_LIMITS.wardrobeMax)) {
      const design = sanitizeAvatarDesign(raw);
      if (!design || known.has(design.id)) {
        skipped += 1;
        continue;
      }
      if (designs.length >= DESIGN_LIMITS.wardrobeMax) {
        skipped += 1;
        continue;
      }
      designs.push(cloneDesign(design));
      known.add(design.id);
      imported += 1;
    }
    if (imported > 0) this.wardrobes.set(accountId, designs);
    const receipt: ImportReceipt = { at, imported, skipped };
    this.imports.set(accountId, receipt);
    this.flush();
    return { receipt: { ...receipt }, alreadyImported: false, designs: this.listFor(accountId) };
  }
}
