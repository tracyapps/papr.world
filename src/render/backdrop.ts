import * as THREE from 'three';
import { createRng } from '../core/math';
import { scene, textureLoader } from './context';
import { RENDER_ORDER } from './renderOrder';

// Distance scenery: three overlapping rings of mountain and hill cutouts
// far outside the page grid, each drifting with its own parallax factor
// and fading into the tracing-paper fog. Never collidable, never clickable.
//
// Each cutout is sized from its texture's real pixel dimensions when the
// image loads, so panoramic mountain strips and squarer single hills all
// keep their intended proportions.
//
// A giant "paper skirt" disc rides underneath everything so the ground
// never visibly ends where page streaming stops.

const BACKDROP_SEED = 813205;

const MOUNTAIN_URLS = [
  '/assets/runtime/props/mountain-line-01.png',
  '/assets/runtime/props/mountain-line-02.png',
  '/assets/runtime/props/mountain-line-03.png',
  '/assets/runtime/props/mountain-line-04.png',
  '/assets/runtime/props/mountain-line-05.png',
];

const HILL_URLS = [
  '/assets/runtime/props/green-hills-01.png',
  '/assets/runtime/props/green-hills-02.png',
  '/assets/runtime/props/green-hills-03.png',
  '/assets/runtime/props/green-hills-04.png',
  '/assets/runtime/props/green-hills-05.png',
  '/assets/runtime/props/single-green-hill-01.png',
  '/assets/runtime/props/single-green-hill-02.png',
  '/assets/runtime/props/single-green-hill-03.png',
  '/assets/runtime/props/single-green-hill-04.png',
];

type RingSpec = {
  urls: string[];
  count: number;
  radius: number;
  radiusJitter: number;
  /**
   * Cutouts are sized by target WIDTH with a height cap. Panoramic strips
   * become long, low ridge lines; squarer artwork becomes smaller peaks
   * instead of ballooning into giant walls (the asset ratios range from
   * ~1.2:1 to ~3.8:1, so height-based sizing made squat files enormous).
   */
  width: number;
  widthJitter: number;
  maxHeight: number;
  /** How far the cutout's bottom edge sinks below ground level so it never floats. */
  sink: number;
  parallax: number;
  opacity: number;
  renderOrder: number;
};

const RING_SPECS: RingSpec[] = [
  // Far mountain line: ghostly through the fog.
  { urls: MOUNTAIN_URLS, count: 12, radius: 260, radiusJitter: 16, width: 92, widthJitter: 24, maxHeight: 22, sink: 1.4, parallax: 0.97, opacity: 0.92, renderOrder: RENDER_ORDER.backdropFar },
  // Middle ridge: mountains and large hills mixed, half-hazed.
  { urls: [...MOUNTAIN_URLS.slice(0, 3), ...HILL_URLS.slice(0, 5)], count: 12, radius: 225, radiusJitter: 12, width: 52, widthJitter: 16, maxHeight: 14, sink: 1.0, parallax: 0.93, opacity: 0.96, renderOrder: RENDER_ORDER.backdropMid },
  // Near hills: mostly clear, lots of overlap.
  { urls: HILL_URLS, count: 14, radius: 190, radiusJitter: 10, width: 22, widthJitter: 8, maxHeight: 9, sink: 0.8, parallax: 0.86, opacity: 1, renderOrder: RENDER_ORDER.backdropNear },
];

type BackdropRing = {
  group: THREE.Group;
  parallax: number;
};

const rings: BackdropRing[] = [];
let groundSkirt: THREE.Mesh | null = null;

/**
 * A scenic cutout plane sized from the texture's true pixel ratio once
 * the image loads: target width, capped height. If the cap kicks in, the
 * whole cutout shrinks proportionally rather than distorting.
 */
function createAutoSizedCutout(
  url: string,
  width: number,
  maxHeight: number,
  sink: number,
  opacity: number,
  renderOrder: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), undefined);
  // Placeholder scale until the image reports its dimensions.
  const placeholderHeight = Math.min(width / 2.5, maxHeight);
  mesh.scale.set(width, placeholderHeight, 1);
  mesh.position.y = placeholderHeight / 2 - sink;

  const texture = textureLoader.load(url, (loaded) => {
    const image = loaded.image as { width?: number; height?: number } | undefined;
    if (image?.width && image?.height) {
      const ratio = image.width / image.height;
      let finalHeight = width / ratio;
      let finalWidth = width;
      if (finalHeight > maxHeight) {
        finalHeight = maxHeight;
        finalWidth = maxHeight * ratio;
      }
      mesh.scale.set(finalWidth, finalHeight, 1);
      mesh.position.y = finalHeight / 2 - sink;
    }
  });
  texture.colorSpace = THREE.SRGBColorSpace;

  mesh.material = new THREE.MeshStandardMaterial({
    alphaTest: 0.02,
    depthWrite: false,
    map: texture,
    metalness: 0,
    opacity,
    roughness: 0.94,
    side: THREE.DoubleSide,
    transparent: true,
  });
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = renderOrder;
  return mesh;
}

function buildRing(spec: RingSpec, rng: () => number): THREE.Group {
  const group = new THREE.Group();

  for (let index = 0; index < spec.count; index += 1) {
    // Even spacing with jitter, so silhouettes overlap naturally instead
    // of repeating like a pattern.
    const angle = (index / spec.count) * Math.PI * 2 + (rng() - 0.5) * 0.42;
    const radius = spec.radius + (rng() - 0.5) * 2 * spec.radiusJitter;
    const width = spec.width + (rng() - 0.5) * 2 * spec.widthJitter;
    const url = spec.urls[Math.floor(rng() * spec.urls.length)];

    const cutout = createAutoSizedCutout(url, width, spec.maxHeight, spec.sink, spec.opacity, spec.renderOrder);
    cutout.position.x = Math.sin(angle) * radius;
    cutout.position.z = Math.cos(angle) * radius;
    cutout.rotation.y = angle;
    group.add(cutout);
  }

  return group;
}

export function buildBackdrop() {
  const rng = createRng(BACKDROP_SEED);

  for (const spec of RING_SPECS) {
    const group = buildRing(spec, rng);
    rings.push({ group, parallax: spec.parallax });
    scene.add(group);
  }

  // Paper skirt: sits just below the page sheets and stretches past the
  // farthest backdrop ring, so there is never a visible edge of the world.
  groundSkirt = new THREE.Mesh(
    new THREE.CircleGeometry(330, 64),
    new THREE.MeshStandardMaterial({ color: '#d9cfae', metalness: 0, roughness: 1 }),
  );
  groundSkirt.rotation.x = -Math.PI / 2;
  groundSkirt.position.y = -0.32;
  scene.add(groundSkirt);
}

export function updateBackdrop(avatarPosition: THREE.Vector3) {
  for (const ring of rings) {
    ring.group.position.set(
      avatarPosition.x * ring.parallax,
      0,
      avatarPosition.z * ring.parallax,
    );
  }
  if (groundSkirt) {
    groundSkirt.position.set(avatarPosition.x, -0.32, avatarPosition.z);
  }
}
