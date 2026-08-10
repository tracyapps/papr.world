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
vi.mock('./settings', () => ({ getSetting: () => 'grab-world' }));

const { initializeInput } = await import('./input');

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

beforeEach(() => {
  listeners.clear();
  primaryActions = [];
  orbitOnPrimary = false;
  onWorld = true;
  rotateBuildHandled = false;
  rotateBuildCalls = 0;
  cameraSpies.adjustCameraPitch.mockClear();

  const stub = {
    window: {
      addEventListener: (type: string, listener: Listener) => {
        const existing = listeners.get(type) ?? [];
        existing.push(listener);
        listeners.set(type, existing);
      },
    },
    document: { documentElement: { classList: { add: () => {}, remove: () => {} } } },
    // `isFormElementEvent` narrows with `instanceof HTMLElement`, so the stub
    // has to provide the constructor it tests against.
    HTMLElement: class {},
  };
  Object.assign(globalThis, stub);

  initializeInput({
    onToggleScrapbook: () => {},
    onToggleNearby: () => {},
    onMarkPlace: () => {},
    onEscape: () => false,
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
