import { createRng, hashCoords } from '../core/math';
import { PAGE_SIZE, pageId, type Biome, type DecorKind, type HangingVineData, type PageData, type PropData, type TerrainPatchData, type TreeKind } from './types';
import { BIOME_RESOURCES, RESOURCE_DEFS } from './resources';
import { BIOME_GROUND_MATERIALS, biomeConfidenceAt, dominantBiomeAt, elevationBandAt } from './fields';
import {
  GREENHOUSE_CLEAR_RADIUS,
  GREENHOUSE_PAGE,
  GREENHOUSE_POSITION,
} from './seedStoreLayout';

// Seeded page generation for pages without authored data.
// Deterministic from page coordinates, so every client agrees.


const TREES: TreeKind[] = ['pine-medium-1', 'pine-medium-2', 'pine-tall', 'leafy-1', 'leafy-2', 'leafy-3'];
const REDWOODS: TreeKind[] = [
  'redwood-1', 'redwood-2', 'redwood-3', 'redwood-4', 'redwood-5', 'redwood-6', 'redwood-7',
];
// Dunes pages scatter cactus instead of pine/leafy trees — same slot in the
// per-page budget, just desert-appropriate scenery.
const CACTI: DecorKind[] = [
  'cactus-1', 'cactus-2', 'cactus-3', 'cactus-4', 'cactus-5', 'cactus-6', 'cactus-7', 'cactus-8',
];
// Palms are the one trimmable tree that grows on dunes, sparse and on their
// own budget. In the tropical biome palms are the anchor of a proper tree
// layer instead — see `TROPICAL_TREES` below and
// `docs/tropical-biome-plan.md`.
const PALMS: TreeKind[] = ['palm-1', 'palm-2', 'palm-3', 'palm-4', 'palm-5'];
const CYPRESS: TreeKind[] = ['cypress-1', 'cypress-2'];
const ALPINE_PINES: TreeKind[] = ['alpine-pine-1', 'alpine-pine-2'];
const ACACIAS: TreeKind[] = ['acacia-1', 'acacia-2'];
const BAOBABS: TreeKind[] = ['baobab-1'];

// The tropical canopy, in three roles: palms as the anchor (the biome plan's
// word), broadleaf jungle trees as the mass, and a banana here and there as
// the odd one that makes the layer read as jungle rather than a palm
// plantation. Jungle trees are `leafy` species, bananas are `banana` — see
// `treeSpeciesOf`.
const TROPICAL_CANOPY: Array<{ kind: TreeKind; weight: number }> = [
  { kind: 'palm-1', weight: 3 },
  { kind: 'palm-2', weight: 3 },
  { kind: 'palm-3', weight: 3 },
  { kind: 'palm-4', weight: 2 },
  { kind: 'palm-5', weight: 2 },
  { kind: 'jungle-1', weight: 4 },
  { kind: 'jungle-2', weight: 4 },
  { kind: 'banana-1', weight: 2 },
];

/**
 * Low scenery that shares a page without joining the tree economy — the
 * biome plan's "understory" ask. Counts stay modest on purpose: this is
 * garnish around the tree and harvestable budgets, not a second forest.
 */
const UNDERGROWTH: Partial<Record<Biome, DecorKind[]>> = {
  meadow: ['shrub-temperate-1', 'shrub-temperate-2', 'shrub-flowering-1', 'flower-daisy', 'flower-cosmos', 'flower-sunflower', 'flower-coneflower'],
  dunes: ['agave-1', 'agave-2', 'prickly-pear-1', 'aloe', 'euphorbia', 'shrub-desert-1', 'shrub-desert-2', 'marigold-1', 'flower-marigold'],
  forest: ['fern-1', 'fern-2', 'fern-3', 'mushroom-1', 'mushroom-2', 'mushroom-3', 'mushroom-morel', 'mushroom-shelf', 'moss-patch', 'moss-hummock', 'berry-shrub-1', 'shrub-flowering-2', 'flower-foxglove', 'boulder-mossy-1', 'fallen-log'],
  tropical: [
    'broadleaf-plant-1', 'broadleaf-plant-2', 'shrub-tropical-1', 'shrub-tropical-2',
    'shrub-tropical-3', 'hibiscus-1', 'anthurium-1', 'bird-of-paradise-1', 'bamboo-1',
    'mangrove-1', 'fern-1', 'fern-2', 'mushroom-1', 'mushroom-2', 'flower-plumeria', 'flower-protea',
  ],
  swamp: ['mangrove-prop', 'shrub-swamp', 'horsetail', 'pitcher-plant', 'moss-ball', 'moss-drape', 'moss-hummock', 'mushroom-amanita', 'mushroom-fly-agaric', 'flower-spider-lily', 'flower-lotus'],
  wetland: ['mangrove-1', 'horsetail', 'shrub-swamp', 'moss-patch', 'mushroom-coral', 'flower-lotus', 'flower-allium', 'flower-lupine'],
  'rocky-highlands': ['grass-alpine', 'shrub-alpine', 'moss-ball', 'lichen-rock', 'flower-edelweiss', 'flower-lupine', 'flower-paintbrush'],
  savanna: ['grass-savanna', 'shrub-savanna', 'shrub-thorny', 'termite-mound', 'aloe', 'flower-blackeyed-susan', 'flower-protea'],
  badlands: ['grass-badlands', 'shrub-thorny', 'aloe', 'euphorbia', 'termite-mound', 'flower-paintbrush', 'flower-poppy'],
  'bamboo-forest': ['bamboo-1', 'bamboo-2', 'bamboo-3', 'bamboo-tall', 'bamboo-shoot', 'moss-patch', 'moss-hummock', 'mushroom-coral', 'mushroom-3', 'flower-allium'],
};

const ROCKS: DecorKind[] = ['rock-small-1', 'rock-small-2', 'rock-medium', 'boulder-large', 'rock-stack', 'scree-pile', 'cliff-slab', 'lichen-rock'];

/** Height range per undergrowth cutout, in world units. */
const UNDERGROWTH_SIZES: Partial<Record<DecorKind, [number, number]>> = {
  'agave-1': [1.0, 1.5], 'agave-2': [0.9, 1.3], 'prickly-pear-1': [0.8, 1.15],
  'shrub-desert-1': [0.7, 1.0], 'shrub-desert-2': [0.7, 1.0], 'marigold-1': [0.55, 0.8],
  'fern-1': [0.7, 1.05], 'fern-2': [0.7, 1.05], 'fern-3': [0.65, 0.95],
  'mushroom-1': [0.45, 0.65], 'mushroom-2': [0.45, 0.65],
  'berry-shrub-1': [0.85, 1.15], 'boulder-mossy-1': [0.75, 1.05],
  'broadleaf-plant-1': [1.0, 1.45], 'broadleaf-plant-2': [1.0, 1.45],
  'shrub-tropical-1': [0.8, 1.1], 'shrub-tropical-2': [0.8, 1.1], 'shrub-tropical-3': [0.8, 1.1],
  'hibiscus-1': [0.9, 1.25], 'anthurium-1': [0.8, 1.05], 'bird-of-paradise-1': [1.0, 1.35],
  'bamboo-1': [2.3, 3.4], 'mangrove-1': [1.2, 1.7],
};

function decorHeight(art: DecorKind): [number, number] {
  const authored = UNDERGROWTH_SIZES[art];
  if (authored) return authored;
  if (art.startsWith('flower-')) return [0.45, 0.9];
  if (art.startsWith('mushroom')) return [0.4, 0.75];
  if (art.startsWith('moss-')) return [0.25, 0.65];
  if (art.startsWith('shrub-')) return [0.75, 1.25];
  if (art.startsWith('bamboo-tall')) return [3.5, 5.8];
  if (art.startsWith('bamboo')) return [1.3, 3.8];
  if (art.includes('rock') || art.includes('boulder') || art.includes('slab') || art.includes('scree')) return [0.6, 1.8];
  if (art.startsWith('grass-')) return [0.55, 1.0];
  return [0.7, 1.3];
}

/**
 * Jungle broadleaf heights, in layers — the "canopy" feel is mostly a
 * variety-of-heights feel. A few emergents push up toward (never to) redwood
 * height; most trees make the canopy; a handful stay low as understory.
 * Redwoods run 18–30, so emergents top out at 22 on purpose.
 */
const JUNGLE_LAYERS: Array<{ share: number; min: number; max: number }> = [
  { share: 0.18, min: 5, max: 8 }, // understory
  { share: 0.6, min: 8.5, max: 13.5 }, // canopy
  { share: 0.22, min: 14, max: 22 }, // emergent
];

/** Vines only hang from trees tall enough to have room beneath the canopy. */
const VINE_MIN_TREE_HEIGHT = 9;
/** Width-to-height of the broadleaf cutouts (900×1220). */
const JUNGLE_TREE_ASPECT = 900 / 1220;
/** Width-to-height of the vine cutouts (360×620). */
const VINE_ASPECT = 360 / 620;
const VINE_ART: DecorKind[] = ['hanging-vine-1', 'hanging-vine-2', 'hanging-vine-1', 'hanging-vine-2', 'hanging-vine-flowering-1'];

function jungleTreeHeight(rng: () => number): number {
  const roll = rng();
  let cursor = 0;
  for (const layer of JUNGLE_LAYERS) {
    cursor += layer.share;
    if (roll <= cursor) return layer.min + rng() * (layer.max - layer.min);
  }
  const last = JUNGLE_LAYERS[JUNGLE_LAYERS.length - 1];
  return last.min + rng() * (last.max - last.min);
}

/**
 * Vines hooked under a tall jungle tree's canopy.
 *
 * The broadleaf art's canopy underside sits a little under half-way up the
 * cutout, so vines hook just above that line (inside the leaves, which is
 * what makes them read as attached) and hang toward — never onto — the
 * ground, low enough that a player standing underneath can reach them.
 */
function jungleVines(rng: () => number, treeHeight: number): HangingVineData[] {
  if (treeHeight < VINE_MIN_TREE_HEIGHT) return [];
  const count = treeHeight >= 14
    ? 1 + Math.floor(rng() * 3)
    : rng() < 0.6 ? 1 + Math.floor(rng() * 2) : 0;
  const halfWidth = (treeHeight * JUNGLE_TREE_ASPECT) / 2;
  const vines: HangingVineData[] = [];
  for (let index = 0; index < count; index += 1) {
    const topY = treeHeight * (0.45 + rng() * 0.07);
    // Keep clear of the trunk, spread across the canopy.
    const side = rng() < 0.5 ? -1 : 1;
    const offset = side * halfWidth * (0.18 + rng() * 0.5);
    const wanted = treeHeight * (0.24 + rng() * 0.18);
    const height = Math.max(2.2, Math.min(wanted, topY - 0.9));
    vines.push({
      art: VINE_ART[Math.floor(rng() * VINE_ART.length)],
      offset,
      topY,
      height,
      depth: 0.14 + index * 0.05,
    });
  }
  // Never wider than the canopy they hang from.
  return vines.filter((vine) => vine.height * VINE_ASPECT < halfWidth * 1.4);
}

function pickWeightedKind(entries: Array<{ kind: TreeKind; weight: number }>, roll: number): TreeKind {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = roll * total;
  for (const entry of entries) {
    cursor -= entry.weight;
    if (cursor <= 0) return entry.kind;
  }
  return entries[entries.length - 1].kind;
}

/**
 * A page's biome is now just "whatever the field says at its centre".
 *
 * This used to hash the page coordinates, which made neighbours completely
 * uncorrelated — forest could sit hard against scrapflats with a straight
 * seam exactly on the page border, which is what made the world read as a
 * grid. The field is continuous, so neighbouring pages agree without
 * negotiating and the visible boundary can fall anywhere.
 *
 * The page-level value still matters: it picks the base ground sheet and the
 * broad prop budget. Per-prop placement then samples the field again, so a
 * forest page thins into meadow where the field says it should.
 */
function pickBiome(px: number, pz: number): Biome {
  return dominantBiomeAt(px * PAGE_SIZE, pz * PAGE_SIZE);
}

export function generatePage(px: number, pz: number): PageData {
  const seed = hashCoords(px, pz, 1);
  const rng = createRng(seed);
  const biome = pickBiome(px, pz);
  const cx = px * PAGE_SIZE;
  const cz = pz * PAGE_SIZE;
  const half = PAGE_SIZE / 2 - 2.2;

  const spot = () => ({
    x: cx + (rng() * 2 - 1) * half,
    z: cz + (rng() * 2 - 1) * half,
  });

  // Densities are tuned for 50-unit pages (~5x the area of the old 22s).
  // Local relief on top of the world elevation field. These are *features* —
  // a mound, a dip, a bank — not the landscape's overall shape, which the
  // field already provides.
  const terrain: TerrainPatchData[] = [];
  const bumpCount = 4 + Math.floor(rng() * 6);
  for (let i = 0; i < bumpCount; i += 1) {
    const { x, z } = spot();
    const localBiome = dominantBiomeAt(x, z);
    const band = elevationBandAt(x, z);
    const roll = rng();

    // Hollows as well as hills. A landscape that only ever bulges upward
    // reads as lumpy rather than varied, and dips give low ground somewhere
    // to be.
    const isHollow = roll < 0.22;
    // Sand collects low; dirt shows where ground is worked or worn.
    const sandy = localBiome === 'dunes' || (band < 0.35 && rng() < 0.5);
    const dirty = !sandy && rng() < 0.28;

    const scale = 0.6 + rng() * 1.9;
    terrain.push({
      x,
      z,
      radiusX: (2.2 + rng() * 4.6) * scale,
      radiusZ: (1.8 + rng() * 3.8) * scale,
      // Higher ground gets taller features, so highlands read as genuinely
      // rugged instead of the same bumps at a different altitude.
      height: isHollow
        ? -(0.2 + rng() * 0.5)
        : (0.25 + rng() * 0.7) * (0.7 + band * 1.1),
      material: sandy ? 'ground.dunes' : dirty ? 'paper.brown.warm' : undefined,
    });
  }

  const props: PropData[] = [];

  const treeCount = biome === 'forest' ? 48 + Math.floor(rng() * 21)
    : biome === 'tropical' ? 26 + Math.floor(rng() * 15)
    : biome === 'bamboo-forest' ? 8 + Math.floor(rng() * 6)
    : biome === 'swamp' ? 18 + Math.floor(rng() * 12)
    : biome === 'wetland' ? 8 + Math.floor(rng() * 7)
    : biome === 'rocky-highlands' ? 12 + Math.floor(rng() * 9)
    : biome === 'savanna' ? 8 + Math.floor(rng() * 7)
    : biome === 'badlands' ? 2 + Math.floor(rng() * 3)
    : biome === 'meadow' ? 5 + Math.floor(rng() * 5)
    : 2 + Math.floor(rng() * 3);
  for (let i = 0; i < treeCount; i += 1) {
    const { x, z } = spot();
    // Density follows the field, not the page. A forest page fades into
    // meadow across its own boundary instead of stopping dead at the border.
    const localBiome = dominantBiomeAt(x, z);
    const confidence = biomeConfidenceAt(x, z);
    if (localBiome !== biome && rng() > confidence * 0.35) continue;
    if (rng() > 0.35 + confidence * 0.65) continue;

    if (biome === 'dunes') {
      props.push({
        kind: 'decor',
        art: CACTI[Math.floor(rng() * CACTI.length)],
        x,
        z,
        rotY: rng() * Math.PI * 2,
        height: 1.8 + rng() * 2.2,
      });
      continue;
    }

    if (biome === 'tropical') {
      const tree = pickWeightedKind(TROPICAL_CANOPY, rng());
      // Layered heights are what make it read as a canopy: jungle
      // broadleafs run understory → canopy → emergent (see JUNGLE_LAYERS);
      // palms sometimes shoot up tall and skinny through the gaps; bananas
      // stay low with their own sprawl.
      const height = tree.startsWith('palm')
        ? (rng() < 0.3 ? 8 + rng() * 4 : 4.2 + rng() * 3.4)
        : tree.startsWith('jungle') ? jungleTreeHeight(rng)
        : 3.2 + rng() * 1.8;
      const rotY = rng() * 0.9 - 0.45;
      const vines = tree.startsWith('jungle') ? jungleVines(rng, height) : [];
      props.push({
        kind: 'tree',
        tree,
        x,
        z,
        rotY,
        height,
        ...(vines.length > 0 ? { vines } : {}),
      });
      continue;
    }

    if (biome === 'swamp' || biome === 'wetland' || biome === 'rocky-highlands' || biome === 'savanna' || biome === 'badlands') {
      const pool = biome === 'swamp' || biome === 'wetland' ? CYPRESS
        : biome === 'rocky-highlands' ? ALPINE_PINES
        : rng() < (biome === 'savanna' ? 0.78 : 0.62) ? ACACIAS : BAOBABS;
      const tree = pool[Math.floor(rng() * pool.length)];
      const height = tree.startsWith('baobab') ? 7 + rng() * 5
        : tree.startsWith('acacia') ? 4.5 + rng() * 3.5
        : tree.startsWith('cypress') ? 5.5 + rng() * 5
        : 5 + rng() * 5.5;
      props.push({ kind: 'tree', tree, x, z, rotY: rng() * 0.9 - 0.45, height });
      continue;
    }

    const redwood = biome === 'forest' && rng() < 0.16;
    const giant = !redwood && biome === 'forest' && rng() < 0.08;
    props.push({
      kind: 'tree',
      tree: redwood
        ? REDWOODS[Math.floor(rng() * REDWOODS.length)]
        : TREES[Math.floor(rng() * TREES.length)],
      x,
      z,
      rotY: rng() * 0.9 - 0.45,
      height: redwood ? 18 + rng() * 12
        : giant ? 10 + rng() * 8
        : biome === 'forest' ? 3.4 + rng() * 4.8
        : 2.15 + rng() * 1.2,
    });
  }

  // Understory: low decor that shares the scenery without joining the tree
  // economy. Sparse on the dunes, a proper floor in the forest, crowded in
  // the tropics — the biome plan's own words for it.
  const undergrowthPool = UNDERGROWTH[biome];
  if (undergrowthPool) {
    const undergrowthCount = biome === 'bamboo-forest' ? 30 + Math.floor(rng() * 16)
      : biome === 'swamp' || biome === 'wetland' ? 16 + Math.floor(rng() * 10)
      : biome === 'rocky-highlands' || biome === 'savanna' || biome === 'badlands' ? 12 + Math.floor(rng() * 8)
      : biome === 'meadow' ? 10 + Math.floor(rng() * 7)
      : biome === 'tropical' ? 9 + Math.floor(rng() * 6)
      : biome === 'forest' ? 5 + Math.floor(rng() * 5)
      : 2 + Math.floor(rng() * 3);
    for (let i = 0; i < undergrowthCount; i += 1) {
      const { x, z } = spot();
      // Fade with the field like the trees do, so understory never stands
      // in a neighbouring biome's ground.
      if (dominantBiomeAt(x, z) !== biome && rng() > biomeConfidenceAt(x, z) * 0.35) continue;
      const art = undergrowthPool[Math.floor(rng() * undergrowthPool.length)];
      const [minHeight, maxHeight] = decorHeight(art);
      props.push({
        kind: 'decor',
        art,
        x,
        z,
        rotY: rng() * Math.PI * 2,
        height: minHeight + rng() * (maxHeight - minHeight),
      });
    }
  }

  // Rock formations are future mine targets, deliberately not trimmable.
  // Highlands and badlands carry a real formation layer; other biomes get
  // the occasional stone so the mine verb will have places to grow into.
  const rockCount = biome === 'rocky-highlands' ? 10 + Math.floor(rng() * 8)
    : biome === 'badlands' ? 7 + Math.floor(rng() * 6)
    : biome === 'savanna' ? 2 + Math.floor(rng() * 3)
    : rng() < 0.55 ? 1 + Math.floor(rng() * 3) : 0;
  for (let i = 0; i < rockCount; i += 1) {
    const { x, z } = spot();
    const art = ROCKS[Math.floor(rng() * ROCKS.length)];
    const [minHeight, maxHeight] = decorHeight(art);
    props.push({ kind: 'decor', art, x, z, rotY: rng() * Math.PI * 2, height: minHeight + rng() * (maxHeight - minHeight) });
  }

  // Sparse palms on dunes: about one a page, never a grove. In the tropics
  // palms instead come through the ordinary tree budget, dense and mixed
  // into the canopy.
  const palmCount = biome === 'dunes' && rng() < 0.55 ? 1 + Math.floor(rng() * 2) : 0;
  for (let i = 0; i < palmCount; i += 1) {
    const { x, z } = spot();
    // Same field check the trees use, so palms fade out where the dunes do
    // rather than standing in the meadow on the far side of the boundary.
    if (dominantBiomeAt(x, z) !== 'dunes') continue;
    props.push({
      kind: 'tree',
      tree: PALMS[Math.floor(rng() * PALMS.length)],
      x,
      z,
      rotY: rng() * 0.9 - 0.45,
      height: 4.2 + rng() * 3.4,
    });
  }

  // Harvestables use the same page seed as scenery, so their types and
  // locations remain stable across clients and revisits. The tropics gather
  // like a forest — wet ground grows things.
  const resourceCount = biome === 'forest' || biome === 'tropical' || biome === 'swamp' || biome === 'wetland' || biome === 'bamboo-forest' ? 14 + Math.floor(rng() * 7)
    : biome === 'scrapflats' ? 10 + Math.floor(rng() * 6)
    : 8 + Math.floor(rng() * 6);
  const resourcePool = BIOME_RESOURCES[biome];
  for (let i = 0; i < resourceCount; i += 1) {
    const { x, z } = spot();
    const resource = resourcePool[Math.floor(rng() * resourcePool.length)];
    const definition = RESOURCE_DEFS[resource];
    props.push({
      kind: 'harvestable',
      resource,
      visual: definition.visual,
      material: definition.material,
      x,
      z,
      seed: seed + 800 + i,
      amount: 1 + Math.floor(rng() * (biome === 'forest' ? 3 : 2)),
      respawnSeconds: 75 + Math.floor(rng() * 75),
      mapColor: definition.mapColor,
    });
  }

  const pileCount = biome === 'scrapflats' ? 5 + Math.floor(rng() * 4) : rng() < 0.75 ? 1 + Math.floor(rng() * 2) : 0;
  for (let i = 0; i < pileCount; i += 1) {
    const { x, z } = spot();
    props.push({
      kind: 'scrapPile',
      material: biome === 'scrapflats' ? 'paper.brown' : 'paper.brown.warm',
      x,
      z,
      count: 5 + Math.floor(rng() * 8),
      seed: seed + 31 + i,
      spreadX: 1.2 + rng() * 1.4,
      spreadZ: 0.9 + rng() * 1.1,
      map: { kind: 'resource', color: '#8b5f38' },
    });
  }

  // Decorative paper patches: little wrapping/construction offcuts.
  const patchCount = 3 + Math.floor(rng() * 4);
  const patchMaterials = ['paper.blue', 'paper.plaid', 'paper.bubbles', 'paper.monstera'] as const;
  for (let i = 0; i < patchCount; i += 1) {
    const { x, z } = spot();
    props.push({
      kind: 'sheet',
      material: patchMaterials[Math.floor(rng() * patchMaterials.length)],
      width: 1.1 + rng() * 1.6,
      depth: 0.9 + rng() * 1.4,
      x,
      z,
      rotY: rng() * Math.PI,
    });
  }

  // Inland water is part of generated page data, so ponds and lakes use the
  // same water registry, wading rules, shoreline art, and treasure-map layer
  // as the authored clearing pond and the world-scale river.
  const pondCount = biome === 'swamp' ? 2 + Math.floor(rng() * 3)
    : biome === 'wetland' ? 1 + Math.floor(rng() * 3)
    : rng() < 0.055 ? 1 : 0;
  for (let i = 0; i < pondCount; i += 1) {
    const { x, z } = spot();
    const lake = i === 0 && (biome === 'swamp' || biome === 'wetland') && rng() < 0.3;
    const width = lake ? 10 + rng() * 6 : 3.5 + rng() * 4.5;
    const depth = lake ? 7 + rng() * 5 : 2.8 + rng() * 3.8;
    props.push({
      id: `${lake ? 'lake' : 'pond'}:${i}`,
      kind: 'water',
      width,
      depth,
      x,
      z,
      rotY: rng() * Math.PI,
      map: { kind: 'terrain', color: lake ? '#477b9d' : '#5a8e9f' },
    });
    for (let index = terrain.length - 1; index >= 0; index -= 1) {
      const patch = terrain[index];
      if (Math.abs(patch.x - x) <= patch.radiusX + width / 2 + 0.8
        && Math.abs(patch.z - z) <= patch.radiusZ + depth / 2 + 0.8) terrain.splice(index, 1);
    }
  }

  const groundMaterial = BIOME_GROUND_MATERIALS[biome];

  if (px === GREENHOUSE_PAGE.px && pz === GREENHOUSE_PAGE.pz) {
    // This page stays procedurally meadow-like outside the landmark, but Pip's
    // long planter house needs a calm clearing. Remove any generated object or
    // relief whose centre could reach into it, then lay a notebook-paper walk
    // from the home-side page edge to the west entrance.
    for (let index = terrain.length - 1; index >= 0; index -= 1) {
      const patch = terrain[index];
      if (
        Math.hypot(patch.x - GREENHOUSE_POSITION.x, patch.z - GREENHOUSE_POSITION.z)
        < GREENHOUSE_CLEAR_RADIUS + Math.max(patch.radiusX, patch.radiusZ)
      ) terrain.splice(index, 1);
    }
    for (let index = props.length - 1; index >= 0; index -= 1) {
      const prop = props[index];
      if (!('x' in prop) || !('z' in prop)) continue;
      if (Math.hypot(prop.x - GREENHOUSE_POSITION.x, prop.z - GREENHOUSE_POSITION.z) < GREENHOUSE_CLEAR_RADIUS) {
        props.splice(index, 1);
      }
    }
    const pathEndX = GREENHOUSE_POSITION.x - GREENHOUSE_CLEAR_RADIUS + 1.3;
    const pathStartX = px * PAGE_SIZE - PAGE_SIZE / 2;
    props.push(
      {
        kind: 'sheet',
        material: 'paper.notebook',
        width: pathEndX - pathStartX,
        depth: 1.7,
        x: (pathStartX + pathEndX) / 2,
        z: GREENHOUSE_POSITION.z,
        map: { kind: 'path', color: '#ece6bd' },
      },
      { kind: 'unique', unique: 'seedStore' },
    );
  }

  return {
    id: pageId(px, pz),
    px,
    pz,
    biome,
    seed,
    groundMaterial,
    terrain,
    props,
  };
}
