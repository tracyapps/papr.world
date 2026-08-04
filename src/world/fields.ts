import type { MaterialKey } from '../render/materials';
import type { Biome } from './types';

// Continuous world fields.
//
// Biome used to be one value per page, chosen by hashing the page's
// coordinates. Neighbouring pages were therefore uncorrelated: forest could
// sit hard against scrapflats with a straight seam exactly on the page
// border. That is what made the world read as a grid, and it also made
// transitions impossible — there was nowhere for a boundary to *be* except
// the edge of a page.
//
// These are functions of world position instead. Two consequences follow, and
// they are the whole point:
//
//   1. Neighbouring pages agree because they read the same function, not
//      because they negotiate. Determinism is preserved for multiplayer
//      without syncing anything.
//   2. A boundary can fall anywhere — mid-page, at an angle, in a ragged
//      tear — because nothing about it is tied to the page lattice.
//
// The biome *palettes* are unchanged. Forest, meadow, dunes and scrapflats
// still look like they always did; the field decides where they are and how
// they meet, not what they are.

/** Deterministic 2D value hash, −1..1. No allocation, no state. */
function hash2(x: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x7fffffff - 1;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise over a unit lattice. */
function valueNoise(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = smoothstep(x - x0);
  const fz = smoothstep(z - z0);

  const n00 = hash2(x0, z0, seed);
  const n10 = hash2(x0 + 1, z0, seed);
  const n01 = hash2(x0, z0 + 1, seed);
  const n11 = hash2(x0 + 1, z0 + 1, seed);

  const top = n00 + (n10 - n00) * fx;
  const bottom = n01 + (n11 - n01) * fx;
  return top + (bottom - top) * fz;
}

/** Layered noise. `octaves` adds detail; each is half the amplitude, double the frequency. */
function fbm(x: number, z: number, seed: number, octaves: number): number {
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let normalisation = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise(x * frequency, z * frequency, seed + octave * 101) * amplitude;
    normalisation += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return total / normalisation;
}

// --- Tuning ---------------------------------------------------------------
// All distances are in world units. PAGE_SIZE is 50, so a scale of 140 means
// a region spans roughly three pages.

/** How far you walk before the landscape becomes a different kind of place. */
const BIOME_SCALE = 165;
/** Second field, offset from the first, so regions are not all round blobs. */
const BIOME_SCALE_B = 96;
/**
 * Ragged-edge distortion. Boundaries are found by *displacing the sample
 * point* before asking which biome it is, so a straight border becomes a torn
 * one. Higher frequency and amplitude make a rougher tear.
 */
const TEAR_SCALE = 17;
const TEAR_STRENGTH = 13;
/** A second, finer tear so edges have detail at more than one size. */
const TEAR_DETAIL_SCALE = 5.5;
const TEAR_DETAIL_STRENGTH = 3.1;

/** Broad highland/lowland shape. */
const ELEVATION_SCALE = 210;
/** Rolling variation within a region. */
const RELIEF_SCALE = 61;
/** Peak height of the broad field, in world units. */
const ELEVATION_AMPLITUDE = 5.2;
const RELIEF_AMPLITUDE = 1.35;

/**
 * The starting clearing sits in a calm basin.
 *
 * Partly design — the first place you stand should be gentle, and the world
 * should get more dramatic as you travel — and partly safety: the clearing's
 * house, Thing Maker, pond, and signposts are hand-placed against terrain
 * that was flat when they were positioned.
 */
const HOME_CALM_RADIUS = 62;

function homeCalm(x: number, z: number): number {
  const distance = Math.hypot(x, z);
  if (distance >= HOME_CALM_RADIUS) return 1;
  return smoothstep(distance / HOME_CALM_RADIUS);
}

/** Displace a sample point so biome boundaries tear instead of curving. */
function tearWarp(x: number, z: number): { x: number; z: number } {
  return {
    x: x
      + fbm(x / TEAR_SCALE, z / TEAR_SCALE, 4021, 2) * TEAR_STRENGTH
      + fbm(x / TEAR_DETAIL_SCALE, z / TEAR_DETAIL_SCALE, 991, 2) * TEAR_DETAIL_STRENGTH,
    z: z
      + fbm(x / TEAR_SCALE + 31.7, z / TEAR_SCALE - 12.3, 5507, 2) * TEAR_STRENGTH
      + fbm(x / TEAR_DETAIL_SCALE - 7.1, z / TEAR_DETAIL_SCALE + 4.4, 1237, 2) * TEAR_DETAIL_STRENGTH,
  };
}

/**
 * Ground elevation from the world fields, before any authored hills or
 * player edits. Highlands, lowlands, and the rolling between them.
 */
export function fieldElevationAt(x: number, z: number): number {
  const broad = fbm(x / ELEVATION_SCALE, z / ELEVATION_SCALE, 8803, 3);
  const relief = fbm(x / RELIEF_SCALE, z / RELIEF_SCALE, 2213, 3);

  // Ridged: fold the broad field so highlands have flat-ish tops and valleys
  // have soft floors, instead of everything being one smooth swell.
  const ridged = 1 - Math.abs(broad);
  const elevation = (ridged - 0.45) * ELEVATION_AMPLITUDE + relief * RELIEF_AMPLITUDE;

  return elevation * homeCalm(x, z);
}

/** 0..1 where 1 is the highest ground in the world. Drives the map overlay. */
export function elevationBandAt(x: number, z: number): number {
  const raw = fieldElevationAt(x, z);
  return Math.max(0, Math.min(1, (raw + 2.4) / (ELEVATION_AMPLITUDE + 2.4)));
}

/**
 * Ground paper per biome. Lives here rather than in pageRuntime so that both
 * the renderer and the generator can read it: importing it from pageRuntime
 * created a cycle (pageRuntime → terrain → pages → generate → pageRuntime).
 */
export const BIOME_GROUND_MATERIALS: Record<Biome, MaterialKey> = {
  clearing: 'ground.clearing',
  forest: 'ground.forest',
  meadow: 'ground.meadow',
  dunes: 'ground.dunes',
  scrapflats: 'ground.clearing',
};

const BIOME_ORDER: Biome[] = ['meadow', 'forest', 'dunes', 'scrapflats'];

export type BiomeBlend = {
  /** Strongest biome at this point. */
  primary: Biome;
  /** Runner-up, for blending across a boundary. */
  secondary: Biome;
  /**
   * 0 at the heart of `primary`, approaching 0.5 at a boundary. Used as the
   * blend amount, so a torn edge fades rather than snapping.
   */
  blend: number;
};

/**
 * Raw per-biome weights at a point, summing to 1.
 *
 * Two low-frequency fields act as loose "moisture" and "roughness" axes; each
 * biome claims a region of that space. Reading two fields rather than one is
 * what stops regions arriving in a fixed repeating order as you walk.
 */
export function biomeWeightsAt(x: number, z: number): Record<Biome, number> {
  const warped = tearWarp(x, z);
  const moisture = fbm(warped.x / BIOME_SCALE, warped.z / BIOME_SCALE, 3301, 2);
  const roughness = fbm(warped.x / BIOME_SCALE_B + 91.3, warped.z / BIOME_SCALE_B - 44.9, 6607, 2);
  const height = elevationBandAt(x, z);

  // Affinities, before normalising. Each is a soft preference rather than a
  // hard rule, so biomes overlap and can produce mixed ground.
  // Tuned by sampling a 2400-unit square and checking the resulting mix.
  // A first pass left meadow at 57% and forest at 12% — the plainest biome
  // dominating and the most interesting one (redwoods live there) starved.
  // A second overcorrected to 38% forest, which is both visually heavy and
  // the densest biome to render.
  //
  // Current mix, and the number to re-check after any change here:
  //   meadow 42% · dunes 23% · scrapflats 17% · forest 18%
  //
  // Meadow leads deliberately: it is the connective tissue that the other
  // three read as arrivals *from*.
  const scores: Record<Biome, number> = {
    // Damp and mid-height: the gentle country that joins everything else.
    meadow: 0.9 - Math.abs(moisture - 0.16) * 2.0 - Math.abs(height - 0.45) * 0.65,
    // Damp and rough, favouring higher ground.
    forest: 0.9 - Math.abs(moisture - 0.48) * 1.7 - Math.abs(roughness - 0.32) * 1.1 + height * 0.45,
    // Dry, smooth, and low — sand collects in the basins.
    dunes: 0.78 - Math.abs(moisture + 0.5) * 1.75 - Math.abs(roughness + 0.18) * 1.05 + (1 - height) * 0.45,
    // Dry and rough.
    scrapflats: 0.86 - Math.abs(moisture + 0.1) * 1.5 - Math.abs(roughness - 0.5) * 1.15,
    // The clearing is authored, never generated by the field.
    clearing: -Infinity,
  };

  // Softmax-ish: sharpen so one biome usually dominates, but leave enough
  // overlap that boundaries have width to blend across.
  const weights: Record<Biome, number> = {
    meadow: 0, forest: 0, dunes: 0, scrapflats: 0, clearing: 0,
  };
  let total = 0;
  for (const biome of BIOME_ORDER) {
    const weight = Math.exp(scores[biome] * 3.4);
    weights[biome] = weight;
    total += weight;
  }
  for (const biome of BIOME_ORDER) weights[biome] /= total;
  return weights;
}

/** Primary and secondary biome at a point, plus how mixed it is. */
export function biomeBlendAt(x: number, z: number): BiomeBlend {
  const weights = biomeWeightsAt(x, z);
  let primary: Biome = 'meadow';
  let secondary: Biome = 'forest';
  let best = -1;
  let second = -1;

  for (const biome of BIOME_ORDER) {
    const weight = weights[biome];
    if (weight > best) {
      second = best;
      secondary = primary;
      best = weight;
      primary = biome;
    } else if (weight > second) {
      second = weight;
      secondary = biome;
    }
  }

  // Blend is the runner-up's share of the two leaders. 0 deep inside a
  // region, near 0.5 where two meet.
  const blend = best + second > 0 ? second / (best + second) : 0;
  return { primary, secondary, blend };
}

export function dominantBiomeAt(x: number, z: number): Biome {
  return biomeBlendAt(x, z).primary;
}

/**
 * How strongly a point belongs to its primary biome, 0..1.
 *
 * Generators use this to thin out props near a boundary, so a forest does not
 * stop dead at the edge of the trees — it gets sparser as the meadow takes
 * over.
 */
export function biomeConfidenceAt(x: number, z: number): number {
  const { blend } = biomeBlendAt(x, z);
  return Math.max(0, Math.min(1, 1 - blend * 2));
}
