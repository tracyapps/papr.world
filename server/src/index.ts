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

import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import type { NextFunction, Request, Response } from 'express';
import {
  DEFAULT_ROOM,
  LIMITS,
  ALPHA_FEEDBACK_STATUSES,
  MAX_FEEDBACK_SCREENSHOT_BYTES,
  sanitizeAlphaFeedback,
  sanitizeName,
  type AlphaFeedbackCategory,
  type AlphaFeedbackStatus,
} from '../../shared/src/index';
import { PaperRoom } from './rooms/PaperRoom';
import { accounts, feedbackStore } from './stores';

const port = Number(process.env.PORT ?? 2567);
const corsOrigin = process.env.PP_CORS_ORIGIN ?? '*';
const feedbackWindows = new Map<string, number[]>();
const FEEDBACK_WINDOW_MS = 10 * 60 * 1000;
const FEEDBACK_LIMIT = 6;

function withCors(req: IncomingMessage, res: ServerResponse): void {
  // The 0.17 SDK's matchmaking request is credentialed. Browsers reject a
  // credentialed response paired with `*`, so permissive LOCAL development
  // reflects the caller while production still pins PP_CORS_ORIGIN exactly.
  const allowedOrigin = corsOrigin === '*'
    ? (req.headers.origin ?? '*')
    : corsOrigin;
  res.setHeader('access-control-allow-origin', allowedOrigin);
  if (allowedOrigin !== '*') {
    res.setHeader('access-control-allow-credentials', 'true');
    res.setHeader('vary', 'Origin');
  }
  res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('access-control-allow-headers', 'authorization, content-type');
}

function readBytes(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let tooLarge = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => tooLarge
      ? reject(new Error('body too large'))
      : resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readBody(req: IncomingMessage, maxBytes = 4096): Promise<string> {
  return (await readBytes(req, maxBytes)).toString('utf8');
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

function feedbackRateLimited(key: string, now = Date.now()): boolean {
  const recent = (feedbackWindows.get(key) ?? [])
    .filter((at) => now - at < FEEDBACK_WINDOW_MS);
  if (recent.length >= FEEDBACK_LIMIT) {
    feedbackWindows.set(key, recent);
    return true;
  }
  recent.push(now);
  feedbackWindows.set(key, recent);
  return false;
}

async function handleFeedback(req: Request, res: Response): Promise<void> {
  try {
    const raw = await readBody(req, 8192);
    const submission = sanitizeAlphaFeedback(JSON.parse(raw));
    if (!submission) {
      res.status(400).json({ error: 'invalid feedback' });
      return;
    }
    const rateKey = submission.context.accountId || req.ip || req.socket.remoteAddress || 'unknown';
    if (feedbackRateLimited(rateKey)) {
      res.status(429).json({ error: 'please wait before sending more feedback' });
      return;
    }
    const record = feedbackStore.append(submission);
    res.status(201).json({ receiptId: record.submission.id, status: record.status });
  } catch {
    res.status(400).json({ error: 'invalid request' });
  }
}

async function handleFeedbackScreenshot(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? '');
    const mime = String(req.headers['content-type'] ?? '').split(';', 1)[0];
    const length = Number(req.headers['content-length'] ?? 0);
    if (length > MAX_FEEDBACK_SCREENSHOT_BYTES) {
      res.status(413).json({ error: 'screenshot too large' });
      return;
    }
    const rateKey = `screenshot:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    if (feedbackRateLimited(rateKey)) {
      res.status(429).json({ error: 'please wait before sending more screenshots' });
      return;
    }
    const data = await readBytes(req, MAX_FEEDBACK_SCREENSHOT_BYTES);
    if (!feedbackStore.saveScreenshot(id, mime, data)) {
      res.status(400).json({ error: 'invalid screenshot' });
      return;
    }
    res.status(201).json({ screenshotId: id });
  } catch (error) {
    res.status(error instanceof Error && error.message === 'body too large' ? 413 : 400)
      .json({ error: 'invalid screenshot' });
  }
}

function reviewerAuthorized(req: Request, res: Response): boolean {
  const expected = process.env.PP_REVIEWER_TOKEN;
  if (!expected) {
    res.status(503).json({ error: 'review dashboard is not configured' });
    return false;
  }
  const authorization = req.headers.authorization ?? '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length
    || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    res.setHeader('www-authenticate', 'Bearer');
    res.status(401).json({ error: 'reviewer token required' });
    return false;
  }
  return true;
}

function handleReviewList(req: Request, res: Response): void {
  if (!reviewerAuthorized(req, res)) return;
  const category = String(req.query.category ?? '').toLowerCase();
  const status = String(req.query.status ?? '').toLowerCase();
  const build = String(req.query.build ?? '').toLowerCase().slice(0, 80);
  const id = String(req.query.id ?? '').toLowerCase().slice(0, 128);
  const records = feedbackStore.list().filter((record) => (
    (!category || record.submission.category === category as AlphaFeedbackCategory)
    && (!status || record.status === status as AlphaFeedbackStatus)
    && (!build || record.submission.context.clientBuild.toLowerCase().includes(build))
    && (!id || record.submission.id.toLowerCase().includes(id))
  ));
  res.setHeader('cache-control', 'private, no-store');
  res.json({ records });
}

async function handleReviewUpdate(req: Request, res: Response): Promise<void> {
  if (!reviewerAuthorized(req, res)) return;
  try {
    const parsed = JSON.parse(await readBody(req, 1200)) as { status?: unknown; note?: unknown };
    const status = typeof parsed.status === 'string' ? parsed.status : undefined;
    const note = typeof parsed.note === 'string' ? parsed.note : undefined;
    if ((status !== undefined && !ALPHA_FEEDBACK_STATUSES.includes(status as AlphaFeedbackStatus))
      || (status === undefined && !note?.trim())) {
      res.status(400).json({ error: 'invalid review update' });
      return;
    }
    const record = feedbackStore.review(String(req.params.id ?? ''), {
      ...(status ? { status: status as AlphaFeedbackStatus } : {}),
      ...(note ? { note } : {}),
    });
    if (!record) {
      res.status(404).json({ error: 'feedback not found' });
      return;
    }
    res.setHeader('cache-control', 'private, no-store');
    res.json({ record });
  } catch (error) {
    res.status(error instanceof Error && error.message === 'body too large' ? 413 : 400)
      .json({ error: 'invalid review update' });
  }
}

function handleReviewScreenshot(req: Request, res: Response): void {
  if (!reviewerAuthorized(req, res)) return;
  const id = String(req.params.id ?? '');
  const record = feedbackStore.get(id);
  const screenshot = record?.submission.screenshotId === id
    ? feedbackStore.readScreenshot(id)
    : null;
  if (!screenshot) {
    res.status(404).json({ error: 'screenshot not found' });
    return;
  }
  res.setHeader('cache-control', 'private, no-store');
  res.setHeader('content-security-policy', "default-src 'none'");
  res.setHeader('x-content-type-options', 'nosniff');
  res.type(screenshot.mime).send(screenshot.data);
}

function handleReviewExport(req: Request, res: Response): void {
  if (!reviewerAuthorized(req, res)) return;
  res.setHeader('cache-control', 'private, no-store');
  res.attachment(`pencil-and-paper-feedback-${new Date().toISOString().slice(0, 10)}.json`);
  res.type('application/json').send(JSON.stringify(feedbackStore.exportRedacted(), null, 2));
}

const gameServer = new Server({
  transport: new WebSocketTransport(),
  express: (app) => {
    app.use((req: Request, res: Response, next: NextFunction) => {
      withCors(req, res);
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });
    app.get('/health', (_req: Request, res: Response) => res.type('text').send('ok'));
    app.post('/account', (req: Request, res: Response) => {
      void handleCreateAccount(req, res);
    });
    app.post('/feedback', (req: Request, res: Response) => {
      void handleFeedback(req, res);
    });
    app.post('/feedback/screenshot/:id', (req: Request, res: Response) => {
      void handleFeedbackScreenshot(req, res);
    });
    app.get('/review/feedback', handleReviewList);
    app.get('/review/feedback/export', handleReviewExport);
    app.get('/review/feedback/screenshot/:id', handleReviewScreenshot);
    app.patch('/review/feedback/:id', (req: Request, res: Response) => {
      void handleReviewUpdate(req, res);
    });
  },
});

gameServer.define(DEFAULT_ROOM, PaperRoom).filterBy(['inviteCode']);
gameServer.onShutdown(() => accounts.flush());

await gameServer.listen(port);
console.log(`pencil-and-paper server listening on ws://localhost:${port}`);
console.log(
  `room "${DEFAULT_ROOM}" ready (max ${LIMITS.playersPerRoom}) — /health, POST /account, feedback + review API`,
);
