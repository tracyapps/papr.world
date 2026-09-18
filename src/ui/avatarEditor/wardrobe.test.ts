import { beforeEach, describe, expect, it } from 'vitest';
import { DESIGN_LIMITS, type AvatarDesign } from '../../../shared/src/index';
import {
  deleteDesign,
  duplicateDesign,
  duplicateName,
  getWornId,
  listDesigns,
  renameDesign,
  saveDesign,
  setSharedOnCard,
} from './wardrobe';

// The store is localStorage-backed; the house pattern (see input.test.ts) is a
// hand-rolled global stub rather than a DOM environment.
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

function design(id: string, overrides: Partial<AvatarDesign> = {}): AvatarDesign {
  return {
    version: 1,
    id,
    name: 'test cutout',
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

beforeEach(() => {
  Object.assign(globalThis, { localStorage: makeStorage() });
});

describe('wardrobe store', () => {
  it('round-trips saves and lists the most recently touched look first', () => {
    saveDesign(design('a', { updatedAt: 1_000 }));
    saveDesign(design('b', { updatedAt: 2_000 }));
    saveDesign(design('a', { name: 'renamed later', updatedAt: 3_000 }));
    expect(listDesigns().map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(listDesigns()[0]?.name).toBe('renamed later');
  });

  it('refuses the design beyond the wardrobe cap instead of dropping one', () => {
    for (let index = 0; index < DESIGN_LIMITS.wardrobeMax; index += 1) {
      expect(saveDesign(design(`look-${index}`))).toBe(true);
    }
    expect(saveDesign(design('one-too-many'))).toBe(false);
    expect(listDesigns()).toHaveLength(DESIGN_LIMITS.wardrobeMax);
    expect(listDesigns().some((entry) => entry.id === 'one-too-many')).toBe(false);
  });

  it('renames with the same normalization the studio uses', () => {
    saveDesign(design('a'));
    const renamed = renameDesign('a', '  rainy   day snail ');
    expect(renamed?.name).toBe('rainy day snail');
    expect(renamed?.updatedAt).toBeGreaterThan(1_000);
    expect(renameDesign('a', '   ')?.name).toBe('untitled cutout');
    expect(renameDesign('missing', 'x')).toBeNull();
  });

  it('builds copy names that always fit the name limit', () => {
    expect(duplicateName('snail')).toBe('snail (copy)');
    const longest = 'x'.repeat(DESIGN_LIMITS.nameMaxLength);
    expect(duplicateName(longest)).toHaveLength(DESIGN_LIMITS.nameMaxLength);
    expect(duplicateName(longest).endsWith('(copy)')).toBe(true);
  });

  it('duplicates into a private copy with a fresh id, and refuses when full', () => {
    saveDesign(design('a', { sharedOnCard: true, name: 'shared look' }));
    const copy = duplicateDesign('a');
    expect(copy).not.toBeNull();
    expect(copy?.id).not.toBe('a');
    expect(copy?.name).toBe('shared look (copy)');
    // Consent is opt-in per design — a duplicate never inherits it silently.
    expect(copy?.sharedOnCard).toBe(false);
    expect(listDesigns().find((entry) => entry.id === 'a')?.sharedOnCard).toBe(true);

    for (let index = listDesigns().length; index < DESIGN_LIMITS.wardrobeMax; index += 1) {
      saveDesign(design(`filler-${index}`));
    }
    expect(duplicateDesign('a')).toBeNull();
    expect(duplicateDesign('missing')).toBeNull();
  });

  it('toggles sharing without reordering the wardrobe', () => {
    saveDesign(design('a', { updatedAt: 1_000 }));
    saveDesign(design('b', { updatedAt: 2_000 }));
    const before = listDesigns().map((entry) => entry.id);
    const updated = setSharedOnCard('a', true);
    expect(updated?.sharedOnCard).toBe(true);
    expect(updated?.updatedAt).toBe(1_000);
    expect(listDesigns().map((entry) => entry.id)).toEqual(before);
    expect(setSharedOnCard('missing', true)).toBeNull();
  });

  it('clears the worn pointer when the worn design is deleted', () => {
    saveDesign(design('a'));
    saveDesign(design('b'));
    localStorage.setItem('pp.wardrobe.worn.v1', 'a');
    deleteDesign('a');
    expect(getWornId()).toBeNull();
    expect(listDesigns().map((entry) => entry.id)).toEqual(['b']);
  });

  it('skips corrupt entries on load rather than refusing the wardrobe', () => {
    saveDesign(design('good'));
    const raw = JSON.parse(localStorage.getItem('pp.wardrobe.v1') ?? '{}');
    raw.designs.push({ version: 2, id: 'from-the-future' }, { garbage: true });
    localStorage.setItem('pp.wardrobe.v1', JSON.stringify(raw));
    expect(listDesigns().map((entry) => entry.id)).toEqual(['good']);
  });
});

describe('wardrobe change events (what the account sync listens to)', () => {
  it('reports saves and deletes made by the player', async () => {
    const { onWardrobeChange } = await import('./wardrobe');
    const seen: string[] = [];
    const stop = onWardrobeChange((change) => {
      if (change.kind === 'saved') seen.push(`saved:${change.design.id}`);
      else if (change.kind === 'deleted') seen.push(`deleted:${change.id}`);
    });
    saveDesign(design('a'));
    renameDesign('a', 'new name');
    deleteDesign('a');
    stop();
    saveDesign(design('b'));
    expect(seen).toEqual(['saved:a', 'saved:a', 'deleted:a']);
  });

  it('writes what came from the account quietly, so it never echoes back', async () => {
    const { applyAccountWardrobe, onWardrobeChange } = await import('./wardrobe');
    saveDesign(design('old'));
    const seen: unknown[] = [];
    const stop = onWardrobeChange((change) => seen.push(change));
    applyAccountWardrobe([design('from-account', { updatedAt: 5_000 })], ['old']);
    stop();
    expect(seen).toEqual([{ kind: 'pulled' }]);
    expect(listDesigns().map((entry) => entry.id)).toEqual(['from-account']);
  });
});
