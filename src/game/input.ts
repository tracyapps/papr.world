import { applyDeadzone } from '../core/math';
import { addYaw, adjustCameraPitch, adjustCameraZoom, applyGamepadLook } from './camera';
import { getSetting } from './settings';

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
  onToggleMaker: () => void;
  onMarkPlace: () => void;
  onEscape: () => boolean;
  /** Left-click activates a world interaction when it remains a click. */
  onPrimaryAction: (event: PointerEvent) => void;
  /** The default arrow can grab empty world space with left-drag. */
  shouldOrbitWithPrimary: (event: PointerEvent) => boolean;
  /** Number-row shortcuts mirror the visible tool rail. */
  onSelectToolSlot: (slot: number) => void;
  /** Return true when a wheel event belongs to an open panel, not the camera. */
  isWheelCaptured: (event: WheelEvent) => boolean;
  /** HUD widget drags own the pointer while active. */
  isPointerCaptured: () => boolean;
};

const input: InputState = {
  forward: false,
  back: false,
  left: false,
  right: false,
};

const keys: Record<string, keyof InputState> = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'back',
  KeyS: 'back',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

let isOrbiting = false;
let lastPointerX = 0;
let lastPointerY = 0;
let orbitButton: 0 | 1 | 2 | null = null;
let pendingPrimary: { clientX: number; clientY: number } | null = null;

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
const HORIZONTAL_DRAG_SENSITIVITY = 0.006;
const VERTICAL_DRAG_SENSITIVITY = 0.0032;

function buttonMask(button: 0 | 1 | 2): number {
  if (button === 0) return 1;
  if (button === 2) return 2;
  return 4;
}

/**
 * Resting-position baselines per gamepad. Sticks (and some devices that
 * merely claim to be gamepads) can report a constant non-zero value at
 * rest, which reads as endless camera drift. Measuring axes relative to
 * where they sat when first seen cancels that out.
 */
const gamepadBaselines = new Map<number, number[]>();

function baselinedAxis(gamepad: Gamepad, axisIndex: number): number {
  let baseline = gamepadBaselines.get(gamepad.index);
  if (!baseline) {
    baseline = [...gamepad.axes];
    gamepadBaselines.set(gamepad.index, baseline);
  }
  return applyDeadzone((gamepad.axes[axisIndex] ?? 0) - (baseline[axisIndex] ?? 0));
}

export function getMovementInput(): MovementInput {
  const movement: MovementInput = { x: 0, y: 0 };

  if (input.forward) movement.y += 1;
  if (input.back) movement.y -= 1;
  if (input.right) movement.x += 1;
  if (input.left) movement.x -= 1;

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
      applyGamepadLook(delta, lookX, lookY);
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
  window.addEventListener('keydown', (event) => {
    if (isFormElementEvent(event) && event.code !== 'Escape') return;

    if (event.code === 'Escape') {
      if (callbacks.onEscape()) {
        event.preventDefault();
      }
      return;
    }

    if (event.code === 'KeyI') {
      event.preventDefault();
      callbacks.onToggleScrapbook();
      return;
    }

    if (event.code === 'KeyE') {
      callbacks.onToggleMaker();
      return;
    }

    if (event.code === 'KeyM') {
      event.preventDefault();
      callbacks.onMarkPlace();
      return;
    }

    // Number-row shortcuts for the tool rail. Kept as a range rather than a
    // hardcoded list so adding a rail slot doesn't silently leave it
    // keyboard-unreachable; the toolbar ignores numbers it has no slot for.
    if (/^Digit[1-9]$/.test(event.code)) {
      event.preventDefault();
      callbacks.onSelectToolSlot(Number(event.code.slice(-1)));
      return;
    }

    if (event.code === 'Equal' || event.code === 'NumpadAdd') {
      event.preventDefault();
      adjustCameraZoom(-0.8);
      return;
    }

    if (event.code === 'Minus' || event.code === 'NumpadSubtract') {
      event.preventDefault();
      adjustCameraZoom(0.8);
      return;
    }

    if (event.code === 'KeyR') {
      event.preventDefault();
      adjustCameraPitch(0.14);
      return;
    }

    if (event.code === 'KeyF') {
      event.preventDefault();
      adjustCameraPitch(-0.14);
      return;
    }

    const mapped = keys[event.code];
    if (mapped) {
      event.preventDefault();
      input[mapped] = true;
    }
  });

  window.addEventListener('keyup', (event) => {
    if (isFormElementEvent(event)) return;
    const mapped = keys[event.code];
    if (mapped) {
      event.preventDefault();
      input[mapped] = false;
    }
  });

  // Right/middle always orbit. In the default interaction mode, left-drag
  // also orbits when the press began on empty world space.
  window.addEventListener('pointerdown', (event) => {
    if (isFormElementEvent(event)) return;

    if (event.button === 2 || event.button === 1) {
      isOrbiting = true;
      orbitButton = event.button;
      document.documentElement.classList.add('is-camera-orbiting');
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      return;
    }

    if (event.button === 0) {
      pendingPrimary = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      lastPointerX = event.clientX;
      lastPointerY = event.clientY;
      if (callbacks.shouldOrbitWithPrimary(event)) {
        isOrbiting = true;
        orbitButton = 0;
        document.documentElement.classList.add('is-camera-orbiting');
      }
    }
  });

  window.addEventListener('pointerup', (event) => {
    if (event.button === 0 && pendingPrimary) {
      callbacks.onPrimaryAction(event);
      pendingPrimary = null;
    }

    if (orbitButton === event.button) {
      isOrbiting = false;
      orbitButton = null;
      document.documentElement.classList.remove('is-camera-orbiting');
    }
  });

  window.addEventListener('pointercancel', () => {
    isOrbiting = false;
    orbitButton = null;
    pendingPrimary = null;
    document.documentElement.classList.remove('is-camera-orbiting');
  });

  window.addEventListener('pointermove', (event) => {
    if (callbacks.isPointerCaptured()) return;

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
    // If the active press was released off-window, stop orbiting rather than
    // sticking to the cursor.
    if (orbitButton === null || (event.buttons & buttonMask(orbitButton)) === 0) {
      isOrbiting = false;
      orbitButton = null;
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
    addYaw(dragSign * deltaX * HORIZONTAL_DRAG_SENSITIVITY);
    adjustCameraPitch(-dragSign * deltaY * VERTICAL_DRAG_SENSITIVITY);
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
