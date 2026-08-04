// Player settings: typed, persisted, observable.
// This store is the permanent foundation; the temp DOM panel showing it
// is not. Planned residents (see technical-plan.md → Controls/Settings):
// keyboard remapping, gamepad remapping, camera sensitivity, invert
// camera X/Y for stick look, movement mode (camera- vs character-
// relative), and hold/toggle options for tools.

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
};

const DEFAULTS: Settings = {
  cameraDragMode: 'grab-world',
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
