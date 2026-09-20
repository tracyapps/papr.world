// Neighborhood chat, and the safety controls that live on each line.
//
// Every message carries an actions button. That placement is the point:
// blocking and reporting are only useful at the moment you read the thing
// that made you want them. A settings screen somewhere else is a control that
// exists but never gets used.
//
// The actions open a real <dialog>. The browser then owns the focus trap,
// Escape, returning focus to the button that opened it, and making the rest
// of the page inert — four things a hand-rolled menu reliably gets wrong.

import type {
  AccountInventory,
  ChatBroadcast,
  MailAttachmentIntent,
  RemovedNotice,
} from '../../shared/src/index';
import { registerDraggableHudWidget } from './hud';
import { isHudWidgetCollapsed, registerCollapsibleWidget, toggleHudWidgetCollapsed } from './hudLayout';
import { onSettingsChanged } from '../game/settings';
import { getMultiplayerStatusButton } from './multiplayerPanel';

export type SharedChatHandlers = {
  onSend: (text: string) => void;
  onBlock?: (accountId: string) => void;
  onUnblock?: (accountId: string) => void;
  onReport?: (report: { accountId: string; messageId?: string; details?: string }) => void;
  onRemove?: (accountId: string, ban: boolean) => void;
  onSendMail?: (
    accountId: string,
    text: string,
    attachment?: MailAttachmentIntent,
  ) => void;
};

export type SharedChatUi = {
  setStatus: (text: string, connected?: boolean) => void;
  addChat: (line: ChatBroadcast) => void;
  /** The backlog, replacing whatever is on screen. */
  setHistory: (lines: ChatBroadcast[]) => void;
  addNotice: (text: string) => void;
  /** Our own block list, so blocked people are labelled correctly. */
  setBlocks: (accountIds: string[]) => void;
  /** Whether to offer the removal control at all. */
  setOwner: (isOwner: boolean) => void;
  /** Durable account behind this client; self-authored lines have no actions. */
  setSelfAccountId: (accountId: string) => void;
  /** Refresh the server-owned neighborhood pouch used for parcels. */
  setInventory: (inventory: AccountInventory) => void;
  /** Explain a removal in the log before the connection closes. */
  showRemoved: (notice: RemovedNotice) => void;
  focus: () => void;
};

/**
 * The folded chat's unread count, mirrored at module scope.
 *
 * The count itself lives in `initializeSharedChat`'s closure, which is right —
 * it is that panel's business. But one thing outside the panel needs it: the
 * Logs badge counts "messages from neighbours" as a notification category, and
 * it must clear at exactly the moment the chat panel clears, or the two
 * disagree and one of them lies. Reading the rendered `[data-role="unread"]`
 * text would have worked too, and did, but it is a coupling that breaks
 * silently the day somebody rewords the line. This is the same value, said out
 * loud.
 */
let chatUnreadCount = 0;

export function getChatUnreadCount(): number {
  return chatUnreadCount;
}

export function initializeSharedChat(
  handlers: SharedChatHandlers | ((text: string) => void),
): SharedChatUi {
  // Kept callable with a bare function so the setup-error path, which only
  // ever needs setStatus, does not have to construct a handler object.
  const on: SharedChatHandlers = typeof handlers === 'function'
    ? { onSend: handlers }
    : handlers;

  let blocked = new Set<string>();
  let isOwner = false;
  let selfAccountId = '';
  let inventory: AccountInventory | null = null;
  /** Who the open dialog is about. */
  let subject: ChatBroadcast | null = null;

  const aside = document.createElement('aside');
  aside.id = 'chat-widget';
  aside.className = 'shared-chat hud-widget';
  aside.setAttribute('aria-label', 'Neighborhood chat');
  aside.innerHTML = `
    <div class="hud-drag-grip" aria-hidden="true"></div>
    <div class="shared-chat-header">
      <span class="shared-chat-title">Neighborhood <span data-role="status">connecting…</span></span>
      <span class="shared-chat-status-slot" data-role="status-slot"></span>
      <span class="shared-chat-unread" data-role="unread" aria-live="polite"></span>
      <button class="shared-chat-collapse" type="button" data-role="collapse" aria-pressed="false" aria-label="Hide chat"></button>
    </div>
    <ol class="shared-chat-log" data-role="log" role="log" aria-live="polite" aria-relevant="additions" data-hud-widget-interactive></ol>
    <form class="shared-chat-form" data-role="form">
      <label class="sr-only" for="shared-chat-message">Message the neighborhood</label>
      <input id="shared-chat-message" name="message" maxlength="240" autocomplete="off" placeholder="Say hello…">
      <button type="submit">Send</button>
    </form>
    <button class="hud-resize-handle" type="button" aria-label="Resize chat" data-hud-resize="chat"></button>
  `;
  document.body.append(aside);

  // The connection-status button used to sit alone in the top-right corner;
  // now that the chat has a stable home of its own, it belongs attached to
  // it instead — one less thing floating independently near the HUD icons.
  const statusSlot = aside.querySelector<HTMLElement>('[data-role="status-slot"]');
  const statusButton = getMultiplayerStatusButton();
  if (statusSlot && statusButton) statusSlot.append(statusButton);

  registerDraggableHudWidget({
    id: 'chat',
    element: aside,
    minScale: 0.75,
    maxScale: 1.75,
    defaultScale: 1,
    // Bottom-right by default — clear of the scrapbook dock and the tool
    // rail, and the corner most players asked for. Still fully draggable;
    // this is only where it starts.
    defaultPosition: () => ({
      x: window.innerWidth - (aside.offsetWidth + 16),
      y: window.innerHeight - (aside.offsetHeight + 16),
    }),
  });

  const dialog = document.createElement('dialog');
  dialog.className = 'chat-actions';
  dialog.innerHTML = `
    <form method="dialog" class="chat-actions-sheet">
      <h2 data-role="title">Message from someone</h2>
      <blockquote data-role="quote"></blockquote>

      <div class="chat-actions-buttons">
        <button type="button" data-action="block">Stop showing me their messages</button>
        <button type="button" data-action="unblock" hidden>Show their messages again</button>
      </div>

      <details class="chat-actions-mail">
        <summary>Write them a letter</summary>
        <p class="chat-actions-hint">It will wait in their mailbox even if they have wandered home.</p>
        <label class="sr-only" for="chat-mail-text">Letter</label>
        <textarea id="chat-mail-text" data-role="mail-text" rows="4" maxlength="500"
          placeholder="Write a little note…"></textarea>
        <label for="chat-mail-attachment">Attach from your neighborhood pouch</label>
        <select id="chat-mail-attachment" data-role="mail-attachment">
          <option value="">No attachment</option>
        </select>
        <label for="chat-mail-quantity">Quantity</label>
        <input id="chat-mail-quantity" data-role="mail-quantity" type="number" min="1" max="999" value="1">
        <p class="chat-actions-hint" data-role="pouch-hint">The server-kept pouch is loading…</p>
        <button type="button" data-action="mail">Send letter</button>
      </details>

      <details class="chat-actions-report">
        <summary>Report this to the people running the alpha</summary>
        <p class="chat-actions-hint">
          They will see this exact message and who sent it. Say as much or as
          little as you like — you do not have to explain yourself.
        </p>
        <label class="sr-only" for="chat-report-details">Anything you want to add</label>
        <textarea id="chat-report-details" data-role="details" rows="3" maxlength="1000"
          placeholder="Anything you want to add (optional)"></textarea>
        <button type="button" data-action="report">Send the report</button>
      </details>

      <div class="chat-actions-owner" data-role="owner" hidden>
        <button type="button" data-action="remove">Remove them from this neighborhood</button>
        <button type="button" data-action="ban">Remove and refuse this code</button>
      </div>

      <button type="submit" class="chat-actions-close">Never mind</button>
    </form>
  `;
  document.body.append(dialog);

  const status = aside.querySelector<HTMLElement>('[data-role="status"]')!;
  const log = aside.querySelector<HTMLOListElement>('[data-role="log"]')!;
  const form = aside.querySelector<HTMLFormElement>('[data-role="form"]')!;
  const input = form.elements.namedItem('message') as HTMLInputElement;
  const title = dialog.querySelector<HTMLElement>('[data-role="title"]')!;
  const quote = dialog.querySelector<HTMLElement>('[data-role="quote"]')!;
  const details = dialog.querySelector<HTMLTextAreaElement>('[data-role="details"]')!;
  const mailText = dialog.querySelector<HTMLTextAreaElement>('[data-role="mail-text"]')!;
  const mailAttachment = dialog.querySelector<HTMLSelectElement>('[data-role="mail-attachment"]')!;
  const mailQuantity = dialog.querySelector<HTMLInputElement>('[data-role="mail-quantity"]')!;
  const pouchHint = dialog.querySelector<HTMLElement>('[data-role="pouch-hint"]')!;
  const mailBox = dialog.querySelector<HTMLElement>('.chat-actions-mail')!;
  const ownerBox = dialog.querySelector<HTMLElement>('[data-role="owner"]')!;
  const blockButton = dialog.querySelector<HTMLButtonElement>('[data-action="block"]')!;
  const unblockButton = dialog.querySelector<HTMLButtonElement>('[data-action="unblock"]')!;
  mailBox.hidden = !on.onSendMail;

  function friendlyId(id: string): string {
    return id.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function refreshAttachmentOptions(): void {
    const selected = mailAttachment.value;
    mailAttachment.replaceChildren(new Option('No attachment', ''));
    if (!inventory) {
      pouchHint.textContent = 'The server-kept pouch is loading…';
      return;
    }
    const entries: Array<{ value: string; label: string; count: number }> = [];
    if (inventory.chips > 0) entries.push({ value: 'chips:', label: 'Shiny chips', count: inventory.chips });
    for (const [id, count] of Object.entries(inventory.resources)) {
      if (count > 0) entries.push({ value: `resource:${id}`, label: friendlyId(id), count });
    }
    for (const [id, count] of Object.entries(inventory.tools)) {
      if (count > 0) entries.push({ value: `tool:${id}`, label: friendlyId(id), count });
    }
    for (const [id, count] of Object.entries(inventory.items)) {
      if (count > 0) entries.push({ value: `item:${id}`, label: friendlyId(id), count });
    }
    for (const entry of entries.sort((a, b) => a.label.localeCompare(b.label))) {
      mailAttachment.append(new Option(`${entry.label} (${entry.count})`, entry.value));
    }
    if ([...mailAttachment.options].some((option) => option.value === selected)) {
      mailAttachment.value = selected;
    }
    pouchHint.textContent = entries.length > 0
      ? 'Only this server-kept balance can leave your account.'
      : 'Your neighborhood pouch is empty.';
  }

  mailAttachment.addEventListener('change', () => {
    const [kind, itemId] = mailAttachment.value.split(':');
    const available = !inventory ? 1 : kind === 'chips' ? inventory.chips
      : kind === 'resource' ? inventory.resources[itemId] ?? 0
        : kind === 'tool' ? inventory.tools[itemId] ?? 0
          : inventory.items[itemId] ?? 0;
    mailQuantity.max = String(Math.max(1, Math.min(999, available)));
    if (Number(mailQuantity.value) > available) mailQuantity.value = String(Math.max(1, available));
    mailQuantity.disabled = !mailAttachment.value;
  });
  mailQuantity.disabled = true;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    on.onSend(text);
    input.value = '';
  });

  // Folding the chat away. It used to be always expanded — the one HUD
  // widget with no way to get out of the way (a collapsed <details> could not
  // coexist with dragging). Now it folds to its header like the Professor,
  // joins "hide all HUD", and counts what arrived while folded.
  const collapseButton = aside.querySelector<HTMLButtonElement>('[data-role="collapse"]')!;
  const unread = aside.querySelector<HTMLElement>('[data-role="unread"]')!;
  let unreadCount = 0;
  registerCollapsibleWidget('chat', aside, 'Neighborhood chat');
  function renderCollapsed() {
    const collapsed = isHudWidgetCollapsed('chat');
    aside.classList.toggle('is-hud-collapsed', collapsed);
    collapseButton.setAttribute('aria-pressed', String(collapsed));
    collapseButton.setAttribute('aria-label', collapsed ? 'Show chat' : 'Hide chat');
    collapseButton.title = collapsed ? 'Show chat' : 'Hide chat';
    if (!collapsed) unreadCount = 0;
    chatUnreadCount = unreadCount;
    unread.textContent = collapsed && unreadCount > 0
      ? `${unreadCount} new ${unreadCount === 1 ? 'message' : 'messages'}`
      : '';
    if (!collapsed) log.scrollTop = log.scrollHeight;
  }
  collapseButton.addEventListener('click', () => {
    toggleHudWidgetCollapsed('chat');
    renderCollapsed();
  });
  // A chat built for an earlier connection may be gone; ignore it then.
  onSettingsChanged(() => { if (aside.isConnected) renderCollapsed(); });
  renderCollapsed();

  function append(item: HTMLLIElement): void {
    log.append(item);
    while (log.children.length > 60) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
    if (isHudWidgetCollapsed('chat')) {
      unreadCount += 1;
      renderCollapsed();
    }
  }

  function openActions(line: ChatBroadcast): void {
    subject = line;
    title.textContent = `Message from ${line.name}`;
    quote.textContent = line.text;
    details.value = '';
    mailText.value = '';
    mailAttachment.value = '';
    mailQuantity.value = '1';
    mailQuantity.disabled = true;

    const already = blocked.has(line.accountId);
    blockButton.hidden = already;
    unblockButton.hidden = !already;
    ownerBox.hidden = !isOwner;

    dialog.showModal();
  }

  dialog.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
    if (!action || !subject) return;
    const { accountId, id } = subject;

    if (action === 'block') on.onBlock?.(accountId);
    if (action === 'unblock') on.onUnblock?.(accountId);
    if (action === 'report') {
      on.onReport?.({ accountId, messageId: id, details: details.value.trim() || undefined });
      notice('Report sent. Thank you for telling us.');
    }
    if (action === 'mail') {
      const text = mailText.value.trim();
      if (!text) {
        mailText.focus();
        return;
      }
      let attachment: MailAttachmentIntent | undefined;
      if (mailAttachment.value) {
        const [kind, itemId] = mailAttachment.value.split(':');
        const quantity = Number(mailQuantity.value);
        attachment = kind === 'chips'
          ? { kind: 'chips', quantity }
          : { kind: kind as 'resource' | 'tool' | 'item', itemId, quantity };
      }
      on.onSendMail?.(accountId, text, attachment);
    }
    if (action === 'remove') on.onRemove?.(accountId, false);
    if (action === 'ban') on.onRemove?.(accountId, true);

    dialog.close();
  });

  function renderLine(line: ChatBroadcast): HTMLLIElement {
    const item = document.createElement('li');

    const name = document.createElement('strong');
    name.textContent = `${line.name}: `;
    item.append(name, document.createTextNode(line.text));

    // No actions on your own messages, and none when there is nothing wired
    // up to act on them.
    if (line.accountId !== selfAccountId && (on.onBlock || on.onReport || on.onSendMail)) {
      const actions = document.createElement('button');
      actions.type = 'button';
      actions.className = 'shared-chat-actions';
      // A real accessible name, not a bare "…". Somebody tabbing through
      // needs to know which message this button belongs to.
      actions.setAttribute('aria-label', `Options for this message from ${line.name}`);
      actions.textContent = '⋯';
      actions.addEventListener('click', () => openActions(line));
      item.append(' ', actions);
    }

    return item;
  }

  function notice(text: string): void {
    const item = document.createElement('li');
    item.className = 'shared-chat-notice';
    item.textContent = text;
    append(item);
  }

  return {
    setStatus: (text, connected = false) => {
      status.textContent = text;
      status.dataset.connected = connected ? 'true' : 'false';
      input.disabled = !connected;
      form.querySelector('button')!.toggleAttribute('disabled', !connected);
    },

    addChat: (line) => append(renderLine(line)),

    setHistory: (lines) => {
      log.replaceChildren();
      for (const line of lines) log.append(renderLine(line));
      log.scrollTop = log.scrollHeight;
    },

    addNotice: notice,

    setBlocks: (accountIds) => {
      const before = blocked;
      blocked = new Set(accountIds);
      // Only speak up when it actually changed, so joining is quiet.
      if (before.size !== blocked.size && before.size > 0) {
        notice(blocked.size > before.size
          ? 'You will not see their messages any more.'
          : 'Their messages are showing again.');
      }
    },

    setOwner: (value) => { isOwner = value; },

    setSelfAccountId: (accountId) => { selfAccountId = accountId; },

    setInventory: (value) => {
      inventory = value;
      refreshAttachmentOptions();
    },

    showRemoved: (removed) => {
      notice(removed.reason === 'banned'
        ? 'You have been removed from this neighborhood and this code will not let you back in.'
        : 'You have been removed from this neighborhood.');
    },

    focus: () => input.focus(),
  };
}
