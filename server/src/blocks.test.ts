// Blocking is the one control a player reaches for when they are already
// upset. Every property here is one they would be entitled to assume.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LIMITS } from '../../shared/src/index';
import { BlockStore } from './blocks';

let dir = '';
const fresh = () => new BlockStore(dir);

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'pp-blocks-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('BlockStore', () => {
  it('withholds a blocked speaker from the blocker only', () => {
    const blocks = fresh();
    blocks.add('anna', 'boris');

    expect(blocks.isBlocked('anna', 'boris')).toBe(true);
    // One direction. If A blocks B, B still sees A - otherwise anyone could
    // hide themselves from someone else's view, which is a way to duck
    // moderation rather than a way to be left alone.
    expect(blocks.isBlocked('boris', 'anna')).toBe(false);
    // And it is personal: nobody else's view changes.
    expect(blocks.isBlocked('clara', 'boris')).toBe(false);
  });

  it('survives a restart', () => {
    fresh().add('anna', 'boris');
    // A block that evaporated on reconnect would be worse than none at all,
    // because the player would believe they were protected.
    expect(fresh().isBlocked('anna', 'boris')).toBe(true);
  });

  it('is written through immediately, not on a debounce', () => {
    const blocks = fresh();
    blocks.add('anna', 'boris');
    // No flush() call here on purpose - reading from a second store proves
    // it already reached disk.
    expect(fresh().list('anna')).toEqual(['boris']);
  });

  it('unblocks, and forgets the account when its list empties', () => {
    const blocks = fresh();
    blocks.add('anna', 'boris');
    blocks.remove('anna', 'boris');
    blocks.flush();

    expect(blocks.isBlocked('anna', 'boris')).toBe(false);
    expect(fresh().list('anna')).toEqual([]);
  });

  it('refuses to block yourself or nobody', () => {
    const blocks = fresh();
    expect(blocks.add('anna', 'anna')).toBe(false);
    expect(blocks.add('anna', '')).toBe(false);
    expect(blocks.add('', 'boris')).toBe(false);
    expect(blocks.list('anna')).toEqual([]);
  });

  it('is idempotent', () => {
    const blocks = fresh();
    expect(blocks.add('anna', 'boris')).toBe(true);
    expect(blocks.add('anna', 'boris')).toBe(true);
    expect(blocks.list('anna')).toEqual(['boris']);
  });

  it('is bounded, so a list cannot be used to fill the disk', () => {
    const blocks = fresh();
    for (let i = 0; i < LIMITS.blockListMax; i += 1) blocks.add('anna', `other-${i}`);
    expect(blocks.list('anna')).toHaveLength(LIMITS.blockListMax);
    // Refused rather than silently dropped, so the caller can say so.
    expect(blocks.add('anna', 'one-too-many')).toBe(false);
  });

  it('starts empty rather than throwing on a corrupt file', () => {
    writeFileSync(join(dir, 'blocks.json'), '{ not json at all');
    // A corrupt store must not brick the server on boot.
    expect(() => fresh()).not.toThrow();
    expect(fresh().list('anna')).toEqual([]);
  });
});
