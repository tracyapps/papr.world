// The rebindable action registry — one list both the settings UI and
// game/input.ts read from, so a new action can never exist in one without
// the other. Deliberately excludes Escape (a universal, non-negotiable
// "back/cancel" everywhere else on the web) and the Digit1-9 tool-slot row
// (systematic — "whichever slot is under this number" isn't a single key to
// rebind, and letting go of that regularity would make the tool rail itself
// harder to learn, not easier).
export type ActionId =
  | 'moveForward'
  | 'moveBack'
  | 'moveLeft'
  | 'moveRight'
  | 'interact'
  | 'toggleScrapbook'
  | 'openMap'
  | 'markPlace'
  | 'rotate'
  | 'pitchDown'
  | 'zoomIn'
  | 'zoomOut'
  | 'autoWalk';

export type ActionDef = {
  id: ActionId;
  label: string;
  hint: string;
  /** Whether R's other job — camera pitch — still applies when this fires
   *  with nothing to rotate. Purely descriptive; input.ts owns the fallback. */
  group: 'movement' | 'camera' | 'actions';
};

export const ACTIONS: readonly ActionDef[] = [
  { id: 'moveForward', label: 'Move forward', hint: 'Arrow Up always works too', group: 'movement' },
  { id: 'moveBack', label: 'Move back', hint: 'Arrow Down always works too', group: 'movement' },
  { id: 'moveLeft', label: 'Move left', hint: 'Arrow Left always works too', group: 'movement' },
  { id: 'moveRight', label: 'Move right', hint: 'Arrow Right always works too', group: 'movement' },
  { id: 'rotate', label: 'Rotate / look up', hint: 'Rotates a piece while building, tilts the camera up otherwise', group: 'camera' },
  { id: 'pitchDown', label: 'Look down', hint: 'Tilts the camera down', group: 'camera' },
  { id: 'zoomIn', label: 'Zoom in', hint: 'Numpad + always works too', group: 'camera' },
  { id: 'zoomOut', label: 'Zoom out', hint: 'Numpad − always works too', group: 'camera' },
  { id: 'interact', label: 'Interact', hint: 'Talk, harvest, use the equipped tool', group: 'actions' },
  { id: 'toggleScrapbook', label: 'Open scrapbook', hint: '', group: 'actions' },
  { id: 'openMap', label: 'Open map', hint: '', group: 'actions' },
  { id: 'markPlace', label: 'Mark this spot', hint: 'Adds a waypoint here', group: 'actions' },
  { id: 'autoWalk', label: 'Toggle auto-walk', hint: 'Keeps walking without holding a key', group: 'actions' },
];

/** Keyboard defaults — exactly the codes that were hardcoded before rebinding
 *  existed, so nobody's muscle memory changes until they choose to remap. */
export const DEFAULT_KEY_BINDINGS: Record<ActionId, string> = {
  moveForward: 'KeyW',
  moveBack: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  rotate: 'KeyR',
  pitchDown: 'KeyF',
  zoomIn: 'Equal',
  zoomOut: 'Minus',
  interact: 'KeyE',
  toggleScrapbook: 'KeyI',
  openMap: 'KeyM',
  markPlace: 'KeyG',
  autoWalk: 'CapsLock',
};

/**
 * Gamepad defaults — standard-layout button indices (the Gamepad API's
 * "standard" mapping: 0-3 face buttons, 4/5 bumpers, 6/7 triggers, 8/9
 * select/start, 10/11 stick clicks, 12-15 dpad, already used for movement).
 * None of these existed before this settings pass — a controller could only
 * move and look, never act — so these are new default bindings, not a
 * reshuffle of something players already learned.
 */
export const DEFAULT_GAMEPAD_BINDINGS: Record<ActionId, number | null> = {
  moveForward: null,
  moveBack: null,
  moveLeft: null,
  moveRight: null,
  interact: 0, // A / Cross
  markPlace: 1, // B / Circle
  openMap: 2, // X / Square
  toggleScrapbook: 3, // Y / Triangle
  zoomOut: 4, // L1 / LB
  zoomIn: 5, // R1 / RB
  rotate: 7, // R2 / RT
  pitchDown: 6, // L2 / LT
  autoWalk: 10, // Left stick click
};

export function actionDef(id: ActionId): ActionDef {
  const def = ACTIONS.find((action) => action.id === id);
  if (!def) throw new Error(`Unknown action id: ${id}`);
  return def;
}

/** Human-readable label for a KeyboardEvent.code, for the rebind row and any
 *  toast that names a key. Falls back to the raw code for anything obscure
 *  enough not to be worth a special case. */
export function describeKeyCode(code: string | null): string {
  if (!code) return 'Not bound';
  const named: Record<string, string> = {
    Space: 'Space',
    Equal: '+',
    Minus: '−',
    NumpadAdd: 'Numpad +',
    NumpadSubtract: 'Numpad −',
    CapsLock: 'Caps Lock',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    ControlLeft: 'Left Ctrl',
    ControlRight: 'Right Ctrl',
    ShiftLeft: 'Left Shift',
    ShiftRight: 'Right Shift',
    AltLeft: 'Left Alt',
    AltRight: 'Right Alt',
    Backquote: '`',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Tab: 'Tab',
    Enter: 'Enter',
  };
  if (named[code]) return named[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Numpad ${code.slice(6)}`;
  if (/^F([1-9]|1[0-9])$/.test(code)) return code;
  return code;
}

/** Standard-layout button index to a name worth showing in the rebind row. */
export function describeGamepadButton(index: number | null): string {
  if (index === null) return 'Not bound';
  const named: Record<number, string> = {
    0: 'A / Cross',
    1: 'B / Circle',
    2: 'X / Square',
    3: 'Y / Triangle',
    4: 'L1 / LB',
    5: 'R1 / RB',
    6: 'L2 / LT',
    7: 'R2 / RT',
    8: 'Select / Share',
    9: 'Start / Options',
    10: 'Left stick click',
    11: 'Right stick click',
  };
  return named[index] ?? `Button ${index}`;
}
