import type { IncomingMessage } from 'node:http';
import type { Request, Response } from 'express';
import { sanitizeAccountCredentials } from '../../shared/src/index';
import type { AccountStore } from './accounts';
import { authenticateClerkUser, type AdminConfig } from './admin';
import {
  IdentityConflictError,
  type DurableAccount,
  type PaprDatabase,
} from './database';

type IdentityDependencies = {
  accounts: Pick<AccountStore, 'verify' | 'getForClaim'>;
  database: Pick<PaprDatabase, 'accountForClerkUser' | 'claimClerkIdentity'> | null;
  clerk: Pick<AdminConfig, 'secretKey' | 'jwtKey' | 'authorizedParties'>;
};

export class InvalidPassportError extends Error {
  constructor() {
    super('that paper passport could not be verified');
    this.name = 'InvalidPassportError';
  }
}

async function readBody(req: IncomingMessage, maxBytes = 2048): Promise<string> {
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

export function durableAccountFromPassport(record: {
  id: string;
  lastName: string;
  createdAt: number;
  lastSeenAt: number;
}): DurableAccount {
  return {
    id: record.id,
    displayName: record.lastName,
    createdAt: record.createdAt,
    lastSeenAt: record.lastSeenAt,
  };
}

export async function claimPaperPassport(
  accounts: Pick<AccountStore, 'verify' | 'getForClaim'>,
  database: Pick<PaprDatabase, 'claimClerkIdentity'>,
  clerkUserId: string,
  input: unknown,
): Promise<DurableAccount> {
  const credentials = sanitizeAccountCredentials(input);
  if (!credentials || !accounts.verify(credentials.id, credentials.secret)) {
    throw new InvalidPassportError();
  }
  const record = accounts.getForClaim(credentials.id);
  if (!record) throw new InvalidPassportError();
  const account = durableAccountFromPassport(record);
  await database.claimClerkIdentity(clerkUserId, account);
  return account;
}

export function createAccountIdentityHandlers(deps: IdentityDependencies) {
  return {
    async me(req: Request, res: Response): Promise<void> {
      const clerkUserId = await authenticateClerkUser(req, res, deps.clerk);
      if (!clerkUserId) return;
      if (!deps.database) {
        res.status(503).json({ error: 'durable accounts are not configured yet' });
        return;
      }
      try {
        const account = await deps.database.accountForClerkUser(clerkUserId);
        res.setHeader('cache-control', 'private, no-store');
        res.json({ claimed: Boolean(account), account });
      } catch (error) {
        console.error('[account] managed-identity lookup failed:', error instanceof Error ? error.name : 'unknown');
        res.status(502).json({ error: 'the durable account service could not be reached' });
      }
    },

    async claim(req: Request, res: Response): Promise<void> {
      const clerkUserId = await authenticateClerkUser(req, res, deps.clerk);
      if (!clerkUserId) return;
      if (!deps.database) {
        res.status(503).json({ error: 'durable accounts are not configured yet' });
        return;
      }

      try {
        const account = await claimPaperPassport(
          deps.accounts,
          deps.database,
          clerkUserId,
          JSON.parse(await readBody(req)),
        );
        res.setHeader('cache-control', 'private, no-store');
        res.status(201).json({ claimed: true, account });
      } catch (error) {
        if (error instanceof InvalidPassportError) {
          res.status(401).json({ error: error.message });
          return;
        }
        if (error instanceof IdentityConflictError) {
          res.status(409).json({ error: error.message });
          return;
        }
        if (error instanceof SyntaxError || (error instanceof Error && error.message === 'body too large')) {
          res.status(400).json({ error: 'invalid request' });
          return;
        }
        console.error('[account] managed-identity claim failed:', error instanceof Error ? error.name : 'unknown');
        res.status(502).json({ error: 'the durable account service could not complete the claim' });
      }
    },
  };
}
