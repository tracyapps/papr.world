import { getResourceCount, onResourceInventoryChanged } from '../game/resourceInventory';
import {
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_ORDER,
  RESOURCE_DEFS,
  type ResourceCategoryId,
} from '../world/resources';
import type { ResourceId } from '../world/types';
import { TOOL_DEFS, type ToolId } from '../sim/catalogs/tools';
import { RECIPE_DEFS, isRecipeAvailable, type RecipeId } from '../sim/catalogs/recipes';
import { dispatchGameCommand } from '../sim/commands';
import { getGameState, onGameStateChanged } from '../sim/state';
import { SEED_DEFS, type SeedId } from '../sim/catalogs/seeds';
import { setActionMode } from '../game/actionMode';
import { getToolArt } from '../game/toolPresentation';
import { getResourceArt } from '../game/resourcePresentation';
import { requestHudLayout } from './hudLayout';
import { buildDiaryGroups, type DiaryGroup } from './diaryView';
import { mailAttachment, mailSubject, mailText } from '../sim/mail';
import {
  claimSharedMail,
  getSharedInventory,
  onSharedInventoryChanged,
} from '../net/sharedInventory';

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

type TabId = ResourceCategoryId | 'tools' | 'plans' | 'diary' | 'mail' | 'pouch';

type TabDefinition = {
  id: TabId;
  label: string;
  /** Short count rendered under the label. Null hides the line. */
  summary: () => string | null;
};

let scrapbookOpen = false;
let activeTab: TabId = 'sticks';
let diarySearch = '';
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
  { id: 'plans', label: 'Plans', summary: () => null },
  { id: 'diary', label: 'Diary', summary: () => String(getGameState().player.diaryEntries.length) },
  { id: 'mail', label: 'Mail', summary: () => String(getGameState().player.mailbox.length) },
  {
    id: 'pouch',
    label: 'Neighborhood Pouch',
    summary: () => {
      const inventory = getSharedInventory();
      if (!inventory) return null;
      return String(Number(inventory.chips > 0)
        + [inventory.resources, inventory.tools, inventory.items]
          .reduce((total, bag) => total + Object.values(bag).filter((count) => count > 0).length, 0));
    },
  },
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

function renderPlansTab() {
  const state = getGameState();
  const plans = (state.player.plans as RecipeId[]).filter(isRecipeAvailable);
  if (plans.length === 0) {
    return '<p class="scrapbook-empty">Plans you discover will be pressed onto this page.</p>';
  }
  return `
    <p class="scrapbook-panel-note">Fold these at the Thing Maker.</p>
    <ul class="scrapbook-items">${plans.map((planId) => {
    const recipe = RECIPE_DEFS[planId];
    // `completedOutputs` holds recipe ids, not output labels — comparing
    // against the label silently marked every plan as never made.
    const made = state.world.thingMaker.completedOutputs.includes(recipe.id);
    return `
        <li class="scrapbook-item ${made ? '' : 'is-undiscovered'}">
          <span class="scrapbook-item-icon" style="--material-color:#a98455" aria-hidden="true"></span>
          <span class="scrapbook-item-copy">
            <strong>${recipe.name}</strong>
            <small>${recipe.planName}</small>
          </span>
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

function renderDiaryGroup(group: DiaryGroup) {
  const headingId = `diary-place-${encodeURIComponent(group.id)}`;
  return `
    <section class="scrapbook-diary-group" aria-labelledby="${headingId}">
      <h3 id="${headingId}">${escapeHtml(group.label)}</h3>
      <ol class="scrapbook-diary-entries">${group.entries.map((entry) => {
    const date = diaryDate(entry.recordedAt);
    return `
        <li class="scrapbook-diary-entry">
          <p>${escapeHtml(entry.text)}</p>
          <footer>
            <span><strong>${escapeHtml(entry.speakerLabel)}</strong> · ${escapeHtml(entry.topicLabel)}</span>
            <time${date.datetime ? ` datetime="${date.datetime}"` : ''}>${date.label}</time>
          </footer>
        </li>`;
  }).join('')}</ol>
    </section>`;
}

function renderDiaryResults() {
  const entries = getGameState().player.diaryEntries;
  const groups = buildDiaryGroups(entries, diarySearch);
  if (entries.length === 0) {
    return '<p class="scrapbook-empty">Ask a neighbor about a place and their useful stories will be kept here.</p>';
  }
  if (groups.length === 0) {
    return `<p class="scrapbook-empty">Nothing in the diary matches “${escapeHtml(diarySearch.trim())}”.</p>`;
  }
  return groups.map(renderDiaryGroup).join('');
}

function diaryResultCount() {
  return buildDiaryGroups(getGameState().player.diaryEntries, diarySearch)
    .reduce((total, group) => total + group.entries.length, 0);
}

function renderDiaryTab() {
  const count = getGameState().player.diaryEntries.length;
  const shown = diaryResultCount();
  return `
    <div class="scrapbook-diary-toolbar">
      <label for="scrapbook-diary-search">Search the diary</label>
      <input id="scrapbook-diary-search" type="search" value="${escapeHtml(diarySearch)}"
        placeholder="A critter, place, or story…" autocomplete="off">
      <span class="scrapbook-diary-count" aria-live="polite">${shown === count ? count : `${shown} of ${count}`} ${count === 1 ? 'story' : 'stories'} kept</span>
    </div>
    <div class="scrapbook-diary-results">${renderDiaryResults()}</div>`;
}

function renderMailTab() {
  const state = getGameState();
  if (state.player.mailbox.length === 0) {
    return '<p class="scrapbook-empty">Your mailbox is empty. Letters and parcels will wait here whenever they arrive.</p>';
  }
  return `
    ${mailMessage ? `<p class="scrapbook-mail-message" aria-live="polite">${escapeHtml(mailMessage)}</p>` : ''}
    <ol class="scrapbook-mail-list">${state.player.mailbox.map((mail) => {
    const attachment = mailAttachment(mail);
    const claimed = state.player.claimedMailIds.includes(mail.id);
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
            <button type="button" data-collect-mail="${escapeHtml(mail.id)}" ${claimed ? 'disabled' : ''}>
              ${claimed ? 'Collected' : sharedClaim ? 'Collect to neighborhood pouch' : 'Collect'}
            </button>
          </footer>` : ''}
      </li>`;
  }).join('')}</ol>`;
}

function renderPouchTab() {
  const inventory = getSharedInventory();
  if (!inventory) {
    return '<p class="scrapbook-empty">Visit a shared neighborhood to open your server-kept pouch.</p>';
  }
  const entries: Array<{ label: string; count: number }> = [];
  if (inventory.chips > 0) entries.push({ label: 'Shiny chips', count: inventory.chips });
  for (const [id, count] of Object.entries(inventory.resources)) {
    if (count <= 0) continue;
    const resource = RESOURCE_DEFS[id as ResourceId];
    entries.push({ label: resource?.label ?? id.replace(/[-_.]+/g, ' '), count });
  }
  for (const [id, count] of Object.entries(inventory.tools)) {
    if (count > 0) entries.push({ label: TOOL_DEFS[id as ToolId]?.name ?? id.replace(/[-_.]+/g, ' '), count });
  }
  for (const [id, count] of Object.entries(inventory.items)) {
    if (count > 0) entries.push({ label: id.replace(/[-_.]+/g, ' '), count });
  }
  return `
    <p class="scrapbook-panel-note">This pouch is kept by the neighborhood server, so its contents can be mailed safely. Your private solo scrapbook stays separate.</p>
    ${entries.length === 0
      ? '<p class="scrapbook-empty">Your neighborhood pouch is empty.</p>'
      : `<ul class="scrapbook-items">${entries
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((entry) => `<li class="scrapbook-item"><span class="scrapbook-item-copy"><strong>${escapeHtml(entry.label)}</strong><small>${entry.count}</small></span></li>`)
        .join('')}</ul>`}`;
}

function renderPanel() {
  if (!panelElement) return;

  if (activeTab === 'tools') panelElement.innerHTML = renderToolsTab();
  else if (activeTab === 'plans') panelElement.innerHTML = renderPlansTab();
  else if (activeTab === 'diary') panelElement.innerHTML = renderDiaryTab();
  else if (activeTab === 'mail') panelElement.innerHTML = renderMailTab();
  else if (activeTab === 'pouch') panelElement.innerHTML = renderPouchTab();
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
            : verb === 'build'
              ? 'place'
              : 'interact';
      setActionMode(equipped ? 'interact' : mode);
      render();
    }
  });

  panelElement?.addEventListener('input', (event) => {
    const input = (event.target as HTMLElement).closest<HTMLInputElement>('#scrapbook-diary-search');
    if (!input) return;
    diarySearch = input.value;
    const results = panelElement.querySelector<HTMLElement>('.scrapbook-diary-results');
    if (results) results.innerHTML = renderDiaryResults();
    const count = getGameState().player.diaryEntries.length;
    const countElement = panelElement.querySelector<HTMLElement>('.scrapbook-diary-count');
    if (countElement) {
      const shown = diaryResultCount();
      countElement.textContent = `${shown === count ? count : `${shown} of ${count}`} ${count === 1 ? 'story' : 'stories'} kept`;
    }
  });

  onResourceInventoryChanged(render);
  onGameStateChanged(render);
  onSharedInventoryChanged(render);
  setScrapbookOpen(false);
}
