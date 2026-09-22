// The player's own mailbox, opened by clicking it in the world: everything
// that arrives by post (game/mailboxExterior.ts's `isMailboxAtScreen`), any
// friend requests waiting on you, and a way to write straight to someone on
// your friends list — mailing a stranger only makes sense in context, at
// their door or their card in the world, so this panel only ever offers
// friends as an audience. Mail-ordering refined materials from Chisel's mill
// used to live in the Scrapbook; it reads better here, beside the rest of
// what a mailbox is for.
//
// A "guest panel" like the friends list and a neighbor's door
// (game/panelSlot.ts): opening it steps the classic panels and the other
// guest panels aside, and it steps aside for them in turn.

import { LIMITS, type MailAttachmentIntent } from '../../shared/src/index';
import { mailArrivesAt, mailAttachment, mailHasArrived, mailSubject, mailText } from '../sim/mail';
import { dispatchGameCommand } from '../sim/commands';
import { getGameState, onGameStateChanged } from '../sim/state';
import { sendPlayerMail } from '../net/sharedSession';
import {
  claimSharedMail,
  getSharedInventory,
  onSharedInventoryChanged,
} from '../net/sharedInventory';
import { answerFriend, getFriends, guestsAvailable, selfIsGuest, subscribeGuests } from './guests';
import { beginGuestPanel, registerGuestPanel } from './panelSlot';
import { setMillPanelOpen } from './millCounter';

let panel: HTMLElement | null = null;
let open = false;
let opener: HTMLElement | null = null;
let localMessage = '';
let composeTo = '';
let renderedKey = '';

const slot = { close: closeMailboxPanel, element: () => panel };

const friendsAvailable = () => guestsAvailable() && !selfIsGuest();

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

const diaryDateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

function diaryDate(timestamp: number): { datetime: string; label: string } {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { datetime: '', label: '' };
  try {
    return { datetime: date.toISOString(), label: diaryDateFormatter.format(date) };
  } catch {
    return { datetime: '', label: '' };
  }
}

/** Whole minutes, never "0": a parcel due in 20 seconds is "under a minute". */
function arrivalLabel(arrivesAt: number) {
  const seconds = Math.max(0, Math.ceil((arrivesAt - Date.now()) / 1000));
  return seconds < 60 ? 'under a minute' : `about ${Math.ceil(seconds / 60)} min`;
}

function renderMailSection(): string {
  const state = getGameState();
  const mailbox = state.player.mailbox;
  if (mailbox.length === 0) {
    return '<p class="scrapbook-empty">Nothing waiting. Letters and parcels will show up here.</p>';
  }
  return `<ol class="scrapbook-mail-list">${mailbox.map((mail) => {
    const attachment = mailAttachment(mail);
    const claimed = state.player.claimedMailIds.includes(mail.id);
    const onItsWay = !mailHasArrived(mail, Date.now());
    const serverParcel = attachment && mail.payload.inventoryAuthority === 'server';
    const sharedClaim = Boolean(serverParcel && getSharedInventory());
    const date = diaryDate(mail.at);
    return `
      <li class="scrapbook-mail-card${claimed ? ' is-collected' : ''}">
        <header>
          <span><strong>${escapeHtml(mailSubject(mail))}</strong><small>From ${escapeHtml(mail.fromName)}</small></span>
          ${date.label ? `<time${date.datetime ? ` datetime="${date.datetime}"` : ''}>${date.label}</time>` : ''}
        </header>
        ${mailText(mail) ? `<p>${escapeHtml(mailText(mail))}</p>` : ''}
        ${attachment ? `
          <footer>
            <span class="scrapbook-mail-attachment">${escapeHtml(attachment.label)}</span>
            <button type="button" data-collect-mail="${escapeHtml(mail.id)}" ${claimed || onItsWay ? 'disabled' : ''}>
              ${claimed ? 'Collected' : onItsWay ? `On its way · ${arrivalLabel(mailArrivesAt(mail))}` : sharedClaim ? 'Collect to neighborhood pouch' : 'Collect'}
            </button>
          </footer>` : ''}
      </li>`;
  }).join('')}</ol>`;
}

function renderRequestsSection(): string {
  const incoming = getFriends().incoming;
  if (incoming.length === 0) return '';
  return `
    <section class="seed-store-section">
      <div class="seed-store-section-heading"><h2>Asking to be your friend</h2></div>
      <ul class="friends-list">${incoming.map((request) => `
        <li class="friends-row">
          <span class="friends-row-name">${escapeHtml(request.name)}</span>
          ${request.message ? `<p class="friends-row-note">${escapeHtml(request.message)}</p>` : ''}
          <span class="friends-row-actions">
            <button type="button" data-friend-accept="${escapeHtml(request.accountId)}">Accept</button>
            <button type="button" class="is-quiet" data-friend-decline="${escapeHtml(request.accountId)}">Not now</button>
          </span>
        </li>`).join('')}</ul>
    </section>`;
}

function renderComposeSection(): string {
  const friends = getFriends().friends;
  if (friends.length === 0) {
    return `
      <section class="seed-store-section">
        <div class="seed-store-section-heading"><h2>Write to a friend</h2></div>
        <p class="scrapbook-empty">No friends yet. Ask at their door or their card in the world, and they'll show up here to write to.</p>
      </section>`;
  }
  const selected = friends.some((friend) => friend.accountId === composeTo) ? composeTo : friends[0].accountId;
  composeTo = selected;
  return `
    <section class="seed-store-section">
      <div class="seed-store-section-heading"><h2>Write to a friend</h2></div>
      <label class="friends-add-label" for="mailbox-compose-to">Send to</label>
      <select id="mailbox-compose-to" class="friends-add-id" data-mailbox-compose-to>
        ${friends.map((friend) => `<option value="${escapeHtml(friend.accountId)}" ${friend.accountId === selected ? 'selected' : ''}>${escapeHtml(friend.name)}</option>`).join('')}
      </select>
      <label class="friends-add-label" for="mailbox-compose-text">Message</label>
      <textarea id="mailbox-compose-text" class="friends-add-id" data-mailbox-compose-text rows="3" maxlength="${LIMITS.mailTextMaxLength}" placeholder="Say hello…"></textarea>
      <button type="button" class="friends-add-ask" data-mailbox-compose-send>Send</button>
    </section>`;
}

function renderMailOrder(): string {
  return `
    <div class="scrapbook-mail-order">
      <button type="button" data-open-mill-order>Order from the Wood Mill…</button>
      <small>Chisel refines raw stock by post, for a small delivery fee.</small>
    </div>`;
}

function render() {
  if (!panel) return;
  panel.classList.toggle('is-open', open);
  panel.setAttribute('aria-hidden', String(!open));
  if (!open) return;
  const key = JSON.stringify({
    mailbox: getGameState().player.mailbox,
    claimed: getGameState().player.claimedMailIds,
    friends: getFriends(),
    inventory: getSharedInventory(),
    localMessage,
  });
  if (key === renderedKey) return;
  renderedKey = key;
  const body = panel.querySelector<HTMLElement>('[data-mailbox-body]');
  if (!body) return;
  const focusedSelect = document.activeElement instanceof HTMLSelectElement
    && body.contains(document.activeElement);
  const focusedValue = focusedSelect ? (document.activeElement as HTMLSelectElement).value : null;
  body.innerHTML = `
    ${localMessage ? `<p class="scrapbook-mail-message" aria-live="polite">${escapeHtml(localMessage)}</p>` : ''}
    ${friendsAvailable() ? renderRequestsSection() : ''}
    <section class="seed-store-section">
      <div class="seed-store-section-heading"><h2>Mail</h2></div>
      ${renderMailSection()}
      ${renderMailOrder()}
    </section>
    ${friendsAvailable() ? renderComposeSection() : ''}`;
  if (focusedValue) {
    const select = body.querySelector<HTMLSelectElement>('[data-mailbox-compose-to]');
    if (select) select.value = focusedValue;
  }
}

export function initializeMailboxPanel() {
  const app = document.querySelector<HTMLElement>('#app') ?? document.body;
  panel = document.createElement('aside');
  panel.className = 'seed-store-panel home-panel mailbox-panel';
  panel.setAttribute('aria-label', 'Mailbox');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <header class="seed-store-header">
      <div>
        <p class="panel-kicker">Your mailbox</p>
        <h1>Mailbox</h1>
      </div>
      <button class="icon-button" type="button" data-close-mailbox aria-label="Close the mailbox">×</button>
    </header>
    <div data-mailbox-body></div>`;
  app.append(panel);

  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    panel.addEventListener(eventName, (event) => event.stopPropagation());
  }
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') event.stopPropagation();
  });

  panel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-close-mailbox]')) {
      closeMailboxPanel();
      return;
    }
    if (target.closest('[data-open-mill-order]')) {
      setMillPanelOpen(true, 'mail');
      return;
    }
    const acceptId = target.closest<HTMLButtonElement>('[data-friend-accept]')?.dataset.friendAccept;
    if (acceptId) {
      answerFriend(acceptId, true);
      return;
    }
    const declineId = target.closest<HTMLButtonElement>('[data-friend-decline]')?.dataset.friendDecline;
    if (declineId) {
      answerFriend(declineId, false);
      return;
    }
    const mailId = target.closest<HTMLButtonElement>('[data-collect-mail]')?.dataset.collectMail;
    if (mailId) {
      const mail = getGameState().player.mailbox.find((entry) => entry.id === mailId);
      if (mail?.payload.inventoryAuthority === 'server') {
        const sent = claimSharedMail(mailId);
        localMessage = sent
          ? 'The server is placing that parcel in your neighborhood pouch…'
          : 'Reconnect to the neighborhood before collecting this parcel.';
        renderedKey = '';
        render();
        return;
      }
      const result = dispatchGameCommand({ type: 'collectMail', mailId });
      localMessage = result.ok ? result.message : result.reason;
      renderedKey = '';
      render();
      return;
    }
    if (target.closest('[data-mailbox-compose-send]')) {
      const select = panel?.querySelector<HTMLSelectElement>('[data-mailbox-compose-to]');
      const textarea = panel?.querySelector<HTMLTextAreaElement>('[data-mailbox-compose-text]');
      const toAccountId = select?.value ?? '';
      const text = textarea?.value.trim() ?? '';
      if (!toAccountId || !text) {
        localMessage = 'Write something first.';
        renderedKey = '';
        render();
        return;
      }
      const attachment: MailAttachmentIntent | undefined = undefined;
      sendPlayerMail(toAccountId, text, attachment);
      composeTo = toAccountId;
      if (textarea) textarea.value = '';
      localMessage = 'Sent.';
      renderedKey = '';
      render();
    }
  });
  panel.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLSelectElement && target.matches('[data-mailbox-compose-to]')) {
      composeTo = target.value;
    }
  });

  registerGuestPanel(slot);
  subscribeGuests(render);
  onGameStateChanged(render);
  onSharedInventoryChanged(render);
}

export function openMailboxPanel() {
  if (!open) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  beginGuestPanel(slot);
  open = true;
  renderedKey = '';
  localMessage = '';
  render();
  panel?.querySelector<HTMLElement>('[data-close-mailbox]')?.focus();
}

export function closeMailboxPanel(): boolean {
  if (!open) return false;
  open = false;
  render();
  opener?.focus();
  opener = null;
  return true;
}

export function isMailboxPanelOpen() {
  return open;
}
