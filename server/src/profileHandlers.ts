// HTTP routes for an account's OWN profile — the desk half of
// docs/accounts-worlds-and-social.md's "Names and profiles".
//
// The audience here is the owner, never a viewer. A viewer is served the
// filtered subset through the player card in PaperRoom, where the relationship
// and the block rules live; these two routes only read and write the account's
// own stored profile, so they are Clerk-authenticated and claimed-account-gated
// exactly like every other `/account/*` route in this tree.
//
// Nothing here puts a profile in Colyseus room state: the room consumes the
// stored profile to answer a card, it does not own it.

import type { Request, Response } from 'express';
import { sanitizeProfileUpdate } from '../../shared/src/index';
import { authenticateClerkUser, type AdminConfig } from './admin';
import { readBody } from './accountIdentity';
import type { ProfileStore } from './profiles';
import type { PaprDatabase } from './database';

type ProfileDependencies = {
  database: Pick<PaprDatabase, 'homeForClerkUser'> | null;
  profiles: ProfileStore;
  clerk: Pick<AdminConfig, 'secretKey' | 'jwtKey' | 'authorizedParties'>;
};

/**
 * A profile update is a bio (280 chars), up to six short links and two
 * audience strings — a few hundred bytes. 8 KB clears any honest payload with
 * room to spare and cuts a hostile one off before it is parsed.
 */
const PROFILE_BODY_MAX_BYTES = 8192;

export function createProfileHandlers(deps: ProfileDependencies) {
  return {
    /** GET /account/profile — the caller's own profile. */
    async get(req: Request, res: Response): Promise<void> {
      const clerkUserId = await authenticateClerkUser(req, res, deps.clerk);
      if (!clerkUserId) return;
      if (!deps.database) {
        res.status(503).json({ error: 'durable accounts are not configured yet' });
        return;
      }
      try {
        const home = await deps.database.homeForClerkUser(clerkUserId);
        if (!home) {
          res.status(409).json({ error: 'claim your paper passport before writing your profile' });
          return;
        }
        res.setHeader('cache-control', 'private, no-store');
        res.json({ profile: deps.profiles.profileFor(home.account.id) });
      } catch (error) {
        console.error('[profile] read failed:', error instanceof Error ? error.name : 'unknown');
        res.status(502).json({ error: 'the account service could not open your profile' });
      }
    },

    /**
     * POST /account/profile — merge a partial update into the caller's own
     * profile and return the whole stored result. The client sends only the
     * fields it changed; a present-but-invalid field refuses the whole patch
     * (400) rather than being quietly ignored.
     */
    async update(req: Request, res: Response): Promise<void> {
      const clerkUserId = await authenticateClerkUser(req, res, deps.clerk);
      if (!clerkUserId) return;
      if (!deps.database) {
        res.status(503).json({ error: 'durable accounts are not configured yet' });
        return;
      }
      try {
        const home = await deps.database.homeForClerkUser(clerkUserId);
        if (!home) {
          res.status(409).json({ error: 'claim your paper passport before saving your profile' });
          return;
        }
        const update = sanitizeProfileUpdate(JSON.parse(await readBody(req, PROFILE_BODY_MAX_BYTES)));
        if (!update) {
          res.status(400).json({ error: 'that profile could not be read' });
          return;
        }
        const profile = deps.profiles.update(home.account.id, home.account.displayName, update);
        res.setHeader('cache-control', 'private, no-store');
        res.json({ profile });
      } catch (error) {
        if (error instanceof SyntaxError || (error instanceof Error && error.message === 'body too large')) {
          res.status(400).json({ error: 'invalid request' });
          return;
        }
        console.error('[profile] save failed:', error instanceof Error ? error.name : 'unknown');
        res.status(502).json({ error: 'the account service could not save your profile' });
      }
    },
  };
}
