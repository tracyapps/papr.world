import { describe, expect, it } from 'vitest';
import {
  PAD_DEADZONE,
  PINCH_MAX_STEP,
  padOffsetToMovement,
  pinchZoomDelta,
  twoPointerDistance,
} from './touchControls';

// The pad and pinch are the only parts of touch play that can be tested
// without a tablet in hand: the sandbox emulates a size and a single touch
// point, but not two real fingers drifting apart. Everything below is
// arithmetic over numbers, which is exactly why it was kept out of the DOM in
// the first place.

function expectMovement(
  actual: { x: number; y: number },
  expected: { x: number; y: number },
  precision = 6,
) {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
}

describe('move pad: thumb position to movement', () => {
  it('reads a thumb at the centre as standing still', () => {
    expectMovement(padOffsetToMovement(0, 0, 40), { x: 0, y: 0 });
  });

  it('reads anything inside the deadzone as standing still', () => {
    // The ring exists so a resting thumb — which is never exactly centred —
    // does not walk the avatar away while the player is doing something else.
    expectMovement(padOffsetToMovement(4, 0, 40), { x: 0, y: 0 });
    // Just inside: a 0.1 throw against a 0.16 deadzone.
    expectMovement(padOffsetToMovement(3.9, 0, 40), { x: 0, y: 0 });
  });

  it('starts moving the moment the thumb clears the deadzone', () => {
    const justOutside = padOffsetToMovement(PAD_DEADZONE * 40 + 0.5, 0, 40);
    expect(justOutside.x).toBeGreaterThan(0);
    expect(justOutside.y).toBe(0);
  });

  it('maps a full throw at the rim to a full unit of speed', () => {
    expectMovement(padOffsetToMovement(0, -40, 40), { x: 0, y: 1 });
    expectMovement(padOffsetToMovement(0, 40, 40), { x: 0, y: -1 });
    expectMovement(padOffsetToMovement(40, 0, 40), { x: 1, y: 0 });
    expectMovement(padOffsetToMovement(-40, 0, 40), { x: -1, y: 0 });
  });

  it('flips the vertical axis once: screen-up is forward', () => {
    // The DOM's y grows downward and `getMovementInput`'s does not, so this
    // is the one sign that must not be forgotten.
    expect(padOffsetToMovement(0, -20, 40).y).toBeGreaterThan(0);
    expect(padOffsetToMovement(0, 20, 40).y).toBeLessThan(0);
  });

  it('gives a diagonal the same speed as a straight throw', () => {
    // Half the rim on each axis is a full throw's length, so the avatar must
    // not walk 1.41× faster just for heading northeast.
    const diagonal = padOffsetToMovement(28.28427, -28.28427, 40);
    expectMovement(diagonal, { x: Math.SQRT1_2, y: Math.SQRT1_2 });
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1, 6);
  });

  it('scales with distance, not just direction', () => {
    // Half a throw is not half a speed: the deadzone is removed first, then
    // what is left is stretched across the full range. 0.5 - 0.16 over
    // 1 - 0.16 is about 0.405, which is the whole point of an analog pad.
    const half = padOffsetToMovement(20, 0, 40);
    expectMovement(half, { x: (0.5 - PAD_DEADZONE) / (1 - PAD_DEADZONE), y: 0 });
  });

  it('clamps past the rim but keeps the direction', () => {
    // A thumb that slides off the pad keeps walking the way it was going
    // rather than snapping to whichever axis it crossed.
    expectMovement(padOffsetToMovement(200, 0, 40), { x: 1, y: 0 });
    expectMovement(padOffsetToMovement(0, -200, 40), { x: 0, y: 1 });
    const offEdge = padOffsetToMovement(300, -300, 40);
    expect(Math.hypot(offEdge.x, offEdge.y)).toBeCloseTo(1, 6);
    expect(offEdge.x).toBeGreaterThan(0);
    expect(offEdge.y).toBeGreaterThan(0);
  });

  it('never returns a throw longer than one', () => {
    for (const [x, y] of [[999, 0], [0, -999], [500, 500], [-500, -500]]) {
      const movement = padOffsetToMovement(x, y, 40);
      expect(Math.hypot(movement.x, movement.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('honours a caller-supplied deadzone', () => {
    // A bigger deadzone swallows a throw the default would have accepted.
    expectMovement(padOffsetToMovement(12, 0, 40, 0.5), { x: 0, y: 0 });
    expect(padOffsetToMovement(12, 0, 40).x).toBeGreaterThan(0);
  });

  it('refuses to divide by a nonsense radius', () => {
    expectMovement(padOffsetToMovement(10, 10, 0), { x: 0, y: 0 });
    expectMovement(padOffsetToMovement(10, 10, -5), { x: 0, y: 0 });
  });
});

describe('two-finger distance', () => {
  it('is the straight-line span of the two pointers', () => {
    expect(twoPointerDistance(0, 0, 3, 4)).toBe(5);
    expect(twoPointerDistance(10, 10, 10, 10)).toBe(0);
    expect(twoPointerDistance(-5, 0, 5, 0)).toBe(10);
  });
});

describe('pinch: span ratio to a zoom step', () => {
  it('does nothing when the fingers have not moved', () => {
    expect(pinchZoomDelta(120, 120)).toBe(0);
  });

  it('zooms in when the fingers spread', () => {
    // Zooming in shortens the camera distance, so the sign is negative — the
    // same direction as the + key and the zoom-in button.
    expect(pinchZoomDelta(100, 110)).toBeLessThan(0);
  });

  it('zooms out when the fingers close', () => {
    expect(pinchZoomDelta(110, 100)).toBeGreaterThan(0);
  });

  it('is symmetric: a gesture undoes itself exactly', () => {
    // The whole reason for the log of the ratio. Spread then close returns to
    // the distance you started at with no drift, which a raw difference would
    // not: it would creep a little further each time the hand settled.
    const out = pinchZoomDelta(100, 160);
    const back = pinchZoomDelta(160, 100);
    expect(out + back).toBeCloseTo(0, 9);
  });

  it('scales with the ratio, not the pixel distance', () => {
    // Doubling the span means the same thing at any size of hand.
    expect(pinchZoomDelta(50, 100)).toBeCloseTo(pinchZoomDelta(200, 400), 9);
  });

  it('matches a plain log-ratio computation at a modest spread', () => {
    expect(pinchZoomDelta(100, 110)).toBeCloseTo(-Math.log(1.1) * 3, 9);
  });

  it('caps a single step so one bad frame cannot fling the camera', () => {
    // A finger landing mid-gesture can arrive as a huge ratio in one frame.
    expect(pinchZoomDelta(40, 400)).toBe(-PINCH_MAX_STEP);
    expect(pinchZoomDelta(400, 40)).toBe(PINCH_MAX_STEP);
  });

  it('accepts a gain override, for tuning without touching the constant', () => {
    expect(pinchZoomDelta(100, 110, 1)).toBeCloseTo(-Math.log(1.1), 9);
  });

  it('treats a zero or negative span as no gesture at all', () => {
    // Defensive: two pointers can coincide exactly, and a gesture that has
    // not started yet reports 0. Neither should move the camera.
    expect(pinchZoomDelta(0, 100)).toBe(0);
    expect(pinchZoomDelta(100, 0)).toBe(0);
    expect(pinchZoomDelta(-10, 100)).toBe(0);
  });
});
