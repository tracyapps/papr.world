// The account-owned record of learned techniques — the tech half of the
// account/world boundary in `docs/accounts-worlds-and-social.md`. Plans are
// knowledge, not objects: this store exists so a solo-save import (and later
// shared-world learning) has one authoritative place to credit a plan id,
// instead of each feature inventing its own truth.
//
// Like `SoloMigrationStore`, deliberately its own small file and its own
// JSON store, separate from `MailStore`'s transferable pouch: plans are
// never spendable inventory, and keeping them apart is what keeps "generous
// gifts never carry knowledge" (`docs/roadmap.md` 3.6) structurally true.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { LIMITS, sanitizeAccountTech, type AccountTech } from '../../shared/src/index';

type StoreFile = { version: 1; tech: Record<string, AccountTech> };

function writeAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, contents, 'utf8');
  renameSync(temporary, path);
}

function cloneTech(tech: AccountTech): AccountTech {
  return { revision: tech.revision, plans: [...tech.plans] };
}

export class AccountTechStore {
  private records = new Map<string, AccountTech>();
  private path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'account-tech.json');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<StoreFile>;
      for (const [accountId, raw] of Object.entries(parsed.tech ?? {})) {
        const tech = sanitizeAccountTech(raw);
        if (accountId && tech) this.records.set(accountId, tech);
      }
    } catch (error) {
      console.error(`account-tech: failed to read ${this.path}, starting empty`, error);
    }
  }

  private flush(): void {
    const tech = Object.fromEntries(this.records);
    writeAtomic(this.path, JSON.stringify({ version: 1, tech } satisfies StoreFile, null, 2));
  }

  /**
   * The account's learned-plan record. Creates the empty record on first
   * read, mirroring `MailStore.inventory`: an account's tech exists from the
   * moment anything asks about it, so there is no "not provisioned yet"
   * third state for callers to handle.
   */
  techFor(accountId: string): AccountTech {
    const existing = this.records.get(accountId);
    if (existing) return cloneTech(existing);
    const created: AccountTech = { revision: 1, plans: [] };
    this.records.set(accountId, created);
    this.flush();
    return cloneTech(created);
  }

  /**
   * Union plan ids into the account's record — the credit seam for the
   * solo-save import and, later, server-validated shared-world learning.
   * A grant that adds nothing leaves the record untouched, so replaying a
   * grant is always safe and produces an identical snapshot.
   */
  grantPlans(accountId: string, planIds: string[]): AccountTech {
    const record = this.records.get(accountId) ?? this.techFor(accountId);
    const merged = new Set(record.plans);
    for (const id of planIds) {
      if (typeof id === 'string' && id.length > 0 && id.length <= 128) merged.add(id);
    }
    const plans = [...merged].slice(0, LIMITS.accountPlansMax);
    if (plans.length !== record.plans.length) {
      this.records.set(accountId, { revision: record.revision + 1, plans });
      this.flush();
    }
    return this.techFor(accountId);
  }
}
