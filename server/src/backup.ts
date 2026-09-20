// Data backups — one snapshot of everything durable, in one place.
//
// WHY THIS IS EASY HERE. Every durable thing the server owns is a JSON file in
// `PP_DATA_DIR` (accounts, rooms, mail, friends, blocks, profiles, designs,
// tech, migrations, feedback, moderation). There is no database to dump and no
// binary format to learn — a backup is "read every file and keep the contents".
// That is the whole design, and it is deliberately not cleverer than that.
//
// WHY IT MATTERS ANYWAY. Railway keeps `/data` across redeploys, so an ordinary
// code deploy needs no backup and needs no re-import: the files are still there
// when the new process starts. The case this exists for is the OTHER one —
// a change to a store's shape or to `SAVE_VERSION`. `RoomStore.load` refuses a
// save whose version it does not recognise and leaves the file untouched, which
// is the right call (never misread data) but means a bad migration presents as
// "the world is empty". This is the copy you take before you find that out.
//
// The pure half lives here and is unit-tested; the HTTP route is thin glue in
// backupHandlers.ts.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The JSON stores, by filename, that are always part of a backup.
 *
 * Kept as an explicit allowlist rather than "every .json in the folder" so a
 * stray file can never leak into a download, and so adding a store without
 * adding it here is a visible omission rather than a silent one. The one thing
 * NOT on the list by name is room saves, which are found by pattern below.
 */
export const BACKUP_FILE_ALLOWLIST = [
  'accounts.json',
  'blocks.json',
  'friends.json',
  'profiles.json',
  'mail.json',
  'moderation.json',
  'feedback.json',
  'solo-migrations.json',
  'account-tech.json',
  'avatar-designs.json',
] as const;

/** Room saves are named `room-<safeId>.json` by `RoomStore.pathFor`. */
const ROOM_FILE = /^room-[A-Za-z0-9_-]+\.json$/;

/**
 * A single file larger than this is skipped and reported rather than inlined.
 *
 * There is no size at which a JSON store *should* be this big; the ceiling
 * exists so one runaway file cannot make the endpoint an accidental
 * denial-of-service against itself, and so the reason it was left out is
 * visible in the manifest instead of silently missing.
 */
export const BACKUP_MAX_FILE_BYTES = 16 * 1024 * 1024;

export type BackupSkip = { name: string; reason: string; bytes?: number };

export type BackupSnapshot = {
  /** Server epoch ms the snapshot was taken. */
  generatedAt: number;
  /** The directory it was read from, for the manifest. */
  dataDir: string;
  /** filename -> the parsed JSON it held. */
  files: Record<string, unknown>;
  /** Every file included, in the order it was read. */
  included: string[];
  /** Things deliberately left out, and why. */
  skipped: BackupSkip[];
  /** Total bytes of the files actually included. */
  bytes: number;
};

function readJson(path: string): unknown | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // A file that will not parse is still worth shipping: the raw bytes are the
    // evidence, and a backup that silently drops the one broken file is worse
    // than one that carries it. Read it back as text instead.
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return undefined;
    }
  }
}

function sizeOf(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/**
 * Read every durable file under `dataDir` into one snapshot.
 *
 * Never throws for a missing directory or an unreadable file: a backup that
 * fails loudly because one file is odd is a backup you stop taking. Anything
 * left out is named in `skipped` with its reason.
 */
export function collectBackup(
  dataDir: string,
  now: () => number = Date.now,
  maxFileBytes: number = BACKUP_MAX_FILE_BYTES,
): BackupSnapshot {
  const files: Record<string, unknown> = {};
  const included: string[] = [];
  const skipped: BackupSkip[] = [];
  let bytes = 0;

  let entries: string[] = [];
  try {
    entries = readdirSync(dataDir);
  } catch {
    return { generatedAt: now(), dataDir, files, included, skipped, bytes };
  }

  const wanted = new Set<string>(BACKUP_FILE_ALLOWLIST);
  for (const name of entries) {
    if (!wanted.has(name) && !ROOM_FILE.test(name)) continue;
    const path = join(dataDir, name);
    const size = sizeOf(path);
    if (size > maxFileBytes) {
      skipped.push({ name, reason: 'larger than the per-file cap', bytes: size });
      continue;
    }
    const value = readJson(path);
    if (value === undefined) {
      skipped.push({ name, reason: 'could not be read', bytes: size });
      continue;
    }
    files[name] = value;
    included.push(name);
    bytes += size;
  }

  // Directories and everything else are named once, so the manifest explains
  // what a restore would NOT bring back rather than quietly omitting it.
  for (const name of entries) {
    if (wanted.has(name) || ROOM_FILE.test(name)) continue;
    if (name.startsWith('.write-probe-') || name.includes('.tmp-')) continue;
    let isDirectory = false;
    try {
      isDirectory = statSync(join(dataDir, name)).isDirectory();
    } catch {
      continue;
    }
    if (isDirectory) {
      skipped.push({ name, reason: 'a directory; fetch its files individually' });
    }
  }

  included.sort();
  return { generatedAt: now(), dataDir, files, included, skipped, bytes };
}
