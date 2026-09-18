import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { DESIGN_LIMITS, type AvatarDesign } from '../../shared/src/index';
import { AvatarDesignStore } from './avatarDesigns';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function newStoreDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'papr-avatar-designs-'));
  dirs.push(dir);
  return dir;
}

function design(id: string, overrides: Partial<AvatarDesign> = {}): AvatarDesign {
  return {
    version: 1,
    id,
    name: 'test look',
    silhouette: 'round-pal',
    paper: { color: 'kraft', pattern: 'plain' },
    strokes: [],
    preset: 'medium',
    sharedOnCard: false,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

describe('AvatarDesignStore', () => {
  it('saves, updates by id, and lists the most recently touched look first', () => {
    const store = new AvatarDesignStore(newStoreDir());
    expect(store.saveDesign('account-1', design('a', { updatedAt: 1_000 }))).toBe(true);
    expect(store.saveDesign('account-1', design('b', { updatedAt: 2_000 }))).toBe(true);
    expect(store.saveDesign('account-1', design('a', { name: 'renamed', updatedAt: 3_000 }))).toBe(true);
    expect(store.listFor('account-1').map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(store.getDesign('account-1', 'a')?.name).toBe('renamed');
  });

  it('refuses a new design beyond the wardrobe cap but keeps updating owned ones', () => {
    const store = new AvatarDesignStore(newStoreDir());
    for (let index = 0; index < DESIGN_LIMITS.wardrobeMax; index += 1) {
      expect(store.saveDesign('account-1', design(`look-${index}`))).toBe(true);
    }
    expect(store.saveDesign('account-1', design('one-too-many'))).toBe(false);
    expect(store.saveDesign('account-1', design('look-0', { updatedAt: 9_000 }))).toBe(true);
    expect(store.listFor('account-1')).toHaveLength(DESIGN_LIMITS.wardrobeMax);
  });

  it('deletes only designs the account owns', () => {
    const store = new AvatarDesignStore(newStoreDir());
    store.saveDesign('account-1', design('a'));
    store.saveDesign('account-2', design('b'));
    expect(store.deleteDesign('account-1', 'b')).toBe(false);
    expect(store.deleteDesign('account-1', 'a')).toBe(true);
    expect(store.getDesign('account-1', 'a')).toBeNull();
    expect(store.getDesign('account-2', 'b')).not.toBeNull();
  });

  it('resolves worn drawing keys only for designs the account holds', () => {
    const store = new AvatarDesignStore(newStoreDir());
    store.saveDesign('account-1', design('a'));
    expect(store.resolveDrawingKey('account-1', 'a')).toBe('a');
    // Wearing someone else's id — or a key from nothing at all — falls back.
    expect(store.resolveDrawingKey('account-2', 'a')).toBe('');
    expect(store.resolveDrawingKey('account-1', 'missing')).toBe('');
    expect(store.resolveDrawingKey('guest:session-1', 'a')).toBe('');
  });

  it('finds a design by id alone for remote rendering', () => {
    const store = new AvatarDesignStore(newStoreDir());
    store.saveDesign('account-1', design('a'));
    expect(store.findDesign('a')?.id).toBe('a');
    expect(store.findDesign('missing')).toBeNull();
  });

  it('imports a device wardrobe exactly once, merging by id and bounded', () => {
    const store = new AvatarDesignStore(newStoreDir());
    store.saveDesign('account-1', design('already-here'));

    const first = store.importWardrobe('account-1', [
      design('already-here'),
      design('fresh-look'),
      { version: 2, id: 'from-the-future' },
      'garbage',
    ], 5_000);
    expect(first.alreadyImported).toBe(false);
    expect(first.receipt).toEqual({ at: 5_000, imported: 1, skipped: 3 });
    expect(first.designs.map((entry) => entry.id).sort()).toEqual(['already-here', 'fresh-look']);

    const second = store.importWardrobe('account-1', [design('never-lands')], 9_000);
    expect(second.alreadyImported).toBe(true);
    expect(second.receipt.at).toBe(5_000);
    expect(second.designs.some((entry) => entry.id === 'never-lands')).toBe(false);
    expect(store.importReceiptFor('account-1')?.at).toBe(5_000);
  });

  it('persists to disk and reloads, dropping corrupt entries on load', () => {
    const dir = newStoreDir();
    const store = new AvatarDesignStore(dir);
    store.saveDesign('account-1', design('good'));
    store.importWardrobe('account-1', [design('imported-look')], 7_000);

    const onDisk = JSON.parse(readFileSync(join(dir, 'avatar-designs.json'), 'utf8'));
    expect(onDisk.designs['account-1']).toHaveLength(2);
    expect(onDisk.imports['account-1'].imported).toBe(1);

    writeFileSync(
      join(dir, 'avatar-designs.json'),
      JSON.stringify({
        version: 1,
        designs: {
          'account-good': [design('fine')],
          // Version mismatch and non-objects are refused outright. (A design
          // with merely malformed *fields* is not refused — sanitize degrades
          // it to a safe default, by design.)
          'account-bad': [{ version: 2, id: 'x' }, 'garbage'],
        },
        imports: { 'account-good': { at: 1, imported: 1 } },
      }),
      'utf8',
    );
    const reloaded = new AvatarDesignStore(dir);
    expect(reloaded.getDesign('account-good', 'fine')).not.toBeNull();
    expect(reloaded.listFor('account-bad')).toEqual([]);
    expect(reloaded.importReceiptFor('account-good')?.imported).toBe(1);
  });

  it('returns independent copies so a caller cannot mutate stored designs', () => {
    const store = new AvatarDesignStore(newStoreDir());
    store.saveDesign('account-1', design('a'));
    store.listFor('account-1')[0]!.name = 'smuggled';
    expect(store.getDesign('account-1', 'a')?.name).toBe('test look');
  });
});
