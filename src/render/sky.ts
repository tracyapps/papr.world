import * as THREE from 'three';
import { scene } from './context';
import { RENDER_ORDER } from './renderOrder';
import { tintAmbientSky } from './lighting';

// Paper sky: a big gradient dome (warm horizon up into soft blue) whose
// palette drifts very gradually through a handful of gentle daytime moods.
// Not a day/night cycle — the world never goes dark, the sky just
// wanders between blues the way construction paper varies sheet to sheet.

/** One full drift through all palettes and back to the start. */
const CYCLE_SECONDS = 12 * 60;

type SkyPalette = {
  horizon: THREE.Color;
  zenith: THREE.Color;
};

/** Gentle paper-toned stops. The cycle loops, so last blends back to first. */
const PALETTES: SkyPalette[] = [
  { horizon: new THREE.Color('#f2ead2'), zenith: new THREE.Color('#a9c9e2') }, // soft morning blue
  { horizon: new THREE.Color('#eee9d4'), zenith: new THREE.Color('#8cbcdf') }, // clearer midday blue
  { horizon: new THREE.Color('#f4e4c6'), zenith: new THREE.Color('#9db9d8') }, // dusty warm afternoon
  { horizon: new THREE.Color('#eddccd'), zenith: new THREE.Color('#a7afda') }, // lavender-leaning
];

const SKY_RADIUS = 330;

let skyDome: THREE.Mesh | null = null;
let skyUniforms: {
  horizonColor: { value: THREE.Color };
  zenithColor: { value: THREE.Color };
} | null = null;

const currentHorizon = new THREE.Color();
const currentZenith = new THREE.Color();

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

function samplePalette(elapsed: number) {
  const cyclePosition = ((elapsed % CYCLE_SECONDS) / CYCLE_SECONDS) * PALETTES.length;
  const index = Math.floor(cyclePosition) % PALETTES.length;
  const next = (index + 1) % PALETTES.length;
  const blend = smoothstep(cyclePosition - Math.floor(cyclePosition));

  currentHorizon.copy(PALETTES[index].horizon).lerp(PALETTES[next].horizon, blend);
  currentZenith.copy(PALETTES[index].zenith).lerp(PALETTES[next].zenith, blend);
}

export function buildSky() {
  skyUniforms = {
    horizonColor: { value: new THREE.Color(PALETTES[0].horizon) },
    zenithColor: { value: new THREE.Color(PALETTES[0].zenith) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldDirection;
      void main() {
        vWorldDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 horizonColor;
      uniform vec3 zenithColor;
      varying vec3 vWorldDirection;
      void main() {
        // Horizon color below and near the horizon, easing up into zenith.
        float up = clamp(vWorldDirection.y, 0.0, 1.0);
        float blend = pow(up, 0.78);
        gl_FragColor = vec4(mix(horizonColor, zenithColor, blend), 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  skyDome = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 32, 18), material);
  skyDome.renderOrder = RENDER_ORDER.sky;
  skyDome.frustumCulled = false;
  scene.add(skyDome);
}

export function updateSky(avatarPosition: THREE.Vector3, elapsed: number) {
  if (!skyDome || !skyUniforms) return;

  // The dome rides along, so the sky never has an edge.
  skyDome.position.set(avatarPosition.x, 0, avatarPosition.z);

  samplePalette(elapsed);
  skyUniforms.horizonColor.value.copy(currentHorizon);
  skyUniforms.zenithColor.value.copy(currentZenith);

  // Keep the haze fading into whatever the sky is doing right now.
  if (scene.fog) {
    scene.fog.color.copy(currentHorizon);
  }
  if (scene.background instanceof THREE.Color) {
    scene.background.copy(currentHorizon);
  }

  // A whisper of the zenith blue in the ambient light sells the mood
  // shift without ever dimming the craft table.
  tintAmbientSky(currentZenith, 0.14);
}
