import { flushWardrobeSync } from '../net/accountWardrobe';
import {
  CAMERA_SENSITIVITY_MAX,
  CAMERA_SENSITIVITY_MIN,
  UI_TEXT_SCALE_MAX,
  UI_TEXT_SCALE_MIN,
  HUD_SCALE_MAX,
  HUD_SCALE_MIN,
  WALK_SPEED_MAX,
  WALK_SPEED_MIN,
  getSetting,
  onSettingsChanged,
  setSetting,
} from '../game/settings';
import {
  ACTIONS,
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_KEY_BINDINGS,
  actionDef,
  describeGamepadButton,
  describeKeyCode,
  type ActionId,
} from '../game/controlActions';
import { beginGamepadCapture, beginKeyCapture, cancelBindingCapture } from '../game/input';
import { openAvatarLookEditor, wearDesign } from '../game/avatarLook';
import { NOTIFY_CATEGORIES, sanitizeNotifyCategories, type NotifyCategory } from './notifications';
import { openWardrobePanel } from './avatarEditor/wardrobePanel';
import { openFeedbackPanel } from './feedbackPanel';
import { openMultiplayerPanel } from './multiplayerPanel';
import { disconnectSharedSession } from '../net/sharedSession';
import { accountDeskUrl } from '../net/accountDesk';
import { exportSaveBackup, parseSaveBackup, restoreSaveBackup } from '../sim/state';

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

/**
 * A row either names a fixed input directly (mouse, sticks, click) or names
 * an `ActionId` and lets the current keyboard binding fill in the `<kbd>` —
 * so this reference reads correctly however the player has remapped things,
 * instead of going stale the moment Settings → Controls changes a key.
 */
type ControlRow = [string, string] | { action: ActionId; description: string };

const CONTROLS: Array<{ group: string; rows: ControlRow[] }> = [
  {
    group: 'Moving around',
    rows: [
      { action: 'moveForward', description: 'Walk forward — arrow keys always work too' },
      { action: 'moveBack', description: 'Walk back' },
      { action: 'moveLeft', description: 'Walk left' },
      { action: 'moveRight', description: 'Walk right' },
      ['Left stick / D-pad', 'Walk (gamepad)'],
      ['Right-drag or middle-drag', 'Look around'],
      ['Left-drag empty space', 'Look around'],
      ['Right stick', 'Look around (gamepad)'],
      ['Mouse wheel', 'Zoom — all the way in becomes first person'],
      { action: 'zoomIn', description: 'Zoom in — Numpad + always works too' },
      { action: 'zoomOut', description: 'Zoom out — Numpad − always works too' },
      { action: 'rotate', description: 'Rotate a held piece, or tilt the view up' },
      { action: 'pitchDown', description: 'Tilt the view down' },
    ],
  },
  {
    group: 'Doing things',
    rows: [
      ['Left click', 'Use whatever is under the cursor'],
      ['1 – 4', 'Choose a tool slot'],
      { action: 'interact', description: 'Use the Thing Maker when you are near it' },
      { action: 'toggleScrapbook', description: 'Open and close the scrapbook' },
      { action: 'openMap', description: 'Open and close the map' },
      { action: 'markPlace', description: 'Mark this spot as a saved place, and guide you back to it' },
      { action: 'autoWalk', description: 'Toggle auto-walk — keep walking without holding a key' },
      ['Escape', 'Close what is open, then put your tools away'],
    ],
  },
];

function buildHelpOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'hud-overlay';
  overlay.hidden = true;
  const keyBindings = getSetting('keyBindings');
  const renderRow = (row: ControlRow) => {
    const [key, description] = Array.isArray(row)
      ? row
      : [describeKeyCode(keyBindings[row.action]), row.description];
    return `
            <div class="hud-controls-row">
              <dt><kbd>${key}</kbd></dt>
              <dd>${description}</dd>
            </div>`;
  };
  overlay.innerHTML = `
    <div class="hud-overlay-card" role="dialog" aria-modal="true" aria-labelledby="hud-help-title">
      <button class="hud-overlay-close" type="button" aria-label="Close help">×</button>
      <p class="hud-overlay-kicker">Pencil and Paper</p>
      <h2 id="hud-help-title">How to get around</h2>
      ${CONTROLS.map((section) => `
        <h3 class="hud-overlay-subhead">${section.group}</h3>
        <dl class="hud-controls-list">
          ${section.rows.map(renderRow).join('')}
        </dl>`).join('')}
      <p class="hud-overlay-note">Every key above, and gamepad buttons, can be changed in Settings → Controls.</p>
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
        <label for="setting-hud-scale">
          <strong>Interface size</strong>
          <small id="setting-hud-scale-hint">
            Shrinks or grows the tool bar and the scrapbook, to give small screens
            more room for the world
          </small>
        </label>
        <div class="hud-slider-row">
          <span class="hud-slider-end" aria-hidden="true">Smaller</span>
          <input
            type="range"
            id="setting-hud-scale"
            min="${HUD_SCALE_MIN}"
            max="${HUD_SCALE_MAX}"
            step="0.05"
            aria-describedby="setting-hud-scale-hint"
          >
          <span class="hud-slider-end" aria-hidden="true">Larger</span>
          <output for="setting-hud-scale" id="setting-hud-scale-value"></output>
        </div>
      </div>
      <label class="hud-setting">
        <input type="checkbox" id="setting-compact-toolbar">
        <span>
          <strong>Compact tool bar</strong>
          <small>A small floating tool palette instead of the full-height rail — the « button on the tool bar does the same</small>
        </span>
      </label>
      <div class="hud-setting hud-setting-slider">
        <label for="setting-ui-text-scale">
          <strong>Text size</strong>
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
      <h3 class="hud-overlay-subhead">Gameplay</h3>
      <div class="hud-setting hud-setting-select">
        <label for="setting-pickup-ring">
          <strong>Show pickup range on the ground</strong>
          <small id="setting-pickup-ring-hint">
            A faint ring at your feet showing how close you need to be to a
            resource before walking over it collects it
          </small>
        </label>
        <select id="setting-pickup-ring" aria-describedby="setting-pickup-ring-hint">
          <option value="auto">Only when zoomed in close</option>
          <option value="always">Always show it</option>
          <option value="off">Never show it</option>
        </select>
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
      <div class="hud-setting hud-setting-action">
        <button class="hud-setting-button" type="button" id="setting-open-wardrobe">
          Open your wardrobe…
        </button>
        <small>Wear a saved look again, rename or copy one, or choose which may appear on your player card.</small>
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
      <h3 class="hud-overlay-subhead">Notifications</h3>
      ${NOTIFY_CATEGORIES.map((category) => `
      <label class="hud-setting">
        <input type="checkbox" id="setting-notify-${category.id}" data-notify-category="${category.id}">
        <span>
          <strong>${category.label}</strong>
          <small>${category.blurb}</small>
        </span>
      </label>`).join('')}
      <p class="hud-overlay-note">
        The Logs bubble shows what is new since you last looked, not everything
        ever recorded. It starts with other people, because a badge that counts
        your own journal is a running total nobody can clear.
      </p>
      <h3 class="hud-overlay-subhead">Leaving</h3>
      <div class="hud-setting hud-setting-action">
        <button class="hud-setting-button" type="button" id="setting-return-to-desk">
          Return to your desk
        </button>
        <small>Leaves this world cleanly and takes you back to your account — you will not still look present here.</small>
      </div>
      <h3 class="hud-overlay-subhead">Your save</h3>
      <p class="hud-overlay-note save-scope-note">
        <strong>Saved on this browser:</strong> your tech tree, crafted tools,
        gathered resources, quests, gardens, and house upgrades do not follow
        your account to another browser yet. Home locations, shared placed
        builds, mail, friends, saved looks, and the Neighborhood Pouch are server-kept.
      </p>
      <div class="hud-setting hud-setting-action">
        <button class="hud-setting-button" type="button" id="setting-export-save">
          Download a backup
        </button>
        <small>Your scrapbook, gardens, and builds in this browser, saved to a file. Keep one somewhere safe — the alpha may need a reset now and then.</small>
      </div>
      <div class="hud-setting hud-setting-action">
        <button class="hud-setting-button" type="button" id="setting-restore-save">
          Restore from a backup…
        </button>
        <input type="file" id="setting-restore-file" accept=".json,application/json" hidden>
        <small>Replaces this browser’s save with a backup file. You will see what is in it before anything changes.</small>
        <div class="save-restore-review" id="setting-restore-review" role="status" aria-live="polite"></div>
      </div>
      <h3 class="hud-overlay-subhead">Alpha notebook</h3>
      <div class="hud-setting hud-setting-action">
        <button class="hud-setting-button" type="button" id="setting-send-feedback">
          Send feedback…
        </button>
        <small>Report a bug, suggest an improvement, or leave a new idea. Notes survive an offline spell.</small>
      </div>
      <h3 class="hud-overlay-subhead">Controls</h3>
      <div class="hud-setting hud-setting-slider">
        <label for="setting-walk-speed">
          <strong>Walking speed</strong>
          <small id="setting-walk-speed-hint">How fast you move on foot — separate from how fast the camera turns</small>
        </label>
        <div class="hud-slider-row">
          <span class="hud-slider-end" aria-hidden="true">Slower</span>
          <input
            type="range"
            id="setting-walk-speed"
            min="${WALK_SPEED_MIN}"
            max="${WALK_SPEED_MAX}"
            step="0.05"
            aria-describedby="setting-walk-speed-hint"
          >
          <span class="hud-slider-end" aria-hidden="true">Faster</span>
          <output for="setting-walk-speed" id="setting-walk-speed-value"></output>
        </div>
      </div>
      <p class="hud-overlay-note" id="controls-rebind-status" role="status" aria-live="polite"></p>
      <div class="hud-rebind-list" id="controls-rebind-list">
        <div class="hud-rebind-list-head" aria-hidden="true">
          <span></span><span>Keyboard</span><span>Gamepad</span>
        </div>
        ${ACTIONS.map((action) => `
        <div class="hud-rebind-row">
          <div class="hud-rebind-row-label">
            <strong>${action.label}</strong>
            ${action.hint ? `<small>${action.hint}</small>` : ''}
          </div>
          <button
            type="button"
            class="hud-rebind-button"
            data-rebind-key="${action.id}"
            aria-pressed="false"
            aria-label="${action.label}, keyboard: press to change"
          >${describeKeyCode(getSetting('keyBindings')[action.id])}</button>
          <button
            type="button"
            class="hud-rebind-button"
            data-rebind-gamepad="${action.id}"
            aria-pressed="false"
            aria-label="${action.label}, gamepad: press to change"
          >${describeGamepadButton(getSetting('gamepadBindings')[action.id])}</button>
        </div>`).join('')}
      </div>
      <div class="hud-setting hud-setting-action">
        <button class="hud-setting-button" type="button" id="setting-reset-controls">
          Reset controls to defaults
        </button>
        <small>Restores every key and gamepad button above, and walking speed, to how the game shipped.</small>
      </div>
      <p class="hud-overlay-note">
        Coming here later: invert stick look, and audio.
      </p>
    </div>`;

  const dragMode = overlay.querySelector<HTMLInputElement>('#setting-drag-mode');
  if (dragMode) {
    dragMode.checked = getSetting('cameraDragMode') === 'grab-world';
    dragMode.addEventListener('change', () => {
      setSetting('cameraDragMode', dragMode.checked ? 'grab-world' : 'move-camera');
    });
  }

  const pickupRing = overlay.querySelector<HTMLSelectElement>('#setting-pickup-ring');
  if (pickupRing) {
    pickupRing.value = getSetting('pickupRingVisibility');
    pickupRing.addEventListener('change', () => {
      const value = pickupRing.value;
      if (value === 'auto' || value === 'always' || value === 'off') {
        setSetting('pickupRingVisibility', value);
      }
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

  const hudScaleInput = overlay.querySelector<HTMLInputElement>('#setting-hud-scale');
  const hudScaleValue = overlay.querySelector<HTMLOutputElement>('#setting-hud-scale-value');
  if (hudScaleInput) {
    const describe = (value: number) => `${Math.round(value * 100)}% interface size`;
    const reflect = (value: number) => {
      hudScaleInput.setAttribute('aria-valuetext', describe(value));
      if (hudScaleValue) hudScaleValue.textContent = `${Math.round(value * 100)}%`;
    };
    hudScaleInput.value = String(getSetting('hudScale'));
    reflect(getSetting('hudScale'));
    hudScaleInput.addEventListener('input', () => {
      const value = Number(hudScaleInput.value);
      setSetting('hudScale', value);
      reflect(value);
    });
    hudScaleInput.addEventListener('keydown', (event) => event.stopPropagation());
  }

  const compactToolbar = overlay.querySelector<HTMLInputElement>('#setting-compact-toolbar');
  if (compactToolbar) {
    compactToolbar.checked = getSetting('toolbarStyle') === 'compact';
    compactToolbar.addEventListener('change', () => {
      setSetting('toolbarStyle', compactToolbar.checked ? 'compact' : 'full');
    });
    // The overlay is rebuilt on every open, so the tool bar's own « button
    // (which changes the same setting) is always reflected here on next open.
  }

  const changeLook = overlay.querySelector<HTMLButtonElement>('#setting-change-look');
  changeLook?.addEventListener('click', () => {
    // The editor is its own modal; leaving settings open behind it would give
    // two dialogs and one Escape key. Close first, then hand over.
    closeHudMenu();
    openAvatarLookEditor();
  });

  const openWardrobe = overlay.querySelector<HTMLButtonElement>('#setting-open-wardrobe');
  openWardrobe?.addEventListener('click', () => {
    closeHudMenu();
    openWardrobePanel({
      onWear: (design) => void wearDesign(design),
      onEdit: (design) => openAvatarLookEditor({ design }),
    });
  });

  const learningTimer = overlay.querySelector<HTMLInputElement>('#setting-learning-timer');
  if (learningTimer) {
    learningTimer.checked = getSetting('showLearningTimer');
    learningTimer.addEventListener('change', () => {
      setSetting('showLearningTimer', learningTimer.checked);
    });
  }

  // Notification categories are a set, not six booleans, so one switch's change
  // rewrites the whole array. The sanitiser re-sorts it into canonical order, so
  // the Settings list and the badge's spoken summary always agree.
  const notifyEnabled = new Set<NotifyCategory>(getSetting('notifyCategories'));
  for (const checkbox of overlay.querySelectorAll<HTMLInputElement>('[data-notify-category]')) {
    const category = checkbox.dataset.notifyCategory as NotifyCategory;
    checkbox.checked = notifyEnabled.has(category);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) notifyEnabled.add(category);
      else notifyEnabled.delete(category);
      setSetting('notifyCategories', sanitizeNotifyCategories([...notifyEnabled]));
    });
  }
  wireSaveBackup(overlay);
  overlay.querySelector<HTMLButtonElement>('#setting-send-feedback')?.addEventListener('click', () => {
    closeHudMenu();
    openFeedbackPanel();
  });
  overlay.querySelector<HTMLButtonElement>('#setting-play-with-friends')?.addEventListener('click', () => {
    closeHudMenu();
    openMultiplayerPanel();
  });
  overlay.querySelector<HTMLButtonElement>('#setting-return-to-desk')?.addEventListener('click', () => {
    // Same cleanup the "Return to solo play" button uses: leave the room for
    // real before navigating, so no stale presence lingers for anyone still
    // inside. Safe to call even when never connected (plain solo play).
    disconnectSharedSession();
    // Let the account receive any look saved moments ago before the desk reads it.
    void flushWardrobeSync().then(() => window.location.assign(accountDeskUrl()));
  });

  const walkSpeed = overlay.querySelector<HTMLInputElement>('#setting-walk-speed');
  const walkSpeedValue = overlay.querySelector<HTMLOutputElement>('#setting-walk-speed-value');
  if (walkSpeed) {
    const describe = (value: number) => `${Math.round(value * 100)}% walking speed`;
    const reflect = (value: number) => {
      walkSpeed.setAttribute('aria-valuetext', describe(value));
      if (walkSpeedValue) walkSpeedValue.textContent = `${Math.round(value * 100)}%`;
    };
    walkSpeed.value = String(getSetting('walkSpeedMultiplier'));
    reflect(getSetting('walkSpeedMultiplier'));
    walkSpeed.addEventListener('input', () => {
      const value = Number(walkSpeed.value);
      setSetting('walkSpeedMultiplier', value);
      reflect(value);
    });
    walkSpeed.addEventListener('keydown', (event) => event.stopPropagation());
  }

  wireControlsRebinding(overlay, walkSpeed);

  return overlay;
}

/**
 * The rebind rows under Settings → Controls. Each action gets two buttons —
 * one for its keyboard binding, one for its gamepad binding — that put
 * game/input.ts into capture mode on click and show whatever the next key
 * or button press turns out to be, via the same `beginKeyCapture` /
 * `beginGamepadCapture` the module exposes for exactly this. Nothing here
 * stops two actions sharing a key, but a rebind *onto* an already-used key
 * clears it from wherever it used to live first, so a press never silently
 * controls two things at once.
 */
function wireControlsRebinding(overlay: HTMLElement, walkSpeedInput: HTMLInputElement | null) {
  const status = overlay.querySelector<HTMLElement>('#controls-rebind-status');
  const announce = (message: string) => {
    if (status) status.textContent = message;
  };

  const keyButtons = new Map<ActionId, HTMLButtonElement>();
  const gamepadButtons = new Map<ActionId, HTMLButtonElement>();
  for (const action of ACTIONS) {
    const keyButton = overlay.querySelector<HTMLButtonElement>(`[data-rebind-key="${action.id}"]`);
    const gamepadButton = overlay.querySelector<HTMLButtonElement>(`[data-rebind-gamepad="${action.id}"]`);
    if (keyButton) keyButtons.set(action.id, keyButton);
    if (gamepadButton) gamepadButtons.set(action.id, gamepadButton);
  }

  function refreshRow(id: ActionId) {
    const keyButton = keyButtons.get(id);
    if (keyButton) keyButton.textContent = describeKeyCode(getSetting('keyBindings')[id]);
    const gamepadButton = gamepadButtons.get(id);
    if (gamepadButton) gamepadButton.textContent = describeGamepadButton(getSetting('gamepadBindings')[id]);
  }

  function refreshAll() {
    for (const action of ACTIONS) refreshRow(action.id);
  }

  // Tracked so a capture abandoned mid-listen (alt-tab away from the game
  // entirely) doesn't leave a button stuck reading "Press a key…" forever —
  // input.ts's own blur handler cancels the capture itself, but has no way
  // to tell this button's own display to stand down too.
  let listeningButton: HTMLButtonElement | null = null;
  function stopListening() {
    listeningButton?.classList.remove('is-listening');
    listeningButton?.setAttribute('aria-pressed', 'false');
    listeningButton = null;
  }
  window.addEventListener('blur', () => {
    if (!listeningButton) return;
    stopListening();
    refreshAll();
    announce('Rebind cancelled — the window lost focus.');
  });

  for (const [id, button] of keyButtons) {
    button.addEventListener('click', () => {
      cancelBindingCapture();
      stopListening();
      listeningButton = button;
      button.classList.add('is-listening');
      button.setAttribute('aria-pressed', 'true');
      button.textContent = 'Press a key…';
      announce(`${actionDef(id).label}: press any key, or Escape to cancel.`);
      beginKeyCapture((code) => {
        stopListening();
        if (code) {
          const bindings = { ...getSetting('keyBindings') };
          for (const other of ACTIONS) {
            if (other.id !== id && bindings[other.id] === code) bindings[other.id] = '';
          }
          bindings[id] = code;
          setSetting('keyBindings', bindings);
          announce(`${actionDef(id).label} is now ${describeKeyCode(code)}.`);
        } else {
          announce('Rebind cancelled.');
        }
        refreshAll();
      });
    });
  }

  for (const [id, button] of gamepadButtons) {
    button.addEventListener('click', () => {
      cancelBindingCapture();
      stopListening();
      listeningButton = button;
      button.classList.add('is-listening');
      button.setAttribute('aria-pressed', 'true');
      button.textContent = 'Press a button…';
      announce(`${actionDef(id).label}: press a gamepad button, or Escape on the keyboard to cancel.`);
      beginGamepadCapture((buttonIndex) => {
        stopListening();
        if (buttonIndex !== null) {
          const bindings = { ...getSetting('gamepadBindings') };
          for (const other of ACTIONS) {
            if (other.id !== id && bindings[other.id] === buttonIndex) bindings[other.id] = null;
          }
          bindings[id] = buttonIndex;
          setSetting('gamepadBindings', bindings);
          announce(`${actionDef(id).label} is now ${describeGamepadButton(buttonIndex)}.`);
        } else {
          announce('Rebind cancelled.');
        }
        refreshAll();
      });
    });
  }

  overlay.querySelector<HTMLButtonElement>('#setting-reset-controls')?.addEventListener('click', () => {
    cancelBindingCapture();
    stopListening();
    setSetting('keyBindings', { ...DEFAULT_KEY_BINDINGS });
    setSetting('gamepadBindings', { ...DEFAULT_GAMEPAD_BINDINGS });
    setSetting('walkSpeedMultiplier', 1);
    if (walkSpeedInput) {
      walkSpeedInput.value = '1';
      walkSpeedInput.dispatchEvent(new Event('input'));
    }
    refreshAll();
    announce('Controls reset to defaults.');
  });
}

/**
 * Download / restore a save backup (Settings → Your save). Restoring always
 * shows what the file holds and asks once more before replacing anything,
 * then reloads, because pages and panels are all built from the save.
 */
function wireSaveBackup(overlay: HTMLElement) {
  overlay.querySelector<HTMLButtonElement>('#setting-export-save')?.addEventListener('click', () => {
    const blob = new Blob([exportSaveBackup()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `papr-world-save-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const pick = overlay.querySelector<HTMLButtonElement>('#setting-restore-save');
  const file = overlay.querySelector<HTMLInputElement>('#setting-restore-file');
  const review = overlay.querySelector<HTMLElement>('#setting-restore-review');
  if (!pick || !file || !review) return;
  pick.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    file.value = '';
    if (!chosen) return;
    const parsed = parseSaveBackup(await chosen.text());
    if (!parsed.ok) {
      review.textContent = parsed.reason;
      return;
    }
    const { summary } = parsed;
    const when = summary.exportedAt ? new Date(summary.exportedAt).toLocaleString() : 'an unknown date';
    review.innerHTML = `
      <p>This backup is from <strong>${when}</strong>: ₡${summary.chips}, ${summary.materials} materials,
      ${summary.tools} tools, ${summary.gardenCells} planted cells, and ${summary.placedPieces} placed pieces.</p>
      <p>Restoring replaces everything in this browser’s current save.</p>
      <button class="hud-setting-button" type="button" data-restore-confirm>Replace my save with this backup</button>
      <button class="hud-setting-button" type="button" data-restore-cancel>Keep my current save</button>`;
    review.querySelector<HTMLButtonElement>('[data-restore-cancel]')?.addEventListener('click', () => {
      review.textContent = 'Nothing changed.';
    });
    review.querySelector<HTMLButtonElement>('[data-restore-confirm]')?.addEventListener('click', () => {
      restoreSaveBackup(parsed.state);
      review.textContent = 'Restored. Reloading…';
      window.setTimeout(() => window.location.reload(), 600);
    });
    review.querySelector<HTMLButtonElement>('[data-restore-confirm]')?.focus();
  });
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
 * Applies the "Text size" setting to the whole document via one custom
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
