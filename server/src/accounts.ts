// Paper passports — durable, pseudonymous accounts (Phase A of
// docs/communal-multiplayer.md).
//
// An account is the durable key behind maker credit, mailboxes, and block
// lists. It holds NO personal information: an id, a hashed secret, and
// timestamps. Claiming an account with an email/passkey is a later phase that
// adds recovery WITHOUT changing the id, so nothing in the world migrates.
//
// Secrets are hashed with scrypt before touching disk; verification uses a
// timing-safe compare. Losing the store leaks no reusable credentials.

import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type AccountRecord = {
  id: string;
  /** `scrypt:<saltB64>:<hashB64>` — never the secret itself. */
  secretHash: string;
  /** Last display name used, purely for admin friendliness. Not identity. */
  lastName: string;
  createdAt: number;
  lastSeenAt: number;
};

type StoreFile = { version: 1; accounts: AccountRecord[] };

const SCRYPT_KEYLEN = 32;

function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString('base64url')}:${hash.toString('base64url')}`;
}

function verifyHash(secret: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split(':');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = scryptSync(secret, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Atomic write: temp file in the same directory, then rename over the top. */
function writeAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, contents, 'utf8');
  renameSync(tmp, path);
}

export class AccountStore {
  private accounts = new Map<string, AccountRecord>();
  private path: string;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'accounts.json');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as StoreFile;
      for (const record of parsed.accounts ?? []) this.accounts.set(record.id, record);
    } catch (err) {
      // A corrupt store must not brick the server; start empty but loudly.
      console.error(`accounts: failed to read ${this.path}, starting empty`, err);
    }
  }

  /** Debounced so a burst of joins costs one disk write. */
  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flush();
    }, 2000);
  }

  flush(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const file: StoreFile = { version: 1, accounts: [...this.accounts.values()] };
    writeAtomic(this.path, JSON.stringify(file, null, 2));
  }

  /**
   * Mint a new passport. Returns the secret EXACTLY ONCE — it is never
   * stored or recoverable. The client keeps it (localStorage for now).
   */
  create(name: string): { id: string; secret: string } {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const now = Date.now();
    this.accounts.set(id, {
      id,
      secretHash: hashSecret(secret),
      lastName: name,
      createdAt: now,
      lastSeenAt: now,
    });
    // A freshly minted passport is the one credential the player can never
    // re-derive — write it through synchronously rather than debounced.
    // (Debounce remains for harmless lastSeenAt touches in verify().)
    this.flush();
    return { id, secret };
  }

  /** Verify credentials; on success, touch lastSeen/lastName and return true. */
  verify(id: string, secret: string, name?: string): boolean {
    const record = this.accounts.get(id);
    if (!record) return false;
    if (!verifyHash(secret, record.secretHash)) return false;
    record.lastSeenAt = Date.now();
    if (name) record.lastName = name;
    this.scheduleSave();
    return true;
  }

  get size(): number {
    return this.accounts.size;
  }
}
