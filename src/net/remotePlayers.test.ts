import { describe, expect, it } from 'vitest';
import { RemotePlayerBuffer, TELEPORT_DISTANCE } from './remotePlayers';

describe('remote player buffer', () => {
  it('blends between two nearby snapshots', () => {
    const buffer = new RemotePlayerBuffer();
    buffer.push('a', 0, 0, 0, 1000);
    buffer.push('a', 10, 0, 0, 1100);
    const mid = buffer.sample('a', 1150);
    expect(mid?.x).toBeCloseTo(5, 5);
  });

  it('does not slide across a door: a jump between the surface and a home starts fresh', () => {
    const buffer = new RemotePlayerBuffer();
    buffer.push('a', 3, 4, 0, 1000);
    buffer.push('a', 40000, 40001, 0, 1100);
    // Halfway through the gap between the two snapshots it must NOT be blending.
    const during = buffer.sample('a', 1050 + 100);
    expect(during?.x).toBe(40000);
    expect(during?.z).toBe(40001);
    const before = buffer.sample('a', 1000);
    expect(before?.x).toBe(40000);
  });

  it('still blends ordinary fast travel', () => {
    const buffer = new RemotePlayerBuffer();
    buffer.push('a', 0, 0, 0, 1000);
    buffer.push('a', TELEPORT_DISTANCE - 1, 0, 0, 1100);
    expect(buffer.sample('a', 1150)?.x).toBeGreaterThan(0);
    expect(buffer.sample('a', 1150)?.x).toBeLessThan(TELEPORT_DISTANCE - 1);
  });
});
