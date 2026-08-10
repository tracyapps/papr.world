import * as THREE from 'three';
import { createColorMaterial } from '../render/materials';

// The Professor, modelled from the owner's the-prof.svg: a paperclip body,
// two goggle eyes, round glasses, and a graduation cap with a tassel. Built
// the same way every other character in this game is built — primitives and
// flat colour, no imported model file, no Blender/glTF pipeline (this
// project doesn't have one). See critterRigs.ts for the established
// convention this follows.
//
// The SVG version reads as permanently shocked because its eyes are two
// perfect, fully-open circles with no eyelid at all — there is no shape in
// a flat vector that *isn't* wide open. In 3D that's cheap to fix two ways:
// the eyes rest at a slightly flattened scale instead of a full circle (a
// calmer default, not a startled one), and they blink — the exact trick
// critterRigs.ts already uses elsewhere (squash a sphere flat on its Y axis
// for an instant, then let it spring back). Nothing here needed a shader.

export type ProfessorRig = {
  group: THREE.Group;
  /** Advance idle sway and the blink cycle. `t` is elapsed seconds. */
  update: (t: number) => void;
};

const CLIP_OUTER = createColorMaterial('#7d7d7d', 0.65);
const CLIP_INNER = createColorMaterial('#a8a8a8', 0.6);
const EYE_BALL = createColorMaterial('#8f8f8f', 0.55);
// The SVG's own iris colours, straight out of the_prof.svg's --green and
// --blue rather than an approximation of them.
const EYE_IRIS_LEFT = createColorMaterial('#02b101', 0.5);
const EYE_IRIS_RIGHT = createColorMaterial('#004a62', 0.5);
const DARK = createColorMaterial('#241d18', 0.75);
const CAP_DARK = createColorMaterial('#1c1c1c', 0.7);
const GEM = createColorMaterial('#5b1fa8', 0.4);

function sphere(radius: number, material: THREE.Material, w = 16, h = 12) {
  return new THREE.Mesh(new THREE.SphereGeometry(radius, w, h), material);
}

/**
 * An open paperclip loop: a torus with a gap, standing in for the SVG's
 * "two nested rounded strokes, silver against the paper." Two of these,
 * slightly mismatched, sit behind the face.
 */
function clipLoop(radius: number, tube: number, material: THREE.Material, arc: number) {
  const geometry = new THREE.TorusGeometry(radius, tube, 10, 28, arc);
  return new THREE.Mesh(geometry, material);
}

/**
 * One eye: a grey ball (the SVG's eye is a grey-gradient sphere, not a white
 * one — the colour comes entirely from a smaller iris disc laid over it,
 * with no separate pupil) plus a coloured iris. Returned as a group so
 * blinking can scale the whole eye on its Y axis instead of two meshes
 * separately, which would let the iris slide out of the ball's silhouette.
 *
 * `inwardX` shifts the iris toward the bridge and up, the way the SVG's two
 * irises both sit off-centre — it is the whole trick that makes the flat
 * drawing read as attentive rather than staring.
 */
function buildEye(irisMaterial: THREE.Material, inwardX: number): THREE.Group {
  const eye = new THREE.Group();
  const ball = sphere(0.155, EYE_BALL, 16, 12);
  const iris = sphere(0.08, irisMaterial, 12, 10);
  iris.position.set(inwardX, 0.012, 0.11);
  eye.add(ball, iris);
  return eye;
}

export function buildProfessorRig(): ProfessorRig {
  const group = new THREE.Group();

  // Paperclip body, behind everything else.
  const outerLoop = clipLoop(0.85, 0.075, CLIP_OUTER, Math.PI * 1.55);
  outerLoop.position.set(0, -0.02, -0.35);
  outerLoop.rotation.z = 2.55;
  const innerLoop = clipLoop(0.62, 0.06, CLIP_INNER, Math.PI * 1.5);
  innerLoop.position.set(0.03, -0.02, -0.3);
  innerLoop.rotation.z = 2.62;
  group.add(outerLoop, innerLoop);

  // Eyes. `eyeRestScaleY` is the actual fix for the shocked look — a full
  // circle (1.0) is what reads as startled; something short of that reads
  // as merely attentive.
  const eyeRestScaleY = 0.78;
  const leftEye = buildEye(EYE_IRIS_LEFT, 0.017);
  leftEye.position.set(-0.32, 0.03, 0.35);
  leftEye.scale.y = eyeRestScaleY;
  const rightEye = buildEye(EYE_IRIS_RIGHT, -0.017);
  rightEye.position.set(0.32, 0.01, 0.35);
  rightEye.scale.y = eyeRestScaleY;
  group.add(leftEye, rightEye);

  // Round glasses in front of the eyes, joined by a bridge. Modelled from
  // the SVG's actual proportions, where the frames are the dominant feature
  // of the face — big black rims, wider than tall, sitting clear of the eye
  // balls with the coloured iris showing through the middle.
  const lensGeometry = new THREE.TorusGeometry(0.27, 0.045, 10, 24);
  const leftLens = new THREE.Mesh(lensGeometry, DARK);
  leftLens.position.set(-0.32, 0.03, 0.46);
  leftLens.scale.x = 1.12;
  const rightLens = new THREE.Mesh(lensGeometry, DARK);
  rightLens.position.set(0.32, 0.01, 0.46);
  rightLens.scale.x = 1.12;
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), DARK);
  bridge.position.set(0, 0.03, 0.46);
  group.add(leftLens, rightLens, bridge);

  // Graduation cap: a flat diamond board (the SVG draws it as a literal
  // rhombus, not a perspective board, so this stays flat-on to the camera
  // rather than tilted) over a small dark dome, with a tassel and gem
  // hanging to one side.
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.66, 0.07), CAP_DARK);
  board.position.set(0, 0.98, 0.15);
  board.rotation.z = Math.PI / 4;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), CAP_DARK);
  dome.position.set(0, 0.78, 0.1);
  dome.rotation.x = Math.PI;
  const tassel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.32, 6), DARK);
  tassel.position.set(0.22, 0.78, 0.18);
  tassel.rotation.z = 0.35;
  const gem = sphere(0.05, GEM, 10, 8);
  gem.position.set(0.31, 0.63, 0.2);
  group.add(board, dome, tassel, gem);

  // Idle sway constants. Small and slow — "a kettle that is visibly on is
  // not nagging you" (knowledge-tree.md) applies to his motion too, not just
  // his reading state.
  const SWAY_AMOUNT = 0.1;
  const SWAY_SPEED = 0.45;
  const BOB_AMOUNT = 0.015;
  const BOB_SPEED = 0.7;

  // Blink timing, tuned to read as a person rather than a metronome or a
  // twitchy critter: roughly human (every few seconds), quick to close.
  const BLINK_INTERVAL = 4.4;
  const BLINK_DURATION = 0.22;

  function blinkOpenness(t: number): number {
    const cyclePos = t % BLINK_INTERVAL;
    if (cyclePos > BLINK_DURATION) return 1;
    const phase = cyclePos / BLINK_DURATION;
    return Math.abs(phase - 0.5) * 2;
  }

  function update(t: number) {
    group.rotation.y = Math.sin(t * SWAY_SPEED) * SWAY_AMOUNT;
    group.position.y = Math.sin(t * BOB_SPEED) * BOB_AMOUNT;

    const openness = blinkOpenness(t);
    leftEye.scale.y = eyeRestScaleY * openness;
    rightEye.scale.y = eyeRestScaleY * openness;
  }

  return { group, update };
}
