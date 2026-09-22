import { applyDeadzone } from '../core/math';
import { addYaw, adjustCameraPitch, adjustCameraZoom, applyGamepadLook } from './camera';
// The pinch arithmetic is pure and lives with the rest of the touch geometry;
// this module owns *when* it is applied, not the numbers themselves.
import { pinchZoomDelta, twoPointerDistance } from './touchControls';
import { getSetting } from './settings';
import type { ActionId } from './controlActions';

// Keyboard, pointer, wheel, and gamepad input.
// Action keys route through callbacks so this module stays UI-agnostic.

export type MovementInput = {
  x: number;
  y: number;
};

type InputState = {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
};

export type InputCallbacks = {
  onToggleScrapbook: () => void;
  /** Open or close the nearby place interaction (machine, shop counter). */
  onToggleNearby: () => void;
  onMarkPlace: () => void;
  /** Open or fold away the treasure map. */
  onToggleMap?: () => void;
  onEscape: () => boolean;
  /** Left-click activates a world interaction when it remains a click. */
  onPrimaryAction: (event: PointerEvent) => void;
  /** The default arrow can grab empty world space with left-drag. */
  shouldOrbitWithPrimary: (event: PointerEvent) => boolean;
  /** Number-row shortcuts mirror the visible tool rail. */
  onSelectToolSlot: (slot: number) => void;
  /** Build mode gets first refusal on R; false preserves camera pitch elsewhere. */
  onRotateBuild: () => boolean;
  /** Return true when a wheel event belongs to an open panel, not the camera. */
  isWheelCaptured: (event: WheelEvent) => boolean;
  /** HUD widget drags own the pointer while active. */
  isPointerCaptured: () => boolean;
  /**
   * Whether a pointer event landed on the world surface rather than on HUD
   * chrome.
   *
   * Passed in rather than tested here so this module stays UI-agnostic — it
   * must not know what the canvas is, or which panels exist.
   */
  isWorldTarget: (event: PointerEvent) => boolean;
  /**
   * Fired whenever the auto-walk lock changes — from the keyboard shortcut,
   * the HUD toggle button, or the safety clear on window blur — so the HUD
   * can show it's on (this is a deliberate, always-visible cousin of the
   * "stuck moving" bug fixed 2026-09-22: same mechanism, opted into on
   * purpose instead of landed in by accident).
   */
  onAutoWalkToggled?: (locked: boolean) => void;
};

const input: InputState = {
  forward: false,
  back: false,
  left: false,
  right: false,
};

/**
 * Deliberate "keep walking" lock — see `onAutoWalkToggled` above. Contributes
 * a steady forward push in `getMovementInput()` exactly like a held key, so
 * it sums and cancels with real input the same way keyboard/gamepad/touch
 * already do (walking backward while it's on slows or reverses it, same as
 * holding both keys would).
 */
let autoWalkLocked = false;
/** Set once by `initializeInput`; lets `toggleAutoWalkLocked()` (called from
 *  the HUD button, outside this module) reach the same notification the
 *  keyboard shortcut uses, instead of duplicating it. */
let activeCallbacks: InputCallbacks | null = null;

function setAutoWalkLocked(locked: boolean) {
  if (locked === autoWalkLocked) return;
  autoWalkLocked = locked;
  document.documentElement.classList.toggle('is-auto-walking', locked);
  activeCallbacks?.onAutoWalkToggled?.(locked);
}

export function isAutoWalkLocked() {
  return autoWalkLocked;
}

/** Toggle the lock. Exported so the HUD button can drive the exact same
 *  state the keyboard shortcut does. */
export function toggleAutoWalkLocked() {
  setAutoWalkLocked(!autoWalkLocked);
}

/**
 * A virtual stick any on-screen control can drive.
 *
 * The touch move pad is the only caller today, but it deliberately does not
 * live in the touch module: `getMovementInput` has to stay the single place
 * movement is summed from every source — keyboard, gamepad, and now a thumb —
 * so every consumer keeps reading one function and no source can be applied
 * twice or forgotten. main.ts only hands the setter across; the sum is here.
 */
const virtualMovement: MovementInput = { x: 0, y: 0 };

/** Set the virtual stick's position, in the same -1..1 space the keys use. */
export function setVirtualMovement(movement: MovementInput) {
  virtualMovement.x = movement.x;
  virtualMovement.y = movement.y;
}

/** Movement actions, and the InputState field each drives — the only
 *  actions with "held" semantics; everything else fires once per press. */
const MOVEMENT_ACTION_FIELD: Partial<Record<ActionId, keyof InputState>> = {
  moveForward: 'forward',
  moveBack: 'back',
  moveLeft: 'left',
  moveRight: 'right',
};

/**
 * Keys that always work, however the player has rebound things — arrow keys
 * for movement, numpad +/- for zoom. A bad rebind (or one made and then
 * forgotten) should never be a dead end with no in-game way to walk or see.
 */
const PERMANENT_KEY_ACTIONS: Partial<Record<string, ActionId>> = {
  ArrowUp: 'moveForward',
  ArrowDown: 'moveBack',
  ArrowLeft: 'moveLeft',
  ArrowRight: 'moveRight',
  NumpadAdd: 'zoomIn',
  NumpadSubtract: 'zoomOut',
};

/** Resolve a KeyboardEvent.code to the action bound to it — the permanent
 *  fallbacks above first, then whatever the player has it bound to. */
function resolveKeyAction(code: string): ActionId | null {
  const permanent = PERMANENT_KEY_ACTIONS[code];
  if (permanent) return permanent;
  const bindings = getSetting('keyBindings');
  for (const id of Object.keys(bindings) as ActionId[]) {
    if (bindings[id] === code) return id;
  }
  return null;
}

/**
 * Apply one resolved action — the single place both keyboard and gamepad
 * dispatch fire through, so "what E does" (or whatever it's rebound to) is
 * written once. Movement actions set the held state getMovementInput() sums;
 * everything else fires once per press, matching how each always worked as
 * a hardcoded keydown handler (OS key-repeat still re-fires it while a key
 * is held, same as before rebinding existed).
 *
 * Returns whether the caller should preventDefault — false only for
 * 'interact', which never claimed the keyboard event either.
 */
function fireAction(id: ActionId, callbacks: InputCallbacks): boolean {
  const movementField = MOVEMENT_ACTION_FIELD[id];
  if (movementField) {
    input[movementField] = true;
    return true;
  }

  switch (id) {
    case 'autoWalk':
      toggleAutoWalkLocked();
      return true;
    case 'toggleScrapbook':
      callbacks.onToggleScrapbook();
      return true;
    case 'interact':
      callbacks.onToggleNearby();
      return false;
    case 'openMap':
      callbacks.onToggleMap?.();
      return true;
    case 'markPlace':
      callbacks.onMarkPlace();
      return true;
    case 'zoomIn':
      adjustCameraZoom(-0.8);
      return true;
    case 'zoomOut':
      adjustCameraZoom(0.8);
      return true;
    case 'rotate':
      if (!callbacks.onRotateBuild()) adjustCameraPitch(0.14);
      return true;
    case 'pitchDown':
      adjustCameraPitch(-0.14);
      return true;
    default:
      return false;
  }
}

/**
 * Capture the next keydown or gamepad button press for a rebind row,
 * instead of it firing whatever it's currently bound to. Only one capture
 * runs at a time — starting either kind cancels the other. Escape always
 * cancels (the callback receives null) rather than becoming a key nobody
 * can use to back out of a capture prompt.
 */
let keyCaptureCallback: ((code: string | null) => void) | null = null;
let gamepadCaptureCallback: ((buttonIndex: number | null) => void) | null = null;

export function beginKeyCapture(onCaptured: (code: string | null) => void) {
  gamepadCaptureCallback = null;
  keyCaptureCallback = onCaptured;
}

export function beginGamepadCapture(onCaptured: (buttonIndex: number | null) => void) {
  keyCaptureCallback = null;
  gamepadCaptureCallback = onCaptured;
}

export function cancelBindingCapture() {
  keyCaptureCallback = null;
  gamepadCaptureCallback = null;
}

/** Per-gamepad button-press state from the previous poll, so a one-shot
 *  action fires once per press rather than every frame the button stays
 *  down. */
const gamepadButtonPrevPressed = new Map<number, boolean[]>();

/** Movement held via a rebound gamepad button — kept apart from the
 *  keyboard's own `input` state so a gamepad release can never stomp a key
 *  still held down, and vice versa. Summed into getMovementInput() exactly
 *  like every other source. The analog stick bypasses this entirely; it's
 *  still read directly in getMovementInput() as before. */
const gamepadButtonMovement: InputState = {
  forward: false,
  back: false,
  left: false,
  right: false,
};

/**
 * Per-frame gamepad button polling for rebindable actions — the button
 * equivalent of the keydown handler below. Call once per frame alongside
 * updateGamepadCamera(); the analog stick and dpad are unaffected, they're
 * still read directly in getMovementInput().
 */
export function updateGamepadActions() {
  const callbacks = activeCallbacks;
  const bindings = getSetting('gamepadBindings');
  const gamepads = navigator.getGamepads?.() ?? [];

  gamepadButtonMovement.forward = false;
  gamepadButtonMovement.back = false;
  gamepadButtonMovement.left = false;
  gamepadButtonMovement.right = false;

  for (const gamepad of gamepads) {
    if (!gamepad) continue;

    if (gamepadCaptureCallback) {
      const pressedIndex = gamepad.buttons.findIndex((button) => button.pressed);
      if (pressedIndex !== -1) {
        const callback = gamepadCaptureCallback;
        gamepadCaptureCallback = null;
        callback(pressedIndex);
      }
      // Capturing a button shouldn't also fire whatever it's already bound
      // to, or move the avatar with it.
      continue;
    }

    const prevPressed = gamepadButtonPrevPressed.get(gamepad.index) ?? [];
    const currentPressed = gamepad.buttons.map((button) => button.pressed);

    for (const id of Object.keys(bindings) as ActionId[]) {
      const buttonIndex = bindings[id];
      if (buttonIndex === null || buttonIndex === undefined) continue;
      const pressed = currentPressed[buttonIndex] ?? false;

      const movementField = MOVEMENT_ACTION_FIELD[id];
      if (movementField) {
        if (pressed) gamepadButtonMovement[movementField] = true;
        continue;
      }

      const wasPressed = prevPressed[buttonIndex] ?? false;
      if (pressed && !wasPressed && callbacks) {
        fireAction(id, callbacks);
      }
    }

    gamepadButtonPrevPressed.set(gamepad.index, currentPressed);
  }
}

let isOrbiting = false;
let lastPointerX = 0;
let lastPointerY = 0;
let orbitButton: 0 | 1 | 2 | null = null;
/**
 * Which pointer owns the orbit.
 *
 * A mouse only ever has one, but every finger is its own pointer: without
 * this, a second finger arriving mid-drag handed its coordinates to the first
 * finger's gesture and the camera snapped between them. Core builds have two
 * hands and a tablet has ten fingers; the camera follows exactly one of them.
 */
let orbitPointerId: number | null = null;
/**
 * Every pointer currently down on the world, keyed by `pointerId`.
 *
 * Kept so the *number* of fingers can be known — which is the whole of multi-
 * touch here: one finger orbits, two pinch-zoom, three or more are ignored
 * rather than fought over. A pointer leaves this map on release, on cancel,
 * on window blur and on a HUD widget stealing its capture, so it can never
 * quietly accumulate.
 */
const trackedPointers = new Map<number, { x: number; y: number }>();
/**
 * Finger span at the last pinch frame, or null when no two-finger gesture is
 * running. Null is what makes the first pinch frame a pure baseline rather
 * than a jump computed against a stale distance from a previous pinch.
 */
let pinchDistance: number | null = null;

/** The current span of exactly two pointers, or null if there are not two. */
function currentPinchDistance(): number | null {
  if (trackedPointers.size !== 2) return null;
  const [first, second] = [...trackedPointers.values()];
  return twoPointerDistance(first.x, first.y, second.x, second.y);
}
/**
 * A left press that is still eligible to become a click.
 *
 * `pointerId` is recorded so a release can prove it belongs to *this* press.
 * Without it, any stray pointerup could cash in a press made by a different
 * pointer — which is how a HUD drag ended up firing a world action.
 */
let pendingPrimary: { clientX: number; clientY: number; pointerId: number } | null = null;

/** Drop any in-flight press and camera drag. Safe to call at any time. */
function clearPointerGestures() {
  pendingPrimary = null;
  isOrbiting = false;
  orbitButton = null;
  orbitPointerId = null;
  trackedPointers.clear();
  pinchDistance = null;
  document.documentElement.classList.remove('is-camera-orbiting');
}

/**
 * Forget everything one pointer was doing, leaving the others alone.
 *
 * This is the multi-touch half of `clearPointerGestures`. A blanket clear on
 * every pointer's release is fine while there is only ever one pointer, but
 * with a thumb on the move pad it would mean letting go of the pad also
 * dropped the finger that was orbiting the camera.
 */
function dropPointer(pointerId: number) {
  trackedPointers.delete(pointerId);
  if (pendingPrimary?.pointerId === pointerId) pendingPrimary = null;
  if (orbitPointerId === pointerId) {
    isOrbiting = false;
    orbitButton = null;
    orbitPointerId = null;
    document.documentElement.classList.remove('is-camera-orbiting');
  }
  pinchDistance = currentPinchDistance();
}

/**
 * Pointer movement before a left press is treated as a cancelled click.
 *
 * Two values, because the question is different in each case.
 *
 * When the press is also driving the camera, the threshold has to be small —
 * it is the only thing separating "click" from "drag", and a generous one
 * would fire a click at the end of every orbit.
 *
 * When it isn't — the press landed on something interactable, so no camera
 * gesture is competing — there is nothing to disambiguate, and a tight
 * threshold only punishes hands that aren't perfectly still. 5px is less than a
 * millimetre of tremor, a trackpad tap that drifts, or a click taken while the
 * frame rate is uneven. Being forgiving here costs nothing and is the whole
 * difference between "clicking works" and "clicking works if you hold still".
 */
const PRIMARY_DRAG_THRESHOLD = 5;
const PRIMARY_DRAG_THRESHOLD_STATIONARY = 18;
/**
 * Radians of camera movement per pixel of drag, at sensitivity 1.
 *
 * Lowered from 0.006 / 0.0032 on 2026-08-06: the old baseline swung the world
 * far enough per gesture that a short drag overshot what you were looking at,
 * and correcting an overshoot is what made panning feel dramatic. The player
 * slider multiplies these, so the old feel is still reachable at ~1.4.
 *
 * Vertical stays roughly half of horizontal because the pitch range is much
 * smaller than the full yaw circle — matching them makes the same hand
 * movement slam pitch into its clamp.
 */
const HORIZONTAL_DRAG_SENSITIVITY = 0.0042;
const VERTICAL_DRAG_SENSITIVITY = 0.0022;

function buttonMask(button: 0 | 1 | 2): number {
  if (button === 0) return 1;
  if (button === 2) return 2;
  return 4;
}

/**
 * Resting-position baselines per gamepad. Sticks (and some devices that
 * merely claim to be gamepads) can report a constant non-zero value at
 * rest, which reads as endless drift in one direction if left uncorrected.
 *
 * Fixed 2026-09-22 (was: "stuck moving left" after connecting a controller).
 * The old version snapshotted whatever the stick read on the very *first*
 * poll and used that forever. Chrome doesn't expose a gamepad in
 * getGamepads() until it sees some input on it, so that first poll can land
 * mid-deflection — lock that in as "centre" and the player is stuck walking
 * that direction for the rest of the session, with no way back.
 *
 * Now: average a short window of samples right after the gamepad is first
 * seen (much less likely to land exactly on a deliberate full push than one
 * frame), then let the baseline keep creeping toward whatever the stick
 * reports whenever it's already close to the current baseline. Deliberate
 * input pushes far enough, fast enough, to never qualify for that nudge;
 * slow session-long drift keeps getting corrected.
 */
type GamepadCalibration = {
  /** Raw axis samples collected so far this calibration window. */
  samples: number[][];
  /** Settled resting value per axis, once the window has enough samples. */
  baseline: number[] | null;
};

const gamepadCalibrations = new Map<number, GamepadCalibration>();

/** Frames of resting-window samples averaged into the initial baseline. */
const BASELINE_CALIBRATION_SAMPLES = 12;
/**
 * How close a live reading has to be to the current baseline to be treated
 * as "still resting" and nudge the baseline toward it — comfortably below
 * what a deliberate stick push reads as, even post-deadzone.
 */
const BASELINE_DRIFT_TRACKING = 0.12;
const BASELINE_DRIFT_RATE = 0.05;

function baselinedAxis(gamepad: Gamepad, axisIndex: number): number {
  let calibration = gamepadCalibrations.get(gamepad.index);
  if (!calibration) {
    calibration = { samples: [], baseline: null };
    gamepadCalibrations.set(gamepad.index, calibration);
  }

  const raw = gamepad.axes[axisIndex] ?? 0;

  if (!calibration.baseline) {
    calibration.samples.push([...gamepad.axes]);
    if (calibration.samples.length < BASELINE_CALIBRATION_SAMPLES) {
      // Still gathering the resting window — report raw input directly so a
      // player who starts moving the instant the controller connects isn't
      // ignored for it.
      return applyDeadzone(raw);
    }
    const axisCount = gamepad.axes.length;
    const averaged: number[] = [];
    for (let i = 0; i < axisCount; i++) {
      const sum = calibration.samples.reduce((total, sample) => total + (sample[i] ?? 0), 0);
      averaged.push(sum / calibration.samples.length);
    }
    calibration.baseline = averaged;
  }

  const baseline = calibration.baseline;
  const current = baseline[axisIndex] ?? 0;
  if (Math.abs(raw - current) < BASELINE_DRIFT_TRACKING) {
    baseline[axisIndex] = current + (raw - current) * BASELINE_DRIFT_RATE;
  }

  return applyDeadzone(raw - baseline[axisIndex]);
}

export function getMovementInput(): MovementInput {
  const movement: MovementInput = { x: 0, y: 0 };

  if (input.forward || gamepadButtonMovement.forward) movement.y += 1;
  if (input.back || gamepadButtonMovement.back) movement.y -= 1;
  if (input.right || gamepadButtonMovement.right) movement.x += 1;
  if (input.left || gamepadButtonMovement.left) movement.x -= 1;
  // A steady forward push, exactly like a held-down forward key, so it sums
  // and clamps with everything else below rather than needing its own path.
  if (autoWalkLocked) movement.y += 1;

  // The touch pad. Added before the clamp below like every other source, so a
  // thumb held at full throw and a held arrow key still sum to a single unit
  // of speed rather than doubling it.
  movement.x += virtualMovement.x;
  movement.y += virtualMovement.y;

  const gamepads = navigator.getGamepads?.() ?? [];
  for (const gamepad of gamepads) {
    if (!gamepad) continue;

    const stickX = baselinedAxis(gamepad, 0);
    const stickY = baselinedAxis(gamepad, 1);
    const dpadUp = gamepad.buttons[12]?.pressed ?? false;
    const dpadDown = gamepad.buttons[13]?.pressed ?? false;
    const dpadLeft = gamepad.buttons[14]?.pressed ?? false;
    const dpadRight = gamepad.buttons[15]?.pressed ?? false;

    movement.x += stickX;
    movement.y += -stickY;

    if (dpadUp) movement.y += 1;
    if (dpadDown) movement.y -= 1;
    if (dpadRight) movement.x += 1;
    if (dpadLeft) movement.x -= 1;
  }

  const length = Math.hypot(movement.x, movement.y);
  if (length > 1) {
    movement.x /= length;
    movement.y /= length;
  }

  return movement;
}

export function updateGamepadCamera(delta: number) {
  const gamepads = navigator.getGamepads?.() ?? [];
  for (const gamepad of gamepads) {
    if (!gamepad) continue;
    const lookX = baselinedAxis(gamepad, 2);
    const lookY = baselinedAxis(gamepad, 3);
    if (lookX !== 0 || lookY !== 0) {
      // Stick look reads the same slider as drag — one "how fast does the
      // world move" control, not one per input device.
      const sensitivity = getSetting('cameraSensitivity');
      applyGamepadLook(delta, lookX * sensitivity, lookY * sensitivity);
    }
  }
}

/** True while a form control has focus, so typing never moves the avatar. */
function isFormElementEvent(event: Event) {
  const target = event.target;
  return target instanceof HTMLElement
    && Boolean(target.closest('input, select, textarea, button, [contenteditable="true"]'));
}

export function initializeInput(callbacks: InputCallbacks) {
  activeCallbacks = callbacks;

  // A gamepad reconnecting (unplug/replug, OS Bluetooth hiccup, swapping
  // controllers) gets a clean calibration window rather than inheriting
  // whatever baseline the previous connection settled on.
  window.addEventListener('gamepaddisconnected', (event) => {
    gamepadCalibrations.delete(event.gamepad.index);
    gamepadButtonPrevPressed.delete(event.gamepad.index);
  });

  window.addEventListener('keydown', (event) => {
    if (keyCaptureCallback) {
      // Anything captures except Escape, which always cancels rather than
      // becoming a key nobody can bind because it's reserved for backing out.
      event.preventDefault();
      const callback = keyCaptureCallback;
      keyCaptureCallback = null;
      callback(event.code === 'Escape' ? null : event.code);
      return;
    }

    if (isFormElementEvent(event) && event.code !== 'Escape') return;

    if (event.code === 'Escape') {
      if (gamepadCaptureCallback) {
        const callback = gamepadCaptureCallback;
        gamepadCaptureCallback = null;
        callback(null);
        event.preventDefault();
        return;
      }
      if (callbacks.onEscape()) {
        event.preventDefault();
      }
      return;
    }

    // Number-row shortcuts for the tool rail. Kept as a range rather than a
    // hardcoded list so adding a rail slot doesn't silently leave it
    // keyboard-unreachable; the toolbar ignores numbers it has no slot for.
    // Deliberately not rebindable — see controlActions.ts.
    if (/^Digit[1-9]$/.test(event.code)) {
      event.preventDefault();
      callbacks.onSelectToolSlot(Number(event.code.slice(-1)));
      return;
    }

    const action = resolveKeyAction(event.code);
    if (!action) return;

    if (fireAction(action, callbacks)) {
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    // Releasing a movement key must always clear it, even when the release
    // lands on a menu/panel button — the matching keydown fired out in the
    // world (isFormElementEvent skips setting `input[mapped]` for keydowns
    // inside form chrome), so a key already known to be "down" only ever got
    // that way from the world and must be clearable from anywhere. Before
    // this fix, opening a menu with WASD still held and releasing the key
    // while focus was on a menu button left it permanently "held" — the
    // exact bug reported 2026-09-22 as movement "sticking" after a menu.
    // Mirrors the same fix already applied to pointer gestures above:
    // clearing state must not be blockable, only acting on it is.
    const action = resolveKeyAction(event.code);
    const movementField = action ? MOVEMENT_ACTION_FIELD[action] : undefined;
    if (movementField) {
      input[movementField] = false;
    }
    if (isFormElementEvent(event)) return;
    event.preventDefault();
  });

  /**
   * Pointer listeners run in the **capture phase**, deliberately.
   *
   * HUD panels stop propagation on `pointerup` so their own clicks do not also
   * hit the world. In the bubble phase that meant `window` never saw those
   * releases at all — so a press begun on the world and released over a panel
   * left `pendingPrimary` and `isOrbiting` set forever. The consequences were
   * two different bugs wearing the same face:
   *
   * - **A click that did nothing.** Camera orbit stayed latched, so the next
   *   press was read as continuing a drag.
   * - **A click that fired somewhere else.** The stale `pendingPrimary` was
   *   cashed in by an unrelated later release — a HUD drag triggering a world
   *   action at coordinates nobody clicked.
   *
   * The rule this settles, and the reason it is worth the phase change:
   * **clearing gesture state must not be blockable, while acting on it stays
   * blockable.** Capture phase makes clearing unmissable; the `isWorldTarget`
   * checks below decide whether to act. Panels no longer depend on
   * `stopPropagation` to keep clicks out of the world — the target check does
   * that — so their stopping can no longer strand anything.
   */
  window.addEventListener('pointerdown', (event) => {
    if (isFormElementEvent(event)) return;

    // A press on HUD chrome (a panel, the touch pad, an on-screen button) is
    // not a world gesture. It must not begin one — but it must not end
    // somebody else's either. A thumb on the move pad while a finger orbits
    // the camera is the ordinary way to play on a tablet, and clearing every
    // gesture here would kill the camera each time the other hand moved.
    if (!callbacks.isWorldTarget(event)) {
      dropPointer(event.pointerId);
      return;
    }

    trackedPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    // The second finger makes this a pinch, and a pinch is not also an orbit —
    // otherwise the camera yaws while it zooms. Whatever the first finger had
    // begun is ended here on purpose; it can begin again once the pinch is
    // over. Three or more fingers are counted but otherwise ignored, so an
    // accidental palm contact cannot steer anything.
    if (trackedPointers.size > 1) {
      isOrbiting = false;
      orbitButton = null;
      orbitPointerId = null;
      pendingPrimary = null;
      document.documentElement.classList.remove('is-camera-orbiting');
      pinchDistance = currentPinchDistance();
      return;
    }

    // One finger: no pinch in progress, so the baseline is forgotten. Leaving
    // it set would make the first frame of the *next* pinch compute a jump
    // against a distance from the last one.
    pinchDistance = null;

    if (event.button === 2 || event.button === 1) {
      isOrbiting = true;
      orbitButton = event.button;
      orbitPointerId = event.pointerId;
      document.documentElement.classList.add('is-camera-orbiting');
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      return;
    }

    if (event.button === 0) {
      pendingPrimary = {
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
      };
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      if (callbacks.shouldOrbitWithPrimary(event)) {
        isOrbiting = true;
        orbitButton = 0;
        orbitPointerId = event.pointerId;
        document.documentElement.classList.add('is-camera-orbiting');
      }
    }
  }, { capture: true });

  window.addEventListener('pointerup', (event) => {
    const claimed = pendingPrimary;

    // Clear first, unconditionally, and only for this pointer — the other
    // finger's gesture is none of this pointer's business.
    dropPointer(event.pointerId);

    if (event.button !== 0) return;
    if (!claimed || claimed.pointerId !== event.pointerId) return;
    // Pressed on the world, released on the world, and no HUD widget owns the
    // pointer. Anything else is not a world click.
    if (!callbacks.isWorldTarget(event)) return;
    if (callbacks.isPointerCaptured()) return;

    callbacks.onPrimaryAction(event);
  }, { capture: true });

  // A cancelled pointer ends only its own gesture. Touch pointers are
  // cancelled the moment the browser claims the gesture (a system swipe, a
  // call arriving), and one finger's cancellation must not end the other's.
  window.addEventListener('pointercancel', (event) => dropPointer(event.pointerId), { capture: true });

  // A capture handed to a HUD widget mid-gesture means the world gesture is
  // over, however it started.
  window.addEventListener('lostpointercapture', clearPointerGestures);

  // Alt-tabbing away mid-drag otherwise returns to a latched orbit.
  window.addEventListener('blur', clearPointerGestures);
  // Same failure mode for held movement keys: losing focus entirely (alt-
  // tab, a system dialog) means the eventual keyup never reaches this
  // window, so a key held at the moment of blur would otherwise stay "down"
  // forever, same as the menu-keyup bug above.
  window.addEventListener('blur', () => {
    input.forward = false;
    input.back = false;
    input.left = false;
    input.right = false;
    gamepadButtonMovement.forward = false;
    gamepadButtonMovement.back = false;
    gamepadButtonMovement.left = false;
    gamepadButtonMovement.right = false;
    // Leaving the window entirely (alt-tab, a system dialog) shouldn't leave
    // the avatar walking into whatever's in front of it unattended.
    setAutoWalkLocked(false);
    // A stuck "press a key" prompt with nobody at the keyboard is worse than
    // a cancelled rebind.
    cancelBindingCapture();
  });

  window.addEventListener('pointermove', (event) => {
    const tracked = trackedPointers.get(event.pointerId);
    if (tracked) {
      tracked.x = event.clientX;
      tracked.y = event.clientY;
    }

    // Reap a ghost pointer. A touch that ends off-window never delivers its
    // `pointerup`, and one stale entry would leave `trackedPointers.size` at 2
    // forever — turning every later single-finger drag into a pinch, so the
    // camera quietly stops turning until a reload. A tracked pointer moving
    // with no button held is no longer down; the same self-heal idea as
    // `pendingPrimary` just below.
    if (tracked && event.buttons === 0) {
      dropPointer(event.pointerId);
    }

    // Self-heal: the pointer is moving with no left button held, so any press
    // we are still holding was released somewhere we never heard about.
    // Cheaper and more reliable than trying to enumerate the ways that
    // happens.
    if (pendingPrimary && (event.buttons & buttonMask(0)) === 0) {
      pendingPrimary = null;
    }

    if (callbacks.isPointerCaptured()) return;

    // Two fingers on the world: pinch to zoom, and nothing else. The orbit was
    // already ended when the second finger landed, so there is no camera drag
    // to continue here. The first pinch frame only records the span — comparing
    // against a distance from a previous gesture would jump the camera.
    if (trackedPointers.size > 1) {
      const distance = currentPinchDistance();
      if (distance !== null) {
        if (pinchDistance !== null) {
          adjustCameraZoom(pinchZoomDelta(pinchDistance, distance));
        }
        pinchDistance = distance;
      }
      return;
    }

    if (pendingPrimary) {
      const distance = Math.hypot(
        event.clientX - pendingPrimary.clientX,
        event.clientY - pendingPrimary.clientY,
      );
      const threshold = isOrbiting ? PRIMARY_DRAG_THRESHOLD : PRIMARY_DRAG_THRESHOLD_STATIONARY;
      if (distance >= threshold) {
        pendingPrimary = null;
      }
    }

    if (!isOrbiting) return;
    // Only the finger that began the orbit may steer it; any other pointer's
    // movement is not the camera's.
    if (orbitPointerId !== event.pointerId) return;
    // If the active press was released off-window, stop orbiting rather than
    // sticking to the cursor.
    if (orbitButton === null || (event.buttons & buttonMask(orbitButton)) === 0) {
      isOrbiting = false;
      orbitButton = null;
      orbitPointerId = null;
      document.documentElement.classList.remove('is-camera-orbiting');
      return;
    }
    const deltaX = event.clientX - lastPointerX;
    const deltaY = event.clientY - lastPointerY;
    // 'grab-world': dragging pushes the world around like paper on a
    // table (natural-scroll feel) — drag right slides the world right,
    // drag down slides the world down (revealing sky, camera easing
    // toward level). Note the vertical sign is intentionally opposite
    // the horizontal one; that's what makes both axes read as "grabbing".
    // 'move-camera' mirrors both axes (classic orbit).
    const dragSign = getSetting('cameraDragMode') === 'grab-world' ? 1 : -1;
    const sensitivity = getSetting('cameraSensitivity');
    addYaw(dragSign * deltaX * HORIZONTAL_DRAG_SENSITIVITY * sensitivity);
    adjustCameraPitch(-dragSign * deltaY * VERTICAL_DRAG_SENSITIVITY * sensitivity);
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
  });

  // Right-drag shouldn't open the browser context menu over the world.
  window.addEventListener('contextmenu', (event) => {
    if (!isFormElementEvent(event)) {
      event.preventDefault();
    }
  });

  window.addEventListener('wheel', (event) => {
    if (callbacks.isWheelCaptured(event)) return;
    event.preventDefault();
    adjustCameraZoom(event.deltaY * 0.004);
  }, { passive: false });
}
