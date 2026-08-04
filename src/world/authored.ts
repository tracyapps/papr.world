import { PAGE_SIZE, pageId, type PageData } from './types';

// Hand-authored pages. The original prototype clearing is page 0,0.
// Coordinates are world-space (page 0,0 spans -11..11 on both axes).

const clearing: PageData = {
  id: pageId(0, 0),
  px: 0,
  pz: 0,
  biome: 'clearing',
  seed: 1427,
  groundMaterial: 'ground.clearing',
  terrain: [
    { x: -1.45, z: -1.95, radiusX: 2.5, radiusZ: 1.65, height: 0.78 },
    { x: 1.45, z: -2.65, radiusX: 1.25, radiusZ: 0.78, height: 0.12 },
  ],
  props: [
    {
      kind: 'sheet',
      material: 'paper.notebook',
      width: 2.2,
      depth: 13.4,
      x: -3.2,
      z: -0.85,
      rotY: -0.18,
      map: { kind: 'path', color: '#ece6bd' },
    },
    {
      kind: 'scrapPile',
      material: 'paper.brown',
      x: -3.35,
      z: 2.65,
      count: 16,
      seed: 1427,
      spreadX: 2.2,
      spreadZ: 1.6,
      map: { kind: 'resource', color: '#8b5f38' },
    },
    {
      kind: 'scrapPile',
      material: 'paper.brown',
      x: 7.35,
      z: 2.95,
      count: 10,
      seed: 2205,
      spreadX: 1.4,
      spreadZ: 1.3,
      map: { kind: 'resource', color: '#8b5f38' },
    },
    { kind: 'sheet', material: 'paper.plaid', width: 1.6, depth: 1.6, x: 1.35, z: 3.55, rotY: 0.38 },
    { kind: 'harvestable', resource: 'kraft-twigs', visual: 'twigBundle', material: 'paper.brown', x: -2.2, z: 0.75, seed: 7101, amount: 2, respawnSeconds: 60, mapColor: '#8b5f38' },
    { kind: 'harvestable', resource: 'mossy-paper-fiber', visual: 'fiberTuft', material: 'paper.monstera', x: 0.15, z: 2.35, seed: 7102, amount: 2, respawnSeconds: 70, mapColor: '#4f823f' },
    { kind: 'harvestable', resource: 'bluefold-pebbles', visual: 'stoneCluster', material: 'paper.aqua', x: -4.65, z: 4.9, seed: 7103, amount: 2, respawnSeconds: 85, mapColor: '#4c91a8' },
    { kind: 'harvestable', resource: 'confetti-stones', visual: 'stoneCluster', material: 'paper.purple', x: 5.85, z: 4.45, seed: 7104, amount: 1, respawnSeconds: 95, mapColor: '#8252a0' },
    {
      kind: 'sheet',
      material: 'paper.blue',
      width: 2.3,
      depth: 1.65,
      x: 4.9,
      z: -6.25,
      rotY: 0.32,
      map: { kind: 'terrain', color: '#5d93a9' },
    },
    { kind: 'ribbon', material: 'paper.orangewrap', x: -1.45, z: -1.95, width: 2.7, depth: 0.42, rotY: -0.36, map: { kind: 'landmark', color: '#c86f38' } },
    // West treeline
    { kind: 'tree', tree: 'pine-medium-1', x: -5.25, z: -1.55, rotY: 0.55, height: 2.8 },
    { kind: 'tree', tree: 'leafy-2', x: -6.15, z: 0.05, rotY: 0.45, height: 2.55 },
    { kind: 'tree', tree: 'pine-tall', x: -3.95, z: -2.65, rotY: 0.5, height: 3.2 },
    // North grove
    { kind: 'tree', tree: 'pine-medium-2', x: 5.7, z: -5.6, rotY: 0.28, height: 2.35 },
    { kind: 'tree', tree: 'leafy-1', x: 4.25, z: -6.85, rotY: 0.44, height: 2.45, mapColor: '#47712c' },
    { kind: 'tree', tree: 'pine-medium-1', x: 6.3, z: -7.25, rotY: 0.2, height: 2.55 },
    // A sentinel at the western forest entrance previews the canopy scale.
    { kind: 'tree', tree: 'redwood-1', x: -11.4, z: -8.2, rotY: -0.16, height: 24, mapColor: '#194f2d' },
    // One-off set pieces
    { kind: 'unique', unique: 'clearingHouse' },
    { kind: 'unique', unique: 'thingMaker' },
    { kind: 'unique', unique: 'critters' },
    { kind: 'unique', unique: 'displayWall' },
    { kind: 'unique', unique: 'cozyDetails' },
    { kind: 'unique', unique: 'clearingSignpost' },
  ],
};

/** Authored offsets below were designed on 22-unit pages; spread them
 * proportionally across whatever PAGE_SIZE is now. */
const S = PAGE_SIZE / 22;
const REDWOOD_KINDS = [
  'redwood-1', 'redwood-2', 'redwood-3', 'redwood-4', 'redwood-5', 'redwood-6', 'redwood-7',
] as const;

/**
 * Forest corridor west of the clearing: denser trees and a notebook path
 * that keeps winding on from the clearing's own path.
 */
function forestPage(px: number, pz: number, seed: number, treeSpots: Array<[number, number, string]>): PageData {
  const cx = px * PAGE_SIZE;
  const cz = pz * PAGE_SIZE;
  // Each art-directed anchor grows into a small, uneven stand. This keeps the
  // notebook trail readable while making the authored corridor feel like a
  // forest instead of a row of specimen trees.
  const denseTreeSpots = treeSpots.flatMap(([x, z, kind], index) => [
    { x, z, kind, index: index * 3 },
    { x: x + (index % 2 === 0 ? 1.35 : -1.55), z: z + ((index % 3) - 1) * 1.2, kind, index: index * 3 + 1 },
    { x: x + (index % 2 === 0 ? -1.7 : 1.45), z: z + (index % 3 === 0 ? 1.45 : -1.35), kind: index % 4 === 0 ? 'leafy-2' : kind, index: index * 3 + 2 },
  ]);
  return {
    id: pageId(px, pz),
    px,
    pz,
    biome: 'forest',
    seed,
    groundMaterial: 'ground.forest',
    terrain: [
      { x: cx + 3.5 * S, z: cz - 4 * S, radiusX: 4.6, radiusZ: 3.3, height: 0.55 },
      { x: cx - 4.5 * S, z: cz + 5 * S, radiusX: 3.6, radiusZ: 2.8, height: 0.4 },
    ],
    props: [
      {
        kind: 'sheet',
        material: 'paper.notebook',
        width: 2.2,
        depth: 15 * S,
        x: cx + 3.4 * S,
        z: cz - 0.4 * S,
        rotY: -0.3,
        map: { kind: 'path', color: '#ece6bd' },
      },
      {
        kind: 'scrapPile',
        material: 'paper.brown',
        x: cx - 2.5 * S,
        z: cz - 5.5 * S,
        count: 8,
        seed: seed + 11,
        spreadX: 1.6,
        spreadZ: 1.2,
        map: { kind: 'resource', color: '#8b5f38' },
      },
      { kind: 'harvestable', resource: 'ribbonwood-sticks', visual: 'twigBundle', material: 'paper.salmon', x: cx - 4.8 * S, z: cz - 2.4 * S, seed: seed + 81, amount: 2, respawnSeconds: 90, mapColor: '#b45e67' },
      { kind: 'harvestable', resource: 'mossy-paper-fiber', visual: 'fiberTuft', material: 'paper.monstera', x: cx + 0.8 * S, z: cz + 5.2 * S, seed: seed + 82, amount: 2, respawnSeconds: 75, mapColor: '#4f823f' },
      { kind: 'harvestable', resource: 'graphite-cardstone', visual: 'stoneCluster', material: 'paper.grey', x: cx + 6.2 * S, z: cz - 1.4 * S, seed: seed + 83, amount: 2, respawnSeconds: 110, mapColor: '#696c70' },
      ...REDWOOD_KINDS.map((tree, index): PageData['props'][number] => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const x = cx + (-7.8 + column * 7.2 + (row % 2) * 1.1) * S;
        const z = cz + (-8 + row * 7.1 + (column % 2) * 1.35) * S;
        return {
          kind: 'tree',
          tree,
          x,
          z,
          rotY: -0.34 + index * 0.12,
          height: 20 + ((seed + index * 37) % 81) / 10,
          mapColor: '#194f2d',
        };
      }),
      ...denseTreeSpots.map(({ x, z, kind, index }): PageData['props'][number] => ({
        kind: 'tree',
        tree: kind as 'pine-medium-1',
        x: cx + x * S,
        z: cz + z * S,
        rotY: (((x * 7 + z * 13 + index) % 10) + 10) / 10,
        height: index % 11 === 0
          ? 11.5 + ((seed + index * 17) % 45) / 10
          : 4.5 + ((seed + index * 29) % 42) / 10,
      })),
    ],
  };
}

function signedForestPage(px: number, pz: number, seed: number, treeSpots: Array<[number, number, string]>) {
  const page = forestPage(px, pz, seed, treeSpots);
  page.props.push({ kind: 'unique', unique: 'forestTrailSign' });
  return page;
}

function woodMillPage(px: number, pz: number, seed: number, treeSpots: Array<[number, number, string]>) {
  const page = forestPage(px, pz, seed, treeSpots);
  const millX = -94;
  const millZ = 0;
  page.props = page.props.filter((prop) => (
    prop.kind !== 'tree' || Math.hypot(prop.x - millX, prop.z - millZ) > 15
  ));
  page.props.push(
    {
      kind: 'sheet', material: 'paper.notebook', width: 2.4, depth: 13,
      x: -89.3, z: -0.8, rotY: -0.42, map: { kind: 'path', color: '#ece6bd' },
    },
    { kind: 'unique', unique: 'woodMill' },
  );
  return page;
}

/** Sand dune flats south of the clearing: open, warm, sparse. */
function dunesPage(px: number, pz: number, seed: number): PageData {
  const cx = px * PAGE_SIZE;
  const cz = pz * PAGE_SIZE;
  return {
    id: pageId(px, pz),
    px,
    pz,
    biome: 'dunes',
    seed,
    groundMaterial: 'ground.dunes',
    terrain: [
      { x: cx - 3 * S, z: cz - 2 * S, radiusX: 6.4, radiusZ: 3.9, height: 0.62 },
      { x: cx + 5 * S, z: cz + 4 * S, radiusX: 5.4, radiusZ: 3.3, height: 0.5 },
      { x: cx + 1.5 * S, z: cz - 6.5 * S, radiusX: 3.9, radiusZ: 2.7, height: 0.34 },
    ],
    props: [
      {
        kind: 'sheet',
        material: 'paper.brown.warm',
        width: 2.6,
        depth: 2.0,
        x: cx + 4 * S,
        z: cz - 3 * S,
        rotY: 0.5,
        map: { kind: 'terrain', color: '#b08a54' },
      },
      { kind: 'tree', tree: 'leafy-1', x: cx - 6.5 * S, z: cz + 6 * S, rotY: 0.3, height: 2.2 },
      {
        kind: 'scrapPile',
        material: 'paper.brown.warm',
        x: cx - 1 * S,
        z: cz + 7 * S,
        count: 6,
        seed: seed + 3,
        spreadX: 1.8,
        spreadZ: 1.2,
        map: { kind: 'resource', color: '#a97e46' },
      },
      { kind: 'harvestable', resource: 'sunbaked-cardboard', visual: 'stoneCluster', material: 'paper.brown.warm', x: cx + 1.8 * S, z: cz + 1.6 * S, seed: seed + 91, amount: 2, respawnSeconds: 100, mapColor: '#af7e42' },
      { kind: 'harvestable', resource: 'bluefold-pebbles', visual: 'stoneCluster', material: 'paper.aqua', x: cx - 5.2 * S, z: cz - 1.2 * S, seed: seed + 92, amount: 2, respawnSeconds: 105, mapColor: '#4c91a8' },
    ],
  };
}

const authoredPages = new Map<string, PageData>([
  [clearing.id, clearing],
  [
    pageId(-1, 0),
    signedForestPage(-1, 0, 5101, [
      [-6, -6, 'pine-tall'],
      [-2.5, -7.5, 'pine-medium-1'],
      [2, -5, 'leafy-1'],
      [6.5, -7, 'pine-medium-2'],
      [-7.5, -1, 'pine-medium-1'],
      [-4, 1.5, 'leafy-2'],
      [0.5, 3.5, 'pine-medium-2'],
      [6, 2.5, 'pine-tall'],
      [-6.5, 6.5, 'pine-medium-2'],
      [-1.5, 7.5, 'pine-medium-1'],
      [4, 7, 'leafy-1'],
    ]),
  ],
  [
    pageId(-2, 0),
    woodMillPage(-2, 0, 5102, [
      [-5, -7, 'pine-medium-2'],
      [0, -6.5, 'pine-tall'],
      [5.5, -5.5, 'pine-medium-1'],
      [-7, -2.5, 'leafy-1'],
      [-2, -1, 'pine-medium-1'],
      [3.5, 0.5, 'leafy-2'],
      [7.5, 1.5, 'pine-medium-2'],
      [-5.5, 4, 'pine-tall'],
      [0.5, 6, 'pine-medium-2'],
      [5, 7.5, 'pine-medium-1'],
    ]),
  ],
  [pageId(0, 1), dunesPage(0, 1, 6201)],
  [pageId(1, 1), dunesPage(1, 1, 6202)],
]);

export function getAuthoredPage(px: number, pz: number): PageData | null {
  return authoredPages.get(pageId(px, pz)) ?? null;
}
