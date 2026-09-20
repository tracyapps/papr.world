// A neighbor's front door: what their home looks like, whether the sign says
// it is open, and the one button that goes in (or knocks). Reached by walking
// up and pressing E, or by clicking the house.
//
// Design: docs/house-and-home.md ("Who can come in"). Everything the sign and
// the drawing say is said here in words, and nothing needs quick hands: a knock
// waits, and the answer is a sentence that stays on the panel.

import { isGuestAccount } from '../../shared/src/index';
import { blockAccount, reportAccount } from '../net/sharedSession';
import { buildFriendRequestNote, confirmBlock, openPlayerCardFor } from '../ui/playerCard';
import { HOME_REACH } from '../world/homeSite';
import {
  distanceToNeighborEdge,
  getNeighborHome,
  nearestNeighborHome,
  subscribeNeighborHomes,
  type NeighborHome,
} from '../world/neighborHomes';
import { avatar } from './avatar';
import { describeHomeParts } from './dwellingLook';
import {
  answerFriend,
  friendStateOf,
  getEntryNote,
  getEntryPhase,
  getEntryTarget,
  guestsAvailable,
  invitationTo,
  requestEntry,
  requestFriend,
  selfIsGuest,
  subscribeGuests,
} from './guests';
import { beginGuestPanel, registerGuestPanel } from './panelSlot';
import { isIndoors } from './sceneTransition';

let panel: HTMLElement | null = null;
let prompt: HTMLElement | null = null;
let open = false;
let targetId = '';
let opener: HTMLElement | null = null;
let localMessage = '';
let renderedActions = '';
let friendForId = '';
let lastTick = 0;

const slot = { close: closeVisitPanel, element: () => panel };

type ActionSpec = { id: string; label: string; disabled?: boolean; quiet?: boolean };

/** Whether you stand close enough to the door to go in. */
function atTheDoor(home: NeighborHome): boolean {
  return distanceToNeighborEdge(home, avatar.position) < HOME_REACH - 1.25;
}

function goLabel(home: NeighborHome): ActionSpec {
  const target = getEntryTarget();
  if (isIndoors()) return { id: 'go', label: 'Step outside first', disabled: true };
  if (getEntryPhase() === 'knocking' && target?.host === home.accountId) {
    return { id: 'go', label: 'Knocked: waiting for an answer', disabled: true };
  }
  if (invitationTo(home.accountId)) return { id: 'go', label: 'Come in: they let you in' };
  if (home.open) return { id: 'go', label: 'Walk in: open house' };
  return { id: 'go', label: 'Go in, or knock' };
}

function actionsFor(home: NeighborHome): ActionSpec[] {
  const actions: ActionSpec[] = [goLabel(home)];
  const canBefriend = guestsAvailable() && !selfIsGuest() && !isGuestAccount(home.accountId);
  if (canBefriend) {
    const state = friendStateOf(home.accountId);
    if (state === 'none') actions.push({ id: 'friend-add', label: 'Add friend', quiet: true });
    if (state === 'incoming') {
      actions.push({ id: 'friend-accept', label: 'Accept friend request', quiet: true });
      actions.push({ id: 'friend-decline', label: 'Not now', quiet: true });
    }
  }
  actions.push({ id: 'card', label: 'Their player card', quiet: true });
  if (canBefriend) {
    actions.push({ id: 'block', label: 'Block', quiet: true });
    actions.push({ id: 'report', label: 'Report', quiet: true });
  }
  return actions;
}

function relationLine(home: NeighborHome): string {
  if (isGuestAccount(home.accountId) || selfIsGuest()) return '';
  switch (friendStateOf(home.accountId)) {
    case 'friends': return `You and ${home.name} are friends.`;
    case 'outgoing': return `You asked ${home.name} to be friends. They will see it when they are next around.`;
    case 'incoming': return `${home.name} asked to be friends.`;
    default: return '';
  }
}

function render(force = false) {
  if (!panel) return;
  panel.classList.toggle('is-open', open);
  panel.setAttribute('aria-hidden', String(!open));
  if (!open) return;
  const home = getNeighborHome(targetId);
  if (!home) {
    // They left, or the room went away: the door is simply not there.
    closeVisitPanel();
    return;
  }
  const title = panel.querySelector<HTMLElement>('[data-visit-title]');
  const summary = panel.querySelector<HTMLElement>('[data-visit-summary]');
  const relation = panel.querySelector<HTMLElement>('[data-visit-relation]');
  const message = panel.querySelector<HTMLElement>('[data-visit-message]');
  const actionsHost = panel.querySelector<HTMLElement>('[data-visit-actions]');
  if (title) title.textContent = `${home.name}'s home`;
  const openLine = home.open ? ' Open house: everyone is welcome to walk in.' : '';
  if (summary) summary.textContent = `${describeHomeParts(home.parts, home.building)}${openLine}`;
  if (relation) relation.textContent = relationLine(home);
  const note = localMessage || getEntryNote();
  if (message && message.textContent !== note) message.textContent = note;
  if (!actionsHost) return;

  const actions = actionsFor(home);
  const canBefriend = guestsAvailable() && !selfIsGuest() && !isGuestAccount(home.accountId);

  // The optional note + the disclosure that must accompany the ask. Rebuilt
  // only when the neighbor changes (or the ask becomes available again), so
  // a half-typed note survives the gentle periodic refresh.
  const friendHost = panel.querySelector<HTMLElement>('[data-visit-friend]');
  if (friendHost) {
    const canAdd = canBefriend && friendStateOf(home.accountId) === 'none';
    friendHost.hidden = !canAdd;
    if (canAdd && friendForId !== home.accountId) {
      friendForId = home.accountId;
      friendHost.replaceChildren(buildFriendRequestNote(`visit-${home.accountId}`).element);
    } else if (!canAdd) {
      friendForId = '';
      friendHost.replaceChildren();
    }
  }
  const safetyHint = panel.querySelector<HTMLElement>('[data-visit-safety-hint]');
  if (safetyHint) safetyHint.hidden = !canBefriend;

  const key = JSON.stringify(actions);
  if (key === renderedActions && !force) return;
  renderedActions = key;
  const focused = document.activeElement instanceof HTMLElement && actionsHost.contains(document.activeElement)
    ? document.activeElement.dataset.visitAct
    : null;
  actionsHost.replaceChildren(...actions.map((spec) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.visitAct = spec.id;
    button.textContent = spec.label;
    if (spec.quiet) button.classList.add('is-quiet');
    if (spec.disabled) button.setAttribute('aria-disabled', 'true');
    return button;
  }));
  if (focused) actionsHost.querySelector<HTMLElement>(`[data-visit-act="${focused}"]`)?.focus();
}

function tryGo(home: NeighborHome) {
  localMessage = '';
  if (isIndoors()) {
    localMessage = 'Step outside first, then come to their door.';
  } else if (getEntryPhase() === 'knocking' && getEntryTarget()?.host === home.accountId) {
    localMessage = `You already knocked at ${home.name}'s door. Their answer will show up here.`;
  } else if (!atTheDoor(home)) {
    localMessage = 'Walk up to the door first.';
  } else if (!requestEntry(home.accountId, home.name)) {
    localMessage = 'Visiting needs a shared neighborhood.';
  }
  render(true);
}

export function initializeVisitPanel() {
  const app = document.querySelector<HTMLElement>('#app') ?? document.body;
  panel = document.createElement('aside');
  panel.className = 'seed-store-panel home-panel visit-panel';
  panel.setAttribute('aria-label', 'A neighbor\'s home');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <header class="seed-store-header">
      <div>
        <p class="panel-kicker">Neighbor</p>
        <h1 data-visit-title>A neighbor's home</h1>
      </div>
      <button class="icon-button" type="button" data-close-visit aria-label="Close this panel">×</button>
    </header>
    <p class="seed-store-message" data-visit-summary></p>
    <p class="seed-store-message" data-visit-relation></p>
    <p class="seed-store-message" data-visit-message aria-live="polite"></p>
    <div class="visit-friend" data-visit-friend hidden></div>
    <div class="seed-shop-actions visit-actions" data-visit-actions></div>
    <p class="visit-safety-hint" data-visit-safety-hint hidden>Blocking is quiet and lasting: it stops their messages to you and closes your door to them. It is not the same as asking a visitor to leave.</p>`;
  app.append(panel);

  prompt = document.createElement('div');
  prompt.className = 'hint maker-prompt mill-prompt';
  prompt.hidden = true;
  document.querySelector('.hud')?.append(prompt);

  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    panel.addEventListener(eventName, (event) => event.stopPropagation());
  }
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') event.stopPropagation();
  });
  panel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-close-visit]')) {
      closeVisitPanel();
      return;
    }
    const act = target.closest<HTMLElement>('[data-visit-act]')?.dataset.visitAct;
    const home = getNeighborHome(targetId);
    if (!act || !home) return;
    if (act === 'go') tryGo(home);
    else if (act === 'friend-add') {
      const note = panel?.querySelector<HTMLInputElement>('.friend-request-note-input')?.value.trim();
      requestFriend(home.accountId, note || undefined);
    }
    else if (act === 'friend-accept') answerFriend(home.accountId, true);
    else if (act === 'friend-decline') answerFriend(home.accountId, false);
    else if (act === 'card') openPlayerCardFor({ accountId: home.accountId, name: home.name, drawingKey: '' });
    else if (act === 'block') {
      if (confirmBlock(home.name)) {
        blockAccount(home.accountId);
        localMessage = 'You will not see their messages any more.';
        render(true);
      }
    }
    else if (act === 'report') {
      reportAccount(home.accountId);
      localMessage = 'Report sent. Thank you for telling us.';
      render(true);
    }
  });

  registerGuestPanel(slot);
  subscribeGuests(() => render());
  subscribeNeighborHomes(() => render());
}

export function openVisitPanel(accountId: string) {
  if (!getNeighborHome(accountId)) return;
  if (!open) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  beginGuestPanel(slot);
  targetId = accountId;
  localMessage = '';
  open = true;
  render(true);
  panel?.querySelector<HTMLElement>('[data-visit-act="go"]')?.focus();
}

export function closeVisitPanel(): boolean {
  if (!open) return false;
  open = false;
  targetId = '';
  renderedActions = '';
  friendForId = '';
  render();
  opener?.focus();
  opener = null;
  return true;
}

export function isVisitPanelOpen() {
  return open;
}

/** E at a neighbor's door: open (or close) their panel. Returns whether there was a door to open. */
export function toggleVisitPanelNear(position: { x: number; z: number }): boolean {
  if (isIndoors() || !guestsAvailable()) return false;
  const home = nearestNeighborHome(position);
  if (!home) return false;
  if (open && targetId === home.accountId) closeVisitPanel();
  else openVisitPanel(home.accountId);
  return true;
}

/** Whether a neighbor's door is within reach (so other E prompts can step back for it). */
export function isNearNeighborDoor(position: { x: number; z: number }): boolean {
  return !isIndoors() && guestsAvailable() && nearestNeighborHome(position) !== null;
}

/** Called every frame: the prompt near a neighbor's door, and a gentle refresh while the panel is open. */
export function updateVisitPrompt(position: { x: number; z: number }, yieldToOthers = false, now = Date.now()) {
  if (open && now - lastTick >= 500) {
    lastTick = now;
    render();
  }
  if (!prompt) return;
  const home = open || yieldToOthers || isIndoors() || !guestsAvailable() ? null : nearestNeighborHome(position);
  prompt.hidden = home === null;
  if (!home) return;
  const text = `Press E at ${home.name}'s home${home.open ? ' (open house)' : ''}`;
  if (prompt.textContent !== text) prompt.textContent = text;
}
