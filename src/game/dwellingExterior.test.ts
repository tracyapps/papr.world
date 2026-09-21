import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../render/materials', () => ({
  createColorMaterial: () => new THREE.MeshStandardMaterial(),
  getMaterial: () => new THREE.MeshStandardMaterial(),
}));
vi.mock('../render/builders', () => ({ shadowed: <T>(object: T) => object }));
vi.mock('../world/terrain', () => ({ sampleTerrainHeight: () => 0 }));

const { buildDwellingExterior } = await import('./dwellingExterior');
const { createDefaultGameState, setGameStateForTests } = await import('../sim/state');
const { homePosition } = await import('../world/homeSite');
const { setHomePlace } = await import('../world/places');

afterEach(() => setGameStateForTests(null));

describe('the local home exterior', () => {
  it('moves the existing drawing when neighborhood allocation moves Home', () => {
    const state = createDefaultGameState();
    state.player.places = [{ id: 'home', name: 'Home', x: -1.5, z: -2.2, builtin: true }];
    setGameStateForTests(state);
    const page = new THREE.Group();
    buildDwellingExterior(page);
    const exterior = page.getObjectByName('home-exterior');
    expect(exterior?.getObjectByName('my-home-sign')).toBeTruthy();
    expect(exterior?.position.x).toBeCloseTo(homePosition({ x: -1.5, z: -2.2 }).x);

    expect(setHomePlace(6.5, -2.2)).toBe(true);
    const moved = homePosition({ x: 6.5, z: -2.2 });
    expect(exterior?.position.x).toBeCloseTo(moved.x);
    expect(exterior?.position.z).toBeCloseTo(moved.z);
  });
});
