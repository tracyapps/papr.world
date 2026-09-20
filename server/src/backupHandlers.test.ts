// The backup route's gate. This is the only security boundary on the most
// sensitive download the server has, so it is tested directly rather than left
// as "thin glue" — an unset token must CLOSE the route, not open it.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBackupHandlers } from './backupHandlers';

let dir = '';

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pp-backup-route-'));
  writeFileSync(join(dir, 'accounts.json'), JSON.stringify({ version: 1, accounts: [] }));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fakeResponse() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) { res.headers[name] = value; },
    status(code: number) { res.statusCode = code; return res; },
    json(payload: unknown) { res.body = payload; return res; },
    type(value: string) { res.headers['content-type'] = value; return res; },
    attachment(name: string) { res.headers['content-disposition'] = `attachment; filename="${name}"`; return res; },
    send(payload: unknown) { res.body = payload; return res; },
  };
  return res;
}

const request = (authorization?: string) => ({
  headers: authorization === undefined ? {} : { authorization },
}) as unknown as Parameters<ReturnType<typeof createBackupHandlers>['download']>[0];

describe('GET /admin/backup', () => {
  it('is closed when no token is configured', () => {
    const res = fakeResponse();
    createBackupHandlers({ dataDir: dir }).download(request('Bearer anything'), res as never);
    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({ error: 'backups are not configured' });
    // The directory was never read: nothing about the data leaked in the refusal.
    expect(res.headers['cache-control']).toBeUndefined();
  });

  it('refuses a missing, wrong, or differently-sized token', () => {
    const handlers = createBackupHandlers({ dataDir: dir, token: 'the-real-token' });
    for (const header of [undefined, 'Bearer', 'Bearer wrong', 'Bearer the-real-token-and-more', 'the-real-token']) {
      const res = fakeResponse();
      handlers.download(request(header), res as never);
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'backup token required' });
    }
  });

  it('serves the snapshot as a download when the token matches', () => {
    const res = fakeResponse();
    createBackupHandlers({ dataDir: dir, token: 'the-real-token' })
      .download(request('Bearer the-real-token'), res as never);

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="papr-data-\d{4}-\d{2}-\d{2}\.json"$/);

    const snapshot = JSON.parse(res.body as string) as { files: Record<string, unknown> };
    expect(snapshot.files['accounts.json']).toEqual({ version: 1, accounts: [] });
  });
});
