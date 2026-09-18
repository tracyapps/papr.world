import { createRng } from '../../core/math';
import { TRINKET_GENERATED_DEFS } from './trinketVariants';

/** Local FNV-1a, matching the engine's other stable selections. */
function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Trinkets — the collectible small things a critter gives you.
 *
 * A trinket is **not** a resource and **not** a tool. It is never sold, it
 * costs nothing to place, and its whole job is to be looked at: it appears on
 * the player's bio card and can be set down in the world like a loose stone.
 *
 * Three rules shape this catalog, and everything else is downstream of them:
 *
 * 1. **There are a lot of them, and they vary.** A trinket is a *shape* x a
 *    *motion* x a *palette* x optional *parts* (ears, key, wings, glitter...).
 *    The authored definitions below are the named, deliberate ones; the
 *    generated variants in `trinketVariants.ts` are deterministic
 *    recombinations of the same vocabulary, so the pool can grow into the
 *    hundreds without anyone hand-drawing three hundred wind-up frogs.
 *
 * 2. **No two in one player's bag are the same.** Uniqueness is a property of
 *    *handing them out*, not of the catalog: `pickTrinketDef` is given the set
 *    of def ids a player already owns and refuses to hand back one of them
 *    until the pool is genuinely exhausted. This is what keeps a run of
 *    quests from ever dropping a duplicate wind-up mouse.
 *
 * 3. **Adding one is data, not code.** A new trinket is one entry here (or one
 *    more axis for the generator). Nothing else in the game needs to learn
 *    about it — the rig, the bio card, the scrapbook tab and the placement
 *    system all read this table.
 *
 * Sizing follows the world's loose stones (`resourceDropVisual.ts` builds
 * those from a 0.09–0.17 dodecahedron), so a trinket sitting on the ground
 * reads as "a small thing someone left here", not as furniture.
 */

export type TrinketFamilyId =
  | 'found'
  | 'natural'
  | 'handmade'
  | 'curious'
  | 'seasonal'
  | 'story';

export type TrinketShapeId =
  | 'pebble'
  | 'cube'
  | 'sphere'
  | 'ring'
  | 'cone'
  | 'star'
  | 'heart'
  | 'leaf'
  | 'shell'
  | 'key'
  | 'button'
  | 'grain'
  | 'crystal'
  | 'spool'
  | 'bell'
  | 'acorn'
  | 'pinwheel'
  | 'thimble'
  | 'cylinder'
  | 'windup-mouse'
  | 'windup-bird'
  | 'windup-fox'
  | 'windup-cat'
  | 'windup-bunny'
  | 'windup-frog'
  | 'windup-duck'
  | 'windup-bear'
  | 'windup-beetle'
  | 'windup-fish';

/** Shapes that read as a little wind-up toy, used by the motion defaults. */
export const WINDUP_SHAPES: TrinketShapeId[] = [
  'windup-mouse', 'windup-bird', 'windup-fox', 'windup-cat', 'windup-bunny',
  'windup-frog', 'windup-duck', 'windup-bear', 'windup-beetle', 'windup-fish',
];

export type TrinketMotionId =
  | 'still'
  | 'spin'
  | 'bob'
  | 'wobble'
  | 'windup'
  | 'sway'
  | 'flip'
  | 'orbit';

export type TrinketPartId =
  | 'ears'
  | 'tail'
  | 'eyes'
  | 'wings'
  | 'key'
  | 'hat'
  | 'stem'
  | 'antenna'
  | 'fin'
  | 'beak'
  | 'ribbon'
  | 'feather'
  | 'spots'
  | 'stripes'
  | 'glitter';

export type TrinketDef = {
  id: string;
  label: string;
  description: string;
  family: TrinketFamilyId;
  shape: TrinketShapeId;
  motion: TrinketMotionId;
  parts: TrinketPartId[];
  palette: { base: string; accent: string; detail: string };
  /** Optional paper texture from the shared material library. */
  textureUrl?: string | null;
  /** Overall size multiplier around the ~0.16-unit base. */
  scale: number;
  rarity: 1 | 2 | 3;
  /** Free-form, lower-case tags: 'biome:forest', 'material:stone', 'toy'. */
  tags: string[];
};

export const TRINKET_FAMILIES = {
  found: {
    id: 'found',
    label: 'Found Things',
    description: 'Small objects that were already lying about, waiting to be noticed.',
  },
  natural: {
    id: 'natural',
    label: 'Natural Curiosities',
    description: 'Seeds, shells, and stones shaped by the paper world itself.',
  },
  handmade: {
    id: 'handmade',
    label: 'Handmade Keepsakes',
    description: 'Little things folded, wound, and tied together on purpose.',
  },
  curious: {
    id: 'curious',
    label: 'Curious Objects',
    description: 'Things that are hard to explain and easy to keep.',
  },
  seasonal: {
    id: 'seasonal',
    label: 'Seasonal Tokens',
    description: 'Markers of a particular time of year, kept long after it passes.',
  },
  story: {
    id: 'story',
    label: 'Story Trinkets',
    description: 'Something a critter kept because of what happened.',
  },
} as const satisfies Record<TrinketFamilyId, {
  id: TrinketFamilyId;
  label: string;
  description: string;
}>;

export const TRINKET_FAMILY_ORDER: TrinketFamilyId[] = [
  'found', 'natural', 'handmade', 'curious', 'seasonal', 'story',
];

const M = '/assets/runtime/materials';

/**
 * The named inventory. Every one of these is a deliberate little object with a
 * sentence of its own; the generator in `trinketVariants.ts` is welcome to
 * recombine the same vocabulary far past this list.
 */
export const TRINKET_AUTHORED_DEFS = {
  'lucky-paperclip': {
    id: 'lucky-paperclip',
    label: 'Lucky Paperclip',
    description: 'Bent a little out of shape from a very good day.',
    family: 'found', shape: 'ring', motion: 'wobble', parts: ['glitter'],
    palette: { base: '#cfd6dd', accent: '#8f9aa6', detail: '#f4f6f8' },
    scale: 1, rarity: 1, tags: ['toy', 'metal'],
  },
  'smooth-blue-stone': {
    id: 'smooth-blue-stone',
    label: 'Smooth Blue Pebble',
    description: 'Worn round by the blue paper pond. Perfect for a pocket.',
    family: 'natural', shape: 'pebble', motion: 'still', parts: [],
    palette: { base: '#6f8fbd', accent: '#41608a', detail: '#c7d7ec' },
    scale: 1, rarity: 1, tags: ['material:stone', 'biome:clearing'],
  },
  'cork-acorn': {
    id: 'cork-acorn',
    label: 'Cork Acorn',
    description: 'An acorn with a little cap that never quite fits.',
    family: 'natural', shape: 'acorn', motion: 'still', parts: ['stem'],
    palette: { base: '#b1824f', accent: '#7a5531', detail: '#5c3f24' },
    textureUrl: `${M}/cork-board.png`, scale: 1, rarity: 1, tags: ['material:wood', 'biome:forest'],
  },
  'twisty-ribbon': {
    id: 'twisty-ribbon',
    label: 'Twisty Ribbon',
    description: 'A curl of ribbon that refuses to lie flat.',
    family: 'handmade', shape: 'spool', motion: 'sway', parts: ['ribbon'],
    palette: { base: '#d98cb1', accent: '#b0568a', detail: '#f6dcea' },
    scale: 1, rarity: 1, tags: ['toy', 'craft'],
  },
  'brass-thimble': {
    id: 'brass-thimble',
    label: 'Brass Thimble',
    description: 'Dimpled all over and slightly warm, as if recently worn.',
    family: 'found', shape: 'thimble', motion: 'still', parts: ['spots'],
    palette: { base: '#c9903c', accent: '#8f6624', detail: '#f0d79a' },
    scale: 1, rarity: 2, tags: ['metal', 'craft'],
  },
  'folded-paper-crane': {
    id: 'folded-paper-crane',
    label: 'Folded Paper Crane',
    description: 'Somebody practiced this one a great many times.',
    family: 'handmade', shape: 'cone', motion: 'bob', parts: ['wings', 'beak'],
    palette: { base: '#f4f1e8', accent: '#c9c2b2', detail: '#cf4f38' },
    scale: 1.05, rarity: 2, tags: ['craft', 'paper'],
  },
  'windup-mouse-grey': {
    id: 'windup-mouse-grey',
    label: 'Grey Wind-up Mouse',
    description: 'Turns in a determined little circle until it runs down.',
    family: 'handmade', shape: 'windup-mouse', motion: 'windup', parts: ['ears', 'tail', 'eyes', 'key'],
    palette: { base: '#a9a29a', accent: '#7b746c', detail: '#2b2622' },
    scale: 1, rarity: 2, tags: ['toy', 'windup'],
  },
  'windup-frog-green': {
    id: 'windup-frog-green',
    label: 'Green Wind-up Frog',
    description: 'Hops once, thinks about it, hops once more.',
    family: 'handmade', shape: 'windup-frog', motion: 'windup', parts: ['eyes', 'key', 'spots'],
    palette: { base: '#7fae5c', accent: '#5a8a3f', detail: '#2f3a22' },
    scale: 1, rarity: 2, tags: ['toy', 'windup'],
  },
  'windup-duck-yellow': {
    id: 'windup-duck-yellow',
    label: 'Yellow Wind-up Duck',
    description: 'Waddles in a tight, pleased circle.',
    family: 'handmade', shape: 'windup-duck', motion: 'windup', parts: ['beak', 'eyes', 'key', 'wings'],
    palette: { base: '#f0c14b', accent: '#d79b2b', detail: '#e08a2a' },
    scale: 1, rarity: 2, tags: ['toy', 'windup'],
  },
  'windup-fox-rust': {
    id: 'windup-fox-rust',
    label: 'Rust Wind-up Fox',
    description: 'Its key clicks twice, then it trots a perfect little arc.',
    family: 'handmade', shape: 'windup-fox', motion: 'windup', parts: ['ears', 'tail', 'eyes', 'key'],
    palette: { base: '#c1531f', accent: '#8a3a16', detail: '#f0d5a1' },
    scale: 1, rarity: 3, tags: ['toy', 'windup', 'biome:dunes'],
  },
  'glass-paperweight': {
    id: 'glass-paperweight',
    label: 'Glass Paperweight',
    description: 'Something small and green is pressed inside it forever.',
    family: 'curious', shape: 'sphere', motion: 'still', parts: ['stem', 'glitter'],
    palette: { base: '#bcd8d6', accent: '#7fb0ad', detail: '#5b8849' },
    scale: 1.1, rarity: 3, tags: ['glass', 'keepsake'],
  },
  'stamped-button': {
    id: 'stamped-button',
    label: 'Stamped Button',
    description: 'A button with a tiny mountain pressed into it.',
    family: 'found', shape: 'button', motion: 'spin', parts: ['spots'],
    palette: { base: '#cf4f38', accent: '#96311f', detail: '#f7d9c9' },
    scale: 1, rarity: 1, tags: ['toy', 'button'],
  },
  'pinecone-curl': {
    id: 'pinecone-curl',
    label: 'Curled Pinecone',
    description: 'Opens its little paper scales when nobody is looking.',
    family: 'natural', shape: 'cone', motion: 'still', parts: ['stripes'],
    palette: { base: '#8a5a34', accent: '#5f3d22', detail: '#c1935f' },
    textureUrl: `${M}/construction-paper-brown-3.png`, scale: 1.05, rarity: 1, tags: ['material:wood', 'biome:forest'],
  },
  'sea-shell-spiral': {
    id: 'sea-shell-spiral',
    label: 'Spiral Shell',
    description: 'Hold it up and the whole paper sky rushes past your ear.',
    family: 'natural', shape: 'shell', motion: 'still', parts: [],
    palette: { base: '#f2e3d0', accent: '#d6b894', detail: '#b78f63' },
    scale: 1, rarity: 2, tags: ['shell', 'biome:clearing'],
  },
  'tiny-brass-key': {
    id: 'tiny-brass-key',
    label: 'Tiny Brass Key',
    description: 'It fits something. Nobody has found what.',
    family: 'curious', shape: 'key', motion: 'still', parts: ['glitter'],
    palette: { base: '#c9903c', accent: '#8f6624', detail: '#f0d79a' },
    scale: 1, rarity: 2, tags: ['metal', 'keepsake'],
  },
  'clover-print-token': {
    id: 'clover-print-token',
    label: 'Clover-print Token',
    description: 'Four leaves, printed slightly off-centre, which is luckier.',
    family: 'story', shape: 'leaf', motion: 'sway', parts: ['stem'],
    palette: { base: '#5b8849', accent: '#3d6330', detail: '#a8c98d' },
    scale: 1, rarity: 1, tags: ['plant', 'biome:meadow'],
  },
  'matchbox-lantern': {
    id: 'matchbox-lantern',
    label: 'Matchbox Lantern',
    description: 'A whole tiny room you can carry in one hand.',
    family: 'handmade', shape: 'cube', motion: 'sway', parts: ['hat'],
    palette: { base: '#e3b25c', accent: '#b07f31', detail: '#fff3d0' },
    scale: 1, rarity: 2, tags: ['craft', 'light'],
  },
  'ribbon-knot-bell': {
    id: 'ribbon-knot-bell',
    label: 'Ribbon-knot Bell',
    description: 'A very small bell on a very proud bow.',
    family: 'handmade', shape: 'bell', motion: 'sway', parts: ['ribbon', 'glitter'],
    palette: { base: '#d9b23c', accent: '#8f6a1f', detail: '#f2d98a' },
    scale: 1, rarity: 2, tags: ['craft', 'sound'],
  },
  'tideline-glass': {
    id: 'tideline-glass',
    label: 'Tideline Glass',
    description: 'Sea-worn and soft-edged, the colour of shallow water.',
    family: 'natural', shape: 'pebble', motion: 'still', parts: ['glitter'],
    palette: { base: '#9fc8c2', accent: '#6b9a94', detail: '#dff0ec' },
    scale: 1, rarity: 2, tags: ['glass', 'biome:clearing'],
  },
  'snowdrop-resin': {
    id: 'snowdrop-resin',
    label: 'Snowdrop Resin',
    description: 'A flower caught mid-fall and kept that way.',
    family: 'seasonal', shape: 'crystal', motion: 'still', parts: ['stem', 'glitter'],
    palette: { base: '#e8f0f4', accent: '#b7cbd6', detail: '#8fae9a' },
    scale: 1, rarity: 3, tags: ['seasonal:winter', 'keepsake'],
  },
  'sunwarm-shard': {
    id: 'sunwarm-shard',
    label: 'Sun-warm Shard',
    description: 'Still faintly warm from a whole day in the dunes.',
    family: 'seasonal', shape: 'crystal', motion: 'spin', parts: ['glitter'],
    palette: { base: '#f0b548', accent: '#c07d1f', detail: '#fbe6b0' },
    scale: 1, rarity: 3, tags: ['seasonal:summer', 'biome:dunes'],
  },
  'windmill-pinwheel': {
    id: 'windmill-pinwheel',
    label: 'Windmill Pinwheel',
    description: 'Spins even when you are sure there is no wind.',
    family: 'handmade', shape: 'pinwheel', motion: 'spin', parts: ['stem'],
    palette: { base: '#4f8fb8', accent: '#cf4f38', detail: '#f0b548' },
    scale: 1.05, rarity: 2, tags: ['toy', 'craft'],
  },
  'scrap-bolt': {
    id: 'scrap-bolt',
    label: 'Scrap Bolt',
    description: 'A fat bolt from somewhere that used to be a machine.',
    family: 'found', shape: 'cylinder', motion: 'wobble', parts: ['stripes'],
    palette: { base: '#8d8781', accent: '#5b5550', detail: '#c9c2ba' },
    scale: 1, rarity: 2, tags: ['metal', 'biome:scrapflats'],
  },
  'cogwheel-single': {
    id: 'cogwheel-single',
    label: 'Lone Cogwheel',
    description: 'One tooth is bent, so it will never run true again.',
    family: 'curious', shape: 'ring', motion: 'spin', parts: ['stripes'],
    palette: { base: '#a9905f', accent: '#7a6440', detail: '#d9c48f' },
    scale: 1, rarity: 2, tags: ['metal', 'biome:scrapflats'],
  },
  'moon-button': {
    id: 'moon-button',
    label: 'Moon Button',
    description: 'A pale button that Bandit swears was once on the moon.',
    family: 'story', shape: 'button', motion: 'spin', parts: ['spots', 'glitter'],
    palette: { base: '#e9e6f2', accent: '#b6b0cc', detail: '#8f89ad' },
    scale: 1, rarity: 3, tags: ['story', 'night'],
  },
  'wrapped-sweet-paper': {
    id: 'wrapped-sweet-paper',
    label: 'Wrapped Sweet Paper',
    description: 'The wrapper outlived the sweet. It was a good wrapper.',
    family: 'found', shape: 'cube', motion: 'wobble', parts: ['ribbon'],
    palette: { base: '#d96a8e', accent: '#a84568', detail: '#f7d9e4' },
    scale: 0.95, rarity: 1, tags: ['paper', 'candy'],
  },
  'beetle-shell': {
    id: 'beetle-shell',
    label: 'Beetle Shell',
    description: 'A bright iridescent shell with nobody inside it.',
    family: 'natural', shape: 'windup-beetle', motion: 'still', parts: ['antenna', 'stripes'],
    palette: { base: '#4f7a5c', accent: '#2f5340', detail: '#9fc98d' },
    scale: 1, rarity: 2, tags: ['insect', 'biome:meadow'],
  },
  'paper-boat': {
    id: 'paper-boat',
    label: 'Paper Boat',
    description: 'Perfectly folded, and much too nice to actually float.',
    family: 'handmade', shape: 'cone', motion: 'sway', parts: [],
    palette: { base: '#f4f1e8', accent: '#c2cbd6', detail: '#4f8fb8' },
    scale: 1.05, rarity: 1, tags: ['craft', 'paper'],
  },
  'feather-quill': {
    id: 'feather-quill',
    label: 'Feather Quill',
    description: 'A big blue feather, good for writing and better for tickling.',
    family: 'found', shape: 'leaf', motion: 'sway', parts: ['feather', 'stem'],
    palette: { base: '#5b7fbf', accent: '#3a5a94', detail: '#dbe6f7' },
    scale: 1.1, rarity: 1, tags: ['bird', 'biome:clearing'],
  },
  'meerkat-sentry-pebble': {
    id: 'meerkat-sentry-pebble',
    label: 'Sentry Pebble',
    description: 'A pebble the meerkats stand on to see things. It is retired.',
    family: 'story', shape: 'pebble', motion: 'still', parts: [],
    palette: { base: '#c9a06a', accent: '#8f6f43', detail: '#ecd6ac' },
    scale: 0.95, rarity: 2, tags: ['biome:dunes', 'story'],
  },
  'chisel-sawdust-jar': {
    id: 'chisel-sawdust-jar',
    label: 'Jar of Sawdust',
    description: 'Chisel says it is confetti. Chisel is allowed this one.',
    family: 'story', shape: 'cube', motion: 'still', parts: ['glitter', 'hat'],
    palette: { base: '#e0c48f', accent: '#b99a5c', detail: '#f7ecd0' },
    scale: 1, rarity: 2, tags: ['story', 'biome:forest'],
  },
  'pip-seed-pendant': {
    id: 'pip-seed-pendant',
    label: 'Pip’s Seed Pendant',
    description: 'A seed on a thread. Pip says it always finds the sun.',
    family: 'story', shape: 'acorn', motion: 'sway', parts: ['stem', 'ribbon'],
    palette: { base: '#a8763f', accent: '#7a5228', detail: '#f0d5a1' },
    scale: 1, rarity: 2, tags: ['story', 'shop'],
  },
  'bandit-shiny-spoon': {
    id: 'bandit-shiny-spoon',
    label: 'Very Shiny Spoon',
    description: 'It is the shiniest thing Bandit has ever not stolen.',
    family: 'found', shape: 'cylinder', motion: 'wobble', parts: ['glitter'],
    palette: { base: '#d7dbe0', accent: '#a2a8b0', detail: '#f7f9fb' },
    scale: 1.05, rarity: 2, tags: ['metal', 'story'],
  },
  'fox-ear-tuft': {
    id: 'fox-ear-tuft',
    label: 'Tuft of Fox Fur',
    description: 'Soft, warm, and freely given at a rare high-friendship moment.',
    family: 'story', shape: 'leaf', motion: 'sway', parts: ['feather'],
    palette: { base: '#e29a5a', accent: '#b8703a', detail: '#f7dcbb' },
    scale: 0.95, rarity: 3, tags: ['story', 'biome:dunes'],
  },
  'winter-window-frost': {
    id: 'winter-window-frost',
    label: 'Frost Window Chip',
    description: 'A pane of frost that somehow stayed cold.',
    family: 'seasonal', shape: 'crystal', motion: 'spin', parts: ['glitter', 'feather'],
    palette: { base: '#dff0f7', accent: '#a8cfe0', detail: '#ffffff' },
    scale: 1, rarity: 3, tags: ['seasonal:winter'],
  },
  'autumn-leaf-press': {
    id: 'autumn-leaf-press',
    label: 'Pressed Autumn Leaf',
    description: 'Flattened flat between two pages and kept its colour.',
    family: 'seasonal', shape: 'leaf', motion: 'still', parts: ['stem', 'stripes'],
    palette: { base: '#d1663a', accent: '#9c4120', detail: '#f2c14e' },
    scale: 1, rarity: 2, tags: ['seasonal:autumn'],
  },
  'spring-bud-charm': {
    id: 'spring-bud-charm',
    label: 'Spring Bud Charm',
    description: 'A bud that decided spring and stayed that way.',
    family: 'seasonal', shape: 'heart', motion: 'bob', parts: ['stem'],
    palette: { base: '#c98fb0', accent: '#9a6284', detail: '#e8cfe0' },
    scale: 1, rarity: 2, tags: ['seasonal:spring'],
  },
  'summer-skip-stone': {
    id: 'summer-skip-stone',
    label: 'Summer Skipping Stone',
    description: 'Flat, round, and responsible for four whole skips.',
    family: 'natural', shape: 'pebble', motion: 'still', parts: [],
    palette: { base: '#9aa7a0', accent: '#6d7a73', detail: '#cdd7d2' },
    scale: 1, rarity: 1, tags: ['material:stone', 'seasonal:summer'],
  },
  'toy-windup-bear': {
    id: 'toy-windup-bear',
    label: 'Wind-up Bear',
    description: 'Stumps forward with enormous dignity.',
    family: 'handmade', shape: 'windup-bear', motion: 'windup', parts: ['ears', 'eyes', 'key'],
    palette: { base: '#a3764a', accent: '#7a5531', detail: '#f0d5a1' },
    scale: 1.05, rarity: 3, tags: ['toy', 'windup'],
  },
  'toy-windup-bunny': {
    id: 'toy-windup-bunny',
    label: 'Wind-up Bunny',
    description: 'Hops in place, pleased with itself, forever.',
    family: 'handmade', shape: 'windup-bunny', motion: 'windup', parts: ['ears', 'eyes', 'key', 'tail'],
    palette: { base: '#e9e2d2', accent: '#c9bfa8', detail: '#e8b7c6' },
    scale: 1, rarity: 2, tags: ['toy', 'windup'],
  },
  'toy-windup-cat': {
    id: 'toy-windup-cat',
    label: 'Wind-up Cat',
    description: 'It walks the exact same proud twelve steps, always.',
    family: 'handmade', shape: 'windup-cat', motion: 'windup', parts: ['ears', 'tail', 'eyes', 'key'],
    palette: { base: '#332e2a', accent: '#211d1a', detail: '#d99aa6' },
    scale: 1, rarity: 3, tags: ['toy', 'windup'],
  },
  'toy-windup-bird': {
    id: 'toy-windup-bird',
    label: 'Wind-up Bird',
    description: 'Pecks three times, then applauds itself with its wings.',
    family: 'handmade', shape: 'windup-bird', motion: 'windup', parts: ['beak', 'eyes', 'wings', 'key'],
    palette: { base: '#4f8fb8', accent: '#376b8c', detail: '#f0b548' },
    scale: 1, rarity: 2, tags: ['toy', 'windup'],
  },
  'toy-windup-fish': {
    id: 'toy-windup-fish',
    label: 'Wind-up Fish',
    description: 'Wriggles along the ground, apparently convinced.',
    family: 'handmade', shape: 'windup-fish', motion: 'windup', parts: ['fin', 'eyes', 'key', 'stripes'],
    palette: { base: '#5fa8b8', accent: '#3d7a8a', detail: '#dff0f4' },
    scale: 1, rarity: 2, tags: ['toy', 'windup', 'water'],
  },
  'curious-pocket-watch': {
    id: 'curious-pocket-watch',
    label: 'Pocket Watch That Runs Backwards',
    description: 'It keeps perfect time, just not this way round.',
    family: 'curious', shape: 'ring', motion: 'spin', parts: ['glitter', 'hat'],
    palette: { base: '#c9903c', accent: '#8f6624', detail: '#f4f1e8' },
    scale: 1, rarity: 3, tags: ['metal', 'time'],
  },
  'hat-pin-star': {
    id: 'hat-pin-star',
    label: 'Star Hat Pin',
    description: 'A star on a pin. Nobody knows whose hat it belonged to.',
    family: 'found', shape: 'star', motion: 'spin', parts: ['glitter'],
    palette: { base: '#f0d548', accent: '#c09b1f', detail: '#fbeab0' },
    scale: 1, rarity: 2, tags: ['metal', 'night'],
  },
  'seed-pod-rattle': {
    id: 'seed-pod-rattle',
    label: 'Seed-pod Rattle',
    description: 'Shake it and it sounds like a very small rain.',
    family: 'natural', shape: 'sphere', motion: 'bob', parts: ['stem', 'spots'],
    palette: { base: '#b08a52', accent: '#82602f', detail: '#e3cfa4' },
    scale: 1, rarity: 2, tags: ['plant', 'sound'],
  },
  'butterfly-wing-glass': {
    id: 'butterfly-wing-glass',
    label: 'Butterfly-wing Glass',
    description: 'Not a real wing. It just remembers one very well.',
    family: 'curious', shape: 'crystal', motion: 'orbit', parts: ['wings', 'glitter'],
    palette: { base: '#d879c5', accent: '#9c4f9a', detail: '#f2c9ee' },
    scale: 1, rarity: 3, tags: ['glass', 'insect'],
  },
  'woodchuck-pencil-stub': {
    id: 'woodchuck-pencil-stub',
    label: 'Pencil Stub',
    description: 'Sharpened down to almost nothing by a very busy woodchuck.',
    family: 'story', shape: 'cylinder', motion: 'wobble', parts: ['stripes'],
    palette: { base: '#f0b548', accent: '#c08a1f', detail: '#3a2c20' },
    scale: 1, rarity: 1, tags: ['story', 'craft'],
  },
  'moss-terrarium': {
    id: 'moss-terrarium',
    label: 'Pocket Terrarium',
    description: 'A whole damp little world under a paper dome.',
    family: 'natural', shape: 'sphere', motion: 'still', parts: ['stem', 'glitter', 'spots'],
    palette: { base: '#8fb0c4', accent: '#5f8a9c', detail: '#5b8849' },
    scale: 1.1, rarity: 3, tags: ['glass', 'plant'],
  },
  // --- The tropical batch (2026-09-18), with the biome's own tag so
  // jungle quests can ask for a jungle keepsake by name. ---
  'pressed-hibiscus': {
    id: 'pressed-hibiscus',
    label: 'Pressed Hibiscus',
    description: 'Pressed flat the day it opened. It kept every bit of the color.',
    family: 'natural', shape: 'leaf', motion: 'still', parts: [],
    palette: { base: '#e0576a', accent: '#a03048', detail: '#f7c9cf' },
    scale: 1, rarity: 1, tags: ['plant', 'biome:tropical'],
  },
  'parrot-feather': {
    id: 'parrot-feather',
    label: 'Parrot Feather',
    description: 'Fell mid-argument, apparently. The parrot has spares.',
    family: 'natural', shape: 'leaf', motion: 'sway', parts: ['feather'],
    palette: { base: '#3fae5a', accent: '#1f7a3c', detail: '#f2c14e' },
    scale: 1, rarity: 2, tags: ['feather', 'biome:tropical'],
  },
  'banana-leaf-boat': {
    id: 'banana-leaf-boat',
    label: 'Banana-leaf Boat',
    description: 'Sailed one puddle magnificently before retiring to a shelf.',
    family: 'handmade', shape: 'shell', motion: 'bob', parts: [],
    palette: { base: '#4c9a52', accent: '#2f6e3a', detail: '#c8e6b0' },
    scale: 1.05, rarity: 2, tags: ['craft', 'biome:tropical'],
  },
  'bamboo-whistle': {
    id: 'bamboo-whistle',
    label: 'Bamboo Whistle',
    description: 'Three notes, all of them cheerful. The fourth is a work in progress.',
    family: 'handmade', shape: 'cylinder', motion: 'still', parts: ['stripes'],
    palette: { base: '#9bb35a', accent: '#6e8a3a', detail: '#e8e2c0' },
    scale: 0.95, rarity: 1, tags: ['craft', 'biome:tropical'],
  },
  'bird-of-paradise-bloom': {
    id: 'bird-of-paradise-bloom',
    label: 'Bird-of-paradise Bloom',
    description: 'The flower that points at the sky on purpose.',
    family: 'natural', shape: 'star', motion: 'sway', parts: ['beak'],
    palette: { base: '#d9963e', accent: '#2f5a7a', detail: '#f2c14e' },
    scale: 1.05, rarity: 2, tags: ['plant', 'biome:tropical'],
  },
  'mossy-pebble-friend': {
    id: 'mossy-pebble-friend',
    label: 'Mossy Pebble Friend',
    description: 'A pebble wearing a little moss cap. It looks like it has opinions.',
    family: 'natural', shape: 'pebble', motion: 'still', parts: ['eyes', 'spots'],
    palette: { base: '#7d9670', accent: '#4f6e44', detail: '#5b8849' },
    scale: 1, rarity: 2, tags: ['plant', 'biome:forest'],
  },
} as const satisfies Record<string, TrinketDef>;

export type AuthoredTrinketId = keyof typeof TRINKET_AUTHORED_DEFS;

let mergedCache: TrinketDef[] | null = null;
let mergedByIdCache: Map<string, TrinketDef> | null = null;

/** Authored definitions plus generated variants, de-duplicated by id. */
export function allTrinketDefs(): TrinketDef[] {
  if (mergedCache) return mergedCache;
  const seen = new Set<string>();
  const merged: TrinketDef[] = [];
  for (const def of [...Object.values(TRINKET_AUTHORED_DEFS) as TrinketDef[], ...TRINKET_GENERATED_DEFS]) {
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    merged.push(def);
  }
  mergedCache = merged;
  return mergedCache;
}

export function trinketById(): Map<string, TrinketDef> {
  if (mergedByIdCache) return mergedByIdCache;
  mergedByIdCache = new Map(allTrinketDefs().map((def) => [def.id, def]));
  return mergedByIdCache;
}

export function getTrinketDef(id: string): TrinketDef | null {
  return trinketById().get(id) ?? null;
}

export function trinketDefsInFamily(family: TrinketFamilyId): TrinketDef[] {
  return allTrinketDefs().filter((def) => def.family === family);
}

/**
 * Hand a player a trinket they do not already own.
 *
 * `owned` is the set of def ids already in the player's bag. Matching is by
 * the pool's family / shapes / tag filter, then by rarity (rarer first, so a
 * hard quest feels like it paid out), then deterministically shuffled by
 * `seed` so two players completing the same quest get different trinkets.
 *
 * Falls back to the whole catalog when a pool is exhausted, which is the
 * intended failure: a duplicate is worse than a surprise, but not worse than
 * handing back nothing.
 */
export function pickTrinketDef(
  pool: { family?: TrinketFamilyId; shapes?: TrinketShapeId[]; tag?: string },
  owned: ReadonlySet<string>,
  seed: number,
): TrinketDef {
  const shapeFilter = pool.shapes ? new Set(pool.shapes) : null;
  const has = (def: TrinketDef, keys: { family: boolean; shapes: boolean; tag: boolean }) => (
    (!keys.family || !pool.family || def.family === pool.family)
    && (!keys.shapes || !shapeFilter || shapeFilter.has(def.shape))
    && (!keys.tag || !pool.tag || def.tags.includes(pool.tag))
  );

  // A cascade, not a single filter. A quest that asks for "a seasonal trinket
  // from the forest" may have no *exact* match on day one; rather than handing
  // back something arbitrary from an unrelated family (which is how a curious
  // key used to arrive as a forest reward), each rung loosens exactly one
  // constraint until something fresh is found. Family is loosened last, so a
  // reward stays in the right part of the shelf for as long as possible while
  // the no-duplicates promise holds.
  const rungs: Array<{ family: boolean; shapes: boolean; tag: boolean }> = [
    { family: true, shapes: true, tag: true },
    { family: true, shapes: true, tag: false },
    { family: true, shapes: false, tag: true },
    { family: true, shapes: false, tag: false },
    { family: false, shapes: true, tag: true },
    { family: false, shapes: true, tag: false },
    { family: false, shapes: false, tag: true },
    { family: false, shapes: false, tag: false },
  ];

  const all = allTrinketDefs();
  const ranking = (a: TrinketDef, b: TrinketDef) => (b.rarity - a.rarity || a.id.localeCompare(b.id));
  const freshest = (list: TrinketDef[]) => list.filter((def) => !owned.has(def.id));

  for (const rung of rungs) {
    const fresh = freshest(all.filter((def) => has(def, rung)));
    if (fresh.length === 0) continue;
    // Rarity bands first, then a seeded pick inside the rarest band available,
    // so the reward is not always "the single rarest thing left".
    fresh.sort(ranking);
    const bestRarity = fresh[0].rarity;
    const band = fresh.filter((def) => def.rarity === bestRarity);
    const rng = createRng(stableHash(`trinket:${seed}:${band.length}:${rung.family}${rung.shapes}${rung.tag}`));
    return band[Math.floor(rng() * band.length)] ?? band[0];
  }

  // Everything is owned. Duplicate rather than hand back nothing, preferring a
  // def that at least matches the request.
  for (const rung of rungs) {
    const candidates = all.filter((def) => has(def, rung));
    if (candidates.length === 0) continue;
    candidates.sort(ranking);
    const rng = createRng(stableHash(`trinket-dup:${seed}`));
    return candidates[Math.floor(rng() * candidates.length)] ?? candidates[0];
  }
  // Unreachable while the catalog is non-empty; the type demands a return.
  return all[0];
}
