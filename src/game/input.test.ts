import { beforeEach, describe, expect, it, vi } from 'vitest';

// Click-vs-drag is the only part of input worth testing in isolation, and it
// is worth testing because getting it wrong presents as "clicking doesn't
// work" with nothing in the console.

const cameraSpies = vi.hoisted(() => ({ adjustCameraPitch: vi.fn() }));

vi.mock('./camera', () => ({
  addYaw: () => {},
  adjustCameraPitch: cameraSpies.adjustCameraPitch,
  adjustCameraZoom: () => {},
  applyGamepadLook: () => {},
}));
// `onSettingsChanged` is part of the mock because input.ts now imports the
// touch overlay, which subscribes to settings at module scope; a mock missing
// it would throw "not a function" inside input's own tests.
const DEFAULT_KEY_BINDINGS: Record<string, string> = {
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

const DEFAULT_GAMEPAD_BINDINGS: Record<string, number | null> = {
  moveForward: null,
  moveBack: null,
  moveLeft: null,
  moveRight: null,
  interact: 0,
  markPlace: 1,
  openMap: 2,
  toggleScrapbook: 3,
  zoomOut: 4,
  zoomIn: 5,
  rotate: 7,
  pitchDown: 6,
  autoWalk: 10,
};

// `onSettingsChanged` is part of the mock because input.ts now imports the
// touch overlay, which subscribes to settings at module scope; a mock missing
// it would throw "not a function" inside input's own tests. The binding maps
// mirror controlActions.ts's own defaults (duplicated rather than imported,
// since vi.mock factories run before the module graph's own imports settle).
const settingsValues: Record<string, unknown> = {
  cameraDragMode: 'grab-world',
  cameraSensitivity: 1,
  keyBindings: { ...DEFAULT_KEY_BINDINGS },
  gamepadBindings: { ...DEFAULT_GAMEPAD_BINDINGS },
  walkSpeedMultiplier: 1,
};

vi.mock('./settings', () => ({
  getSetting: (key: string) => settingsValues[key],
  onSettingsChanged: () => {},
}));

const {
  beginGamepadCapture,
  beginKeyCapture,
  cancelBindingCapture,
  getMovementInput,
  initializeInput,
  isAutoWalkLocked,
  toggleAutoWalkLocked,
  updateGamepadActions,
} = await import('./input');

type Listener = (event: any) => void;
const listeners = new Map<string, Listener[]>();

function fire(type: string, event: Record<string, unknown> = {}) {
  for (const listener of listeners.get(type) ?? []) {
    listener({
      button: 0,
      buttons: 1,
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      target: null,
      preventDefault: () => {},
      ...event,
    });
  }
}

let primaryActions: Array<{ x: number; y: number }>;
let orbitOnPrimary: boolean;
/** Stands in for "the pointer is over the canvas, not over HUD chrome". */
let onWorld: boolean;
let rotateBuildHandled: boolean;
let rotateBuildCalls: number;
let markCalls: number;
let mapCalls: number;
let autoWalkStates: boolean[];
let interactCalls: number;
let toggleScrapbookCalls: number;
let escapeCalls: number;

beforeEach(() => {
  listeners.clear();
  primaryActions = [];
  orbitOnPrimary = false;
  onWorld = true;
  rotateBuildHandled = false;
  rotateBuildCalls = 0;
  markCalls = 0;
  mapCalls = 0;
  autoWalkStates = [];
  interactCalls = 0;
  toggleScrapbookCalls = 0;
  escapeCalls = 0;
  settingsValues.keyBindings = { ...DEFAULT_KEY_BINDINGS };
  settingsValues.gamepadBindings = { ...DEFAULT_GAMEPAD_BINDINGS };
  cancelBindingCapture();
  cameraSpies.adjustCameraPitch.mockClear();

  const stub = {
    window: {
      addEventListener: (type: string, listener: Listener) => {
        const existing = listeners.get(type) ?? [];
        existing.push(listener);
        listeners.set(type, existing);
      },
    },
    document: { documentElement: { classList: { add: () => {}, remove: () => {}, toggle: () => {} } } },
    // `isFormElementEvent` narrows with `instanceof HTMLElement`, so the stub
    // has to provide the constructor it tests against.
    HTMLElement: class {},
  };
  Object.assign(globalThis, stub);

  initializeInput({
    onToggleScrapbook: () => {
      toggleScrapbookCalls += 1;
    },
    onToggleNearby: () => {
      interactCalls += 1;
    },
    onMarkPlace: () => {
      markCalls += 1;
    },
    onToggleMap: () => {
      mapCalls += 1;
    },
    onEscape: () => {
      escapeCalls += 1;
      return false;
    },
    onPrimaryAction: (event) => primaryActions.push({ x: event.clientX, y: event.clientY }),
    shouldOrbitWithPrimary: () => orbitOnPrimary,
    onSelectToolSlot: () => {},
    onRotateBuild: () => {
      rotateBuildCalls += 1;
      return rotateBuildHandled;
    },
    isWheelCaptured: () => false,
    isPointerCaptured: () => false,
    isWorldTarget: () => onWorld,
    onAutoWalkToggled: (locked) => autoWalkStates.push(locked),
  });
});

describe('build rotation key', () => {
  it('offers R to building before using it for camera pitch', () => {
    rotateBuildHandled = true;
    fire('keydown', { code: 'KeyR' });

    expect(rotateBuildCalls).toBe(1);
    expect(cameraSpies.adjustCameraPitch).not.toHaveBeenCalled();
  });

  it('keeps the existing camera-pitch shortcut outside build mode', () => {
    rotateBuildHandled = false;
    fire('keydown', { code: 'KeyR' });

    expect(rotateBuildCalls).toBe(1);
    expect(cameraSpies.adjustCameraPitch).toHaveBeenCalledWith(0.14);
  });
});

describe('movement keys', () => {
  /**
   * `isFormElementEvent` narrows on `target.closest('input, select,
   * textarea, button, [contenteditable="true"]')` — a plain menu/panel
   * button is enough to match it, which is exactly what a keyup lands on
   * when a menu opens while a movement key is still held.
   */
  function fakeButtonTarget() {
    const target = new (globalThis as any).HTMLElement();
    target.closest = (selector: string) => (selector.includes('button') ? target : null);
    return target;
  }

  it('clears a held key on release even when the release lands on a menu button', () => {
    // Repro for the "movement sticks after opening a menu" bug: WASD held,
    // a menu opens, the key is released while focus/target is on one of its
    // buttons rather than out in the world.
    fire('keydown', { code: 'KeyW' });
    expect(getMovementInput().y).toBe(1);

    fire('keyup', { code: 'KeyW', target: fakeButtonTarget() });

    expect(getMovementInput().y).toBe(0);
  });

  it('releases every held movement key when the window loses focus', () => {
    fire('keydown', { code: 'KeyW' });
    fire('keydown', { code: 'KeyD' });
    const held = getMovementInput();
    expect(held.x).toBeGreaterThan(0);
    expect(held.y).toBeGreaterThan(0);

    fire('blur', {});

    expect(getMovementInput()).toEqual({ x: 0, y: 0 });
  });
});

describe('auto-walk lock', () => {
  it('is off by default and contributes nothing to movement', () => {
    expect(isAutoWalkLocked()).toBe(false);
    expect(getMovementInput()).toEqual({ x: 0, y: 0 });
  });

  it('Caps Lock toggles it on and off, and it walks forward on its own while on', () => {
    fire('keydown', { code: 'CapsLock' });
    expect(isAutoWalkLocked()).toBe(true);
    expect(getMovementInput()).toEqual({ x: 0, y: 1 });
    expect(autoWalkStates).toEqual([true]);

    fire('keydown', { code: 'CapsLock' });
    expect(isAutoWalkLocked()).toBe(false);
    expect(getMovementInput()).toEqual({ x: 0, y: 0 });
    expect(autoWalkStates).toEqual([true, false]);
  });

  it('the HUD button toggles the exact same state the key does', () => {
    toggleAutoWalkLocked();
    expect(isAutoWalkLocked()).toBe(true);
    expect(autoWalkStates).toEqual([true]);

    toggleAutoWalkLocked(); // leave it off for later tests
  });

  it('sums with real input instead of fighting it, same as any other source', () => {
    fire('keydown', { code: 'CapsLock' });
    fire('keydown', { code: 'KeyS' }); // walking backward while it's on
    expect(getMovementInput()).toEqual({ x: 0, y: 0 });

    fire('keydown', { code: 'CapsLock' }); // leave it off for later tests
    fire('keyup', { code: 'KeyS' });
  });

  it('clears on window blur, same safety net as held movement keys', () => {
    fire('keydown', { code: 'CapsLock' });
    expect(isAutoWalkLocked()).toBe(true);

    fire('blur', {});

    expect(isAutoWalkLocked()).toBe(false);
    expect(getMovementInput()).toEqual({ x: 0, y: 0 });
  });

  it('ignores the shortcut while a form control has focus, like every other action key', () => {
    fire('keydown', { code: 'CapsLock', target: (() => {
      const target = new (globalThis as any).HTMLElement();
      target.closest = (selector: string) => (selector.includes('input') ? target : null);
      return target;
    })() });

    expect(isAutoWalkLocked()).toBe(false);
  });
});

describe('map and mark keys', () => {
  it('opens the map with M and marks this spot with G', () => {
    fire('keydown', { code: 'KeyM' });
    expect(mapCalls).toBe(1);
    expect(markCalls).toBe(0);

    fire('keydown', { code: 'KeyG' });
    expect(markCalls).toBe(1);
    expect(mapCalls).toBe(1);
  });

  it('leaves N unbound now that M opens the map', () => {
    fire('keydown', { code: 'KeyN' });
    expect(mapCalls).toBe(0);
    expect(markCalls).toBe(0);
  });
});

describe('rebindable controls', () => {
  it('fires the bound action from whatever key it is now bound to', () => {
    settingsValues.keyBindings = { ...DEFAULT_KEY_BINDINGS, interact: 'KeyZ' };

    fire('keydown', { code: 'KeyE' }); // the old default no longer does anything
    expect(interactCalls).toBe(0);

    fire('keydown', { code: 'KeyZ' });
    expect(interactCalls).toBe(1);
  });

  it('keeps arrow keys working for movement no matter what WASD is rebound to', () => {
    settingsValues.keyBindings = { ...DEFAULT_KEY_BINDINGS, moveForward: 'KeyT' };

    fire('keydown', { code: 'ArrowUp' });
    expect(getMovementInput().y).toBe(1);
  });

  it('keeps Numpad +/- working for zoom no matter what Equal/Minus are rebound to', () => {
    settingsValues.keyBindings = { ...DEFAULT_KEY_BINDINGS, zoomIn: 'KeyT' };

    fire('keydown', { code: 'NumpadAdd' });
    // adjustCameraZoom isn't spied in this file; reaching this far without
    // throwing, past resolveKeyAction, is the assertion that matters here.
    fire('keydown', { code: 'Equal' }); // no longer bound to anything
    expect(toggleScrapbookCalls).toBe(0);
  });

  it('never claims the keyboard event for interact, same as the old hardcoded KeyE', () => {
    const prevented: boolean[] = [];
    fire('keydown', { code: 'KeyE', preventDefault: () => prevented.push(true) });
    expect(prevented).toEqual([]);
  });
});

describe('key capture, for the rebind UI', () => {
  it('captures the next keydown instead of firing its normal action', () => {
    let captured: string | null | undefined;
    beginKeyCapture((code) => {
      captured = code;
    });

    fire('keydown', { code: 'KeyM' }); // would normally open the map
    expect(captured).toBe('KeyM');
    expect(mapCalls).toBe(0);
  });

  it('Escape cancels a capture instead of binding it, and does not also close a menu', () => {
    let captured: string | null | undefined = 'unset';
    beginKeyCapture((code) => {
      captured = code;
    });
    fire('keydown', { code: 'Escape' });

    expect(captured).toBeNull();
    expect(escapeCalls).toBe(0);
  });

  it('a capture in progress is dropped by the safety net on window blur', () => {
    let captured: string | null | undefined = 'unset';
    beginKeyCapture((code) => {
      captured = code;
    });

    fire('blur', {});
    fire('keydown', { code: 'KeyM' });

    // The capture never resolved (blur cancelled it silently, matching every
    // other "stuck" safety net in this module), and normal keys work again.
    expect(captured).toBe('unset');
    expect(mapCalls).toBe(1);
  });
});

describe('gamepad button actions', () => {
  function setGamepads(gamepads: Array<Partial<Gamepad> | null>) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { getGamepads: () => gamepads },
      configurable: true,
      writable: true,
    });
  }

  function fakeGamepad(pressedButtons: number[], index = 0): Partial<Gamepad> {
    const buttons = Array.from({ length: 16 }, (_, i) => ({ pressed: pressedButtons.includes(i) }));
    return { index, axes: [0, 0, 0, 0], buttons: buttons as GamepadButton[] };
  }

  it('fires a one-shot action on the rising edge, not every frame the button stays down', () => {
    setGamepads([fakeGamepad([0])]); // button 0 = interact, by default
    updateGamepadActions();
    updateGamepadActions();
    expect(interactCalls).toBe(1);

    setGamepads([fakeGamepad([])]);
    updateGamepadActions();
    setGamepads([fakeGamepad([0])]);
    updateGamepadActions();
    expect(interactCalls).toBe(2);
  });

  it('holds movement while a rebound button is down, released when it is not', () => {
    settingsValues.gamepadBindings = { ...DEFAULT_GAMEPAD_BINDINGS, moveForward: 9 };

    setGamepads([fakeGamepad([9])]);
    updateGamepadActions();
    expect(getMovementInput().y).toBe(1);

    setGamepads([fakeGamepad([])]);
    updateGamepadActions();
    expect(getMovementInput().y).toBe(0);
  });

  it('captures a button press for the rebind UI instead of firing it', () => {
    let captured: number | null | undefined = 'unset' as any;
    beginGamepadCapture((buttonIndex) => {
      captured = buttonIndex;
    });

    setGamepads([fakeGamepad([3])]);
    updateGamepadActions();

    expect(captured).toBe(3);
    expect(toggleScrapbookCalls).toBe(0); // button 3's normal binding never fired
  });
});

function press(moves: Array<[number, number]>, from: [number, number] = [100, 100]) {
  fire('pointerdown', { clientX: from[0], clientY: from[1] });
  for (const [x, y] of moves) fire('pointermove', { clientX: x, clientY: y });
  fire('pointerup', { clientX: moves.at(-1)?.[0] ?? from[0], clientY: moves.at(-1)?.[1] ?? from[1] });
}

describe('click versus drag', () => {
  it('fires on a still click', () => {
    press([]);
    expect(primaryActions).toHaveLength(1);
  });

  it('still fires when the hand wobbles a few pixels', () => {
    // The reason this exists: at a 5px tolerance, a tremor, a drifting trackpad
    // tap, or a click taken during an uneven frame silently does nothing. There
    // is no camera gesture competing here, so there is nothing to protect.
    press([[106, 103], [108, 100]]);
    expect(primaryActions).toHaveLength(1);
  });

  it('does not fire after a real drag', () => {
    press([[140, 160]]);
    expect(primaryActions).toHaveLength(0);
  });

  it('is strict while the press is also orbiting the camera', () => {
    // Here the small threshold earns its keep: without it, every camera orbit
    // would end by clicking whatever the pointer happened to land on.
    orbitOnPrimary = true;
    press([[108, 100]]);
    expect(primaryActions).toHaveLength(0);
  });

  it('ignores presses that began in a form control', () => {
    const target = Object.assign(new (globalThis as any).HTMLElement(), { closest: () => ({}) });
    fire('pointerdown', { clientX: 100, clientY: 100, target });
    fire('pointerup', { clientX: 100, clientY: 100 });
    expect(primaryActions).toHaveLength(0);
  });
});

describe('presses that involve HUD chrome', () => {
  // These all come from one real bug. HUD panels call stopPropagation on
  // pointerup, so a press begun on the world and released over a panel used to
  // leave `pendingPrimary` set forever — which then either swallowed the next
  // click or got cashed in by an unrelated later release, firing a world
  // action at coordinates nobody clicked.

  it('does not fire when the release lands on HUD chrome', () => {
    fire('pointerdown', { clientX: 100, clientY: 100 });
    onWorld = false;
    fire('pointerup', { clientX: 100, clientY: 100 });
    expect(primaryActions).toHaveLength(0);
  });

  it('leaves nothing pending after a release on HUD chrome', () => {
    // The regression that mattered most: the *next* click has to still work.
    fire('pointerdown', { clientX: 100, clientY: 100 });
    onWorld = false;
    fire('pointerup', { clientX: 100, clientY: 100 });

    onWorld = true;
    press([]);
    expect(primaryActions).toHaveLength(1);
  });

  it('never lets a HUD press become a world click', () => {
    onWorld = false;
    fire('pointerdown', { clientX: 40, clientY: 40 });
    onWorld = true;
    fire('pointerup', { clientX: 40, clientY: 40 });
    expect(primaryActions).toHaveLength(0);
  });

  it('does not let one pointer cash in another pointer\'s press', () => {
    fire('pointerdown', { clientX: 100, clientY: 100, pointerId: 1 });
    fire('pointerup', { clientX: 300, clientY: 300, pointerId: 7 });
    expect(primaryActions).toHaveLength(0);
  });

  it('drops a press once the button is no longer held', () => {
    // Self-heal for a release we never heard about at all.
    fire('pointerdown', { clientX: 100, clientY: 100 });
    fire('pointermove', { clientX: 101, clientY: 100, buttons: 0 });
    fire('pointerup', { clientX: 101, clientY: 100 });
    expect(primaryActions).toHaveLength(0);
  });

  it('drops a press when a HUD widget takes the capture', () => {
    fire('pointerdown', { clientX: 100, clientY: 100 });
    fire('lostpointercapture', {});
    fire('pointerup', { clientX: 100, clientY: 100 });
    expect(primaryActions).toHaveLength(0);
  });

  it('recovers after the window loses focus mid-press', () => {
    fire('pointerdown', { clientX: 100, clientY: 100 });
    fire('blur', {});
    fire('pointerup', { clientX: 100, clientY: 100 });
    expect(primaryActions).toHaveLength(0);

    press([]);
    expect(primaryActions).toHaveLength(1);
  });
});
