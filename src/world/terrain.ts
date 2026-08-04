import * as THREE from 'three';
import { getPage } from './pages';
import { biomeWeightsAt, fieldElevationAt } from './fields';
import { RENDER_ORDER } from '../render/renderOrder';
import { getGameState, type TerrainEditCellState } from '../sim/state';
import { PAGE_SIZE, pageId, pageOfPosition, type Biome, type PageData, type TerrainPatchData } from './types';

// Terrain height comes from page data, not meshes, so simulation and
// rendering always agree and height stays continuous across page borders.

/** Largest patch radius we ever author/generate. Keeps neighbor lookups bounded. */
const MAX_PATCH_REACH = 7;

function patchesNear(x: number, z: number): TerrainPatchData[] {
  const minPx = Math.round((x - MAX_PATCH_REACH) / PAGE_SIZE);
  const maxPx = Math.round((x + MAX_PATCH_REACH) / PAGE_SIZE);
  const minPz = Math.round((z - MAX_PATCH_REACH) / PAGE_SIZE);
  const maxPz = Math.round((z + MAX_PATCH_REACH) / PAGE_SIZE);
  const patches: TerrainPatchData[] = [];
  for (let px = minPx; px <= maxPx; px += 1) {
    for (let pz = minPz; pz <= maxPz; pz += 1) {
      patches.push(...getPage(px, pz).terrain);
    }
  }
  return patches;
}

export function sampleBaseTerrainHeight(x: number, z: number): number {
  // The world field comes first: broad highlands and lowlands that every
  // page reads the same way, so elevation is continuous across page borders
  // without pages having to agree about anything.
  //
  // Authored and generated patches then sit *on top* of that as local
  // features — a hill on a highland is a hill on a highland, not a hill
  // instead of one.
  let height = fieldElevationAt(x, z);

  for (const patch of patchesNear(x, z)) {
    const dx = (x - patch.x) / patch.radiusX;
    const dz = (z - patch.z) / patch.radiusZ;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared >= 1) continue;

    const influence = Math.cos(Math.sqrt(distanceSquared) * Math.PI * 0.5);
    height += patch.height * influence * influence;
  }

  return height;
}

function terrainEditsNear(x: number, z: number): TerrainEditCellState[] {
  const center = pageOfPosition(x, z);
  const pages = getGameState().world.pages;
  const edits: TerrainEditCellState[] = [];
  for (let px = center.px - 1; px <= center.px + 1; px += 1) {
    for (let pz = center.pz - 1; pz <= center.pz + 1; pz += 1) {
      const page = pages[pageId(px, pz)];
      if (page) edits.push(...Object.values(page.terrainEdits));
    }
  }
  return edits;
}

/**
 * Depth profile of a single scoop, 1 at the centre falling to 0 at the rim.
 *
 * A scoop has a flat-ish floor and a soft rim, not a cone. The old `cos²`
 * curve was so peaked that at the midpoint between two adjacent scoops the
 * ground was only ~9% dug, so a row of digs read as separate dimples with
 * unturned ridges between them rather than one worked bed.
 *
 * Full depth is held out to `PLATEAU` of the radius, then eased to zero with
 * a smoothstep, which is what lets neighbouring scoops merge.
 */
const DIG_PLATEAU = 0.5;

export function digInfluence(distance: number, radius: number): number {
  if (radius <= 0) return 0;
  const t = distance / radius;
  if (t <= DIG_PLATEAU) return 1;
  if (t >= 1) return 0;
  const edge = (t - DIG_PLATEAU) / (1 - DIG_PLATEAU);
  return 1 - (edge * edge * (3 - 2 * edge));
}

/** Effective depth of one edit right now, accounting for planting/mending. */
function currentEditDepth(edit: TerrainEditCellState): number {
  if (edit.state === 'planted') return edit.depth * 0.55;
  if (edit.state === 'mending') {
    const duration = Math.max(1, (edit.mendsAt ?? edit.changedAt) - (edit.plantedAt ?? edit.changedAt));
    const remaining = Math.max(0, Math.min(1, ((edit.mendsAt ?? Date.now()) - Date.now()) / duration));
    return edit.depth * 0.55 * remaining;
  }
  return edit.depth;
}

export function sampleTerrainHeight(x: number, z: number): number {
  const height = sampleBaseTerrainHeight(x, z);

  // Take the DEEPEST overlapping edit rather than summing them.
  //
  // Summing was fine when cells were far enough apart never to touch. Now
  // that the lattice is finer than a scoop's radius — which is what lets digs
  // merge into a continuous bed — adding their contributions would compound
  // every overlap into a chasm, and a tidy row of holes would excavate a
  // trench several times deeper than any single dig.
  //
  // `max` makes overlapping scoops read as one worked patch at the depth of
  // the deepest tool used, which is also the physically sensible answer.
  let deepest = 0;
  for (const edit of terrainEditsNear(x, z)) {
    const distance = Math.hypot(x - edit.x, z - edit.z);
    if (distance >= edit.radius) continue;
    deepest = Math.max(deepest, currentEditDepth(edit) * digInfluence(distance, edit.radius));
  }
  return height - deepest;
}

export function createTerrainPageMesh(page: PageData, material: THREE.Material, segments = 80): THREE.Mesh {
  const overlap = 0.12;
  const size = PAGE_SIZE + overlap;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(page.px * PAGE_SIZE, 0, page.pz * PAGE_SIZE);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    positions.setY(index, sampleTerrainHeight(positions.getX(index), positions.getZ(index)) - 0.04);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.userData.terrainSurface = true;
  mesh.userData.terrainSurfaceOffset = -0.04;
  return mesh;
}

/**
 * A translucent sheet of one biome's ground, faded in by how much that biome
 * claims each vertex.
 *
 * Blending is done with **per-vertex alpha on stacked sheets** rather than by
 * tinting one shared texture, because each biome's ground is a different
 * piece of paper — forest, meadow, and dune grounds are distinct textures,
 * and tinting would throw all that away for a flat colour wash.
 *
 * The torn edge comes free: the biome field is already distorted (see
 * fields.ts), so the alpha ramp follows a ragged boundary rather than a
 * smooth curve. Nothing here knows what shape the tear is.
 */
export function createBiomeOverlayMesh(
  page: PageData,
  biome: Biome,
  material: THREE.Material,
  layer: number,
  segments = 80,
): THREE.Mesh | null {
  const overlap = 0.12;
  const size = PAGE_SIZE + overlap;
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(page.px * PAGE_SIZE, 0, page.pz * PAGE_SIZE);

  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 4);
  // Successive overlays sit a sliver higher so they never z-fight the base.
  const offset = -0.04 + 0.004 * layer;

  let visible = false;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, sampleTerrainHeight(x, z) + offset);

    const weight = biomeWeightsAt(x, z)[biome];
    // Sharpen a little so a biome with a token presence everywhere does not
    // haze the whole page; the tear should read as an edge, not a fog.
    const alpha = Math.max(0, Math.min(1, (weight - 0.12) / 0.55));
    if (alpha > 0.02) visible = true;

    colors[index * 4] = 1;
    colors[index * 4 + 1] = 1;
    colors[index * 4 + 2] = 1;
    colors[index * 4 + 3] = alpha;
  }

  // A page well inside one biome needs no overlay at all. Returning null lets
  // the caller skip the draw call entirely rather than render a fully
  // transparent sheet over every page in the world.
  if (!visible) {
    geometry.dispose();
    return null;
  }

  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  // Below zero: the avatar is transparent and never writes depth, so any
  // positive render order would paint this flat sheet over the player.
  mesh.renderOrder = RENDER_ORDER.biomeOverlay + layer;
  mesh.userData.terrainSurface = true;
  mesh.userData.terrainSurfaceOffset = offset;
  return mesh;
}

/** Material for a biome overlay: the biome's own paper, alpha-blended. */
export function createBiomeOverlayMaterial(source: THREE.Material): THREE.MeshStandardMaterial {
  const material = (source as THREE.MeshStandardMaterial).clone();
  material.transparent = true;
  material.vertexColors = true;
  material.depthWrite = false;
  return material;
}

export function refreshTerrainSurfaceMeshes(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.userData.terrainSurface) return;
    const positions = object.geometry.attributes.position;
    const offset = Number(object.userData.terrainSurfaceOffset ?? 0);
    for (let index = 0; index < positions.count; index += 1) {
      positions.setY(index, sampleTerrainHeight(positions.getX(index), positions.getZ(index)) + offset);
    }
    positions.needsUpdate = true;
    object.geometry.computeVertexNormals();
    object.geometry.computeBoundingSphere();
  });
}

/**
 * Per-cell rim wobble, so a dug patch is a torn paper hole rather than a
 * stamped circle.
 *
 * Driven by the edit's stored `geologySeed`, so the same hole has the same
 * outline every time it is rebuilt — across page streaming, a reload, and
 * eventually across multiplayer clients. A random wobble would make the same
 * hole a different shape on every client and reshuffle on every page load.
 */
function rimRadiusAt(edit: TerrainEditCellState, angle: number): number {
  const seed = (edit.geologySeed >>> 0) % 1000 / 1000;
  const phase = seed * Math.PI * 2;
  // Three offset harmonics: a lopsided overall shape plus finer tears.
  const wobble = Math.sin(angle * 2 + phase) * 0.09
    + Math.sin(angle * 3 - phase * 1.7) * 0.06
    + Math.sin(angle * 5 + phase * 0.6) * 0.035;
  return edit.radius * (0.94 + wobble);
}

export function createDugCellMesh(edit: TerrainEditCellState, material: THREE.Material): THREE.Mesh {
  const segments = 28;
  // Dug patches now deliberately overlap, which puts several of these discs
  // at the same height over the same ground. Without a per-cell offset they
  // z-fight and the whole bed shimmers. A deterministic sliver of height
  // derived from the cell's own seed keeps a stable draw order, and stays
  // consistent across reloads and clients.
  const lift = 0.012 + ((edit.geologySeed >>> 0) % 32) * 0.0004;
  const positions: number[] = [edit.x, sampleTerrainHeight(edit.x, edit.z) + lift, edit.z];
  const uvs: number[] = [0.5, 0.5];
  const indices: number[] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const radius = rimRadiusAt(edit, angle);
    const x = edit.x + Math.cos(angle) * radius;
    const z = edit.z + Math.sin(angle) * radius;
    positions.push(x, sampleTerrainHeight(x, z) + lift + 0.002, z);
    uvs.push(0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5);
  }
  for (let index = 0; index < segments; index += 1) {
    indices.push(0, 1 + index, 1 + ((index + 1) % segments));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}

/** Sculpted hill mesh that follows the sampled terrain height field. */
export function createTerrainPatchMesh(
  patch: TerrainPatchData,
  material: THREE.Material,
  radialSegments: number,
  ringSegments: number,
  textureRepeat: THREE.Vector2,
): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  positions.push(patch.x, sampleTerrainHeight(patch.x, patch.z) + 0.012, patch.z);
  uvs.push(0.5 * textureRepeat.x, 0.5 * textureRepeat.y);

  for (let ring = 1; ring <= ringSegments; ring += 1) {
    const radius = ring / ringSegments;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      const localX = Math.cos(angle) * patch.radiusX * radius;
      const localZ = Math.sin(angle) * patch.radiusZ * radius;
      const worldX = patch.x + localX;
      const worldZ = patch.z + localZ;
      positions.push(worldX, sampleTerrainHeight(worldX, worldZ) + 0.012, worldZ);
      uvs.push(
        (0.5 + Math.cos(angle) * radius * 0.5) * textureRepeat.x,
        (0.5 + Math.sin(angle) * radius * 0.5) * textureRepeat.y,
      );
    }
  }

  for (let segment = 0; segment < radialSegments; segment += 1) {
    const nextSegment = (segment + 1) % radialSegments;
    indices.push(0, 1 + segment, 1 + nextSegment);
  }

  for (let ring = 2; ring <= ringSegments; ring += 1) {
    const currentStart = 1 + (ring - 1) * radialSegments;
    const previousStart = 1 + (ring - 2) * radialSegments;
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const nextSegment = (segment + 1) % radialSegments;
      const a = previousStart + segment;
      const b = previousStart + nextSegment;
      const c = currentStart + segment;
      const d = currentStart + nextSegment;
      indices.push(a, c, b, b, c, d);
    }
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.terrainSurface = true;
  mesh.userData.terrainSurfaceOffset = 0.012;
  return mesh;
}

/** Flat strip that drapes over the terrain height field. */
export function createTerrainRibbon(
  center: THREE.Vector2,
  width: number,
  depth: number,
  material: THREE.Material,
  rotationY: number,
): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(width, depth, 18, 8);
  const positions = geometry.attributes.position;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);

  for (let index = 0; index < positions.count; index += 1) {
    const localX = positions.getX(index);
    const localZ = positions.getY(index);
    const worldX = center.x + localX * cos - localZ * sin;
    const worldZ = center.y + localX * sin + localZ * cos;
    positions.setXYZ(index, worldX, sampleTerrainHeight(worldX, worldZ) + 0.035, worldZ);
  }

  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
