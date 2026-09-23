import { describe, expect, it } from 'vitest';
import { createHomeLook, sanitizeHomeLook } from './homeLook';

describe('saved home appearance', () => {
  it('keeps valid inside and outside choices while rejecting malformed save values', () => {
    const look = sanitizeHomeLook({
      outsideWalls: { design: 'wall.siding2', color: '#AABBCC' },
      insideFloor: { design: 'roof.shingle1', color: 'transparent' },
      insideWalls: { design: 'unknown', color: '#123456' },
    });
    expect(look.outsideWalls).toEqual({ design: 'wall.siding2', color: '#aabbcc' });
    expect(look.insideFloor.color).toBe(createHomeLook().insideFloor.color);
    expect(look.insideWalls.design).toBe(createHomeLook().insideWalls.design);
    expect(look.insideWalls.color).toBe('#123456');
  });
});
