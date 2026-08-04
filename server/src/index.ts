// Server bootstrap.
//
// One tiny Node process: an HTTP server (with a /health route for hosts that
// ping it) wrapped by Colyseus's WebSocket transport. This is the piece that
// canNOT live on static hosting — it needs a runtime that keeps a process
// alive and allows WebSockets. Run it locally for solo/LAN, or deploy it to a
// Node host (Fly.io, Railway, Render, a VPS) for hosted worlds.

import { createServer } from 'node:http';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { DEFAULT_ROOM } from '../../shared/src/index';
import { PaperRoom } from './rooms/PaperRoom';

const port = Number(process.env.PORT ?? 2567);

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
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
  console.log(`room "${DEFAULT_ROOM}" ready — health check at /health`);
});
