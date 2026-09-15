import { Pool, type PoolClient } from 'pg';

export type DurableAccount = {
  id: string;
  displayName: string;
  createdAt: number;
  lastSeenAt: number;
};

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

  async claimClerkIdentity(clerkUserId: string, account: DurableAccount): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.upsertClaim(client, clerkUserId, account);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
