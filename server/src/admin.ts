import type { IncomingMessage } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { createClerkClient, verifyToken } from '@clerk/backend';
import type { Request, Response } from 'express';

export type AdminConfig = {
  secretKey: string;
  jwtKey: string;
  authorizedParties: string[];
  adminUserIds: Set<string>;
  invitationRedirectUrl: string;
};

type AdminStatusInput = {
  accountCount: () => number;
  corsOrigin: string;
  dataDir: string;
  databaseConfigured?: boolean;
  inviteLinks?: {
    createSignupInviteLink: (tokenHash: string, createdBy: string, expiresAt: Date) => Promise<void>;
    reserveSignupInviteLink: (tokenHash: string, emailAddress: string) => Promise<boolean>;
    completeSignupInviteLink: (
      tokenHash: string,
      emailAddress: string,
      clerkInvitationId: string,
    ) => Promise<void>;
    releaseSignupInviteLink: (tokenHash: string, emailAddress: string) => Promise<void>;
  };
};

function csv(value: string | undefined): string[] {
  return (value ?? '').split(',').map((part) => part.trim()).filter(Boolean);
}

export function readAdminConfig(env: NodeJS.ProcessEnv = process.env): AdminConfig {
  return {
    secretKey: env.CLERK_SECRET_KEY?.trim() ?? '',
    jwtKey: env.CLERK_JWT_KEY?.replace(/\\n/g, '\n').trim() ?? '',
    authorizedParties: csv(env.CLERK_AUTHORIZED_PARTIES),
    adminUserIds: new Set(csv(env.PP_ADMIN_CLERK_USER_IDS)),
    invitationRedirectUrl: env.PP_CLERK_INVITATION_REDIRECT_URL?.trim()
      || 'https://papr.world/account/',
  };
}

export function validInviteEmail(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export type InvitationDelivery = 'email' | 'link';

export function normalizeInvitationInput(input: unknown): {
  emailAddress: string;
  delivery: InvitationDelivery;
} | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as { emailAddress?: unknown; delivery?: unknown };
  const emailAddress = typeof value.emailAddress === 'string'
    ? value.emailAddress.trim().toLowerCase()
    : value.emailAddress;
  if (!validInviteEmail(emailAddress)) return null;
  const delivery = value.delivery === undefined ? 'email' : value.delivery;
  if (delivery !== 'email' && delivery !== 'link') return null;
  return { emailAddress, delivery };
}

export function validInviteToken(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createInviteToken(): string {
  return randomBytes(24).toString('base64url');
}

export function buildAdminStatus(config: AdminConfig, input: AdminStatusInput) {
  return {
    ok: true,
    serverTime: new Date().toISOString(),
    services: {
      gameServer: { state: 'online' as const, detail: 'HTTP and realtime process responding' },
      persistence: {
        state: 'online' as const,
        detail: `Filesystem persistence is writable (${input.dataDir})`,
      },
      clerk: {
        state: config.secretKey || config.jwtKey ? 'configured' as const : 'setup-needed' as const,
        detail: config.secretKey
          ? 'Session verification and invitations are available'
          : config.jwtKey
            ? 'Session verification is available; invitations need CLERK_SECRET_KEY'
            : 'Add Clerk server credentials on Railway',
      },
      durableDatabase: {
        state: input.databaseConfigured ? 'configured' as const : 'setup-needed' as const,
        detail: input.databaseConfigured
          ? 'Postgres schema is ready for managed accounts and worlds'
          : 'Add DATABASE_URL on Railway to enable managed accounts',
      },
    },
    counts: { paperPassports: input.accountCount() },
    controls: {
      invitations: Boolean(config.secretKey),
      adminAllowlist: config.adminUserIds.size > 0,
      corsPinned: input.corsOrigin !== '*',
    },
  };
}

async function readBody(req: IncomingMessage, maxBytes = 4096): Promise<string> {
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

export async function authenticateClerkUser(
  req: Request,
  res: Response,
  config: Pick<AdminConfig, 'secretKey' | 'jwtKey' | 'authorizedParties'>,
): Promise<string | null> {
  if (!config.secretKey && !config.jwtKey) {
    res.status(503).json({ error: 'account authentication is not configured' });
    return null;
  }

  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.setHeader('www-authenticate', 'Bearer');
    res.status(401).json({ error: 'sign in is required' });
    return null;
  }

  try {
    return await verifyClerkSessionToken(token, config);
  } catch {
    res.setHeader('www-authenticate', 'Bearer');
    res.status(401).json({ error: 'the Clerk session could not be verified' });
    return null;
  }
}

/** Verify a Clerk token at non-HTTP trust boundaries such as room matchmaking. */
export async function verifyClerkSessionToken(
  token: string,
  config: Pick<AdminConfig, 'secretKey' | 'jwtKey' | 'authorizedParties'>,
): Promise<string> {
  if (!config.secretKey && !config.jwtKey) throw new Error('clerk-not-configured');
  if (!token) throw new Error('missing-clerk-token');
  const payload = await verifyToken(token, {
      ...(config.secretKey ? { secretKey: config.secretKey } : {}),
      ...(config.jwtKey ? { jwtKey: config.jwtKey } : {}),
      ...(config.authorizedParties.length > 0
        ? { authorizedParties: config.authorizedParties }
        : {}),
  });
  return payload.sub;
}

async function authorizeAdmin(
  req: Request,
  res: Response,
  config: AdminConfig,
): Promise<string | null> {
  if (config.adminUserIds.size === 0) {
    res.status(503).json({ error: 'admin authentication is not configured' });
    return null;
  }
  const userId = await authenticateClerkUser(req, res, config);
  if (!userId) return null;
  if (!config.adminUserIds.has(userId)) {
    res.status(403).json({ error: 'this account is not a papr.world administrator' });
    return null;
  }
  return userId;
}

export function createAdminHandlers(input: AdminStatusInput, config = readAdminConfig()) {
  const clerk = config.secretKey ? createClerkClient({ secretKey: config.secretKey }) : null;

  return {
    async status(req: Request, res: Response): Promise<void> {
      if (!await authorizeAdmin(req, res, config)) return;
      res.setHeader('cache-control', 'private, no-store');
      res.json(buildAdminStatus(config, input));
    },

    async invite(req: Request, res: Response): Promise<void> {
      if (!await authorizeAdmin(req, res, config)) return;
      if (!clerk) {
        res.status(503).json({ error: 'Clerk invitations are not configured' });
        return;
      }

      try {
        const input = normalizeInvitationInput(JSON.parse(await readBody(req)));
        if (!input) {
          res.status(400).json({ error: 'enter a valid email address' });
          return;
        }

        const invitation = await clerk.invitations.createInvitation({
          emailAddress: input.emailAddress,
          redirectUrl: config.invitationRedirectUrl,
          expiresInDays: 30,
          notify: input.delivery === 'email',
        });
        res.setHeader('cache-control', 'private, no-store');
        res.status(201).json({
          invitation: {
            id: invitation.id,
            status: invitation.status,
            createdAt: invitation.createdAt,
            ...(input.delivery === 'link' ? { url: invitation.url ?? null } : {}),
          },
        });
      } catch (error) {
        // Clerk errors can contain the submitted address. Keep PII out of
        // Railway logs while still leaving a useful failure category.
        console.error(
          '[admin] Clerk invitation failed:',
          error instanceof Error ? error.name : 'unknown error',
        );
        res.status(error instanceof SyntaxError ? 400 : 502).json({
          error: error instanceof SyntaxError
            ? 'invalid request'
            : 'Clerk could not create that invitation; it may already exist',
        });
      }
    },

    async createInviteLink(req: Request, res: Response): Promise<void> {
      const adminUserId = await authorizeAdmin(req, res, config);
      if (!adminUserId) return;
      if (!clerk || !input.inviteLinks) {
        res.status(503).json({ error: 'durable signup links are not configured' });
        return;
      }

      try {
        const token = createInviteToken();
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await input.inviteLinks.createSignupInviteLink(
          hashInviteToken(token),
          adminUserId,
          expiresAt,
        );
        const siteOrigin = new URL(config.invitationRedirectUrl).origin;
        res.setHeader('cache-control', 'private, no-store');
        res.status(201).json({
          inviteLink: {
            url: `${siteOrigin}/invite/?token=${encodeURIComponent(token)}`,
            expiresAt: expiresAt.toISOString(),
            uses: 1,
          },
        });
      } catch (error) {
        console.error('[admin] signup link creation failed:', error instanceof Error ? error.name : 'unknown error');
        res.status(502).json({ error: 'the private signup link could not be created' });
      }
    },

    async redeemInviteLink(req: Request, res: Response): Promise<void> {
      if (!clerk || !input.inviteLinks) {
        res.status(503).json({ error: 'private signup links are not configured' });
        return;
      }

      let token: unknown;
      let emailAddress: unknown;
      try {
        ({ token, emailAddress } = JSON.parse(await readBody(req)) as {
          token?: unknown;
          emailAddress?: unknown;
        });
      } catch {
        res.status(400).json({ error: 'invalid request' });
        return;
      }
      const email = typeof emailAddress === 'string' ? emailAddress.trim().toLowerCase() : emailAddress;
      if (!validInviteToken(token) || !validInviteEmail(email)) {
        res.status(400).json({ error: 'enter a valid email address and invitation link' });
        return;
      }

      const tokenHash = hashInviteToken(token);
      try {
        if (!await input.inviteLinks.reserveSignupInviteLink(tokenHash, email)) {
          res.status(410).json({ error: 'this invitation link has expired or has already been used' });
          return;
        }
      } catch (error) {
        console.error('[invite] signup link reservation failed:', error instanceof Error ? error.name : 'unknown error');
        res.status(502).json({ error: 'the invitation service could not be reached' });
        return;
      }

      let invitation;
      try {
        invitation = await clerk.invitations.createInvitation({
          emailAddress: email,
          redirectUrl: config.invitationRedirectUrl,
          expiresInDays: 30,
          notify: true,
        });
      } catch (error) {
        await input.inviteLinks.releaseSignupInviteLink(tokenHash, email).catch(() => undefined);
        console.error('[invite] Clerk invitation failed:', error instanceof Error ? error.name : 'unknown error');
        res.status(502).json({ error: 'Clerk could not create that invitation; the address may already be invited' });
        return;
      }

      try {
        await input.inviteLinks.completeSignupInviteLink(tokenHash, email, invitation.id);
      } catch (error) {
        // The link remains reserved, and Clerk also emails a recovery copy.
        console.error('[invite] signup link completion recording failed:', error instanceof Error ? error.name : 'unknown error');
      }
      res.setHeader('cache-control', 'private, no-store');
      res.status(201).json({
        invitation: { url: invitation.url ?? null },
        fallback: invitation.url ? null : 'email',
      });
    },
  };
}
