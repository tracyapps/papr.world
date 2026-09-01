import * as THREE from 'three';
import { getMaterial } from '../render/materials';
import { createRng } from '../core/math';
import { nudgeToFreeSpot } from '../core/placement';
import { createCutout, createSheet, getCutoutMaterial, groundedCutoutY } from '../render/builders';
import { RENDER_ORDER } from '../render/renderOrder';
import { sampleTerrainHeight } from './terrain';
import type { PropData, WaterBankStyle, WaterCrossingData } from './types';

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

/** The bridge deck always clears the highest sampled bank beneath it. */
const BRIDGE_DECK_CLEARANCE = 0.1;
/** A visible paper-craft arch without turning the crossing into a steep ramp. */
const BRIDGE_ARC_HEIGHT = 0.58;

export type PoolWaterBody = {
  kind?: 'pool';
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

export type ChannelWaterBody = {
  kind: 'channel';
  id: string;
  points: Array<[number, number]>;
  /** Full width and centre depth at each point. */
  widths: number[];
  depths: number[];
  flowSpeed: number;
  bankStyle: WaterBankStyle;
  seed: number;
  crossing?: WaterCrossingData;
};

export type WaterBody = PoolWaterBody | ChannelWaterBody;

const bodies = new Map<string, WaterBody>();
const surfaces: Array<{ mesh: THREE.Mesh; flowSpeed: number; phase: number; channel: boolean }> = [];
let bridgeBaseHeights = new WeakMap<WaterCrossingData, number>();

/**
 * Water bodies that belong to authored set pieces rather than page props.
 *
 * These must be registered in the same pre-pass as prop water, because
 * everything placed on a page — stones, twigs, trees, critters — asks the
 * registry whether its spot is wet. A pond created part-way through building
 * a page is invisible to everything placed before it, which is how the
 * clearing ended up with a stone cluster sitting on the pond.
 */
export const AUTHORED_WATER_BODIES: Record<string, PoolWaterBody[]> = {
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
  props: ReadonlyArray<PropData | {
    kind: string;
    id?: string;
    x?: number;
    z?: number;
    width?: number;
    depth?: number;
    rotY?: number;
    points?: Array<[number, number]>;
    widths?: number[];
    depths?: number[];
    flowSpeed?: number;
    bankStyle?: WaterBankStyle;
    seed?: number;
    crossing?: WaterCrossingData;
  }>,
) {
  for (const body of AUTHORED_WATER_BODIES[pageId] ?? []) registerWaterBody(body);

  props.forEach((prop, index) => {
    if (prop.kind === 'water') {
      registerWaterBody({
        id: `${pageId}:prop:${prop.id ?? index}`,
        x: prop.x ?? 0,
        z: prop.z ?? 0,
        halfWidth: (prop.width ?? 1) / 2,
        halfDepth: (prop.depth ?? 1) / 2,
        rotationY: prop.rotY ?? 0,
        depth: SHALLOW_WATER_DEPTH,
      });
    } else if (prop.kind === 'waterChannel') {
      registerWaterBody({
        kind: 'channel',
        id: `${pageId}:prop:${prop.id ?? index}`,
        points: prop.points ?? [],
        widths: prop.widths ?? [],
        depths: prop.depths ?? [],
        flowSpeed: prop.flowSpeed ?? 0.04,
        bankStyle: prop.bankStyle ?? 'woodland',
        seed: prop.seed ?? index,
        crossing: prop.crossing,
      });
    }
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
type WaterSample = { submersion: number; depth: number };

function poolSampleAt(body: PoolWaterBody, x: number, z: number): WaterSample {
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
    if (distanceSquared >= 1) return { submersion: 0, depth: 0 };

    const shelf = Math.cos(Math.sqrt(distanceSquared) * Math.PI * 0.5);
    const submersion = shelf * shelf;
    return { submersion, depth: submersion * body.depth };
}

function channelSampleAt(body: ChannelWaterBody, x: number, z: number): WaterSample {
  let best: WaterSample = { submersion: 0, depth: 0 };
  for (let index = 0; index < body.points.length - 1; index += 1) {
    const [ax, az] = body.points[index];
    const [bx, bz] = body.points[index + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    if (lengthSquared <= 0.0001) continue;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / lengthSquared, 0, 1);
    const nearestX = ax + dx * t;
    const nearestZ = az + dz * t;
    const width = THREE.MathUtils.lerp(body.widths[index] ?? 1, body.widths[index + 1] ?? 1, t);
    const distance = Math.hypot(x - nearestX, z - nearestZ);
    const normalized = distance / Math.max(0.01, width / 2);
    if (normalized >= 1) continue;
    const shelf = Math.cos(normalized * Math.PI * 0.5);
    const submersion = shelf * shelf;
    const centerDepth = THREE.MathUtils.lerp(body.depths[index] ?? SHALLOW_WATER_DEPTH, body.depths[index + 1] ?? SHALLOW_WATER_DEPTH, t);
    const depth = centerDepth * submersion;
    if (depth > best.depth) best = { submersion, depth };
  }
  return best;
}

function sampleBodyAt(body: WaterBody, x: number, z: number): WaterSample {
  return body.kind === 'channel' ? channelSampleAt(body, x, z) : poolSampleAt(body, x, z);
}

function waterSampleAt(x: number, z: number): WaterSample {
  let best: WaterSample = { submersion: 0, depth: 0 };
  for (const body of bodies.values()) {
    const sample = sampleBodyAt(body, x, z);
    if (sample.depth > best.depth || (best.depth === 0 && sample.submersion > best.submersion)) best = sample;
  }
  return best;
}

export function submersionAt(x: number, z: number): number {
  return waterSampleAt(x, z).submersion;
}

/** True when a point is in water at all — cheap early-out for callers. */
export function isInWater(x: number, z: number): boolean {
  return submersionAt(x, z) > 0.02;
}

/** Water depth in world units at a point. */
export function waterDepthAt(x: number, z: number): number {
  if (isWaterCrossingAt(x, z)) return 0;
  return waterSampleAt(x, z).depth;
}

function crossingLocalPoint(crossing: WaterCrossingData, x: number, z: number) {
  // THREE's positive Y rotation sends local +X toward world -Z. Projecting
  // onto those rotated axes keeps the walkable footprint exactly aligned
  // with the rendered bridge, including on a river bend.
  const cos = Math.cos(crossing.rotationY);
  const sin = Math.sin(crossing.rotationY);
  const dx = x - crossing.x;
  const dz = z - crossing.z;
  return {
    localX: dx * cos - dz * sin,
    localZ: dx * sin + dz * cos,
  };
}

function crossingWorldPoint(crossing: WaterCrossingData, localX: number, localZ = 0) {
  const cos = Math.cos(crossing.rotationY);
  const sin = Math.sin(crossing.rotationY);
  return {
    x: crossing.x + localX * cos + localZ * sin,
    z: crossing.z - localX * sin + localZ * cos,
  };
}

function pointInCrossing(crossing: WaterCrossingData, x: number, z: number, margin = 0): boolean {
  const { localX, localZ } = crossingLocalPoint(crossing, x, z);
  return Math.abs(localX) <= crossing.length / 2 + margin
    && Math.abs(localZ) <= crossing.width / 2 + margin;
}

function bridgeBaseHeight(crossing: WaterCrossingData): number {
  const cached = bridgeBaseHeights.get(crossing);
  if (cached !== undefined) return cached;
  const halfLength = crossing.length / 2;
  // Sample the whole span, not only the centre and ends. A rolling terrain
  // field can crest a little off-centre; missing that crest is exactly how a
  // visually arched bridge can still clip into an uneven water surface.
  const samples = Array.from({ length: 9 }, (_, index) => {
    const localX = THREE.MathUtils.lerp(-halfLength, halfLength, index / 8);
    const point = crossingWorldPoint(crossing, localX);
    return sampleTerrainHeight(point.x, point.z);
  });
  const height = Math.max(...samples) + BRIDGE_DECK_CLEARANCE;
  bridgeBaseHeights.set(crossing, height);
  return height;
}

function bridgeArcAt(crossing: WaterCrossingData, localX: number): number {
  const normalized = THREE.MathUtils.clamp(localX / (crossing.length / 2), -1, 1);
  // A parabola gives a smooth crown and returns exactly to the bank height at
  // either end. The base is already above the highest bank/water sample, so
  // uneven terrain can never pull the middle of the bridge below the water.
  return BRIDGE_ARC_HEIGHT * (1 - normalized * normalized);
}

export function isWaterCrossingAt(x: number, z: number, margin = 0): boolean {
  for (const body of bodies.values()) {
    if (body.kind === 'channel' && body.crossing && pointInCrossing(body.crossing, x, z, margin)) return true;
  }
  return false;
}

/**
 * Top surface of the bridge beneath a world point, or null off a bridge.
 *
 * This is the shared platform-height query for players and land critters.
 * Rendering and locomotion therefore use the same arch instead of letting a
 * character visually sink toward the water while its X/Z remain traversable.
 */
export function bridgeDeckHeightAt(x: number, z: number): number | null {
  let deckHeight: number | null = null;
  for (const body of bodies.values()) {
    if (body.kind !== 'channel' || !body.crossing || !pointInCrossing(body.crossing, x, z)) continue;
    const { localX } = crossingLocalPoint(body.crossing, x, z);
    const height = bridgeBaseHeight(body.crossing) + bridgeArcAt(body.crossing, localX) + 0.018;
    deckHeight = deckHeight === null ? height : Math.max(deckHeight, height);
  }
  return deckHeight;
}

/** Land critters treat only genuinely deep reaches as obstacles. */
export function isDeepWater(x: number, z: number): boolean {
  return !isWaterCrossingAt(x, z, 0.08) && waterSampleAt(x, z).depth >= 0.46;
}

/**
 * Build the visible surface for a water body.
 *
 * Two stacked sheets: a darker bed that follows the sunk ground, and a
 * translucent surface just above it. Paper water reads as water because you
 * can see the bed through it, not because the blue is a particular shade.
 */
export function buildWaterSurface(body: WaterBody): THREE.Group {
  return body.kind === 'channel' ? buildChannelSurface(body) : buildPoolSurface(body);
}

function buildPoolSurface(body: PoolWaterBody): THREE.Group {
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

  surfaces.push({ mesh: surface, flowSpeed: 0.008, phase: body.x * 0.13 + body.z * 0.07, channel: false });
  return group;
}

function channelTangent(body: ChannelWaterBody, index: number): { x: number; z: number } {
  const before = body.points[Math.max(0, index - 1)];
  const after = body.points[Math.min(body.points.length - 1, index + 1)];
  const dx = after[0] - before[0];
  const dz = after[1] - before[1];
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
}

function createChannelGeometry(
  body: ChannelWaterBody,
  widthPadding: number,
  bed: boolean,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let distance = 0;

  for (let index = 0; index < body.points.length; index += 1) {
    if (index > 0) {
      distance += Math.hypot(
        body.points[index][0] - body.points[index - 1][0],
        body.points[index][1] - body.points[index - 1][1],
      );
    }
    const [x, z] = body.points[index];
    const tangent = channelTangent(body, index);
    const normalX = -tangent.z;
    const normalZ = tangent.x;
    const halfWidth = (body.widths[index] ?? 1) / 2 + widthPadding;
    const lanes = bed ? [-1, 0, 1] : [-1, 1];
    for (const lane of lanes) {
      const px = x + normalX * halfWidth * lane;
      const pz = z + normalZ * halfWidth * lane;
      const centreDepth = body.depths[index] ?? SHALLOW_WATER_DEPTH;
      const sink = bed ? centreDepth * (1 - Math.abs(lane)) : 0;
      positions.push(px, sampleTerrainHeight(px, pz) - sink + (bed ? 0.006 : 0.022), pz);
      uvs.push((lane + 1) / 2, distance / 4);
    }
  }

  const columns = bed ? 3 : 2;
  for (let index = 0; index < body.points.length - 1; index += 1) {
    for (let lane = 0; lane < columns - 1; lane += 1) {
      const a = index * columns + lane;
      const b = a + 1;
      const c = a + columns;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function bankMaterial(style: WaterBankStyle) {
  if (style === 'sand') return getMaterial('ground.dunes');
  if (style === 'rock') return getMaterial('paper.grey');
  if (style === 'marsh') return getMaterial('ground.meadow');
  return getMaterial('ground.forest');
}

const CATTAILS = [
  [637.08, 602], [488.03, 602], [637.08, 602], [390.63, 602],
] as const;
const WATER_LILIES = [[978.2, 592.43], [912.12, 456.44], [912.12, 456.44]] as const;
const DRIFTWOOD = [[907.12, 627.84], [940.14, 442.56], [886.85, 585.89]] as const;
const MARSH_GRASS = [
  [701, 605], [701, 605], [701, 605], [701, 605],
] as const;

function flatWaterProp(url: string, aspectRatio: number, width: number): THREE.Mesh {
  const entry = getCutoutMaterial(url);
  const geometry = new THREE.PlaneGeometry(width, width / aspectRatio);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, entry.material);
  mesh.customDepthMaterial = entry.depthMaterial;
  mesh.renderOrder = RENDER_ORDER.ripple;
  return mesh;
}

function buildBridge(crossing: WaterCrossingData): THREE.Group {
  const bridge = new THREE.Group();
  bridge.name = 'waterway-bridge';
  bridge.position.set(crossing.x, bridgeBaseHeight(crossing), crossing.z);
  bridge.rotation.y = crossing.rotationY;
  const plankCount = Math.max(5, Math.ceil(crossing.length / 0.62));
  const plankLength = crossing.length / plankCount;
  for (let index = 0; index < plankCount; index += 1) {
    const localX = (-crossing.length / 2) + (index + 0.5) * plankLength;
    const before = bridgeArcAt(crossing, localX - plankLength / 2);
    const after = bridgeArcAt(crossing, localX + plankLength / 2);
    const plank = createSheet(
      plankLength * 0.92,
      crossing.width,
      getMaterial(index % 3 === 0 ? 'paper.brown.warm' : 'paper.brown'),
      [localX, bridgeArcAt(crossing, localX) + (index % 2) * 0.006, 0],
    );
    plank.rotation.z = Math.atan2(after - before, plankLength);
    bridge.add(plank);
  }
  return bridge;
}

function buildChannelDetails(body: ChannelWaterBody): THREE.Group {
  const details = new THREE.Group();
  const rng = createRng(body.seed);

  // A slightly wider paper ribbon peeks out beyond the water as its bank.
  const bank = new THREE.Mesh(createChannelGeometry(body, 0.75, false), bankMaterial(body.bankStyle));
  bank.position.y = -0.012;
  bank.receiveShadow = true;
  details.add(bank);

  for (let index = 2; index < body.points.length - 2; index += 3) {
    const [x, z] = body.points[index];
    const tangent = channelTangent(body, index);
    const normalX = -tangent.z;
    const normalZ = tangent.x;
    const width = body.widths[index] ?? 2;
    const side = index % 2 === 0 ? -1 : 1;
    const bankX = x + normalX * (width / 2 + 0.28) * side;
    const bankZ = z + normalZ * (width / 2 + 0.28) * side;
    // Keep the deliberately messy natural bank from growing through the one
    // deliberately tidy human-made crossing.
    if (
      body.crossing
      && (
        pointInCrossing(body.crossing, bankX, bankZ, 0.8)
        || Math.hypot(bankX - body.crossing.x, bankZ - body.crossing.z) < body.crossing.length / 2 + 1
      )
    ) continue;

    if (body.bankStyle === 'marsh' || (body.bankStyle === 'woodland' && index % 2 === 0)) {
      // Marsh banks mix in loose grass tufts alongside cattail clusters for
      // visual variety; woodland banks (which borrow this same roll every
      // other point) keep the original cattail-only look.
      const placeGrassOrCattail = (px: number, pz: number) => {
        const useMarshGrass = body.bankStyle === 'marsh' && rng() < 0.45;
        const variants = useMarshGrass ? MARSH_GRASS : CATTAILS;
        const variant = Math.floor(rng() * variants.length);
        const [artWidth, artHeight] = variants[variant];
        const height = 0.85 + rng() * 0.55;
        details.add(createCutout({
          textureUrl: useMarshGrass
            ? `/assets/runtime/props/marsh-grass-tuft-0${variant + 1}.png`
            : `/assets/runtime/props/cattail-cluster-0${variant + 1}.png`,
          aspectRatio: artWidth / artHeight,
          height,
          position: [px, groundedCutoutY(sampleTerrainHeight(px, pz), height), pz],
          rotationY: rng() * Math.PI,
        }));
      };

      placeGrassOrCattail(bankX, bankZ);

      // These banks read too sparse at one tuft per sampled point. Rather
      // than shortening the sample step (which would also thicken the rock
      // and lily/driftwood scatter below, since they share this same loop),
      // add a second tuft on the *opposite* bank at this same point along
      // the channel — doubling marsh/cattail density on its own.
      const oppositeSide = -side;
      const oppositeBankX = x + normalX * (width / 2 + 0.28) * oppositeSide;
      const oppositeBankZ = z + normalZ * (width / 2 + 0.28) * oppositeSide;
      if (
        !body.crossing
        || (
          !pointInCrossing(body.crossing, oppositeBankX, oppositeBankZ, 0.8)
          && Math.hypot(oppositeBankX - body.crossing.x, oppositeBankZ - body.crossing.z) >= body.crossing.length / 2 + 1
        )
      ) {
        placeGrassOrCattail(oppositeBankX, oppositeBankZ);
      }
    }

    if (body.bankStyle === 'rock' || (body.bankStyle === 'sand' && index % 4 === 0)) {
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.18 + rng() * 0.22, 0),
        getMaterial(index % 2 === 0 ? 'underground.basalt' : 'underground.slate'),
      );
      rock.scale.set(1.25, 0.6, 0.9);
      rock.position.set(bankX, sampleTerrainHeight(bankX, bankZ) + 0.12, bankZ);
      rock.rotation.set(rng(), rng() * Math.PI, rng());
      rock.castShadow = true;
      details.add(rock);
    }

    // Calm reaches collect lilies; woody banks occasionally catch driftwood.
    if (body.flowSpeed < 0.055 && index % 5 === 0) {
      const variant = Math.floor(rng() * WATER_LILIES.length);
      const [artWidth, artHeight] = WATER_LILIES[variant];
      const lily = flatWaterProp(`/assets/runtime/props/water-lily-0${variant + 1}.png`, artWidth / artHeight, 1 + rng() * 0.55);
      lily.position.set(x - normalX * width * 0.18, sampleTerrainHeight(x, z) + 0.035, z - normalZ * width * 0.18);
      lily.rotation.y = rng() * Math.PI * 2;
      details.add(lily);
    } else if (body.bankStyle === 'woodland' && index % 5 === 0) {
      const variant = Math.floor(rng() * DRIFTWOOD.length);
      const [artWidth, artHeight] = DRIFTWOOD[variant];
      const wood = flatWaterProp(`/assets/runtime/props/driftwood-0${variant + 1}.png`, artWidth / artHeight, 1.3 + rng() * 0.6);
      wood.position.set(bankX, sampleTerrainHeight(bankX, bankZ) + 0.04, bankZ);
      wood.rotation.y = Math.atan2(tangent.x, tangent.z) + (rng() - 0.5) * 0.45;
      details.add(wood);
    }
  }

  if (body.crossing) details.add(buildBridge(body.crossing));
  return details;
}

function buildCurrentAccents(body: ChannelWaterBody): THREE.Group {
  const accents = new THREE.Group();
  if (body.flowSpeed < 0.052) return accents;
  const material = new THREE.MeshBasicMaterial({
    color: '#f6fbfb', depthWrite: false, opacity: 0.48, transparent: true, side: THREE.DoubleSide,
  });
  for (let index = 2; index < body.points.length - 1; index += 3) {
    const [x, z] = body.points[index];
    const tangent = channelTangent(body, index);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.9), material);
    strip.rotation.x = -Math.PI / 2;
    strip.rotation.z = Math.atan2(tangent.z, tangent.x) - Math.PI / 2;
    strip.position.set(x, sampleTerrainHeight(x, z) + 0.032, z);
    strip.renderOrder = RENDER_ORDER.ripple;
    accents.add(strip);
  }
  return accents;
}

function buildChannelSurface(body: ChannelWaterBody): THREE.Group {
  const group = new THREE.Group();
  group.name = `water-channel:${body.id}`;
  const details = buildChannelDetails(body);
  const bed = new THREE.Mesh(createChannelGeometry(body, 0, true), getMaterial('paper.blue.deep'));
  bed.receiveShadow = true;
  const surface = new THREE.Mesh(createChannelGeometry(body, 0, false), createWaterSurfaceMaterial());
  surface.receiveShadow = false;
  surface.renderOrder = RENDER_ORDER.water;
  group.add(details, bed, surface, buildCurrentAccents(body));
  group.userData.waterSurface = surface;
  surfaces.push({ mesh: surface, flowSpeed: body.flowSpeed, phase: body.seed * 0.0001, channel: true });
  return group;
}

function createWaterSurfaceMaterial(): THREE.MeshStandardMaterial {
  const material = getMaterial('paper.water') as THREE.MeshStandardMaterial;
  // Clone so the drifting texture offset belongs to this body and does not
  // animate every shared use of the material.
  const clone = material.clone();
  if (clone.map) {
    // Do not hand an unloaded clone to WebGL. Streamed pages can build before
    // TextureLoader has image data, and the renderer warns once per body when
    // asked to upload that empty clone. Keep the source aside; the frame
    // update installs a private map as soon as its image is ready.
    clone.userData.waterSourceMap = clone.map;
    clone.map = null;
  }
  clone.transparent = true;
  clone.opacity = 0.72;
  clone.depthWrite = false;
  return clone;
}

function ensureWaterSurfaceMap(material: THREE.MeshStandardMaterial): THREE.Texture | null {
  if (material.map) return material.map;
  const source = material.userData.waterSourceMap as THREE.Texture | undefined;
  if (!source?.image) return null;
  const image = source.image as { complete?: boolean; naturalWidth?: number; width?: number };
  if (image.complete === false || (image.naturalWidth === 0 && image.width === 0)) return null;
  const map = source.clone();
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  material.map = map;
  material.needsUpdate = true;
  return map;
}

/** Drift the surface texture so water is never quite still. */
export function updateWaterSurfaces(elapsed: number) {
  for (const { mesh, flowSpeed, phase, channel } of surfaces) {
    const material = mesh.material as THREE.MeshStandardMaterial;
    const map = ensureWaterSurfaceMap(material);
    if (!map) continue;
    if (channel) {
      // Channel UVs follow the polyline, so moving V reads as current even
      // around bends instead of sliding one flat texture across the world.
      map.offset.set(Math.sin(elapsed * 0.17 + phase) * 0.018, elapsed * flowSpeed + phase);
    } else {
      map.offset.set(
        Math.sin(elapsed * 0.06 + phase) * 0.03 + elapsed * flowSpeed,
        Math.cos(elapsed * 0.048 + phase) * 0.025,
      );
    }
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
  bridgeBaseHeights = new WeakMap<WaterCrossingData, number>();
}
