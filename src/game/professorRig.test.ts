import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

// The rig reaches the renderer context transitively (professorRig → materials
// → context), which grabs the canvas from `document` at module load. These
// tests are pure geometry maths and need no DOM, so stub the one thing the
// render modules actually import: the texture loader.
vi.mock('../render/context', () => ({
  textureLoader: {
    load: () => new THREE.Texture(),
  },
}));

const { buildProfessorRig } = await import('./professorRig');

type Eye = { group: THREE.Group; ball: THREE.Mesh; iris: THREE.Mesh };

/** The two eyes: groups holding a 0.155 ball plus a 0.08 iris sphere. */
function findEyes(group: THREE.Group): Eye[] {
  const eyes: Eye[] = [];
  group.traverse((child) => {
    if (!(child instanceof THREE.Group)) return;
    let ball: THREE.Mesh | null = null;
    let iris: THREE.Mesh | null = null;
    for (const member of child.children) {
      if (!(member instanceof THREE.Mesh) || !(member.geometry instanceof THREE.SphereGeometry)) continue;
      if (member.geometry.parameters.radius === 0.155) ball = member;
      if (member.geometry.parameters.radius === 0.08) iris = member;
    }
    if (ball && iris) eyes.push({ group: child, ball, iris });
  });
  return eyes;
}

function meshesWith<T extends THREE.BufferGeometry>(
  group: THREE.Object3D,
  isMatch: (geometry: T) => boolean,
  kind: new () => T,
): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  group.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry instanceof kind && isMatch(child.geometry as T)) {
      found.push(child);
    }
  });
  return found;
}

describe('professor rig', () => {
  it('builds every part the SVG shows: clip body, eyes, glasses, cap', () => {
    const rig = buildProfessorRig();

    // Paperclip body: two open torus loops, slightly mismatched sizes.
    const clips = meshesWith(rig.group, (g: THREE.TorusGeometry) => g.parameters.radius === 0.85 || g.parameters.radius === 0.62, THREE.TorusGeometry);
    expect(clips).toHaveLength(2);

    // Eyes: a grey ball with a coloured iris each.
    const eyes = findEyes(rig.group);
    expect(eyes).toHaveLength(2);

    // Glasses: two chunky torus lenses plus the bridge.
    const lenses = meshesWith(rig.group, (g: THREE.TorusGeometry) => g.parameters.radius === 0.27, THREE.TorusGeometry);
    expect(lenses).toHaveLength(2);

    // Graduation cap: diamond board, dome, tassel, and gem.
    const boards = meshesWith(rig.group, (g: THREE.BoxGeometry) => g.parameters.width === 0.66, THREE.BoxGeometry);
    const domes = meshesWith(rig.group, (g: THREE.SphereGeometry) => g.parameters.radius === 0.34, THREE.SphereGeometry);
    const tassels = meshesWith(rig.group, () => true, THREE.CylinderGeometry);
    const gems = meshesWith(rig.group, (g: THREE.SphereGeometry) => g.parameters.radius === 0.05, THREE.SphereGeometry);
    expect(boards).toHaveLength(1);
    expect(domes).toHaveLength(1);
    expect(tassels).toHaveLength(1);
    expect(gems).toHaveLength(1);
  });

  it('uses the SVG\'s own iris colours, --green and --blue', () => {
    const rig = buildProfessorRig();
    const eyes = findEyes(rig.group);

    const left = eyes.find((eye) => eye.group.position.x < 0);
    const right = eyes.find((eye) => eye.group.position.x > 0);
    expect(left).toBeDefined();
    expect(right).toBeDefined();

    const colorOf = (mesh: THREE.Mesh) => {
      const material = mesh.material as THREE.MeshStandardMaterial;
      return material.color.getHex();
    };
    expect(colorOf(left!.iris)).toBe(0x02b101); // the_prof.svg --green
    expect(colorOf(right!.iris)).toBe(0x004a62); // the_prof.svg --blue
  });

  it('frames the eyes with big chunky glasses, the SVG\'s dominant feature', () => {
    const rig = buildProfessorRig();
    const lenses = meshesWith(rig.group, (g: THREE.TorusGeometry) => g.parameters.radius === 0.27, THREE.TorusGeometry);

    // The frames enclose the whole eye ball with margin, like the SVG where
    // the rims sit clear of the goggles — not thin wire rims hugging them.
    for (const lens of lenses) {
      const geometry = lens.geometry as THREE.TorusGeometry;
      expect(geometry.parameters.radius).toBeGreaterThan(0.155 * 1.6); // eye ball radius
      expect(geometry.parameters.tube).toBeGreaterThan(0.03); // chunky, not wire-rim
    }
  });

  it('sits the irises toward the bridge and up, matching the SVG gaze', () => {
    const rig = buildProfessorRig();
    const eyes = findEyes(rig.group);

    const left = eyes.find((eye) => eye.group.position.x < 0)!;
    const right = eyes.find((eye) => eye.group.position.x > 0)!;
    // Inward = toward the bridge (positive x for the left eye, negative for
    // the right), and both sit slightly high.
    expect(left.iris.position.x).toBeGreaterThan(0);
    expect(right.iris.position.x).toBeLessThan(0);
    expect(left.iris.position.y).toBeGreaterThan(0);
    expect(right.iris.position.y).toBeGreaterThan(0);
  });

  it('sways and blinks without throwing', () => {
    const rig = buildProfessorRig();
    const eyes = findEyes(rig.group);

    const swayBefore = rig.group.rotation.y;
    rig.update(1);
    const swayAfter = rig.group.rotation.y;
    expect(swayAfter).not.toBe(swayBefore);

    // Between blinks the eyes rest at their calm (not startled) scale.
    rig.update(1);
    const resting = eyes.map((eye) => eye.group.scale.y);
    expect(resting[0]).toBeCloseTo(0.78, 5);
    expect(resting[1]).toBeCloseTo(0.78, 5);

    // Mid-blink they squash flat.
    rig.update(4.4 + 0.11);
    const blinking = eyes.map((eye) => eye.group.scale.y);
    expect(blinking[0]).toBeCloseTo(0, 5);
    expect(blinking[1]).toBeCloseTo(0, 5);
  });
});
