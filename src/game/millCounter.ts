import type * as THREE from 'three';
import { dispatchGameCommand } from '../sim/commands';
import { getGameState, onGameStateChanged } from '../sim/state';
import { RESOURCE_CORE_DEFS } from '../sim/catalogs/resources';
import { hasAbility } from '../sim/catalogs/recipes';
import { TECH_DEFS, techNodeTeachingAbility } from '../sim/catalogs/techTree';
import {
  MILL_MAIL,
  MILL_REFINEMENTS,
  affordableMillBatches,
  describeMillInputs,
  resourcesForTagInput,
  scaledMillInputs,
  type MillPayment,
  type MillRefinement,
} from '../sim/catalogs/millRefining';
import { MILL_POSITION } from '../world/millLayout';
import { playCozySound } from './cozyAudio';

/**
 * Chisel's counter at the Wood Mill — and the same board as a mail-order
 * catalog.
 *
 * One panel, two modes:
 * - **counter**: standing at the mill, trade raw stock for refined material
 *   on the spot;
 * - **mail**: from your mailbox (the scrapbook's Mail tab), order the same
 *   trades for a delivery fee, and a parcel arrives a little later.
 *
 * Built in script rather than index.html, but it wears the seed store's
 * paper-panel classes so the two counters in the world look like siblings.
 */

export type MillPanelMode = 'counter' | 'mail';

const MILL_REACH = 7;

let panel: HTMLElement | null = null;
let prompt: HTMLElement | null = null;
let open = false;
let mode: MillPanelMode = 'counter';
let message = '';
let payment: MillPayment = 'chips';
const batchChoice = new Map<string, number>();
let onOpenListeners: Array<() => void> = [];

export function isNearMill(position: THREE.Vector3) {
  return Math.hypot(position.x - MILL_POSITION.x, position.z - MILL_POSITION.z) < MILL_REACH;
}

/** Other panels that share this corner of the screen close when this opens. */
export function onMillPanelOpened(listener: () => void) {
  onOpenListeners.push(listener);
}

function batchesFor(refinement: MillRefinement) {
  const chosen = batchChoice.get(refinement.id) ?? 1;
  return Math.max(1, Math.min(MILL_MAIL.maxBatches, chosen));
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character
  ));
}

/** What the player holds that could fill a refinement's inputs, for the card. */
function holdingsLine(refinement: MillRefinement) {
  const inventory = getGameState().player.inventory;
  return refinement.inputs.map((input) => {
    if (input.kind === 'exact') {
      return `${RESOURCE_CORE_DEFS[input.resource].shortLabel}: ${inventory[input.resource] ?? 0}`;
    }
    const total = resourcesForTagInput(input).reduce((sum, id) => sum + (inventory[id] ?? 0), 0);
    return `${input.label}: ${total}`;
  }).join(' · ');
}

/** The lesson a locked trade waits on, or null when the trade is open. */
function lockedBy(refinement: MillRefinement): string | null {
  const ability = refinement.requiresAbility;
  if (!ability || hasAbility(getGameState().player.plans, ability)) return null;
  const lessonId = techNodeTeachingAbility(ability);
  return lessonId ? TECH_DEFS[lessonId].name : 'the right lesson';
}

function renderLockedCard(refinement: MillRefinement, lesson: string) {
  const output = RESOURCE_CORE_DEFS[refinement.output];
  const titleId = `mill-card-${refinement.id}`;
  // No controls at all: a row of disabled buttons is a row of dead ends for a
  // keyboard or screen-reader user. The card says what unlocks it instead.
  return `
    <article class="seed-shop-card mill-card is-locked" aria-labelledby="${titleId}">
      <span class="seed-shop-swatch" style="--seed-color: ${escapeHtml(mapColorFor(refinement))}" aria-hidden="true"></span>
      <div class="seed-shop-card-copy">
        <div class="seed-shop-card-title"><strong id="${titleId}">${escapeHtml(output.label)}</strong><span>Locked</span></div>
        <p>${escapeHtml(refinement.blurb)}</p>
        <p class="mill-card-trade"><span>Takes ${escapeHtml(describeMillInputs(refinement.inputs))}</span> <span aria-hidden="true">→</span> <span>gives ${refinement.quantity} ${escapeHtml(output.shortLabel)}</span></p>
        <p class="mill-card-holdings">Learn ${escapeHtml(lesson)} with the Professor to unlock this trade.</p>
      </div>
    </article>`;
}

function renderCard(refinement: MillRefinement) {
  const lockedLesson = lockedBy(refinement);
  if (lockedLesson) return renderLockedCard(refinement, lockedLesson);
  const state = getGameState();
  const byMail = mode === 'mail';
  const materialsFee = byMail && payment === 'materials';
  const batches = batchesFor(refinement);
  const affordable = affordableMillBatches(state.player.inventory, refinement, materialsFee);
  const feeShort = byMail && payment === 'chips' && state.player.chips < MILL_MAIL.feeChips;
  const inputs = scaledMillInputs(refinement, batches, materialsFee);
  const output = RESOURCE_CORE_DEFS[refinement.output];
  const gives = refinement.quantity * batches;
  const canDo = batches <= affordable && !feeShort;
  const verb = byMail ? 'Mail order' : 'Refine';
  const titleId = `mill-card-${refinement.id}`;
  return `
    <article class="seed-shop-card mill-card" aria-labelledby="${titleId}">
      <span class="seed-shop-swatch" style="--seed-color: ${escapeHtml(mapColorFor(refinement))}" aria-hidden="true"></span>
      <div class="seed-shop-card-copy">
        <div class="seed-shop-card-title"><strong id="${titleId}">${escapeHtml(output.label)}</strong><span>You have ${state.player.inventory[refinement.output] ?? 0}</span></div>
        <p>${escapeHtml(refinement.blurb)}</p>
        <p class="mill-card-trade"><span>Takes ${escapeHtml(describeMillInputs(inputs))}</span> <span aria-hidden="true">→</span> <span>gives ${gives} ${escapeHtml(output.shortLabel)}</span></p>
        <p class="mill-card-holdings">${escapeHtml(holdingsLine(refinement))}</p>
        <div class="seed-shop-quantity" role="group" aria-label="${escapeHtml(output.label)} batches">
          <span>Batches</span>
          <button type="button" data-mill-adjust="${refinement.id}" data-delta="-1" ${batches <= 1 ? 'disabled' : ''} aria-label="One batch fewer">−</button>
          <output aria-live="polite">${batches}</output>
          <button type="button" data-mill-adjust="${refinement.id}" data-delta="1" ${batches >= MILL_MAIL.maxBatches ? 'disabled' : ''} aria-label="One batch more">+</button>
          <button type="button" class="seed-shop-max" data-mill-max="${refinement.id}" ${affordable < 1 ? 'disabled' : ''}>Max</button>
        </div>
        <div class="seed-shop-actions">
          <button type="button" data-mill-refine="${refinement.id}" ${canDo ? '' : 'disabled'}>
            ${verb} ${gives} ${escapeHtml(output.shortLabel)}${byMail && payment === 'chips' ? ` · ₡${MILL_MAIL.feeChips}` : ''}
          </button>
        </div>
      </div>
    </article>`;
}

function mapColorFor(refinement: MillRefinement) {
  const colors: Record<string, string> = {
    'bound-lumber': '#6b4423',
    'binding-cord': '#b5745a',
    'soft-pulp': '#cfd9cf',
    'stone-aggregate': '#8a8f91',
    'paper-mortar': '#c29a6c',
    layerboard: '#8a5a34',
    'red-brick': '#b04a3a',
    'crossbound-timber': '#5a3a1e',
    'faced-masonry': '#7d7a76',
  };
  return colors[refinement.output] ?? '#9a7a55';
}

function render() {
  if (!panel) return;
  const state = getGameState();
  panel.classList.toggle('is-open', open);
  panel.setAttribute('aria-hidden', String(!open));
  const byMail = mode === 'mail';
  const title = panel.querySelector<HTMLElement>('[data-mill-title]');
  const kicker = panel.querySelector<HTMLElement>('[data-mill-kicker]');
  const ledger = panel.querySelector<HTMLElement>('[data-mill-ledger]');
  const messageElement = panel.querySelector<HTMLElement>('[data-mill-message]');
  const paymentElement = panel.querySelector<HTMLElement>('[data-mill-payment]');
  const cards = panel.querySelector<HTMLElement>('[data-mill-cards]');
  if (title) title.textContent = byMail ? 'Wood Mill mail order' : 'Chisel’s refining counter';
  if (kicker) kicker.textContent = byMail ? 'Order from your mailbox' : 'Chisel the woodchuck keeps the counter';
  if (ledger) {
    ledger.innerHTML = byMail
      ? `<strong>Your pouch · ₡${state.player.chips}</strong><span>Parcels arrive about ${Math.round(MILL_MAIL.deliveryMs / 60_000 * 10) / 10} min after you order.</span>`
      : `<strong>Your pouch · ₡${state.player.chips}</strong><span>Bring stock, take home refined. No charge at the counter.</span>`;
  }
  if (messageElement) messageElement.textContent = message;
  if (paymentElement) {
    paymentElement.hidden = !byMail;
    paymentElement.querySelectorAll<HTMLInputElement>('input[name="mill-payment"]').forEach((input) => {
      input.checked = input.value === payment;
    });
  }
  if (cards) cards.innerHTML = (MILL_REFINEMENTS as readonly MillRefinement[]).map(renderCard).join('');
}

export function setMillPanelOpen(next: boolean, nextMode: MillPanelMode = mode) {
  if (next && !open) {
    for (const listener of onOpenListeners) listener();
    message = nextMode === 'mail'
      ? '“Tell me what you need and I will wrap it in yesterday’s measurements.” — Chisel'
      : '“Raw in, refined out. Measure twice, trade once.” — Chisel';
  }
  open = next;
  mode = nextMode;
  render();
  if (next) panel?.querySelector<HTMLElement>('[data-close-mill]')?.focus();
}

export function isMillPanelOpen() {
  return open;
}

export function closeMillPanel() {
  if (!open) return false;
  setMillPanelOpen(false);
  return true;
}

export function isWheelInsideMillPanel(event: WheelEvent) {
  return open && panel ? event.composedPath().includes(panel) : false;
}

export function updateMillPrompt(position: THREE.Vector3) {
  if (!prompt) return;
  prompt.hidden = open || !isNearMill(position);
}

export function initializeMillCounter() {
  const app = document.querySelector<HTMLElement>('#app') ?? document.body;
  panel = document.createElement('aside');
  panel.className = 'seed-store-panel mill-counter-panel';
  panel.setAttribute('aria-label', 'Wood Mill refining');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <header class="seed-store-header">
      <div>
        <p class="panel-kicker" data-mill-kicker></p>
        <h1 data-mill-title></h1>
      </div>
      <button class="icon-button" type="button" data-close-mill aria-label="Close the Wood Mill panel">×</button>
    </header>
    <div class="seed-store-ledger" data-mill-ledger></div>
    <p class="seed-store-message" data-mill-message aria-live="polite"></p>
    <fieldset class="mill-payment" data-mill-payment hidden>
      <legend>Pay the delivery fee with</legend>
      <label><input type="radio" name="mill-payment" value="chips"> ₡${MILL_MAIL.feeChips} per order</label>
      <label><input type="radio" name="mill-payment" value="materials"> ${MILL_MAIL.extraPerInputLine} extra of each material it takes</label>
    </fieldset>
    <section class="seed-store-section">
      <div class="seed-store-section-heading">
        <h2>Refining board</h2>
        <span>Stock in, refined material out</span>
      </div>
      <div class="seed-store-stock" data-mill-cards></div>
    </section>`;
  app.append(panel);

  prompt = document.createElement('div');
  prompt.className = 'hint maker-prompt mill-prompt';
  prompt.hidden = true;
  prompt.textContent = 'Visit Chisel’s counter or press E';
  document.querySelector('.hud')?.append(prompt);

  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    panel.addEventListener(eventName, (event) => event.stopPropagation());
  }
  panel.addEventListener('keydown', (event) => {
    // Arrow keys and letters in the panel must not also drive the world.
    if (event.key !== 'Escape') event.stopPropagation();
  });
  panel.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name === 'mill-payment' && (input.value === 'chips' || input.value === 'materials')) {
      payment = input.value;
      render();
    }
  });
  panel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-close-mill]')) {
      setMillPanelOpen(false);
      return;
    }
    const adjust = target.closest<HTMLButtonElement>('[data-mill-adjust]');
    if (adjust?.dataset.millAdjust) {
      const id = adjust.dataset.millAdjust;
      batchChoice.set(id, (batchChoice.get(id) ?? 1) + Number(adjust.dataset.delta ?? 0));
      render();
      return;
    }
    const max = target.closest<HTMLButtonElement>('[data-mill-max]');
    if (max?.dataset.millMax) {
      const refinement = MILL_REFINEMENTS.find((entry) => entry.id === max.dataset.millMax);
      if (refinement) {
        const affordable = affordableMillBatches(getGameState().player.inventory, refinement, mode === 'mail' && payment === 'materials');
        batchChoice.set(refinement.id, Math.max(1, affordable));
      }
      render();
      return;
    }
    const refine = target.closest<HTMLButtonElement>('[data-mill-refine]');
    if (refine?.dataset.millRefine) {
      const refinement = MILL_REFINEMENTS.find((entry) => entry.id === refine.dataset.millRefine);
      if (!refinement) return;
      const result = dispatchGameCommand({
        type: 'refineAtMill',
        refinementId: refinement.id,
        batches: batchesFor(refinement),
        delivery: mode === 'mail' ? 'mail' : 'counter',
        payment,
        now: Date.now(),
      });
      message = result.ok ? result.message : result.reason;
      if (result.ok) {
        playCozySound('chime');
        batchChoice.set(refinement.id, 1);
      }
      render();
    }
  });

  onGameStateChanged(() => {
    if (open) render();
  });
  render();
}

/** Test/diagnostic seam: forget listeners (the panel is a singleton). */
export function resetMillCounterForTests() {
  onOpenListeners = [];
}
