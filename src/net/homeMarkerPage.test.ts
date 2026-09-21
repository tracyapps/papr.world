import { describe, expect, it } from 'vitest';
import { homeMarkerPage } from '../world/homeSite';

describe('home marker page', () => {
  it('comes from the home position rather than the owner avatar position', () => {
    expect(homeMarkerPage(-1.5, -2.2)).toBe('0,0');
    expect(homeMarkerPage(51, -74)).toBe('1,-1');
  });
});
