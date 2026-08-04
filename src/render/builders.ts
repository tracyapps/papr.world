import * as THREE from 'three';
import { textureLoader } from './context';

// Reusable paper-geometry builders: sheets, walls, roofs, and flat cutouts.

export type CutoutOptions = {
  textureUrl: string;
  height: number;
  position: THREE.Vector3Tuple;
  aspectRatio: number;
  rotationY?: number;
  opacity?: number;
  alphaTest?: number;
};

type CutoutMaterialEntry = {
  material: THREE.MeshStandardMaterial;
  texture: THREE.Texture;
  depthMaterial: THREE.MeshDepthMaterial;
};

const cutoutMaterialCache = new Map<string, CutoutMaterialEntry>();

export function getCutoutMaterial(
  textureUrl: string,
  alphaTest = 0.03,
  opacity = 1,
): CutoutMaterialEntry {
  const key = `${textureUrl}|${alphaTest}|${opacity}`;
  let entry = cutoutMaterialCache.get(key);
  if (!entry) {
    const texture = textureLoader.load(textureUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Fully opaque paper cutouts still use their texture alpha as a stencil,
    // but belong in the depth buffer. Treating every cutout as translucent
    // made labels and other transparent meshes appear through foreground trees.
    const isTranslucent = opacity < 1;
    const material = new THREE.MeshStandardMaterial({
      alphaTest,
      depthWrite: !isTranslucent,
      map: texture,
      metalness: 0,
      opacity,
      roughness: 0.94,
      side: THREE.DoubleSide,
      transparent: isTranslucent,
    });
    const depthMaterial = new THREE.MeshDepthMaterial({
      alphaMap: texture,
      alphaTest,
      depthPacking: THREE.RGBADepthPacking,
    });
    entry = { material, texture, depthMaterial };
    cutoutMaterialCache.set(key, entry);
  }
  return entry;
}

/**
 * How far a standing cutout is pushed below the ground line, as a fraction of
 * its height.
 *
 * Hand-drawn tree art rarely has a flat, straight bottom edge — the trunk
 * ends in ragged paper. Sitting that edge exactly on the ground leaves gaps
 * that the cast shadow reads as a gap under the tree, so it looks like it is
 * hovering. Burying the base slightly hides the ragged edge in the ground.
 *
 * Proportional rather than absolute, because the ragged part of a drawing
 * scales with the drawing: a 24-unit redwood has a proportionally bigger
 * messy bottom than a 0.6-unit shrub.
 */
export const CUTOUT_GROUND_SINK_RATIO = 0.035;
/** Floors and ceilings so tiny props still sink a little and giant redwoods
 *  don't disappear up to their knees. */
const MIN_CUTOUT_SINK = 0.02;
const MAX_CUTOUT_SINK = 0.45;

/**
 * Centre Y for a cutout of `height` standing on ground at `baseY`, sunk far
 * enough that its ragged bottom edge is hidden.
 */
export function groundedCutoutY(baseY: number, height: number): number {
  const sink = Math.min(
    MAX_CUTOUT_SINK,
    Math.max(MIN_CUTOUT_SINK, height * CUTOUT_GROUND_SINK_RATIO),
  );
  return baseY + height / 2 - sink;
}

export function shadowed<T extends THREE.Mesh>(mesh: T): T {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Lets alpha-cut paper cast shaped shadows instead of rectangles. */
export function applyAlphaShadow(mesh: THREE.Mesh, texture: THREE.Texture, alphaTest = 0.03) {
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
    alphaMap: texture,
    alphaTest,
    depthPacking: THREE.RGBADepthPacking,
  });
}

export function createSheet(
  width: number,
  depth: number,
  material: THREE.Material,
  position: THREE.Vector3Tuple,
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, 0.035, depth);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createWall(
  width: number,
  height: number,
  material: THREE.Material,
  position: THREE.Vector3Tuple,
  rotationY = 0,
): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(width, height, 0.05);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createWindowWall(
  width: number,
  height: number,
  material: THREE.Material,
  position: THREE.Vector3Tuple,
  rotationY: number,
  hole: { x: number; y: number; width: number; height: number },
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  group.rotation.y = rotationY;

  const left = -width / 2;
  const right = width / 2;
  const bottom = -height / 2;
  const top = height / 2;
  const holeLeft = hole.x - hole.width / 2;
  const holeRight = hole.x + hole.width / 2;
  const holeBottom = hole.y - position[1] - hole.height / 2;
  const holeTop = hole.y - position[1] + hole.height / 2;

  const addPiece = (pieceWidth: number, pieceHeight: number, x: number, y: number) => {
    if (pieceWidth <= 0 || pieceHeight <= 0) return;
    const piece = new THREE.Mesh(new THREE.BoxGeometry(pieceWidth, pieceHeight, 0.05), material);
    piece.position.set(x, y, 0);
    piece.castShadow = true;
    piece.receiveShadow = true;
    group.add(piece);
  };

  addPiece(holeLeft - left, height, (left + holeLeft) / 2, 0);
  addPiece(right - holeRight, height, (holeRight + right) / 2, 0);
  addPiece(hole.width, holeBottom - bottom, hole.x, (bottom + holeBottom) / 2);
  addPiece(hole.width, top - holeTop, hole.x, (holeTop + top) / 2);

  return group;
}

export function createRoofFace(
  width: number,
  material: THREE.Material,
  centerX: number,
  ridgeY: number,
  eaveY: number,
  ridgeZ: number,
  eaveZ: number,
): THREE.Mesh {
  const halfWidth = width / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [
        centerX - halfWidth, ridgeY, ridgeZ,
        centerX + halfWidth, ridgeY, ridgeZ,
        centerX - halfWidth, eaveY, eaveZ,
        centerX + halfWidth, eaveY, eaveZ,
      ],
      3,
    ),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  geometry.setIndex([0, 2, 1, 2, 3, 1]);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createCutout(options: CutoutOptions): THREE.Mesh {
  const entry = getCutoutMaterial(
    options.textureUrl,
    options.alphaTest ?? 0.03,
    options.opacity ?? 1,
  );

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(options.height * options.aspectRatio, options.height),
    entry.material,
  );
  mesh.position.set(...options.position);
  mesh.rotation.y = options.rotationY ?? 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.customDepthMaterial = entry.depthMaterial;
  return mesh;
}

/** Non-interactive scenery cutout: no shadows, drawn behind the world. */
export function createScenicCutout(options: CutoutOptions, renderOrder: number): THREE.Mesh {
  const mesh = createCutout({
    ...options,
    alphaTest: options.alphaTest ?? 0.02,
  });
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = renderOrder;
  return mesh;
}
