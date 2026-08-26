// Process-wide store instances shared by the HTTP routes and the rooms.
//
// One server process, one data directory (override with PP_DATA_DIR). Keeping
// construction here means PaperRoom and index.ts agree without passing stores
// through Colyseus room options.

import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccountStore } from './accounts';
import { RoomStore } from './persistence';
import { FeedbackStore } from './feedback';
import { BlockStore } from './blocks';
import { ModerationStore } from './moderation';

export const DATA_DIR = process.env.PP_DATA_DIR ?? 'data';

/**
 * Prove the data directory is writable before anything else starts.
 *
 * Everything durable lives in here: passports, neighborhood saves, block
 * lists, the feedback and moderation queues. When it is NOT writable the
 * server still boots perfectly happily and /health still answers 200 — and
 * then the first person to try to play gets a mystifying error, because the
 * failure only surfaces on the first write.
 *
 * The usual cause on a container host is a volume mounted over a directory
 * the image had already chowned at build time: the mount arrives owned by
 * root and the process is not root. Failing here, loudly, with the actual
 * errno, turns a half-hour of confusion into one line of the deploy log.
 */
function assertDataDirWritable(): void {
  const probe = join(DATA_DIR, `.write-probe-${process.pid}`);
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(probe, 'ok');
    unlinkSync(probe);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(
      `\nFATAL: the data directory ${DATA_DIR} is not writable.\n`
      + `  ${reason}\n\n`
      + '  Nothing can be saved: no paper passports, no neighborhoods, no\n'
      + '  block lists, no reports. Refusing to start rather than pretending\n'
      + '  to work and failing on the first player.\n\n'
      + '  On Railway this is almost always the volume: it must be mounted at\n'
      + `  ${DATA_DIR} and be writable by the container user. The image now\n`
      + '  fixes ownership at startup, so if you are seeing this on an old\n'
      + '  image, redeploy to pick up the current Dockerfile.\n',
    );
    process.exit(1);
  }
}

assertDataDirWritable();

export const accounts = new AccountStore(DATA_DIR);
export const roomStore = new RoomStore(DATA_DIR);
export const feedbackStore = new FeedbackStore(DATA_DIR);
export const blocks = new BlockStore(DATA_DIR);
export const moderation = new ModerationStore(DATA_DIR);

/**
 * The account that may remove people from any neighborhood.
 *
 * Set PAPR_OWNER_ACCOUNT to your own passport id (the `accountId` from
 * POST /account, NOT the secret). Unset means nobody can remove anybody —
 * which is a safe default for a local dev server and the wrong one for a
 * hosted alpha, so the startup log says which it is.
 */
export const OWNER_ACCOUNT = process.env.PAPR_OWNER_ACCOUNT?.trim() ?? '';

export function isOwner(accountId: string | undefined): boolean {
  return Boolean(OWNER_ACCOUNT) && accountId === OWNER_ACCOUNT;
}
