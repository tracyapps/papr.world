import { getSetting, setSetting } from '../game/settings';

// The two top-right icon buttons and the overlays they open.
//
// This replaces the persistent instructional text that used to sit in the
// HUD ("WASD, arrows, or left stick to move · Click to use · ..."). Controls
// reference is something a player needs once and then never again, so it
// lives behind the help icon rather than occupying the world view forever.
//
// The floating settings panel is gone the same way: it is now the cog
// overlay. Both overlays are modal-ish dialogs — they take focus, close on
// Escape, and are the only thing on screen besides the world.

type MenuId = 'help' | 'settings';

const helpButton = document.querySelector<HTMLButtonElement>('#hud-help');
const settingsButton = document.querySelector<HTMLButtonElement>('#hud-settings');

const overlays = new Map<MenuId, HTMLElement>();
let openMenu: MenuId | null = null;
/** Restores focus to whatever opened the overlay, per dialog convention. */
let lastFocused: HTMLElement | null = null;

const CONTROLS: Array<{ group: string; rows: Array<[string, string]> }> = [
  {
    group: 'Moving around',
    rows: [
      ['W A S D / arrows', 'Walk'],
      ['Left stick / D-pad', 'Walk (gamepad)'],
      ['Right-drag or middle-drag', 'Look around'],
      ['Left-drag empty space', 'Look around'],
      ['Right stick', 'Look around (gamepad)'],
      ['Mouse wheel', 'Zoom — all the way in becomes first person'],
      ['R / F', 'Tilt the view'],
    ],
  },
  {
    group: 'Doing things',
    rows: [
      ['Left click', 'Use whatever is under the cursor'],
      ['1 – 4', 'Choose a tool slot'],
      ['E', 'Use the Thing Maker when you are near it'],
      ['B', 'Open and close the scrapbook'],
      ['M', 'Mark this spot as a saved place'],
      ['Escape', 'Close what is open, then put your tools away'],
    ],
  },
];

function buildHelpOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'hud-overlay';
  overlay.innerHTML = `
    <div class="hud-overlay-card" role="dialog" aria-modal="true" aria-labelledby="hud-help-title">
      <button class="hud-overlay-close" type="button" aria-label="Close help">×</button>
      <p class="hud-overlay-kicker">Pencil and Paper</p>
      <h2 id="hud-help-title">How to get around</h2>
      ${CONTROLS.map((section) => `
        <h3 class="hud-overlay-subhead">${section.group}</h3>
        <dl class="hud-controls-list">
          ${section.rows.map(([key, description]) => `
            <div class="hud-controls-row">
              <dt><kbd>${key}</kbd></dt>
              <dd>${description}</dd>
            </div>`).join('')}
        </dl>`).join('')}
    </div>`;
  return overlay;
}

function buildSettingsOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'hud-overlay';
  overlay.innerHTML = `
    <div class="hud-overlay-card" role="dialog" aria-modal="true" aria-labelledby="hud-settings-title">
      <button class="hud-overlay-close" type="button" aria-label="Close settings">×</button>
      <p class="hud-overlay-kicker">Pencil and Paper</p>
      <h2 id="hud-settings-title">Settings</h2>
      <h3 class="hud-overlay-subhead">Camera feel</h3>
      <label class="hud-setting">
        <input type="checkbox" id="setting-drag-mode">
        <span>
          <strong>Drag moves the world</strong>
          <small>Off: drag moves the camera instead (classic orbit)</small>
        </span>
      </label>
      <p class="hud-overlay-note">
        Coming here later: key remapping, gamepad mapping, camera sensitivity,
        invert stick look, audio, and text size.
      </p>
    </div>`;

  const dragMode = overlay.querySelector<HTMLInputElement>('#setting-drag-mode');
  if (dragMode) {
    dragMode.checked = getSetting('cameraDragMode') === 'grab-world';
    dragMode.addEventListener('change', () => {
      setSetting('cameraDragMode', dragMode.checked ? 'grab-world' : 'move-camera');
    });
  }
  return overlay;
}

function overlayFor(menu: MenuId): HTMLElement {
  const existing = overlays.get(menu);
  if (existing) return existing;

  const overlay = menu === 'help' ? buildHelpOverlay() : buildSettingsOverlay();
  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    overlay.addEventListener(eventName, (event) => event.stopPropagation());
  }
  overlay.addEventListener('click', (event) => {
    // Click the backdrop or the close button to dismiss.
    if (event.target === overlay || (event.target as HTMLElement).closest('.hud-overlay-close')) {
      closeHudMenu();
    }
  });
  document.body.append(overlay);
  overlays.set(menu, overlay);
  return overlay;
}

function buttonFor(menu: MenuId) {
  return menu === 'help' ? helpButton : settingsButton;
}

export function isHudMenuOpen() {
  return openMenu !== null;
}

export function closeHudMenu(): boolean {
  if (!openMenu) return false;
  overlays.get(openMenu)?.classList.remove('is-open');
  buttonFor(openMenu)?.setAttribute('aria-expanded', 'false');
  openMenu = null;
  lastFocused?.focus();
  lastFocused = null;
  return true;
}

export function openHudMenu(menu: MenuId) {
  if (openMenu === menu) {
    closeHudMenu();
    return;
  }
  closeHudMenu();

  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const overlay = overlayFor(menu);
  overlay.classList.add('is-open');
  buttonFor(menu)?.setAttribute('aria-expanded', 'true');
  openMenu = menu;
  overlay.querySelector<HTMLElement>('.hud-overlay-close')?.focus();
}

export function initializeHudMenus() {
  helpButton?.addEventListener('click', () => openHudMenu('help'));
  settingsButton?.addEventListener('click', () => openHudMenu('settings'));

  for (const button of [helpButton, settingsButton]) {
    for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
      button?.addEventListener(eventName, (event) => event.stopPropagation());
    }
  }
}
