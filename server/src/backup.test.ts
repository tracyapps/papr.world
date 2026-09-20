// The backup snapshot, tested where it matters: what goes in, what is left out,
// and that a missing or broken file never turns a backup into an exception.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BACKUP_FILE_ALLOWLIST, collectBackup } from './backup';

let dir = '';
const write = (name: string, contents: unknown) =>
  writeFileSync(join(dir, name), typeof contents === 'string' ? contents : JSON.stringify(contents));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pp-backup-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('collectBackup', () => {
  it('takes every durable store that is on disk', () => {
    write('accounts.json', { version: 1, accounts: [{ id: 'a' }] });
    write('mail.json', { version: 1 });
    write('profiles.json', { version: 1, profiles: {} });

    const snapshot = collectBackup(dir);
    expect(Object.keys(snapshot.files).sort()).toEqual(['accounts.json', 'mail.json', 'profiles.json']);
    expect(snapshot.files['accounts.json']).toEqual({ version: 1, accounts: [{ id: 'a' }] });
    expect(snapshot.included).toContain('accounts.json');
  });

  it('finds room saves by their name, without them being on the allowlist', () => {
    write('room-neighborhood.json', { version: 1, pieces: [{ id: 'p' }] });
    write('room-abc_123-xyz.json', { version: 1 });

    const snapshot = collectBackup(dir);
    expect(Object.keys(snapshot.files).sort()).toEqual(['room-abc_123-xyz.json', 'room-neighborhood.json']);
    expect(BACKUP_FILE_ALLOWLIST).not.toContain('room-neighborhood.json');
  });

  it('leaves out temp files, the write probe, and anything not a known store', () => {
    write('accounts.json', { version: 1 });
    write('accounts.json.tmp-4242', 'half-written');
    write('.write-probe-4242', 'ok');
    write('notes.json', { nope: true });

    const snapshot = collectBackup(dir);
    expect(Object.keys(snapshot.files)).toEqual(['accounts.json']);
    expect(snapshot.skipped.map((skip) => skip.name)).not.toContain('notes.json');
  });

  it('skips an oversized file with a reason instead of inlining it', () => {
    write('accounts.json', { version: 1 });
    write('mail.json', JSON.stringify({ pad: 'x'.repeat(4000) }));

    const snapshot = collectBackup(dir, () => 1_000, 1024);
    expect(Object.keys(snapshot.files)).toEqual(['accounts.json']);
    expect(snapshot.skipped).toEqual([
      { name: 'mail.json', reason: 'larger than the per-file cap', bytes: expect.any(Number) },
    ]);
    expect(snapshot.skipped[0].bytes).toBeGreaterThan(1024);
  });

  it('carries a file that will not parse rather than dropping it', () => {
    write('mail.json', '{ this is not json');

    const snapshot = collectBackup(dir);
    expect(snapshot.files['mail.json']).toBe('{ this is not json');
  });

  it('names a directory it did not walk, so a restore knows what is missing', () => {
    mkdirSync(join(dir, 'feedback-screenshots'));
    write('feedback.json', { version: 1 });

    const snapshot = collectBackup(dir);
    expect(Object.keys(snapshot.files)).toEqual(['feedback.json']);
    expect(snapshot.skipped).toContainEqual({
      name: 'feedback-screenshots',
      reason: 'a directory; fetch its files individually',
    });
  });

  it('returns an empty snapshot for a directory that does not exist', () => {
    const snapshot = collectBackup(join(dir, 'nope'));
    expect(snapshot.files).toEqual({});
    expect(snapshot.included).toEqual([]);
    expect(snapshot.bytes).toBe(0);
  });

  it('stamps the time it was taken from the injected clock', () => {
    expect(collectBackup(dir, () => 1_234_567).generatedAt).toBe(1_234_567);
  });
});
