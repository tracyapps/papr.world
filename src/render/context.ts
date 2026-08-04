import * as THREE from 'three';

// Owns the WebGL context, scene, camera, loaders, and clock.
// Everything renderer-global lives here so other modules stay focused.

const canvasElement = document.querySelector<HTMLCanvasElement>('#game');

if (!canvasElement) {
  throw new Error('Game canvas was not found.');
}

export const canvas = canvasElement;

export const PAPER_SKY = '#ece6d4';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(PAPER_SKY);
// Tracing-paper haze: distant scenery fades into the paper sky color.
// Far value sits beyond the outer backdrop ring so mountains stay
// ghost-visible instead of vanishing entirely.
scene.fog = new THREE.Fog(PAPER_SKY, 55, 225);

export const renderer = new THREE.WebGLRenderer({
  antialias: true,
  canvas,
  alpha: false,
});

// A 2x Retina buffer contains four times as many pixels as a 1x buffer. The
// softer paper art remains crisp at 1.5x while substantially reducing GPU load.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

export const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 340);
camera.position.set(8, 7, 8);

export const textureLoader = new THREE.TextureLoader();
export const clock = new THREE.Clock();

export function resizeRenderer() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
