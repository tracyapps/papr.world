import { createRng, hashCoords } from '../core/math';
import { PAGE_SIZE, pageId, type Biome, type DecorKind, type PageData, type PropData, type TerrainPatchData, type TreeKind } from './types';
import { BIOME_RESOURCES, RESOURCE_DEFS } from './resources';
import { BIOME_GROUND_MATERIALS, biomeConfidenceAt, dominantBiomeAt, elevationBandAt } from './fields';
import {
  GREENHOUSE_CLEAR_RADIUS,
  GREENHOUSE_PAGE,
  GREENHOUSE_POSITION,
} from './seedStoreLayout';

// Seeded page generation for pages without authored data.
// Deterministic from page coordinates, so every client agrees.


const TREES: TreeKind[] = ['pine-medium-1', 'pine-medium-2', 'pine-tall', 'leafy-1', 'leafy-2'];
const REDWOODS: TreeKind[] = [
  'redwood-1', 'redwood-2', 'redwood-3', 'redwood-4', 'redwood-5', 'redwood-6', 'redwood-7',
];
// Dunes pages scatter cactus instead of pine/leafy trees — same slot in the
// per-page budget, just desert-appropriate scenery.
const CACTI: DecorKind[] = [
  'cactus-1', 'cactus-2', 'cactus-3', 'cactus-4', 'cactus-5', 'cactus-6', 'cactus-7', 'cactus-8',
];

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

  // Harvestables use the same page seed as scenery, so their types and
  // locations remain stable across clients and revisits.
  const resourceCount = biome === 'forest' ? 14 + Math.floor(rng() * 7)
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
