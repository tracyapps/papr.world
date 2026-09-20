import { describe, expect, it } from 'vitest';
import { easeShift, framingShift, MAX_SHIFT_SHARE } from './dialogueFraming';

const card = { left: 400, right: 1160, top: 600, bottom: 1020 };
const base = { card, viewportHeight: 1044, clearTop: 84 };

describe('framingShift', () => {
  it('leaves the view alone when the animal is above the card', () => {
    expect(framingShift({ ...base, animal: { left: 700, right: 800, top: 300, bottom: 420 } })).toBe(0);
  });

  it('leaves the view alone when the animal is beside the card', () => {
    expect(framingShift({ ...base, animal: { left: 100, right: 220, top: 700, bottom: 820 } })).toBe(0);
  });

  it('slides up just enough to clear the card, with a gap', () => {
    // Bottom at 700 against a clear edge of 584: 116 to go.
    expect(framingShift({ ...base, animal: { left: 700, right: 820, top: 560, bottom: 700 } })).toBe(116);
  });

  it('never pushes the animal head above the clear band', () => {
    // Needs 300 but only 20 of room above the head.
    expect(framingShift({ ...base, animal: { left: 700, right: 820, top: 104, bottom: 884 } })).toBe(20);
  });

  it('caps how far the view can slide', () => {
    const shift = framingShift({ ...base, viewportHeight: 500, card: { ...card, top: 40 }, animal: { left: 700, right: 820, top: 480, bottom: 900 } });
    expect(shift).toBeLessThanOrEqual(500 * MAX_SHIFT_SHARE);
  });

  it('is never negative', () => {
    expect(framingShift({ ...base, animal: { left: 700, right: 820, top: -50, bottom: 100 } })).toBe(0);
  });
});

describe('easeShift', () => {
  it('moves toward the target without overshooting', () => {
    const step = easeShift(0, 100, 1 / 60, false);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(100);
  });

  it('lands exactly on a target it is very close to', () => {
    expect(easeShift(99.8, 100, 1 / 60, false)).toBe(100);
  });

  it('snaps under reduced motion', () => {
    expect(easeShift(0, 100, 1 / 60, true)).toBe(100);
  });
});
