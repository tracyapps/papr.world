import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// The rigs reach the renderer context transitively (critterRigs → builders →
// context), which grabs the canvas from `document` at module load. These
// tests are pure geometry maths and need no DOM, so stub the one thing the
// render modules actually import: the texture loader.
vi.mock('../render/context', () => ({
  textureLoader: {
    load: () => new THREE.Texture(),
  },
}));

const { buildCritterRig } = await import('./critterRigs');
const { generateCritterParams } = await import('./critterVariation');
type CritterSpecies = import('./critterVariation').CritterSpecies;

// Rig structural invariants.
//
// These exist because of a specific, embarrassing failure: after head groups
// were introduced, the cat's and woodchuck's `flourish` still assigned an
// absolute Y to the *skull mesh* inside the new group. The skull's local
// position had shifted by the pivot, so the old literal launched the cat's
// head about 0.4 units into the air, leaving its ears, eyes, nose and
// whiskers behind. Worse, the `progress >= 1` branch wrote the same bad value
// as a "reset", so one flourish broke the cat permanently.
//
// The rule these tests enforce: all head motion happens on the head GROUP.
// Nothing inside it ever moves.

const SPECIES: CritterSpecies[] = [
  'squirrel', 'butterfly', 'raccoon', 'bunny', 'bird', 'cat', 'woodchuck', 'meerkat', 'fox',
  'parrot', 'toucan', 'sloth', 'monkey',
];

function snapshotLocalPositions(root: THREE.Object3D) {
  const positions = new Map<THREE.Object3D, THREE.Vector3>();
  root.traverse((child) => {
    if (child !== root) positions.set(child, child.position.clone());
  });
  return positions;
}

/** Drive a rig through every animation path it has. */
function exercise(rig: ReturnType<typeof buildCritterRig>) {
  // Tree-dwellers run every animation path in every canopy pose too.
  for (const pose of ['sit', 'hang', 'swing', 'climb', 'fly', 'ground'] as const) {
    rig.setPose?.(pose);
    for (let step = 0; step <= 6; step += 1) {
      rig.animate(step * 0.41, 1 / 60, step % 2 === 0, 1, step % 3 === 0);
    }
  }
  for (let step = 0; step <= 20; step += 1) {
    const t = step * 0.37;
    rig.animate(t, 1 / 60, false, 0, false);
    rig.animate(t, 1 / 60, false, 0, true);
    rig.animate(t, 1 / 60, true, 1, false);
    rig.flourish(step / 20, t);
  }
  // Land exactly on the completion branch, where the bad resets lived.
  rig.flourish(1, 7.5);
}

describe.each(SPECIES)('%s rig', (species) => {
  const params = generateCritterParams(species, 12345);

  it('never moves anything inside the head group', () => {
    const rig = buildCritterRig(species, params);
    const head = rig.parts.head;
    if (!head) return; // Flyers without a head group are exempt.

    const before = snapshotLocalPositions(head);
    exercise(rig);

    for (const [child, position] of before) {
      expect(
        child.position.distanceTo(position),
        'a face part moved independently of its head group',
      ).toBeLessThan(1e-6);
    }
  });

  it('returns the head group to its rest pose after a flourish', () => {
    const rig = buildCritterRig(species, params);
    const head = rig.parts.head;
    if (!head) return;

    const restPosition = head.position.clone();
    exercise(rig);

    // A completed flourish must leave the head where it started, or the
    // displacement accumulates every time the critter is petted.
    expect(head.position.distanceTo(restPosition)).toBeLessThan(1e-6);
  });

  it('keeps every face part close to its head pivot', () => {
    // A sanity net for the pivot itself: if a pivot is authored far from the
    // skull, head rotation swings the face around on a long arm.
    const rig = buildCritterRig(species, params);
    const head = rig.parts.head;
    if (!head) return;

    head.traverse((child) => {
      if (child === head) return;
      expect(child.position.length()).toBeLessThan(0.5);
    });
  });

  it('exposes poseable parts', () => {
    const rig = buildCritterRig(species, params);
    expect(rig.parts).toBeDefined();
    expect(rig.parts.rest.body.scaleY).toBeGreaterThan(0);
  });

  // Only meaningful for the birds; their tails are separate paper planes and
  // therefore the one part that can float free of the body.
  if (species === 'bird' || species === 'parrot' || species === 'toucan') {
    it('roots its tail inside the body, not tangent to it', () => {
      // The bug this pins: a tail plane *centered* behind the body touches it
      // at a single tangent point and reads as detached feathers from every
      // angle but dead-behind. The tail pivot must live under the skin.
      const rig = buildCritterRig(species, params);
      const body = rig.parts.body as THREE.Mesh;
      const tail = rig.parts.tail;
      if (!tail) return;

      rig.group.updateMatrixWorld(true);
      const geometry = body.geometry as THREE.BufferGeometry;
      geometry.computeBoundingSphere();
      const radius = (geometry.boundingSphere?.radius ?? 0)
        * Math.max(body.scale.x, body.scale.y, body.scale.z);
      const center = body.getWorldPosition(new THREE.Vector3());
      const root = tail.getWorldPosition(new THREE.Vector3());
      expect(
        center.distanceTo(root),
        'tail root should sit inside the body sphere',
      ).toBeLessThan(radius - 0.01);
    });
  }
});

describe('meerkat variation', () => {
  it('bars its back for bold markings rolls and stays plain for low ones', () => {
    const plain = buildCritterRig('meerkat', { ...generateCritterParams('meerkat', 1), markings: 0.1 });
    const barred = buildCritterRig('meerkat', { ...generateCritterParams('meerkat', 2), markings: 0.9 });
    const meshesUnder = (rig: ReturnType<typeof buildCritterRig>) => {
      const torso = rig.parts.body;
      if (!torso) return -1;
      // Direct children only: the head group also lives under the torso.
      return torso.children.filter((child) => (child as THREE.Mesh).isMesh).length;
    };
    // Torso without bars: haunches + ribcage + chest. Barred: those, plus
    // three or five strips.
    expect(meshesUnder(plain)).toBe(3);
    expect(meshesUnder(barred)).toBeGreaterThanOrEqual(6);
  });

  it('caps every ear with a dark tip parented to the ear itself', () => {
    const rig = buildCritterRig('meerkat', generateCritterParams('meerkat', 3));
    const tipped = rig.parts.ears.filter((ear) => ear.children.length > 0);
    expect(tipped.length).toBe(rig.parts.ears.length);
  });
});

describe('idle sentry-scan', () => {
  it('raises the torso partway, scans, and settles back by the end', async () => {
    const { applyIdleAction } = await import('./critterIdle');
    const rig = buildCritterRig('meerkat', generateCritterParams('meerkat', 4));
    const parts = rig.parts;
    const restPitch = parts.rest.body.rotationX;

    applyIdleAction('sentry-scan', parts, 0.5, 2.5, 0, 0);
    expect(parts.body!.rotation.x).toBeLessThan(restPitch - 0.5);

    applyIdleAction('sentry-scan', parts, 1, 3, 0, 0);
    expect(Math.abs(parts.body!.rotation.x - restPitch)).toBeLessThan(1e-6);
  });
});
