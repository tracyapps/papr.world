import { createRng } from '../core/math';

// Critter "DNA": every individual is generated from a seed, so the same
// page always produces the same critters (and multiplayer clients will
// agree without syncing). Variation comes from swapping paper textures,
// colors, scale, speed, shyness, and a name.

export type CritterSpecies = 'squirrel' | 'butterfly' | 'raccoon' | 'bunny' | 'bird' | 'cat' | 'woodchuck' | 'meerkat';

export type PersonalityTrait =
  | 'bold'
  | 'curious'
  | 'dramatic'
  | 'gentle'
  | 'mischievous'
  | 'shy'
  | 'sleepy';

export type CritterParams = {
  name: string;
  /** Overall size multiplier. */
  scale: number;
  /** Ground speed (units/sec) or flight drift speed. */
  speed: number;
  /** Animation phase offset so herds don't move in lockstep. */
  animOffset: number;
  /** 0 = bold (approaches sooner), 1 = shy. Friendship lowers this later. */
  shyness: number;
  /** How far from home this critter roams. */
  wanderRadius: number;
  /** Main body texture (null = plain color). */
  bodyTextureUrl: string | null;
  bodyColor: string;
  accentColor: string;
  /** Two seeded writing/behavior tags used by the conversation engine. */
  personality: [PersonalityTrait, PersonalityTrait];
};

type Coat = { url: string | null; color: string; accent: string };

const M = '/assets/runtime/materials';

/** Paper coats per species. Body texture + tint + accent color. */
const COATS: Record<CritterSpecies, Coat[]> = {
  squirrel: [
    { url: `${M}/construction-paper-brown-1.png`, color: '#ffffff', accent: '#d9bd82' },
    { url: `${M}/construction-paper-brown-2.png`, color: '#ffffff', accent: '#e8d6a8' },
    { url: `${M}/construction-paper-brown-3.png`, color: '#ffffff', accent: '#cbb58a' },
    { url: `${M}/cork-board.png`, color: '#ffffff', accent: '#e3ceA2' },
  ],
  butterfly: [
    { url: `${M}/folded-stripes-blue-purple-pink-white.png`, color: '#ffffff', accent: '#2a211b' },
    { url: `${M}/folded-stripes-yellow-pink-purple.png`, color: '#ffffff', accent: '#3a2c20' },
    { url: `${M}/folded-stripes-blue-green-yellow.png`, color: '#ffffff', accent: '#25301e' },
    { url: `${M}/curving-deeper-rainbow.png`, color: '#ffffff', accent: '#2a211b' },
    { url: `${M}/subtle-bubbles-pinkyellows.png`, color: '#ffffff', accent: '#40302a' },
    { url: `${M}/ribbon-weave-pink.png`, color: '#ffffff', accent: '#3c2434' },
    { url: `${M}/subtle-bubbles-purplepinks.png`, color: '#ffffff', accent: '#332338' },
  ],
  raccoon: [
    { url: null, color: '#8d8781', accent: '#2b2622' }, // classic gray
    { url: null, color: '#9a938c', accent: '#332d27' }, // lighter gray
    { url: null, color: '#7c766f', accent: '#241f1b' }, // dusky
    { url: `${M}/wooden-floor-grey.png`, color: '#b9b2a8', accent: '#2b2622' }, // papery gray grain
    { url: `${M}/argyle-child-bluegreen.png`, color: '#c9c4bb', accent: '#2b2622' }, // fancy sweater raccoon
  ],
  bunny: [
    { url: `${M}/construction-paper-blue-1.png`, color: '#ffffff', accent: '#e8b7c6' },
    { url: `${M}/construction-paper-green-2.png`, color: '#ffffff', accent: '#f0d9e2' },
    { url: `${M}/construction-paper-brown-2.png`, color: '#ffffff', accent: '#e8c9d2' },
    { url: `${M}/subtle-bubbles-blues.png`, color: '#ffffff', accent: '#dfb4c4' },
    { url: null, color: '#e9e2d2', accent: '#e8b7c6' }, // plain cream bunny
  ],
  bird: [
    { url: `${M}/wrapping-paper-circles-01.png`, color: '#ffffff', accent: '#f0b548' },
    { url: `${M}/ribbon-weave-salmon.png`, color: '#ffffff', accent: '#e0902f' },
    { url: `${M}/3d-squares-aqua.png`, color: '#ffffff', accent: '#f2c14e' },
    { url: `${M}/3d-squares-pink.png`, color: '#ffffff', accent: '#e8a03c' },
    { url: `${M}/curving-deeper-blues.png`, color: '#ffffff', accent: '#efb54a' },
  ],
  cat: [
    { url: `${M}/wrapping-paper-orange-01.png`, color: '#ffffff', accent: '#e8a7b0' }, // orange tabby
    { url: `${M}/camouflage-blobs-desert.png`, color: '#ffffff', accent: '#e0949e' }, // calico
    { url: null, color: '#8f8a84', accent: '#e8a7b0' }, // gray
    { url: null, color: '#332e2a', accent: '#d99aa6' }, // black cat
    { url: null, color: '#e9dfc9', accent: '#e0949e' }, // cream
    { url: `${M}/monstera-patch.png`, color: '#ffffff', accent: '#e8a7b0' }, // houseplant cat (quirky)
  ],
  woodchuck: [
    { url: null, color: '#9a6b43', accent: '#ead9b5' },
    { url: null, color: '#80583b', accent: '#e6cf9d' },
    { url: null, color: '#b07a4d', accent: '#f3dfb1' },
  ],
  meerkat: [
    { url: null, color: '#c9a06a', accent: '#3a2c22' }, // classic sandy tan
    { url: `${M}/construction-paper-brown-2.png`, color: '#d9b781', accent: '#372a20' }, // papery tan grain
    { url: null, color: '#b98f5c', accent: '#2e2219' }, // darker desert tan
    { url: null, color: '#dcc192', accent: '#40311f' }, // pale sand
  ],
};

/** Cozy craft-table names. Seeded pick; duplicates across the world are fine. */
const NAMES = [
  'Button', 'Pippin', 'Waffles', 'Doodle', 'Crumple', 'Snips', 'Maple',
  'Biscuit', 'Margin', 'Scribble', 'Origami', 'Clover', 'Pockets', 'Tofu',
  'Stamp', 'Ribbon', 'Pesto', 'Noodle', 'Bramble', 'Pudding', 'Sketch',
  'Freckle', 'Mochi', 'Tinsel', 'Acorn', 'Paisley', 'Smudge', 'Wicket',
  'Fig', 'Poppy', 'Gadget', 'Marbles', 'Stapler', 'Confetti', 'Dumpling',
  'Bandit', 'Peanut', 'Olive', 'Tater', 'Ziggy',
];

/** Species behavior baselines (see docs/critter-design.md for rationale). */
const BASE: Record<CritterSpecies, { speed: number; wander: number }> = {
  squirrel: { speed: 1.7, wander: 7 },
  butterfly: { speed: 0.9, wander: 5 },
  raccoon: { speed: 1.2, wander: 9 },
  bunny: { speed: 1.9, wander: 8 },
  bird: { speed: 1.5, wander: 10 },
  cat: { speed: 1.5, wander: 9 },
  woodchuck: { speed: 1.05, wander: 5 },
  // Quick, but a mob sentry doesn't wander far from the burrow.
  meerkat: { speed: 1.35, wander: 5.5 },
};

const SECONDARY_TRAITS: PersonalityTrait[] = [
  'curious', 'dramatic', 'gentle', 'mischievous', 'sleepy', 'bold',
];

export function generateCritterParams(species: CritterSpecies, seed: number): CritterParams {
  const rng = createRng(seed);
  const coats = COATS[species];
  const coat = coats[Math.floor(rng() * coats.length)];
  const base = BASE[species];

  // Cats are aloof by reputation and by code: higher shyness floor, but
  // the bold ones are VERY bold.
  const shyness = species === 'cat' ? 0.25 + rng() * 0.75 : rng() * 0.9;
  // Preserve the established deterministic identity sequence. Personality
  // consumes new random values only after all pre-existing DNA fields have
  // been generated, so an update never renames or resizes familiar residents.
  const name = NAMES[Math.floor(rng() * NAMES.length)];
  const scale = 0.82 + rng() * 0.4;
  const speed = base.speed * (0.85 + rng() * 0.3);
  const animOffset = rng() * Math.PI * 2;
  const wanderRadius = base.wander * (0.8 + rng() * 0.5);
  const primary: PersonalityTrait = shyness > 0.68 ? 'shy' : shyness < 0.24 ? 'bold' : 'curious';
  let secondary = SECONDARY_TRAITS[Math.floor(rng() * SECONDARY_TRAITS.length)];
  if (secondary === primary) {
    secondary = SECONDARY_TRAITS[(SECONDARY_TRAITS.indexOf(secondary) + 1) % SECONDARY_TRAITS.length];
  }

  return {
    name,
    scale,
    speed,
    animOffset,
    shyness,
    wanderRadius,
    bodyTextureUrl: coat.url,
    bodyColor: coat.color,
    accentColor: coat.accent,
    personality: [primary, secondary],
  };
}

/** Minimap dot colors per species. */
export const SPECIES_MAP_COLORS: Record<CritterSpecies, string> = {
  squirrel: '#a8733b',
  butterfly: '#d879c5',
  raccoon: '#6e6862',
  bunny: '#c48fa4',
  bird: '#4f8fb8',
  cat: '#c77b3f',
  woodchuck: '#9b683d',
  meerkat: '#c9a06a',
};
