// Player settings: typed, persisted, observable.
// This store is the permanent foundation; the temp DOM panel showing it
// is not. Planned residents (see technical-plan.md → Controls/Settings):
// keyboard remapping, gamepad remapping, invert camera X/Y for stick
// look, movement mode (camera- vs character-relative), and hold/toggle
// options for tools.
//
// `collapsedHudWidgets`, below. hudLayout.ts owns the
// collapse *capability* (what it means for a widget to be collapsed, and
// the collapse-all gesture); this store only remembers which ids are
// collapsed, the same division of labour as every other setting here.

export type CameraDragMode = 'grab-world' | 'move-camera';

/**
 * How the left tool bar is drawn:
 * - 'full': the tall dark rail running the whole left edge (the original).
 * - 'compact': a small floating palette — same tool art and shortcut badges,
 *   much smaller, only as tall as its tools (think Photoshop's tool bar).
 */
export type ToolbarStyle = 'full' | 'compact';

/**
 * Whether the on-screen touch controls are shown:
 * - 'auto': on when the primary pointer is coarse (`pointer: coarse`), which
 *   is the honest test for a tablet with no mouse attached. Default.
 * - 'on': shown regardless — for a touchscreen whose pointer query lies, or a
 *   tablet being driven with a mouse.
 * - 'off': never shown, for a tablet being used with a keyboard.
 */
export type TouchControlsMode = 'auto' | 'on' | 'off';

/**
 * The ground ring showing the walk-pickup radius (see `WALK_PICKUP_RADIUS`
 * in game/harvesting.ts, drawn by game/pickupRing.ts):
 * - 'auto': fades in as the camera zooms toward first person, and fades back
 *   out at normal orbit distance. Default — this is a first-person legibility
 *   aid, not clutter at the usual view.
 * - 'always': visible at any camera distance.
 * - 'off': never drawn.
 */
export type PickupRingVisibility = 'auto' | 'always' | 'off';

import { DEFAULT_NOTIFY_CATEGORIES, sanitizeNotifyCategories, type NotifyCategory } from '../ui/notifications';
import {
  ACTIONS,
  DEFAULT_GAMEPAD_BINDINGS,
  DEFAULT_KEY_BINDINGS,
  type ActionId,
} from './controlActions';

export type Settings = {
  /**
   * What a camera drag means:
   * - 'grab-world': dragging moves the world, like pushing paper around
   *   on a table (the "natural scrolling" feel). Default.
   * - 'move-camera': dragging moves the camera around the character
   *   (classic orbit-controls feel).
   */
  cameraDragMode: CameraDragMode;
  /**
   * Multiplier on every look gesture — pointer drag and gamepad stick alike.
   * 1 is the tuned baseline; the range exists because "how much world should
   * move per inch of hand" is a body question, not a taste question. Motion
   * sensitivity, trackpad versus mouse, and tremor all want different numbers.
   */
  cameraSensitivity: number;
  /**
   * Ids of HUD widgets the player has collapsed away. Empty by default —
   * every widget starts expanded. See knowledge-tree.md → "Collapsing the
   * HUD": every persistent widget should offer this, for players who want
   * the world without the furniture, and a collapsed widget must never
   * silently re-expand on its own.
   */
  collapsedHudWidgets: string[];
  /** Hide the Professor's coarse time label without hiding reading/idle state. */
  showLearningTimer: boolean;
  /**
   * Multiplier on interface text size (HUD panels, menus, overlays), applied
   * via a `--ui-text-scale` custom property on the document root. This is
   * deliberately separate from any panel's own width/height — resizing the
   * minimap, for instance, never touches this, and this never resizes a
   * panel's box. It stacks with the browser's own page zoom/text size,
   * rather than replacing it.
   *
   * Rollout note: only stylesheet rules written in `rem` respond to this.
   * That's the HUD surfaces sized in `rem` so far (minimap, saved places,
   * activity log, neighborhood chat, the help/settings overlays) — not yet
   * every panel in the game.
   */
  uiTextScale: number;
  /**
   * Multiplier on the size of the big HUD furniture — the tool bar and the
   * scrapbook dock (cover and open strip) — so small screens can give more
   * of themselves to the world. Separate from `uiTextScale`, which is text
   * only; this scales whole boxes, art and all. Published as
   * `--hud-ui-scale` by `hudLayout.ts`.
   */
  hudScale: number;
  /** Full-height rail or compact floating palette. See `ToolbarStyle`. */
  toolbarStyle: ToolbarStyle;
  /**
   * On-screen move pad, Act/Rotate and zoom buttons. See `TouchControlsMode`.
   * The gestures themselves (one-finger orbit, two-finger pinch) are not
   * gated by this — they are the same pointer events a mouse already sends,
   * and turning them off would mean turning off dragging.
   */
  touchControls: TouchControlsMode;
  /** See `PickupRingVisibility`. */
  pickupRingVisibility: PickupRingVisibility;
  /**
   * One KeyboardEvent.code per rebindable action (see game/controlActions.ts
   * for the full list and what each one does). Arrow keys and the numpad
   * zoom keys are NOT stored here — they're permanent secondary bindings
   * input.ts keeps working regardless, so losing this file or resetting to
   * defaults can never leave a player with no way to move or zoom.
   */
  keyBindings: Record<ActionId, string>;
  /** One gamepad button index per rebindable action, or null for unbound.
   *  Movement stays on the analog stick/dpad and is never in this map. */
  gamepadBindings: Record<ActionId, number | null>;
  /**
   * Multiplier on walking speed. 1 is the original, tuned pace; the range
   * exists for players who want to cover ground faster, or who'd rather
   * slow things down.
   */
  walkSpeedMultiplier: number;
  /** The first-run "this is an early alpha" card has been read. */
  alphaNoticeSeen: boolean;
  /**
   * Which kinds of news the Logs badge speaks up about. The default is other
   * people — messages, mail, and people waiting on you — because a badge that
   * counts your own journal is a running total nobody can clear. See
   * `ui/notifications.ts` for the model and the seen-marks it counts against.
   */
  notifyCategories: NotifyCategory[];
};

/** Slider bounds. Wide enough to matter at both ends, never zero. */
export const CAMERA_SENSITIVITY_MIN = 0.3;
export const CAMERA_SENSITIVITY_MAX = 2;

/** Text-size slider bounds — modest range, since this stacks with browser zoom. */
export const UI_TEXT_SCALE_MIN = 0.85;
export const UI_TEXT_SCALE_MAX = 1.4;

/** Interface-size slider bounds. Below ~0.6 the tool art stops reading. */
export const HUD_SCALE_MIN = 0.6;
export const HUD_SCALE_MAX = 1.2;

/** Walk-speed slider bounds. Below 0.6 movement starts feeling broken rather
 *  than deliberately slow; above 1.6 the run animation can't keep up. */
export const WALK_SPEED_MIN = 0.6;
export const WALK_SPEED_MAX = 1.6;

const DEFAULTS: Settings = {
  cameraDragMode: 'grab-world',
  cameraSensitivity: 1,
  collapsedHudWidgets: [],
  showLearningTimer: true,
  uiTextScale: 1,
  hudScale: 1,
  toolbarStyle: 'full',
  touchControls: 'auto',
  pickupRingVisibility: 'auto',
  keyBindings: { ...DEFAULT_KEY_BINDINGS },
  gamepadBindings: { ...DEFAULT_GAMEPAD_BINDINGS },
  walkSpeedMultiplier: 1,
  alphaNoticeSeen: false,
  notifyCategories: [...DEFAULT_NOTIFY_CATEGORIES],
};

const STORAGE_KEY = 'pencil-and-paper.settings.v1';

let settings: Settings | null = null;
const listeners: Array<() => void> = [];

function load(): Settings {
  if (settings) return settings;
  settings = { ...DEFAULTS };
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<Settings>;
      if (parsed.cameraDragMode === 'grab-world' || parsed.cameraDragMode === 'move-camera') {
        settings.cameraDragMode = parsed.cameraDragMode;
      }
      if (typeof parsed.cameraSensitivity === 'number' && Number.isFinite(parsed.cameraSensitivity)) {
        settings.cameraSensitivity = Math.min(
          CAMERA_SENSITIVITY_MAX,
          Math.max(CAMERA_SENSITIVITY_MIN, parsed.cameraSensitivity),
        );
      }
      if (Array.isArray(parsed.collapsedHudWidgets)) {
        settings.collapsedHudWidgets = parsed.collapsedHudWidgets.filter(
          (id): id is string => typeof id === 'string',
        );
      }
      if (typeof parsed.showLearningTimer === 'boolean') {
        settings.showLearningTimer = parsed.showLearningTimer;
      }
      if (typeof parsed.uiTextScale === 'number' && Number.isFinite(parsed.uiTextScale)) {
        settings.uiTextScale = Math.min(
          UI_TEXT_SCALE_MAX,
          Math.max(UI_TEXT_SCALE_MIN, parsed.uiTextScale),
        );
      }
      if (typeof parsed.hudScale === 'number' && Number.isFinite(parsed.hudScale)) {
        settings.hudScale = Math.min(HUD_SCALE_MAX, Math.max(HUD_SCALE_MIN, parsed.hudScale));
      }
      if (parsed.toolbarStyle === 'full' || parsed.toolbarStyle === 'compact') {
        settings.toolbarStyle = parsed.toolbarStyle;
      }
      // Validated the same way the other enums are: a stored value that is
      // not one of the three is ignored rather than trusted, so a hand-edited
      // or half-written localStorage entry falls back to 'auto' instead of
      // leaving the overlay in a state no code path can reason about.
      if (parsed.touchControls === 'auto' || parsed.touchControls === 'on' || parsed.touchControls === 'off') {
        settings.touchControls = parsed.touchControls;
      }
      if (
        parsed.pickupRingVisibility === 'auto'
        || parsed.pickupRingVisibility === 'always'
        || parsed.pickupRingVisibility === 'off'
      ) {
        settings.pickupRingVisibility = parsed.pickupRingVisibility;
      }
      // Merged onto the defaults rather than trusted whole: a saved file is
      // only ever a set of *overrides*, so an action added after someone
      // saved their bindings still comes back with a real default instead of
      // `undefined`, and a corrupted single entry can't take the rest of the
      // map down with it.
      if (parsed.keyBindings && typeof parsed.keyBindings === 'object') {
        for (const action of ACTIONS) {
          const value = (parsed.keyBindings as Partial<Record<ActionId, unknown>>)[action.id];
          if (typeof value === 'string' && value.length > 0) {
            settings.keyBindings[action.id] = value;
          }
        }
      }
      if (parsed.gamepadBindings && typeof parsed.gamepadBindings === 'object') {
        for (const action of ACTIONS) {
          const value = (parsed.gamepadBindings as Partial<Record<ActionId, unknown>>)[action.id];
          if (value === null || (typeof value === 'number' && Number.isInteger(value) && value >= 0)) {
            settings.gamepadBindings[action.id] = value;
          }
        }
      }
      if (typeof parsed.walkSpeedMultiplier === 'number' && Number.isFinite(parsed.walkSpeedMultiplier)) {
        settings.walkSpeedMultiplier = Math.min(
          WALK_SPEED_MAX,
          Math.max(WALK_SPEED_MIN, parsed.walkSpeedMultiplier),
        );
      }
      if (typeof parsed.alphaNoticeSeen === 'boolean') settings.alphaNoticeSeen = parsed.alphaNoticeSeen;
      // Always through the sanitiser: a missing key (older save), a non-array,
      // or ids that no longer exist all land on the defaults, while an honest
      // empty array — the player switched everything off — is kept.
      settings.notifyCategories = sanitizeNotifyCategories(parsed.notifyCategories);
    }
  } catch {
    // Defaults are fine.
  }
  return settings;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(load()));
  } catch {
    // Session-only settings if storage is unavailable.
  }
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return load()[key];
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  load()[key] = value;
  save();
  for (const listener of listeners) listener();
}

export function onSettingsChanged(listener: () => void) {
  listeners.push(listener);
}
