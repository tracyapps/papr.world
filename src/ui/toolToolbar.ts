import { TOOL_DEFS, highestOwnedTool, toolsInFamily, type ToolId } from '../sim/catalogs/tools';
import { dispatchGameCommand } from '../sim/commands';
import { getGameState, onGameStateChanged } from '../sim/state';
import { getActionMode, onActionModeChanged, setActionMode, type ActionMode } from '../game/actionMode';
import { showPetToast } from '../game/petting';
import { getToolArt, toolArtStyle, type ToolArtFrame } from '../game/toolPresentation';
import {
  SEED_DEFS,
  availableSeedSelection,
  carriedSeedIds,
  type SeedId,
} from '../sim/catalogs/seeds';
import { requestHudLayout } from './hudLayout';

const interactArtUrl = new URL('../../designs/arrows.svg', import.meta.url).href;
const tornPaperUrl = new URL('../../designs/paper-tear 2.svg', import.meta.url).href;

/**
 * Each rail slot is a *family*, not a tool.
 *
 * Read from the catalog rather than listed here, so a new rung on a ladder
 * appears in the rail without touching this file — and, more importantly, so
 * upgrading can never leave you still clicking the old tool because a
 * hardcoded id was missed.
 */
const SHOVEL_TOOL_IDS = toolsInFamily('shovel');
const HOE_TOOL_IDS = toolsInFamily('hoe');
const TRIM_TOOL_IDS = toolsInFamily('scissors');
const HAMMER_TOOL_IDS = toolsInFamily('hammer');

/**
 * How a slot decides whether the player may use it, and what it says when
 * they can't. A discriminated union so adding a tool family later is a data
 * change here rather than new branching inside the render loop.
 */
type SlotRequirement =
  | { kind: 'none' }
  | { kind: 'tool'; toolId: ToolId }
  /**
   * One slot, a family of tools, best one wins.
   *
   * Scissors come in two tiers that do the same job at different strengths,
   * and giving each its own slot would mean a rail where two of four buttons
   * are the same verb — and where upgrading silently leaves you clicking the
   * old one. Listed weakest first; the slot equips the best you own.
   */
  | { kind: 'anyTool'; toolIds: readonly ToolId[] };

type ToolbarSlot = {
  slot: number;
  label: string;
  /**
   * The action mode this slot represents. Every ActionMode must be covered by
   * exactly one slot — otherwise the game can enter a mode with no slot lit.
   * That was already happening: choosing a seed in the scrapbook set mode to
   * 'plant', but the rail only knew about 'interact' and 'dig', so it showed
   * nothing selected while the player was holding seeds.
   */
  mode: ActionMode | null;
  requires: SlotRequirement;
  artUrl?: string;
  artFrame?: ToolArtFrame;
};

const TOOLBAR_SLOTS: ToolbarSlot[] = [
  {
    slot: 1,
    label: 'Interact and move',
    mode: 'interact',
    requires: { kind: 'none' },
    artUrl: interactArtUrl,
    artFrame: { width: 116, left: 20, top: 1, rotate: -10 },
  },
  {
    slot: 2,
    label: 'Shovel',
    mode: 'dig',
    requires: { kind: 'anyTool', toolIds: SHOVEL_TOOL_IDS },
    artUrl: getToolArt(SHOVEL_TOOL_IDS[0])?.sourceUrl,
    artFrame: getToolArt(SHOVEL_TOOL_IDS[0])?.frame,
  },
  {
    slot: 3,
    label: 'Hoe',
    mode: 'plant',
    requires: { kind: 'anyTool', toolIds: HOE_TOOL_IDS },
    artUrl: getToolArt(HOE_TOOL_IDS[0])?.sourceUrl,
    artFrame: getToolArt(HOE_TOOL_IDS[0])?.frame,
  },
  {
    slot: 4,
    label: 'Scissors',
    mode: 'trim',
    requires: { kind: 'anyTool', toolIds: TRIM_TOOL_IDS },
    artUrl: getToolArt('kids-scissors')?.sourceUrl,
    artFrame: getToolArt('kids-scissors')?.frame,
  },
  {
    slot: 5,
    label: 'Build',
    mode: 'place',
    requires: { kind: 'anyTool', toolIds: HAMMER_TOOL_IDS },
    artUrl: getToolArt(HAMMER_TOOL_IDS[0])?.sourceUrl,
    artFrame: getToolArt(HAMMER_TOOL_IDS[0])?.frame,
  },
];

let toolbar: HTMLElement | null = null;
let seedSelector: HTMLElement | null = null;
// Design QA can render a stable visual state without changing a player's save.
// Vite removes this branch from production builds.
const previewSlot = import.meta.env.DEV
  ? Number(new URLSearchParams(window.location.search).get('toolbarPreview')) || null
  : null;

function ownsTool(toolId: ToolId) {
  return (getGameState().player.tools[toolId] ?? 0) > 0;
}

function heldSeed(): SeedId | null {
  const state = getGameState();
  return availableSeedSelection(state.player.selectedSeed, state.player.inventory);
}

/** Every seed the player is actually carrying, in catalog order. */
function heldSeeds(): SeedId[] {
  return carriedSeedIds(getGameState().player.inventory);
}

/** Short display name, e.g. "Raspberry Bush" from "Raspberry Bush Seeds". */
function seedShortName(seedId: SeedId): string {
  return SEED_DEFS[seedId].name.replace(/ Seeds$/, '');
}

/** The best owned tool from a family, or null when you own none of them. */
function bestOwnedTool(toolIds: readonly ToolId[]): ToolId | null {
  const first = toolIds[0];
  if (!first) return null;
  return highestOwnedTool(TOOL_DEFS[first].family, getGameState().player.tools);
}

/** Why the slot is currently unusable, or null when it is ready. */
function slotLock(slot: ToolbarSlot): string | null {
  switch (slot.requires.kind) {
    case 'tool':
      return ownsTool(slot.requires.toolId)
        ? null
        : `Make a ${TOOL_DEFS[slot.requires.toolId].name} in the Thing Maker first`;
    case 'anyTool':
      return bestOwnedTool(slot.requires.toolIds)
        ? null
        : `Make a ${TOOL_DEFS[slot.requires.toolIds[0]].name} in the Thing Maker first`;
    default:
      return null;
  }
}

export function selectToolSlot(slotNumber: number) {
  const slot = TOOLBAR_SLOTS.find((candidate) => candidate.slot === slotNumber);
  if (!slot?.mode) return false;

  const locked = slotLock(slot);
  if (locked) {
    showPetToast(locked);
    return true;
  }

  if (slot.requires.kind === 'tool') {
    dispatchGameCommand({ type: 'equipTool', toolId: slot.requires.toolId });
  }
  if (slot.requires.kind === 'anyTool') {
    dispatchGameCommand({ type: 'equipTool', toolId: bestOwnedTool(slot.requires.toolIds) });
  }
  // Reaching for the hoe with seeds in the scrapbook but none chosen picks
  // one up, so the common case (sow something) needs one click, while
  // deliberately putting seeds away leaves the hoe free to rake and lift.
  if (slot.mode === 'plant') {
    const state = getGameState();
    if (!state.player.selectedSeed) {
      const available = heldSeed();
      if (available) dispatchGameCommand({ type: 'selectSeed', seedId: available });
    }
  }
  setActionMode(slot.mode);
  renderToolbar();
  return true;
}

function renderToolbar() {
  if (!toolbar) return;
  const actionMode = getActionMode();
  for (const button of toolbar.querySelectorAll<HTMLButtonElement>('[data-tool-slot]')) {
    const slot = TOOLBAR_SLOTS.find((candidate) => candidate.slot === Number(button.dataset.toolSlot));
    if (!slot) continue;
    const active = previewSlot ? slot.slot === previewSlot : slot.mode === actionMode;
    const locked = Boolean(slot.mode && previewSlot !== slot.slot && slotLock(slot));
    button.classList.toggle('is-active', active);
    button.classList.toggle('is-locked', locked);
    button.setAttribute('aria-pressed', String(active));
    // Carry the locked state in the accessible name too: `is-locked` is a
    // visual-only treatment, so a screen reader would otherwise announce an
    // unavailable tool as ready to use.
    button.setAttribute(
      'aria-label',
      locked
        ? `${slot.label}, not available yet, shortcut ${slot.slot}`
        : `${slot.label}, shortcut ${slot.slot}`,
    );

    // A rail slot represents a family, so its drawing is the strongest rung
    // owned right now. Before the first craft, show the starter drawing faintly
    // as the locked affordance rather than falling back to unrelated cursor art.
    if (slot.requires.kind === 'anyTool') {
      const shownTool = bestOwnedTool(slot.requires.toolIds) ?? slot.requires.toolIds[0];
      const art = shownTool ? getToolArt(shownTool) : null;
      const image = button.querySelector<HTMLImageElement>('.tool-slot-art');
      if (image && art) {
        image.src = art.sourceUrl;
        image.style.cssText = toolArtStyle(art.frame);
        button.dataset.shownTool = shownTool;
      }
    }
  }
  renderSeedSelector();
}

function renderSeedSelector() {
  if (!seedSelector) return;
  const active = previewSlot ? previewSlot === 3 : getActionMode() === 'plant';
  seedSelector.hidden = !active;
  if (!active) return;

  const state = getGameState();
  const seeds = heldSeeds();
  if (seeds.length === 0) {
    seedSelector.innerHTML = `
      <span class="seed-selector-heading">Seed pouch</span>
      <span class="seed-selector-empty">No seeds in the scrapbook yet</span>`;
    return;
  }

  const selected = availableSeedSelection(state.player.selectedSeed, state.player.inventory);
  seedSelector.innerHTML = `
    <span class="seed-selector-heading">Plant</span>
    <div class="seed-selector-list" role="radiogroup" aria-label="Seed to plant">
      ${seeds.map((seedId) => {
    const count = state.player.inventory[seedId] ?? 0;
    const current = seedId === selected;
    const def = SEED_DEFS[seedId];
    const accent = 'accent' in def ? def.accent : '#79945d';
    return `
        <button class="seed-choice ${current ? 'is-selected' : ''}" type="button"
          data-select-toolbar-seed="${seedId}" role="radio" aria-checked="${current}"
          aria-label="${seedShortName(seedId)}, ${count} seed${count === 1 ? '' : 's'}">
          <span class="seed-choice-mark" style="--seed-accent:${accent}" aria-hidden="true"></span>
          <span class="seed-choice-name">${seedShortName(seedId)}</span>
          <span class="seed-choice-count" aria-hidden="true">×${count}</span>
        </button>`;
  }).join('')}
    </div>`;
}

export function initializeToolToolbar() {
  const app = document.querySelector<HTMLElement>('#app');
  if (!app || toolbar) return;

  toolbar = document.createElement('nav');
  toolbar.id = 'tool-toolbar';
  toolbar.className = 'tool-toolbar';
  toolbar.setAttribute('aria-label', 'Active tools');
  toolbar.innerHTML = `
    <img class="tool-toolbar-paper" src="${tornPaperUrl}" alt="" aria-hidden="true">
    <div class="tool-toolbar-slots">
      ${TOOLBAR_SLOTS.map((slot) => `
        <button class="tool-slot tool-slot-${slot.slot}" type="button" data-tool-slot="${slot.slot}" aria-pressed="false">
          ${slot.artUrl
    ? `<img class="tool-slot-art" src="${slot.artUrl}" alt=""${slot.artFrame ? ` style="${toolArtStyle(slot.artFrame)}"` : ''}>`
    : ''}
          <span class="tool-shortcut" aria-hidden="true">${slot.slot}</span>
        </button>`).join('')}
    </div>`;

  app.appendChild(toolbar);
  seedSelector = document.createElement('section');
  seedSelector.id = 'seed-selector';
  seedSelector.className = 'seed-selector';
  seedSelector.setAttribute('aria-label', 'Seeds in your scrapbook');
  seedSelector.hidden = true;
  app.appendChild(seedSelector);
  toolbar.addEventListener('pointerdown', (event) => event.stopPropagation());
  toolbar.addEventListener('pointerup', (event) => event.stopPropagation());
  toolbar.addEventListener('wheel', (event) => event.stopPropagation());
  toolbar.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tool-slot]');
    if (button) selectToolSlot(Number(button.dataset.toolSlot));
  });
  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    seedSelector.addEventListener(eventName, (event) => event.stopPropagation());
  }
  seedSelector.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-select-toolbar-seed]');
    const seedId = button?.dataset.selectToolbarSeed as SeedId | undefined;
    if (!seedId || !(seedId in SEED_DEFS)) return;
    dispatchGameCommand({ type: 'selectSeed', seedId });
    const hoe = bestOwnedTool(HOE_TOOL_IDS);
    if (hoe) dispatchGameCommand({ type: 'equipTool', toolId: hoe });
    setActionMode('plant');
  });

  onActionModeChanged(renderToolbar);
  onGameStateChanged(renderToolbar);
  renderToolbar();
  // The rail now has five slots; let the layout pass re-measure and rescale
  // it so the lowest one still clears the scrapbook dock.
  requestHudLayout();
}
