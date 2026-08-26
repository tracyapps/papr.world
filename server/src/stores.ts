// Process-wide store instances shared by the HTTP routes and the rooms.
//
// One server process, one data directory (override with PP_DATA_DIR). Keeping
// construction here means PaperRoom and index.ts agree without passing stores
// through Colyseus room options.

import { AccountStore } from './accounts';
import { RoomStore } from './persistence';
import { FeedbackStore } from './feedback';
import { BlockStore } from './blocks';
import { ModerationStore } from './moderation';

export const DATA_DIR = process.env.PP_DATA_DIR ?? 'data';

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
