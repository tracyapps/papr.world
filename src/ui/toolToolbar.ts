import { TOOL_DEFS, type ToolId } from '../sim/catalogs/tools';
import { dispatchGameCommand } from '../sim/commands';
import { getGameState, onGameStateChanged } from '../sim/state';
import { getActionMode, onActionModeChanged, setActionMode, type ActionMode } from '../game/actionMode';
import { showPetToast } from '../game/petting';
import { getToolArt, toolArtStyle, type ToolArtFrame } from '../game/toolPresentation';
import { SEED_DEFS, type SeedId } from '../sim/catalogs/seeds';
import { requestHudLayout } from './hudLayout';

const interactArtUrl = new URL('../../designs/arrows.svg', import.meta.url).href;
const tornPaperUrl = new URL('../../designs/paper-tear 2.svg', import.meta.url).href;

const SHOVEL_TOOL_ID: ToolId = 'flimsy-shovel';
const HOE_TOOL_ID: ToolId = 'creased-hoe';

/**
 * How a slot decides whether the player may use it, and what it says when
 * they can't. A discriminated union so adding a tool family later is a data
 * change here rather than new branching inside the render loop.
 */
type SlotRequirement =
  | { kind: 'none' }
  | { kind: 'tool'; toolId: ToolId };

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
    label: 'Flimsy Shovel',
    mode: 'dig',
    requires: { kind: 'tool', toolId: SHOVEL_TOOL_ID },
    artUrl: getToolArt(SHOVEL_TOOL_ID)?.sourceUrl,
    artFrame: getToolArt(SHOVEL_TOOL_ID)?.frame,
  },
  {
    slot: 3,
    label: 'Creased Hoe',
    mode: 'plant',
    requires: { kind: 'tool', toolId: HOE_TOOL_ID },
    artUrl: getToolArt(HOE_TOOL_ID)?.sourceUrl,
    artFrame: getToolArt(HOE_TOOL_ID)?.frame,
  },
  {
    slot: 4,
    label: 'Empty tool slot',
    mode: null,
    requires: { kind: 'none' },
  },
];

let toolbar: HTMLElement | null = null;
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
  const seedId = state.player.selectedSeed;
  if (seedId && (state.player.inventory[seedId] ?? 0) > 0) return seedId;
  // No seed chosen yet: fall back to the first one actually in the scrapbook,
  // so the slot works straight from the rail instead of only via the book.
  return (Object.keys(SEED_DEFS) as SeedId[])
    .find((candidate) => (state.player.inventory[candidate] ?? 0) > 0) ?? null;
}

/** Why the slot is currently unusable, or null when it is ready. */
function slotLock(slot: ToolbarSlot): string | null {
  switch (slot.requires.kind) {
    case 'tool':
      return ownsTool(slot.requires.toolId)
        ? null
        : `Make a ${TOOL_DEFS[slot.requires.toolId].name} in the Thing Maker first`;
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
  // Reaching for the hoe with seeds in the scrapbook but none chosen picks
  // one up, so the common case (sow something) needs one click, while
  // deliberately putting seeds away leaves the hoe free to rake and lift.
  if (slot.requires.kind === 'tool' && TOOL_DEFS[slot.requires.toolId].verb === 'plant') {
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
  }
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
  toolbar.addEventListener('pointerdown', (event) => event.stopPropagation());
  toolbar.addEventListener('pointerup', (event) => event.stopPropagation());
  toolbar.addEventListener('wheel', (event) => event.stopPropagation());
  toolbar.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-tool-slot]');
    if (button) selectToolSlot(Number(button.dataset.toolSlot));
  });

  onActionModeChanged(renderToolbar);
  onGameStateChanged(renderToolbar);
  renderToolbar();
  // The rail now has four slots; let the layout pass re-measure and rescale
  // it so the lowest one still clears the scrapbook dock.
  requestHudLayout();
}
