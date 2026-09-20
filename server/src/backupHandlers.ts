// The backup download route — thin glue over `collectBackup`.
//
// It has its OWN token, `PP_BACKUP_TOKEN`, for the same reason the moderation
// queue has its own and not the reviewer's: a full backup is the most sensitive
// artifact the server can hand out. It carries every profile, every private
// letter, every safety report and every wardrobe design at once, so "who can
// pull a backup" should not be implied by "who can triage a bug".
//
// Unset means closed, exactly like the other two desks. A hosted alpha that
// silently serves its whole data directory to anyone who asks is the failure
// worth defaulting against.

import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { collectBackup } from './backup';

export type BackupDependencies = {
  dataDir: string;
  /** `PP_BACKUP_TOKEN`. Absent or blank closes the route. */
  token?: string;
};

/** Same constant-time compare the reviewer and moderator gates use. */
function tokenAccepted(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createBackupHandlers(deps: BackupDependencies) {
  return {
    /**
     * `GET /admin/backup` — the whole durable directory as one JSON document.
     *
     * Read-only by construction: it opens files and never writes one, so it can
     * be run against a live server without stopping play. The response is a
     * snapshot object (`collectBackup`), not a tarball — every store here is
     * already JSON, so no archive format is needed to make it portable.
     */
    download(req: Request, res: Response): void {
      const expected = deps.token?.trim() ?? '';
      if (!expected) {
        res.status(503).json({ error: 'backups are not configured' });
        return;
      }
      const authorization = req.headers.authorization ?? '';
      const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!tokenAccepted(supplied, expected)) {
        res.setHeader('www-authenticate', 'Bearer');
        res.status(401).json({ error: 'backup token required' });
        return;
      }
      const snapshot = collectBackup(deps.dataDir);
      res.setHeader('cache-control', 'private, no-store');
      res.attachment(`papr-data-${new Date().toISOString().slice(0, 10)}.json`);
      res.type('application/json').send(JSON.stringify(snapshot, null, 2));
    },
  };
}
