import * as THREE from 'three';
import { createRng } from '../core/math';
import { shadowed } from '../render/builders';
import { createColorMaterial, getResourceSurfaceMaterial } from '../render/materials';
import type {
  TrinketDef,
  TrinketMotionId,
  TrinketPartId,
  TrinketShapeId,
} from '../sim/catalogs/trinkets';

/*
 * Trinket rigs.
 *
 * A trinket is a small collectible — roughly the size of a loose stone — and
 * its whole job is to be *looked at*. It is never a resource and never a tool,
 * so the rules here are different from a piece of furniture: the silhouette
 * has to read instantly at a glance, at a size where a fold of paper is a
 * couple of pixels, and the wind-up toys have to *look* wound up even in a
 * still frame.
 *
 * Every rig is assembled from three.js primitives and flat paper-coloured
 * materials — no imported model files, exactly like `critterRigs.ts` and
 * `professorRig.ts`. The conventions this file follows:
 *
 * - **One builder per `TrinketShapeId`**, wired through `SHAPE_BUILDERS`, so an
 *   unknown shape falls back to a pebble rather than throwing. (A couple of
 *   authored defs cast `'cylinder'` into the shape union; `EXTRA_SHAPE_BUILDERS`
 *   covers those without weakening the record's exhaustiveness.)
 * - **Build at natural size, then scale by `def.scale`.** Each object is
 *   modelled ~0.16–0.24 units tall with its base sitting on local y=0, so the
 *   caller can drop the group straight onto the terrain.
 * - **All motion lives on an inner pivot** so the returned group's own
 *   transform — the world placement the caller owns — is never touched.
 *   `animateTrinketRig` resets the pivot every frame, so motions never drift.
 * - **Deterministic.** `createRng` seeded from `seed` mixed with `def.id`;
 *   no `Math.random`, so a save that points at a trinket always looks the same.
 * - **Named handles.** Parts get `mesh.name` tags (`trinket-eyes`,
 *   `trinket-key`, ...) and the rig stashes typed handles in `group.userData`
 *   so later code can pose or query it without walking the tree.
 */

const INK = createColorMaterial('#241d18', 0.72);
const GLINT = createColorMaterial('#fffdf6', 0.5);
const KEY_METAL = createColorMaterial('#c2a45a', 0.5);
const STEM_WOOD = createColorMaterial('#6b4a2c', 0.92);

/** Local FNV-1a, matching the engine's other stable selections. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/*
 * The body material. Textured trinkets wear their compiled resource tile the
 * way `resourceDropVisual.ts` does, tinted partway toward the palette base so
 * the artwork still reads through the colour. Non-textured trinkets are plain
 * paper. Tinted variants are cached by url+colour so a bag of thirty of these
 * is still a handful of materials.
 */
const tintedCache = new Map<string, THREE.MeshStandardMaterial>();

function bodyMaterial(def: TrinketDef): THREE.MeshStandardMaterial {
  if (def.textureUrl) {
    const key = `${def.textureUrl}|${def.palette.base}`;
    let material = tintedCache.get(key);
    if (!material) {
      material = getResourceSurfaceMaterial(def.textureUrl, [1, 1]).clone();
      material.color.copy(
        new THREE.Color(def.palette.base).lerp(new THREE.Color('#ffffff'), 0.32),
      );
      tintedCache.set(key, material);
    }
    return material;
  }
  return createColorMaterial(def.palette.base, 0.9);
}

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

function sphereMesh(radius: number, material: THREE.Material, w = 16, h = 12): THREE.Mesh {
  return shadowed(new THREE.Mesh(new THREE.SphereGeometry(radius, w, h), material));
}

function ellipsoid(
  rx: number,
  ry: number,
  rz: number,
  material: THREE.Material,
  w = 18,
  h = 14,
): THREE.Mesh {
  const mesh = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, w, h), material));
  mesh.scale.set(rx, ry, rz);
  return mesh;
}

function boxMesh(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
  return shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material));
}

function cylinderMesh(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  material: THREE.Material,
  segments = 12,
): THREE.Mesh {
  return shadowed(new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  ));
}

function coneMesh(radius: number, height: number, material: THREE.Material, segments = 12): THREE.Mesh {
  return shadowed(new THREE.Mesh(new THREE.ConeGeometry(radius, height, segments), material));
}

function torusMesh(
  radius: number,
  tube: number,
  material: THREE.Material,
  radialSegments = 8,
  tubularSegments = 20,
): THREE.Mesh {
  return shadowed(new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments),
    material,
  ));
}

function latheMesh(points: Array<[number, number]>, material: THREE.Material, segments = 20): THREE.Mesh {
  const profile = points.map(([x, y]) => new THREE.Vector2(x, y));
  return shadowed(new THREE.Mesh(new THREE.LatheGeometry(profile, segments), material));
}

// ---------------------------------------------------------------------------
// Rig context
// ---------------------------------------------------------------------------

/** Rough bounds a builder reports so shape-agnostic decor knows where to sit. */
type RigFrame = { top: number; radius: number; centerY: number };

type WingHandle = { object: THREE.Object3D; base: number; sign: number };
type TailHandle = { object: THREE.Object3D; base: number };

type RigContext = {
  def: TrinketDef;
  rng: () => number;
  pivot: THREE.Group;
  base: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  detail: THREE.MeshStandardMaterial;
  parts: Set<TrinketPartId>;
  /** Parts a shape builder handles itself, so generic decor skips them. */
  consumed: Set<TrinketPartId>;
  frame: RigFrame;
  eyes: THREE.Object3D[];
  animated: {
    key: THREE.Object3D | null;
    wings: WingHandle[];
    tail: TailHandle | null;
    head: THREE.Object3D | null;
  };
};

/** Everything `animateTrinketRig` needs, stashed on the group's userData. */
type TrinketRigUserData = {
  pivot: THREE.Group;
  restY: number;
  phase: number;
  speed: number;
  keySpin: number;
  key: THREE.Object3D | null;
  wings: WingHandle[];
  tail: TailHandle | null;
  head: THREE.Object3D | null;
  eyes: THREE.Object3D[];
};

type ShapeBuilder = (ctx: RigContext) => void;

// ---------------------------------------------------------------------------
// Decor parts shared across every shape
// ---------------------------------------------------------------------------

function addSpots(ctx: RigContext): void {
  const group = new THREE.Group();
  group.name = 'trinket-spots';
  const { rng, frame } = ctx;
  const count = 4 + Math.floor(rng() * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + rng() * 0.5;
    const spot = shadowed(new THREE.Mesh(
      new THREE.SphereGeometry(frame.radius * 0.22, 8, 6),
      ctx.detail,
    ));
    spot.position.set(
      Math.cos(angle) * frame.radius * 0.92,
      Math.max(0.012, frame.centerY + (rng() - 0.5) * frame.radius * 1.1),
      Math.sin(angle) * frame.radius * 0.92,
    );
    spot.scale.set(1, 1, 0.55);
    group.add(spot);
  }
  ctx.pivot.add(group);
}

function addStripes(ctx: RigContext): void {
  const group = new THREE.Group();
  group.name = 'trinket-stripes';
  const { rng, frame } = ctx;
  const count = 2 + Math.floor(rng() * 2);
  for (let index = 0; index < count; index += 1) {
    const ring = torusMesh(frame.radius * 0.92, frame.radius * 0.1, ctx.accent, 6, 16);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = Math.max(0.02, frame.centerY - frame.radius * 0.5 + index * frame.radius * 0.5);
    ring.scale.z = 0.7;
    group.add(ring);
  }
  ctx.pivot.add(group);
}

function addGlitter(ctx: RigContext): void {
  const group = new THREE.Group();
  group.name = 'trinket-glitter';
  const { rng, frame } = ctx;
  const count = 3 + Math.floor(rng() * 3);
  for (let index = 0; index < count; index += 1) {
    const fleck = shadowed(new THREE.Mesh(
      new THREE.OctahedronGeometry(frame.radius * 0.12, 0),
      GLINT,
    ));
    const angle = rng() * Math.PI * 2;
    fleck.position.set(
      Math.cos(angle) * frame.radius * (0.7 + rng() * 0.5),
      Math.max(0.02, frame.centerY + (rng() - 0.3) * frame.radius),
      Math.sin(angle) * frame.radius * (0.7 + rng() * 0.5),
    );
    fleck.rotation.set(rng() * Math.PI, rng() * Math.PI, 0);
    group.add(fleck);
  }
  ctx.pivot.add(group);
}

function addHat(ctx: RigContext): void {
  const group = new THREE.Group();
  group.name = 'trinket-hat';
  const radius = ctx.frame.radius;
  const brim = cylinderMesh(radius * 1.15, radius * 1.15, 0.012, ctx.accent, 12);
  brim.position.y = ctx.frame.top - 0.004;
  const crown = coneMesh(radius * 0.82, radius * 1.3, ctx.base, 10);
  crown.position.y = ctx.frame.top + radius * 0.55;
  group.add(brim, crown);
  ctx.pivot.add(group);
}

function addStem(ctx: RigContext): void {
  const group = new THREE.Group();
  group.name = 'trinket-stem';
  const stem = cylinderMesh(0.006, 0.009, 0.06, ctx.accent, 6);
  stem.position.set(0, ctx.frame.top + 0.026, 0);
  stem.rotation.z = 0.18;
  group.add(stem);
  ctx.pivot.add(group);
}

function addRibbon(ctx: RigContext): void {
  const group = new THREE.Group();
  group.name = 'trinket-ribbon';
  const { frame } = ctx;
  const band = torusMesh(frame.radius * 1.0, frame.radius * 0.16, ctx.detail, 6, 18);
  band.rotation.x = Math.PI / 2;
  band.position.y = frame.centerY;
  band.scale.z = 0.6;
  group.add(band);
  for (const side of [-1, 1]) {
    const tail = boxMesh(frame.radius * 0.55, 0.006, frame.radius * 0.34, ctx.detail);
    tail.position.set(side * frame.radius * 0.7, frame.centerY + frame.radius * 0.5, frame.radius * 0.6);
    tail.rotation.set(0.4, side * 0.5, side * 0.3);
    group.add(tail);
  }
  ctx.pivot.add(group);
}

function addFeather(ctx: RigContext): void {
  const group = new THREE.Group();
  group.name = 'trinket-feather';
  const { frame } = ctx;
  const vane = coneMesh(frame.radius * 0.34, frame.radius * 2.1, ctx.accent, 8);
  vane.scale.z = 0.4;
  vane.position.set(0, frame.top + frame.radius * 0.6, -frame.radius * 0.4);
  vane.rotation.x = -0.5;
  const quill = cylinderMesh(0.004, 0.005, frame.radius * 2.0, ctx.detail, 5);
  quill.position.set(0, frame.top + frame.radius * 0.4, -frame.radius * 0.5);
  quill.rotation.x = -0.5;
  group.add(vane, quill);
  ctx.pivot.add(group);
}

/** Apply the shape-agnostic decor parts, honouring what a builder already did. */
function applyDecor(ctx: RigContext): void {
  const { parts, consumed } = ctx;
  if (parts.has('stem')) addStem(ctx);
  if (parts.has('feather')) addFeather(ctx);
  if (parts.has('ribbon')) addRibbon(ctx);
  if (parts.has('hat')) addHat(ctx);
  if (parts.has('spots') && !consumed.has('spots')) addSpots(ctx);
  if (parts.has('stripes') && !consumed.has('stripes')) addStripes(ctx);
  if (parts.has('glitter')) addGlitter(ctx);
}

// ---------------------------------------------------------------------------
// The winding key — the one part that makes a toy read as a *wind-up* toy
// ---------------------------------------------------------------------------

/**
 * A little brass key on the toy's flank: a short axle, an oval bow, and a
 * crossed pair of tabs. The outer group points its axle along ±x so it sits
 * flat against the body, and the inner group is the one `animate` spins.
 */
function makeWindingKey(ctx: RigContext, x: number, y: number, z: number, side: number): void {
  const outer = new THREE.Group();
  outer.name = 'trinket-key';
  outer.position.set(x, y, z);
  outer.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;

  const spin = new THREE.Group();
  spin.name = 'trinket-key-spin';

  const axle = cylinderMesh(0.006, 0.006, 0.05, KEY_METAL, 7);
  axle.rotation.x = Math.PI / 2;
  axle.position.z = 0.02;

  const bow = torusMesh(0.02, 0.006, KEY_METAL, 6, 14);
  bow.position.z = 0.05;

  const tabA = boxMesh(0.032, 0.007, 0.006, KEY_METAL);
  tabA.position.z = 0.05;
  const tabB = boxMesh(0.007, 0.032, 0.006, KEY_METAL);
  tabB.position.z = 0.05;

  spin.add(axle, bow, tabA, tabB);
  outer.add(spin);
  ctx.pivot.add(outer);
  ctx.animated.key = spin;
}

// ---------------------------------------------------------------------------
// Shape builders — found & natural & handmade & curious & seasonal & story
// ---------------------------------------------------------------------------

function buildPebble(ctx: RigContext): void {
  const body = shadowed(new THREE.Mesh(new THREE.DodecahedronGeometry(0.115, 0), ctx.base));
  body.scale.set(1, 0.62, 1.2);
  body.position.y = 0.062;
  body.rotation.y = ctx.rng() * Math.PI;
  ctx.pivot.add(body);
  ctx.frame = { top: 0.13, radius: 0.11, centerY: 0.07 };
}

function buildCube(ctx: RigContext): void {
  const size = 0.15;
  const height = size * 0.95;
  const body = boxMesh(size, height, size, ctx.base);
  body.position.y = height / 2;
  body.rotation.y = ctx.rng() * 0.4 - 0.2;
  const lid = boxMesh(size * 1.04, size * 0.12, size * 1.04, ctx.accent);
  lid.position.y = height - 0.012;
  ctx.pivot.add(body, lid);
  ctx.frame = { top: height, radius: size * 0.62, centerY: height * 0.5 };
}

function buildSphereShape(ctx: RigContext): void {
  const radius = 0.1;
  const body = sphereMesh(radius, ctx.base, 20, 16);
  body.position.y = radius;
  ctx.pivot.add(body);
  ctx.frame = { top: radius * 2, radius, centerY: radius };
}

function buildRing(ctx: RigContext): void {
  const radius = 0.09;
  const tube = 0.026;
  const ring = torusMesh(radius, tube, ctx.base, 10, 22);
  ring.rotation.y = Math.PI / 2; // stand it upright
  ring.position.y = radius + tube;
  const hub = cylinderMesh(0.03, 0.03, tube * 1.2, ctx.accent, 10);
  hub.rotation.z = Math.PI / 2;
  hub.position.y = radius + tube;
  ctx.pivot.add(ring, hub);
  ctx.frame = { top: radius * 2 + tube * 2, radius: 0.05, centerY: radius + tube };
}

function buildCone(ctx: RigContext): void {
  const radius = 0.1;
  const height = 0.19;
  const body = coneMesh(radius, height, ctx.base, 10);
  body.position.y = height / 2;
  const rim = torusMesh(radius * 0.62, 0.009, ctx.accent, 6, 18);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.035;
  ctx.pivot.add(body, rim);
  ctx.frame = { top: height, radius, centerY: height * 0.45 };
}

function buildStar(ctx: RigContext): void {
  const star = new THREE.Group();
  star.name = 'trinket-star';
  star.position.y = 0.105;
  for (let index = 0; index < 5; index += 1) {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / 5;
    const point = coneMesh(0.022, 0.085, ctx.base, 4);
    point.rotation.z = angle - Math.PI / 2;
    point.position.set(Math.cos(angle) * 0.055, Math.sin(angle) * 0.055, 0);
    star.add(point);
  }
  const hub = cylinderMesh(0.03, 0.03, 0.024, ctx.accent, 8);
  hub.rotation.x = Math.PI / 2;
  star.add(hub);
  star.scale.z = 0.55;
  ctx.pivot.add(star);
  ctx.frame = { top: 0.19, radius: 0.07, centerY: 0.1 };
}

function buildHeart(ctx: RigContext): void {
  const tip = coneMesh(0.085, 0.15, ctx.base, 10);
  tip.rotation.z = Math.PI; // apex down
  tip.position.y = 0.075;
  tip.scale.z = 0.5;
  ctx.pivot.add(tip);
  for (const side of [-1, 1]) {
    const lobe = ellipsoid(0.05, 0.05, 0.028, ctx.base);
    lobe.position.set(side * 0.045, 0.148, 0);
    ctx.pivot.add(lobe);
  }
  ctx.frame = { top: 0.198, radius: 0.09, centerY: 0.1 };
}

function buildLeaf(ctx: RigContext): void {
  const blade = ellipsoid(0.058, 0.115, 0.02, ctx.base);
  blade.position.y = 0.115;
  blade.rotation.z = 0.05;
  const vein = boxMesh(0.006, 0.19, 0.006, ctx.accent);
  vein.position.set(0, 0.115, -0.02);
  ctx.pivot.add(blade, vein);
  ctx.frame = { top: 0.23, radius: 0.06, centerY: 0.12 };
}

function buildShell(ctx: RigContext): void {
  const body = ellipsoid(0.09, 0.075, 0.05, ctx.base);
  body.position.y = 0.078;
  body.rotation.y = 0.3;
  const ridgeOuter = torusMesh(0.05, 0.012, ctx.accent, 6, 18);
  ridgeOuter.rotation.x = Math.PI / 2;
  ridgeOuter.position.set(0, 0.108, 0.012);
  const ridgeInner = torusMesh(0.031, 0.009, ctx.accent, 6, 16);
  ridgeInner.rotation.x = Math.PI / 2;
  ridgeInner.position.set(0.012, 0.142, 0.012);
  const tip = coneMesh(0.02, 0.04, ctx.base, 8);
  tip.position.set(0.02, 0.16, 0.01);
  ctx.pivot.add(body, ridgeOuter, ridgeInner, tip);
  ctx.frame = { top: 0.17, radius: 0.09, centerY: 0.08 };
}

function buildKeyShape(ctx: RigContext): void {
  const group = new THREE.Group();
  group.name = 'trinket-key-shape';
  const shaft = cylinderMesh(0.012, 0.012, 0.15, ctx.base, 8);
  shaft.position.y = 0.078;
  const bow = torusMesh(0.028, 0.008, ctx.base, 6, 18);
  bow.position.y = 0.172;
  group.add(shaft, bow);
  for (const y of [0.03, 0.058]) {
    const tooth = boxMesh(0.024, 0.012, 0.012, ctx.base);
    tooth.position.set(0.02, y, 0);
    group.add(tooth);
  }
  group.rotation.z = -0.32;
  ctx.pivot.add(group);
  ctx.frame = { top: 0.196, radius: 0.05, centerY: 0.1 };
}

function buildButton(ctx: RigContext): void {
  const radius = 0.088;
  const disc = cylinderMesh(radius, radius, 0.026, ctx.base, 18);
  disc.rotation.x = Math.PI / 2; // stand it up like a coin
  disc.position.y = radius;
  const rim = torusMesh(radius * 0.78, 0.008, ctx.accent, 6, 20);
  rim.position.set(0, radius, 0.014);
  ctx.pivot.add(disc, rim);
  ctx.frame = { top: radius * 2, radius: 0.09, centerY: radius };
}

function buildGrain(ctx: RigContext): void {
  const kernel = ellipsoid(0.033, 0.078, 0.033, ctx.base);
  kernel.position.y = 0.082;
  const tip = coneMesh(0.022, 0.05, ctx.accent, 8);
  tip.position.y = 0.17;
  ctx.pivot.add(kernel, tip);
  ctx.frame = { top: 0.195, radius: 0.04, centerY: 0.09 };
}

function buildCrystal(ctx: RigContext): void {
  const main = shadowed(new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), ctx.base));
  main.scale.set(0.6, 1.15, 0.6);
  main.position.y = 0.115;
  main.rotation.y = ctx.rng() * Math.PI;
  ctx.pivot.add(main);
  for (const side of [-1, 1]) {
    const shard = shadowed(new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), ctx.base));
    shard.scale.set(0.6, 1.2, 0.6);
    shard.position.set(side * 0.045, 0.05, side * 0.02);
    shard.rotation.z = side * 0.3;
    ctx.pivot.add(shard);
  }
  ctx.frame = { top: 0.23, radius: 0.06, centerY: 0.1 };
}

function buildSpool(ctx: RigContext): void {
  const flangeBottom = cylinderMesh(0.07, 0.07, 0.02, ctx.base, 16);
  flangeBottom.position.y = 0.01;
  const core = cylinderMesh(0.046, 0.046, 0.12, ctx.accent, 14);
  core.position.y = 0.075;
  const flangeTop = cylinderMesh(0.07, 0.07, 0.02, ctx.base, 16);
  flangeTop.position.y = 0.15;
  ctx.pivot.add(flangeBottom, core, flangeTop);
  ctx.frame = { top: 0.16, radius: 0.07, centerY: 0.08 };
}

function buildBell(ctx: RigContext): void {
  const body = latheMesh([
    [0.004, 0.176], [0.026, 0.168], [0.05, 0.15], [0.066, 0.118],
    [0.076, 0.078], [0.086, 0.036], [0.098, 0.014], [0.094, 0.0],
  ], ctx.base, 20);
  const loop = torusMesh(0.014, 0.005, ctx.accent, 6, 14);
  loop.position.y = 0.186;
  ctx.pivot.add(body, loop);
  ctx.frame = { top: 0.19, radius: 0.09, centerY: 0.09 };
}

function buildAcorn(ctx: RigContext): void {
  const nut = ellipsoid(0.068, 0.078, 0.068, ctx.base);
  nut.position.y = 0.08;
  const cap = ellipsoid(0.076, 0.05, 0.076, ctx.accent);
  cap.position.y = 0.145;
  const tip = coneMesh(0.02, 0.03, ctx.detail, 6);
  tip.position.y = 0.19;
  tip.rotation.z = Math.PI;
  ctx.pivot.add(nut, cap, tip);
  ctx.frame = { top: 0.19, radius: 0.075, centerY: 0.09 };
}

function buildPinwheel(ctx: RigContext): void {
  const stem = cylinderMesh(0.008, 0.01, 0.2, STEM_WOOD, 8);
  stem.position.y = 0.1;
  const hub = sphereMesh(0.02, ctx.detail, 10, 8);
  hub.position.y = 0.2;
  ctx.pivot.add(stem, hub);
  for (let index = 0; index < 4; index += 1) {
    const angle = (index * Math.PI) / 2;
    const blade = boxMesh(0.062, 0.05, 0.006, ctx.base);
    blade.position.set(Math.cos(angle) * 0.045, 0.2 + Math.sin(angle) * 0.045, 0.02);
    blade.rotation.z = angle + 0.4;
    ctx.pivot.add(blade);
  }
  ctx.frame = { top: 0.235, radius: 0.05, centerY: 0.12 };
}

function buildThimble(ctx: RigContext): void {
  const body = latheMesh([
    [0.0, 0.18], [0.02, 0.178], [0.04, 0.168], [0.055, 0.152],
    [0.062, 0.126], [0.066, 0.086], [0.068, 0.04], [0.07, 0.0],
  ], ctx.base, 18);
  ctx.pivot.add(body);
  ctx.frame = { top: 0.18, radius: 0.07, centerY: 0.09 };
}

function buildCylinderShape(ctx: RigContext): void {
  const height = 0.16;
  const body = cylinderMesh(0.05, 0.05, height, ctx.base, 14);
  body.position.y = height / 2;
  const cap = cylinderMesh(0.052, 0.052, 0.012, ctx.accent, 14);
  cap.position.y = height - 0.004;
  ctx.pivot.add(body, cap);
  ctx.frame = { top: height, radius: 0.05, centerY: height / 2 };
}

// ---------------------------------------------------------------------------
// Wind-up animals — chunky folded-paper creatures with a key in the flank
// ---------------------------------------------------------------------------

type WindupSpecies =
  | 'mouse' | 'bird' | 'fox' | 'cat' | 'bunny' | 'frog' | 'duck' | 'bear' | 'beetle' | 'fish';

type WindupTraits = {
  body: { rx: number; ry: number; rz: number; y: number };
  head: { r: number; y: number; z: number };
  snout: 'short' | 'long' | 'beak' | 'none';
  ears: 'round' | 'pointed' | 'tall' | 'none';
  tail: 'thin' | 'puff' | 'bushy' | 'fan' | 'none';
  legs: boolean;
  wings: boolean;
  fin: boolean;
  antenna: boolean;
  eyeStyle: 'front' | 'top';
};

const WINDUP_TRAITS: Record<WindupSpecies, WindupTraits> = {
  mouse: {
    body: { rx: 0.075, ry: 0.06, rz: 0.11, y: 0.072 },
    head: { r: 0.056, y: 0.128, z: -0.07 },
    snout: 'short', ears: 'round', tail: 'thin', legs: true, wings: false, fin: false,
    antenna: false, eyeStyle: 'front',
  },
  bird: {
    body: { rx: 0.07, ry: 0.07, rz: 0.085, y: 0.09 },
    head: { r: 0.052, y: 0.158, z: -0.05 },
    snout: 'beak', ears: 'none', tail: 'fan', legs: true, wings: true, fin: false,
    antenna: false, eyeStyle: 'front',
  },
  fox: {
    body: { rx: 0.07, ry: 0.06, rz: 0.095, y: 0.075 },
    head: { r: 0.055, y: 0.132, z: -0.062 },
    snout: 'long', ears: 'pointed', tail: 'bushy', legs: true, wings: false, fin: false,
    antenna: false, eyeStyle: 'front',
  },
  cat: {
    body: { rx: 0.07, ry: 0.055, rz: 0.105, y: 0.068 },
    head: { r: 0.052, y: 0.122, z: -0.058 },
    snout: 'short', ears: 'pointed', tail: 'thin', legs: true, wings: false, fin: false,
    antenna: false, eyeStyle: 'front',
  },
  bunny: {
    body: { rx: 0.072, ry: 0.072, rz: 0.085, y: 0.078 },
    head: { r: 0.048, y: 0.148, z: -0.05 },
    snout: 'short', ears: 'tall', tail: 'puff', legs: true, wings: false, fin: false,
    antenna: false, eyeStyle: 'front',
  },
  frog: {
    body: { rx: 0.095, ry: 0.05, rz: 0.085, y: 0.052 },
    head: { r: 0.045, y: 0.09, z: -0.032 },
    snout: 'none', ears: 'none', tail: 'none', legs: true, wings: false, fin: false,
    antenna: false, eyeStyle: 'top',
  },
  duck: {
    body: { rx: 0.08, ry: 0.065, rz: 0.095, y: 0.078 },
    head: { r: 0.044, y: 0.144, z: -0.058 },
    snout: 'beak', ears: 'none', tail: 'fan', legs: true, wings: true, fin: false,
    antenna: false, eyeStyle: 'front',
  },
  bear: {
    body: { rx: 0.075, ry: 0.075, rz: 0.075, y: 0.082 },
    head: { r: 0.06, y: 0.156, z: -0.04 },
    snout: 'short', ears: 'round', tail: 'none', legs: true, wings: false, fin: false,
    antenna: false, eyeStyle: 'front',
  },
  beetle: {
    body: { rx: 0.082, ry: 0.048, rz: 0.1, y: 0.054 },
    head: { r: 0.034, y: 0.066, z: -0.088 },
    snout: 'none', ears: 'none', tail: 'none', legs: true, wings: false, fin: false,
    antenna: true, eyeStyle: 'front',
  },
  fish: {
    body: { rx: 0.05, ry: 0.078, rz: 0.1, y: 0.088 },
    head: { r: 0.044, y: 0.108, z: -0.078 },
    snout: 'none', ears: 'none', tail: 'none', legs: false, wings: false, fin: true,
    antenna: false, eyeStyle: 'front',
  },
};

function addFeet(ctx: RigContext, halfX: number, halfZ: number, material: THREE.Material): void {
  const group = new THREE.Group();
  group.name = 'trinket-feet';
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const foot = cylinderMesh(0.012, 0.014, 0.03, material, 7);
      foot.position.set(sx * halfX, 0.015, sz * halfZ);
      group.add(foot);
    }
  }
  ctx.pivot.add(group);
}

function addWindupEyes(ctx: RigContext, head: THREE.Group, traits: WindupTraits): void {
  const r = traits.head.r;
  const prominent = ctx.parts.has('eyes');
  const radius = traits.eyeStyle === 'top' ? r * 0.36 : prominent ? r * 0.3 : r * 0.2;
  const group = new THREE.Group();
  group.name = 'trinket-eyes';
  for (const side of [-1, 1]) {
    const eye = sphereMesh(radius, INK, 10, 8);
    if (traits.eyeStyle === 'top') {
      eye.position.set(side * r * 0.5, r * 0.62, -r * 0.25);
    } else {
      eye.position.set(side * r * 0.42, r * 0.2, -r * 0.72);
    }
    const glint = sphereMesh(radius * 0.34, GLINT, 6, 5);
    glint.position.copy(eye.position).add(new THREE.Vector3(side * radius * 0.3, radius * 0.3, -radius * 0.4));
    group.add(eye, glint);
    ctx.eyes.push(eye);
  }
  head.add(group);
}

function addWindupSnout(ctx: RigContext, head: THREE.Group, traits: WindupTraits): void {
  const r = traits.head.r;
  if (traits.snout === 'short') {
    const muzzle = ellipsoid(r * 0.4, r * 0.3, r * 0.32, ctx.detail);
    muzzle.position.set(0, -r * 0.2, -r * 0.92);
    const nose = sphereMesh(r * 0.18, INK, 8, 6);
    nose.position.set(0, -r * 0.14, -r * 1.14);
    head.add(muzzle, nose);
  } else if (traits.snout === 'long') {
    const muzzle = ellipsoid(r * 0.34, r * 0.28, r * 0.85, ctx.base);
    muzzle.position.set(0, -r * 0.22, -r * 0.95);
    const tip = sphereMesh(r * 0.19, INK, 8, 6);
    tip.position.set(0, -r * 0.24, -r * 1.7);
    head.add(muzzle, tip);
  } else if (traits.snout === 'beak') {
    const beak = coneMesh(r * 0.42, r * 1.0, ctx.detail, 8);
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, -r * 0.05, -r * 1.05);
    beak.scale.set(1, 1, 1.4);
    head.add(beak);
  }
}

function addWindupEars(ctx: RigContext, head: THREE.Group, traits: WindupTraits): void {
  const r = traits.head.r;
  if (traits.ears === 'none') return;
  const group = new THREE.Group();
  group.name = 'trinket-ears';
  for (const side of [-1, 1]) {
    let ear: THREE.Mesh;
    if (traits.ears === 'round') {
      ear = ellipsoid(r * 0.52, r * 0.52, r * 0.24, ctx.base);
      ear.position.set(side * r * 0.55, r * 0.82, -r * 0.15);
    } else if (traits.ears === 'pointed') {
      ear = coneMesh(r * 0.36, r * 0.85, ctx.base, 4);
      ear.position.set(side * r * 0.5, r * 0.95, -r * 0.1);
      ear.rotation.z = side * -0.18;
    } else {
      ear = cylinderMesh(r * 0.26, r * 0.34, r * 1.5, ctx.base, 8);
      ear.position.set(side * r * 0.4, r * 1.5, -r * 0.2);
      ear.rotation.z = side * -0.2;
    }
    group.add(ear);
  }
  head.add(group);
}

function addWindupTail(ctx: RigContext, traits: WindupTraits): void {
  if (traits.tail === 'none') return;
  const b = traits.body;
  const group = new THREE.Group();
  group.name = 'trinket-tail';
  group.position.set(0, b.y, b.rz * 0.9);

  if (traits.tail === 'thin') {
    for (let index = 0; index < 4; index += 1) {
      const bead = sphereMesh(0.02 - index * 0.003, ctx.base, 8, 6);
      bead.position.set(Math.sin(index * 0.5) * 0.012, index * 0.022, index * 0.03);
      group.add(bead);
    }
    group.rotation.x = 0.3;
  } else if (traits.tail === 'puff') {
    const puff = sphereMesh(0.034, ctx.detail, 10, 8);
    puff.position.set(0, 0.015, b.rz * 0.35);
    group.add(puff);
  } else if (traits.tail === 'bushy') {
    for (let index = 0; index < 3; index += 1) {
      const segment = ellipsoid(0.032, 0.03, 0.05 + index * 0.004, ctx.base);
      segment.position.set(0, index * 0.012, b.rz * 0.3 + index * 0.05);
      group.add(segment);
    }
    const tip = ellipsoid(0.028, 0.026, 0.04, ctx.detail);
    tip.position.set(0, 0.02, b.rz * 0.3 + 0.17);
    group.add(tip);
    group.rotation.x = 0.25;
  } else {
    const fan = boxMesh(0.07, 0.055, 0.006, ctx.base);
    fan.position.set(0, 0.012, b.rz * 0.35);
    fan.rotation.x = 0.55;
    group.add(fan);
  }

  ctx.pivot.add(group);
  ctx.animated.tail = { object: group, base: group.rotation.x };
}

function addWindupWings(ctx: RigContext, traits: WindupTraits): void {
  if (!traits.wings) return;
  const b = traits.body;
  const group = new THREE.Group();
  group.name = 'trinket-wings';
  for (const side of [-1, 1]) {
    const wing = boxMesh(0.07, 0.05, 0.006, ctx.base);
    wing.position.set(side * (b.rx + 0.015), b.y + 0.008, 0.005);
    const base = side * 0.55;
    wing.rotation.z = base;
    wing.rotation.y = side * 0.2;
    group.add(wing);
    ctx.animated.wings.push({ object: wing, base, sign: side });
  }
  ctx.pivot.add(group);
}

function addWindupFin(ctx: RigContext, traits: WindupTraits): void {
  if (!traits.fin) return;
  const b = traits.body;
  const group = new THREE.Group();
  group.name = 'trinket-fin';
  const dorsal = boxMesh(0.05, 0.05, 0.006, ctx.accent);
  dorsal.position.set(0, b.y + b.ry * 0.85, 0);
  dorsal.rotation.x = -0.2;
  const tailFin = boxMesh(0.06, 0.07, 0.006, ctx.accent);
  tailFin.position.set(0, b.y, b.rz * 1.05);
  tailFin.rotation.y = Math.PI / 2;
  group.add(dorsal, tailFin);
  ctx.pivot.add(group);
}

function addWindupAntenna(ctx: RigContext, head: THREE.Group, traits: WindupTraits): void {
  if (!traits.antenna) return;
  const r = traits.head.r;
  const group = new THREE.Group();
  group.name = 'trinket-antenna';
  for (const side of [-1, 1]) {
    const stem = cylinderMesh(0.004, 0.004, 0.06, ctx.accent, 5);
    stem.position.set(side * r * 0.4, r * 0.9, -r * 0.3);
    stem.rotation.x = -0.7;
    stem.rotation.z = side * -0.35;
    const tip = sphereMesh(0.008, ctx.detail, 6, 5);
    tip.position.set(side * r * 0.7, r * 1.45, -r * 0.85);
    group.add(stem, tip);
  }
  head.add(group);
}

function buildWindup(ctx: RigContext, traits: WindupTraits): void {
  const b = traits.body;
  const h = traits.head;

  const body = ellipsoid(b.rx, b.ry, b.rz, ctx.base);
  body.position.y = b.y;
  ctx.pivot.add(body);

  // A paler belly/chest plate so the creature reads against its own shadow.
  const chest = ellipsoid(b.rx * 0.62, b.ry * 0.72, b.rz * 0.32, ctx.detail);
  chest.position.set(0, b.y - b.ry * 0.08, -b.rz * 0.82);
  ctx.pivot.add(chest);

  // The head lives on its own pivot so face parts move with the skull.
  const head = new THREE.Group();
  head.name = 'trinket-head';
  head.position.set(0, h.y, h.z);
  const skull = ellipsoid(h.r, h.r, h.r * 0.95, ctx.base);
  head.add(skull);
  ctx.pivot.add(head);
  ctx.animated.head = head;

  addWindupSnout(ctx, head, traits);
  addWindupEars(ctx, head, traits);
  addWindupAntenna(ctx, head, traits);
  addWindupEyes(ctx, head, traits);

  addWindupTail(ctx, traits);
  addWindupWings(ctx, traits);
  addWindupFin(ctx, traits);

  if (traits.legs) addFeet(ctx, b.rx * 0.55, b.rz * 0.55, ctx.accent);

  // Winding key on the flank — always present on a wind-up toy.
  const side = ctx.rng() < 0.5 ? -1 : 1;
  makeWindingKey(ctx, side * (b.rx + 0.03), b.y + 0.005, b.rz * 0.35, side);

  if (ctx.parts.has('spots')) addSpots(ctx);
  if (ctx.parts.has('stripes')) addStripes(ctx);

  // Everything an animal handles itself, so generic decor leaves it alone.
  for (const part of ['eyes', 'ears', 'tail', 'wings', 'beak', 'fin', 'antenna', 'spots', 'stripes', 'key'] as const) {
    ctx.consumed.add(part);
  }

  ctx.frame = {
    top: h.y + h.r * 1.1,
    radius: Math.max(b.rx, b.rz),
    centerY: b.y,
  };
}

// ---------------------------------------------------------------------------
// Shape dispatch
// ---------------------------------------------------------------------------

const SHAPE_BUILDERS: Record<TrinketShapeId, ShapeBuilder> = {
  pebble: buildPebble,
  cube: buildCube,
  sphere: buildSphereShape,
  ring: buildRing,
  cone: buildCone,
  star: buildStar,
  heart: buildHeart,
  leaf: buildLeaf,
  shell: buildShell,
  key: buildKeyShape,
  button: buildButton,
  grain: buildGrain,
  crystal: buildCrystal,
  spool: buildSpool,
  bell: buildBell,
  acorn: buildAcorn,
  pinwheel: buildPinwheel,
  thimble: buildThimble,
  cylinder: buildCylinderShape,
  'windup-mouse': (ctx) => buildWindup(ctx, WINDUP_TRAITS.mouse),
  'windup-bird': (ctx) => buildWindup(ctx, WINDUP_TRAITS.bird),
  'windup-fox': (ctx) => buildWindup(ctx, WINDUP_TRAITS.fox),
  'windup-cat': (ctx) => buildWindup(ctx, WINDUP_TRAITS.cat),
  'windup-bunny': (ctx) => buildWindup(ctx, WINDUP_TRAITS.bunny),
  'windup-frog': (ctx) => buildWindup(ctx, WINDUP_TRAITS.frog),
  'windup-duck': (ctx) => buildWindup(ctx, WINDUP_TRAITS.duck),
  'windup-bear': (ctx) => buildWindup(ctx, WINDUP_TRAITS.bear),
  'windup-beetle': (ctx) => buildWindup(ctx, WINDUP_TRAITS.beetle),
  'windup-fish': (ctx) => buildWindup(ctx, WINDUP_TRAITS.fish),
};

/**
 * Shape ids that are *not* in the compiler's union but appear at runtime — a
 * few authored defs cast `'cylinder'` into `TrinketShapeId`. Kept separate so
 * `SHAPE_BUILDERS` stays exhaustively checked against the real type.
 */
const EXTRA_SHAPE_BUILDERS: Record<string, ShapeBuilder> = {
  cylinder: buildCylinderShape,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build one trinket's static rig. Deterministic in `seed` + `def.id`. */
export function buildTrinketRig(def: TrinketDef, seed: number): THREE.Group {
  const group = new THREE.Group();
  group.name = `trinket:${def.id}`;

  const rng = createRng((hashString(def.id) ^ (seed >>> 0)) >>> 0);
  const pivot = new THREE.Group();
  pivot.name = 'trinket-pivot';

  const ctx: RigContext = {
    def,
    rng,
    pivot,
    base: bodyMaterial(def),
    accent: createColorMaterial(def.palette.accent, 0.9),
    detail: createColorMaterial(def.palette.detail, 0.85),
    parts: new Set(def.parts),
    consumed: new Set<TrinketPartId>(),
    frame: { top: 0.16, radius: 0.07, centerY: 0.08 },
    eyes: [],
    animated: { key: null, wings: [], tail: null, head: null },
  };

  const builder =
    SHAPE_BUILDERS[def.shape] ?? EXTRA_SHAPE_BUILDERS[def.shape] ?? buildPebble;
  builder(ctx);
  applyDecor(ctx);

  group.add(pivot);
  const scale = def.scale > 0 ? def.scale : 1;
  group.scale.setScalar(scale);

  const data: TrinketRigUserData = {
    pivot,
    restY: 0,
    phase: rng() * Math.PI * 2,
    speed: 0.85 + rng() * 0.5,
    keySpin: 0,
    key: ctx.animated.key,
    wings: ctx.animated.wings,
    tail: ctx.animated.tail,
    head: ctx.animated.head,
    eyes: ctx.eyes,
  };
  group.userData.trinketId = def.id;
  group.userData.motion = def.motion;
  // The base sits on local y=0, so the caller drops the group on the terrain.
  group.userData.restY = 0;
  group.userData.rig = data;

  return group;
}

/** Animate an existing rig in place. Called every frame while visible. */
export function animateTrinketRig(
  group: THREE.Group,
  def: TrinketDef,
  elapsed: number,
  delta: number,
): void {
  const data = (group.userData as { rig?: TrinketRigUserData }).rig;
  if (!data) return;
  const { pivot } = data;
  const t = elapsed * data.speed + data.phase;

  // Reset to rest every frame so motions never accumulate or drift.
  pivot.position.set(0, data.restY, 0);
  pivot.rotation.set(0, 0, 0);
  pivot.scale.set(1, 1, 1);

  let moving = 0;
  switch (def.motion) {
    case 'still': {
      // Imperceptible breathing.
      pivot.scale.y = 1 + Math.sin(t * 0.85) * 0.01;
      break;
    }
    case 'spin': {
      pivot.rotation.y = t * 0.65;
      break;
    }
    case 'bob': {
      pivot.position.y = data.restY + (Math.sin(t * 1.5) * 0.5 + 0.5) * 0.03;
      pivot.rotation.y = Math.sin(t * 0.4) * 0.16;
      break;
    }
    case 'wobble': {
      // Rocks on its base — the pivot origin is the base, so this is a true rock.
      pivot.rotation.z = Math.sin(t * 2.1) * 0.16;
      pivot.rotation.x = Math.sin(t * 1.6 + 0.7) * 0.06;
      break;
    }
    case 'sway': {
      pivot.rotation.z = Math.sin(t * 1.05) * 0.2;
      pivot.rotation.x = Math.sin(t * 0.7 + 0.4) * 0.05;
      break;
    }
    case 'flip': {
      const period = 5.5;
      const window = 1.5;
      const local = t % period;
      const p = local > period - window ? (local - (period - window)) / window : 0;
      const f = Math.sin(p * Math.PI);
      pivot.rotation.x = -f * Math.PI * 2;
      pivot.position.y = data.restY + f * 0.06;
      break;
    }
    case 'orbit': {
      const radius = 0.05;
      pivot.position.x = Math.sin(t * 0.85) * radius;
      pivot.position.z = Math.cos(t * 0.85) * radius;
      pivot.position.y = data.restY + 0.05 + Math.sin(t * 1.6) * 0.012;
      pivot.rotation.y = -t * 0.85;
      pivot.rotation.z = Math.sin(t * 0.85) * 0.12;
      break;
    }
    case 'windup': {
      // A toy inching around: a little hop, a slow yaw, a barely-there wobble.
      moving = 1;
      const hop = Math.max(0, Math.sin(t * 2.4));
      pivot.position.y = data.restY + hop * 0.02;
      pivot.rotation.y = Math.sin(t * 0.32) * 0.4;
      pivot.rotation.z = Math.sin(t * 6) * 0.05;
      break;
    }
  }

  // The key always turns; briskly on a wind-up toy, lazily on anything else
  // that happens to carry one.
  if (data.key) {
    data.keySpin += delta * (def.motion === 'windup' ? 2.4 : 0.5);
    data.key.rotation.z = data.keySpin;
  }

  // Wings flap, heads tip, tails wag — scaled up while a toy is "walking".
  const flap = 0.35 + moving * 0.55;
  data.wings.forEach((wing, index) => {
    wing.object.rotation.z = wing.base + Math.sin(t * 11 + index * Math.PI) * flap * wing.sign;
  });
  if (data.tail) {
    data.tail.object.rotation.x = data.tail.base + Math.sin(t * 2.6) * 0.08;
  }
  if (data.head) {
    data.head.rotation.x = Math.sin(t * 1.3) * 0.03;
  }

  if (data.eyes.length > 0) {
    const blink = Math.sin(t * 1.5) > 0.965 ? 0.18 : 1;
    for (const eye of data.eyes) {
      eye.scale.y = blink;
    }
  }
}
