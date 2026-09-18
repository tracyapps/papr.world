import type { IncomingMessage } from 'node:http';
import type { Request, Response } from 'express';
import {
  sanitizeAccountCredentials,
  sanitizeClaimMail,
  sanitizeSoloMigrationSnapshot,
} from '../../shared/src/index';
import type {
  AccountInventory,
  AccountTech,
  MailItem,
  SoloMigrationReceipt,
  SoloMigrationSnapshot,
} from '../../shared/src/index';
import type { AccountStore } from './accounts';
import type { AccountTechStore } from './accountTech';
import type { MailStore } from './mail';
import type { SoloMigrationStore } from './soloMigration';
import { authenticateClerkUser, type AdminConfig } from './admin';
import {
  IdentityConflictError,
  type AccountHome,
  type DurableAccount,
  type PaprDatabase,
} from './database';

type IdentityDependencies = {
  accounts: Pick<AccountStore, 'verify' | 'getForClaim'>;
  database: Pick<PaprDatabase, 'homeForClerkUser' | 'claimClerkIdentity'> | null;
  mail: Pick<MailStore, 'inventory' | 'list' | 'listClaimed' | 'grant' | 'claim'>;
  migrations: Pick<SoloMigrationStore, 'receiptFor' | 'reserveOnce'>;
  tech: Pick<AccountTechStore, 'techFor' | 'grantPlans'>;
  clerk: Pick<AdminConfig, 'secretKey' | 'jwtKey' | 'authorizedParties'>;
};

export type AccountCarrySnapshot = {
  inventory: AccountInventory;
  tech: AccountTech;
  mailbox: MailItem[];
  claimedMailIds: string[];
  /** Null until this account has brought a local solo save home once. */
  soloMigration: SoloMigrationReceipt | null;
};

export function accountCarrySnapshot(
  mail: Pick<MailStore, 'inventory' | 'list' | 'listClaimed'>,
  migrations: Pick<SoloMigrationStore, 'receiptFor'>,
  tech: Pick<AccountTechStore, 'techFor'>,
  accountId: string,
): AccountCarrySnapshot {
  return {
    inventory: mail.inventory(accountId),
    tech: tech.techFor(accountId),
    mailbox: mail.list(accountId),
    claimedMailIds: mail.listClaimed(accountId),
    soloMigration: migrations.receiptFor(accountId),
  };
}

/**
 * Reserve-then-credit: see `SoloMigrationStore.reserveOnce`'s doc comment
 * for why the receipt is committed before a single unit is credited. This
 * function is the pure seam between that store and `MailStore.grant` — the
 * primitive already built for validated, one-time server-side crediting —
 * so it is unit-testable without an Express request in sight. Learned plans
 * credit through the same reserve gate into `AccountTechStore.grantPlans`,
 * which is itself a union, so even a grant replayed across a crash could
 * not double-count knowledge.
 */
export function importSoloSaveIntoAccount(
  deps: {
    migrations: Pick<SoloMigrationStore, 'reserveOnce'>;
    mail: Pick<MailStore, 'grant' | 'inventory'>;
    tech: Pick<AccountTechStore, 'grantPlans' | 'techFor'>;
  },
  accountId: string,
  snapshot: SoloMigrationSnapshot,
  now = Date.now(),
): {
  receipt: SoloMigrationReceipt;
  alreadyMigrated: boolean;
  inventory: AccountInventory;
  tech: AccountTech;
} {
  const outcome = deps.migrations.reserveOnce(accountId, { ...snapshot, at: now });
  if (outcome.reserved) {
    const { receipt } = outcome;
    if (receipt.chips > 0) deps.mail.grant(accountId, { kind: 'chips', quantity: receipt.chips });
    for (const [resource, quantity] of Object.entries(receipt.resources)) {
      deps.mail.grant(accountId, { kind: 'resource', itemId: resource, quantity });
    }
    for (const [tool, quantity] of Object.entries(receipt.tools)) {
      deps.mail.grant(accountId, { kind: 'tool', itemId: tool, quantity });
    }
    for (const [item, quantity] of Object.entries(receipt.items)) {
      deps.mail.grant(accountId, { kind: 'item', itemId: item, quantity });
    }
    if (receipt.plans.length > 0) deps.tech.grantPlans(accountId, receipt.plans);
  }
  return {
    receipt: outcome.receipt,
    alreadyMigrated: !outcome.reserved,
    inventory: deps.mail.inventory(accountId),
    tech: deps.tech.techFor(accountId),
  };
}

export class InvalidPassportError extends Error {
  constructor() {
    super('that paper passport could not be verified');
    this.name = 'InvalidPassportError';
  }
}

/** Shared by the account identity routes and the avatar design routes. */
export async function readBody(req: IncomingMessage, maxBytes = 2048): Promise<string> {
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
        const home = await deps.database.homeForClerkUser(clerkUserId);
        res.setHeader('cache-control', 'private, no-store');
        res.json({
          claimed: Boolean(home),
          account: home?.account ?? null,
          worlds: home?.worlds ?? [],
          ...(home ? accountCarrySnapshot(deps.mail, deps.migrations, deps.tech, home.account.id) : {}),
        });
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
        const home: AccountHome = await deps.database.homeForClerkUser(clerkUserId)
          ?? { account, worlds: [] };
        res.setHeader('cache-control', 'private, no-store');
        res.status(201).json({
          claimed: true,
          account: home.account,
          worlds: home.worlds,
          ...accountCarrySnapshot(deps.mail, deps.migrations, deps.tech, home.account.id),
        });
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

    /**
     * POST /account/import-solo-save — the one-time bridge from an unsynced
     * local save into the server-owned pouch (`docs/accounts-worlds-and-social.md`,
     * "Migration from today's prototype"). Requires a claimed account: there
     * is nothing to attach an import to before that. Idempotent per account
     * — a retry, a second tab, or a second device all land on the same
     * `alreadyMigrated: true` receipt rather than crediting twice.
     */
    async importSoloSave(req: Request, res: Response): Promise<void> {
      const clerkUserId = await authenticateClerkUser(req, res, deps.clerk);
      if (!clerkUserId) return;
      if (!deps.database) {
        res.status(503).json({ error: 'durable accounts are not configured yet' });
        return;
      }

      try {
        const home = await deps.database.homeForClerkUser(clerkUserId);
        if (!home) {
          res.status(409).json({ error: 'claim your paper passport before bringing in a solo save' });
          return;
        }
        const snapshot = sanitizeSoloMigrationSnapshot(JSON.parse(await readBody(req, 8192)));
        if (!snapshot) {
          res.status(400).json({ error: 'that solo save could not be read' });
          return;
        }
        const result = importSoloSaveIntoAccount(deps, home.account.id, snapshot);
        res.setHeader('cache-control', 'private, no-store');
        res.json({ ok: true, ...result });
      } catch (error) {
        if (error instanceof SyntaxError || (error instanceof Error && error.message === 'body too large')) {
          res.status(400).json({ error: 'invalid request' });
          return;
        }
        console.error('[account] solo-save import failed:', error instanceof Error ? error.name : 'unknown');
        res.status(502).json({ error: 'the account service could not complete the import' });
      }
    },

    /**
     * POST /account/claim-mail — collect one waiting parcel into the
     * account pouch from the desk, without entering a world. This is the
     * same `MailStore.claim` the Colyseus room funnels through, so the two
     * paths share one exactly-once claimed-id record: a parcel collected
     * here shows as collected in-world, and vice versa. The in-world
     * mailbox stays a warm ritual; it stops being the only door.
     */
    async claimMail(req: Request, res: Response): Promise<void> {
      const clerkUserId = await authenticateClerkUser(req, res, deps.clerk);
      if (!clerkUserId) return;
      if (!deps.database) {
        res.status(503).json({ error: 'durable accounts are not configured yet' });
        return;
      }

      try {
        const home = await deps.database.homeForClerkUser(clerkUserId);
        if (!home) {
          res.status(409).json({ error: 'claim your paper passport before collecting parcels' });
          return;
        }
        const intent = sanitizeClaimMail(JSON.parse(await readBody(req)));
        if (!intent) {
          res.status(400).json({ error: 'that parcel could not be identified' });
          return;
        }
        const inventory = deps.mail.claim(home.account.id, intent.mailId);
        if (!inventory) {
          res.status(409).json({ error: 'that parcel was already collected or is no longer there' });
          return;
        }
        res.setHeader('cache-control', 'private, no-store');
        res.json({ ok: true, inventory, claimedMailIds: deps.mail.listClaimed(home.account.id) });
      } catch (error) {
        if (error instanceof SyntaxError || (error instanceof Error && error.message === 'body too large')) {
          res.status(400).json({ error: 'invalid request' });
          return;
        }
        console.error('[account] parcel claim failed:', error instanceof Error ? error.name : 'unknown');
        res.status(502).json({ error: 'the account service could not collect that parcel' });
      }
    },
  };
}
