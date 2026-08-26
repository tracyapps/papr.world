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

import type { ChatBroadcast, RemovedNotice } from '../../shared/src/index';

export type SharedChatHandlers = {
  onSend: (text: string) => void;
  onBlock?: (accountId: string) => void;
  onUnblock?: (accountId: string) => void;
  onReport?: (report: { accountId: string; messageId?: string; details?: string }) => void;
  onRemove?: (accountId: string, ban: boolean) => void;
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
  /** Explain a removal in the log before the connection closes. */
  showRemoved: (notice: RemovedNotice) => void;
  focus: () => void;
};

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
  /** Who the open dialog is about. */
  let subject: ChatBroadcast | null = null;

  const aside = document.createElement('aside');
  aside.className = 'shared-chat';
  aside.setAttribute('aria-label', 'Neighborhood chat');
  aside.innerHTML = `
    <details open>
      <summary>Neighborhood <span data-role="status">connecting…</span></summary>
      <ol class="shared-chat-log" data-role="log" role="log" aria-live="polite" aria-relevant="additions"></ol>
      <form class="shared-chat-form" data-role="form">
        <label class="sr-only" for="shared-chat-message">Message the neighborhood</label>
        <input id="shared-chat-message" name="message" maxlength="240" autocomplete="off" placeholder="Say hello…">
        <button type="submit">Send</button>
      </form>
    </details>
  `;
  document.body.append(aside);

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
  const ownerBox = dialog.querySelector<HTMLElement>('[data-role="owner"]')!;
  const blockButton = dialog.querySelector<HTMLButtonElement>('[data-action="block"]')!;
  const unblockButton = dialog.querySelector<HTMLButtonElement>('[data-action="unblock"]')!;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    on.onSend(text);
    input.value = '';
  });

  function append(item: HTMLLIElement): void {
    log.append(item);
    while (log.children.length > 60) log.firstElementChild?.remove();
    log.scrollTop = log.scrollHeight;
  }

  function openActions(line: ChatBroadcast): void {
    subject = line;
    title.textContent = `Message from ${line.name}`;
    quote.textContent = line.text;
    details.value = '';

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
    if (on.onBlock || on.onReport) {
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

    showRemoved: (removed) => {
      notice(removed.reason === 'banned'
        ? 'You have been removed from this neighborhood and this code will not let you back in.'
        : 'You have been removed from this neighborhood.');
    },

    focus: () => input.focus(),
  };
}
