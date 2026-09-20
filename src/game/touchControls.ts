import { applyDeadzone, clamp } from '../core/math';
import { getSetting, onSettingsChanged } from './settings';
import type { MovementInput } from './input';

// Touch and tablet controls, in two halves.
//
// The top half is gesture arithmetic over numbers: where a thumb sits inside
// the move pad, and how far apart two fingers have drifted. It is pure, it has
// no opinion about the DOM, and it is unit-tested in touchControls.test.ts.
// The sandbox and the built-in browser can emulate a tablet's size and a
// single touch point, but not a real pair of fingers — so the numbers are the
// only part of this file that can honestly be pinned down without the device
// in your hands.
//
// The bottom half is the on-screen overlay: a move pad read as an analog
// stick, an Act button for what E does, a Rotate button for build mode, and
// zoom buttons standing in for pinch. It keeps to the same rule input.ts
// does — it deals in gestures and callbacks, and knows nothing about panels,
// the canvas, or what a tool is. Zoom and rotate are handed to it as
// callbacks, so this module never imports the camera or the placement system.
//
// The two halves meet at `padOffsetToMovement`, which is why that function is
// exported: the pad's pointer handler feeds it a thumb offset, and everything
// downstream sees only the same `{x, y}` in the same -1..1 space the keyboard
// and gamepad already produce.

/** Fraction of the pad's radius that produces no movement at all. */
export const PAD_DEADZONE = 0.16;

/**
 * `-0` is a distinct value in JavaScript, and `Object.is(-0, 0)` is false.
 * Whichever axis is not being pushed would otherwise come back as a negative
 * zero — correct arithmetic, but a nasty thing to hand a caller that compares
 * strictly. Normalised once, here, so nothing downstream has to think of it.
 */
function noNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * Camera-distance units one unit of log pinch ratio lands on.
 *
 * `adjustCameraZoom` speaks camera-distance units (a tap of +/− is 0.8, a
 * wheel notch is tiny), and the whole zoom range is about 11 units wide, so
 * this is tuned so a comfortable spread — roughly doubling the span of two
 * fingers — crosses about a fifth of the range and feels like a deliberate
 * gesture rather than a shove.
 */
export const PINCH_ZOOM_GAIN = 3;

/**
 * Ceiling on a single pinch step, in camera-distance units.
 *
 * A dropped frame or a finger landing mid-gesture can hand us a ratio that
 * says "the fingers moved six inches in 16 ms". Without a ceiling that lands
 * as one huge zoom jump; with one, the worst frame is still a firm nudge and
 * the gesture carries on from there.
 */
export const PINCH_MAX_STEP = 1.5;

/**
 * Where the thumb is inside the pad → how the avatar should walk.
 *
 * `offsetX`/`offsetY` are screen pixels from the pad's centre (y grows
 * downward, the way it does everywhere in the DOM), and `radius` is the
 * distance at which the pad counts as fully thrown. The result is in the same
 * space `getMovementInput()` returns and `avatar.ts` turns into a world
 * direction: x is right of the camera, y is forward, away from the camera.
 *
 * Two deliberate choices:
 *
 * - The deadzone is radial, not per-axis. A per-axis deadzone carves a cross
 *   of dead ground through the middle of the pad, where two small inputs each
 *   fall under the threshold even though the thumb is plainly asking to walk
 *   northeast. Measuring the magnitude and dead-zoning that keeps the pad
 *   circular, which is what the pad looks like it ought to do.
 * - Past the rim the throw stops growing but the direction is kept. A thumb
 *   that slides off the edge keeps walking the way it was instead of snapping
 *   to whichever axis it happened to cross.
 */
export function padOffsetToMovement(
  offsetX: number,
  offsetY: number,
  radius: number,
  deadzone = PAD_DEADZONE,
): MovementInput {
  if (!(radius > 0)) return { x: 0, y: 0 };
  const distance = Math.hypot(offsetX, offsetY);
  if (distance === 0) return { x: 0, y: 0 };

  // Clamp before the deadzone, not after: `applyDeadzone` walks a value from
  // its own threshold up to 1, so a thumb three radii out would otherwise
  // come back as a throw of 3 and fire the avatar off into the distance.
  const strength = applyDeadzone(clamp(distance / radius, 0, 1), deadzone);
  if (strength === 0) return { x: 0, y: 0 };

  // Screen-down is world-backward, so y flips here, once, on the way in.
  return {
    x: noNegativeZero((offsetX / distance) * strength),
    y: noNegativeZero(-(offsetY / distance) * strength),
  };
}

/** Straight-line distance between two pointers, in screen pixels. */
export function twoPointerDistance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/**
 * Camera-distance change for a pinch, in the units `adjustCameraZoom` (and the
 * +/− keys, and the wheel) already speak.
 *
 * It is the ratio, not the difference. Doubling the span of two fingers means
 * the same thing whether the fingers started 40 px or 400 px apart, and taking
 * the log of the ratio makes the gesture its own undo — spread and then close
 * returns exactly where you started, with no drift, where a raw difference
 * would creep a little further every time the hand settled at a new distance.
 *
 * The sign follows the wheel: a positive number moves the camera away (zooms
 * out). Fingers spreading (current larger than previous) is a zoom in, so it
 * comes back negative — the same direction as the `+` key and the zoom-in
 * button.
 */
export function pinchZoomDelta(
  previousDistance: number,
  currentDistance: number,
  gain = PINCH_ZOOM_GAIN,
): number {
  if (!(previousDistance > 0) || !(currentDistance > 0)) return 0;
  const delta = -Math.log(currentDistance / previousDistance) * gain;
  return noNegativeZero(clamp(delta, -PINCH_MAX_STEP, PINCH_MAX_STEP));
}

/** What the overlay needs from the rest of the game. Nothing here names a panel. */
export type TouchControlCallbacks = {
  /** The pad's current vector, in the space `getMovementInput()` returns. */
  onMove: (movement: MovementInput) => void;
  /** Same action as the E key: open or close the nearby interaction. */
  onAct: () => void;
  /** Same action as R inside build mode: turn the selected piece. */
  onRotate: () => void;
  /** One zoom step in, matching the + key and a zoom-in pinch. */
  onZoomIn: () => void;
  /** One zoom step out, matching the − key and a zoom-out pinch. */
  onZoomOut: () => void;
  /** True when there is something in reach for the Act button to open. */
  isActAvailable?: () => boolean;
  /** True only in build mode, when the Rotate button has anything to do. */
  isRotateAvailable?: () => boolean;
};

/** The `pointer: coarse` query the 'auto' setting is decided by. */
const COARSE_POINTER_QUERY = '(pointer: coarse)';

type TouchControlElements = {
  root: HTMLElement;
  pad: HTMLElement;
  thumb: HTMLElement;
  act: HTMLButtonElement;
  rotate: HTMLButtonElement;
};

let elements: TouchControlElements | null = null;
let callbacks: TouchControlCallbacks | null = null;
/**
 * The one finger allowed to drive the pad.
 *
 * A second finger on the pad is ignored rather than averaged in, for the same
 * reason input.ts tracks pointers by id: two overlapping gestures fighting
 * over one value is how movement stutters. Only one thumb belongs here.
 */
let padPointerId: number | null = null;
/** Last applied class states, so the frame loop only touches the DOM on change. */
let lastActAvailable: boolean | null = null;
let lastRotateAvailable: boolean | null = null;

/**
 * Whether touch controls should be on right now.
 *
 * 'auto' is the default and means "on when the primary pointer is coarse" —
 * a finger or a stylus, not a mouse. That is the honest test for a tablet,
 * and it keeps the overlay off a desktop without making the player find a
 * toggle first. The explicit 'on'/'off' values are for the cases the query
 * gets wrong: a touchscreen laptop, or a tablet with a mouse plugged in.
 */
export function areTouchControlsEnabled(): boolean {
  const mode = getSetting('touchControls');
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return window.matchMedia?.(COARSE_POINTER_QUERY)?.matches ?? false;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  return element;
}

/** Where the pad sits and how big it is, in screen pixels. */
function padGeometry(pad: HTMLElement) {
  const rect = pad.getBoundingClientRect();
  return {
    centreX: rect.left + rect.width / 2,
    centreY: rect.top + rect.height / 2,
    radius: Math.min(rect.width, rect.height) / 2,
  };
}

function moveThumbTo(offsetX: number, offsetY: number, radius: number) {
  if (!elements) return;
  // The knob is stopped a little inside the rim so the whole thumb stays on
  // the pad. Movement does not stop with it — a finger past this point is
  // still reading as a full throw — but the knob never floats off the glass.
  const travel = radius * 0.6;
  const distance = Math.hypot(offsetX, offsetY);
  const scale = distance > travel ? travel / distance : 1;
  elements.thumb.style.setProperty('--pad-thumb-x', `${offsetX * scale}px`);
  elements.thumb.style.setProperty('--pad-thumb-y', `${offsetY * scale}px`);
}

function applyPadPointer(clientX: number, clientY: number) {
  if (!elements || !callbacks) return;
  const { centreX, centreY, radius } = padGeometry(elements.pad);
  const offsetX = clientX - centreX;
  const offsetY = clientY - centreY;
  moveThumbTo(offsetX, offsetY, radius);
  callbacks.onMove(padOffsetToMovement(offsetX, offsetY, radius));
}

/** Let go of the pad: knob home, and tell the input layer movement has stopped. */
function releasePad() {
  padPointerId = null;
  if (!elements || !callbacks) return;
  elements.pad.classList.remove('is-engaged');
  moveThumbTo(0, 0, 1);
  callbacks.onMove({ x: 0, y: 0 });
}

function buildOverlay(): TouchControlElements {
  const root = createElement('div', 'touch-controls');
  root.id = 'touch-controls';

  const pad = createElement('div', 'touch-pad');
  pad.setAttribute('role', 'application');
  pad.setAttribute('aria-label', 'Move — drag to walk, further from the middle is faster');
  // The four marks that make it read as the old arrow pad. They are labels,
  // not gates: the vector underneath is analog, so walking between two arrows
  // is still a smooth, camera-relative direction rather than a hard diagonal.
  for (const direction of ['n', 'e', 's', 'w'] as const) {
    const arrow = createElement('span', `touch-pad-arrow touch-pad-arrow-${direction}`);
    arrow.setAttribute('aria-hidden', 'true');
    pad.append(arrow);
  }
  const thumb = createElement('span', 'touch-pad-thumb');
  thumb.setAttribute('aria-hidden', 'true');
  pad.append(thumb);

  const buttons = createElement('div', 'touch-buttons');

  const act = createElement('button', 'touch-button touch-button-act');
  act.type = 'button';
  act.setAttribute('aria-label', 'Act on the nearby thing (same as the E key)');
  act.append('Act');
  act.addEventListener('click', () => callbacks?.onAct());

  const rotate = createElement('button', 'touch-button touch-button-rotate');
  rotate.type = 'button';
  rotate.setAttribute('aria-label', 'Rotate the piece you are placing (same as the R key)');
  rotate.append('Rotate');
  rotate.hidden = true;
  rotate.addEventListener('click', () => callbacks?.onRotate());

  const zoom = createElement('div', 'touch-zoom');
  // The non-gesture twin of pinch: the same step the +/− keys take, so a
  // player who cannot or will not pinch loses nothing.
  zoom.append(
    buildZoomButton('touch-button-zoom-in', 'Zoom in', '+', () => callbacks?.onZoomIn()),
    buildZoomButton('touch-button-zoom-out', 'Zoom out', '−', () => callbacks?.onZoomOut()),
  );

  buttons.append(act, rotate, zoom);
  root.append(pad, buttons);

  pad.addEventListener('pointerdown', (event) => {
    // One finger owns the pad. A second is ignored outright, not merged.
    if (padPointerId !== null) return;
    padPointerId = event.pointerId;
    pad.classList.add('is-engaged');
    // Capture keeps the gesture alive when the thumb wanders off the round
    // pad — which, on a pad this size, it constantly does.
    pad.setPointerCapture(event.pointerId);
    applyPadPointer(event.clientX, event.clientY);
    event.preventDefault();
  });

  pad.addEventListener('pointermove', (event) => {
    if (event.pointerId !== padPointerId) return;
    applyPadPointer(event.clientX, event.clientY);
  });

  const endPadGesture = (event: PointerEvent) => {
    if (event.pointerId === padPointerId) releasePad();
  };
  pad.addEventListener('pointerup', endPadGesture);
  pad.addEventListener('pointercancel', endPadGesture);

  return { root, pad, thumb, act, rotate };
}

function buildZoomButton(
  className: string,
  label: string,
  glyph: string,
  onPress: () => void,
): HTMLButtonElement {
  const button = createElement('button', `touch-button ${className}`);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.append(glyph);
  button.addEventListener('click', onPress);
  return button;
}

/** Show or hide the overlay, and stop the avatar if it is being taken away. */
function applyVisibility() {
  if (!elements) return;
  const enabled = areTouchControlsEnabled();
  elements.root.classList.toggle('is-visible', enabled);
  if (!enabled) {
    releasePad();
    return;
  }
  // Force the next refresh to write both states, so a button does not stay
  // hidden from the last time the overlay was up.
  lastActAvailable = null;
  lastRotateAvailable = null;
  refreshTouchControls();
}

/**
 * Update the bits of the overlay that depend on world state, once a frame.
 *
 * Cheap and guarded: nothing is written unless a state actually changed, so
 * this costs two function calls and two comparisons per frame when idle. It
 * lives in the frame loop rather than on a timer so the Rotate button appears
 * the moment build mode does, which is the only moment it is looked for.
 */
export function refreshTouchControls() {
  if (!elements || !callbacks) return;
  if (!elements.root.classList.contains('is-visible')) return;

  const rotate = callbacks.isRotateAvailable?.() ?? false;
  if (rotate !== lastRotateAvailable) {
    lastRotateAvailable = rotate;
    elements.rotate.hidden = !rotate;
  }

  const act = callbacks.isActAvailable?.() ?? false;
  if (act !== lastActAvailable) {
    lastActAvailable = act;
    elements.act.classList.toggle('is-available', act);
  }
}

/**
 * Build the overlay and start listening.
 *
 * Safe to call once at boot; calling it twice would append a second pad, so it
 * simply takes the new callbacks if it is ever called again.
 */
export function initializeTouchControls(next: TouchControlCallbacks) {
  callbacks = next;
  if (!elements) {
    elements = buildOverlay();
    (document.querySelector('#app') ?? document.body).append(elements.root);
    // A setting change has to be able to bring the overlay in or out live, so
    // a future toggle in the settings menu does not need a reload.
    onSettingsChanged(applyVisibility);
  }
  applyVisibility();
}
