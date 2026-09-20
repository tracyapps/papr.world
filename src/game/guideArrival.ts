// When the guide switches itself off. Renderer-free so it can be tested.
//
// A guide points you at a place; once you are close enough you do not need it
// any more, and leaving an arrow parked on your destination is just noise.
// So: inside `ARRIVE_RADIUS` the guide counts as arrived, lingers a moment so
// the "You're at ..." message can be read, then clears itself.

/**
 * How near counts as "there", in world units (a page is 50). About a dozen
 * steps' worth of slack: enough to be at a door or a party without having to
 * land on the exact marked spot.
 */
export const ARRIVE_RADIUS = 6;

/** Seconds the arrival message stays up before the guide clears. */
export const ARRIVE_LINGER_SECONDS = 2.2;

export type ArrivalState = 'travelling' | 'arrived' | 'clear';

export type ArrivalStep = {
  /** Clock time (seconds) the guide first came within range, or null. */
  since: number | null;
  state: ArrivalState;
};

export function isArrived(distance: number, radius = ARRIVE_RADIUS): boolean {
  return distance < radius;
}

/**
 * One tick of the arrival clock. Leaving the radius (an overshoot, a look
 * around) resets it, so the guide only clears when you actually stay.
 */
export function stepArrival(
  since: number | null,
  distance: number,
  now: number,
  radius = ARRIVE_RADIUS,
  linger = ARRIVE_LINGER_SECONDS,
): ArrivalStep {
  if (!isArrived(distance, radius)) return { since: null, state: 'travelling' };
  const start = since ?? now;
  return { since: start, state: now - start >= linger ? 'clear' : 'arrived' };
}
