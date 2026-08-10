// Server bootstrap.
//
// One tiny Node process: an HTTP server (health check + passport minting)
// wrapped by Colyseus's WebSocket transport. This is the piece that canNOT
// live on static hosting — it needs a runtime that keeps a process alive and
// allows WebSockets. Run it locally for solo/LAN, or deploy it to a Node host
// (Fly.io, Railway, Render, a VPS) for hosted worlds.
//
// In production: serve behind HTTPS/wss and set PP_CORS_ORIGIN to the exact
// client origin. The permissive default exists only so local dev works.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DEFAULT_ROOM, LIMITS, sanitizeName } from '../../shared/src/index';
import { PaperRoom } from './rooms/PaperRoom';
import { accounts } from './stores';

const port = Number(process.env.PORT ?? 2567);
const corsOrigin = process.env.PP_CORS_ORIGIN ?? '*';

function withCors(res: ServerResponse): void {
  res.setHeader('access-control-allow-origin', corsOrigin);
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
}

function readBody(req: IncomingMessage, maxBytes = 4096): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * POST /account — mint a paper passport.
 *
 * Body: { "name": "wren" } (optional). Response: { accountId, secret }.
 * The secret is returned exactly once and never stored; the client keeps it.
 * No PII is collected — claiming with email/passkey is a later phase.
 */
async function handleCreateAccount(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const raw = await readBody(req);
    let name = 'paper friend';
    if (raw.length > 0) {
      const parsed = JSON.parse(raw) as { name?: unknown };
      name = sanitizeName(parsed.name);
    }
    const { id, secret } = accounts.create(name);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ accountId: id, secret }));
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid request' }));
  }
}

const httpServer = createServer((req, res) => {
  withCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (req.url === '/account' && req.method === 'POST') {
    void handleCreateAccount(req, res);
    return;
  }
  res.writeHead(404);
  res.end();
});

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(DEFAULT_ROOM, PaperRoom);

httpServer.listen(port, () => {
  console.log(`pencil-and-paper server listening on ws://localhost:${port}`);
  console.log(
    `room "${DEFAULT_ROOM}" ready (max ${LIMITS.playersPerRoom}) — /health, POST /account`,
  );
});

// Flush stores on shutdown so a Ctrl-C never eats a passport or a save.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    accounts.flush();
    process.exit(0);
  });
}
