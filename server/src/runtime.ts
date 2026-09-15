import { createDatabase } from './database';

/** Process-wide managed-world database shared by HTTP routes and rooms. */
export const database = createDatabase();
