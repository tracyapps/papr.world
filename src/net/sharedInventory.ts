import {
  sanitizeAccountInventory,
  type AccountInventory,
} from '../../shared/src/index';

let current: AccountInventory | null = null;
let claimHandler: ((mailId: string) => void) | null = null;
const listeners = new Set<(inventory: AccountInventory | null) => void>();

function clone(inventory: AccountInventory): AccountInventory {
  return {
    revision: inventory.revision,
    chips: inventory.chips,
    resources: { ...inventory.resources },
    tools: { ...inventory.tools },
    items: { ...inventory.items },
  };
}

export function receiveSharedInventory(raw: unknown): boolean {
  const next = sanitizeAccountInventory(raw);
  if (!next || (current && next.revision < current.revision)) return false;
  current = clone(next);
  for (const listener of listeners) listener(clone(next));
  return true;
}

export function getSharedInventory(): AccountInventory | null {
  return current ? clone(current) : null;
}

export function onSharedInventoryChanged(
  listener: (inventory: AccountInventory | null) => void,
): () => void {
  listeners.add(listener);
  listener(getSharedInventory());
  return () => listeners.delete(listener);
}

export function setSharedMailClaimHandler(handler: ((mailId: string) => void) | null): void {
  claimHandler = handler;
}

export function claimSharedMail(mailId: string): boolean {
  if (!current || !claimHandler) return false;
  claimHandler(mailId);
  return true;
}

export function clearSharedInventory(): void {
  current = null;
  claimHandler = null;
  for (const listener of listeners) listener(null);
}
