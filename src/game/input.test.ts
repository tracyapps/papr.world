import { beforeEach, describe, expect, it, vi } from 'vitest';

// Click-vs-drag is the only part of input worth testing in isolation, and it
// is worth testing because getting it wrong presents as "clicking doesn't
// work" with nothing in the console.

vi.mock('./camera', () => ({
  addYaw: () => {},
  adjustCameraPitch: () => {},
  adjustCameraZoom: () => {},
  applyGamepadLook: () => {},
}));
vi.mock('./settings', () => ({ getSetting: () => 'grab-world' }));

const { initializeInput } = await import('./input');

type Listener = (event: any) => void;
const listeners = new Map<string, Listener[]>();

function fire(type: string, event: Record<string, unknown>) {
  for (const listener of listeners.get(type) ?? []) {
    listener({ button: 0, buttons: 1, clientX: 0, clientY: 0, target: null, preventDefault: () => {}, ...event });
  }
}

let primaryActions: Array<{ x: number; y: number }>;
let orbitOnPrimary: boolean;

beforeEach(() => {
  listeners.clear();
  primaryActions = [];
  orbitOnPrimary = false;

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
    onToggleMaker: () => {},
    onMarkPlace: () => {},
    onEscape: () => false,
    onPrimaryAction: (event) => primaryActions.push({ x: event.clientX, y: event.clientY }),
    shouldOrbitWithPrimary: () => orbitOnPrimary,
    onSelectToolSlot: () => {},
    isWheelCaptured: () => false,
    isPointerCaptured: () => false,
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
