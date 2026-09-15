import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { RoomStore } from './persistence';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('RoomStore neighborhood existence', () => {
  it('distinguishes a persisted neighborhood from a merely valid-looking code', () => {
    const dir = mkdtempSync(join(tmpdir(), 'papr-room-store-'));
    dirs.push(dir);
    const store = new RoomStore(dir);

    expect(store.has('invite-TRUE-65')).toBe(false);
    writeFileSync(join(dir, 'room-invite-TRUE-65.json'), '{}');
    expect(existsSync(join(dir, 'room-invite-TRUE-65.json'))).toBe(true);
    expect(store.has('invite-TRUE-65')).toBe(true);
  });
});
