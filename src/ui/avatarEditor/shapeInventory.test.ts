import { beforeEach, describe, expect, it } from 'vitest';
import type { CustomShape } from '../../../shared/src/index';
import {
  SHAPE_INVENTORY_MAX,
  defaultShapeName,
  deleteShape,
  getShape,
  keepShape,
  listShapes,
  readShapeDraft,
  renameShape,
  writeShapeDraft,
} from './shapeInventory';

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
}

function triangle(size: number): CustomShape {
  return { pieces: [{ op: 'add', points: [10, 10, 10 + size, 10, 10, 10 + size] }] };
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = makeStorage();
});

describe('keeping a shape', () => {
  it('adds a new shape under a default name', () => {
    const result = keepShape(triangle(30));
    expect(result.kept).toBe('new');
    expect(listShapes()).toHaveLength(1);
    expect(listShapes()[0]!.name).toBe('My shape 1');
  });

  it('numbers default names past the ones already taken', () => {
    keepShape(triangle(30));
    keepShape(triangle(40));
    expect(listShapes().map((s) => s.name).sort()).toEqual(['My shape 1', 'My shape 2']);
    expect(defaultShapeName()).toBe('My shape 3');
  });

  it('does not add the same shape twice', () => {
    keepShape(triangle(30));
    expect(keepShape(triangle(30)).kept).toBe('already');
    expect(listShapes()).toHaveLength(1);
  });

  it('updates a shape in place when it was being edited', () => {
    const first = keepShape(triangle(30));
    if (first.kept !== 'new') throw new Error('expected new');
    const second = keepShape(triangle(50), { replaceId: first.saved.id });
    expect(second.kept).toBe('updated');
    expect(listShapes()).toHaveLength(1);
    expect(getShape(first.saved.id)!.shape).toEqual(triangle(50));
    expect(getShape(first.saved.id)!.name).toBe('My shape 1');
  });

  it('adds a new one if the shape being edited is gone', () => {
    expect(keepShape(triangle(30), { replaceId: 'shape-gone' }).kept).toBe('new');
  });

  it('says so when the list is full instead of dropping anything', () => {
    for (let i = 0; i < SHAPE_INVENTORY_MAX; i++) keepShape(triangle(20 + i));
    expect(keepShape(triangle(200)).kept).toBe('full');
    expect(listShapes()).toHaveLength(SHAPE_INVENTORY_MAX);
  });

  it('refuses a shape that cuts nothing out', () => {
    expect(keepShape({ pieces: [] }).kept).toBe('failed');
  });
});

describe('the list', () => {
  it('shows the newest first', () => {
    keepShape(triangle(30), { now: 1000 });
    keepShape(triangle(40), { now: 3000 });
    keepShape(triangle(50), { now: 2000 });
    expect(listShapes().map((s) => s.updatedAt)).toEqual([3000, 2000, 1000]);
  });

  it('renames and deletes', () => {
    const kept = keepShape(triangle(30));
    if (kept.kept !== 'new') throw new Error('expected new');
    expect(renameShape(kept.saved.id, '  blobby   pal ')).toBe(true);
    expect(getShape(kept.saved.id)!.name).toBe('blobby pal');
    expect(renameShape(kept.saved.id, '   ')).toBe(false);
    expect(deleteShape(kept.saved.id)).toBe(true);
    expect(listShapes()).toHaveLength(0);
    expect(deleteShape(kept.saved.id)).toBe(false);
  });

  it('skips an entry that has been damaged instead of showing it', () => {
    localStorage.setItem(
      'pp.shapes.v1',
      JSON.stringify({
        version: 1,
        shapes: [
          { id: 'shape-ok', name: 'fine', shape: triangle(30), createdAt: 1, updatedAt: 1 },
          { id: 'shape-bad', name: 'broken', shape: { pieces: [{ op: 'add', points: [1, 2] }] } },
          { id: '<script>', name: 'sneaky', shape: triangle(30) },
          'nonsense',
        ],
      }),
    );
    expect(listShapes().map((s) => s.id)).toEqual(['shape-ok']);
  });

  it('survives storage that is not there or not readable', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(listShapes()).toEqual([]);
    expect(keepShape(triangle(30)).kept).toBe('failed');
  });
});

describe('the shape in progress', () => {
  it('is kept, read back, and cleared', () => {
    expect(readShapeDraft()).toBeNull();
    writeShapeDraft(triangle(30));
    expect(readShapeDraft()).toEqual(triangle(30));
    writeShapeDraft(null);
    expect(readShapeDraft()).toBeNull();
  });

  it('clears when there is nothing worth keeping, and ignores damage', () => {
    writeShapeDraft(triangle(30));
    writeShapeDraft({ pieces: [] });
    expect(readShapeDraft()).toBeNull();
    localStorage.setItem('pp.shapes.draft.v1', '{not json');
    expect(readShapeDraft()).toBeNull();
  });
});
