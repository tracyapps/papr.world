// HTTP routes for the account-owned wardrobe — avatar Phase D's transport
// half (docs/avatar-and-identity.md §7 D).
//
// Two audiences, deliberately split:
//   * the `/account/designs*` routes are the owner's: authenticated through
//     Clerk, claimed-account-gated like every other account route;
//   * `GET /avatar-designs/:id` is the remote-rendering read for OTHER
//     players' clients. It is public by design — the worn avatar is the one
//     thing others always see — and unauthenticated because the observing
//     client has no session of its own to present. Design ids are unguessable
//     UUIDs, and the room only broadcasts a key it resolved against the
//     owning account, so an id reaching this route has already been "worn"
//     in front of the fetcher.
//
// Nothing here puts designs in Colyseus room state: rooms consume the
// resolved drawingKey, they do not own the art.

import type { IncomingMessage } from 'node:http';
import type { Request, Response } from 'express';
import { sanitizeAvatarDesign } from '../../shared/src/index';
import { authenticateClerkUser, type AdminConfig } from './admin';
import { readBody } from './accountIdentity';
import type { AvatarDesignStore } from './avatarDesigns';
import type { PaprDatabase } from './database';

type DesignDependencies = {
  database: Pick<PaprDatabase, 'homeForClerkUser'> | null;
  designs: AvatarDesignStore;
  clerk: Pick<AdminConfig, 'secretKey' | 'jwtKey' | 'authorizedParties'>;
};

/**
 * A wardrobe import is bounded by what any client could legitimately hold:
 * wardrobeMax designs, each already capped at maxBytes by the sanitizer. The
 * raw body allowance is that product plus JSON overhead, so a hostile payload
 * is cut off before it is parsed rather than after.
 */
const IMPORT_BODY_MAX_BYTES = 3 * 1_048_576;

function isDesignId(value: string): boolean {
  return /^[A-Za-z0-9-]{1,64}$/.test(value);
}

/** Express route params may arrive as arrays; the route only ever names one. */
function paramId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

export function createAvatarDesignHandlers(deps: DesignDependencies) {
  return {
    /** GET /account/designs — the owner's library and import receipt. */
    async list(req: Request, res: Response): Promise<void> {
      const clerkUserId = await authenticateClerkUser(req, res, deps.clerk);
      if (!clerkUserId) return;
      if (!deps.database) {
        res.status(503).json({ error: 'durable accounts are not configured yet' });
        return;
      }
      try {
        const home = await deps.database.homeForClerkUser(clerkUserId);
        if (!home) {
          res.status(409).json({ error: 'claim your paper passport before opening your wardrobe' });
          return;
        }
        res.setHeader('cache-control', 'private, no-store');
        res.json({
          designs: deps.designs.listFor(home.account.id),
          import: deps.designs.importReceiptFor(home.account.id),
        });
      } catch (error) {
        console.error('[avatar] design list failed:', error instanceof Error ? error.name : 'unknown');
        res.status(502).json({ error: 'the account service could not open the wardrobe' });
      }
    },

    /** PUT /account/designs — save one design (validated, capped, owned). */
    async save(req: Request, res: Response): Promise<void> {
      const clerkUserId = await authenticateClerkUser(req, res, deps.clerk);
      if (!clerkUserId) return;
      if (!deps.database) {
        res.status(503).json({ error: 'durable accounts are not configured yet' });
        return;
      }
      try {
        const home = await deps.database.homeForClerkUser(clerkUserId);
        if (!home) {
          res.status(409).json({ error: 'claim your paper passport before saving a look' });
          return;
        }
        const design = sanitizeAvatarDesign(JSON.parse(await readBody(req, 256 * 1024)));
        if (!design) {
          res.status(400).json({ error: 'that look could not be read' });
          return;
        }
        if (!deps.designs.saveDesign(home.account.id, design)) {
          res.status(409).json({ error: 'your account wardrobe is full — delete a look first' });
          return;
        }
        res.setHeader('cache-control', 'private, no-store');
        res.json({ ok: true, design });
      } catch (error) {
        if (error instanceof SyntaxError || (error instanceof Error && error.message === 'body too large')) {
          res.status(400).json({ error: 'invalid request' });
          return;
        }
        console.error('[avatar] design save failed:', error instanceof Error ? error.name : 'unknown');
        res.status(502).json({ error: 'the account service could not save that look' });
      }
    },

    /** DELETE /account/designs/:id — remove one of the owner's designs. */
    async remove(req: Request, res: Response): Promise<void> {
      const clerkUserId = await authenticateClerkUser(req, res, deps.clerk);
      if (!clerkUserId) return;
      if (!deps.database) {
        res.status(503).json({ error: 'durable accounts are not configured yet' });
        return;
      }
      try {
        const home = await deps.database.homeForClerkUser(clerkUserId);
        if (!home) {
          res.status(409).json({ error: 'claim your paper passport before changing your wardrobe' });
          return;
        }
        const id = paramId(req);
        if (!isDesignId(id) || !deps.designs.deleteDesign(home.account.id, id)) {
          res.status(404).json({ error: 'that look is not in your wardrobe' });
          return;
        }
        res.setHeader('cache-control', 'private, no-store');
        res.json({ ok: true });
      } catch (error) {
        console.error('[avatar] design delete failed:', error instanceof Error ? error.name : 'unknown');
        res.status(502).json({ error: 'the account service could not delete that look' });
      }
    },

    /**
     * POST /account/import-wardrobe — the one-time, explicit device → account
     * wardrobe import (§6.3: same split-brain rule as solo saves). A second
     * attempt returns the original receipt and stores nothing.
     */
    async importWardrobe(req: Request, res: Response): Promise<void> {
      const clerkUserId = await authenticateClerkUser(req, res, deps.clerk);
      if (!clerkUserId) return;
      if (!deps.database) {
        res.status(503).json({ error: 'durable accounts are not configured yet' });
        return;
      }
      try {
        const home = await deps.database.homeForClerkUser(clerkUserId);
        if (!home) {
          res.status(409).json({ error: 'claim your paper passport before bringing your wardrobe home' });
          return;
        }
        const body = JSON.parse(await readBody(req, IMPORT_BODY_MAX_BYTES)) as { designs?: unknown };
        if (!Array.isArray(body.designs)) {
          res.status(400).json({ error: 'that wardrobe could not be read' });
          return;
        }
        const result = deps.designs.importWardrobe(home.account.id, body.designs);
        res.setHeader('cache-control', 'private, no-store');
        res.json({ ok: true, ...result });
      } catch (error) {
        if (error instanceof SyntaxError || (error instanceof Error && error.message === 'body too large')) {
          res.status(400).json({ error: 'invalid request' });
          return;
        }
        console.error('[avatar] wardrobe import failed:', error instanceof Error ? error.name : 'unknown');
        res.status(502).json({ error: 'the account service could not bring that wardrobe home' });
      }
    },

    /**
     * GET /avatar-designs/:id — the remote-rendering read. Public, id-shaped,
     * and answered straight from the store: `{ design }` or 404 with nothing
     * leaked about whose wardrobe it came from.
     */
    async fetchById(req: Request, res: Response): Promise<void> {
      const id = paramId(req);
      const design = isDesignId(id) ? deps.designs.findDesign(id) : null;
      if (!design) {
        res.status(404).json({ error: 'no such look' });
        return;
      }
      // A design saved under an existing id can change; keep remote renderers
      // from pinning stale art, and let them cache in memory instead.
      res.setHeader('cache-control', 'no-store');
      res.json({ design });
    },
  };
}
