// A display case, opened: what is in it, what you may do with it, and (if it is
// yours) how it is set up. Reached by walking up and pressing E, or by clicking
// the case.
//
// Design: docs/house-and-home.md ("Display cases"). Everything a case shows
// is also said here in words. Nothing needs quick hands: taking is one press,
// and the answer, good or not, is a sentence that stays on the panel.

import * as THREE from 'three';
import { CASE_LIMIT_BOUNDS, DEFAULT_CASE_LIMIT, LIMITS, type CaseLimit, type CaseStackKind } from '../../shared/src/index';
import { getSharedInventory } from '../net/sharedInventory';
import { getSharedPieceVisual } from '../net/sharedPieceVisuals';
import { camera } from '../render/context';
import { getTrinketDef } from '../sim/catalogs/trinkets';
import { getGameState } from '../sim/state';
import {
  CASE_REACH,
  casesAvailable,
  describeAllowance,
  describeCaseItem,
  describeCaseRule,
  describeWait,
  getCaseNote,
  getCaseView,
  itemName,
  listCases,
  nearestCase,
  removeCaseItem,
  requestCaseDetail,
  setCase,
  setCasePanelOpen,
  showTrinketOn,
  stockCase,
  subscribeCases,
  takeFromCase,
  type CaseView,
} from './cases';
import { selfIsGuest } from './guests';
import { getPlacedPieceVisual } from './placedPieceInteractions';
import { beginGuestPanel, registerGuestPanel } from './panelSlot';
import { isIndoors } from './sceneTransition';
import { getTrinkets } from './trinkets';

let panel: HTMLElement | null = null;
let prompt: HTMLElement | null = null;
let open = false;
let targetKey = '';
let opener: HTMLElement | null = null;
let localMessage = '';
let renderedItems = '';
let renderedStock = '';
let renderedShow = '';
let renderedLog = '';
let renderedLimit = '';
let renderedLabel = '';
let lastTick = 0;

const slot = { close: closeCasePanel, element: () => panel };

const WINDOWS: Array<{ minutes: number; label: string }> = [
  { minutes: 60, label: 'hour' },
  { minutes: 6 * 60, label: '6 hours' },
  { minutes: 24 * 60, label: 'day' },
  { minutes: 3 * 24 * 60, label: '3 days' },
  { minutes: 7 * 24 * 60, label: 'week' },
];

const $ = <T extends HTMLElement>(selector: string): T | null => panel?.querySelector<T>(selector) ?? null;

function describeAgo(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

type StockChoice = { kind: CaseStackKind; itemId: string; label: string; count: number };

/** What the owner could put in: the stacks in the server-kept pouch, chips left out. */
function stockChoices(): StockChoice[] {
  const inventory = getSharedInventory();
  if (!inventory) return [];
  const choices: StockChoice[] = [];
  const add = (kind: CaseStackKind, bag: Record<string, number>) => {
    for (const [itemId, count] of Object.entries(bag)) {
      if (count > 0) choices.push({ kind, itemId, label: itemName(kind, itemId), count });
    }
  };
  add('resource', inventory.resources);
  add('tool', inventory.tools);
  add('item', inventory.items);
  return choices.sort((a, b) => a.label.localeCompare(b.label));
}

function view(): CaseView | null {
  return targetKey ? getCaseView(targetKey) : null;
}

// ---- Drawing ------------------------------------------------------------------

function renderItems(current: CaseView) {
  const host = $('[data-case-items]');
  if (!host) return;
  const guest = selfIsGuest();
  const remaining = current.detail?.remaining;
  const canTake = current.mode === 'free' && !current.mine;
  const blocked = guest || remaining === 0;
  const key = JSON.stringify([current.items, current.mine, current.mode, canTake, blocked]);
  if (key === renderedItems) return;
  renderedItems = key;
  const focused = document.activeElement instanceof HTMLElement && host.contains(document.activeElement)
    ? `${document.activeElement.dataset.caseAct}:${document.activeElement.dataset.index}`
    : null;
  if (current.items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'case-empty';
    empty.textContent = current.mine
      ? 'Nothing in this case yet.'
      : current.mode === 'free' ? 'There is nothing in this case right now.' : 'There are no keepsakes inside this case yet.';
    host.replaceChildren(empty);
    return;
  }
  host.replaceChildren(...current.items.map((item, index) => {
    const row = document.createElement('li');
    row.className = 'guest-row case-row';
    const name = document.createElement('span');
    name.className = 'case-row-name';
    name.textContent = describeCaseItem(item);
    if (item.kind === 'trinket') {
      const def = getTrinketDef(item.defId);
      if (def?.description) name.title = def.description;
    }
    row.append(name);
    const actions = document.createElement('span');
    actions.className = 'case-row-actions';
    if (canTake && item.kind !== 'trinket') {
      const take = document.createElement('button');
      take.type = 'button';
      take.dataset.caseAct = 'take';
      take.dataset.index = String(index);
      take.textContent = 'Take one';
      take.setAttribute('aria-label', `Take one ${itemName(item.kind, item.itemId)}`);
      if (blocked) take.setAttribute('aria-disabled', 'true');
      actions.append(take);
    }
    if (current.mine) {
      const back = document.createElement('button');
      back.type = 'button';
      back.dataset.caseAct = 'remove';
      back.dataset.index = String(index);
      back.classList.add('is-quiet');
      back.textContent = item.kind === 'trinket' ? 'Take out' : 'Take back';
      back.setAttribute('aria-label', `${back.textContent} ${describeCaseItem(item)}`);
      actions.append(back);
    }
    if (actions.childElementCount > 0) row.append(actions);
    return row;
  }));
  if (focused) host.querySelector<HTMLElement>(`[data-case-act="${focused.split(':')[0]}"][data-index="${focused.split(':')[1]}"]`)?.focus();
}

function setOptions(select: HTMLSelectElement, options: Array<{ value: string; label: string }>, placeholder: string) {
  const previous = select.value;
  select.replaceChildren(...(options.length === 0
    ? [Object.assign(document.createElement('option'), { value: '', textContent: placeholder })]
    : options.map((option) => Object.assign(document.createElement('option'), { value: option.value, textContent: option.label }))));
  if (options.some((option) => option.value === previous)) select.value = previous;
}

function renderOwner(current: CaseView) {
  const owner = $('[data-case-owner]');
  if (!owner) return;
  owner.hidden = !current.mine;
  if (!current.mine) return;

  const label = $<HTMLInputElement>('[data-case-label]');
  if (label && document.activeElement !== label && renderedLabel !== current.label) {
    label.value = current.label;
    renderedLabel = current.label;
  }

  const mode = $<HTMLSelectElement>('[data-case-mode]');
  const modeNote = $('[data-case-mode-note]');
  const shared = current.handle.source === 'shared' && casesAvailable();
  if (mode) {
    if (mode.value !== current.mode) mode.value = current.mode;
    const locked = current.items.length > 0 || !shared;
    mode.setAttribute('aria-disabled', String(locked));
    mode.dataset.locked = String(locked);
    if (modeNote) {
      modeNote.textContent = current.items.length > 0
        ? 'Empty the case first to change what it is for.'
        : !shared ? 'A free case needs a shared neighborhood, so neighbors have somewhere to take from.' : '';
    }
  }

  const freeBlock = $('[data-case-free]');
  const showBlock = $('[data-case-show]');
  if (freeBlock) freeBlock.hidden = current.mode !== 'free' || !shared;
  if (showBlock) showBlock.hidden = current.mode !== 'show';

  // Limit
  const limitKey = JSON.stringify(current.limit);
  if (current.mode === 'free' && renderedLimit !== limitKey) {
    const none = $<HTMLInputElement>('[data-case-limit-none]');
    const count = $<HTMLInputElement>('[data-case-limit-count]');
    const window = $<HTMLSelectElement>('[data-case-limit-window]');
    if (none && count && window && !panel?.contains(document.activeElement)) {
      const limit = current.limit;
      none.checked = limit === null;
      count.value = String(limit?.count ?? DEFAULT_CASE_LIMIT.count);
      const minutes = limit?.windowMinutes ?? DEFAULT_CASE_LIMIT.windowMinutes;
      const choices = WINDOWS.some((choice) => choice.minutes === minutes)
        ? WINDOWS
        : [...WINDOWS, { minutes, label: describeWait(minutes * 60_000).replace(/^in /, '') }].sort((a, b) => a.minutes - b.minutes);
      window.replaceChildren(...choices.map((choice) => Object.assign(document.createElement('option'), {
        value: String(choice.minutes), textContent: choice.label,
      })));
      window.value = String(minutes);
      count.disabled = none.checked;
      window.disabled = none.checked;
      renderedLimit = limitKey;
    }
  }

  // Stock (free) — options follow the pouch.
  const choices = stockChoices();
  const stockKey = JSON.stringify(choices);
  if (stockKey !== renderedStock) {
    renderedStock = stockKey;
    const select = $<HTMLSelectElement>('[data-case-stock-item]');
    if (select) {
      setOptions(select, choices.map((choice) => ({ value: `${choice.kind}:${choice.itemId}`, label: `${choice.label} (${choice.count} in your pouch)` })),
        'Your pouch is empty');
      select.disabled = choices.length === 0;
    }
  }

  // Keepsakes (show)
  const trinkets = getTrinkets();
  const showKey = JSON.stringify(trinkets.map((trinket) => trinket.id));
  if (showKey !== renderedShow) {
    renderedShow = showKey;
    const select = $<HTMLSelectElement>('[data-case-trinket]');
    if (select) {
      setOptions(select, trinkets.map((trinket) => ({ value: trinket.id, label: getTrinketDef(trinket.defId)?.label ?? 'A keepsake' })),
        'You have no keepsakes yet');
      select.disabled = trinkets.length === 0;
    }
  }

  // Log
  const logBlock = $('[data-case-log]');
  if (logBlock) logBlock.hidden = !(current.handle.source === 'shared' && current.mode === 'free');
  const log = current.detail?.log ?? [];
  const logKey = JSON.stringify(log);
  if (logKey !== renderedLog) {
    renderedLog = logKey;
    const list = $('[data-case-log-list]');
    if (list) {
      const now = Date.now();
      list.replaceChildren(...(log.length === 0
        ? [Object.assign(document.createElement('li'), { className: 'case-empty', textContent: 'Nobody has taken anything yet.' })]
        : log.map((entry) => Object.assign(document.createElement('li'), {
          className: 'case-log-line',
          textContent: `${entry.name} took ${entry.quantity === 1 ? 'one' : entry.quantity} ${itemName(entry.kind, entry.itemId)}, ${describeAgo(now - entry.at)}.`,
        }))));
    }
  }
}

function render(force = false) {
  if (!panel) return;
  panel.classList.toggle('is-open', open);
  panel.setAttribute('aria-hidden', String(!open));
  setCasePanelOpen(open);
  if (!open) return;
  const current = view();
  if (!current) {
    // The room went away, or the piece did: the case is simply not there.
    closeCasePanel();
    return;
  }
  if (force) {
    renderedItems = renderedStock = renderedShow = renderedLog = renderedLimit = renderedLabel = '';
  }
  const title = $('[data-case-title]');
  const kicker = $('[data-case-kicker]');
  if (title) title.textContent = current.label || 'Display case';
  if (kicker) kicker.textContent = current.mine ? 'Your display case' : 'Display case';
  const rule = $('[data-case-rule]');
  if (rule) rule.textContent = describeCaseRule(current);
  const allowance = $('[data-case-allowance]');
  const guestLine = current.mode === 'free' && !current.mine && selfIsGuest()
    ? 'You can look. Taking needs a paper passport, so there is somewhere to put it.'
    : describeAllowance(current);
  if (allowance) allowance.textContent = guestLine;
  const status = $('[data-case-status]');
  const message = localMessage || getCaseNote(targetKey);
  if (status && status.textContent !== message) status.textContent = message;
  renderItems(current);
  renderOwner(current);
}

// ---- Acting ---------------------------------------------------------------------

function readLimit(): CaseLimit | null | undefined {
  const none = $<HTMLInputElement>('[data-case-limit-none]');
  const count = $<HTMLInputElement>('[data-case-limit-count]');
  const window = $<HTMLSelectElement>('[data-case-limit-window]');
  if (!none || !count || !window) return undefined;
  if (none.checked) return null;
  const parsed = Math.floor(Number(count.value));
  if (!Number.isFinite(parsed) || parsed < CASE_LIMIT_BOUNDS.countMin || parsed > CASE_LIMIT_BOUNDS.countMax) {
    localMessage = `Choose between ${CASE_LIMIT_BOUNDS.countMin} and ${CASE_LIMIT_BOUNDS.countMax} items per visitor.`;
    return undefined;
  }
  return { count: parsed, windowMinutes: Number(window.value) || DEFAULT_CASE_LIMIT.windowMinutes };
}

function act(action: string, index: number, current: CaseView) {
  localMessage = '';
  if (action === 'take') {
    if (selfIsGuest()) localMessage = 'Guests have no pouch to put things in. Sign in to take from a case.';
    else if (current.detail?.remaining === 0) localMessage = describeAllowance(current);
    else takeFromCase(current.handle, index);
  } else if (action === 'remove') {
    removeCaseItem(current.handle, index);
  } else if (action === 'save-label') {
    setCase(current.handle, { label: $<HTMLInputElement>('[data-case-label]')?.value ?? '' });
  } else if (action === 'save-limit') {
    const limit = readLimit();
    if (limit !== undefined) setCase(current.handle, { limit });
  } else if (action === 'stock') {
    const select = $<HTMLSelectElement>('[data-case-stock-item]');
    const quantity = Math.floor(Number($<HTMLInputElement>('[data-case-stock-qty]')?.value));
    const [kind, ...rest] = (select?.value ?? '').split(':');
    const itemId = rest.join(':');
    const choice = stockChoices().find((entry) => entry.kind === kind && entry.itemId === itemId);
    if (!choice) localMessage = 'Choose something from your pouch first.';
    else if (!Number.isFinite(quantity) || quantity < 1) localMessage = 'Choose how many to put in.';
    else if (quantity > choice.count) localMessage = `You only have ${choice.count} in your pouch.`;
    else if (quantity > LIMITS.mailAttachmentMax) localMessage = 'That is more than one go can hold. Try a smaller number.';
    else stockCase(current.handle, choice.kind, choice.itemId, quantity);
  } else if (action === 'show') {
    const id = $<HTMLSelectElement>('[data-case-trinket]')?.value ?? '';
    if (!id) localMessage = 'Choose a keepsake first.';
    else showTrinketOn(current.handle, id);
  } else if (action === 'refresh') {
    requestCaseDetail(current.handle);
    localMessage = 'Asked the neighborhood for the latest.';
  }
  render(true);
}

export function initializeCasePanel() {
  const app = document.querySelector<HTMLElement>('#app') ?? document.body;
  panel = document.createElement('aside');
  panel.className = 'seed-store-panel home-panel case-panel';
  panel.setAttribute('aria-label', 'Display case');
  panel.setAttribute('aria-hidden', 'true');
  const windowOptions = WINDOWS.map((choice) => `<option value="${choice.minutes}">${choice.label}</option>`).join('');
  panel.innerHTML = `
    <header class="seed-store-header">
      <div>
        <p class="panel-kicker" data-case-kicker>Display case</p>
        <h1 data-case-title tabindex="-1">Display case</h1>
      </div>
      <button class="icon-button" type="button" data-close-case aria-label="Close this panel">×</button>
    </header>
    <p class="seed-store-message" data-case-rule></p>
    <p class="seed-store-message" data-case-allowance></p>
    <ul class="case-items" data-case-items aria-label="What is in the case"></ul>
    <p class="seed-store-message" data-case-status aria-live="polite"></p>
    <section class="case-owner guest-settings" data-case-owner hidden>
      <h2 class="case-heading">Set up this case</h2>
      <div class="case-field">
        <label for="case-label">Label</label>
        <input id="case-label" type="text" maxlength="${LIMITS.caseLabelMax}" data-case-label autocomplete="off" />
        <button type="button" data-case-act="save-label">Save label</button>
      </div>
      <div class="case-field">
        <label for="case-mode">What is it for?</label>
        <select id="case-mode" data-case-mode aria-describedby="case-mode-note">
          <option value="show">Showing keepsakes (look, do not take)</option>
          <option value="free">Giving things away (free to take)</option>
        </select>
        <p class="case-note" id="case-mode-note" data-case-mode-note></p>
      </div>
      <div data-case-free hidden>
        <h3 class="case-heading">How much each visitor may take</h3>
        <label class="guest-check"><input type="checkbox" data-case-limit-none /> No limit per visitor</label>
        <div class="case-field case-field-inline">
          <label for="case-limit-count">Items</label>
          <input id="case-limit-count" type="number" min="${CASE_LIMIT_BOUNDS.countMin}" max="${CASE_LIMIT_BOUNDS.countMax}" step="1" data-case-limit-count />
          <label for="case-limit-window">per visitor, per</label>
          <select id="case-limit-window" data-case-limit-window>${windowOptions}</select>
          <button type="button" data-case-act="save-limit">Save limit</button>
        </div>
        <h3 class="case-heading">Put something in from your pouch</h3>
        <div class="case-field case-field-inline">
          <label for="case-stock-item">Item</label>
          <select id="case-stock-item" data-case-stock-item></select>
          <label for="case-stock-qty">How many</label>
          <input id="case-stock-qty" type="number" min="1" step="1" value="1" data-case-stock-qty />
          <button type="button" data-case-act="stock">Put in case</button>
        </div>
      </div>
      <div data-case-show hidden>
        <h3 class="case-heading">Put a keepsake inside</h3>
        <p class="case-note">It stays on your shelf too. The case shows a copy inside.</p>
        <div class="case-field case-field-inline">
          <label for="case-trinket">Keepsake</label>
          <select id="case-trinket" data-case-trinket></select>
          <button type="button" data-case-act="show">Put inside case</button>
        </div>
      </div>
      <div data-case-log hidden>
        <h3 class="case-heading">Who took what</h3>
        <p class="case-note">Only you can see this.</p>
        <ul class="case-log" data-case-log-list></ul>
        <button type="button" class="is-quiet" data-case-act="refresh">Refresh</button>
      </div>
    </section>`;
  app.append(panel);

  prompt = document.createElement('div');
  prompt.className = 'hint maker-prompt mill-prompt';
  prompt.hidden = true;
  document.querySelector('.hud')?.append(prompt);

  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    panel.addEventListener(eventName, (event) => event.stopPropagation());
  }
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.target as HTMLElement).matches('[data-case-label]')) {
      event.preventDefault();
      const current = view();
      if (current) act('save-label', 0, current);
    }
    if (event.key !== 'Escape') event.stopPropagation();
  });
  panel.addEventListener('change', (event) => {
    const target = event.target as HTMLElement;
    const current = view();
    if (!current) return;
    if (target.matches('[data-case-mode]')) {
      const select = target as HTMLSelectElement;
      localMessage = '';
      if (select.getAttribute('aria-disabled') === 'true') {
        select.value = current.mode;
        localMessage = current.items.length > 0
          ? 'Empty the case first to change what it is for.'
          : 'A free case needs a shared neighborhood, so neighbors have somewhere to take from.';
      } else {
        setCase(current.handle, { mode: select.value === 'free' ? 'free' : 'show' });
      }
      render(true);
    } else if (target.matches('[data-case-limit-none]')) {
      const none = target as HTMLInputElement;
      const count = $<HTMLInputElement>('[data-case-limit-count]');
      const window = $<HTMLSelectElement>('[data-case-limit-window]');
      if (count) count.disabled = none.checked;
      if (window) window.disabled = none.checked;
    }
  });
  panel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-close-case]')) {
      closeCasePanel();
      return;
    }
    const button = target.closest<HTMLElement>('[data-case-act]');
    const current = view();
    if (!button || !current) return;
    act(button.dataset.caseAct ?? '', Number(button.dataset.index ?? 0), current);
  });

  registerGuestPanel(slot);
  subscribeCases(() => render());
}

export function openCasePanel(key: string) {
  if (!getCaseView(key)) return;
  if (!open) opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  beginGuestPanel(slot);
  targetKey = key;
  localMessage = '';
  open = true;
  const current = view();
  if (current) requestCaseDetail(current.handle);
  render(true);
  $('[data-case-title]')?.focus();
}

export function closeCasePanel(): boolean {
  if (!open) return false;
  open = false;
  targetKey = '';
  render();
  opener?.focus();
  opener = null;
  return true;
}

export function isCasePanelOpen() {
  return open;
}

/** E at a display case: open (or close) it. Returns whether there was a case to open. */
export function toggleCasePanelNear(position: { x: number; z: number }, page: string): boolean {
  if (isIndoors()) return false;
  const near = nearestCase(position, page);
  if (!near) return false;
  if (open && targetKey === near.handle.key) closeCasePanel();
  else openCasePanel(near.handle.key);
  return true;
}

/** Whether a case is within reach (so other E prompts can step back for it). */
export function isNearCase(position: { x: number; z: number }, page: string): boolean {
  return !isIndoors() && nearestCase(position, page) !== null;
}

/** Called every frame: the prompt near a case, and a gentle refresh while the panel is open. */
export function updateCasePrompt(position: { x: number; z: number }, page: string, yieldToOthers = false, now = Date.now()) {
  if (open && now - lastTick >= 500) {
    lastTick = now;
    render();
  }
  if (!prompt) return;
  const near = open || yieldToOthers || isIndoors() ? null : nearestCase(position, page);
  prompt.hidden = near === null;
  if (!near) return;
  const text = near.label ? `Press E at the display case: ${near.label}` : 'Press E at the display case';
  if (prompt.textContent !== text) prompt.textContent = text;
}

// ---- Clicking a case in the world ---------------------------------------------------

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/** The case under a screen point, if any. */
export function pickCaseAtScreen(clientX: number, clientY: number): CaseView | null {
  if (isIndoors()) return null;
  const candidates: Array<{ object: THREE.Object3D; view: CaseView }> = [];
  for (const current of listCases()) {
    const shared = current.handle.source === 'shared' ? getSharedPieceVisual(current.handle.id) : null;
    const local = getPlacedPieceVisual(current.handle.id);
    if (shared) candidates.push({ object: shared, view: current });
    if (local) candidates.push({ object: local, view: current });
    // A shared case is drawn by the owner's own local piece at the same spot.
    if (current.handle.source === 'shared') {
      for (const page of Object.values(getGameState().world.pages)) {
        for (const piece of Object.values(page.placedPieces)) {
          if (piece.templateKey !== 'display-case') continue;
          if (Math.abs(piece.x - current.handle.x) > 0.01 || Math.abs(piece.z - current.handle.z) > 0.01) continue;
          const object = getPlacedPieceVisual(piece.id);
          if (object) candidates.push({ object, view: current });
        }
      }
    }
  }
  if (candidates.length === 0) return null;
  pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(candidates.map((candidate) => candidate.object), true);
  for (const hit of hits) {
    let node: THREE.Object3D | null = hit.object;
    while (node) {
      const found = candidates.find((candidate) => candidate.object === node);
      if (found) return found.view;
      node = node.parent;
    }
  }
  return null;
}

/** A click on a case: open it when you are close enough to use it, else say to walk up. */
export function openCaseFromClick(current: CaseView, position: { x: number; z: number }, say: (text: string) => void): boolean {
  const near = Math.hypot(current.handle.x - position.x, current.handle.z - position.z) <= CASE_REACH + 1.5;
  if (!near) {
    say('Walk up to the display case to open it.');
    return true;
  }
  openCasePanel(current.handle.key);
  return true;
}
