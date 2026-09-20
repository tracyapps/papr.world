#!/usr/bin/env node
// Back up (and restore) papr.world's durable data directory.
//
// Every durable thing the server owns is a JSON file in ONE directory
// (`PP_DATA_DIR`, `/data` on Railway). So a backup is a copy of that directory
// and a restore is a copy back — there is no database dump, no archive format
// and no re-import step. This script exists so that is one command instead of a
// remembered incantation, and so every snapshot comes with a manifest you can
// verify later.
//
// USAGE
//   node tools/backup-data.mjs                        # snapshot the local data dir
//   node tools/backup-data.mjs --dir /path --out ./backups
//   node tools/backup-data.mjs --url https://host --token "$PP_BACKUP_TOKEN"
//   node tools/backup-data.mjs --restore ./backups/2026-09-20T18-04-11 --yes
//   node tools/backup-data.mjs --help
//
// A LOCAL SNAPSHOT copies everything in the directory (minus temp files), so a
// file the server does not know about yet is still saved. A REMOTE PULL asks
// `GET /admin/backup` for the JSON stores the server itself enumerates, which
// needs `PP_BACKUP_TOKEN` set on the server and passed here.
//
// RESTORE refuses to run without `--yes` and never deletes anything: it copies
// the snapshot's files over the live ones and leaves everything else alone.

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const HELP = `Back up (or restore) the papr.world data directory.

  node tools/backup-data.mjs [options]

  --dir <path>        the data directory (default: $PP_DATA_DIR, else ./data)
  --out <path>        where snapshots go (default: ./.backups)
  --url <https://…>   pull a snapshot from a running server instead of a local dir
  --token <token>     the server's PP_BACKUP_TOKEN (required with --url)
  --restore <path>    copy a snapshot back over the data directory (needs --yes)
  --yes               confirm a restore
  --help              this text

Snapshots are written to <out>/<timestamp>/ with a manifest.json beside the files.
`;

/** Files that are never part of a snapshot: half-written writes and the boot probe. */
const isTransient = (name) => name.startsWith('.write-probe-') || name.includes('.tmp-');

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function human(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Filesystem-safe timestamp: 2026-09-20T18-04-11. */
function stamp(date = new Date()) {
  return date.toISOString().replace(/\.\d+Z$/, '').replace(/:/g, '-');
}

function snapshotLocal(dataDir, outDir) {
  if (!existsSync(dataDir)) {
    throw new Error(`no data directory at ${dataDir} — nothing to back up`);
  }
  const target = join(outDir, stamp());
  mkdirSync(target, { recursive: true });

  const files = [];
  let totalBytes = 0;
  for (const name of readdirSync(dataDir).sort()) {
    if (isTransient(name)) continue;
    const path = join(dataDir, name);
    if (statSync(path).isDirectory()) {
      // Screenshots and any other folder: copied recursively, so a snapshot is
      // still the whole world rather than the parts that happen to be JSON.
      totalBytes += copyDir(path, join(target, name), `${name}/`, files);
      continue;
    }
    copyFileSync(path, join(target, name));
    const contents = readFileSync(path);
    files.push({ name, bytes: contents.length, sha256: sha256(contents) });
    totalBytes += contents.length;
  }

  return { kind: 'local', source: resolve(dataDir), target, files, totalBytes };
}

/** Copy a directory tree, recording each file under `prefix`. Returns bytes copied. */
function copyDir(from, to, prefix, files) {
  mkdirSync(to, { recursive: true });
  let bytes = 0;
  for (const name of readdirSync(from).sort()) {
    const source = join(from, name);
    const destination = join(to, name);
    if (statSync(source).isDirectory()) {
      bytes += copyDir(source, destination, `${prefix}${name}/`, files);
      continue;
    }
    copyFileSync(source, destination);
    const contents = readFileSync(source);
    files.push({ name: `${prefix}${name}`, bytes: contents.length, sha256: sha256(contents) });
    bytes += contents.length;
  }
  return bytes;
}

async function snapshotRemote(url, token, outDir) {
  if (!token) throw new Error('--url needs --token (the server\'s PP_BACKUP_TOKEN)');
  const endpoint = `${url.replace(/\/$/, '')}/admin/backup`;
  const response = await fetch(endpoint, { headers: { authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${endpoint} answered ${response.status}: ${detail.slice(0, 200)}`);
  }
  const payload = await response.text();
  const snapshot = JSON.parse(payload);

  const target = join(outDir, stamp());
  mkdirSync(target, { recursive: true });
  const files = [];
  for (const [name, value] of Object.entries(snapshot.files ?? {})) {
    const contents = JSON.stringify(value, null, 2);
    writeFileSync(join(target, name), contents);
    files.push({ name, bytes: Buffer.byteLength(contents), sha256: sha256(contents) });
  }
  return {
    kind: 'remote',
    source: endpoint,
    target,
    files,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    skipped: snapshot.skipped ?? [],
  };
}

function restore(snapshotDir, dataDir) {
  if (!existsSync(snapshotDir)) throw new Error(`no snapshot at ${snapshotDir}`);
  mkdirSync(dataDir, { recursive: true });
  const restored = [];
  for (const name of readdirSync(snapshotDir)) {
    if (name === 'manifest.json') continue;
    const source = join(snapshotDir, name);
    if (statSync(source).isDirectory()) {
      mkdirSync(join(dataDir, name), { recursive: true });
      for (const inner of readdirSync(source)) {
        copyFileSync(join(source, inner), join(dataDir, name, inner));
      }
      continue;
    }
    copyFileSync(source, join(dataDir, name));
    restored.push(name);
  }
  return restored;
}

async function main() {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string' },
      out: { type: 'string' },
      url: { type: 'string' },
      token: { type: 'string' },
      restore: { type: 'string' },
      yes: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });

  if (values.help) {
    process.stdout.write(HELP);
    return;
  }

  const dataDir = resolve(values.dir ?? process.env.PP_DATA_DIR ?? 'data');
  const outDir = resolve(values.out ?? '.backups');

  if (values.restore) {
    const snapshotDir = resolve(values.restore);
    if (!values.yes) {
      process.stderr.write(
        `This would copy ${snapshotDir} over ${dataDir}.\n`
        + 'Stop the server first, then re-run with --yes.\n',
      );
      process.exitCode = 1;
      return;
    }
    const restored = restore(snapshotDir, dataDir);
    process.stdout.write(`Restored ${restored.length} file(s) into ${dataDir}\n`);
    process.stdout.write('Restart the server and check /health.\n');
    return;
  }

  const result = values.url
    ? await snapshotRemote(values.url, values.token ?? process.env.PP_BACKUP_TOKEN, outDir)
    : snapshotLocal(dataDir, outDir);

  const manifest = {
    generatedAt: new Date().toISOString(),
    kind: result.kind,
    source: result.source,
    files: result.files,
    totalBytes: result.totalBytes,
    skipped: result.skipped ?? [],
  };
  writeFileSync(join(result.target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write(`Backed up ${result.files.length} file(s), ${human(result.totalBytes)}\n`);
  process.stdout.write(`  from ${result.source}\n`);
  process.stdout.write(`  to   ${result.target}\n`);
  for (const skip of manifest.skipped) {
    process.stdout.write(`  skipped ${skip.name}: ${skip.reason}\n`);
  }
  process.stdout.write('Copy that folder somewhere off this machine.\n');
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
