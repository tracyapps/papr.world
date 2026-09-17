// The one-time record of "this account already imported its local solo
// save" (docs/accounts-worlds-and-social.md, "Migration from today's
// prototype").
//
// Deliberately its own small file and its own JSON store, separate from
// `MailStore`'s transferable pouch: this file is the trust boundary. It is
// written BEFORE the pouch is credited, never after — see `reserveOnce`'s
// doc comment for why that ordering is the safe one.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SoloMigrationReceipt } from '../../shared/src/index';

type StoreFile = { version: 1; migrations: Record<string, SoloMigrationReceipt> };

function writeAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, contents, 'utf8');
  renameSync(temporary, path);
}

function cloneReceipt(receipt: SoloMigrationReceipt): SoloMigrationReceipt {
  return {
    at: receipt.at,
    chips: receipt.chips,
    resources: { ...receipt.resources },
    tools: { ...receipt.tools },
    items: { ...receipt.items },
    plans: [...receipt.plans],
  };
}

export class SoloMigrationStore {
  private migrations = new Map<string, SoloMigrationReceipt>();
  private path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'solo-migrations.json');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<StoreFile>;
      for (const [accountId, receipt] of Object.entries(parsed.migrations ?? {})) {
        if (accountId && receipt && typeof receipt === 'object') {
          this.migrations.set(accountId, receipt as SoloMigrationReceipt);
        }
      }
    } catch (error) {
      console.error(`solo-migrations: failed to read ${this.path}, starting empty`, error);
    }
  }

  private flush(): void {
    const migrations = Object.fromEntries(this.migrations);
    writeAtomic(this.path, JSON.stringify({ version: 1, migrations } satisfies StoreFile, null, 2));
  }

  /** The account's own migration record, or null if it has never imported a solo save. */
  receiptFor(accountId: string): SoloMigrationReceipt | null {
    const existing = this.migrations.get(accountId);
    return existing ? cloneReceipt(existing) : null;
  }

  /**
   * Reserve the migration for this account, exactly once, ever.
   *
   * `reserved: true` means THIS call is the one that just committed the
   * receipt to disk — only that caller should go on to credit the pouch.
   * `reserved: false` means an earlier call already did, and `receipt` is
   * that earlier one (never the one just passed in) — the caller must not
   * credit anything again.
   *
   * This is deliberately a reserve-then-credit split rather than one
   * atomic "credit and record" step: crediting the pouch is several
   * separate `MailStore` calls (one flush each), and there is no
   * transaction spanning two different JSON files. Writing the receipt
   * FIRST means a crash midway through crediting leaves the account
   * under-credited (rare, fixable by hand) rather than able to replay the
   * same reported balance into the pouch on retry.
   */
  reserveOnce(
    accountId: string,
    receipt: SoloMigrationReceipt,
  ): { receipt: SoloMigrationReceipt; reserved: boolean } {
    const existing = this.receiptFor(accountId);
    if (existing) return { receipt: existing, reserved: false };
    this.migrations.set(accountId, receipt);
    this.flush();
    return { receipt: this.receiptFor(accountId) as SoloMigrationReceipt, reserved: true };
  }
}
