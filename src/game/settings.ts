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
};

/** Slider bounds. Wide enough to matter at both ends, never zero. */
export const CAMERA_SENSITIVITY_MIN = 0.3;
export const CAMERA_SENSITIVITY_MAX = 2;

/** Text-size slider bounds — modest range, since this stacks with browser zoom. */
export const UI_TEXT_SCALE_MIN = 0.85;
export const UI_TEXT_SCALE_MAX = 1.4;

const DEFAULTS: Settings = {
  cameraDragMode: 'grab-world',
  cameraSensitivity: 1,
  collapsedHudWidgets: [],
  showLearningTimer: true,
  uiTextScale: 1,
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
