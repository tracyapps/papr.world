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

export type CritterRig = {
  group: THREE.Group;
  flying: boolean;
  hopper: boolean;
  /** Rest height of the group origin above the terrain. */
  groundOffset: number;
  /** Hop arc height for hoppers. */
  hopHeight: number;
  /** Poseable handles for shared idle actions (see game/critterIdle.ts). */
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
    hopper: false,
    groundOffset: 0.03,
    hopHeight: 0,
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
    hopper: false,
    groundOffset: 1.46,
    hopHeight: 0,
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
    hopper: false,
    groundOffset: 0.03,
    hopHeight: 0,
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
    ears.push(ear);
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
    hopper: false,
    groundOffset: 0.155,
    hopHeight: 0,
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
    hopper: true,
    groundOffset: 0.02,
    hopHeight: 0.2,
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

  const tailFan = shadowed(new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.16), coat));
  tailFan.position.set(0, 0.2, 0.22);
  tailFan.rotation.x = 0.6;

  const legs: THREE.Mesh[] = [];
  for (const x of [-0.05, 0.05]) {
    const leg = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), dark));
    leg.position.set(x, 0.05, 0);
    legs.push(leg);
  }

  group.add(body, ...wings, tailFan, ...legs);
  const headGroup = makeHead(group, [0, 0.28, -0.06], [head, beak, ...eyes]);
  const headRest = headGroup.position.clone();

  const o = params.animOffset;
  return {
    group,
    flying: false,
    hopper: true,
    groundOffset: 0.02,
    hopHeight: 0.12,
    parts: partsOf({ head: headGroup, body, tail: tailFan }),
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
      tailFan.rotation.x = 0.6 + Math.sin(t * 3.2 + o) * 0.1;
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
    hopper: false,
    groundOffset: 0.03,
    hopHeight: 0,
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
    hopper: false,
    groundOffset: 0.035,
    hopHeight: 0,
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

const BUILDERS: Record<CritterSpecies, (params: CritterParams) => CritterRig> = {
  squirrel: buildSquirrel,
  butterfly: buildButterfly,
  raccoon: buildRaccoon,
  bunny: buildBunny,
  bird: buildBird,
  cat: buildCat,
  woodchuck: buildWoodchuck,
  meerkat: buildMeerkat,
};

export function buildCritterRig(species: CritterSpecies, params: CritterParams): CritterRig {
  const rig = BUILDERS[species](params);
  rig.group.scale.setScalar(params.scale);
  return rig;
}
