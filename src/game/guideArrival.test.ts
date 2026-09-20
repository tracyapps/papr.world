import { describe, expect, it } from 'vitest';
import { ARRIVE_LINGER_SECONDS, ARRIVE_RADIUS, isArrived, stepArrival } from './guideArrival';

describe('guide arrival', () => {
  it('counts as arrived only inside the radius', () => {
    expect(isArrived(ARRIVE_RADIUS - 0.1)).toBe(true);
    expect(isArrived(ARRIVE_RADIUS)).toBe(false);
    expect(isArrived(40)).toBe(false);
  });

  it('keeps travelling while far away', () => {
    expect(stepArrival(null, 30, 10)).toEqual({ since: null, state: 'travelling' });
  });

  it('starts the clock on arrival, then clears after the linger', () => {
    // Clock starts at 0 so the arithmetic is exact (no float drift in 12.2 - 10).
    const first = stepArrival(null, 2, 0);
    expect(first).toEqual({ since: 0, state: 'arrived' });
    expect(stepArrival(first.since, 2, ARRIVE_LINGER_SECONDS - 0.1).state).toBe('arrived');
    expect(stepArrival(first.since, 2, ARRIVE_LINGER_SECONDS).state).toBe('clear');
  });

  it('resets when you walk back out, so an overshoot does not clear it', () => {
    const inside = stepArrival(null, 2, 10);
    const out = stepArrival(inside.since, 20, 11);
    expect(out).toEqual({ since: null, state: 'travelling' });
    expect(stepArrival(out.since, 2, 12)).toEqual({ since: 12, state: 'arrived' });
  });

  it('honours a bigger radius for a bigger place', () => {
    expect(stepArrival(null, 10, 0, 12).state).toBe('arrived');
    expect(stepArrival(null, 10, 0).state).toBe('travelling');
  });
});
