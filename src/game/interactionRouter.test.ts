import { afterEach, describe, expect, it } from 'vitest';
import {
  hasOrbitBlockingInteractionAt,
  hasScreenInteractionAt,
  registerScreenInteraction,
  setInteractionsIndoors,
  tryScreenInteractionAt,
} from './interactionRouter';

const cleanups: Array<() => void> = [];

afterEach(() => {
  setInteractionsIndoors(false);
  while (cleanups.length > 0) cleanups.pop()?.();
});

describe('screen interaction routing', () => {
  it('lets a broad cozy target remain clickable without blocking camera drag', () => {
    cleanups.push(registerScreenInteraction({
      id: 'greenhouse',
      priority: 70,
      blocksOrbit: false,
      hitTest: (x, y) => x === 40 && y === 20,
      interact: () => true,
    }));

    expect(hasScreenInteractionAt(40, 20)).toBe(true);
    expect(hasOrbitBlockingInteractionAt(40, 20)).toBe(false);
    expect(tryScreenInteractionAt(40, 20)).toBe(true);
  });

  it('keeps precise tool targets orbit-blocking by default', () => {
    cleanups.push(registerScreenInteraction({
      id: 'harvestable',
      priority: 80,
      hitTest: () => true,
      interact: () => true,
    }));

    expect(hasOrbitBlockingInteractionAt(10, 10)).toBe(true);
  });

  it('still blocks orbit when a non-blocking target overlaps a precise target', () => {
    cleanups.push(registerScreenInteraction({
      id: 'greenhouse',
      priority: 70,
      blocksOrbit: false,
      hitTest: () => true,
      interact: () => true,
    }));
    cleanups.push(registerScreenInteraction({
      id: 'plant',
      priority: 75,
      hitTest: () => true,
      interact: () => true,
    }));

    expect(hasOrbitBlockingInteractionAt(0, 0)).toBe(true);
  });

  it('keeps surface things out of reach indoors, and indoor things out of reach outside', () => {
    let dug = 0;
    let sat = 0;
    cleanups.push(registerScreenInteraction({
      id: 'dig', priority: 20, hitTest: () => true, interact: () => { dug += 1; return true; },
    }));
    cleanups.push(registerScreenInteraction({
      id: 'sit', priority: 10, scene: 'interior', hitTest: () => true, interact: () => { sat += 1; return true; },
    }));

    tryScreenInteractionAt(1, 1);
    expect([dug, sat]).toEqual([1, 0]);

    setInteractionsIndoors(true);
    expect(hasScreenInteractionAt(1, 1)).toBe(true);
    tryScreenInteractionAt(1, 1);
    expect([dug, sat]).toEqual([1, 1]);
  });

  it('offers an "any" interaction in both places', () => {
    cleanups.push(registerScreenInteraction({
      id: 'everywhere', priority: 5, scene: 'any', hitTest: () => true, interact: () => true,
    }));
    expect(hasScreenInteractionAt(1, 1)).toBe(true);
    setInteractionsIndoors(true);
    expect(hasScreenInteractionAt(1, 1)).toBe(true);
  });
});
