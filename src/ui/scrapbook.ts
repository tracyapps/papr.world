import { getResourceCount, onResourceInventoryChanged } from '../game/resourceInventory';
import {
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_ORDER,
  RESOURCE_DEFS,
  type ResourceCategoryId,
} from '../world/resources';
import type { ResourceId } from '../world/types';
import { TOOL_DEFS, type ToolId } from '../sim/catalogs/tools';
import { dispatchGameCommand } from '../sim/commands';
import { getGameState, onGameStateChanged } from '../sim/state';
import { SEED_DEFS, type SeedId } from '../sim/catalogs/seeds';
import { setActionMode } from '../game/actionMode';
import { getToolArt } from '../game/toolPresentation';
import { getResourceArt } from '../game/resourcePresentation';
import { requestHudLayout } from './hudLayout';
import { mailArrivesAt, mailAttachment, mailHasArrived, mailSubject, mailText } from '../sim/mail';
import {
  claimSharedMail,
  getSharedInventory,
  onSharedInventoryChanged,
} from '../net/sharedInventory';
import {
  getTrinketInstance,
  getTrinkets,
  pickUpTrinket,
  placeTrinket,
  trinketCount,
} from '../game/trinkets';
import { getTrinketDef, TRINKET_FAMILIES } from '../sim/catalogs/trinkets';
import { buildTrinketRig } from '../game/trinketRigs';
import { beginDropCarry } from '../game/dropPlacement';
import { getCurrentPageId } from '../world/streaming';
import { openMyPlayerCard } from './playerCard';

// The scrapbook is a strip of torn paper along the bottom of the screen, not
// a pop-up book. Rationale:
//
//  - It spans the full width, so a growing material list lays out along the
//    strip instead of forcing a bigger and bigger modal.
//  - Tabs keep categories findable once there are dozens of materials.
//  - Closing it hides the strip and everything in it, leaving a clean world
//    view for screenshots.
//
// Metadata stays in the world catalog, so a later icon pass only needs to map
// stable iconKey values to artwork.

const scrapbookDock = document.querySelector<HTMLElement>('#scrapbook-dock');
const scrapbookToggle = document.querySelector<HTMLButtonElement>('#scrapbook-toggle');
const stripElement = document.querySelector<HTMLElement>('#scrapbook-strip');
const tabsElement = document.querySelector<HTMLElement>('#scrapbook-tabs');
const panelElement = document.querySelector<HTMLElement>('#scrapbook-panel');

type TabId = ResourceCategoryId | 'tools' | 'trinkets' | 'mail';

type TabDefinition = {
  id: TabId;
  label: string;
  /** Short count rendered under the label. Null hides the line. */
  summary: () => string | null;
};

let scrapbookOpen = false;
let activeTab: TabId = 'sticks';
let mailMessage = '';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function resourcesInCategory(category: ResourceCategoryId) {
  return (Object.values(RESOURCE_DEFS) as typeof RESOURCE_DEFS[ResourceId][])
    .filter((resource) => resource.category === category);
}

function ownedTools(): ToolId[] {
  const state = getGameState();
  return (Object.keys(TOOL_DEFS) as ToolId[])
    .filter((toolId) => (state.player.tools[toolId] ?? 0) > 0);
}

const TABS: TabDefinition[] = [
  ...RESOURCE_CATEGORY_ORDER.map((categoryId): TabDefinition => ({
    id: categoryId,
    label: RESOURCE_CATEGORIES[categoryId].label,
    summary: () => {
      const resources = resourcesInCategory(categoryId);
      const found = resources.filter((resource) => getResourceCount(resource.id) > 0).length;
      return `${found}/${resources.length}`;
    },
  })),
  { id: 'tools', label: 'Tools', summary: () => String(ownedTools().length) },
  { id: 'trinkets', label: 'Trinkets', summary: () => String(trinketCount()) },
  { id: 'mail', label: 'Mail', summary: () => String(getGameState().player.mailbox.length) },
];

function renderTabs() {
  if (!tabsElement) return;
  tabsElement.innerHTML = TABS.map((tab) => {
    const selected = tab.id === activeTab;
    const summary = tab.summary();
    return `
      <button
        class="scrapbook-tab ${selected ? 'is-selected' : ''}"
        type="button"
        role="tab"
        id="scrapbook-tab-${tab.id}"
        data-scrapbook-tab="${tab.id}"
        aria-selected="${selected}"
        tabindex="${selected ? '0' : '-1'}"
      >
        <span class="scrapbook-tab-label">${tab.label}</span>
        ${summary ? `<span class="scrapbook-tab-count">${summary}</span>` : ''}
      </button>`;
  }).join('');
  panelElement?.setAttribute('aria-labelledby', `scrapbook-tab-${activeTab}`);
}

function renderMaterialsTab(categoryId: ResourceCategoryId) {
  const category = RESOURCE_CATEGORIES[categoryId];
  const items = resourcesInCategory(categoryId).map((resource) => {
    const count = getResourceCount(resource.id);
    const seed = resource.id in SEED_DEFS ? SEED_DEFS[resource.id as SeedId] : null;
    const selected = seed && getGameState().player.selectedSeed === seed.id;
    // The count speaks for itself — "12 tucked away" says nothing "12" does
    // not. Undiscovered items still need words, because a blank is ambiguous.
    const art = getResourceArt(resource.id);
    return `
      <li class="scrapbook-item ${count === 0 ? 'is-undiscovered' : ''}" data-icon-key="${resource.iconKey}">
        ${art
    ? `<img class="scrapbook-item-art" src="${art.sourceUrl}" alt="" aria-hidden="true">`
    : `<span class="scrapbook-item-icon" style="--material-color:${resource.mapColor}" aria-hidden="true"></span>`}
        <span class="scrapbook-item-copy">
          <strong>${resource.label}</strong>
          ${count === 0 ? '<small>Not found yet</small>' : ''}
        </span>
        ${count > 0 ? `<span class="scrapbook-item-count">${count.toLocaleString()}</span>` : ''}
        ${seed ? `
          <button class="scrapbook-item-action" type="button" data-select-seed="${seed.id}"
            aria-pressed="${selected}" ${count === 0 ? 'disabled' : ''}>${selected ? 'Selected' : 'Plant'}</button>
        ` : ''}
      </li>`;
  }).join('');

  return `
    <p class="scrapbook-panel-note">${category.description}</p>
    <ul class="scrapbook-items">${items}</ul>`;
}

function renderToolsTab() {
  const state = getGameState();
  const tools = ownedTools();
  if (tools.length === 0) {
    return '<p class="scrapbook-empty">Your first handmade tool will be tucked here.</p>';
  }
  return `<ul class="scrapbook-items">${tools.map((toolId) => {
    const tool = TOOL_DEFS[toolId];
    const equipped = state.player.equippedTool === toolId;
    const art = getToolArt(toolId);
    return `
      <li class="scrapbook-item" data-icon-key="${tool.iconKey}">
        ${art
    ? `<img class="scrapbook-item-art" src="${art.sourceUrl}" alt="" aria-hidden="true">`
    : '<span class="scrapbook-item-icon" style="--material-color:#8a7f6a" aria-hidden="true"></span>'}
        <span class="scrapbook-item-copy">
          <strong>${tool.name}</strong>
          <small>Tier ${tool.tier} · ${tool.verb}</small>
        </span>
        <button class="scrapbook-item-action" type="button" data-equip-tool="${toolId}" aria-pressed="${equipped}">
          ${equipped ? 'Equipped' : 'Equip'}
        </button>
      </li>`;
  }).join('')}</ul>`;
}

const diaryDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function diaryDate(timestamp: number): { datetime: string; label: string } {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return { datetime: '', label: 'Date unknown' };
  try {
    return { datetime: date.toISOString(), label: diaryDateFormatter.format(date) };
  } catch {
    return { datetime: '', label: 'Date unknown' };
  }
}

/** Whole minutes, never "0": a parcel due in 20 seconds is "under a minute". */
function arrivalLabel(arrivesAt: number) {
  const seconds = Math.max(0, Math.ceil((arrivesAt - Date.now()) / 1000));
  return seconds < 60 ? 'under a minute' : `about ${Math.ceil(seconds / 60)} min`;
}

function renderMailTab() {
  const state = getGameState();
  if (state.player.mailbox.length === 0) {
    return '<p class="scrapbook-empty">Your mailbox is empty. Letters and parcels will wait here whenever they arrive. Order refined materials by post from your mailbox outside.</p>';
  }
  return `
    ${mailMessage ? `<p class="scrapbook-mail-message" aria-live="polite">${escapeHtml(mailMessage)}</p>` : ''}
    <ol class="scrapbook-mail-list">${state.player.mailbox.map((mail) => {
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
          <time${date.datetime ? ` datetime="${date.datetime}"` : ''}>${date.label}</time>
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

/**
 * Trinkets: everything critters have given the player.
 *
 * Kept trinkets sit on the bio-card shelf and can be set down in the world;
 * placed ones can be taken back up. The two lists are the whole state — a
 * trinket is either kept or placed, never both.
 */
function renderTrinketsTab() {
  const trinkets = getTrinkets();
  if (trinkets.length === 0) {
    return '<p class="scrapbook-empty">No trinkets yet. Befriend a critter and it may ask a small favour — finished favours come back as little keepsakes.</p>';
  }
  const row = (trinket: (typeof trinkets)[number]) => {
    const def = getTrinketDef(trinket.defId);
    const label = def?.label ?? trinket.defId;
    const family = def ? TRINKET_FAMILIES[def.family].label : 'Trinket';
    const placed = trinket.placed !== null;
    const action = placed
      ? `<button type="button" data-pickup-trinket="${escapeHtml(trinket.id)}">Take back</button>`
      : `<button type="button" data-place-trinket="${escapeHtml(trinket.id)}">Set down here</button>`;
    return `
      <li class="scrapbook-item trinket-item">
        <span class="scrapbook-item-copy">
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(family)}${trinket.fromName ? ` · from ${escapeHtml(trinket.fromName)}` : ''}${placed ? ' · on display in the world' : ''}</small>
          ${def ? `<small class="trinket-note">${escapeHtml(def.description)}</small>` : ''}
        </span>
        ${action}
      </li>`;
  };
  return `
    <p class="scrapbook-panel-note">Trinkets are keepsakes, not goods — they cannot be sold. Set one down to decorate the world, or take it back to the shelf.</p>
    <p class="scrapbook-panel-note"><button type="button" class="scrapbook-inline-button" data-open-my-card>Show your bio card</button> — the shelf a visitor to your lot will see.</p>
    <ul class="scrapbook-items">${trinkets.map(row).join('')}</ul>`;
}

function renderPanel() {
  if (!panelElement) return;

  if (activeTab === 'tools') panelElement.innerHTML = renderToolsTab();
  else if (activeTab === 'trinkets') panelElement.innerHTML = renderTrinketsTab();
  else if (activeTab === 'mail') panelElement.innerHTML = renderMailTab();
  else panelElement.innerHTML = renderMaterialsTab(activeTab);
}

function render() {
  if (!scrapbookOpen) return;
  renderTabs();
  renderPanel();
}

function setActiveTab(tabId: TabId) {
  if (activeTab === tabId) return;
  activeTab = tabId;
  render();
}

/** Roving-tabindex arrow key support, per the ARIA tabs pattern. */
function handleTabKeydown(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();

  const index = TABS.findIndex((tab) => tab.id === activeTab);
  let next = index;
  if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
  if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = TABS.length - 1;

  setActiveTab(TABS[next].id);
  tabsElement?.querySelector<HTMLButtonElement>(`[data-scrapbook-tab="${TABS[next].id}"]`)?.focus();
}

export function isScrapbookOpen() {
  return scrapbookOpen;
}

export function setScrapbookOpen(open: boolean) {
  scrapbookOpen = open;
  scrapbookDock?.classList.toggle('is-open', open);
  stripElement?.setAttribute('aria-hidden', String(!open));
  scrapbookToggle?.setAttribute('aria-expanded', String(open));
  scrapbookToggle?.setAttribute('aria-label', open ? 'Close scrapbook' : 'Open scrapbook');
  if (open) render();
  // The strip changes how much bottom space is spoken for, so the tool rail
  // re-measures against it.
  requestHudLayout();
}

export function initializeScrapbook() {
  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    scrapbookDock?.addEventListener(eventName, (event) => event.stopPropagation());
  }

  scrapbookToggle?.addEventListener('click', () => setScrapbookOpen(!scrapbookOpen));

  tabsElement?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-scrapbook-tab]');
    if (button) setActiveTab(button.dataset.scrapbookTab as TabId);
  });
  tabsElement?.addEventListener('keydown', handleTabKeydown);
  panelElement?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    const mailId = target.closest<HTMLButtonElement>('[data-collect-mail]')?.dataset.collectMail;
    if (mailId) {
      const mail = getGameState().player.mailbox.find((entry) => entry.id === mailId);
      if (mail?.payload.inventoryAuthority === 'server') {
        const sent = claimSharedMail(mailId);
        mailMessage = sent
          ? 'The server is placing that parcel in your neighborhood pouch…'
          : 'Reconnect to the neighborhood before collecting this parcel.';
        render();
        return;
      }
      const result = dispatchGameCommand({ type: 'collectMail', mailId });
      mailMessage = result.ok ? result.message : result.reason;
      render();
      return;
    }

    if (target.closest('[data-open-my-card]')) {
      openMyPlayerCard();
      return;
    }

    const placeId = target.closest<HTMLButtonElement>('[data-place-trinket]')?.dataset.placeTrinket;
    if (placeId) {
      const instance = getTrinketInstance(placeId);
      const def = instance ? getTrinketDef(instance.defId) : null;
      if (instance && def) {
        // Close the book so there's a world to aim the ghost at — the same
        // reason build mode's own panel folds away while placing a piece.
        setScrapbookOpen(false);
        beginDropCarry({
          label: def.label,
          buildVisual: () => buildTrinketRig(def, instance.seed),
          groundOffset: 0.02, // matches trinketVisuals.ts's placed-trinket height
          rotatable: true,
          onDrop: (point, rotY) => {
            const placed = placeTrinket(instance.id, getCurrentPageId(), point.x, point.z, rotY);
            return placed
              ? { ok: true }
              : { ok: false, message: 'That trinket could not be placed.' };
          },
        });
      } else {
        mailMessage = 'That trinket could not be placed.';
        render();
      }
      return;
    }
    const pickupId = target.closest<HTMLButtonElement>('[data-pickup-trinket]')?.dataset.pickupTrinket;
    if (pickupId) {
      const picked = pickUpTrinket(pickupId);
      mailMessage = picked ? 'Back on the shelf it goes.' : 'That trinket is not out in the world.';
      render();
      return;
    }

    const seedId = target.closest<HTMLButtonElement>('[data-select-seed]')?.dataset.selectSeed as SeedId | undefined;
    if (seedId && seedId in SEED_DEFS) {
      const selected = getGameState().player.selectedSeed === seedId;
      dispatchGameCommand({ type: 'selectSeed', seedId: selected ? null : seedId });
      setActionMode(selected ? 'interact' : 'plant');
      render();
      return;
    }

    const toolId = target.closest<HTMLButtonElement>('[data-equip-tool]')?.dataset.equipTool as ToolId | undefined;
    if (toolId && toolId in TOOL_DEFS) {
      const equipped = getGameState().player.equippedTool === toolId;
      dispatchGameCommand({ type: 'equipTool', toolId: equipped ? null : toolId });
      const verb = TOOL_DEFS[toolId].verb;
      const mode = verb === 'dig'
        ? 'dig'
        : verb === 'plant'
          ? 'plant'
          : verb === 'trim'
            ? 'trim'
            : verb === 'mine'
              ? 'mine'
            : verb === 'build'
              ? 'place'
              : 'interact';
      setActionMode(equipped ? 'interact' : mode);
      render();
    }
  });

  onResourceInventoryChanged(render);
  onGameStateChanged(render);
  // Parcels in the post: refresh the Mail tab while one is on its way, so its
  // button turns into "Collect" by itself when it lands.
  window.setInterval(() => {
    if (!scrapbookOpen || activeTab !== 'mail') return;
    const now = Date.now();
    const waiting = getGameState().player.mailbox.some((mail) => !mailHasArrived(mail, now - 15_000));
    if (waiting) render();
  }, 15_000);
  onSharedInventoryChanged(render);
  setScrapbookOpen(false);
}
