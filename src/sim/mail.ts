import { LIMITS, sanitizeMailItem, type MailItem } from '../../shared/src/index';
import { RESOURCE_CORE_DEFS, type ResourceId } from './catalogs/resources';
import { TOOL_DEFS, type ToolId } from './catalogs/tools';
import type { GameState } from './state';

export type MailAttachment =
  | { kind: 'chips'; quantity: number; label: string }
  | { kind: 'resource'; resource: ResourceId; quantity: number; label: string }
  | { kind: 'tool'; toolId: ToolId; quantity: number; label: string }
  | { kind: 'item'; itemId: string; quantity: number; label: string };

const WELCOME_MAIL_ID = 'world:welcome-parcel:v1';

export function createWelcomeMail(at = Date.now()): MailItem {
  return {
    id: WELCOME_MAIL_ID,
    fromAccountId: 'world',
    fromName: 'Pip',
    kind: 'gift',
    payload: {
      subject: 'A seed for your first garden',
      text: 'Welcome to the neighborhood! I tucked in a Buttonbloom packet. Your mailbox will keep things safe until you are ready for them.',
      attachmentKind: 'resource',
      resource: 'buttonbloom-seeds',
      quantity: 1,
    },
    at,
  };
}

export function mailSubject(mail: MailItem): string {
  const subject = mail.payload.subject;
  return typeof subject === 'string' && subject.trim() ? subject.trim() : 'A note for you';
}

export function mailText(mail: MailItem): string {
  const text = mail.payload.text;
  return typeof text === 'string' ? text.trim() : '';
}

function attachmentQuantity(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.min(999_999, Math.floor(value))
    : null;
}

/** Validate the renderer-free protocol payload before it can grant anything. */
export function mailAttachment(mail: MailItem): MailAttachment | null {
  const quantity = attachmentQuantity(mail.payload.quantity);
  if (!quantity) return null;

  if (mail.payload.attachmentKind === 'chips') {
    return { kind: 'chips', quantity, label: `${quantity} shiny ${quantity === 1 ? 'chip' : 'chips'}` };
  }
  if (mail.payload.attachmentKind === 'resource') {
    const resource = mail.payload.resource;
    if (typeof resource !== 'string' || !(resource in RESOURCE_CORE_DEFS)) return null;
    return {
      kind: 'resource',
      resource: resource as ResourceId,
      quantity,
      label: `${quantity} ${RESOURCE_CORE_DEFS[resource as ResourceId].shortLabel}`,
    };
  }
  if (mail.payload.attachmentKind === 'tool') {
    const toolId = mail.payload.toolId;
    if (typeof toolId !== 'string' || !(toolId in TOOL_DEFS)) return null;
    return { kind: 'tool', toolId: toolId as ToolId, quantity, label: `${quantity} ${TOOL_DEFS[toolId as ToolId].name}` };
  }
  if (mail.payload.attachmentKind === 'item') {
    const itemId = mail.payload.itemId;
    const label = mail.payload.label;
    if (typeof itemId !== 'string' || !itemId.trim() || typeof label !== 'string' || !label.trim()) return null;
    return { kind: 'item', itemId: itemId.slice(0, 128), quantity, label: `${quantity} ${label.slice(0, 120)}` };
  }
  return null;
}

/**
 * When a parcel lands, for mail that travels (mill orders). Mail without an
 * `arrivesAt` has always already arrived.
 */
export function mailArrivesAt(mail: MailItem): number {
  const arrivesAt = mail.payload.arrivesAt;
  return typeof arrivesAt === 'number' && Number.isFinite(arrivesAt) ? arrivesAt : 0;
}

export function mailHasArrived(mail: MailItem, now: number): boolean {
  return mailArrivesAt(mail) <= now;
}

/** The physical mailbox reacts only to unclaimed mail that has arrived. */
export function hasReadyUnclaimedMail(mailbox: readonly MailItem[], claimedIds: readonly string[], now: number): boolean {
  return mailbox.some((mail) => mailHasArrived(mail, now) && !claimedIds.includes(mail.id));
}

/** Newest first, stable-id deduped, and bounded by the shared protocol limit. */
export function deliverMail(state: GameState, mail: MailItem): boolean {
  if (state.player.mailbox.some((existing) => existing.id === mail.id)) return false;
  state.player.mailbox.unshift(mail);
  if (state.player.mailbox.length > LIMITS.mailboxMax) state.player.mailbox.length = LIMITS.mailboxMax;
  const retainedIds = new Set(state.player.mailbox.map((entry) => entry.id));
  state.player.claimedMailIds = state.player.claimedMailIds
    .filter((id) => retainedIds.has(id))
    .slice(0, LIMITS.mailboxMax);
  return true;
}

/** Merge an untrusted newest-first network snapshot into the local scrapbook. */
export function mergeMailSnapshot(state: GameState, rawItems: unknown[]): number {
  let added = 0;
  for (const raw of [...rawItems].reverse()) {
    const item = sanitizeMailItem(raw);
    if (item && deliverMail(state, item)) added += 1;
  }
  return added;
}
