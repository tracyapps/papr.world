import * as THREE from 'three';
import { shadowed } from '../render/builders';
import { createColorMaterial, getPaperMaterialByUrl } from '../render/materials';
import type { CritterParams, CritterSpecies } from './critterVariation';

// Critter rig builders: simple, quirky paper animals from primitives and
// swapped-in paper textures. Every rig faces -z and exposes the same
// animate/flourish interface, so behavior code never cares about species.

/**
 * Named handles the behavior layer can pose directly.
 *
 * Every rig used to add its skull, nose, eyes and ears as flat siblings of
 * the root group. Moving `head.position` therefore moved only the skull
 * sphere and left the face hanging in the air — clearly visible on the
 * squirrel, whose "curious" animation bobbed a bald head up and down through
 * a stationary set of eyes and ears.
 *
 * Exposing a real head *group* fixes that and is also what makes natural
 * idle motion possible at all: you cannot look around without a neck.
 */
export type CritterParts = {
  /** Neck pivot. Contains the skull and every face feature. */
  head: THREE.Group | null;
  /** Torso/body, for breathing, stretching, and settling. */
  body: THREE.Object3D | null;
  tail: THREE.Object3D | null;
  ears: THREE.Object3D[];
  /** Rest transforms, so an idle action can always return to neutral. */
  rest: {
    head: { x: number; y: number; z: number };
    ears: Array<{ x: number; y: number; z: number }>;
    /**
     * Body rest *scale* matters: bodies are non-uniformly scaled to shape the
     * animal (the squirrel's is 0.6 × 0.7 × 1.08). Breathing and stretching
     * must scale relative to that, not assign an absolute 1.0, or the animal
     * inflates into a different creature.
     */
    body: { scaleX: number; scaleY: number; scaleZ: number; rotationX: number };
  };
};

/**
 * How a tree-dwelling critter is holding on (see game/critterCanopy.ts).
 * - ground: standing/walking like any other critter
 * - sit: sitting on a branch
 * - hang: upside down under a branch, all four feet hooked on (sloth)
 * - swing: hanging from one or both arms (monkey)
 * - climb: clinging to a trunk or vine, head up
 * - fly: in the air — flying, leaping, or dropping
 */
export type CanopyPose = 'ground' | 'sit' | 'hang' | 'swing' | 'climb' | 'fly';

export type CritterRig = {
  group: THREE.Group;
  /**
   * Tree-dwellers only: switch the limb pose. The canopy layer orients the
   * whole group (rolled over to hang, pitched up to climb); the rig just
   * arranges arms, legs, tail, and neck to match.
   */
  setPose?: (pose: CanopyPose) => void;
  flying: boolean;
  /** Rest height of the group origin above the terrain. */
  groundOffset: number;
  /**
   * Poseable handles for shared idle actions (see game/critterIdle.ts).
   *
   * Hop locomotion is *not* a rig property: how a species moves lives in
   * `critterLocomotion.ts`, so a new hopper (a frog) is one table entry
   * rather than a rig contract change.
   */
  parts: CritterParts;
  animate: (t: number, dt: number, moving: boolean, speedRatio: number, curious: boolean) => void;
  /** Species party trick, progress 0..1 (raccoons rub their little hands). */
  flourish: (progress: number, t: number) => void;
};

/**
 * Re-parent existing meshes under a new pivot group without moving them.
 *
 * Each child's position is re-expressed relative to the pivot, so the rest
 * pose is byte-identical to the flat version — this adds an articulation
 * point rather than restyling the animal.
 *
 * `pivot` should sit at the base of the neck, not the centre of the skull,
 * so rotating the head reads as a neck turn instead of a detached spin.
 */
function makeHead(
  parent: THREE.Object3D,
  pivot: [number, number, number],
  parts: THREE.Object3D[],
): THREE.Group {
  const head = new THREE.Group();
  head.position.set(...pivot);
  for (const part of parts) {
    part.position.sub(head.position);
    head.add(part);
  }
  parent.add(head);
  return head;
}

/** Capture rest rotations so idle actions can always ease back to neutral. */
function restRotations(objects: THREE.Object3D[]) {
  return objects.map((object) => ({
    x: object.rotation.x,
    y: object.rotation.y,
    z: object.rotation.z,
  }));
}

function partsOf(options: {
  head?: THREE.Group | null;
  body?: THREE.Object3D | null;
  tail?: THREE.Object3D | null;
  ears?: THREE.Object3D[];
}): CritterParts {
  const head = options.head ?? null;
  const ears = options.ears ?? [];
  const body = options.body ?? null;
  return {
    head,
    body,
    tail: options.tail ?? null,
    ears,
    rest: {
      head: head
        ? { x: head.rotation.x, y: head.rotation.y, z: head.rotation.z }
        : { x: 0, y: 0, z: 0 },
      ears: restRotations(ears),
      body: {
        scaleX: body?.scale.x ?? 1,
        scaleY: body?.scale.y ?? 1,
        scaleZ: body?.scale.z ?? 1,
        rotationX: body?.rotation.x ?? 0,
      },
    },
  };
}

function bodyMaterial(params: CritterParams, repeat: [number, number] = [1.6, 1.6]) {
  return params.bodyTextureUrl
    ? getPaperMaterialByUrl(params.bodyTextureUrl, repeat)
    : createColorMaterial(params.bodyColor, 0.9);
}

function sphere(radius: number, material: THREE.Material, w = 20, h = 14) {
  return shadowed(new THREE.Mesh(new THREE.SphereGeometry(radius, w, h), material));
}

/**
 * A straight-sided barrel with rounded ends — unlike a stretched sphere,
 * which tapers continuously in every direction no matter how it's scaled
 * and always reads as a ball. `length` is the straight part only, along the
 * capsule's own Y axis before any rotation.
 */
function capsule(radius: number, length: number, material: THREE.Material, capSegments = 6, radialSegments = 14) {
  return shadowed(
    new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, capSegments, radialSegments), material),
  );
}

/**
 * One tail feather: a paper plane hanging from a rib pivot, swept back below
 * horizontal (`sweep`, negative radians), fanned sideways (`fan`), and
 * optionally twisted to face outward (`twist`) so outer feathers stay visible
 * from the side instead of going edge-on.
 *
 * The rib pivot is meant to sit *inside* the body. A plane centered behind
 * the body touches it at a single tangent point and reads as detached from
 * every angle but dead-behind — the bird tail bug. Rooting the quills under
 * the body's skin keeps every feather overlapping real bird no matter which
 * way you look at it.
 */
function feather(
  length: number,
  width: number,
  material: THREE.Material,
  sweep: number,
  fan: number,
  twist = 0,
): THREE.Group {
  const rib = new THREE.Group();
  rib.rotation.set(sweep, 0, fan);
  const quill = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(width, length), material));
  quill.position.y = -length / 2;
  quill.rotation.y = twist;
  rib.add(quill);
  return rib;
}

function buildSquirrel(params: CritterParams): CritterRig {
  const group = new THREE.Group();
  const coat = bodyMaterial(params);
  const dark = createColorMaterial('#241d18', 0.8);
  const belly = createColorMaterial(params.accentColor, 0.92);

  // Long axis runs nose-to-tail (-z forward), so the body reads squirrel,
  // not pufferfish.
  const body = sphere(0.28, coat, 24, 16);
  body.scale.set(0.6, 0.7, 1.08);
  body.position.y = 0.28;

  const tummy = sphere(0.16, belly);
  tummy.scale.set(0.9, 0.8, 0.3);
  tummy.position.set(0, 0.25, -0.16);

  const head = sphere(0.18, coat, 24, 16);
  head.scale.set(1.03, 0.92, 0.9);
  head.position.set(0, 0.44, -0.32);

  const nose = sphere(0.045, dark, 12, 8);
  nose.position.set(0, 0.42, -0.49);

  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.072, 0.072]) {
    const eye = sphere(0.028, dark, 12, 8);
    eye.position.set(x, 0.49, -0.455);
    eyes.push(eye);
  }

  const ears: THREE.Mesh[] = [];
  for (const x of [-0.115, 0.115]) {
    const ear = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.16, 3), coat));
    ear.position.set(x, 0.62, -0.3);
    ear.rotation.set(0.08, x < 0 ? -0.25 : 0.25, x < 0 ? 0.18 : -0.18);
    ears.push(ear);
  }

  const legs: THREE.Mesh[] = [];
  for (const [index, x] of [-0.1, 0.1, -0.08, 0.08].entries()) {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 0.23, 8), dark));
    leg.position.set(x, index < 2 ? 0.12 : 0.16, index < 2 ? -0.18 : 0.14);
    leg.rotation.x = index < 2 ? 0.48 : -0.32;
    legs.push(leg);
  }

  // All-coat tail with a cream tip — ringed tails belong to raccoons.
  const tail = new THREE.Group();
  tail.position.set(0, 0.32, 0.26);
  for (let index = 0; index < 5; index += 1) {
    const puff = sphere(0.16 - index * 0.008, index === 4 ? belly : coat);
    const angle = -0.65 + index * 0.42;
    puff.position.set(Math.sin(angle) * 0.18, 0.08 + index * 0.12, 0.04 + Math.cos(angle) * 0.12);
    puff.scale.set(0.74, 0.95, 0.5);
    puff.rotation.x = 0.35;
    tail.add(puff);
  }
  tail.rotation.x = -0.18;

  group.add(body, tummy, ...legs, tail);
  // Skull, nose, eyes and ears move together from a neck pivot. Previously
  // these were siblings of the root group, so the old `head.position.y` bob
  // slid a bare skull through a stationary face.
  const headGroup = makeHead(group, [0, 0.4, -0.24], [head, nose, ...eyes, ...ears]);
  const headRestY = headGroup.position.y;

  const o = params.animOffset;
  return {
    group,
    flying: false,
    groundOffset: 0.03,
    parts: partsOf({ head: headGroup, body, tail, ears }),
    animate: (t, _dt, moving, speedRatio, _curious) => {
      tail.rotation.z = Math.sin(t * (moving ? 7 : 2.4) + o) * (moving ? 0.2 : 0.1);
      body.rotation.z = moving ? Math.sin(t * 9 + o) * 0.06 * speedRatio : 0;
      legs.forEach((leg, index) => {
        leg.rotation.x = (index < 2 ? 0.48 : -0.32)
          + (moving ? Math.sin(t * 12 + o + index * Math.PI) * 0.26 * speedRatio : 0);
      });
      // Head pose belongs to the idle action system now; this only keeps the
      // always-on details (breathing and blinking) alive.
      const blink = Math.sin(t * 1.7 + o) > 0.97 ? 0.25 : 1;
      eyes.forEach((eye) => { eye.scale.y = blink; });
    },
    flourish: (progress, t) => {
      // Sit up tall and give the tail a proud swish.
      const lift = Math.sin(progress * Math.PI);
      body.rotation.x = -0.4 * lift;
      headGroup.rotation.x = -0.34 * lift;
      headGroup.position.y = headRestY + 0.1 * lift;
      tail.rotation.z = Math.sin(t * 10) * 0.3 * lift;
      if (progress >= 1) {
        body.rotation.x = 0;
        headGroup.rotation.x = 0;
        headGroup.position.y = headRestY;
      }
    },
  };
}

function buildButterfly(params: CritterParams): CritterRig {
  const group = new THREE.Group();
  const dark = createColorMaterial(params.accentColor, 0.8);
  const wingPaper = bodyMaterial(params, [1, 1]);

  const body = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.46, 14), dark));
  body.rotation.x = Math.PI / 2;

  const head = sphere(0.055, dark, 14, 10);
  head.position.z = -0.26;

  const makeWing = (side: -1 | 1) => {
    const wing = new THREE.Group();
    wing.position.x = side * 0.02;
    const upper = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26), wingPaper));
    upper.position.set(side * 0.19, 0.08, -0.04);
    upper.rotation.z = side * -0.26;
    const lower = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(0.25, 0.2), wingPaper));
    lower.position.set(side * 0.15, -0.11, 0.03);
    lower.rotation.z = side * 0.34;
    lower.scale.y = 0.88;
    wing.add(upper, lower);
    return wing;
  };

  const leftWing = makeWing(-1);
  const rightWing = makeWing(1);

  const antennae: THREE.Mesh[] = [];
  for (const side of [-1, 1] as const) {
    const antenna = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 6), dark));
    antenna.position.set(side * 0.045, 0.07, -0.34);
    antenna.rotation.set(0.72, 0, side * -0.34);
    antennae.push(antenna);
  }

  group.add(body, leftWing, rightWing);
  const headGroup = makeHead(group, [0, 0.04, -0.2], [head, ...antennae]);

  const o = params.animOffset;
  return {
    group,
    flying: true,
    groundOffset: 1.46,
    parts: partsOf({ head: headGroup, body }),
    animate: (t, _dt, _moving, _speedRatio, curious) => {
      const flap = 0.48 + Math.sin(t * (curious ? 15 : 11) + o) * 0.62;
      leftWing.rotation.y = -flap;
      rightWing.rotation.y = flap;
      body.scale.y = 1 + Math.sin(t * 7 + o) * 0.035;
      group.rotation.z = Math.sin(t * 2.2 + o) * 0.12;
      group.rotation.x = Math.sin(t * 1.8 + o) * 0.08;
      antennae.forEach((antenna, index) => {
        antenna.rotation.z = (index === 0 ? 0.34 : -0.34) + Math.sin(t * 5 + o + index) * 0.08;
      });
    },
    flourish: (progress, t) => {
      // A happy little barrel-waggle.
      group.rotation.z = Math.sin(progress * Math.PI * 4) * 0.5;
      const flap = 0.4 + Math.sin(t * 18) * 0.7;
      leftWing.rotation.y = -flap;
      rightWing.rotation.y = flap;
      if (progress >= 1) group.rotation.z = 0;
    },
  };
}

function buildRaccoon(params: CritterParams): CritterRig {
  const group = new THREE.Group();
  const coat = bodyMaterial(params);
  const dark = createColorMaterial(params.accentColor, 0.8);
  const cream = createColorMaterial('#efe7d4', 0.92);

  // Torso pivots so the raccoon can sit up on its haunches.
  const torso = new THREE.Group();
  torso.position.set(0, 0.14, 0.06);

  const body = sphere(0.3, coat, 24, 16);
  body.scale.set(1.2, 0.82, 0.72);
  body.position.set(0, 0.16, 0);

  const head = sphere(0.19, coat, 24, 16);
  head.scale.set(1, 0.9, 0.95);
  head.position.set(0, 0.38, -0.34);

  const muzzle = sphere(0.1, cream, 16, 12);
  muzzle.scale.set(1, 0.78, 0.9);
  muzzle.position.set(0, 0.33, -0.47);

  const nose = sphere(0.038, dark, 10, 8);
  nose.position.set(0, 0.35, -0.56);

  // The mask. Non-negotiable.
  const maskPatches: THREE.Mesh[] = [];
  for (const x of [-0.085, 0.085]) {
    const patch = sphere(0.075, dark, 14, 10);
    patch.scale.set(1.35, 0.85, 0.5);
    patch.position.set(x, 0.42, -0.465);
    patch.rotation.z = x < 0 ? 0.28 : -0.28;
    maskPatches.push(patch);
  }

  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.08, 0.08]) {
    const glint = sphere(0.016, cream, 8, 6);
    glint.position.set(x + 0.015, 0.435, -0.53);
    eyes.push(glint);
  }

  const ears: THREE.Mesh[] = [];
  for (const x of [-0.13, 0.13]) {
    const ear = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.1, 8), coat));
    ear.position.set(x, 0.55, -0.3);
    ear.rotation.z = x < 0 ? 0.2 : -0.2;
    const inner = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.06, 8), dark));
    inner.position.set(x, 0.545, -0.315);
    inner.rotation.z = ear.rotation.z;
    ears.push(ear, inner);
  }

  // Little hands. Also non-negotiable.
  const paws: THREE.Mesh[] = [];
  for (const x of [-0.1, 0.1]) {
    const paw = sphere(0.05, dark, 10, 8);
    paw.position.set(x, 0.08, -0.34);
    paws.push(paw);
  }

  torso.add(body, ...paws);
  // The raccoon already nested its face under `torso`, so its face never
  // detached — but it still had no neck, so it could not look around.
  const headGroup = makeHead(torso, [0, 0.34, -0.26], [head, muzzle, nose, ...maskPatches, ...eyes, ...ears]);

  const legs: THREE.Mesh[] = [];
  for (const [index, x] of [-0.15, 0.15, -0.13, 0.13].entries()) {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.042, 0.22, 8), dark));
    leg.position.set(x, 0.11, index < 2 ? -0.2 : 0.2);
    legs.push(leg);
  }

  // Ringed tail: alternating coat/dark segments arcing up and back.
  const tail = new THREE.Group();
  tail.position.set(0, 0.32, 0.34);
  for (let index = 0; index < 5; index += 1) {
    const ring = sphere(0.11 - index * 0.012, index % 2 === 0 ? coat : dark, 14, 10);
    ring.position.set(0, index * 0.09, index * 0.075);
    ring.scale.set(0.9, 0.72, 0.9);
    tail.add(ring);
  }
  tail.rotation.x = 0.5;

  group.add(torso, ...legs, tail);

  const o = params.animOffset;
  return {
    group,
    parts: partsOf({ head: headGroup, body: torso, tail, ears }),
    flying: false,
    groundOffset: 0.03,
    animate: (t, _dt, moving, speedRatio, curious) => {
      // Trundling waddle.
      torso.rotation.z = moving ? Math.sin(t * 8 + o) * 0.07 * speedRatio : 0;
      tail.rotation.z = Math.sin(t * (moving ? 6 : 2) + o) * (moving ? 0.16 : 0.07);
      legs.forEach((leg, index) => {
        leg.rotation.x = moving ? Math.sin(t * 11 + o + index * Math.PI) * 0.3 * speedRatio : 0;
      });
      // Perks up and raises its tail when someone interesting is here. Head
      // pose is left to the idle action system so the two never fight.
      const perk = curious ? 1 : 0;
      torso.rotation.x = THREE.MathUtils.lerp(torso.rotation.x, -0.22 * perk, 0.09);
      tail.rotation.x = THREE.MathUtils.lerp(tail.rotation.x, curious ? 0.75 : 0.5, 0.09);
    },
    flourish: (progress, t) => {
      // Sits up on its haunches and rubs its little hands together.
      const sit = Math.sin(Math.min(progress * 1.25, 1) * Math.PI);
      torso.rotation.x = -0.62 * sit;
      const rub = Math.sin(t * 16) * 0.035 * sit;
      paws[0].position.set(-0.035 + rub, 0.16 * sit + 0.08, -0.38);
      paws[1].position.set(0.035 - rub, 0.16 * sit + 0.08, -0.38);
      if (progress >= 1) {
        torso.rotation.x = 0;
        paws[0].position.set(-0.1, 0.08, -0.34);
        paws[1].position.set(0.1, 0.08, -0.34);
      }
    },
  };
}

function buildMeerkat(params: CritterParams): CritterRig {
  const group = new THREE.Group();
  const coat = bodyMaterial(params, [1.2, 1.2]);
  const dark = createColorMaterial(params.accentColor, 0.82);
  const cream = createColorMaterial('#f2e6cf', 0.92);

  // Torso pivots upright — the sentry stance is the entire reason to draw
  // a meerkat rather than reuse another small mammal.
  const torso = new THREE.Group();
  torso.position.set(0, 0.13, 0);

  // Two overlapping capsule segments, not one stretched sphere — a sphere
  // tapers continuously in every direction no matter how it's scaled, so it
  // always reads as a ball. A capsule keeps a straight-sided barrel through
  // its middle, which is what actually reads as "tubular." The rear segment
  // (haunches) stays level and low; the front segment (ribcage) tilts
  // upward toward the neck, so together they read as a gently arched spine
  // — low in the back, lifted at the shoulders — rather than one rigid rod.
  const haunches = capsule(0.088, 0.15, coat);
  haunches.rotation.x = Math.PI / 2;
  haunches.position.set(0, -0.02, 0.1);

  const ribcage = capsule(0.078, 0.17, coat);
  ribcage.rotation.x = Math.PI / 2 + 0.34;
  ribcage.position.set(0, 0.05, -0.1);

  const chest = sphere(0.09, cream, 16, 12);
  chest.scale.set(0.8, 1, 0.68);
  chest.position.set(0, 0.03, -0.2);

  const head = sphere(0.115, coat, 20, 14);
  head.scale.set(0.92, 0.88, 1);
  head.position.set(0, 0.29, -0.24);

  const snout = sphere(0.062, coat, 14, 10);
  snout.scale.set(0.85, 0.75, 1.05);
  snout.position.set(0, 0.265, -0.34);

  const nose = sphere(0.026, dark, 8, 6);
  nose.position.set(0, 0.27, -0.4);

  // Signature dark eye patches: smaller and more localized than a raccoon's
  // full mask band, reading as sun-shielding rather than bandit disguise.
  const eyePatches: THREE.Mesh[] = [];
  for (const x of [-0.06, 0.06]) {
    const patch = sphere(0.042, dark, 12, 8);
    patch.scale.set(1, 1.3, 0.6);
    patch.position.set(x, 0.305, -0.335);
    eyePatches.push(patch);
  }

  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.058, 0.058]) {
    const glint = sphere(0.012, cream, 8, 6);
    glint.position.set(x, 0.315, -0.375);
    eyes.push(glint);
  }

  const ears: THREE.Mesh[] = [];
  for (const x of [-0.095, 0.095]) {
    const ear = sphere(0.032, coat, 12, 8);
    ear.scale.set(0.85, 1, 0.55);
    ear.position.set(x, 0.37, -0.24);
    // Black-tipped ears — the one marking every meerkat gets. A child of the
    // ear so ear-swivel idles carry the tip along.
    const tipCap = sphere(0.02, dark, 8, 6);
    tipCap.scale.set(0.8, 0.85, 0.5);
    tipCap.position.set(x * 0.03, 0.023, 0);
    ear.add(tipCap);
    ears.push(ear);
  }

  // Faint bars across the back, the way real meerkats' guard hair grows.
  // Seeded per individual via `params.markings`: some backs stay plain, most
  // are faintly barred, a few wear it boldly. Thin translucent strips sunk
  // into the spine so only the crest shows — tissue-paper barring laid over
  // whatever coat paper the individual rolled.
  const markings = params.markings ?? 1;
  const barMaterial = markings > 0.75
    ? createColorMaterial(params.accentColor, 0.55)
    : createColorMaterial(params.accentColor, 0.4);
  // [spine y, z] spots along the arched two-capsule back, front lifted.
  const barSpots: Array<[number, number]> = [
    [0.135, -0.16], [0.126, -0.08], [0.112, 0.0], [0.098, 0.08], [0.09, 0.15],
  ];
  if (markings > 0.3) {
    const bars = markings > 0.75 ? barSpots : barSpots.filter((_, index) => index % 2 === 0);
    for (const [y, z] of bars) {
      const bar = sphere(0.09, barMaterial, 10, 8);
      bar.scale.set(1.12, 0.15, 0.16);
      bar.position.set(0, y - 0.004, z);
      torso.add(bar);
    }
  }

  torso.add(haunches, ribcage, chest);
  const headGroup = makeHead(torso, [0, 0.27, -0.2], [head, snout, nose, ...eyePatches, ...eyes, ...ears]);

  // Short legs — the stance does the work, not leg length.
  const legs: THREE.Mesh[] = [];
  for (const [index, x] of [-0.09, 0.09, -0.075, 0.075].entries()) {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.16, 8), dark));
    leg.position.set(x, -0.05, index < 2 ? -0.14 : 0.13);
    legs.push(leg);
  }

  // Paws, held loosely at rest and clasped at the chest at full attention.
  const paws: THREE.Mesh[] = [];
  for (const x of [-0.075, 0.075]) {
    const paw = sphere(0.034, dark, 10, 8);
    paw.position.set(x, 0.03, -0.14);
    paws.push(paw);
  }

  // Long, tapering tail with a dark tip rather than the raccoon's
  // alternating rings — and a meerkat's tripod leg when it stands sentry.
  const tail = new THREE.Group();
  tail.position.set(0, -0.01, 0.22);
  const tailBase = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.34, 8), coat));
  tailBase.rotation.x = Math.PI / 2.3;
  tailBase.position.set(0, 0.06, 0.12);
  const tailTip = sphere(0.032, dark, 10, 8);
  tailTip.position.set(0, 0.14, 0.36);
  tail.add(tailBase, tailTip);

  group.add(torso, ...legs, ...paws, tail);

  const o = params.animOffset;
  return {
    group,
    parts: partsOf({ head: headGroup, body: torso, tail, ears }),
    flying: false,
    groundOffset: 0.155,
    animate: (t, _dt, moving, speedRatio, curious) => {
      torso.rotation.z = moving ? Math.sin(t * 9 + o) * 0.05 * speedRatio : 0;
      tail.rotation.x = Math.sin(t * (moving ? 7 : 2.4) + o) * (moving ? 0.1 : 0.04);
      legs.forEach((leg, index) => {
        leg.rotation.x = moving ? Math.sin(t * 12 + o + index * Math.PI) * 0.28 * speedRatio : 0;
      });
      // A curious meerkat rises partway onto its haunches before it ever
      // earns the full sentry flourish — checking things out is the whole
      // personality, not a special occasion. Head pose stays with the idle
      // action system so the two never fight.
      const perk = curious ? 1 : 0;
      torso.rotation.x = THREE.MathUtils.lerp(torso.rotation.x, -0.5 * perk, 0.1);
    },
    flourish: (progress, t) => {
      // Full sentry stance: rises upright on a tripod of hind legs and
      // tail, front legs lifting to bring the paws up to a clasp at the
      // chest, scanning. Pushed further upright than the curious half-rise
      // in animate() above, and the front legs now visibly travel with the
      // paws instead of staying planted while the paws float free — the
      // two read as one connected motion rather than the body rising out
      // from under its own arms.
      const rise = Math.sin(Math.min(progress * 1.2, 1) * Math.PI);
      torso.rotation.x = -1.35 * rise;
      tail.rotation.x = 0.6 * rise;
      // Front legs (index 0, 1) fold up toward the chest; rear legs
      // (index 2, 3) brace forward slightly, planting the tripod that
      // holds the rise up.
      legs.forEach((leg, index) => {
        leg.rotation.x = index < 2 ? -1.9 * rise : 0.22 * rise;
      });
      const clasp = Math.sin(t * 10) * 0.02 * rise;
      paws[0].position.set(-0.045 + clasp, 0.09 * rise + 0.03, -0.14 - 0.06 * rise);
      paws[1].position.set(0.045 - clasp, 0.09 * rise + 0.03, -0.14 - 0.06 * rise);
      if (progress >= 1) {
        torso.rotation.x = 0;
        tail.rotation.x = 0;
        legs.forEach((leg) => {
          leg.rotation.x = 0;
        });
        paws[0].position.set(-0.075, 0.03, -0.14);
        paws[1].position.set(0.075, 0.03, -0.14);
      }
    },
  };
}

function buildBunny(params: CritterParams): CritterRig {
  const group = new THREE.Group();
  const coat = bodyMaterial(params);
  const dark = createColorMaterial('#2b2420', 0.82);
  const inner = createColorMaterial(params.accentColor, 0.9);
  const fluff = createColorMaterial('#f4eee0', 0.95);

  const body = sphere(0.24, coat, 22, 16);
  body.scale.set(0.95, 1.02, 0.82);
  body.position.y = 0.26;

  const head = sphere(0.16, coat, 22, 16);
  head.position.set(0, 0.5, -0.18);

  const ears: THREE.Group[] = [];
  for (const x of [-0.075, 0.075]) {
    const ear = new THREE.Group();
    ear.position.set(x, 0.62, -0.16);
    const outer = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.32, 10), coat));
    outer.scale.z = 0.55;
    outer.position.y = 0.16;
    const lining = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.22), inner));
    lining.position.set(0, 0.16, -0.028);
    ear.add(outer, lining);
    ear.rotation.z = x < 0 ? 0.16 : -0.16;
    ears.push(ear);
  }

  const tail = sphere(0.08, fluff, 12, 10);
  tail.position.set(0, 0.24, 0.2);

  const nose = sphere(0.026, inner, 10, 8);
  nose.position.set(0, 0.48, -0.335);

  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.062, 0.062]) {
    const eye = sphere(0.026, dark, 10, 8);
    eye.position.set(x, 0.52, -0.3);
    eyes.push(eye);
  }

  const feet: THREE.Mesh[] = [];
  for (const x of [-0.09, 0.09]) {
    const foot = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 10), coat));
    foot.position.set(x, 0.05, -0.06);
    feet.push(foot);
  }

  group.add(body, tail, ...feet);
  const headGroup = makeHead(group, [0, 0.42, -0.2], [head, ...ears, nose, ...eyes]);

  const o = params.animOffset;
  return {
    group,
    flying: false,
    groundOffset: 0.02,
    parts: partsOf({ head: headGroup, body, tail, ears }),
    animate: (t, _dt, moving, speedRatio, curious) => {
      // Ear pose is owned by the idle action system (ear-swivel, perk-up) so
      // the two never write the same rotation on the same frame. Only the
      // walking bounce and the nose stay here.
      if (moving) {
        ears.forEach((ear, index) => {
          ear.rotation.x = Math.sin(t * 9 + o + index) * 0.14 * speedRatio + 0.12;
        });
      }
      nose.scale.setScalar(curious ? 1 + Math.sin(t * 14 + o) * 0.25 : 1);
      body.scale.y = 1.02 + (moving ? Math.sin(t * 9 + o) * 0.05 * speedRatio : Math.sin(t * 2 + o) * 0.012);
      const blink = Math.sin(t * 1.9 + o) > 0.96 ? 0.2 : 1;
      eyes.forEach((eye) => { eye.scale.y = blink; });
    },
    flourish: (progress, t) => {
      // Joyful squash-and-stretch with an ear waggle.
      const wave = Math.sin(progress * Math.PI);
      body.scale.y = 1.02 + Math.sin(t * 12) * 0.1 * wave;
      ears.forEach((ear, index) => {
        ear.rotation.z = Math.sin(t * 13 + index * Math.PI) * 0.35 * wave;
      });
      if (progress >= 1) body.scale.y = 1.02;
    },
  };
}

function buildBird(params: CritterParams): CritterRig {
  const group = new THREE.Group();
  const coat = bodyMaterial(params, [1.1, 1.1]);
  const dark = createColorMaterial('#26201b', 0.82);
  const beakMaterial = createColorMaterial(params.accentColor, 0.7);

  const body = sphere(0.16, coat, 20, 14);
  body.scale.set(1, 0.95, 1.2);
  body.position.y = 0.18;

  const head = sphere(0.105, coat, 18, 12);
  head.position.set(0, 0.33, -0.1);

  const beak = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 8), beakMaterial));
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, 0.32, -0.24);

  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.055, 0.055]) {
    const eye = sphere(0.02, dark, 8, 6);
    eye.position.set(x, 0.36, -0.16);
    eyes.push(eye);
  }

  const wings: THREE.Mesh[] = [];
  for (const side of [-1, 1] as const) {
    const wing = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.13), coat));
    wing.position.set(side * 0.15, 0.2, 0.02);
    wing.rotation.z = side * 0.55;
    wing.rotation.y = side * 0.25;
    wings.push(wing);
  }

  // Rooted tail fan: three quills swept back below the horizontal, the outer
  // two fanned and twisted outward. Continuing the body's back line down and
  // back is what a perched songbird's tail actually does — the old single
  // plane tilted up and floated clear of the body.
  const tail = new THREE.Group();
  tail.position.set(0, 0.26, 0.09);
  const TAIL_SWEEP = -1.24;
  tail.add(
    feather(0.21, 0.075, coat, TAIL_SWEEP, -0.46, -0.6),
    feather(0.22, 0.08, coat, TAIL_SWEEP, 0),
    feather(0.21, 0.075, coat, TAIL_SWEEP, 0.46, 0.6),
  );

  const legs: THREE.Mesh[] = [];
  for (const x of [-0.05, 0.05]) {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), dark));
    leg.position.set(x, 0.05, 0);
    legs.push(leg);
  }

  group.add(body, ...wings, tail, ...legs);
  const headGroup = makeHead(group, [0, 0.28, -0.06], [head, beak, ...eyes]);
  const headRest = headGroup.position.clone();

  const o = params.animOffset;
  return {
    group,
    flying: false,
    groundOffset: 0.02,
    parts: partsOf({ head: headGroup, body, tail }),
    animate: (t, _dt, moving, speedRatio, curious) => {
      if (moving) {
        wings.forEach((wing, index) => {
          const side = index === 0 ? -1 : 1;
          wing.rotation.z = side * (0.55 + Math.sin(t * 16 + o) * 0.3 * speedRatio);
        });
        headGroup.position.copy(headRest);
        headGroup.rotation.x = 0;
      } else {
        wings.forEach((wing, index) => {
          wing.rotation.z = (index === 0 ? -1 : 1) * 0.55;
        });
        // Idle pecking: the head tips forward and down toward the ground,
        // beak-first, in a smooth arc — it dips in front of the body
        // instead of sinking straight through it.
        // Pecking now tips the whole head group, so the beak and eyes come
        // along with the skull instead of being left hanging in the air.
        const peckWave = Math.sin(t * 2.6 + o);
        const peckAmount = peckWave > 0.72 ? (peckWave - 0.72) / 0.28 : 0;
        const dip = Math.sin(peckAmount * Math.PI);
        headGroup.position.set(headRest.x, headRest.y - dip * 0.07, headRest.z - dip * 0.08);
        headGroup.rotation.x = dip * 0.55;
      }
      // The signature bird head-cock, applied to the whole head.
      headGroup.rotation.z = curious ? (Math.sin(t * 1.6 + o) > 0 ? 0.42 : -0.42) : 0;
      tail.rotation.x = Math.sin(t * 3.2 + o) * 0.1;
    },
    flourish: (progress, t) => {
      // Big wing stretch and a shimmy.
      const stretch = Math.sin(progress * Math.PI);
      wings.forEach((wing, index) => {
        const side = index === 0 ? -1 : 1;
        wing.rotation.z = side * (0.55 + 0.9 * stretch);
      });
      body.rotation.y = Math.sin(t * 14) * 0.08 * stretch;
      if (progress >= 1) body.rotation.y = 0;
    },
  };
}

/**
 * The tropical flagship — the biome plan's cheapest-right answer: "a parrot
 * or toucan (reuses the existing bird rig with new colours and a beak)."
 * Same skeleton plan as `buildBird`, but the three silhouette cues that make
 * a parrot read as one from across a page: a stout hooked beak, a long
 * tapered tail, and slow broad wings instead of a small bird's quick ones.
 */
function buildParrot(params: CritterParams): CritterRig {
  const group = new THREE.Group();
  const coat = bodyMaterial(params, [1.1, 1.1]);
  const dark = createColorMaterial('#26201b', 0.82);
  const beakMaterial = createColorMaterial(params.accentColor, 0.7);

  // Stouter than the songbird body — a parrot is a handful of bird.
  const body = sphere(0.19, coat, 20, 14);
  body.scale.set(0.95, 0.95, 1.25);
  body.position.y = 0.2;

  const head = sphere(0.125, coat, 18, 12);
  head.position.set(0, 0.38, -0.1);

  // The hook: a fat upper cone curving down over a small lower one, so the
  // profile says "parrot" even at minimap distance.
  const beakUpper = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 8), beakMaterial));
  beakUpper.rotation.x = -Math.PI / 2 - 0.7;
  beakUpper.position.set(0, 0.36, -0.24);
  const beakLower = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 6), dark));
  beakLower.rotation.x = -Math.PI / 2 - 0.35;
  beakLower.position.set(0, 0.335, -0.225);

  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.062, 0.062]) {
    const eye = sphere(0.021, dark, 8, 6);
    eye.position.set(x, 0.41, -0.16);
    eyes.push(eye);
  }

  // Broad, slow wings — a parrot flaps like it means it.
  const wings: THREE.Mesh[] = [];
  for (const side of [-1, 1] as const) {
    const wing = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.16), coat));
    wing.position.set(side * 0.17, 0.22, 0.02);
    wing.rotation.z = side * 0.5;
    wing.rotation.y = side * 0.25;
    wings.push(wing);
  }

  // A long two-panel tail that streams behind and drags, the second parrot
  // cue. Both quills root inside the body (see `feather`); the accent panel
  // rides slightly proud of the coat one so the pair read as layered paper
  // rather than one thick sheet.
  const tail = new THREE.Group();
  tail.position.set(0, 0.27, 0.08);
  const TAIL_SWEEP = -1.38;
  tail.add(
    feather(0.5, 0.16, coat, TAIL_SWEEP, 0),
    feather(0.34, 0.1, beakMaterial, TAIL_SWEEP + 0.08, 0),
  );
  tail.children[1].position.set(0, 0.05, 0.012);

  const legs: THREE.Mesh[] = [];
  for (const x of [-0.055, 0.055]) {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.1, 6), dark));
    leg.position.set(x, 0.05, 0);
    legs.push(leg);
  }

  group.add(body, ...wings, tail, ...legs);
  const headGroup = makeHead(group, [0, 0.32, -0.06], [head, beakUpper, beakLower, ...eyes]);
  const headRest = headGroup.position.clone();

  const o = params.animOffset;
  return {
    group,
    flying: false,
    groundOffset: 0.02,
    parts: partsOf({ head: headGroup, body, tail }),
    animate: (t, _dt, moving, speedRatio, curious) => {
      if (moving) {
        // Slow and deliberate: half the songbird's flap rate, more travel.
        wings.forEach((wing, index) => {
          const side = index === 0 ? -1 : 1;
          wing.rotation.z = side * (0.5 + Math.sin(t * 9 + o) * 0.42 * speedRatio);
        });
        headGroup.position.copy(headRest);
        headGroup.rotation.x = 0;
      } else {
        wings.forEach((wing, index) => {
          wing.rotation.z = (index === 0 ? -1 : 1) * 0.5;
        });
        // Idle preening: the head swings back toward the wing instead of a
        // songbird's peck — parrot idles are sideways, not downward.
        const preenWave = Math.sin(t * 1.8 + o);
        const preenAmount = preenWave > 0.6 ? (preenWave - 0.6) / 0.4 : 0;
        const swing = Math.sin(preenAmount * Math.PI);
        headGroup.position.copy(headRest);
        headGroup.rotation.x = 0;
        headGroup.rotation.y = swing * 0.85;
      }
      // The same curious head-cock the bird has — a parrot just commits.
      if (curious) headGroup.rotation.z = Math.sin(t * 1.6 + o) > 0 ? 0.42 : -0.42;
      tail.rotation.x = Math.sin(t * 2.4 + o) * 0.08;
    },
    flourish: (progress, t) => {
      // Big wing stretch, tail lift, and an indignant little shimmy.
      const stretch = Math.sin(progress * Math.PI);
      wings.forEach((wing, index) => {
        const side = index === 0 ? -1 : 1;
        wing.rotation.z = side * (0.5 + 0.95 * stretch);
      });
      // Sweeping toward level raises the drag into a fan.
      tail.rotation.x = 0.4 * stretch;
      body.rotation.y = Math.sin(t * 14) * 0.08 * stretch;
      if (progress >= 1) {
        body.rotation.y = 0;
        tail.rotation.x = 0;
      }
    },
  };
}

function buildCat(params: CritterParams): CritterRig {
  const group = new THREE.Group();
  const coat = bodyMaterial(params, [1.2, 1.2]);
  const dark = createColorMaterial('#26211d', 0.82);
  const pink = createColorMaterial(params.accentColor, 0.88);
  const whiskerMaterial = createColorMaterial('#f2ecdc', 0.9);

  // Long, low, and self-satisfied.
  const body = sphere(0.24, coat, 24, 16);
  body.scale.set(0.62, 0.66, 1.25);
  body.position.y = 0.24;

  const chest = sphere(0.14, coat, 16, 12);
  chest.position.set(0, 0.26, -0.24);

  const head = sphere(0.145, coat, 22, 16);
  head.scale.set(1, 0.92, 0.92);
  head.position.set(0, 0.46, -0.32);

  const ears: THREE.Mesh[] = [];
  for (const x of [-0.08, 0.08]) {
    const ear = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.1, 3), coat));
    ear.position.set(x, 0.6, -0.3);
    ear.rotation.y = x < 0 ? 0.4 : -0.4;
    const inner = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.055, 3), pink));
    inner.position.set(x, 0.595, -0.312);
    inner.rotation.y = ear.rotation.y;
    ears.push(ear, inner);
  }

  const nose = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.02, 3), pink));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.44, -0.455);

  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.058, 0.058]) {
    const eye = sphere(0.025, dark, 10, 8);
    eye.position.set(x, 0.485, -0.43);
    eye.scale.y = 1.2; // almond-ish
    eyes.push(eye);
  }

  // Whiskers: two thin paper slivers per side.
  const whiskers: THREE.Mesh[] = [];
  for (const side of [-1, 1] as const) {
    for (const tilt of [0.12, -0.08]) {
      const whisker = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.14, 4), whiskerMaterial));
      whisker.rotation.z = Math.PI / 2 + side * 0.2;
      whisker.rotation.y = tilt;
      whisker.position.set(side * 0.1, 0.43 + tilt * 0.1, -0.44);
      whiskers.push(whisker);
    }
  }

  const legs: THREE.Mesh[] = [];
  for (const [index, x] of [-0.08, 0.08, -0.08, 0.08].entries()) {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.2, 8), coat));
    leg.position.set(x, 0.1, index < 2 ? -0.2 : 0.2);
    legs.push(leg);
  }

  // Tail: segments arcing up with a curl at the tip, darker at the end.
  const tail = new THREE.Group();
  tail.position.set(0, 0.3, 0.32);
  const tailCurve = [0, 0.35, 0.7, 1.0, 1.2];
  tailCurve.forEach((bend, index) => {
    const segment = sphere(0.05 - index * 0.004, index === 4 ? dark : coat, 10, 8);
    segment.position.set(0, index * 0.085 + Math.sin(bend) * 0.02, index * 0.045 + bend * 0.03);
    tail.add(segment);
  });
  tail.rotation.x = 0.35;

  group.add(body, chest, ...legs, tail);
  const headGroup = makeHead(group, [0, 0.4, -0.3], [head, ...ears, nose, ...eyes, ...whiskers]);
  const headRestY = headGroup.position.y;

  const o = params.animOffset;
  let blinkHold = 0;
  return {
    group,
    flying: false,
    groundOffset: 0.03,
    parts: partsOf({ head: headGroup, body, tail, ears }),
    animate: (t, dt, moving, speedRatio, curious) => {
      // The tail is always talking.
      tail.rotation.z = Math.sin(t * (curious ? 3.4 : 1.6) + o) * (curious ? 0.3 : 0.14);
      tail.rotation.x = 0.35 + (curious ? 0.25 : Math.sin(t * 0.9 + o) * 0.06);
      legs.forEach((leg, index) => {
        leg.rotation.x = moving ? Math.sin(t * 10 + o + index * Math.PI) * 0.3 * speedRatio : 0;
      });
      body.rotation.z = moving ? Math.sin(t * 10 + o) * 0.04 * speedRatio : 0;
      // Whole-head tilt. Rotating the skull mesh alone would spin it inside
      // the ears, nose and whiskers — the bug this refactor exists to fix.
      headGroup.rotation.z = curious ? Math.sin(t * 0.7 + o) * 0.18 : 0;

      // The famous slow blink (a compliment, if you know cats).
      if (curious && Math.sin(t * 0.5 + o) > 0.92) {
        blinkHold = Math.min(blinkHold + dt * 2.2, 1);
      } else {
        blinkHold = Math.max(blinkHold - dt * 2.2, 0);
      }
      const quickBlink = !curious && Math.sin(t * 1.5 + o) > 0.975 ? 0.15 : 1;
      eyes.forEach((eye) => {
        eye.scale.y = curious ? 1.2 - blinkHold * 1.05 : 1.2 * quickBlink;
      });
    },
    flourish: (progress, t) => {
      // Sits up tall, wraps the tail around the front, closes its eyes.
      const sit = Math.sin(Math.min(progress * 1.2, 1) * Math.PI);
      body.rotation.x = -0.42 * sit;
      // Lift the whole head, offset from its pivot. Assigning an absolute
      // position to the skull mesh here is what launched the cat's head into
      // orbit while its ears, eyes and whiskers stayed behind.
      headGroup.position.y = headRestY + 0.06 * sit;
      tail.rotation.x = 0.35 + 0.5 * sit;
      tail.rotation.z = Math.sin(t * 1.4) * 0.08 + sit * 0.9;
      eyes.forEach((eye) => { eye.scale.y = 1.2 * (1 - sit * 0.9); });
      if (progress >= 1) {
        body.rotation.x = 0;
        headGroup.position.y = headRestY;
        tail.rotation.set(0.35, 0, 0);
        eyes.forEach((eye) => { eye.scale.y = 1.2; });
      }
    },
  };
}

function buildWoodchuck(params: CritterParams): CritterRig {
  const group = new THREE.Group();
  const coat = bodyMaterial(params);
  const dark = createColorMaterial('#30251e', 0.84);
  const cream = createColorMaterial(params.accentColor, 0.94);
  const toothPaper = createColorMaterial('#fff8df', 0.9);

  const body = sphere(0.34, coat, 24, 16);
  body.scale.set(1.12, 0.9, 0.9);
  body.position.set(0, 0.31, 0.04);
  const head = sphere(0.22, coat, 22, 15);
  head.scale.set(1.08, 0.92, 0.98);
  head.position.set(0, 0.52, -0.31);
  const muzzle = sphere(0.12, cream, 16, 10);
  muzzle.scale.set(1.18, 0.72, 0.78);
  muzzle.position.set(0, 0.46, -0.49);
  const nose = sphere(0.038, dark, 10, 7);
  nose.position.set(0, 0.49, -0.59);

  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.078, 0.078]) {
    const eye = sphere(0.025, dark, 10, 7);
    eye.position.set(x, 0.57, -0.49);
    eyes.push(eye);
  }
  const teeth: THREE.Mesh[] = [];
  for (const x of [-0.027, 0.027]) {
    const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.046, 0.09, 0.025), toothPaper);
    tooth.position.set(x, 0.405, -0.595);
    teeth.push(tooth);
  }
  const ears: THREE.Mesh[] = [];
  for (const x of [-0.14, 0.14]) {
    const ear = sphere(0.065, coat, 12, 8);
    ear.scale.set(0.75, 1, 0.55);
    ear.position.set(x, 0.68, -0.26);
    ears.push(ear);
  }

  const paws: THREE.Mesh[] = [];
  for (const x of [-0.14, 0.14]) {
    const paw = sphere(0.065, dark, 10, 7);
    paw.scale.set(1.1, 0.55, 1.25);
    paw.position.set(x, 0.12, -0.25);
    paws.push(paw);
  }
  const tail = sphere(0.15, coat, 14, 9);
  tail.scale.set(0.72, 0.38, 1.45);
  tail.position.set(0, 0.19, 0.39);
  tail.rotation.x = -0.18;
  group.add(body, ...paws, tail);
  const headGroup = makeHead(group, [0, 0.44, -0.24], [head, muzzle, nose, ...eyes, ...teeth, ...ears]);

  const o = params.animOffset;
  return {
    group,
    flying: false,
    groundOffset: 0.035,
    parts: partsOf({ head: headGroup, body, tail, ears }),
    animate: (t, _dt, moving, speedRatio, _curious) => {
      body.rotation.z = moving ? Math.sin(t * 7 + o) * 0.08 * speedRatio : 0;
      tail.rotation.z = Math.sin(t * 2.1 + o) * 0.08;
      paws.forEach((paw, index) => {
        paw.position.z = -0.25 + (moving ? Math.sin(t * 9 + o + index * Math.PI) * 0.08 : 0);
      });
      const blink = Math.sin(t * 1.25 + o) > 0.97 ? 0.2 : 1;
      eyes.forEach((eye) => { eye.scale.y = blink; });
    },
    flourish: (progress, t) => {
      const proud = Math.sin(progress * Math.PI);
      body.rotation.x = -0.34 * proud;
      headGroup.rotation.x = -0.3 * proud;
      paws[0].position.x = -0.05 + Math.sin(t * 12) * 0.025 * proud;
      paws[1].position.x = 0.05 - Math.sin(t * 12) * 0.025 * proud;
      if (progress >= 1) {
        body.rotation.x = 0;
        // Reset the head *group*'s rotation; the skull mesh inside it must
        // never be positioned directly.
        headGroup.rotation.x = 0;
        paws[0].position.x = -0.14;
        paws[1].position.x = 0.14;
      }
    },
  };
}

function buildFox(params: CritterParams): CritterRig {
  const group = new THREE.Group();
  const coat = bodyMaterial(params);
  const dark = createColorMaterial(params.accentColor, 0.85);
  const cream = createColorMaterial('#f6ecd8', 0.94);

  // Torso pivots so the fox can tuck down into its curl-up flourish — the
  // same articulation the raccoon uses to sit up, aimed the other way.
  const torso = new THREE.Group();
  torso.position.set(0, 0.16, 0.02);

  // A capsule keeps a straight-sided barrel through the body's length no
  // matter how it's scaled, which is what reads sleek and lean rather than
  // round like the raccoon's stretched sphere.
  const body = capsule(0.12, 0.3, coat, 6, 14);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1, 0.9, 1.05);
  body.position.set(0, 0.13, 0);

  const chest = sphere(0.1, cream, 14, 10);
  chest.scale.set(0.85, 0.7, 0.42);
  chest.position.set(0, 0.08, -0.15);

  const head = sphere(0.145, coat, 20, 14);
  head.scale.set(0.95, 0.88, 0.92);
  head.position.set(0, 0.34, -0.28);

  // A long, pointed snout — the single most fox-specific silhouette cue.
  const muzzle = sphere(0.075, coat, 14, 10);
  muzzle.scale.set(0.85, 0.62, 1.55);
  muzzle.position.set(0, 0.29, -0.45);

  const muzzleTip = sphere(0.042, cream, 10, 8);
  muzzleTip.scale.set(0.9, 0.58, 1);
  muzzleTip.position.set(0, 0.255, -0.47);

  const nose = sphere(0.027, dark, 8, 6);
  nose.position.set(0, 0.275, -0.54);

  const eyes: THREE.Mesh[] = [];
  for (const x of [-0.06, 0.06]) {
    const eye = sphere(0.022, dark, 10, 7);
    eye.scale.set(1, 0.68, 0.6);
    eye.position.set(x, 0.375, -0.41);
    eyes.push(eye);
  }

  // Tall, sharply pointed ears with a dark inner patch.
  const ears: THREE.Mesh[] = [];
  for (const x of [-0.09, 0.09]) {
    const ear = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.052, 0.15, 4), coat));
    ear.position.set(x, 0.47, -0.28);
    ear.rotation.z = x < 0 ? 0.16 : -0.16;
    const inner = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 4), dark));
    inner.position.set(x, 0.455, -0.26);
    inner.rotation.z = ear.rotation.z;
    ears.push(ear, inner);
  }

  torso.add(body, chest);
  const headGroup = makeHead(torso, [0, 0.32, -0.22], [head, muzzle, muzzleTip, nose, ...eyes, ...ears]);

  // Slim black-socked legs — no separate paws; a fox's flourish is a
  // whole-body curl, not a hand gesture.
  const legs: THREE.Mesh[] = [];
  for (const [index, x] of [-0.09, 0.09, -0.08, 0.08].entries()) {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.24, 8), dark));
    leg.position.set(x, 0.1, index < 2 ? -0.14 : 0.14);
    legs.push(leg);
  }

  // A long, low tail — the last two segments switch to the cream paper so
  // it ends in the white tip a curled-up fox tucks its nose against.
  const tail = new THREE.Group();
  tail.position.set(0, 0.2, 0.28);
  const tailSegments = 5;
  for (let index = 0; index < tailSegments; index += 1) {
    const isTip = index >= tailSegments - 2;
    const segment = sphere(0.1 - index * 0.01, isTip ? cream : coat, 14, 10);
    segment.scale.set(0.82, 0.78, 1.05);
    segment.position.set(0, index * 0.045, index * 0.11);
    tail.add(segment);
  }
  const tailRestX = 0.32;
  tail.rotation.x = tailRestX;

  group.add(torso, ...legs, tail);

  const o = params.animOffset;
  return {
    group,
    parts: partsOf({ head: headGroup, body: torso, tail, ears }),
    flying: false,
    groundOffset: 0.032,
    animate: (t, _dt, moving, speedRatio, curious) => {
      // A quick, low trot — legs sweep faster than the raccoon's waddle.
      torso.rotation.z = moving ? Math.sin(t * 9 + o) * 0.05 * speedRatio : 0;
      legs.forEach((leg, index) => {
        leg.rotation.x = moving ? Math.sin(t * 13 + o + index * Math.PI) * 0.32 * speedRatio : 0;
      });
      tail.rotation.z = Math.sin(t * (moving ? 7 : 2.2) + o) * (moving ? 0.14 : 0.06);
      // A slight forward lean when something interesting is nearby; head
      // pose itself belongs to the idle action system.
      const alert = curious ? 1 : 0;
      torso.rotation.x = THREE.MathUtils.lerp(torso.rotation.x, -0.08 * alert, 0.1);
      const blink = Math.sin(t * 1.6 + o) > 0.97 ? 0.2 : 1;
      eyes.forEach((eye) => { eye.scale.y = 0.68 * blink; });
    },
    flourish: (progress, t) => {
      // Curls into a ball and sweeps its tail up over its nose — a fox's
      // sleeping pose, deliberately distinct from the cat's tail-wrap.
      const curl = Math.sin(progress * Math.PI);
      torso.rotation.x = 0.4 * curl;
      headGroup.rotation.x = 0.3 * curl;
      tail.rotation.x = tailRestX + 1.3 * curl;
      tail.rotation.y = Math.sin(t * 6) * 0.05 * curl;
      if (progress >= 1) {
        torso.rotation.x = 0;
        headGroup.rotation.x = 0;
        tail.rotation.x = tailRestX;
        tail.rotation.y = 0;
      }
    },
  };
}

// --- Jungle critters: toucan, sloth, monkey ---------------------------------
//
// All three spend most of their lives in the canopy (see critterCanopy.ts),
// which orients the whole group — upside down to hang, pitched up to climb.
// The rigs only pose their own limbs for each `CanopyPose`; the pose is set
// by the behavior layer through `setPose`, and `animate` reads it every
// frame, so a pose is never half-applied.

/** A limb that swings from its shoulder or hip rather than its middle. */
function limb(
  pivot: [number, number, number],
  radius: number,
  length: number,
  material: THREE.Material,
): { pivot: THREE.Group; end: number } {
  const group = new THREE.Group();
  group.position.set(...pivot);
  const bone = capsule(radius, length, material, 5, 10);
  bone.position.y = -(length / 2 + radius);
  group.add(bone);
  return { pivot: group, end: -(length + radius * 2) };
}

/** Three small curved claws at the end of a limb. */
function claws(parent: THREE.Group, y: number, material: THREE.Material) {
  for (const x of [-0.018, 0, 0.018]) {
    const claw = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.05, 5), material));
    claw.position.set(x, y - 0.012, -0.012);
    claw.rotation.x = -Math.PI / 2 + 0.55;
    parent.add(claw);
  }
}

/**
 * Toucan. The parrot's skeleton with the one cue that matters: an enormous
 * banana beak, plus the black body, sunny bib, and blue eye ring.
 *
 * Coat convention for this species only: `bodyColor` is the (mostly black)
 * body, `accentColor` is the beak, and a coat's paper texture — when there is
 * one — goes on the *beak* rather than the body. A keel-billed toucan's
 * rainbow bill is the whole point of the animal.
 */
function buildToucan(params: CritterParams): CritterRig {
  const group = new THREE.Group();
  const coat = createColorMaterial(params.bodyColor, 0.88);
  const dark = createColorMaterial('#141110', 0.85);
  const bib = createColorMaterial('#f6d64a', 0.9);
  const eyeRing = createColorMaterial('#57b7de', 0.8);
  const beakMaterial = params.bodyTextureUrl
    ? getPaperMaterialByUrl(params.bodyTextureUrl, [0.8, 0.8])
    : createColorMaterial(params.accentColor, 0.7);
  const beakTip = createColorMaterial('#1a1411', 0.8);
  const berryMaterial = createColorMaterial('#e0463c', 0.75);
  const feet = createColorMaterial('#5d7fa3', 0.85);

  const body = sphere(0.17, coat, 20, 14);
  body.scale.set(0.92, 1, 1.2);
  body.position.y = 0.2;

  const chest = sphere(0.1, bib, 16, 10);
  chest.scale.set(0.95, 0.9, 0.45);
  chest.position.set(0, 0.27, -0.13);

  const undertail = sphere(0.05, createColorMaterial('#d8413a', 0.85), 10, 8);
  undertail.position.set(0, 0.11, 0.17);

  const head = sphere(0.11, coat, 18, 12);
  head.position.set(0, 0.37, -0.08);

  // Cylinder axis is +Y; tipping it forward points the narrow end at -Z,
  // then a slight droop gives the bill its downward curve.
  // Scaled thin side-to-side and deep top-to-bottom (local Z becomes world
  // up once tipped forward) — a toucan bill is a tall, narrow blade, not a
  // round cone.
  const beakUpper = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.075, 0.36, 14), beakMaterial));
  beakUpper.rotation.x = -Math.PI / 2 + 0.18;
  beakUpper.position.set(0, 0.37, -0.27);
  beakUpper.scale.set(0.7, 1, 1.45);
  const beakLower = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.32, 12), beakMaterial));
  beakLower.rotation.x = -Math.PI / 2 + 0.26;
  beakLower.position.set(0, 0.315, -0.255);
  beakLower.scale.set(0.68, 1, 1.2);
  const tip = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.07, 10), beakTip));
  tip.rotation.x = -Math.PI / 2 + 0.3;
  tip.scale.set(0.7, 1, 1.4);
  tip.position.set(0, 0.325, -0.47);

  const eyes: THREE.Mesh[] = [];
  const rings: THREE.Mesh[] = [];
  for (const x of [-0.068, 0.068]) {
    const ring = sphere(0.032, eyeRing, 10, 8);
    ring.scale.set(0.45, 1, 1);
    ring.position.set(x, 0.39, -0.12);
    const eye = sphere(0.016, dark, 8, 6);
    eye.position.set(x * 1.12, 0.39, -0.125);
    rings.push(ring);
    eyes.push(eye);
  }

  const wings: THREE.Mesh[] = [];
  for (const side of [-1, 1] as const) {
    const wing = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.15), coat));
    wing.position.set(side * 0.155, 0.22, 0.02);
    wing.rotation.z = side * 0.5;
    wing.rotation.y = side * 0.25;
    wings.push(wing);
  }

  // Folded tail, rooted inside the body like the other birds' — a toucan
  // perched on a branch lets its tail hang down and back under the bench.
  const tail = new THREE.Group();
  tail.position.set(0, 0.26, 0.1);
  const TAIL_SWEEP = -1.05;
  tail.add(
    feather(0.3, 0.13, coat, TAIL_SWEEP, -0.25, -0.4),
    feather(0.28, 0.12, coat, TAIL_SWEEP, 0),
    feather(0.3, 0.13, coat, TAIL_SWEEP, 0.25, 0.4),
  );

  const legs: THREE.Mesh[] = [];
  for (const x of [-0.05, 0.05]) {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.1, 6), feet));
    leg.position.set(x, 0.05, 0);
    legs.push(leg);
  }

  // The flourish berry lives outside the head group, so tossing it can never
  // move a face part (critterRigs.test enforces that).
  const berry = sphere(0.032, berryMaterial, 10, 8);
  berry.visible = false;

  group.add(body, chest, undertail, ...wings, tail, ...legs, berry);
  const headGroup = makeHead(group, [0, 0.32, -0.05], [head, beakUpper, beakLower, tip, ...rings, ...eyes]);
  const headRest = headGroup.position.clone();

  let pose: CanopyPose = 'ground';
  const o = params.animOffset;
  return {
    group,
    flying: false,
    groundOffset: 0.02,
    parts: partsOf({ head: headGroup, body, tail }),
    setPose: (next) => { pose = next; },
    animate: (t, _dt, moving, speedRatio, curious) => {
      const flying = pose === 'fly';
      if (flying || moving) {
        // Toucans flap in short bursts and glide; a hop on the ground is a
        // quick wing-flick rather than full flight.
        const burst = flying ? (Math.sin(t * 2.4 + o) > -0.2 ? 1 : 0.15) : 0.5;
        wings.forEach((wing, index) => {
          const side = index === 0 ? -1 : 1;
          const spread = flying ? 1.05 : 0.5;
          wing.rotation.z = side * (spread + Math.sin(t * 13 + o) * 0.55 * burst * Math.max(0.4, speedRatio));
        });
        legs.forEach((leg) => { leg.rotation.x = flying ? 0.9 : 0; });
        headGroup.position.copy(headRest);
        headGroup.rotation.x = 0;
        headGroup.rotation.y = 0;
      } else {
        wings.forEach((wing, index) => { wing.rotation.z = (index === 0 ? -1 : 1) * 0.5; });
        legs.forEach((leg) => { leg.rotation.x = 0; });
        // The toucan idle: a slow side-to-side bill swing, like it is
        // aiming that enormous thing at something only it can see.
        headGroup.position.copy(headRest);
        headGroup.rotation.y = Math.sin(t * 0.9 + o) * 0.35;
      }
      if (curious) headGroup.rotation.z = Math.sin(t * 1.4 + o) > 0 ? 0.38 : -0.38;
      tail.rotation.x = Math.sin(t * 2.1 + o) * 0.12;
    },
    flourish: (progress, t) => {
      // The berry toss: a flick of the bill, the berry arcs up, and is
      // caught again on the way down.
      const toss = Math.sin(Math.min(1, progress * 1.6) * Math.PI);
      headGroup.rotation.x = -0.7 * toss;
      berry.visible = progress > 0.08 && progress < 0.9;
      const flight = THREE.MathUtils.clamp((progress - 0.08) / 0.82, 0, 1);
      berry.position.set(Math.sin(t * 3) * 0.01, 0.4 + Math.sin(flight * Math.PI) * 0.55, -0.42 + flight * 0.2);
      wings.forEach((wing, index) => {
        const side = index === 0 ? -1 : 1;
        wing.rotation.z = side * (0.5 + 0.35 * Math.sin(progress * Math.PI));
      });
      if (progress >= 1) {
        headGroup.rotation.x = 0;
        berry.visible = false;
      }
    },
  };
}

/**
 * Sloth. Round, shaggy, long-armed, with the famous face: a pale mask, dark
 * stripes sloping away from the eyes, and a small permanent smile.
 *
 * Built as a low quadruped facing -Z with its feet at the origin, like
 * everyone else — so hanging is simply the canopy layer rolling the whole
 * animal upside down, which puts all four hooked feet on the branch and the
 * body underneath. The neck then turns the face back the right way up.
 */
function buildSloth(params: CritterParams): CritterRig {
  const group = new THREE.Group();
  const coat = bodyMaterial(params, [1.3, 1.3]);
  const face = createColorMaterial(params.accentColor, 0.92);
  const dark = createColorMaterial('#2b211a', 0.85);
  const clawMaterial = createColorMaterial('#efe6cf', 0.8);

  const torso = new THREE.Group();
  torso.position.set(0, 0.2, 0.02);
  const body = capsule(0.15, 0.2, coat, 6, 14);
  body.rotation.x = Math.PI / 2;
  body.scale.set(1.08, 0.94, 1);
  torso.add(body);
  // A shaggy fringe along the back: a few overlapping flattened spheres.
  for (const [index, z] of [-0.1, 0.02, 0.14].entries()) {
    const tuft = sphere(0.09, coat, 10, 8);
    tuft.scale.set(1.25, 0.45, 0.8);
    tuft.position.set(0, 0.12 - index * 0.005, z);
    torso.add(tuft);
  }

  // Everything on the face is authored in group space, then re-expressed
  // relative to the neck, which is the thing that flips when hanging.
  const neckPosition = new THREE.Vector3(0, 0.28, -0.17);
  const neck = new THREE.Group();
  neck.position.copy(neckPosition);

  const skull = sphere(0.13, coat, 18, 12);
  skull.position.set(0, 0.3, -0.28);
  const mask = sphere(0.105, face, 16, 12);
  mask.scale.set(1.05, 0.88, 0.42);
  mask.position.set(0, 0.29, -0.37);
  const stripes: THREE.Mesh[] = [];
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1] as const) {
    const stripe = sphere(0.03, dark, 10, 8);
    stripe.scale.set(1.7, 0.72, 0.5);
    stripe.rotation.z = side * -0.5;
    stripe.position.set(side * 0.05, 0.3, -0.408);
    stripes.push(stripe);
    const eye = sphere(0.011, createColorMaterial('#0c0a09', 0.7), 8, 6);
    eye.position.set(side * 0.04, 0.308, -0.425);
    eyes.push(eye);
  }
  const nose = sphere(0.022, dark, 8, 6);
  nose.scale.set(1.3, 0.85, 0.8);
  nose.position.set(0, 0.272, -0.43);
  // The smile: the lower half of a thin torus.
  const smile = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 6, 14, Math.PI), dark));
  smile.rotation.z = Math.PI;
  smile.position.set(0, 0.258, -0.418);

  const faceParts = [skull, mask, ...stripes, ...eyes, nose, smile];
  for (const part of faceParts) part.position.sub(neckPosition);
  group.add(neck);
  const headGroup = makeHead(neck, [0, 0, 0], faceParts);

  // Long, hooked limbs — the arms noticeably longer than the legs.
  const limbs = [
    { pivot: [-0.13, 0.26, -0.12], length: 0.2, front: true, side: -1 },
    { pivot: [0.13, 0.26, -0.12], length: 0.2, front: true, side: 1 },
    { pivot: [-0.12, 0.24, 0.15], length: 0.16, front: false, side: -1 },
    { pivot: [0.12, 0.24, 0.15], length: 0.16, front: false, side: 1 },
  ].map((spec, index) => {
    const { pivot, end } = limb(spec.pivot as [number, number, number], 0.036, spec.length, coat);
    claws(pivot, end, clawMaterial);
    return { ...spec, pivot, phase: index * (Math.PI / 2) };
  });

  const tail = sphere(0.045, coat, 8, 6);
  tail.position.set(0, 0.2, 0.24);

  group.add(torso, ...limbs.map((entry) => entry.pivot), tail);

  let pose: CanopyPose = 'ground';
  const o = params.animOffset;
  return {
    group,
    flying: false,
    groundOffset: 0.03,
    parts: partsOf({ head: headGroup, body: torso, tail }),
    setPose: (next) => { pose = next; },
    animate: (t, _dt, moving, speedRatio) => {
      // Everything a sloth does, it does at about a fifth of the speed.
      const beat = t * (pose === 'climb' ? 2.2 : 1.7) + o;
      limbs.forEach((entry) => {
        const reach = moving ? Math.sin(beat + entry.phase) * speedRatio : 0;
        if (pose === 'hang') {
          // Feet up on the branch, arms pulling hand over hand.
          entry.pivot.rotation.x = reach * 0.45;
          entry.pivot.rotation.z = entry.side * 0.12;
        } else if (pose === 'climb') {
          // Hugging the trunk: limbs splayed wide, reaching up in turn.
          entry.pivot.rotation.x = 0.35 + reach * 0.55;
          entry.pivot.rotation.z = entry.side * 0.62;
        } else {
          // A slow, sprawling crawl on the ground.
          entry.pivot.rotation.x = reach * 0.35;
          entry.pivot.rotation.z = entry.side * 0.3;
        }
      });
      // Hanging upside down, the neck turns the face back upright — the
      // unmistakable upside-down sloth gaze.
      const targetFlip = pose === 'hang' ? Math.PI : 0;
      neck.rotation.z += (targetFlip - neck.rotation.z) * 0.08;
      neck.rotation.x = pose === 'climb' ? -0.5 : 0;
      torso.rotation.z = moving ? Math.sin(beat) * 0.04 : 0;
      // Slow, heavy blinks.
      const blink = Math.sin(t * 0.7 + o) > 0.93 ? 0.25 : 1;
      eyes.forEach((eye) => { eye.scale.y = blink; });
    },
    flourish: (progress, t) => {
      // A very slow wave with one long arm — and a little extra smile.
      const wave = Math.sin(progress * Math.PI);
      const arm = limbs[1].pivot;
      arm.rotation.x = 2.1 * wave;
      arm.rotation.z = 0.3 + Math.sin(t * 2.2) * 0.35 * wave;
      smile.scale.set(1 + wave * 0.35, 1 + wave * 0.35, 1);
      if (progress >= 1) {
        arm.rotation.set(0, 0, 0);
        smile.scale.set(1, 1, 1);
      }
    },
  };
}

/**
 * Monkey. Big round ears, a pale face and belly, long arms, and a curly tail.
 * Sits on branches, swings from them one-handed, knuckle-walks on the
 * ground, and its flourish is a backflip.
 */
function buildMonkey(params: CritterParams): CritterRig {
  const group = new THREE.Group();
  const coat = bodyMaterial(params, [1.2, 1.2]);
  const face = createColorMaterial(params.accentColor, 0.9);
  const dark = createColorMaterial('#221a15', 0.85);

  // Flips spin around the middle of the body, not the feet: `spin` sits at
  // body height and `content` hangs everything back down to the origin.
  const spin = new THREE.Group();
  spin.position.set(0, 0.3, 0);
  const content = new THREE.Group();
  content.position.set(0, -0.3, 0);
  spin.add(content);
  group.add(spin);

  const torso = new THREE.Group();
  torso.position.set(0, 0.24, 0);
  const body = capsule(0.11, 0.13, coat, 6, 14);
  body.scale.set(1, 1, 0.9);
  body.position.y = 0.08;
  const belly = sphere(0.085, face, 14, 10);
  belly.scale.set(0.85, 1.1, 0.42);
  belly.position.set(0, 0.07, -0.075);
  torso.add(body, belly);

  const skull = sphere(0.12, coat, 18, 12);
  skull.position.set(0, 0.5, -0.06);
  const faceDisc = sphere(0.088, face, 16, 12);
  faceDisc.scale.set(1.1, 0.95, 0.5);
  faceDisc.position.set(0, 0.49, -0.14);
  const muzzle = sphere(0.052, face, 12, 10);
  muzzle.scale.set(1.25, 0.8, 0.85);
  muzzle.position.set(0, 0.45, -0.18);
  const nostrils: THREE.Mesh[] = [];
  const eyes: THREE.Mesh[] = [];
  const ears: THREE.Object3D[] = [];
  for (const side of [-1, 1] as const) {
    const nostril = sphere(0.009, dark, 6, 5);
    nostril.position.set(side * 0.015, 0.458, -0.225);
    nostrils.push(nostril);
    const eye = sphere(0.018, dark, 8, 6);
    eye.position.set(side * 0.036, 0.51, -0.19);
    eyes.push(eye);
    // Round cupped ears: a coat disc with a pale inner disc.
    const ear = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.018, 14), coat));
    ear.rotation.z = Math.PI / 2;
    ear.rotation.y = side * 0.35;
    ear.position.set(side * 0.125, 0.51, -0.05);
    const inner = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.02, 12), face));
    inner.rotation.copy(ear.rotation);
    inner.position.set(side * 0.13, 0.51, -0.056);
    ears.push(ear, inner);
  }
  const mouth = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.004, 5, 10, Math.PI), dark));
  mouth.rotation.z = Math.PI;
  mouth.position.set(0, 0.432, -0.215);

  content.add(torso);
  const headGroup = makeHead(content, [0, 0.42, -0.05], [skull, faceDisc, muzzle, mouth, ...nostrils, ...eyes, ...ears]);

  const arms = [-1, 1].map((side) => {
    const { pivot, end } = limb([side * 0.115, 0.37, -0.03], 0.028, 0.25, coat);
    const hand = sphere(0.034, face, 10, 8);
    hand.position.y = end;
    pivot.add(hand);
    content.add(pivot);
    return { pivot, side };
  });
  const legs = [-1, 1].map((side) => {
    const { pivot, end } = limb([side * 0.07, 0.22, 0.04], 0.03, 0.13, coat);
    const foot = sphere(0.034, face, 10, 8);
    foot.scale.set(1, 0.6, 1.4);
    foot.position.set(0, end + 0.01, -0.02);
    pivot.add(foot);
    content.add(pivot);
    return { pivot, side };
  });

  // The curly tail, as one tube along a spiral.
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -0.02, 0.16),
    new THREE.Vector3(0, 0.08, 0.3),
    new THREE.Vector3(0, 0.24, 0.32),
    new THREE.Vector3(0, 0.3, 0.22),
    new THREE.Vector3(0, 0.24, 0.16),
    new THREE.Vector3(0, 0.18, 0.21),
  ]);
  const tail = new THREE.Group();
  tail.position.set(0, 0.24, 0.08);
  tail.add(shadowed(new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 40, 0.017, 6, false), coat)));
  content.add(tail);

  let pose: CanopyPose = 'ground';
  const o = params.animOffset;
  return {
    group,
    flying: false,
    groundOffset: 0.03,
    parts: partsOf({ head: headGroup, body: torso, tail, ears }),
    setPose: (next) => { pose = next; },
    animate: (t, _dt, moving, speedRatio, curious) => {
      const beat = t * 11 + o;
      const swing = moving ? speedRatio : 0;
      switch (pose) {
        case 'sit': {
          // On a branch: legs dangling over the front, tail hanging down.
          torso.rotation.x = 0;
          legs.forEach((leg, index) => {
            leg.pivot.rotation.x = 1.35 + Math.sin(t * 1.7 + o + index * 1.9) * 0.18;
          });
          arms.forEach((arm) => { arm.pivot.rotation.x = 0.45; arm.pivot.rotation.z = arm.side * 0.12; });
          tail.rotation.x = 1.4 + Math.sin(t * 1.3 + o) * 0.15;
          break;
        }
        case 'swing':
        case 'hang': {
          // Hanging one-handed; travelling, the arms go hand over hand.
          torso.rotation.x = 0;
          arms.forEach((arm, index) => {
            const lead = moving ? Math.max(0, Math.sin(t * 6 + o + index * Math.PI)) : index === 1 ? 1 : 0.1;
            arm.pivot.rotation.x = Math.PI * (0.35 + 0.65 * lead);
            arm.pivot.rotation.z = arm.side * 0.1;
          });
          legs.forEach((leg, index) => { leg.pivot.rotation.x = 0.4 + Math.sin(t * 3 + index) * 0.2; });
          tail.rotation.x = 0.9 + Math.sin(t * 2 + o) * 0.2;
          break;
        }
        case 'climb': {
          torso.rotation.x = 0;
          arms.forEach((arm, index) => {
            arm.pivot.rotation.x = 2.2 + Math.sin(t * 9 + o + index * Math.PI) * 0.6 * swing;
            arm.pivot.rotation.z = arm.side * 0.35;
          });
          legs.forEach((leg, index) => {
            leg.pivot.rotation.x = 0.9 + Math.sin(t * 9 + o + index * Math.PI + 1) * 0.5 * swing;
          });
          tail.rotation.x = 0.8;
          break;
        }
        case 'fly': {
          // Mid-leap: arms flung forward to grab, legs trailing.
          torso.rotation.x = -0.2;
          arms.forEach((arm) => { arm.pivot.rotation.x = 2.5; arm.pivot.rotation.z = arm.side * 0.4; });
          legs.forEach((leg) => { leg.pivot.rotation.x = -0.6; });
          tail.rotation.x = -0.2;
          break;
        }
        default: {
          // Knuckle-walking: leaning forward, long arms reaching the ground.
          torso.rotation.x = -0.35;
          arms.forEach((arm, index) => {
            arm.pivot.rotation.x = 0.25 + Math.sin(beat + index * Math.PI) * 0.5 * swing;
            arm.pivot.rotation.z = arm.side * 0.08;
          });
          legs.forEach((leg, index) => {
            leg.pivot.rotation.x = Math.sin(beat + index * Math.PI + Math.PI / 2) * 0.55 * swing;
          });
          tail.rotation.x = 0;
        }
      }
      tail.rotation.z = Math.sin(t * 2.3 + o) * 0.18;
      if (curious && pose !== 'fly') {
        // A quick, nosy bob.
        headGroup.rotation.z = Math.sin(t * 3.1 + o) * 0.18;
      }
      const blink = Math.sin(t * 2.1 + o) > 0.96 ? 0.2 : 1;
      eyes.forEach((eye) => { eye.scale.y = blink; });
    },
    flourish: (progress) => {
      // A backflip, spun round the middle of the body, with a little hop.
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
      spin.rotation.x = -Math.PI * 2 * eased;
      spin.position.y = 0.3 + Math.sin(progress * Math.PI) * 0.45;
      arms.forEach((arm) => { arm.pivot.rotation.x = 2.6 * Math.sin(progress * Math.PI); });
      if (progress >= 1) {
        spin.rotation.x = 0;
        spin.position.y = 0.3;
      }
    },
  };
}

const BUILDERS: Record<CritterSpecies, (params: CritterParams) => CritterRig> = {
  squirrel: buildSquirrel,
  butterfly: buildButterfly,
  raccoon: buildRaccoon,
  bunny: buildBunny,
  bird: buildBird,
  cat: buildCat,
  woodchuck: buildWoodchuck,
  meerkat: buildMeerkat,
  fox: buildFox,
  parrot: buildParrot,
  toucan: buildToucan,
  sloth: buildSloth,
  monkey: buildMonkey,
};

export function buildCritterRig(species: CritterSpecies, params: CritterParams): CritterRig {
  const rig = BUILDERS[species](params);
  rig.group.scale.setScalar(params.scale);
  return rig;
}
