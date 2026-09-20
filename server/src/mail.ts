import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  LIMITS,
  sanitizeMailItem,
  type AccountInventory,
  type CaseSetIntent,
  type CaseShowIntent,
  type CaseStockIntent,
  type MailAttachmentIntent,
  type MailItem,
} from '../../shared/src/index';
import {
  applyRemove,
  applySet,
  applyShow,
  applyStock,
  applyTake,
  cloneCase,
  newCaseRecord,
  sanitizeCaseRecord,
  type CaseChange,
  type CaseEdit,
  type CaseRecord,
} from './cases';

type StoreFile = {
  version: 2;
  mailboxes: Record<string, MailItem[]>;
  claimedMailIds: Record<string, string[]>;
  inventories: Record<string, AccountInventory>;
  /** Display cases by piece id. Absent in files written before cases existed. */
  cases?: Record<string, CaseRecord>;
};

function writeAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, contents, 'utf8');
  renameSync(temporary, path);
}

/** Durable, account-scoped inboxes. A neighborhood may empty; its mail must not. */
export class MailStore {
  private mailboxes = new Map<string, MailItem[]>();
  private claimedMailIds = new Map<string, string[]>();
  private inventories = new Map<string, AccountInventory>();
  /** Display cases: goods held for visitors, kept beside the inventories they move between. */
  private cases = new Map<string, CaseRecord>();
  private listeners = new Set<(accountId: string, item: MailItem) => void>();
  private inventoryListeners = new Set<(accountId: string, inventory: AccountInventory) => void>();
  private path: string;

  constructor(dataDir: string) {
    this.path = join(dataDir, 'mail.json');
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<StoreFile> & { version?: number };
      for (const [accountId, rawItems] of Object.entries(parsed.mailboxes ?? {})) {
        if (!accountId || !Array.isArray(rawItems)) continue;
        const items = rawItems
          .flatMap((raw) => {
            const item = sanitizeMailItem(raw);
            return item ? [item] : [];
          })
          .slice(0, LIMITS.mailboxMax);
        if (items.length > 0) this.mailboxes.set(accountId, items);
      }
      if (parsed.version === 2) {
        for (const [accountId, raw] of Object.entries(parsed.inventories ?? {})) {
          const inventory = sanitizeInventory(raw);
          if (accountId && inventory) this.inventories.set(accountId, inventory);
        }
        for (const [accountId, rawIds] of Object.entries(parsed.claimedMailIds ?? {})) {
          if (!accountId || !Array.isArray(rawIds)) continue;
          const mailboxIds = new Set((this.mailboxes.get(accountId) ?? []).map((item) => item.id));
          const ids = rawIds
            .filter((id): id is string => typeof id === 'string' && mailboxIds.has(id))
            .slice(0, LIMITS.mailboxMax);
          if (ids.length > 0) this.claimedMailIds.set(accountId, ids);
        }
      }
      for (const [id, raw] of Object.entries(parsed.cases ?? {})) {
        const record = sanitizeCaseRecord(raw);
        if (record && record.id === id) this.cases.set(id, record);
      }
    } catch (error) {
      console.error(`mail: failed to read ${this.path}, starting empty`, error);
    }
  }

  flush(): void {
    const mailboxes = Object.fromEntries(this.mailboxes);
    const claimedMailIds = Object.fromEntries(this.claimedMailIds);
    const inventories = Object.fromEntries(this.inventories);
    const cases = Object.fromEntries(this.cases);
    writeAtomic(this.path, JSON.stringify({
      version: 2, mailboxes, claimedMailIds, inventories, cases,
    } satisfies StoreFile, null, 2));
  }

  list(accountId: string): MailItem[] {
    return (this.mailboxes.get(accountId) ?? []).map((item) => ({ ...item, payload: { ...item.payload } }));
  }

  subscribe(listener: (accountId: string, item: MailItem) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeInventory(
    listener: (accountId: string, inventory: AccountInventory) => void,
  ): () => void {
    this.inventoryListeners.add(listener);
    return () => this.inventoryListeners.delete(listener);
  }

  listClaimed(accountId: string): string[] {
    return [...(this.claimedMailIds.get(accountId) ?? [])];
  }

  /**
   * The transferable inventory starts independently from the solo save. A
   * client never uploads a claimed balance; that would preserve the exact
   * duplication route this store exists to close.
   */
  inventory(accountId: string): AccountInventory {
    const existing = this.inventories.get(accountId);
    if (existing) return cloneInventory(existing);
    const created: AccountInventory = {
      revision: 1,
      chips: 0,
      resources: {},
      tools: {},
      items: {},
    };
    this.inventories.set(accountId, created);
    this.flush();
    return cloneInventory(created);
  }

  /** Server-only grant seam for validated shared-world gathering/rewards. */
  grant(
    accountId: string,
    attachment: MailAttachmentIntent,
  ): AccountInventory {
    const inventory = this.mutableInventory(accountId);
    addToInventory(inventory, attachment);
    inventory.revision += 1;
    this.flush();
    this.notifyInventory(accountId, inventory);
    return cloneInventory(inventory);
  }

  deliver(input: {
    fromAccountId: string;
    fromName: string;
    toAccountId: string;
    text: string;
    at?: number;
  }): MailItem {
    const item: MailItem = {
      id: randomUUID(),
      fromAccountId: input.fromAccountId,
      fromName: input.fromName,
      kind: 'note',
      payload: { subject: `A letter from ${input.fromName}`, text: input.text },
      at: input.at ?? Date.now(),
    };
    const inbox = this.mailboxes.get(input.toAccountId) ?? [];
    inbox.unshift(item);
    if (inbox.length > LIMITS.mailboxMax) inbox.length = LIMITS.mailboxMax;
    this.mailboxes.set(input.toAccountId, inbox);
    // A successful acknowledgement means the offline recipient can retrieve
    // it after a process restart, so mail writes through synchronously.
    this.flush();
    for (const listener of this.listeners) listener(input.toAccountId, item);
    return { ...item, payload: { ...item.payload } };
  }

  /** Atomically debit the sender and enqueue the recipient's parcel. */
  deliverParcel(input: {
    fromAccountId: string;
    fromName: string;
    toAccountId: string;
    text: string;
    attachment: MailAttachmentIntent;
    at?: number;
  }): { item: MailItem; inventory: AccountInventory } | null {
    const sender = this.mutableInventory(input.fromAccountId);
    if (!canSpend(sender, input.attachment)) return null;
    const previousSender = cloneInventory(sender);
    const previousInbox = [...(this.mailboxes.get(input.toAccountId) ?? [])];
    spend(sender, input.attachment);
    sender.revision += 1;
    const item = this.createMailItem(input, input.attachment);
    const inbox = [item, ...previousInbox].slice(0, LIMITS.mailboxMax);
    this.mailboxes.set(input.toAccountId, inbox);
    try {
      this.flush();
    } catch (error) {
      this.inventories.set(input.fromAccountId, previousSender);
      this.mailboxes.set(input.toAccountId, previousInbox);
      throw error;
    }
    this.notifyInventory(input.fromAccountId, sender);
    for (const listener of this.listeners) listener(input.toAccountId, item);
    return { item: cloneMail(item), inventory: cloneInventory(sender) };
  }

  /** Atomically mark a parcel claimed and credit the recipient's balance. */
  claim(accountId: string, mailId: string): AccountInventory | null {
    if ((this.claimedMailIds.get(accountId) ?? []).includes(mailId)) return null;
    const item = (this.mailboxes.get(accountId) ?? []).find((candidate) => candidate.id === mailId);
    const attachment = item ? attachmentFromMail(item) : null;
    if (!attachment) return null;
    const inventory = this.mutableInventory(accountId);
    addToInventory(inventory, attachment);
    inventory.revision += 1;
    const claimed = [mailId, ...(this.claimedMailIds.get(accountId) ?? [])]
      .slice(0, LIMITS.mailboxMax);
    this.claimedMailIds.set(accountId, claimed);
    this.flush();
    this.notifyInventory(accountId, inventory);
    return cloneInventory(inventory);
  }

  // ---- Display cases --------------------------------------------------------
  //
  // Goods a case holds are debited from the owner's pouch when stocked and
  // credited to a visitor's when taken, each in one flush with a rollback, the
  // same discipline as `deliverParcel`. The rules are in ./cases.ts.

  /** A copy of the case for this piece, or null when the piece is not a case. */
  caseRecord(id: string): CaseRecord | null {
    const record = this.cases.get(id);
    return record ? cloneCase(record) : null;
  }

  /** Every case in the given set of piece ids, for hydrating a room. */
  casesAmong(ids: Iterable<string>): CaseRecord[] {
    const found: CaseRecord[] = [];
    for (const id of ids) {
      const record = this.cases.get(id);
      if (record) found.push(cloneCase(record));
    }
    return found;
  }

  /** Make a case of a newly placed piece. Doing it twice changes nothing. */
  createCase(id: string, owner: string): CaseRecord {
    const existing = this.cases.get(id);
    if (existing) return cloneCase(existing);
    const record = newCaseRecord(id, owner);
    this.cases.set(id, record);
    try {
      this.flush();
    } catch (error) {
      this.cases.delete(id);
      throw error;
    }
    return cloneCase(record);
  }

  caseSet(id: string, actor: string, intent: CaseSetIntent) {
    return this.editCase(id, actor, null, (_inventory, record) => applySet(record, intent));
  }

  caseShow(id: string, actor: string, intent: CaseShowIntent) {
    return this.editCase(id, actor, null, (_inventory, record) => applyShow(record, intent));
  }

  caseStock(id: string, actor: string, intent: CaseStockIntent) {
    return this.editCase(id, actor, actor, (inventory, record) => applyStock(inventory, record, intent));
  }

  caseRemove(id: string, actor: string, index: number) {
    return this.editCase(id, actor, actor, (inventory, record) => applyRemove(inventory, record, index));
  }

  /** A visitor takes one. Not the owner's business to check: anyone the room lets through may ask. */
  caseTake(id: string, visitor: { accountId: string; name: string }, index: number, now: number) {
    return this.editCase(id, null, visitor.accountId, (inventory, record) =>
      applyTake(inventory, record, index, visitor, now));
  }

  /**
   * One atomic edit of a case and, when `inventoryOf` is set, that account's
   * pouch. `owner` set means only the case's owner may make it. A refusal
   * changes nothing and writes nothing.
   */
  private editCase(
    id: string,
    owner: string | null,
    inventoryOf: string | null,
    apply: (inventory: AccountInventory, record: CaseRecord) => CaseChange,
  ): CaseEdit | null {
    const record = this.cases.get(id);
    if (!record) return null;
    if (owner !== null && record.owner !== owner) {
      return { change: { ok: false, outcome: 'not-yours' }, record: cloneCase(record) };
    }
    const inventory = inventoryOf ? this.mutableInventory(inventoryOf) : cloneInventory(EMPTY_INVENTORY);
    const previousRecord = cloneCase(record);
    const previousInventory = cloneInventory(inventory);
    const change = apply(inventory, record);
    if (!change.ok) return { change, record: cloneCase(record) };
    if (inventoryOf) inventory.revision += 1;
    try {
      this.flush();
    } catch (error) {
      this.cases.set(id, previousRecord);
      if (inventoryOf) this.inventories.set(inventoryOf, previousInventory);
      throw error;
    }
    if (inventoryOf) this.notifyInventory(inventoryOf, inventory);
    return { change, record: cloneCase(record) };
  }

  private mutableInventory(accountId: string): AccountInventory {
    const existing = this.inventories.get(accountId);
    if (existing) return existing;
    const created = this.inventory(accountId);
    this.inventories.set(accountId, created);
    return created;
  }

  private createMailItem(
    input: { fromAccountId: string; fromName: string; text: string; at?: number },
    attachment?: MailAttachmentIntent,
  ): MailItem {
    const payload: Record<string, string | number> = {
      subject: `A letter from ${input.fromName}`,
      text: input.text,
    };
    if (attachment) {
      payload.inventoryAuthority = 'server';
      payload.attachmentKind = attachment.kind;
      payload.quantity = attachment.quantity;
      if (attachment.kind === 'resource') payload.resource = attachment.itemId;
      if (attachment.kind === 'tool') payload.toolId = attachment.itemId;
      if (attachment.kind === 'item') {
        payload.itemId = attachment.itemId;
        payload.label = attachment.itemId.replace(/[-_.]+/g, ' ');
      }
    }
    return {
      id: randomUUID(), fromAccountId: input.fromAccountId, fromName: input.fromName,
      kind: attachment ? 'gift' : 'note', payload, at: input.at ?? Date.now(),
    };
  }

  private notifyInventory(accountId: string, inventory: AccountInventory): void {
    const snapshot = cloneInventory(inventory);
    for (const listener of this.inventoryListeners) listener(accountId, snapshot);
  }
}

const EMPTY_INVENTORY: AccountInventory = { revision: 1, chips: 0, resources: {}, tools: {}, items: {} };

function cloneMail(item: MailItem): MailItem {
  return { ...item, payload: { ...item.payload } };
}

function cloneInventory(inventory: AccountInventory): AccountInventory {
  return {
    revision: inventory.revision,
    chips: inventory.chips,
    resources: { ...inventory.resources },
    tools: { ...inventory.tools },
    items: { ...inventory.items },
  };
}

function safeCounts(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key || key.length > 128 || !Number.isFinite(value)) continue;
    result[key] = Math.max(0, Math.min(LIMITS.inventoryStackMax, Math.floor(value as number)));
  }
  return result;
}

function sanitizeInventory(raw: unknown): AccountInventory | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Partial<AccountInventory>;
  if (!Number.isSafeInteger(value.revision) || (value.revision ?? 0) < 1) return null;
  if (!Number.isFinite(value.chips)) return null;
  return {
    revision: value.revision as number,
    chips: Math.max(0, Math.min(LIMITS.inventoryStackMax, Math.floor(value.chips as number))),
    resources: safeCounts(value.resources),
    tools: safeCounts(value.tools),
    items: safeCounts(value.items),
  };
}

function balance(inventory: AccountInventory, attachment: MailAttachmentIntent): number {
  if (attachment.kind === 'chips') return inventory.chips;
  const bag = attachment.kind === 'resource' ? inventory.resources
    : attachment.kind === 'tool' ? inventory.tools : inventory.items;
  return bag[attachment.itemId] ?? 0;
}

function canSpend(inventory: AccountInventory, attachment: MailAttachmentIntent): boolean {
  return balance(inventory, attachment) >= attachment.quantity;
}

function spend(inventory: AccountInventory, attachment: MailAttachmentIntent): void {
  if (attachment.kind === 'chips') inventory.chips -= attachment.quantity;
  else {
    const bag = attachment.kind === 'resource' ? inventory.resources
      : attachment.kind === 'tool' ? inventory.tools : inventory.items;
    bag[attachment.itemId] = (bag[attachment.itemId] ?? 0) - attachment.quantity;
  }
}

function addToInventory(inventory: AccountInventory, attachment: MailAttachmentIntent): void {
  if (attachment.kind === 'chips') {
    inventory.chips = Math.min(LIMITS.inventoryStackMax, inventory.chips + attachment.quantity);
  } else {
    const bag = attachment.kind === 'resource' ? inventory.resources
      : attachment.kind === 'tool' ? inventory.tools : inventory.items;
    bag[attachment.itemId] = Math.min(
      LIMITS.inventoryStackMax,
      (bag[attachment.itemId] ?? 0) + attachment.quantity,
    );
  }
}

function attachmentFromMail(item: MailItem): MailAttachmentIntent | null {
  const quantity = item.payload.quantity;
  const kind = item.payload.attachmentKind;
  if (!Number.isSafeInteger(quantity) || (quantity as number) < 1) return null;
  if (kind === 'chips') return { kind, quantity: quantity as number };
  const field = kind === 'resource' ? 'resource' : kind === 'tool' ? 'toolId' : kind === 'item' ? 'itemId' : '';
  const itemId = field ? item.payload[field] : null;
  if (!field || typeof itemId !== 'string' || !itemId) return null;
  return { kind: kind as 'resource' | 'tool' | 'item', itemId, quantity: quantity as number };
}
