import * as THREE from 'three';
import { describe, expect, it, beforeEach, vi } from 'vitest';

vi.mock('../render/context', () => ({ textureLoader: { load: () => ({}) } }));
vi.mock('./terrain', () => ({ sampleTerrainHeight: () => 0 }));
// Real materials would drag in texture loading; the geometry tests below only
// care about where vertices end up.
vi.mock('../render/materials', () => ({
  getMaterial: () => new THREE.MeshBasicMaterial(),
}));

const {
  AUTHORED_WATER_BODIES,
  SHALLOW_WATER_DEPTH,
  isInWater,
  nudgeOutOfWater,
  registerPageWater,
  registerWaterBody,
  resetWaterForTests,
  submersionAt,
  waterDepthAt,
} = await import('./water');

const POND = {
  id: '0,0:pond',
  x: 0,
  z: 0,
  halfWidth: 2,
  halfDepth: 1,
  rotationY: 0,
  depth: SHALLOW_WATER_DEPTH,
};

describe('water bodies', () => {
  beforeEach(() => {
    resetWaterForTests();
  });

  it('is deepest at the centre and dry outside', () => {
    registerWaterBody(POND);
    expect(submersionAt(0, 0)).toBeCloseTo(1, 5);
    expect(submersionAt(2.1, 0)).toBe(0);
    expect(submersionAt(0, 1.1)).toBe(0);
  });

  it('shelves gradually rather than dropping off a cliff', () => {
    registerWaterBody(POND);
    // Walking in should get steadily deeper, not step from dry to full depth.
    const samples = [0.4, 0.8, 1.2, 1.6, 1.9].map((x) => submersionAt(x, 0));
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]).toBeLessThan(samples[index - 1]);
    }
    expect(samples[samples.length - 1]).toBeGreaterThan(0);
  });

  it('respects rotation instead of testing a bounding box', () => {
    // A point beyond the pond's short axis but inside its bounding box must
    // still be dry once the pond is turned.
    registerWaterBody({ ...POND, rotationY: Math.PI / 2 });
    // Rotated 90°, the long axis now runs along z.
    expect(submersionAt(0, 1.8)).toBeGreaterThan(0);
    expect(submersionAt(1.8, 0)).toBe(0);
  });

  it('reports depth in world units', () => {
    registerWaterBody(POND);
    expect(waterDepthAt(0, 0)).toBeCloseTo(SHALLOW_WATER_DEPTH, 5);
    expect(waterDepthAt(9, 9)).toBe(0);
  });

  it('takes the deepest of overlapping bodies, never the sum', () => {
    // Same rule as overlapping digs: two ponds meeting form one pond, not a
    // trench twice as deep.
    registerWaterBody(POND);
    registerWaterBody({ ...POND, id: '0,0:pond-b', x: 1 });
    expect(submersionAt(0.5, 0)).toBeLessThanOrEqual(1);
  });

  it('treats an empty world as entirely dry', () => {
    expect(isInWater(0, 0)).toBe(false);
    expect(submersionAt(0, 0)).toBe(0);
  });

  it('registers authored bodies before anything is placed on the page', () => {
    // Ordering regression: the clearing pond used to be created part-way
    // through building the page, so props placed earlier could not see it —
    // which is how a stone cluster ended up floating on the water.
    registerPageWater('0,0', []);
    const pond = AUTHORED_WATER_BODIES['0,0'][0];
    expect(isInWater(pond.x, pond.z)).toBe(true);
  });

  it('registers water declared as a page prop', () => {
    registerPageWater('3,4', [
      { kind: 'water', id: 'creek', x: 10, z: 10, width: 4, depth: 2, rotY: 0 },
      { kind: 'tree', x: 30, z: 30 },
    ]);
    expect(isInWater(10, 10)).toBe(true);
    expect(isInWater(30, 30)).toBe(false);
  });
});

describe('water surface geometry', () => {
  beforeEach(() => {
    resetWaterForTests();
  });

  /** World-space centre of a mesh, after its parents' transforms. */
  function worldCentre(mesh: THREE.Mesh): THREE.Vector3 {
    mesh.updateWorldMatrix(true, false);
    mesh.geometry.computeBoundingBox();
    const centre = new THREE.Vector3();
    mesh.geometry.boundingBox!.getCenter(centre);
    return mesh.localToWorld(centre);
  }

  it('draws the bed and surface over the body they belong to', async () => {
    // The bug this guards: the bed's vertices were written in world space and
    // "cancelled" with a large negative local offset. The group's rotation
    // rotated that offset, so the pond's bed rendered metres away — over by
    // the house — instead of under its own water.
    const { buildWaterSurface } = await import('./water');
    const body = { ...POND, x: -5.2, z: 4.7, rotationY: -0.18 };
    registerWaterBody(body);

    const group = buildWaterSurface(body);
    group.updateMatrixWorld(true);
    const [bed, surface] = group.children as THREE.Mesh[];

    for (const mesh of [bed, surface]) {
      const centre = worldCentre(mesh);
      expect(centre.x).toBeCloseTo(body.x, 3);
      expect(centre.z).toBeCloseTo(body.z, 3);
    }
  });

  it('keeps the bed under the water when the group is scaled', async () => {
    // Clicking the pond runs a cozy "ripple" reaction that scales the group.
    // With a cancelling offset in the bed's local position, that scale
    // multiplied the offset and threw the bed further away on every click.
    const { buildWaterSurface } = await import('./water');
    const body = { ...POND, x: -5.2, z: 4.7, rotationY: -0.18 };
    registerWaterBody(body);

    const group = buildWaterSurface(body);
    group.scale.x *= 1.12;
    group.scale.z *= 1.12;
    group.updateMatrixWorld(true);

    const centre = worldCentre(group.children[0] as THREE.Mesh);
    expect(centre.x).toBeCloseTo(body.x, 3);
    expect(centre.z).toBeCloseTo(body.z, 3);
  });
});

describe('nudging things out of water', () => {
  beforeEach(() => {
    resetWaterForTests();
  });

  it('leaves a dry point exactly where it is', () => {
    registerWaterBody(POND);
    expect(nudgeOutOfWater(9, 9)).toEqual({ x: 9, z: 9 });
  });

  it('moves a wet point onto dry ground', () => {
    registerWaterBody(POND);
    const moved = nudgeOutOfWater(0, 0);
    expect(isInWater(moved.x, moved.z)).toBe(false);
  });

  it('is deterministic, so a nudged spawn agrees across reloads and clients', () => {
    registerWaterBody(POND);
    expect(nudgeOutOfWater(0.3, 0.1)).toEqual(nudgeOutOfWater(0.3, 0.1));
  });

  it('finds the near shore rather than wandering far off', () => {
    registerWaterBody(POND);
    const moved = nudgeOutOfWater(0, 0);
    // The pond is 2 x 1 half-extents; the closest dry ground is just past
    // the short axis, so a sensible nudge stays well inside the search cap.
    expect(Math.hypot(moved.x, moved.z)).toBeLessThan(2.5);
  });

  it('gives up gracefully rather than looping on an all-water world', () => {
    registerWaterBody({ ...POND, halfWidth: 500, halfDepth: 500 });
    const moved = nudgeOutOfWater(0, 0, 2);
    expect(moved).toEqual({ x: 0, z: 0 });
  });
});

describe('water registry lifecycle', () => {
  beforeEach(() => {
    resetWaterForTests();
  });

  it('drops a page’s bodies when that page unloads', async () => {
    const { clearWaterBodiesForPage } = await import('./water');
    registerWaterBody(POND);
    registerWaterBody({ ...POND, id: '1,0:pond', x: 20 });

    clearWaterBodiesForPage('0,0');

    expect(submersionAt(0, 0)).toBe(0);
    expect(submersionAt(20, 0)).toBeCloseTo(1, 5);
  });
});
