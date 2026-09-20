# Data backups

Written 2026-09-20, answering the owner's question: *is backing up `/data` easy,
is it a precaution or does the data need re-importing after a deploy, and can we
automate it?*

**Short answers:** it is now one command; it is a **precaution**, never a deploy
step, and **nothing is ever re-imported**; and yes — both a local command and a
server route exist as of this pass.

## Does a deploy need a backup, or a re-import?

**No to both, for an ordinary deploy.** Railway's volume is mounted at `/data`
and survives a redeploy: the container's own filesystem is replaced, the volume
is not. The new process starts, reads the same files, and the world is exactly
where it was. There is nothing to import and no step to remember.

There are exactly two cases where a copy is worth having, and neither is routine:

1. **A store shape changes.** `RoomStore.load` refuses a save whose `version`
   does not match `SAVE_VERSION` and leaves the file untouched — deliberately,
   because misreading data is worse than not reading it. The failure mode is
   therefore quiet: a room reads as *no save* and the world looks empty. The
   copy is what you restore from if the migration turns out to be wrong.
   (Today `SAVE_VERSION` is 1 and no migration has ever run.)
2. **A bad write or a bad hand-edit.** Every store writes atomically (temp file
   then rename), so a half-written file is unlikely — but "unlikely" is not
   "never", and the JSON stores are small enough that a copy costs nothing.

`PROTOCOL_VERSION` (11) is a different thing entirely: bumping it refuses older
*clients* on purpose and touches no data at all. Users refresh; nothing migrates.

**So the rule is:** back up when you are about to change the shape of something
on disk, and otherwise don't think about it.

## What is actually in there

Everything durable is a JSON file in one directory (`PP_DATA_DIR`, `/data` on
Railway). There is no database dump and no binary format.

| File | Holds |
| --- | --- |
| `accounts.json` | Paper passports (scrypt-hashed secrets only — never a secret) |
| `room-<id>.json` | One per neighbourhood: placed pieces, resource nodes, homes, door policies |
| `mail.json` | Mailboxes, authoritative parcels, display cases |
| `friends.json` | Friendships and pending requests |
| `blocks.json` | Block lists |
| `profiles.json` | Bios, social links, per-field visibility |
| `avatar-designs.json` | The account wardrobe |
| `account-tech.json` | Learned techniques |
| `solo-migrations.json` | One-time solo-save import receipts |
| `feedback.json` | The alpha feedback queue |
| `moderation.json` | The safety report queue |
| `feedback-screenshots/` | Screenshot attachments (binary; a directory) |

Neon (when `DATABASE_URL` is set) holds identities, profiles-as-rows, worlds and
memberships. **Neon is not covered by this** — it is a managed Postgres with its
own backups, and this tool deliberately does not try to duplicate that.

## The two ways to take one

### From your machine, against a local data directory

```bash
npm run data:backup                                  # snapshots ./data into ./.backups/<timestamp>/
node tools/backup-data.mjs --dir /path/to/data --out ./backups
```

A local snapshot copies the **whole directory** — including `feedback-screenshots/`
and any file the server does not know about yet — minus half-written temp files
and the boot probe. It writes a `manifest.json` beside the files with each file's
size and SHA-256, so a snapshot taken today can be checked years later.

### From a running server

Set `PP_BACKUP_TOKEN` on Railway (`openssl rand -base64 32`, and make it a value
you have not used for the other two tokens), redeploy, then:

```bash
node tools/backup-data.mjs --url https://paprworld-production.up.railway.app \
  --token "$PP_BACKUP_TOKEN"
```

`GET /admin/backup` is **read-only** — it opens files and never writes one, so it
is safe to call against a live server while people are playing. It returns the
JSON stores the server enumerates itself (the same list minus the screenshot
folder, which it names in `skipped` with a reason).

**Unset means closed.** With `PP_BACKUP_TOKEN` unset, `GET /admin/backup` answers
`503 "backups are not configured"` and never reads the directory. The boot log
says which state it is in:

```
data backups: /admin/backup is CLOSED (PP_BACKUP_TOKEN unset) — deploy-time copies still work locally
```

### Why a third token

The same reason there are two. A backup is the most sensitive artifact the server
can hand out — it contains every profile, every private letter, every safety
report and every wardrobe design at once. Whoever can pull a backup should not be
whoever can triage a bug, and should not have to be whoever reads safety reports.
One token each: `PP_REVIEWER_TOKEN`, `PP_MODERATION_TOKEN`, `PP_BACKUP_TOKEN`.

## Restoring

Restore is a copy back. **Stop the server first**, then:

```bash
node tools/backup-data.mjs --restore ./backups/2026-09-20T18-04-11 --dir ./data --yes
```

Without `--yes` it prints what it *would* do and exits non-zero. It never deletes
anything: it copies the snapshot's files over the live ones and leaves everything
else in the directory alone. Restart the server and check `/health`.

On Railway, restoring means getting the files onto the volume — `railway ssh` or
`railway run` into the service, or attach the volume to a one-off job. The files
are plain JSON, so any way you can write a file there works.

## What was built for this

| Thing | Where |
| --- | --- |
| The snapshot itself (pure, tested) | `server/src/backup.ts` — `collectBackup()` |
| The gated download route | `server/src/backupHandlers.ts` — `GET /admin/backup` |
| The route registration + boot line | `server/src/index.ts` |
| The command you actually run | `tools/backup-data.mjs` (`npm run data:backup`) |
| Tests | `server/src/backup.test.ts`, `server/src/backupHandlers.test.ts` |

## Verified, and not

**Verified by running it:** a local snapshot (temp files excluded, the screenshot
directory copied recursively, a manifest written); a restore that refuses without
`--yes` and succeeds with it; a real server booted with `PP_BACKUP_TOKEN`, where
`/admin/backup` answered `401` with no token, `401` with a wrong token, and `200`
with the right one; the CLI pulling that snapshot over HTTP and writing the files;
and the same server booted without the token, where the route answered `503` and
the boot log said CLOSED. Server suite green.

**Not verified:** a restore onto a real Railway volume (no host access from here),
and whether Neon's own backup story is what you want for the account tables.
