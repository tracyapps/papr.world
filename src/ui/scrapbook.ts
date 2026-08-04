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
import { buildPlacesControls } from './placesPanel';
import { requestHudLayout } from './hudLayout';

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

type TabId = ResourceCategoryId | 'tools' | 'map' | 'plans';

type TabDefinition = {
  id: TabId;
  label: string;
  /** Short count rendered under the label. Null hides the line. */
  summary: () => string | null;
};

let scrapbookOpen = false;
let activeTab: TabId = 'sticks';
/** The places controls are stateful (live distance readout, current
 *  selection), so they are built once and re-parented rather than
 *  re-created on every tab switch. */
let placesContainer: HTMLElement | null = null;

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
  { id: 'map', label: 'Map', summary: () => null },
  { id: 'plans', label: 'Plans', summary: () => null },
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
    return `
      <li class="scrapbook-item ${count === 0 ? 'is-undiscovered' : ''}" data-icon-key="${resource.iconKey}">
        <span class="scrapbook-item-icon" style="--material-color:${resource.mapColor}" aria-hidden="true"></span>
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

function renderPanel() {
  if (!panelElement) return;

  // The map tab hosts live, stateful controls. Detach rather than destroy, so
  // the distance readout and current selection survive tab switches.
  if (placesContainer?.parentElement === panelElement) placesContainer.remove();

  if (activeTab === 'map') {
    panelElement.innerHTML = '';
    if (!placesContainer) placesContainer = buildPlacesControls();
    panelElement.append(placesContainer);
    return;
  }

  if (activeTab === 'tools') panelElement.innerHTML = renderToolsTab();
  else if (activeTab === 'plans') panelElement.innerHTML = renderPlansTab();
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
      setActionMode(equipped ? 'interact' : 'dig');
      render();
    }
  });

  onResourceInventoryChanged(render);
  onGameStateChanged(render);
  setScrapbookOpen(false);
}
