import * as THREE from 'three';
import { shadowed } from '../../render/builders';
import { createColorMaterial, getPaperMaterialByUrl, materialTextureUrl } from '../../render/materials';

// papr.world mailbox kit
//
// Shared vocabulary for the personified mailboxes: the game's own paper
// materials, a small parts library, the eye rig (the same warm cream sphere
// with a dark pupil the Thing Maker uses), and a set of nameplate treatments
// so every mailbox writes its owner's name in its own voice.
//
// Ported from designs/3d-Mailbox-Designs/assets/mailbox-kit.js. The only real
// change from the original design file: `paper()` now resolves to the game's
// own compiled paper art (`render/materials.ts`) instead of loading the
// design file's standalone jpg photos, so a mailbox tiles with the same
// illustrated look as every wall, roof and resource in the world. Five of the
// eleven keys had no existing `MaterialKey` (bark, a deep brown, desert,
// leaf, awning stripes); those resolve straight to an existing compiled PNG
// by URL, the same way `render/materials.ts`'s critter-variation palette
// does, rather than adding new asset files for a photographic look nothing
// else in the game uses.

export const INK = '#2d261e';

const PAPER_URLS: Record<string, string> = {
  'p-bark': '/assets/runtime/materials/birch-bark.png',
  'p-brown': materialTextureUrl('paper.brown'),
  'p-brown-deep': '/assets/runtime/materials/construction-paper-brown-1.png',
  'p-brown-warm': materialTextureUrl('paper.brown.warm'),
  'p-desert': '/assets/runtime/materials/camouflage-blobs-desert.png',
  'p-green': materialTextureUrl('paper.green'),
  'p-leaf': '/assets/runtime/materials/leaf-canopy-green.png',
  'p-notebook': materialTextureUrl('paper.notebook'),
  'p-plaid': materialTextureUrl('paper.plaid'),
  'p-salmon': materialTextureUrl('paper.salmon'),
  'p-stripes': '/assets/runtime/materials/folded-stripes-blue-green-yellow.png',
};

export function paper(key: string, repeat: [number, number] = [1, 1]): THREE.MeshStandardMaterial {
  const url = PAPER_URLS[key] ?? PAPER_URLS['p-brown'];
  return getPaperMaterialByUrl(url, repeat);
}

export function paint(hex: string, roughness = 0.86): THREE.MeshStandardMaterial {
  return createColorMaterial(hex, roughness);
}

export function glowPaint(hex: string, intensity = 0.9): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: hex,
    emissive: hex,
    emissiveIntensity: intensity,
    metalness: 0,
    roughness: 0.5,
  });
}

type Vec3 = readonly [number, number, number];

function place<T extends THREE.Object3D>(mesh: T, at: Vec3, rot?: Vec3 | null): T {
  mesh.position.set(at[0], at[1], at[2]);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  if (mesh instanceof THREE.Mesh) shadowed(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Parts library. One call per part, so a design reads as a shape rather than as
// geometry bookkeeping.
// ---------------------------------------------------------------------------

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
UNIT_BOX.userData.shared = true;

export function box(
  width: number,
  height: number,
  depth: number,
  material: THREE.MeshStandardMaterial,
  at: Vec3,
  rot?: Vec3 | null,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(UNIT_BOX, material);
  mesh.scale.set(width, height, depth);
  return place(mesh, at, rot);
}

export function cyl(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  material: THREE.MeshStandardMaterial,
  at: Vec3,
  rot?: Vec3 | null,
  segments = 20,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), material);
  return place(mesh, at, rot);
}

export function sph(radius: number, material: THREE.MeshStandardMaterial, at: Vec3, segments = 20): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, Math.max(8, segments - 6)), material);
  return place(mesh, at);
}

export function cone(
  radius: number,
  height: number,
  material: THREE.MeshStandardMaterial,
  at: Vec3,
  rot?: Vec3 | null,
  segments = 18,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, segments), material);
  return place(mesh, at, rot);
}

export function torus(
  radius: number,
  tube: number,
  material: THREE.MeshStandardMaterial,
  at: Vec3,
  rot?: Vec3 | null,
  segments = 8,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, segments, 28), material);
  return place(mesh, at, rot);
}

export function capsule(
  radius: number,
  length: number,
  material: THREE.MeshStandardMaterial,
  at: Vec3,
  rot?: Vec3 | null,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 14), material);
  return place(mesh, at, rot);
}

export function dome(radius: number, material: THREE.MeshStandardMaterial, at: Vec3, segments = 22): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, segments, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
    material,
  );
  return place(mesh, at);
}

/** A hinged group: build the swinging part around the hinge, then rotate the
 *  group — how a lid, flag, ear or tail actually moves. */
export function hinge(at: Vec3): THREE.Group {
  const group = new THREE.Group();
  group.position.set(at[0], at[1], at[2]);
  return group;
}

// ---------------------------------------------------------------------------
// The face. Same construction as the Thing Maker: cream spheres, dark pupils
// that follow the player, a slow blink. Brows and a mouth are optional extras
// the creatures use to read as animals rather than machines.
// ---------------------------------------------------------------------------

export type FaceOptions = {
  radius?: number;
  spacing?: number;
  y?: number;
  z?: number;
  eyeColor?: string;
  pupilColor?: string;
  pupilScale?: number;
  /** Squash the pupil horizontally — 1 is round, 0.45 gives a cat's slit. */
  pupilWidth?: number;
  brows?: string | null;
  browTilt?: number;
  mouth?: 'none' | 'smile' | 'open' | 'beak' | 'line';
  mouthColor?: string;
};

export type FaceMood = { excited?: number; wink?: number };

export type FaceRig = {
  root: THREE.Group;
  eyes: THREE.Mesh[];
  pupils: THREE.Mesh[];
  rest: { x: number; y: number; z: number };
  updateLook: (t: number, lookAt: THREE.Vector3 | null, mood?: FaceMood) => void;
};

export function makeFace(options: FaceOptions = {}): FaceRig {
  const {
    radius = 0.072,
    spacing = 0.112,
    y = 0,
    z = 0,
    eyeColor = '#fff8df',
    pupilColor = '#2b231d',
    pupilScale = 0.46,
    pupilWidth = 1,
    brows = null,
    browTilt = 1,
    mouth = 'none',
    mouthColor = INK,
  } = options;

  const root = new THREE.Group();
  const eyeMat = paint(eyeColor, 0.94);
  const pupilMat = paint(pupilColor, 0.62);

  const eyes = [-1, 1].map((sign) => {
    const eye = sph(radius, eyeMat, [sign * spacing, y, z], 20);
    // Named so rigging, tests and future expressions can find the face parts
    // without guessing from geometry.
    eye.userData.faceRole = 'eye';
    root.add(eye);
    return eye;
  });

  // The pupil rests on the front of the eyeball. Every mailbox here faces +Z,
  // which is the opposite of the Thing Maker's rig (its face looks down -Z),
  // so this offset is flipped relative to `thingMaker.ts`.
  const rest = { x: spacing, y: y - radius * 0.12, z: z + radius * 0.78 };
  const pupils = [-1, 1].map((sign) => {
    const pupil = sph(radius * pupilScale, pupilMat, [sign * rest.x, rest.y, rest.z], 16);
    pupil.userData.faceRole = 'pupil';
    root.add(pupil);
    return pupil;
  });

  const browMeshes: THREE.Mesh[] = [];
  if (brows) {
    for (const sign of [-1, 1]) {
      const bar = box(radius * 1.5, radius * 0.2, radius * 0.16, paint(brows, 0.8), [
        sign * spacing,
        y + radius * 1.05,
        z - radius * 0.36,
      ]);
      bar.userData.sign = sign;
      root.add(bar);
      browMeshes.push(bar);
    }
  }

  let mouthMesh: THREE.Mesh | null = null;
  if (mouth !== 'none') {
    const mouthMat = paint(mouthColor, 0.7);
    if (mouth === 'smile') {
      mouthMesh = new THREE.Mesh(
        new THREE.TorusGeometry(radius * 0.52, radius * 0.1, 6, 18, Math.PI),
        mouthMat,
      );
      mouthMesh.position.set(0, y - radius * 1.5, z - radius * 0.2);
      mouthMesh.rotation.z = Math.PI;
      mouthMesh.castShadow = true;
    } else if (mouth === 'open') {
      mouthMesh = sph(radius * 0.26, mouthMat, [0, y - radius * 1.6, z - radius * 0.15], 14);
      mouthMesh.scale.set(1, 1.3, 0.7);
    } else if (mouth === 'beak') {
      mouthMesh = cone(radius * 0.32, radius * 0.95, mouthMat, [0, y - radius * 0.75, z - radius * 0.85], [Math.PI / 2, 0, 0], 4);
    } else {
      mouthMesh = box(radius * 0.95, radius * 0.1, radius * 0.12, mouthMat, [0, y - radius * 1.35, z - radius * 0.4]);
    }
    root.add(mouthMesh);
  }

  const eyeCentre = new THREE.Vector3(0, y, z);

  /**
   * `lookAt` is a point in the rig's own local space. `mood.excited` widens the
   * eyes and lifts the brows; `mood.wink` closes the right eye.
   */
  function updateLook(t: number, lookAt: THREE.Vector3 | null, mood: FaceMood = {}) {
    const excited = mood.excited ?? 0;
    const wink = mood.wink ?? 0;
    let gazeX = 0;
    let gazeY = 0;
    if (lookAt) {
      const direction = lookAt.clone().sub(eyeCentre);
      const length = direction.length() || 1;
      gazeX = THREE.MathUtils.clamp((direction.x / length) * radius * 0.34, -radius * 0.4, radius * 0.4);
      gazeY = THREE.MathUtils.clamp((direction.y / length) * radius * 0.3, -radius * 0.35, radius * 0.35);
    }
    const blink = blinkValue(t, 0.6);
    const openY = Math.max(0.12, blink) * (1 + excited * 0.16);

    pupils.forEach((pupil, index) => {
      const sign = index === 0 ? -1 : 1;
      pupil.position.set(sign * rest.x + gazeX, rest.y + gazeY, rest.z);
      pupil.scale.set(pupilWidth, index === 1 && wink > 0.5 ? 0.12 : openY, 1);
    });
    eyes.forEach((eye, index) => {
      eye.scale.set(1, index === 1 && wink > 0.5 ? 0.12 : openY, 1);
    });

    for (const brow of browMeshes) {
      const sign = brow.userData.sign as number;
      brow.rotation.z = sign * -browTilt * 0.24 - sign * excited * 0.2;
      brow.position.y = y + radius * (1.05 + excited * 0.14);
    }
    if (mouthMesh && mouth === 'smile') mouthMesh.scale.setScalar(1 + excited * 0.22);
  }

  return { root, eyes, pupils, rest, updateLook };
}

// ---------------------------------------------------------------------------
// Nameplates. Each style letters the owner's name the way that mailbox would,
// then hands back a canvas texture a plate, tag or screen can wear.
// ---------------------------------------------------------------------------

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const int = Number.parseInt(full, 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  maxWidth: number,
  size: number,
  weight = 700,
  tracking = 0,
): number {
  let current = size;
  const measure = (value: number) => {
    ctx.font = `${weight} ${value}px ${family}`;
    return ctx.measureText(text).width + tracking * value * Math.max(0, text.length - 1);
  };
  while (measure(current) > maxWidth && current > 9) current -= 1;
  return current;
}

/** Draws with positive tracking, which is what makes capitals read as signage
 *  rather than as cramped body copy. Returns the drawn width. */
function drawTracked(ctx: CanvasRenderingContext2D, text: string, centreX: number, baselineY: number, tracking: number): number {
  const chars = [...text];
  const widths = chars.map((char) => ctx.measureText(char).width + tracking);
  const total = widths.reduce((sum, width) => sum + width, 0) - tracking;
  let cursor = centreX - total / 2;
  chars.forEach((char, index) => {
    ctx.fillText(char, cursor, baselineY);
    cursor += widths[index];
  });
  return total;
}

const SANS = 'Karla, "Trebuchet MS", system-ui, sans-serif';
const MONO = '"Courier Prime", "Courier New", ui-monospace, monospace';

const LED_FONT: Record<string, number[][]> = {
  A: [[0, 1, 1, 1, 0], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1]],
  B: [[1, 1, 1, 1, 0], [1, 0, 0, 0, 1], [1, 1, 1, 1, 0], [1, 0, 0, 0, 1], [1, 1, 1, 1, 0]],
  C: [[0, 1, 1, 1, 0], [1, 0, 0, 0, 1], [1, 0, 0, 0, 0], [1, 0, 0, 0, 1], [0, 1, 1, 1, 0]],
  D: [[1, 1, 1, 1, 0], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 0]],
  E: [[1, 1, 1, 1, 1], [1, 0, 0, 0, 0], [1, 1, 1, 1, 0], [1, 0, 0, 0, 0], [1, 1, 1, 1, 1]],
  F: [[1, 1, 1, 1, 1], [1, 0, 0, 0, 0], [1, 1, 1, 1, 0], [1, 0, 0, 0, 0], [1, 0, 0, 0, 0]],
  G: [[0, 1, 1, 1, 0], [1, 0, 0, 0, 1], [1, 0, 0, 1, 1], [1, 0, 0, 0, 1], [0, 1, 1, 1, 1]],
  H: [[1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1]],
  I: [[1, 1, 1, 1, 1], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [1, 1, 1, 1, 1]],
  J: [[0, 0, 1, 1, 1], [0, 0, 0, 1, 0], [0, 0, 0, 1, 0], [1, 0, 0, 1, 0], [0, 1, 1, 0, 0]],
  K: [[1, 0, 0, 0, 1], [1, 0, 0, 1, 0], [1, 1, 1, 0, 0], [1, 0, 0, 1, 0], [1, 0, 0, 0, 1]],
  L: [[1, 0, 0, 0, 0], [1, 0, 0, 0, 0], [1, 0, 0, 0, 0], [1, 0, 0, 0, 0], [1, 1, 1, 1, 1]],
  M: [[1, 0, 0, 0, 1], [1, 1, 0, 1, 1], [1, 0, 1, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1]],
  N: [[1, 0, 0, 0, 1], [1, 1, 0, 0, 1], [1, 0, 1, 0, 1], [1, 0, 0, 1, 1], [1, 0, 0, 0, 1]],
  O: [[0, 1, 1, 1, 0], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [0, 1, 1, 1, 0]],
  P: [[1, 1, 1, 1, 0], [1, 0, 0, 0, 1], [1, 1, 1, 1, 0], [1, 0, 0, 0, 0], [1, 0, 0, 0, 0]],
  Q: [[0, 1, 1, 1, 0], [1, 0, 0, 0, 1], [1, 0, 1, 0, 1], [1, 0, 0, 1, 0], [0, 1, 1, 0, 1]],
  R: [[1, 1, 1, 1, 0], [1, 0, 0, 0, 1], [1, 1, 1, 1, 0], [1, 0, 1, 0, 0], [1, 0, 0, 1, 0]],
  S: [[0, 1, 1, 1, 1], [1, 0, 0, 0, 0], [0, 1, 1, 1, 0], [0, 0, 0, 0, 1], [1, 1, 1, 1, 0]],
  T: [[1, 1, 1, 1, 1], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0]],
  U: [[1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [0, 1, 1, 1, 0]],
  V: [[1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [0, 1, 0, 1, 0], [0, 0, 1, 0, 0]],
  W: [[1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 1, 0, 1], [1, 1, 0, 1, 1], [1, 0, 0, 0, 1]],
  X: [[1, 0, 0, 0, 1], [0, 1, 0, 1, 0], [0, 0, 1, 0, 0], [0, 1, 0, 1, 0], [1, 0, 0, 0, 1]],
  Y: [[1, 0, 0, 0, 1], [0, 1, 0, 1, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0]],
  Z: [[1, 1, 1, 1, 1], [0, 0, 0, 1, 0], [0, 0, 1, 0, 0], [0, 1, 0, 0, 0], [1, 1, 1, 1, 1]],
  ' ': [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
  '-': [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
  '_': [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [1, 1, 1, 1, 1]],
  '.': [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 1, 0, 0]],
  '?': [[0, 1, 1, 1, 0], [1, 0, 0, 0, 1], [0, 0, 0, 1, 0], [0, 0, 1, 0, 0], [0, 0, 0, 0, 0]],
};

export type PlateOptions = { ink?: string; primary?: string; secondary?: string };
type PlateSpec = { aspect: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number, text: string, opts: PlateOptions) => void };

const PLATE_STYLES: Record<string, PlateSpec> = {
  enamel: {
    aspect: 2.9,
    draw(ctx, w, h, text, opts) {
      const ink = opts.ink ?? '#3b2f22';
      ctx.fillStyle = '#fff8e4';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = withAlpha(ink, 0.5);
      ctx.lineWidth = h * 0.045;
      ctx.strokeRect(h * 0.04, h * 0.05, w - h * 0.08, h - h * 0.1);
      const label = text.toUpperCase();
      const size = fitFont(ctx, label, MONO, w * 0.72, h * 0.46, 700, 0.08);
      ctx.font = `700 ${size}px ${MONO}`;
      ctx.fillStyle = ink;
      ctx.textBaseline = 'middle';
      drawTracked(ctx, label, w / 2, h * 0.53, size * 0.08);
      ctx.fillStyle = withAlpha(ink, 0.7);
      for (const sx of [h * 0.13, w - h * 0.13]) {
        ctx.beginPath();
        ctx.arc(sx, h * 0.5, h * 0.035, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  jersey: {
    aspect: 3.1,
    draw(ctx, w, h, text, opts) {
      const primary = opts.primary ?? '#a9351f';
      const secondary = opts.secondary ?? '#fff8e4';
      ctx.fillStyle = primary;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = secondary;
      ctx.fillRect(0, h * 0.44, w, h * 0.12);
      const label = text.toUpperCase();
      const size = fitFont(ctx, label, SANS, w * 0.78, h * 0.44, 800, 0.06);
      ctx.font = `800 ${size}px ${SANS}`;
      ctx.fillStyle = secondary;
      ctx.textBaseline = 'middle';
      drawTracked(ctx, label, w / 2, h * 0.24, size * 0.06);
    },
  },
  decal: {
    aspect: 3,
    draw(ctx, w, h, text, opts) {
      const accent = opts.primary ?? '#a9351f';
      ctx.fillStyle = '#fffdf6';
      ctx.beginPath();
      ctx.roundRect(w * 0.02, h * 0.12, w * 0.96, h * 0.76, h * 0.14);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = h * 0.07;
      ctx.stroke();
      const label = text.toUpperCase();
      const size = fitFont(ctx, label, SANS, w * 0.74, h * 0.42, 800, 0.04);
      ctx.save();
      ctx.translate(w / 2, h * 0.53);
      ctx.rotate(-0.04);
      ctx.font = `italic 800 ${size}px ${SANS}`;
      ctx.fillStyle = '#2b231d';
      ctx.textBaseline = 'middle';
      drawTracked(ctx, label, 0, 0, size * 0.04);
      ctx.restore();
    },
  },
  crt: {
    aspect: 1.45,
    draw(ctx, w, h, text) {
      ctx.fillStyle = '#12211f';
      ctx.fillRect(0, 0, w, h);
      const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h * 0.95);
      glow.addColorStop(0, 'rgba(150,255,214,0.34)');
      glow.addColorStop(1, 'rgba(150,255,214,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      const size = fitFont(ctx, text, MONO, w * 0.8, h * 0.32, 700, 0.09);
      ctx.font = `700 ${size}px ${MONO}`;
      ctx.fillStyle = '#d7ffe9';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#8cffd6';
      ctx.shadowBlur = h * 0.24;
      drawTracked(ctx, text, w / 2, h * 0.5, size * 0.09);
      ctx.shadowBlur = 0;
    },
  },
  stitch: {
    aspect: 2.7,
    draw(ctx, w, h, text, opts) {
      const accent = opts.primary ?? '#8a5c0c';
      ctx.fillStyle = '#f4ead2';
      ctx.beginPath();
      ctx.roundRect(0, 0, w, h, h * 0.16);
      ctx.fill();
      ctx.setLineDash([h * 0.16, h * 0.12]);
      ctx.strokeStyle = accent;
      ctx.lineWidth = h * 0.05;
      ctx.strokeRect(h * 0.08, h * 0.09, w - h * 0.16, h - h * 0.18);
      ctx.setLineDash([]);
      const size = fitFont(ctx, text, MONO, w * 0.72, h * 0.44, 700, 0.12);
      ctx.font = `italic 700 ${size}px ${MONO}`;
      ctx.fillStyle = accent;
      ctx.textBaseline = 'middle';
      drawTracked(ctx, text, w / 2, h * 0.53, size * 0.12);
    },
  },
  police: {
    aspect: 2.2,
    draw(ctx, w, h, text) {
      ctx.fillStyle = '#f6f1e2';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#1d2733';
      ctx.lineWidth = h * 0.07;
      ctx.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
      const label = text.toUpperCase();
      // `fitFont` only shrinks for width, never height, so a short name (like
      // "TAPPS") never triggers it and renders at the full starting size —
      // which, at 0.34, was tall enough for a `middle`-baseline line this
      // close to the top edge to clip. A smaller start plus a little more
      // headroom above the baseline keeps every name inside the plate.
      const size = fitFont(ctx, label, SANS, w * 0.72, h * 0.24, 800, 0.12);
      ctx.font = `800 ${size}px ${SANS}`;
      ctx.fillStyle = '#1d2733';
      ctx.textBaseline = 'middle';
      drawTracked(ctx, label, w / 2, h * 0.4, size * 0.12);
      ctx.font = `600 ${size * 0.62}px ${SANS}`;
      drawTracked(ctx, 'POST', w / 2, h * 0.72, size * 0.12);
    },
  },
  led: {
    aspect: 3.2,
    draw(ctx, w, h, text) {
      ctx.fillStyle = '#171512';
      ctx.fillRect(0, 0, w, h);
      const dot = h * 0.05;
      const chars = [...text.toUpperCase()].slice(0, 14);
      const rows = 5;
      const cellW = dot * 1.35;
      const totalW = chars.length * cellW * 5.2;
      const scale = Math.min(1, (w * 0.86) / Math.max(1, totalW));
      const startX = (w - totalW * scale) / 2;
      const topY = (h - rows * dot * 1.35 * scale) / 2;
      ctx.fillStyle = '#ff9d4d';
      chars.forEach((char, charIndex) => {
        const pattern = LED_FONT[char] ?? LED_FONT['?'];
        pattern.forEach((row, rowIndex) => {
          row.forEach((on, colIndex) => {
            if (!on) return;
            const px = startX + (charIndex * cellW * 5.2 + colIndex * cellW + cellW / 2) * scale;
            const py = topY + (rowIndex * dot * 1.35 + dot * 0.7) * scale;
            ctx.beginPath();
            ctx.arc(px, py, dot * 0.5 * scale, 0, Math.PI * 2);
            ctx.fill();
          });
        });
      });
    },
  },
  chalk: {
    aspect: 2.6,
    draw(ctx, w, h, text) {
      ctx.fillStyle = '#fdf8ee';
      ctx.beginPath();
      ctx.roundRect(w * 0.05, h * 0.14, w * 0.9, h * 0.72, h * 0.36);
      ctx.fill();
      const size = fitFont(ctx, text, SANS, w * 0.7, h * 0.4, 700, 0.02);
      ctx.save();
      ctx.translate(w / 2, h * 0.51);
      ctx.rotate(-0.02);
      ctx.font = `700 ${size}px ${SANS}`;
      ctx.fillStyle = '#2f6feb';
      ctx.textBaseline = 'middle';
      drawTracked(ctx, text, 0, 0, size * 0.02);
      ctx.restore();
    },
  },
  collar: {
    aspect: 2.4,
    draw(ctx, w, h, text, opts) {
      const metal = opts.primary ?? '#c9903c';
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.roundRect(w * 0.03, h * 0.18, w * 0.94, h * 0.64, h * 0.32);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.roundRect(w * 0.07, h * 0.24, w * 0.86, h * 0.16, h * 0.1);
      ctx.fill();
      const label = text.toUpperCase();
      const size = fitFont(ctx, label, MONO, w * 0.74, h * 0.4, 700, 0.06);
      ctx.font = `700 ${size}px ${MONO}`;
      ctx.fillStyle = '#4a3418';
      ctx.textBaseline = 'middle';
      drawTracked(ctx, label, w / 2, h * 0.58, size * 0.06);
    },
  },
  tag: {
    aspect: 2.2,
    draw(ctx, w, h, text, opts) {
      const metal = opts.primary ?? '#d8b46a';
      ctx.fillStyle = metal;
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.54, w * 0.45, h * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(80,58,24,0.55)';
      ctx.lineWidth = h * 0.05;
      ctx.stroke();
      const size = fitFont(ctx, text, MONO, w * 0.66, h * 0.38, 700, 0.04);
      ctx.font = `italic 700 ${size}px ${MONO}`;
      ctx.fillStyle = '#4a3418';
      ctx.textBaseline = 'middle';
      drawTracked(ctx, text, w / 2, h * 0.56, size * 0.04);
    },
  },
  brand: {
    aspect: 2.4,
    draw(ctx, w, h, text) {
      ctx.fillStyle = '#8a5a33';
      ctx.beginPath();
      ctx.roundRect(w * 0.03, h * 0.16, w * 0.94, h * 0.68, h * 0.1);
      ctx.fill();
      ctx.strokeStyle = 'rgba(58,36,18,0.45)';
      ctx.lineWidth = h * 0.028;
      for (let index = 1; index < 5; index += 1) {
        const y = h * 0.16 + (h * 0.68 * index) / 5;
        ctx.beginPath();
        ctx.moveTo(w * 0.05, y);
        ctx.lineTo(w * 0.95, y);
        ctx.stroke();
      }
      const label = text.toUpperCase();
      const size = fitFont(ctx, label, MONO, w * 0.76, h * 0.42, 700, 0.1);
      ctx.font = `700 ${size}px ${MONO}`;
      ctx.fillStyle = '#f6ead0';
      ctx.textBaseline = 'middle';
      drawTracked(ctx, label, w / 2, h * 0.51, size * 0.1);
    },
  },
  trash: {
    aspect: 2.8,
    draw(ctx, w, h, text, opts) {
      ctx.fillStyle = opts.primary ?? '#b9b3a2';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(45,38,30,0.14)';
      for (let index = 0; index < 30; index += 1) {
        ctx.fillRect((index * 97) % w, (index * 53) % h, 5, 3);
      }
      ctx.strokeStyle = '#3a2f22';
      ctx.lineWidth = h * 0.06;
      ctx.strokeRect(h * 0.07, h * 0.08, w - h * 0.14, h - h * 0.16);
      const label = text.toUpperCase();
      const size = fitFont(ctx, label, MONO, w * 0.7, h * 0.42, 700, 0.12);
      ctx.font = `700 ${size}px ${MONO}`;
      ctx.fillStyle = '#3a2f22';
      ctx.textBaseline = 'middle';
      drawTracked(ctx, label, w / 2, h * 0.53, size * 0.12);
    },
  },
  perch: {
    aspect: 2.6,
    draw(ctx, w, h, text) {
      ctx.fillStyle = '#c9a473';
      ctx.beginPath();
      ctx.roundRect(w * 0.02, h * 0.08, w * 0.96, h * 0.84, h * 0.12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,46,22,0.4)';
      ctx.lineWidth = h * 0.03;
      ctx.strokeRect(w * 0.07, h * 0.18, w * 0.86, h * 0.64);
      const size = fitFont(ctx, text, SANS, w * 0.74, h * 0.42, 700, 0.03);
      ctx.font = `700 ${size}px ${SANS}`;
      ctx.fillStyle = '#3a2c1a';
      ctx.textBaseline = 'middle';
      drawTracked(ctx, text, w / 2, h * 0.53, size * 0.03);
    },
  },
  sleeve: {
    aspect: 2.3,
    draw(ctx, w, h, text) {
      ctx.fillStyle = '#c9a473';
      ctx.beginPath();
      ctx.roundRect(w * 0.03, h * 0.1, w * 0.94, h * 0.8, h * 0.08);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.lineWidth = h * 0.03;
      ctx.beginPath();
      ctx.moveTo(w * 0.08, h * 0.22);
      ctx.lineTo(w * 0.92, h * 0.22);
      ctx.stroke();
      const size = fitFont(ctx, text, MONO, w * 0.74, h * 0.4, 700, 0.02);
      ctx.font = `italic 700 ${size}px ${MONO}`;
      ctx.fillStyle = '#2b231d';
      ctx.textBaseline = 'middle';
      drawTracked(ctx, text, w / 2, h * 0.58, size * 0.02);
    },
  },
  patch: {
    aspect: 2.5,
    draw(ctx, w, h, text, opts) {
      ctx.fillStyle = '#e8dfc4';
      ctx.beginPath();
      ctx.roundRect(w * 0.03, h * 0.12, w * 0.94, h * 0.76, h * 0.2);
      ctx.fill();
      ctx.setLineDash([h * 0.1, h * 0.09]);
      ctx.strokeStyle = opts.primary ?? '#3d5c34';
      ctx.lineWidth = h * 0.06;
      ctx.strokeRect(h * 0.1, h * 0.12, w - h * 0.2, h - h * 0.24);
      ctx.setLineDash([]);
      const size = fitFont(ctx, text, MONO, w * 0.7, h * 0.42, 700, 0.1);
      ctx.font = `700 ${size}px ${MONO}`;
      ctx.fillStyle = '#3a2c1a';
      ctx.textBaseline = 'middle';
      drawTracked(ctx, text, w / 2, h * 0.54, size * 0.1);
    },
  },
  trailmark: {
    aspect: 2.6,
    draw(ctx, w, h, text) {
      ctx.fillStyle = '#a97b4a';
      ctx.beginPath();
      ctx.moveTo(w * 0.02, h * 0.22);
      ctx.lineTo(w * 0.98, h * 0.08);
      ctx.lineTo(w * 0.98, h * 0.84);
      ctx.lineTo(w * 0.02, h * 0.96);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,38,18,0.45)';
      ctx.lineWidth = h * 0.03;
      ctx.stroke();
      const label = text.toUpperCase();
      const size = fitFont(ctx, label, SANS, w * 0.72, h * 0.4, 800, 0.08);
      ctx.font = `800 ${size}px ${SANS}`;
      ctx.fillStyle = '#fff8e4';
      ctx.textBaseline = 'middle';
      drawTracked(ctx, label, w / 2, h * 0.53, size * 0.08);
    },
  },
};

export type Nameplate = {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  aspect: number;
  width: number;
  height: number;
  dispose: () => void;
};

export function makeNameplate(style: string, text: string, options: PlateOptions = {}): Nameplate {
  const spec = PLATE_STYLES[style] ?? PLATE_STYLES.enamel;
  const canvas = document.createElement('canvas');
  const width = 512;
  const height = Math.round(width / spec.aspect);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    spec.draw(ctx, width, height, (text || '').trim() || 'Unnamed', options);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return {
    texture,
    canvas,
    aspect: spec.aspect,
    width,
    height,
    dispose: () => texture.dispose(),
  };
}

/** A nameplate on a physical plate or screen. `emissive` makes it read as a
 *  display; the plate itself stays solid so it never looks like a floating
 *  decal. */
export function nameplateMesh(plate: Nameplate, width: number, mode: 'paper' | 'emissive' = 'paper', opacity = 1): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
  const height = width / plate.aspect;
  const material = mode === 'emissive'
    ? new THREE.MeshStandardMaterial({
      emissive: '#ffffff',
      emissiveIntensity: 1.2,
      emissiveMap: plate.texture,
      map: plate.texture,
      metalness: 0,
      roughness: 0.42,
    })
    : new THREE.MeshStandardMaterial({
      map: plate.texture,
      metalness: 0,
      opacity,
      roughness: 0.9,
      transparent: opacity < 1,
    });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.castShadow = opacity === 1;
  return mesh;
}

// ---------------------------------------------------------------------------
// Motion helpers. Shared, frame-rate independent, and calm at rest.
// ---------------------------------------------------------------------------

export function blinkValue(t: number, rate = 0.5): number {
  const cycle = Math.sin(t * rate) * 0.5 + 0.5;
  if (cycle < 0.96) return 1;
  const closing = (cycle - 0.96) / 0.04;
  return Math.max(0.12, Math.abs(Math.cos(closing * Math.PI)));
}

export function bob(t: number, speed = 1, amount = 0.02): number {
  return Math.sin(t * speed) * amount;
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * Math.max(0, dt)));
}

/** A small paper letter, the thing every design is waiting to hand over. */
export function envelope(width = 0.16): THREE.Group {
  const group = new THREE.Group();
  const sheet = box(width, width * 0.68, 0.012, paper('p-notebook', [0.4, 0.4]), [0, 0, 0]);
  const flap = new THREE.Mesh(
    new THREE.ConeGeometry(width * 0.5, width * 0.42, 3),
    paint('#fff8e4', 0.9),
  );
  flap.rotation.set(Math.PI / 2, 0, 0);
  flap.position.set(0, width * 0.16, 0.011);
  flap.castShadow = true;
  group.add(sheet, flap);
  return group;
}

// ---------------------------------------------------------------------------
// Build contract: what every design's `build(ctx)` receives and returns.
// ---------------------------------------------------------------------------

export type MailboxBuildContext = {
  /** The owner's display name, already trimmed and length-bounded. */
  name: string;
  team: { primary: string; secondary: string };
  reduced?: boolean;
};

export type MailboxTickState = {
  /** True while new mail is waiting — plays each design's signature flourish. */
  message: boolean;
  /** A point in the mailbox's own local space to look toward, or null to rest. */
  look: THREE.Vector3 | null;
  reduced: boolean;
};

export type MailboxInstance = {
  root: THREE.Group;
  tick: (t: number, dt: number, state: MailboxTickState) => void;
  dispose: () => void;
};

/**
 * The book-keeping every design builder shares: a root group on the ground,
 * a `plate()` helper that letters the owner's name in a chosen style, and a
 * `done()` that wraps the rig into the `MailboxInstance` contract the
 * runtime speaks.
 */
export function createShell(ctx: MailboxBuildContext) {
  const root = new THREE.Group();
  const plate = (
    parent: THREE.Object3D,
    style: string,
    width: number,
    position: Vec3,
    rotation?: Vec3 | null,
    mode: 'paper' | 'emissive' = 'paper',
  ): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> => {
    const nameplate = makeNameplate(style, ctx.name, {
      primary: ctx.team.primary,
      secondary: ctx.team.secondary,
    });
    const mesh = nameplateMesh(nameplate, width, mode);
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    parent.add(mesh);
    return mesh;
  };
  const done = (tick: (t: number, dt: number, state: MailboxTickState) => void): MailboxInstance => ({
    root,
    tick,
    dispose: () => disposeRoot(root),
  });
  return { root, plate, done };
}

/** Release the GPU buffers a rebuilt mailbox leaves behind. Geometry shared by
 *  the kit (`UNIT_BOX`) is marked and skipped, so nothing in use is freed.
 *  Cached materials from `render/materials.ts` (paint/paper) are shared
 *  across every mailbox and the rest of the world, so a mesh wearing one is
 *  left alone; only a nameplate's own canvas-texture material — never shared
 *  with anything else — is disposed along with its texture. */
export function disposeRoot(root: THREE.Group): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    if (node.geometry && !node.geometry.userData.shared) node.geometry.dispose();
    const material = node.material;
    if (!Array.isArray(material) && material instanceof THREE.MeshStandardMaterial && material.map instanceof THREE.CanvasTexture) {
      material.map.dispose();
      material.dispose();
    }
  });
}

// ---------------------------------------------------------------------------
// The design registry contract. Every entry in designs.animals.ts and
// designs.objects.ts has this shape.
// ---------------------------------------------------------------------------

export type MailboxFocus = { distance: number; height: number; targetY: number };

export type MailboxDesign = {
  id: string;
  name: string;
  tagline: string;
  tags: string[];
  signal: string;
  /** True when the shell/trim take the owner's team colors. Most designs do. */
  team?: boolean;
  /** A handful of the design's own colors, for a swatch preview without building it. */
  palette: string[];
  /** Where a camera should sit to frame this design nicely. */
  focus: MailboxFocus;
  build: (ctx: MailboxBuildContext) => MailboxInstance;
};
