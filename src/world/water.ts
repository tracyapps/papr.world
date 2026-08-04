import * as THREE from 'three';
import { getMaterial } from '../render/materials';
import { nudgeToFreeSpot } from '../core/placement';
import { RENDER_ORDER } from '../render/renderOrder';
import { sampleTerrainHeight } from './terrain';

// Water bodies.
//
// Water is a *kind of thing*, not a colour of paper. That distinction matters
// more than it sounds: the world generator scatters `paper.blue` patches as
// ordinary decoration alongside plaid and bubble prints, so treating blue
// paper as water would have turned random decorative scraps into ponds and
// removed blue from the palette. A patch is water only when it is authored or
// generated as water.
//
// The registry is separate from the meshes because two very different
// consumers need it: the renderer draws surfaces, while avatar movement needs
// a cheap "how deep is the water here?" query every frame with no dependency
// on whether a page happens to be built.
//
// Rivers and lakes (see docs/water-and-waterways.md) are additional *shapes*
// registered here, not a different system: anything that can answer
// `submersionAt` gets wading, ripples, and later boats for free.

/** How far below the ground line a shallow body sits. */
export const SHALLOW_WATER_DEPTH = 0.26;

export type WaterBody = {
  id: string;
  x: number;
  z: number;
  /** Half-extents, so the maths matches the rendered sheet. */
  halfWidth: number;
  halfDepth: number;
  rotationY: number;
  /** Depth at the centre; edges shelve up to zero. */
  depth: number;
};

const bodies = new Map<string, WaterBody>();
const surfaces: Array<{ mesh: THREE.Mesh; body: WaterBody }> = [];

/**
 * Water bodies that belong to authored set pieces rather than page props.
 *
 * These must be registered in the same pre-pass as prop water, because
 * everything placed on a page — stones, twigs, trees, critters — asks the
 * registry whether its spot is wet. A pond created part-way through building
 * a page is invisible to everything placed before it, which is how the
 * clearing ended up with a stone cluster sitting on the pond.
 */
export const AUTHORED_WATER_BODIES: Record<string, WaterBody[]> = {
  '0,0': [{
    id: '0,0:clearing-pond',
    x: -5.2,
    z: 4.7,
    halfWidth: 1.4,
    halfDepth: 0.925,
    rotationY: -0.18,
    depth: SHALLOW_WATER_DEPTH,
  }],
};

export function registerWaterBody(body: WaterBody) {
  bodies.set(body.id, body);
}

export function getWaterBody(id: string): WaterBody | undefined {
  return bodies.get(id);
}

/**
 * Register every water body on a page before anything else is placed.
 *
 * Ordering is the whole point: `isInWater` is only correct for callers that
 * run after this.
 */
export function registerPageWater(
  pageId: string,
  props: Array<{ kind: string; x?: number; z?: number; width?: number; depth?: number; rotY?: number; id?: string }>,
) {
  for (const body of AUTHORED_WATER_BODIES[pageId] ?? []) registerWaterBody(body);

  props.forEach((prop, index) => {
    if (prop.kind !== 'water') return;
    registerWaterBody({
      id: `${pageId}:prop:${prop.id ?? index}`,
      x: prop.x ?? 0,
      z: prop.z ?? 0,
      halfWidth: (prop.width ?? 1) / 2,
      halfDepth: (prop.depth ?? 1) / 2,
      rotationY: prop.rotY ?? 0,
      depth: SHALLOW_WATER_DEPTH,
    });
  });
}

export function clearWaterBodiesForPage(pageId: string) {
  for (const id of [...bodies.keys()]) {
    if (id.startsWith(`${pageId}:`)) bodies.delete(id);
  }
}

/**
 * How submerged a point is, 0 (dry) to 1 (centre of the deepest part).
 *
 * Edges shelve rather than dropping off a cliff, so walking in reads as
 * wading into a creek instead of falling into a box. Uses the same squared
 * falloff as terrain patches so the two agree about what "edge" means.
 */
export function submersionAt(x: number, z: number): number {
  let deepest = 0;
  for (const body of bodies.values()) {
    // Rotate the sample into the body's local space so rotated ponds test
    // correctly rather than against their axis-aligned bounding box.
    const cos = Math.cos(-body.rotationY);
    const sin = Math.sin(-body.rotationY);
    const dx = x - body.x;
    const dz = z - body.z;
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;

    const nx = localX / body.halfWidth;
    const nz = localZ / body.halfDepth;
    const distanceSquared = nx * nx + nz * nz;
    if (distanceSquared >= 1) continue;

    const shelf = Math.cos(Math.sqrt(distanceSquared) * Math.PI * 0.5);
    deepest = Math.max(deepest, shelf * shelf);
  }
  return deepest;
}

/** True when a point is in water at all — cheap early-out for callers. */
export function isInWater(x: number, z: number): boolean {
  return submersionAt(x, z) > 0.02;
}

/** Water depth in world units at a point. */
export function waterDepthAt(x: number, z: number): number {
  return submersionAt(x, z) * SHALLOW_WATER_DEPTH;
}

/**
 * Build the visible surface for a water body.
 *
 * Two stacked sheets: a darker bed that follows the sunk ground, and a
 * translucent surface just above it. Paper water reads as water because you
 * can see the bed through it, not because the blue is a particular shade.
 */
export function buildWaterSurface(body: WaterBody): THREE.Group {
  const group = new THREE.Group();
  const segments = 12;
  const baseY = sampleTerrainHeight(body.x, body.z);

  // Both meshes are built in the group's LOCAL space.
  //
  // An earlier version wrote world coordinates into the bed's vertices and
  // cancelled them with `bed.position.set(-body.x, 0, -body.z)`. That is
  // wrong twice over: the group's rotation also rotates that offset (so the
  // bed landed metres away, over by the house), and any scaling of the group
  // — which the pond's cozy "ripple" reaction does on click — multiplies the
  // offset and throws the bed further still. Local geometry has no offset to
  // corrupt, so the bed stays put under any transform of its parent.
  const cos = Math.cos(body.rotationY);
  const sin = Math.sin(body.rotationY);
  const toWorld = (localX: number, localZ: number) => ({
    x: body.x + localX * cos - localZ * sin,
    z: body.z + localX * sin + localZ * cos,
  });

  const bedGeometry = new THREE.PlaneGeometry(body.halfWidth * 2, body.halfDepth * 2, segments, segments);
  bedGeometry.rotateX(-Math.PI / 2);
  const bedPositions = bedGeometry.attributes.position;
  for (let index = 0; index < bedPositions.count; index += 1) {
    const world = toWorld(bedPositions.getX(index), bedPositions.getZ(index));
    const sink = submersionAt(world.x, world.z) * body.depth;
    // Local Y, relative to the group's own base height.
    bedPositions.setY(index, sampleTerrainHeight(world.x, world.z) - sink + 0.004 - baseY);
  }
  bedGeometry.computeVertexNormals();
  const bed = new THREE.Mesh(bedGeometry, getMaterial('paper.blue.deep'));
  bed.receiveShadow = true;

  const surfaceGeometry = new THREE.PlaneGeometry(body.halfWidth * 2, body.halfDepth * 2, segments, segments);
  surfaceGeometry.rotateX(-Math.PI / 2);
  const surface = new THREE.Mesh(surfaceGeometry, createWaterSurfaceMaterial());
  surface.position.y = 0.02;
  surface.receiveShadow = false;
  surface.renderOrder = RENDER_ORDER.water;

  group.add(bed, surface);
  group.position.set(body.x, baseY, body.z);
  group.rotation.y = body.rotationY;
  group.userData.waterSurface = surface;

  surfaces.push({ mesh: surface, body });
  return group;
}

function createWaterSurfaceMaterial(): THREE.MeshStandardMaterial {
  const material = getMaterial('paper.water') as THREE.MeshStandardMaterial;
  // Clone so the drifting texture offset belongs to this body and does not
  // animate every shared use of the material.
  const clone = material.clone();
  if (clone.map) {
    clone.map = clone.map.clone();
    clone.map.wrapS = THREE.RepeatWrapping;
    clone.map.wrapT = THREE.RepeatWrapping;
    // Only flag an upload once there is something to upload.
    //
    // A cloned texture shares its `source` with the original, so the loader
    // filling in the image later reaches this clone too — nothing is lost by
    // waiting. Setting `needsUpdate` on a texture whose image hasn't arrived
    // yet just makes three.js warn ("Texture marked for update but no image
    // data found") on every water body built before the paper texture loads,
    // which is noise in a console you need to be able to read.
    if (clone.map.image) clone.map.needsUpdate = true;
  }
  clone.transparent = true;
  clone.opacity = 0.72;
  clone.depthWrite = false;
  return clone;
}

/** Drift the surface texture so water is never quite still. */
export function updateWaterSurfaces(elapsed: number) {
  for (const { mesh } of surfaces) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (!material.map) continue;
    material.map.offset.set(
      Math.sin(elapsed * 0.06) * 0.03 + elapsed * 0.008,
      Math.cos(elapsed * 0.048) * 0.025,
    );
  }
}

/**
 * The nearest dry point to (x, z).
 *
 * Used when something that belongs on land is placed on water. The ring
 * search itself lives in core/placement.ts, shared with the solid-obstruction
 * version — both are the same problem: seeded coordinates that knew nothing
 * about what was already there.
 */
export function nudgeOutOfWater(x: number, z: number, maxRadius = 4): { x: number; z: number } {
  return nudgeToFreeSpot(x, z, isInWater, maxRadius);
}

/** Test seam: reset registries between checks. */
export function resetWaterForTests() {
  bodies.clear();
  surfaces.length = 0;
}
