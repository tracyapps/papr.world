import type * as THREE from 'three';
import { dispatchGameCommand } from '../sim/commands';
import { getGameState, onGameStateChanged } from '../sim/state';
import { RESOURCE_CORE_DEFS } from '../sim/catalogs/resources';
import { TECH_DEFS, techNodeTeachingAbility } from '../sim/catalogs/techTree';
import {
  DWELLING_PART_IDS,
  DWELLING_REFUND_LOSS_PERCENT,
  dwellingPartDef,
  type DwellingPartId,
} from '../sim/catalogs/dwellings';
import { collectingPercent, describeDwellingWait, partStatus } from '../sim/dwelling';
import { animalDesigns } from './mailbox/designs.animals';
import { objectDesigns } from './mailbox/designs.objects';
import type { MailboxDesign } from './mailbox/kit';
import { showPetToast } from './petting';
import { playCozySound } from './cozyAudio';
import { describeHome, isNearHome } from './dwellingLook';
import { HOME_BODY_RADIUS, homePosition } from '../world/homeSite';
import { getPlace, HOME_PLACE_ID } from '../world/places';
import { interiorName } from '../world/homeInterior';
import { goInside, goOutside, isIndoors, isNearInteriorExit, isVisiting } from './sceneTransition';
import { remoteAvatarsInside } from '../net/remoteAvatarVisuals';
import {
  answerKnock,
  askToLeave,
  getHomePolicy,
  getKnocks,
  getSelfAccount,
  guestsAvailable,
  selfIsGuest,
  setHomePolicy,
  subscribeGuests,
} from './guests';

/**
 * Your home's panel: what is built, what is being paid for, and what each part
 * would take (`docs/house-and-home.md`). Everything a card says is also said in
 * words (costs, progress, time left, what is locked and why), and a part that
 * cannot be started shows the reason instead of a disabled button.
 *
 * It wears the seed store's paper-panel classes, like Chisel's counter.
 */

let panel: HTMLElement | null = null;
let prompt: HTMLElement | null = null;
let open = false;
let message = '';
let lastTick = 0;
let openedHandler: (() => void) | null = null;

const MAILBOX_DESIGNS: MailboxDesign[] = [...objectDesigns, ...animalDesigns];

/** Register what should close when this panel opens (the other right-hand panels). */
export function onHomePanelOpened(handler: () => void) {
  openedHandler = handler;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character
  ));
}

export function describeTimeLeft(ms: number): string {
  if (ms <= 0) return 'any moment now';
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

function homePlace() {
  const place = getPlace(HOME_PLACE_ID);
  return place ? { x: place.x, z: place.z } : { x: -1.5, z: -2.2 };
}

export function isNearHomePanel(position: THREE.Vector3) {
  // Inside your home you are always "at" it; inside somebody else's you are not.
  if (isVisiting()) return false;
  return isIndoors() || isNearHome(position, homePlace());
}

function costLines(partId: DwellingPartId, now: number): string {
  void now;
  const state = getGameState();
  const project = state.world.dwelling.projects[partId];
  return dwellingPartDef(partId).cost.map((line) => {
    const paid = project?.paid[line.resource] ?? 0;
    const have = state.player.inventory[line.resource] ?? 0;
    const label = RESOURCE_CORE_DEFS[line.resource].label;
    return `<li>${escapeHtml(label)}: ${paid} of ${line.quantity} in${paid < line.quantity ? ` (you have ${have})` : ''}</li>`;
  }).join('');
}

function renderCard(partId: DwellingPartId, now: number): string {
  const def = dwellingPartDef(partId);
  const state = getGameState();
  const status = partStatus(state, partId);
  const project = state.world.dwelling.projects[partId];
  const titleId = `home-part-${partId}`;
  const head = (badge: string) => `
      <div class="seed-shop-card-title"><strong id="${titleId}">${escapeHtml(def.label)}</strong><span>${escapeHtml(badge)}</span></div>
      <p>${escapeHtml(def.summary)}</p>`;

  if (status === 'needs-know-how') {
    const lessonId = techNodeTeachingAbility(def.requiresAbility);
    const lesson = lessonId ? TECH_DEFS[lessonId].name : 'the right lesson';
    return `
    <article class="seed-shop-card mill-card is-locked" aria-labelledby="${titleId}">
      <div class="seed-shop-card-copy">${head('Locked')}
        <p class="mill-card-holdings">Learn ${escapeHtml(lesson)} with the Professor to unlock this.</p>
      </div>
    </article>`;
  }
  if (status === 'needs-parts') {
    const missing = def.requiresParts.filter((id) => !state.world.dwelling.parts.includes(id));
    return `
    <article class="seed-shop-card mill-card is-locked" aria-labelledby="${titleId}">
      <div class="seed-shop-card-copy">${head('Waiting')}
        <p class="mill-card-holdings">Finish the ${escapeHtml(missing.map((id) => dwellingPartDef(id).label.toLowerCase()).join(' and '))} first.</p>
      </div>
    </article>`;
  }
  if (status === 'finished') {
    const percent = DWELLING_REFUND_LOSS_PERCENT.finished;
    return `
    <article class="seed-shop-card mill-card" aria-labelledby="${titleId}">
      <div class="seed-shop-card-copy">${head('Built')}
        <div class="seed-shop-actions">
          <button type="button" data-home-down="${partId}">Take down (${100 - percent}% of the materials back)</button>
        </div>
      </div>
    </article>`;
  }
  if (status === 'building') {
    const left = (project?.completesAt ?? now) - now;
    const percent = DWELLING_REFUND_LOSS_PERCENT.building;
    return `
    <article class="seed-shop-card mill-card" aria-labelledby="${titleId}">
      <div class="seed-shop-card-copy">${head('Building')}
        <p class="mill-card-trade">Everything is in. About ${escapeHtml(describeTimeLeft(left))} left. It keeps building while you are away.</p>
        <div class="seed-shop-actions">
          <button type="button" data-home-refund="${partId}">Stop and take materials back (${100 - percent}% back)</button>
        </div>
      </div>
    </article>`;
  }
  const collecting = status === 'collecting';
  const percent = collectingPercent(partId, project);
  return `
    <article class="seed-shop-card mill-card" aria-labelledby="${titleId}">
      <div class="seed-shop-card-copy">${head(collecting ? `${percent}% collected` : 'Ready to start')}
        <ul class="mill-card-holdings">${costLines(partId, now)}</ul>
        <p class="mill-card-trade">Takes ${escapeHtml(describeDwellingWait(def.buildSeconds))} to build once everything is in.</p>
        <div class="seed-shop-actions">
          <button type="button" data-home-give="${partId}">Put in what I have</button>
          ${collecting ? `<button type="button" data-home-refund="${partId}">Take materials back (all of it)</button>` : ''}
        </div>
      </div>
    </article>`;
}

function render(now = Date.now()) {
  if (!panel) return;
  panel.classList.toggle('is-open', open);
  panel.setAttribute('aria-hidden', String(!open));
  if (!open) return;
  const state = getGameState();
  const summary = panel.querySelector<HTMLElement>('[data-home-summary]');
  const messageElement = panel.querySelector<HTMLElement>('[data-home-message]');
  const cards = panel.querySelector<HTMLElement>('[data-home-cards]');
  const door = panel.querySelector<HTMLButtonElement>('[data-home-door]');
  if (summary) summary.textContent = describeHome(state.world.dwelling);
  if (messageElement && messageElement.textContent !== message) messageElement.textContent = message;
  if (door) {
    const text = isIndoors()
      ? `Go outside`
      : `Go inside your ${interiorName(state.world.dwelling.parts)}`;
    if (door.textContent !== text) door.textContent = text;
  }
  renderGuestSettings();
  renderMailboxPicker();
  if (cards) {
    const html = DWELLING_PART_IDS.map((id) => renderCard(id, now)).join('');
    // The panel re-renders about once a second while open. Rewriting identical
    // markup would throw a keyboard user's focus away for nothing, so only
    // touch the cards when something on them changed, and put focus back on
    // the same button if it had it.
    if (html !== renderedCards) {
      const focused = document.activeElement instanceof HTMLElement && cards.contains(document.activeElement)
        ? focusSelector(document.activeElement)
        : null;
      cards.innerHTML = html;
      renderedCards = html;
      if (focused) cards.querySelector<HTMLElement>(focused)?.focus();
    }
  }
}

let renderedCards = '';
let renderedGuestLists = '';
let renderedMailboxStyles = '';

const guestRow = (text: string, buttons: Array<{ label: string; attrs: Record<string, string>; quiet?: boolean }>) => {
  const row = document.createElement('div');
  row.className = 'guest-row';
  const words = document.createElement('span');
  words.textContent = text;
  row.append(words);
  for (const spec of buttons) {
    const control = document.createElement('button');
    control.type = 'button';
    control.textContent = spec.label;
    control.setAttribute('aria-label', `${spec.label}: ${text}`);
    for (const [name, value] of Object.entries(spec.attrs)) control.setAttribute(name, value);
    if (spec.quiet) control.classList.add('is-quiet');
    row.append(control);
  }
  return row;
};

/** One button per rig, built fresh each render like the dwelling cards above —
 *  cheap at 16 items, and it keeps the pressed state, the label and the focus
 *  handling all one code path instead of two ways to say "this one's picked". */
function renderMailboxStyles(container: HTMLElement, currentStyle: string) {
  const html = MAILBOX_DESIGNS.map((design) => `
    <button type="button" class="avatar-editor-swatch" data-mailbox-style="${design.id}"
      title="${escapeHtml(design.tagline)}" aria-pressed="${design.id === currentStyle}">
      <span class="swatch-label">${escapeHtml(design.name)}</span>
    </button>`).join('');
  if (html === renderedMailboxStyles) return;
  const focused = document.activeElement instanceof HTMLElement && container.contains(document.activeElement)
    ? document.activeElement.dataset.mailboxStyle
    : null;
  container.innerHTML = html;
  renderedMailboxStyles = html;
  if (focused) container.querySelector<HTMLElement>(`[data-mailbox-style="${CSS.escape(focused)}"]`)?.focus();
}

/**
 * The mailbox picker: which of the 16 rigs stands by the door, and its two
 * team colors. Always available — nothing to unlock, nothing to pay for —
 * and the nameplate takes care of itself: it always reads this account's own
 * display name (see game/mailboxExterior.ts), so there is nothing to type here.
 */
function renderMailboxPicker() {
  if (!panel) return;
  const styles = panel.querySelector<HTMLElement>('[data-mailbox-styles]');
  const primary = panel.querySelector<HTMLInputElement>('[data-mailbox-primary]');
  const secondary = panel.querySelector<HTMLInputElement>('[data-mailbox-secondary]');
  const look = getGameState().world.mailboxLook;
  if (styles) renderMailboxStyles(styles, look.style);
  if (primary && primary.value !== look.primary) primary.value = look.primary;
  if (secondary && secondary.value !== look.secondary) secondary.value = look.secondary;
}

/**
 * The door settings (friends walk in / knock / closed, everyone else knock /
 * closed, open house), the knocks waiting, and who is inside. Only in shared
 * play with a paper passport: solo play has nobody to let in.
 */
function renderGuestSettings() {
  if (!panel) return;
  const section = panel.querySelector<HTMLElement>('[data-home-guests]');
  if (!section) return;
  const show = guestsAvailable() && !selfIsGuest();
  section.hidden = !show;
  if (!show) return;
  const policy = getHomePolicy();
  const friendsSelect = section.querySelector<HTMLSelectElement>('[data-door-friends]');
  const othersSelect = section.querySelector<HTMLSelectElement>('[data-door-others]');
  const openBox = section.querySelector<HTMLInputElement>('[data-door-open]');
  const note = section.querySelector<HTMLElement>('[data-door-open-note]');
  if (friendsSelect && friendsSelect.value !== policy.friends) friendsSelect.value = policy.friends;
  if (othersSelect && othersSelect.value !== policy.others) othersSelect.value = policy.others;
  if (openBox && openBox.checked !== policy.open) openBox.checked = policy.open;
  const noteText = policy.open
    ? 'Your sign says open house, and anyone in the neighborhood may walk in.'
    : 'Your door follows the two settings above.';
  if (note && note.textContent !== noteText) note.textContent = noteText;

  const knocks = getKnocks();
  const inside = remoteAvatarsInside(getSelfAccount());
  const key = JSON.stringify([knocks.map((knock) => [knock.visitor, knock.name]), inside]);
  if (key === renderedGuestLists) return;
  renderedGuestLists = key;
  const knocksHost = section.querySelector<HTMLElement>('[data-door-knocks]');
  const insideHost = section.querySelector<HTMLElement>('[data-door-inside]');
  const focused = document.activeElement instanceof HTMLElement && section.contains(document.activeElement)
    ? { knock: document.activeElement.dataset.doorKnock, leave: document.activeElement.dataset.doorLeave }
    : null;
  if (knocksHost) {
    knocksHost.replaceChildren(...(knocks.length === 0 ? [] : [
      Object.assign(document.createElement('h3'), { textContent: 'At your door' }),
      ...knocks.flatMap((knock) => [guestRow(knock.name, [
        { label: 'Let in', attrs: { 'data-door-knock': `${knock.visitor}|yes` } },
        { label: 'Not right now', attrs: { 'data-door-knock': `${knock.visitor}|no` }, quiet: true },
      ])]),
    ]));
  }
  if (insideHost) {
    insideHost.replaceChildren(...(inside.length === 0 ? [] : [
      Object.assign(document.createElement('h3'), { textContent: 'In your home now' }),
      ...inside.map((guest) => guestRow(guest.name, [
        { label: 'Ask to leave', attrs: { 'data-door-leave': guest.accountId }, quiet: true },
      ])),
    ]));
  }
  if (focused?.knock) section.querySelector<HTMLElement>(`[data-door-knock="${CSS.escape(focused.knock)}"]`)?.focus();
  else if (focused?.leave) section.querySelector<HTMLElement>(`[data-door-leave="${CSS.escape(focused.leave)}"]`)?.focus();
}

/** A selector that finds this control again after the cards are rewritten. */
function focusSelector(element: HTMLElement): string | null {
  for (const key of ['homeGive', 'homeRefund', 'homeDown'] as const) {
    const value = element.dataset[key];
    if (value) return `[data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${value}"]`;
  }
  return null;
}

export function initializeHomePanel() {
  const app = document.querySelector<HTMLElement>('#app') ?? document.body;
  panel = document.createElement('aside');
  panel.className = 'seed-store-panel home-panel';
  panel.setAttribute('aria-label', 'Your home');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <header class="seed-store-header">
      <div>
        <p class="panel-kicker">Home</p>
        <h1>Your home</h1>
      </div>
      <button class="icon-button" type="button" data-close-home aria-label="Close the home panel">×</button>
    </header>
    <p class="seed-store-message" data-home-summary></p>
    <p class="seed-store-message" data-home-message aria-live="polite"></p>
    <div class="seed-shop-actions home-door">
      <button type="button" data-home-door>Go inside</button>
    </div>
    <section class="seed-store-section home-door-settings" data-home-guests hidden>
      <div class="seed-store-section-heading">
        <h2>Who can come in</h2>
        <span>Only you can see these settings.</span>
      </div>
      <div class="guest-settings">
        <label>
          <span>Friends</span>
          <select data-door-friends>
            <option value="walk">Walk right in</option>
            <option value="knock">Knock first</option>
            <option value="closed">Door closed</option>
          </select>
        </label>
        <label>
          <span>Everyone else</span>
          <select data-door-others>
            <option value="knock">Knock first</option>
            <option value="closed">Door closed</option>
          </select>
        </label>
        <label class="guest-check">
          <input type="checkbox" data-door-open>
          <span>Open house: everyone may walk in.</span>
        </label>
        <p class="seed-store-message" data-door-open-note></p>
      </div>
      <div class="guest-list" data-door-knocks></div>
      <div class="guest-list" data-door-inside></div>
    </section>
    <section class="seed-store-section">
      <div class="seed-store-section-heading">
        <h2>Mailbox</h2>
        <span>Seen by every neighbor who walks by. Your name goes on the plate automatically.</span>
      </div>
      <div class="avatar-editor-swatches" data-mailbox-styles role="list" aria-label="Mailbox style"></div>
      <div class="guest-settings">
        <label>
          <span>Primary color</span>
          <input type="color" data-mailbox-primary aria-label="Mailbox primary color">
        </label>
        <label>
          <span>Secondary color</span>
          <input type="color" data-mailbox-secondary aria-label="Mailbox secondary color">
        </label>
      </div>
    </section>
    <section class="seed-store-section">
      <div class="seed-store-section-heading">
        <h2>Building</h2>
        <span>Pay in whenever you like. Take it back any time.</span>
      </div>
      <div class="seed-store-stock" data-home-cards></div>
    </section>`;
  app.append(panel);

  prompt = document.createElement('div');
  prompt.className = 'hint maker-prompt mill-prompt';
  prompt.hidden = true;
  prompt.textContent = 'Press E to plan, build or go in';
  document.querySelector('.hud')?.append(prompt);

  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    panel.addEventListener(eventName, (event) => event.stopPropagation());
  }
  panel.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') event.stopPropagation();
  });
  panel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-close-home]')) {
      setHomePanelOpen(false);
      return;
    }
    if (target.closest('[data-home-door]')) {
      if (isIndoors()) goOutside();
      else goInside();
      return;
    }
    const knockControl = target.closest<HTMLElement>('[data-door-knock]')?.dataset.doorKnock;
    if (knockControl) {
      const [visitor, answer] = knockControl.split('|');
      const name = getKnocks().find((knock) => knock.visitor === visitor)?.name ?? 'They';
      answerKnock(visitor, answer === 'yes');
      message = answer === 'yes'
        ? `You let ${name} in. They can come in whenever they like.`
        : `You told ${name} not right now.`;
      render();
      return;
    }
    const leaveControl = target.closest<HTMLElement>('[data-door-leave]')?.dataset.doorLeave;
    if (leaveControl) {
      const name = remoteAvatarsInside(getSelfAccount()).find((guest) => guest.accountId === leaveControl)?.name ?? 'Your guest';
      askToLeave(leaveControl);
      message = `You asked ${name} to step out.`;
      render();
      return;
    }
    const mailboxStyle = target.closest<HTMLElement>('[data-mailbox-style]')?.dataset.mailboxStyle;
    if (mailboxStyle) {
      const look = getGameState().world.mailboxLook;
      const result = dispatchGameCommand({
        type: 'setMailboxLook', style: mailboxStyle, primary: look.primary, secondary: look.secondary,
      });
      message = result.ok ? result.message : result.reason;
      render();
      return;
    }
    const give = target.closest<HTMLElement>('[data-home-give]')?.dataset.homeGive as DwellingPartId | undefined;
    const refund = target.closest<HTMLElement>('[data-home-refund]')?.dataset.homeRefund as DwellingPartId | undefined;
    const down = target.closest<HTMLElement>('[data-home-down]')?.dataset.homeDown as DwellingPartId | undefined;
    const now = Date.now();
    if (give) {
      const result = dispatchGameCommand({ type: 'contributeToProject', partId: give, now });
      message = result.ok ? result.message : result.reason;
      if (result.ok) playCozySound('chime');
    } else if (refund) {
      const result = dispatchGameCommand({ type: 'refundProject', partId: refund, now });
      message = result.ok ? result.message : result.reason;
    } else if (down) {
      const name = dwellingPartDef(down).label.toLowerCase();
      if (!window.confirm(`Take down the ${name}? You get ${100 - DWELLING_REFUND_LOSS_PERCENT.finished}% of its materials back.`)) return;
      const result = dispatchGameCommand({ type: 'dismantlePart', partId: down, now });
      message = result.ok ? result.message : result.reason;
    } else {
      return;
    }
    render(now);
  });

  panel.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    if (target instanceof HTMLSelectElement && target.matches('[data-door-friends]')) {
      setHomePolicy({ friends: target.value as 'walk' | 'knock' | 'closed' });
    } else if (target instanceof HTMLSelectElement && target.matches('[data-door-others]')) {
      setHomePolicy({ others: target.value as 'knock' | 'closed' });
    } else if (target instanceof HTMLInputElement && target.matches('[data-door-open]')) {
      setHomePolicy({ open: target.checked });
    } else if (target instanceof HTMLInputElement && target.matches('[data-mailbox-primary]')) {
      const look = getGameState().world.mailboxLook;
      const result = dispatchGameCommand({
        type: 'setMailboxLook', style: look.style, primary: target.value, secondary: look.secondary,
      });
      message = result.ok ? result.message : result.reason;
      render();
    } else if (target instanceof HTMLInputElement && target.matches('[data-mailbox-secondary]')) {
      const look = getGameState().world.mailboxLook;
      const result = dispatchGameCommand({
        type: 'setMailboxLook', style: look.style, primary: look.primary, secondary: target.value,
      });
      message = result.ok ? result.message : result.reason;
      render();
    }
  });

  onGameStateChanged(() => render());
  subscribeGuests(() => render());
  render();
}

export function setHomePanelOpen(next: boolean) {
  if (next && !open) {
    openedHandler?.();
    message = 'Everything you put in stays yours: you can take it back at any time.';
  }
  open = next;
  render();
  if (next) panel?.querySelector<HTMLElement>('[data-close-home]')?.focus();
}

export function isHomePanelOpen() {
  return open;
}

export function closeHomePanel() {
  if (!open) return false;
  setHomePanelOpen(false);
  return true;
}

export function isWheelInsideHomePanel(event: WheelEvent) {
  return open && panel ? event.composedPath().includes(panel) : false;
}

/** Distance from the player to the outside of the tent. Zero indoors. */
export function distanceToHomeEdge(position: THREE.Vector3) {
  if (isIndoors()) return 0;
  const spot = homePosition(homePlace());
  return Math.max(0, Math.hypot(position.x - spot.x, position.z - spot.z) - HOME_BODY_RADIUS);
}

export function updateHomePrompt(position: THREE.Vector3, yieldToMaker = false) {
  if (!prompt) return;
  if (isVisiting()) {
    // A guest's only E is the way out (there is nothing of theirs to build here).
    prompt.hidden = !isNearInteriorExit(position);
    if (!prompt.hidden && prompt.textContent !== 'Press E to go outside') prompt.textContent = 'Press E to go outside';
    return;
  }
  prompt.hidden = open || yieldToMaker || !isNearHomePanel(position);
  if (prompt.hidden) return;
  const text = isIndoors()
    ? (isNearInteriorExit(position) ? 'Press E to go outside' : 'Press E to plan and build')
    : 'Press E to plan, build or go in';
  if (prompt.textContent !== text) prompt.textContent = text;
}

/**
 * Called every frame. Builds finish on a clock, so this settles anything whose
 * time has come (with a toast), and keeps "time left" fresh while the panel is
 * open, about once a second.
 */
export function updateHome(now = Date.now()) {
  const projects = Object.values(getGameState().world.dwelling.projects);
  if (projects.some((project) => project?.completesAt != null && now >= project.completesAt)) {
    const result = dispatchGameCommand({ type: 'settleDwelling', now });
    if (result.ok) {
      showPetToast(result.message);
      playCozySound('chime');
    }
  }
  if (open && now - lastTick >= 1000) {
    lastTick = now;
    render(now);
  }
}
