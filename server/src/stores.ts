// Process-wide store instances shared by the HTTP routes and the rooms.
//
// One server process, one data directory (override with PP_DATA_DIR). Keeping
// construction here means PaperRoom and index.ts agree without passing stores
// through Colyseus room options.

import { AccountStore } from './accounts';
import { RoomStore } from './persistence';
import { FeedbackStore } from './feedback';

export const DATA_DIR = process.env.PP_DATA_DIR ?? 'data';

export const accounts = new AccountStore(DATA_DIR);
export const roomStore = new RoomStore(DATA_DIR);
export const feedbackStore = new FeedbackStore(DATA_DIR);
