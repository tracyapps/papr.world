// The friends list: who you are friends with, requests waiting for an answer,
// and requests you have made. A friend is the tier a home's door can treat
// differently (`docs/house-and-home.md`), so this is where the tier is made.
//
// A docked panel in the right-hand slot, opened from a button beside the
// connection status. Only present in shared play, and only for a player with
// a paper passport (guests have no friends).

import type { FriendRecord, FriendRequestRecord } from '../../shared/src/index';
import { blockAccount, reportAccount } from '../net/sharedSession';
import { buildFriendRequestNote, confirmBlock } from '../ui/playerCard';
import {
  answerFriend,
  getFriends,
  guestsAvailable,
  removeFriend,
  requestFriend,
  selfIsGuest,
  subscribeGuests,
} from './guests';
import { beginGuestPanel, registerGuestPanel } from './panelSlot';

let panel: HTMLElement | null = null;
let button: HTMLButtonElement | null = null;
let open = false;
let opener: HTMLElement | null = null;
let renderedKey = '';
let statusElement: HTMLElement | null = null;

/** Mirrors `sanitizeAccountRef`'s bound; the server refuses anything longer. */
const ACCOUNT_ID_MAX = 80;

function setStatus(text: string): void {
  if (statusElement) statusElement.textContent = text;
}

const slot = { close: closeFriendsPanel, element: () => panel };

const available = () => guestsAvailable() && !selfIsGuest();

function row(
  text: string,
  meta: string,
  actions: Array<{ label: string; act: string; id: string; quiet?: boolean }>,
  note = '',
): HTMLElement {
  const item = document.createElement('li');
  item.className = 'friends-row';
  const words = document.createElement('span');
  words.className = 'friends-row-name';
  words.textContent = text;
  item.append(words);
  if (meta) {
    const detail = document.createElement('span');
    detail.className = 'friends-row-meta';
    detail.textContent = meta;
    item.append(detail);
  }
  if (note) {
    // The note a request came with. Shown in full — never clamped to an
    // ellipsis that would hide meaning — and named so a screen reader reads
    // it as a separate sentence after the sender's name.
    const message = document.createElement('p');
    message.className = 'friends-row-note';
    message.textContent = note;
    message.setAttribute('aria-label', `Note from ${text}: ${note}`);
    item.append(message);
  }
  const holder = document.createElement('span');
  holder.className = 'friends-row-actions';
  for (const spec of actions) {
    const control = document.createElement('button');
    control.type = 'button';
    control.dataset.friendAct = spec.act;
    control.dataset.friendId = spec.id;
    control.textContent = spec.label;
    control.setAttribute('aria-label', `${spec.label}: ${text}`);
    if (spec.quiet) control.classList.add('is-quiet');
    holder.append(control);
  }
  item.append(holder);
  return item;
}

function section(title: string, items: HTMLElement[], empty: string): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.className = 'seed-store-section';
  const heading = document.createElement('div');
  heading.className = 'seed-store-section-heading';
  const h2 = document.createElement('h2');
  h2.textContent = title;
  heading.append(h2);
  wrapper.append(heading);
  if (items.length === 0) {
    const none = document.createElement('p');
    none.className = 'seed-store-message';
    none.textContent = empty;
    wrapper.append(none);
  } else {
    const list = document.createElement('ul');
    list.className = 'friends-list';
    list.append(...items);
    wrapper.append(list);
  }
  return wrapper;
}

const friendMeta = (friend: FriendRecord) => (friend.online ? 'here now' : 'away');

function render() {
  if (button) {
    button.hidden = !available();
    const waiting = getFriends().incoming.length;
    button.dataset.count = waiting > 0 ? String(waiting) : '';
    button.setAttribute(
      'aria-label',
      waiting > 0 ? `Friends: ${waiting} request${waiting === 1 ? '' : 's'} waiting` : 'Friends',
    );
    button.setAttribute('aria-expanded', String(open));
  }
  if (!panel) return;
  if (!available() && open) {
    closeFriendsPanel();
    return;
  }
  panel.classList.toggle('is-open', open);
  panel.setAttribute('aria-hidden', String(!open));
  panel.querySelector<HTMLElement>('[data-friends-add]')?.toggleAttribute('hidden', !available());
  if (!open) return;
  const body = panel.querySelector<HTMLElement>('[data-friends-body]');
  if (!body) return;
  const snapshot = getFriends();
  const key = JSON.stringify(snapshot);
  if (key === renderedKey) return;
  renderedKey = key;
  const focused = document.activeElement instanceof HTMLElement && body.contains(document.activeElement)
    ? { act: document.activeElement.dataset.friendAct, id: document.activeElement.dataset.friendId }
    : null;
  const incoming = snapshot.incoming.map((request: FriendRequestRecord) => row(request.name, '', [
    { label: 'Accept', act: 'accept', id: request.accountId },
    { label: 'Not now', act: 'decline', id: request.accountId, quiet: true },
    { label: 'Block', act: 'block', id: request.accountId, quiet: true },
    { label: 'Report', act: 'report', id: request.accountId, quiet: true },
  ], request.message ?? ''));
  const friends = snapshot.friends.map((friend) => row(friend.name, friendMeta(friend), [
    { label: 'Remove', act: 'remove', id: friend.accountId, quiet: true },
    { label: 'Block', act: 'block', id: friend.accountId, quiet: true },
    { label: 'Report', act: 'report', id: friend.accountId, quiet: true },
  ]));
  const outgoing = snapshot.outgoing.map((request) => row(request.name, 'waiting for an answer', [
    { label: 'Take back', act: 'withdraw', id: request.accountId, quiet: true },
  ]));
  const sections = [
    section('Asking to be your friend', incoming, 'Nobody is waiting on you.'),
    section('Your friends', friends, 'No friends yet. Click a neighbor\'s home or their card in the world to ask.'),
  ];
  if (outgoing.length > 0) sections.push(section('You asked', outgoing, ''));
  body.replaceChildren(...sections);
  if (focused?.act && focused.id) {
    body.querySelector<HTMLElement>(
      `[data-friend-act="${focused.act}"][data-friend-id="${CSS.escape(focused.id)}"]`,
    )?.focus();
  }
}

export function initializeFriendsPanel() {
  const app = document.querySelector<HTMLElement>('#app') ?? document.body;
  panel = document.createElement('aside');
  panel.className = 'seed-store-panel home-panel friends-panel';
  panel.setAttribute('aria-label', 'Friends');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <header class="seed-store-header">
      <div>
        <p class="panel-kicker">Neighbors</p>
        <h1>Friends</h1>
      </div>
      <button class="icon-button" type="button" data-close-friends aria-label="Close the friends list">×</button>
    </header>
    <p class="seed-store-message">Friends can be let walk straight into your home. You choose that in your home panel.</p>
    <p class="friends-status" data-friends-status role="status" aria-live="polite"></p>
    <details class="friends-add" data-friends-add>
      <summary>Ask someone to be friends</summary>
      <p class="friends-add-hint">Have a neighbor's account id? You can ask them here. Making friends from their card or their door in the world works the same way.</p>
      <label class="friends-add-label" for="friends-add-id">Their account id</label>
      <input id="friends-add-id" class="friends-add-id" type="text" autocomplete="off" spellcheck="false">
      <div data-friends-add-note></div>
      <button type="button" class="friends-add-ask" data-friends-add-ask>Ask</button>
    </details>
    <div data-friends-body></div>`;
  app.append(panel);

  statusElement = panel.querySelector<HTMLElement>('[data-friends-status]');
  const addId = panel.querySelector<HTMLInputElement>('.friends-add-id');
  const addNote = buildFriendRequestNote('friends-panel');
  panel.querySelector<HTMLElement>('[data-friends-add-note]')?.append(addNote.element);
  if (addId) addId.maxLength = ACCOUNT_ID_MAX;

  button = document.createElement('button');
  button.className = 'hud-icon-button friends-button';
  button.type = 'button';
  button.hidden = true;
  button.setAttribute('aria-label', 'Friends');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = `
    <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.4-3.2 2.6-5 5.5-5s5.1 1.8 5.5 5"/>
      <circle cx="17" cy="9" r="2.4"/><path d="M15.6 14.2c2.6-.4 4.4 1 4.9 4.2"/>
    </svg>`;
  button.addEventListener('click', () => (open ? closeFriendsPanel() : openFriendsPanel()));
  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    button.addEventListener(eventName, (event) => event.stopPropagation());
    panel.addEventListener(eventName, (event) => event.stopPropagation());
  }
  document.querySelector('#hud-actions')?.prepend(button);

  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') event.stopPropagation();
  });
  panel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-close-friends]')) {
      closeFriendsPanel();
      return;
    }
    if (target.closest('[data-friends-add-ask]')) {
      const accountId = addId?.value.trim() ?? '';
      if (!accountId) {
        addId?.focus();
        setStatus('Add the account id of the neighbor you want to ask.');
        return;
      }
      requestFriend(accountId, addNote.value());
      setStatus('Your ask is on its way.');
      if (addId) addId.value = '';
      addNote.input.value = '';
      addNote.input.dispatchEvent(new Event('input'));
      return;
    }
    const control = target.closest<HTMLElement>('[data-friend-act]');
    const id = control?.dataset.friendId;
    if (!control || !id) return;
    const name = getFriends().friends.find((friend) => friend.accountId === id)?.name
      ?? getFriends().incoming.find((request) => request.accountId === id)?.name
      ?? 'this neighbor';
    switch (control.dataset.friendAct) {
      case 'accept': answerFriend(id, true); break;
      case 'decline': answerFriend(id, false); break;
      case 'withdraw': removeFriend(id); break;
      case 'remove': {
        if (window.confirm(`Take ${name} off your friends list? They will be treated like any other neighbor at your door.`)) {
          removeFriend(id);
        }
        break;
      }
      case 'block': {
        if (confirmBlock(name)) {
          blockAccount(id);
          setStatus('You will not see their messages any more.');
        }
        break;
      }
      case 'report': {
        reportAccount(id);
        setStatus('Report sent. Thank you for telling us.');
        break;
      }
      default: break;
    }
  });

  registerGuestPanel(slot);
  subscribeGuests(render);
  render();
}

export function openFriendsPanel() {
  if (!available()) return;
  if (!open) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  beginGuestPanel(slot);
  open = true;
  renderedKey = '';
  render();
  panel?.querySelector<HTMLElement>('[data-close-friends]')?.focus();
}

export function closeFriendsPanel(): boolean {
  if (!open) return false;
  open = false;
  render();
  opener?.focus();
  opener = null;
  return true;
}

export function isFriendsPanelOpen() {
  return open;
}
