import type { IncomingMessage } from 'node:http';
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
      || 'https://papr.world/',
  };
}

export function validInviteEmail(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
        state: 'planned' as const,
        detail: 'Neon/Postgres is the next persistence migration',
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

async function authorizeAdmin(
  req: Request,
  res: Response,
  config: AdminConfig,
): Promise<string | null> {
  if ((!config.secretKey && !config.jwtKey) || config.adminUserIds.size === 0) {
    res.status(503).json({ error: 'admin authentication is not configured' });
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
    const payload = await verifyToken(token, {
      ...(config.secretKey ? { secretKey: config.secretKey } : {}),
      ...(config.jwtKey ? { jwtKey: config.jwtKey } : {}),
      ...(config.authorizedParties.length > 0
        ? { authorizedParties: config.authorizedParties }
        : {}),
    });
    if (!config.adminUserIds.has(payload.sub)) {
      res.status(403).json({ error: 'this account is not a papr.world administrator' });
      return null;
    }
    return payload.sub;
  } catch {
    res.setHeader('www-authenticate', 'Bearer');
    res.status(401).json({ error: 'the Clerk session could not be verified' });
    return null;
  }
}

export function createAdminHandlers(input: AdminStatusInput) {
  const config = readAdminConfig();
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
        const parsed = JSON.parse(await readBody(req)) as { emailAddress?: unknown };
        const emailAddress = typeof parsed.emailAddress === 'string'
          ? parsed.emailAddress.trim().toLowerCase()
          : parsed.emailAddress;
        if (!validInviteEmail(emailAddress)) {
          res.status(400).json({ error: 'enter a valid email address' });
          return;
        }

        const invitation = await clerk.invitations.createInvitation({
          emailAddress,
          redirectUrl: config.invitationRedirectUrl,
          expiresInDays: 30,
          notify: true,
        });
        res.setHeader('cache-control', 'private, no-store');
        res.status(201).json({
          invitation: {
            id: invitation.id,
            status: invitation.status,
            createdAt: invitation.createdAt,
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
  };
}
