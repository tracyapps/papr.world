import type {
  TrinketDef,
  TrinketFamilyId,
  TrinketMotionId,
  TrinketPartId,
  TrinketShapeId,
} from './trinkets';

/**
 * Kept local rather than imported: `trinkets.ts` imports this module's data,
 * so importing a value back would be a cycle resolved too early to be useful.
 * Type-only imports above are erased at build, which is why they are safe.
 */
const WINDUP_SHAPES: readonly TrinketShapeId[] = [
  'windup-mouse', 'windup-bird', 'windup-fox', 'windup-cat', 'windup-bunny',
  'windup-frog', 'windup-duck', 'windup-bear', 'windup-beetle', 'windup-fish',
];

/**
 * The generated half of the trinket catalog.
 *
 * The authored trinkets in `trinkets.ts` are the ones with a sentence worth
 * reading. These are the ones that make a collection feel bottomless: every
 * one is a bounded, deterministic recombination of the *same* vocabulary —
 * shape, motion, palette, parts — so nothing here is invented, only arranged.
 *
 * Why generated rather than authored:
 *
 * - **Volume without drift.** A cozy collector wants hundreds of small
 *   differences, and hundreds of hand-written entries rot the moment a colour
 *   is retuned. Two lists (shapes, palettes) plus a fixed mix keeps every
 *   output on-style by construction.
 * - **Determinism.** Ids and appearances are derived from the shape/palette
 *   index, never from `Math.random`, so a save that points at
 *   `gen-pebble-rosewood-bob` still finds it after a reload or a rebuild, and
 *   two clients agree on what it looks like.
 * - **Open-ended growth.** Adding one colourway or one shape multiplies the
 *   pool automatically. Adding trinkets at scale is editing two arrays.
 *
 * The pool is deliberately larger than any one player will ever hold: the
 * "no duplicates" rule in `pickTrinketDef` is only satisfiable if the supply
 * outruns the demand by a wide margin.
 */

type PaletteSeed = {
  name: string;
  base: string;
  accent: string;
  detail: string;
  textureUrl?: string;
  /** Matches the authored 'seasonal:*' tags when a colourway is themed. */
  season?: string;
};

const M = '/assets/runtime/materials';

const PALETTES: PaletteSeed[] = [
  { name: 'Rosewood', base: '#b45e67', accent: '#8a3b47', detail: '#f0c9cf' },
  { name: 'Kraft', base: '#c1935f', accent: '#8a5f33', detail: '#f0dcb8', textureUrl: `${M}/construction-paper-brown-2.png` },
  { name: 'Notebook', base: '#f4f1e8', accent: '#c2bdb0', detail: '#4f7ab8' },
  { name: 'Cork', base: '#b1824f', accent: '#7a5531', detail: '#5c3f24', textureUrl: `${M}/cork-board.png` },
  { name: 'Confetti', base: '#e0a0c0', accent: '#c07a9c', detail: '#f7e0ee' },
  { name: 'Pond', base: '#6f8fbd', accent: '#41608a', detail: '#c7d7ec' },
  { name: 'Moss', base: '#5b8849', accent: '#3d6330', detail: '#a8c98d' },
  { name: 'Brass', base: '#c9903c', accent: '#8f6624', detail: '#f0d79a' },
  { name: 'Terracotta', base: '#c1531f', accent: '#8a3a16', detail: '#f0d5a1' },
  { name: 'Chalk', base: '#dfe3e8', accent: '#aab2bb', detail: '#f7f9fb' },
  { name: 'Graphite', base: '#8d8781', accent: '#5b5550', detail: '#c9c2ba' },
  { name: 'Sunbleach', base: '#e8d6a8', accent: '#c2ab74', detail: '#fbf1d8' },
  { name: 'Argyle', base: '#c9c4bb', accent: '#8f8a84', detail: '#4f7a8a', textureUrl: `${M}/argyle-child-bluegreen.png` },
  { name: 'Bubblegum', base: '#e58fb4', accent: '#bf5f8c', detail: '#fbdcea', textureUrl: `${M}/subtle-bubbles-pinkyellows.png` },
  { name: 'Ribbon', base: '#d98cb1', accent: '#b0568a', detail: '#f6dcea', textureUrl: `${M}/ribbon-weave-pink.png` },
  { name: 'Monstera', base: '#4f7f5a', accent: '#2f5a3c', detail: '#a8d0a0', textureUrl: `${M}/monstera-patch.png` },
  { name: 'Camo', base: '#b9a878', accent: '#8a7a4f', detail: '#e6dcc0', textureUrl: `${M}/camouflage-blobs-desert.png` },
  { name: 'Clementine', base: '#e08a3c', accent: '#b0621f', detail: '#f7d9a8', textureUrl: `${M}/wrapping-paper-orange-01.png` },
  { name: 'Weave', base: '#d7a0a0', accent: '#b06060', detail: '#f7e0e0', textureUrl: `${M}/ribbon-weave-salmon.png` },
  { name: 'Ring dot', base: '#8fb0c4', accent: '#5f8a9c', detail: '#dff0f4', textureUrl: `${M}/wrapping-paper-circles-01.png` },
  { name: 'Aquasquare', base: '#5fa8b8', accent: '#3d7a8a', detail: '#dff0f4', textureUrl: `${M}/3d-squares-aqua.png` },
  { name: 'Deep blue', base: '#3d5a94', accent: '#263c66', detail: '#a8c0e6', textureUrl: `${M}/curving-deeper-blues.png` },
  { name: 'Rainbow', base: '#d879c5', accent: '#9c4f9a', detail: '#f2c9ee', textureUrl: `${M}/curving-deeper-rainbow.png` },
  { name: 'Winterfrost', base: '#dff0f7', accent: '#a8cfe0', detail: '#ffffff', season: 'winter' },
  { name: 'Autumnash', base: '#d1663a', accent: '#9c4120', detail: '#f2c14e', season: 'autumn' },
  { name: 'Springbud', base: '#c98fb0', accent: '#9a6284', detail: '#e8cfe0', season: 'spring' },
  { name: 'Summerskip', base: '#9aa7a0', accent: '#6d7a73', detail: '#cdd7d2', season: 'summer' },
];

type ShapeSeed = {
  id: TrinketShapeId;
  label: string;
  /** Families this shape suits; the first is the default. */
  families: TrinketFamilyId[];
  motions: TrinketMotionId[];
  parts: TrinketPartId[][];
  /** Extra tags every variant of this shape carries. */
  tags: string[];
  rarity: 1 | 2 | 3;
};

const SHAPES: ShapeSeed[] = [
  { id: 'pebble', label: 'Pebble', families: ['natural', 'found'], motions: ['still', 'wobble'], parts: [[], ['glitter'], ['spots']], tags: ['material:stone'], rarity: 1 },
  { id: 'cube', label: 'Block', families: ['found', 'handmade'], motions: ['still', 'wobble', 'spin'], parts: [[], ['ribbon'], ['hat']], tags: ['paper'], rarity: 1 },
  { id: 'sphere', label: 'Orb', families: ['curious', 'natural'], motions: ['bob', 'spin'], parts: [[], ['glitter'], ['stem']], tags: ['keepsake'], rarity: 2 },
  { id: 'ring', label: 'Ring', families: ['found', 'curious'], motions: ['spin', 'wobble'], parts: [[], ['glitter']], tags: ['metal'], rarity: 2 },
  { id: 'cone', label: 'Fold', families: ['handmade'], motions: ['bob', 'still'], parts: [[], ['wings'], ['stem']], tags: ['paper', 'craft'], rarity: 1 },
  { id: 'star', label: 'Star', families: ['curious', 'found'], motions: ['spin', 'bob'], parts: [[], ['glitter', 'hat']], tags: ['metal'], rarity: 2 },
  { id: 'heart', label: 'Heart', families: ['story', 'seasonal'], motions: ['bob', 'sway'], parts: [[], ['ribbon'], ['stem']], tags: ['keepsake'], rarity: 2 },
  { id: 'leaf', label: 'Leaf', families: ['natural', 'seasonal'], motions: ['sway', 'still'], parts: [['stem'], ['stem', 'feather'], ['stem', 'stripes']], tags: ['plant'], rarity: 1 },
  { id: 'shell', label: 'Shell', families: ['natural'], motions: ['still'], parts: [[], ['glitter'], ['stripes']], tags: ['shell'], rarity: 2 },
  { id: 'key', label: 'Key', families: ['curious', 'found'], motions: ['still', 'wobble'], parts: [['glitter'], ['glitter', 'ribbon']], tags: ['metal'], rarity: 2 },
  { id: 'button', label: 'Button', families: ['found', 'story'], motions: ['spin', 'still'], parts: [['spots'], ['spots', 'glitter']], tags: ['button'], rarity: 1 },
  { id: 'grain', label: 'Grain', families: ['natural'], motions: ['still'], parts: [['stripes'], ['glitter']], tags: ['seed'], rarity: 1 },
  { id: 'crystal', label: 'Crystal', families: ['curious', 'seasonal'], motions: ['spin', 'still', 'sway'], parts: [['glitter'], ['glitter', 'stem']], tags: ['glass'], rarity: 3 },
  { id: 'spool', label: 'Spool', families: ['handmade'], motions: ['sway', 'spin'], parts: [['ribbon'], ['ribbon', 'glitter']], tags: ['craft', 'thread'], rarity: 2 },
  { id: 'bell', label: 'Bell', families: ['handmade', 'found'], motions: ['sway', 'wobble'], parts: [['ribbon'], ['glitter'], ['hat']], tags: ['sound'], rarity: 2 },
  { id: 'acorn', label: 'Acorn', families: ['natural', 'story'], motions: ['still', 'bob'], parts: [['stem'], ['stem', 'spots']], tags: ['material:wood'], rarity: 1 },
  { id: 'pinwheel', label: 'Pinwheel', families: ['handmade'], motions: ['spin'], parts: [['stem'], ['stem', 'glitter']], tags: ['toy', 'craft'], rarity: 2 },
  { id: 'thimble', label: 'Thimble', families: ['found', 'handmade'], motions: ['still', 'wobble'], parts: [['spots'], ['spots', 'glitter']], tags: ['metal', 'craft'], rarity: 2 },
];

type WindupSeed = {
  id: TrinketShapeId;
  label: string;
  parts: TrinketPartId[];
  tags: string[];
  rarity: 1 | 2 | 3;
};

const WINDUPS: WindupSeed[] = [
  { id: 'windup-mouse', label: 'Wind-up Mouse', parts: ['ears', 'tail', 'eyes', 'key'], tags: ['windup', 'toy'], rarity: 1 },
  { id: 'windup-bird', label: 'Wind-up Bird', parts: ['beak', 'eyes', 'wings', 'key'], tags: ['windup', 'toy'], rarity: 2 },
  { id: 'windup-fox', label: 'Wind-up Fox', parts: ['ears', 'tail', 'eyes', 'key'], tags: ['windup', 'toy'], rarity: 3 },
  { id: 'windup-cat', label: 'Wind-up Cat', parts: ['ears', 'tail', 'eyes', 'key'], tags: ['windup', 'toy'], rarity: 3 },
  { id: 'windup-bunny', label: 'Wind-up Bunny', parts: ['ears', 'eyes', 'tail', 'key'], tags: ['windup', 'toy'], rarity: 2 },
  { id: 'windup-frog', label: 'Wind-up Frog', parts: ['eyes', 'spots', 'key'], tags: ['windup', 'toy'], rarity: 2 },
  { id: 'windup-duck', label: 'Wind-up Duck', parts: ['beak', 'eyes', 'wings', 'key'], tags: ['windup', 'toy'], rarity: 2 },
  { id: 'windup-bear', label: 'Wind-up Bear', parts: ['ears', 'eyes', 'key'], tags: ['windup', 'toy'], rarity: 3 },
  { id: 'windup-beetle', label: 'Wind-up Beetle', parts: ['antenna', 'stripes', 'key'], tags: ['windup', 'toy'], rarity: 2 },
  { id: 'windup-fish', label: 'Wind-up Fish', parts: ['fin', 'eyes', 'stripes', 'key'], tags: ['windup', 'toy'], rarity: 2 },
];

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildDef(
  shapeId: TrinketShapeId,
  shapeLabel: string,
  shapeTagList: string[],
  family: TrinketFamilyId,
  rarity: 1 | 2 | 3,
  motion: TrinketMotionId,
  parts: TrinketPartId[],
  palette: PaletteSeed,
  paletteIndex: number,
): TrinketDef {
  const partSig = parts.length > 0 ? `-${parts.join('').slice(0, 10)}` : '';
  return {
    id: `gen-${slug(shapeId)}-${paletteIndex}${partSig}-${motion}`,
    label: `${palette.name} ${shapeLabel}`,
    description: `${shapeLabel} in ${palette.name.toLowerCase()} paper, ${motionPhrase(motion)}.`,
    family,
    shape: shapeId,
    motion,
    parts: [...parts],
    palette: { base: palette.base, accent: palette.accent, detail: palette.detail },
    textureUrl: palette.textureUrl ?? null,
    scale: 0.9 + ((paletteIndex + shapeTagList.length) % 5) * 0.08,
    rarity,
    tags: [
      ...shapeTagList,
      ...(palette.season ? [`seasonal:${palette.season}`] : []),
      ...(WINDUP_SHAPES.includes(shapeId) ? ['windup'] : []),
    ],
  };
}

function motionPhrase(motion: TrinketMotionId): string {
  switch (motion) {
    case 'still': return 'perfectly still';
    case 'spin': return 'turning slowly';
    case 'bob': return 'bobbing gently';
    case 'wobble': return 'rocking on its base';
    case 'windup': return 'wound up and ready to go';
    case 'sway': return 'swaying in a paper breeze';
    case 'flip': return 'flipping over now and then';
    case 'orbit': return 'drifting in a slow circle';
  }
}

/**
 * Every generated variant.
 *
 * Deliberately a loop, not a hand-written array: the count is meant to grow
 * (add a palette, get ~50 more) and hand-maintaining it would be the thing
 * that eventually stops someone from adding one.
 */
export const TRINKET_GENERATED_DEFS: TrinketDef[] = (() => {
  const defs: TrinketDef[] = [];

  for (const shape of SHAPES) {
    PALETTES.forEach((palette, paletteIndex) => {
      shape.motions.forEach((motion, motionIndex) => {
        const parts = shape.parts[(paletteIndex + motionIndex) % shape.parts.length];
        const family = shape.families[(paletteIndex + motionIndex) % shape.families.length];
        defs.push(buildDef(shape.id, shape.label, shape.tags, family, shape.rarity, motion, parts, palette, paletteIndex));
      });
    });
  }

  for (const windup of WINDUPS) {
    PALETTES.forEach((palette, paletteIndex) => {
      if (paletteIndex % 2 === 1) return; // Half the palettes for the toy line.
      const family: TrinketFamilyId = palette.season ? 'seasonal' : 'handmade';
      defs.push(buildDef(windup.id, windup.label, windup.tags, family, windup.rarity, 'windup', windup.parts, palette, paletteIndex));
    });
  }

  return defs;
})();
