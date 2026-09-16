import { Pool, type PoolClient } from 'pg';

export type DurableAccount = {
  id: string;
  displayName: string;
  createdAt: number;
  lastSeenAt: number;
};

export type WorldMembership = {
  id: string;
  slug: string;
  name: string;
  kind: 'solo' | 'shared' | 'custom';
  role: 'owner' | 'admin' | 'member' | 'visitor' | 'viewer';
  capabilities: string[];
};

export type AccountHome = { account: DurableAccount; worlds: WorldMembership[] };
export type WorldEntry = WorldMembership & { accountId: string };

export function defaultWorldSpecifications(account: Pick<DurableAccount, 'id' | 'displayName'>) {
  return {
    solo: {
      slug: `solo-${account.id}`,
      name: `${account.displayName}'s solo world`,
      role: 'owner' as const,
      capabilities: ['enter', 'build', 'invite', 'claim_home'],
    },
    shared: {
      slug: 'shared',
      name: 'Shared world',
      role: 'member' as const,
      capabilities: ['enter', 'build', 'claim_home'],
    },
  };
}

export class IdentityConflictError extends Error {
  constructor() {
    super('that sign-in or paper passport is already linked to another account');
    this.name = 'IdentityConflictError';
  }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS player_accounts (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL,
    last_seen_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS account_identities (
    provider text NOT NULL,
    provider_subject text NOT NULL,
    account_id uuid NOT NULL UNIQUE REFERENCES player_accounts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, provider_subject)
  )`,
  `CREATE TABLE IF NOT EXISTS player_profiles (
    account_id uuid PRIMARY KEY REFERENCES player_accounts(id) ON DELETE CASCADE,
    handle text,
    display_name text NOT NULL,
    bio text NOT NULL DEFAULT '',
    social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
    privacy jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT player_profiles_handle_format CHECK (
      handle IS NULL OR handle ~ '^[a-z0-9_]{3,24}$'
    )
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS player_profiles_handle_key
    ON player_profiles (lower(handle)) WHERE handle IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS worlds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('solo', 'shared', 'custom')),
    owner_account_id uuid REFERENCES player_accounts(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS worlds_slug_key ON worlds (lower(slug))`,
  `CREATE TABLE IF NOT EXISTS world_memberships (
    world_id uuid NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
    account_id uuid NOT NULL REFERENCES player_accounts(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'visitor', 'viewer')),
    capabilities text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (world_id, account_id)
  )`,
  `CREATE TABLE IF NOT EXISTS signup_invite_links (
    token_hash text PRIMARY KEY,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    claimed_at timestamptz,
    claimed_email text,
    clerk_invitation_id text
  )`,
  `INSERT INTO worlds (slug, name, kind)
    VALUES ('shared', 'Shared world', 'shared')
    ON CONFLICT (lower(slug)) DO NOTHING`,
  `INSERT INTO worlds (slug, name, kind, owner_account_id)
    SELECT 'solo-' || a.id::text, p.display_name || '''s solo world', 'solo', a.id
    FROM player_accounts a JOIN player_profiles p ON p.account_id = a.id
    ON CONFLICT (lower(slug)) DO NOTHING`,
  `INSERT INTO world_memberships (world_id, account_id, role, capabilities)
    SELECT w.id, a.id, 'owner', ARRAY['enter', 'build', 'invite', 'claim_home']
    FROM player_accounts a JOIN worlds w ON w.slug = 'solo-' || a.id::text
    ON CONFLICT (world_id, account_id) DO NOTHING`,
  `INSERT INTO world_memberships (world_id, account_id, role, capabilities)
    SELECT w.id, a.id, 'member', ARRAY['enter', 'build', 'claim_home']
    FROM player_accounts a CROSS JOIN worlds w WHERE lower(w.slug) = 'shared'
    ON CONFLICT (world_id, account_id) DO NOTHING`,
];

export class PaprDatabase {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000 });
  }

  async migrate(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const statement of SCHEMA) await client.query(statement);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async health(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async accountForClerkUser(clerkUserId: string): Promise<DurableAccount | null> {
    const result = await this.pool.query<{
      id: string;
      display_name: string;
      created_at: Date;
      last_seen_at: Date;
    }>(
      `SELECT a.id, p.display_name, a.created_at, a.last_seen_at
       FROM account_identities i
       JOIN player_accounts a ON a.id = i.account_id
       JOIN player_profiles p ON p.account_id = a.id
       WHERE i.provider = 'clerk' AND i.provider_subject = $1`,
      [clerkUserId],
    );
    const row = result.rows[0];
    return row ? {
      id: row.id,
      displayName: row.display_name,
      createdAt: row.created_at.getTime(),
      lastSeenAt: row.last_seen_at.getTime(),
    } : null;
  }

  async homeForClerkUser(clerkUserId: string): Promise<AccountHome | null> {
    const account = await this.accountForClerkUser(clerkUserId);
    if (!account) return null;
    return { account, worlds: await this.worldsForAccount(account.id) };
  }

  async authorizeWorldEntry(clerkUserId: string, worldId: string): Promise<WorldEntry | null> {
    const result = await this.pool.query<{
      account_id: string;
      id: string;
      slug: string;
      name: string;
      kind: WorldMembership['kind'];
      role: WorldMembership['role'];
      capabilities: string[];
    }>(
      `SELECT a.id AS account_id, w.id, w.slug, w.name, w.kind, m.role, m.capabilities
       FROM account_identities i
       JOIN player_accounts a ON a.id = i.account_id
       JOIN world_memberships m ON m.account_id = a.id
       JOIN worlds w ON w.id = m.world_id
       WHERE i.provider = 'clerk' AND i.provider_subject = $1
         AND w.id = $2 AND 'enter' = ANY(m.capabilities)`,
      [clerkUserId, worldId],
    );
    const row = result.rows[0];
    return row ? {
      accountId: row.account_id,
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      role: row.role,
      capabilities: [...row.capabilities],
    } : null;
  }

  async createSignupInviteLink(
    tokenHash: string,
    createdBy: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO signup_invite_links (token_hash, created_by, expires_at)
       VALUES ($1, $2, $3)`,
      [tokenHash, createdBy, expiresAt],
    );
  }

  async reserveSignupInviteLink(tokenHash: string, emailAddress: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE signup_invite_links
       SET claimed_at = now(), claimed_email = $2
       WHERE token_hash = $1 AND claimed_at IS NULL AND expires_at > now()
       RETURNING token_hash`,
      [tokenHash, emailAddress],
    );
    return result.rowCount === 1;
  }

  async completeSignupInviteLink(
    tokenHash: string,
    emailAddress: string,
    clerkInvitationId: string,
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE signup_invite_links
       SET clerk_invitation_id = $3
       WHERE token_hash = $1 AND claimed_email = $2 AND clerk_invitation_id IS NULL`,
      [tokenHash, emailAddress, clerkInvitationId],
    );
    if (result.rowCount !== 1) throw new Error('invite-link-completion-conflict');
  }

  async releaseSignupInviteLink(tokenHash: string, emailAddress: string): Promise<void> {
    await this.pool.query(
      `UPDATE signup_invite_links
       SET claimed_at = NULL, claimed_email = NULL
       WHERE token_hash = $1 AND claimed_email = $2 AND clerk_invitation_id IS NULL`,
      [tokenHash, emailAddress],
    );
  }

  async claimClerkIdentity(clerkUserId: string, account: DurableAccount): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.upsertClaim(client, clerkUserId, account);
      await this.provisionDefaultWorlds(client, account);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async provisionDefaultWorlds(client: PoolClient, account: DurableAccount): Promise<void> {
    const defaults = defaultWorldSpecifications(account);
    await client.query(
      `INSERT INTO worlds (slug, name, kind, owner_account_id)
       VALUES ($1, $2, 'solo', $3)
       ON CONFLICT (lower(slug)) DO NOTHING`,
      [defaults.solo.slug, defaults.solo.name, account.id],
    );
    await client.query(
      `INSERT INTO worlds (slug, name, kind)
       VALUES ($1, $2, 'shared')
       ON CONFLICT (lower(slug)) DO NOTHING`,
      [defaults.shared.slug, defaults.shared.name],
    );
    await client.query(
      `INSERT INTO world_memberships (world_id, account_id, role, capabilities)
       SELECT id, $2, $3, $4 FROM worlds WHERE lower(slug) = lower($1)
       ON CONFLICT (world_id, account_id) DO NOTHING`,
      [defaults.solo.slug, account.id, defaults.solo.role, defaults.solo.capabilities],
    );
    await client.query(
      `INSERT INTO world_memberships (world_id, account_id, role, capabilities)
       SELECT id, $2, $3, $4 FROM worlds WHERE lower(slug) = lower($1)
       ON CONFLICT (world_id, account_id) DO NOTHING`,
      [defaults.shared.slug, account.id, defaults.shared.role, defaults.shared.capabilities],
    );
  }

  private async worldsForAccount(accountId: string): Promise<WorldMembership[]> {
    const result = await this.pool.query<{
      id: string;
      slug: string;
      name: string;
      kind: WorldMembership['kind'];
      role: WorldMembership['role'];
      capabilities: string[];
    }>(
      `SELECT w.id, w.slug, w.name, w.kind, m.role, m.capabilities
       FROM world_memberships m
       JOIN worlds w ON w.id = m.world_id
       WHERE m.account_id = $1
       ORDER BY CASE w.kind WHEN 'solo' THEN 0 WHEN 'shared' THEN 1 ELSE 2 END, lower(w.name)`,
      [accountId],
    );
    return result.rows.map((row) => ({ ...row, capabilities: [...row.capabilities] }));
  }

  private async upsertClaim(
    client: PoolClient,
    clerkUserId: string,
    account: DurableAccount,
  ): Promise<void> {
    await client.query(
      `INSERT INTO player_accounts (id, created_at, last_seen_at)
       VALUES ($1, to_timestamp($2 / 1000.0), to_timestamp($3 / 1000.0))
       ON CONFLICT (id) DO UPDATE SET
         last_seen_at = GREATEST(player_accounts.last_seen_at, EXCLUDED.last_seen_at),
         updated_at = now()`,
      [account.id, account.createdAt, account.lastSeenAt],
    );
    await client.query(
      `INSERT INTO player_profiles (account_id, display_name)
       VALUES ($1, $2)
       ON CONFLICT (account_id) DO NOTHING`,
      [account.id, account.displayName],
    );
    await client.query(
      `INSERT INTO account_identities (provider, provider_subject, account_id)
       VALUES ('clerk', $1, $2)
       ON CONFLICT DO NOTHING`,
      [clerkUserId, account.id],
    );

    const mapping = await client.query<{ provider_subject: string; account_id: string }>(
      `SELECT provider_subject, account_id FROM account_identities
       WHERE (provider = 'clerk' AND provider_subject = $1) OR account_id = $2
       FOR UPDATE`,
      [clerkUserId, account.id],
    );
    if (mapping.rows.length !== 1
      || mapping.rows[0].provider_subject !== clerkUserId
      || mapping.rows[0].account_id !== account.id) {
      throw new IdentityConflictError();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function createDatabase(env: NodeJS.ProcessEnv = process.env): PaprDatabase | null {
  const connectionString = env.DATABASE_URL?.trim();
  return connectionString ? new PaprDatabase(connectionString) : null;
}
