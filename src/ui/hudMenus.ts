import {
  CAMERA_SENSITIVITY_MAX,
  CAMERA_SENSITIVITY_MIN,
  UI_TEXT_SCALE_MAX,
  UI_TEXT_SCALE_MIN,
  getSetting,
  onSettingsChanged,
  setSetting,
} from '../game/settings';
import { openAvatarLookEditor } from '../game/avatarLook';
import { openFeedbackPanel } from './feedbackPanel';
import { openMultiplayerPanel } from './multiplayerPanel';

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
  overlay.hidden = true;
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
      <h3 class="hud-overlay-subhead">Alpha notebook</h3>
      <div class="hud-setting hud-setting-action">
        <button class="hud-setting-button" type="button" id="help-send-feedback">
          Send feedback…
        </button>
        <small>Report a bug, suggest an improvement, or leave a new idea. Notes survive an offline spell.</small>
      </div>
    </div>`;
  overlay.querySelector<HTMLButtonElement>('#help-send-feedback')?.addEventListener('click', () => {
    closeHudMenu();
    openFeedbackPanel();
  });
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
      <h3 class="hud-overlay-subhead">Display</h3>
      <div class="hud-setting hud-setting-slider">
        <label for="setting-ui-text-scale">
          <strong>UI size</strong>
          <small id="setting-ui-text-scale-hint">
            Resizes text in the map, chat, and menus — the browser's own text-size or zoom
            setting works alongside this
          </small>
        </label>
        <div class="hud-slider-row">
          <span class="hud-slider-end" aria-hidden="true">Smaller</span>
          <input
            type="range"
            id="setting-ui-text-scale"
            min="${UI_TEXT_SCALE_MIN}"
            max="${UI_TEXT_SCALE_MAX}"
            step="0.05"
            aria-describedby="setting-ui-text-scale-hint"
          >
          <span class="hud-slider-end" aria-hidden="true">Larger</span>
          <output for="setting-ui-text-scale" id="setting-ui-text-scale-value"></output>
        </div>
      </div>
      <h3 class="hud-overlay-subhead">Camera feel</h3>
      <label class="hud-setting">
        <input type="checkbox" id="setting-drag-mode">
        <span>
          <strong>Drag moves the world</strong>
          <small>Off: drag moves the camera instead (classic orbit)</small>
        </span>
      </label>
      <div class="hud-setting hud-setting-slider">
        <label for="setting-camera-sensitivity">
          <strong>Looking-around speed</strong>
          <small id="setting-camera-sensitivity-hint">
            How far the world turns for the same amount of drag or stick
          </small>
        </label>
        <div class="hud-slider-row">
          <span class="hud-slider-end" aria-hidden="true">Calm</span>
          <input
            type="range"
            id="setting-camera-sensitivity"
            min="${CAMERA_SENSITIVITY_MIN}"
            max="${CAMERA_SENSITIVITY_MAX}"
            step="0.05"
            aria-describedby="setting-camera-sensitivity-hint"
          >
          <span class="hud-slider-end" aria-hidden="true">Quick</span>
          <output for="setting-camera-sensitivity" id="setting-camera-sensitivity-value"></output>
        </div>
      </div>
      <h3 class="hud-overlay-subhead">You</h3>
      <div class="hud-setting hud-setting-action">
        <button class="hud-setting-button" type="button" id="setting-change-look">
          Change how you look…
        </button>
        <small>
          Pick a paper cutout shape, choose your paper, draw on yourself.
          Nothing is lost — old looks stay in your wardrobe.
        </small>
      </div>
      <h3 class="hud-overlay-subhead">Learning</h3>
      <label class="hud-setting">
        <input type="checkbox" id="setting-learning-timer">
        <span>
          <strong>Show the Professor's time note</strong>
          <small>Uses broad phrases like “about 6 hours left,” never a ticking countdown</small>
        </span>
      </label>
      <h3 class="hud-overlay-subhead">Friends</h3>
      <div class="hud-setting hud-setting-action">
        <button class="hud-setting-button" type="button" id="setting-play-with-friends">
          Play with friends…
        </button>
        <small>Open an invite-only neighborhood, enter a friend's code, or return safely to solo play.</small>
      </div>
      <h3 class="hud-overlay-subhead">Alpha notebook</h3>
      <div class="hud-setting hud-setting-action">
        <button class="hud-setting-button" type="button" id="setting-send-feedback">
          Send feedback…
        </button>
        <small>Report a bug, suggest an improvement, or leave a new idea. Notes survive an offline spell.</small>
      </div>
      <p class="hud-overlay-note">
        Coming here later: key remapping, gamepad mapping, invert stick look,
        and audio.
      </p>
    </div>`;

  const dragMode = overlay.querySelector<HTMLInputElement>('#setting-drag-mode');
  if (dragMode) {
    dragMode.checked = getSetting('cameraDragMode') === 'grab-world';
    dragMode.addEventListener('change', () => {
      setSetting('cameraDragMode', dragMode.checked ? 'grab-world' : 'move-camera');
    });
  }

  const sensitivity = overlay.querySelector<HTMLInputElement>('#setting-camera-sensitivity');
  const sensitivityValue = overlay.querySelector<HTMLOutputElement>(
    '#setting-camera-sensitivity-value',
  );
  if (sensitivity) {
    // A raw multiplier ("1.35") means nothing to a player, and a screen reader
    // announcing it means even less. Percent-of-normal is the same number in
    // a form you can act on.
    const describe = (value: number) => `${Math.round(value * 100)}% of normal speed`;
    const reflect = (value: number) => {
      sensitivity.setAttribute('aria-valuetext', describe(value));
      if (sensitivityValue) sensitivityValue.textContent = `${Math.round(value * 100)}%`;
    };

    sensitivity.value = String(getSetting('cameraSensitivity'));
    reflect(getSetting('cameraSensitivity'));

    sensitivity.addEventListener('input', () => {
      const value = Number(sensitivity.value);
      setSetting('cameraSensitivity', value);
      reflect(value);
    });
    // Arrow keys inside the overlay must not also drive the world.
    sensitivity.addEventListener('keydown', (event) => event.stopPropagation());
  }

  const textScale = overlay.querySelector<HTMLInputElement>('#setting-ui-text-scale');
  const textScaleValue = overlay.querySelector<HTMLOutputElement>('#setting-ui-text-scale-value');
  if (textScale) {
    const describe = (value: number) => `${Math.round(value * 100)}% text size`;
    const reflect = (value: number) => {
      textScale.setAttribute('aria-valuetext', describe(value));
      if (textScaleValue) textScaleValue.textContent = `${Math.round(value * 100)}%`;
    };

    textScale.value = String(getSetting('uiTextScale'));
    reflect(getSetting('uiTextScale'));

    textScale.addEventListener('input', () => {
      const value = Number(textScale.value);
      setSetting('uiTextScale', value);
      reflect(value);
    });
    textScale.addEventListener('keydown', (event) => event.stopPropagation());
  }

  const changeLook = overlay.querySelector<HTMLButtonElement>('#setting-change-look');
  changeLook?.addEventListener('click', () => {
    // The editor is its own modal; leaving settings open behind it would give
    // two dialogs and one Escape key. Close first, then hand over.
    closeHudMenu();
    openAvatarLookEditor();
  });

  const learningTimer = overlay.querySelector<HTMLInputElement>('#setting-learning-timer');
  if (learningTimer) {
    learningTimer.checked = getSetting('showLearningTimer');
    learningTimer.addEventListener('change', () => {
      setSetting('showLearningTimer', learningTimer.checked);
    });
  }
  overlay.querySelector<HTMLButtonElement>('#setting-send-feedback')?.addEventListener('click', () => {
    closeHudMenu();
    openFeedbackPanel();
  });
  overlay.querySelector<HTMLButtonElement>('#setting-play-with-friends')?.addEventListener('click', () => {
    closeHudMenu();
    openMultiplayerPanel();
  });
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
  const overlay = overlays.get(openMenu);
  if (overlay) overlay.hidden = true;
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
  overlay.hidden = false;
  overlay.classList.add('is-open');
  buttonFor(menu)?.setAttribute('aria-expanded', 'true');
  openMenu = menu;
  overlay.querySelector<HTMLElement>('.hud-overlay-close')?.focus();
}

/**
 * Applies the "UI size" setting to the whole document via one custom
 * property, rather than each panel reading the setting itself. Only rules
 * written in `rem` respond — see the rollout note on `Settings.uiTextScale`.
 */
function applyUiTextScale() {
  document.documentElement.style.setProperty('--ui-text-scale', String(getSetting('uiTextScale')));
}

export function initializeHudMenus() {
  helpButton?.addEventListener('click', () => openHudMenu('help'));
  settingsButton?.addEventListener('click', () => openHudMenu('settings'));

  for (const button of [helpButton, settingsButton]) {
    for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
      button?.addEventListener(eventName, (event) => event.stopPropagation());
    }
  }

  applyUiTextScale();
  onSettingsChanged(applyUiTextScale);
}
