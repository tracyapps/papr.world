import { describe, expect, it } from 'vitest';
import { pageId } from './types';
import {
  HOME_INTERIOR_PAGE_ID,
  HOME_INTERIOR_SCENE,
  SURFACE_SCENE,
  formatSceneAddress,
  isInteriorScene,
  isSceneId,
  parseSceneAddress,
  sanitizeScene,
  sceneOfPageId,
} from './scenes';

describe('scene addresses', () => {
  it('formats the surface exactly like every page id that exists today', () => {
    for (const [px, pz] of [[0, 0], [3, -2], [-17, 40]]) {
      expect(formatSceneAddress({ scene: SURFACE_SCENE, px, pz })).toBe(pageId(px, pz));
    }
  });

  it('prefixes other scenes', () => {
    expect(formatSceneAddress({ scene: HOME_INTERIOR_SCENE, px: 0, pz: 0 })).toBe(HOME_INTERIOR_PAGE_ID);
    expect(formatSceneAddress({ scene: 'under', px: 3, pz: -2 })).toBe('under:3,-2');
  });

  it('parses both shapes back', () => {
    expect(parseSceneAddress('3,-2')).toEqual({ scene: 'surface', px: 3, pz: -2 });
    expect(parseSceneAddress('in:home:0,0')).toEqual({ scene: 'in:home', px: 0, pz: 0 });
    expect(parseSceneAddress('under:-1,5')).toEqual({ scene: 'under', px: -1, pz: 5 });
  });

  it('round-trips', () => {
    const address = { scene: HOME_INTERIOR_SCENE, px: -4, pz: 9 };
    expect(parseSceneAddress(formatSceneAddress(address))).toEqual(address);
  });

  it('refuses anything that is not an address', () => {
    for (const bad of ['', 'x', '1,2,3', 'in:home', 'in:Home:0,0', 'nowhere:0,0', 'in:home:a,b']) {
      expect(parseSceneAddress(bad)).toBeNull();
    }
  });

  it('keeps interior ids inside the server\'s 32-character page limit', () => {
    // Interiors are small: page coordinates stay within a couple of digits.
    expect(formatSceneAddress({ scene: 'in:abcdefghijklmnop', px: -99, pz: -99 }).length).toBeLessThanOrEqual(32);
  });

  it('says which scene a page id belongs to', () => {
    expect(sceneOfPageId('0,0')).toBe('surface');
    expect(sceneOfPageId('in:home:0,0')).toBe('in:home');
    expect(sceneOfPageId('nonsense')).toBe('surface');
  });

  it('tells interiors from the rest, and sanitizes saved ids', () => {
    expect(isInteriorScene('in:home')).toBe(true);
    expect(isInteriorScene('surface')).toBe(false);
    expect(isSceneId('in:home')).toBe(true);
    expect(isSceneId('in:HOME')).toBe(false);
    expect(sanitizeScene('in:home')).toBe('in:home');
    expect(sanitizeScene('under')).toBe('surface'); // not built yet
    expect(sanitizeScene('in:someone-else')).toBe('surface');
    expect(sanitizeScene(42)).toBe('surface');
    expect(sanitizeScene(undefined)).toBe('surface');
  });
});
