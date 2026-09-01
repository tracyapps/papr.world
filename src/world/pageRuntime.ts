import * as THREE from 'three';
import { aspect, createRng } from '../core/math';
import { createCutout, createSheet, groundedCutoutY } from '../render/builders';
import { getMaterial } from '../render/materials';
import { registerHarvestable } from '../game/harvesting';
import { buildCritters, populatePageCritters } from '../game/critters';
import { buildThingMaker } from '../game/thingMaker';
import { buildSeedStore } from '../game/seedStore';
import { registerMapFeature } from './mapFeatures';
import { buildClearingHouse, buildCozyClearingDetails, buildDisplayWall } from './setPieces';
import { buildClearingSignpost, buildForestTrailSignpost } from './signposts';
import { buildWoodMill } from './woodMill';
import {
  createDugCellMesh,
  createTerrainPageMesh,
  createTerrainPatchMesh,
  createBiomeOverlayMaterial,
  createBiomeOverlayMesh,
  createTerrainRibbon,
  refreshTerrainSurfaceMeshes,
  sampleTerrainHeight,
} from './terrain';
import { buildWaterSurface, getWaterBody, isInWater, registerPageWater } from './water';
import { BIOME_GROUND_MATERIALS } from './fields';
import type { Biome, DecorKind, PageData, PropData, TreeKind } from './types';
import { getGameState } from '../sim/state';
import { RESOURCE_DEFS } from './resources';
import { buildTerrainPlantVisual } from './plantRuntime';
import { buildPlacedPieceVisual } from './buildPieceVisuals';
import { registerTerrainPlant } from '../game/plantInteractions';
import { registerPlacedPieceVisual } from '../game/placedPieceInteractions';
import { treeSpeciesOf } from './treeRuntime';
import { registerTrimmableTree } from '../game/treeInteractions';

// Turns serializable PageData into a Three.js group.
// Authored data and generated data flow through the exact same path.

export const TREE_DEFS: Record<TreeKind, { url: string; aspectRatio: number; mapColor: string }> = {
  'pine-medium-1': { url: '/assets/runtime/props/pine-tree-medium-01.png', aspectRatio: aspect(560, 879), mapColor: '#146c32' },
  'pine-medium-2': { url: '/assets/runtime/props/pine-tree-medium-02.png', aspectRatio: aspect(623, 846), mapColor: '#14713a' },
  'pine-tall': { url: '/assets/runtime/props/pine-tree-tall-01.png', aspectRatio: aspect(543, 997), mapColor: '#146c32' },
  'leafy-1': { url: '/assets/runtime/props/tree-01.png', aspectRatio: aspect(722, 936), mapColor: '#47712c' },
  'leafy-2': { url: '/assets/runtime/props/tree-02.png', aspectRatio: aspect(624, 871), mapColor: '#3e7a2e' },
  'redwood-1': { url: '/assets/runtime/props/redwood.png', aspectRatio: aspect(787, 2385), mapColor: '#194f2d' },
  'redwood-2': { url: '/assets/runtime/props/redwood2.png', aspectRatio: aspect(787, 2385), mapColor: '#194f2d' },
  'redwood-3': { url: '/assets/runtime/props/redwood3.png', aspectRatio: aspect(787, 2385), mapColor: '#145735' },
  'redwood-4': { url: '/assets/runtime/props/redwood4.png', aspectRatio: aspect(787, 2385), mapColor: '#174b2c' },
  'redwood-5': { url: '/assets/runtime/props/redwood5.png', aspectRatio: aspect(787, 2385), mapColor: '#1c5b34' },
  'redwood-6': { url: '/assets/runtime/props/redwood6.png', aspectRatio: aspect(787, 2385), mapColor: '#17613a' },
  'redwood-7': { url: '/assets/runtime/props/redwood7.png', aspectRatio: aspect(787, 2385), mapColor: '#24572c' },
};

/** Desert scenery cutouts. Rendered like trees, but never trimmable. */
export const DECOR_DEFS: Record<DecorKind, { url: string; aspectRatio: number; mapColor: string }> = {
  'cactus-1': { url: '/assets/runtime/props/cactus-01.png', aspectRatio: aspect(277, 520), mapColor: '#4f8a3d' },
  'cactus-2': { url: '/assets/runtime/props/cactus-02.png', aspectRatio: aspect(394, 500), mapColor: '#548f3f' },
  'cactus-3': { url: '/assets/runtime/props/cactus-03.png', aspectRatio: aspect(465, 529), mapColor: '#4a8639' },
  'cactus-4': { url: '/assets/runtime/props/cactus-04.png', aspectRatio: aspect(516, 527), mapColor: '#5a9445' },
  'cactus-5': { url: '/assets/runtime/props/cactus-05.png', aspectRatio: aspect(277, 520), mapColor: '#4f8a3d' },
  'cactus-6': { url: '/assets/runtime/props/cactus-06.png', aspectRatio: aspect(444, 500), mapColor: '#4d8d41' },
  'cactus-7': { url: '/assets/runtime/props/cactus-07.png', aspectRatio: aspect(342, 352), mapColor: '#57923f' },
  'cactus-8': { url: '/assets/runtime/props/cactus-08.png', aspectRatio: aspect(209, 471), mapColor: '#4a8339' },
};

const GROUND_MAP_COLORS: Record<string, string> = {
  clearing: '#c5b482',
  forest: '#587d48',
  meadow: '#6f9153',
  dunes: '#cbb27a',
  scrapflats: '#b5a276',
};

function buildProp(page: PageData, prop: PropData, index: number, group: THREE.Group) {
  const positionalId = 'x' in prop && 'z' in prop
    ? `${prop.kind}:${prop.x.toFixed(3)}:${prop.z.toFixed(3)}`
    : prop.kind === 'unique' ? `unique:${prop.unique}` : prop.kind;
  const featureId = `page:${page.id}:prop:${prop.id ?? positionalId}`;

  // Nothing dry belongs in a pond. Loose materials, scrap, and trees are all
  // placed from seeded coordinates that know nothing about water, so the
  // check lives here rather than in each generator.
  if ('x' in prop && 'z' in prop && prop.kind !== 'water' && isInWater(prop.x, prop.z)) {
    return;
  }

  switch (prop.kind) {
    case 'sheet': {
      const y = prop.y ?? 0.01 + sampleTerrainHeight(prop.x, prop.z);
      const sheet = createSheet(prop.width, prop.depth, getMaterial(prop.material), [prop.x, y, prop.z]);
      if (prop.rotY) sheet.rotation.y = prop.rotY;
      group.add(sheet);
      if (prop.map) {
        registerMapFeature({
          color: prop.map.color,
          id: featureId,
          kind: prop.map.kind,
          radiusX: prop.width / 2,
          radiusZ: prop.depth / 2,
          rotation: prop.rotY,
          shape: 'rect',
          x: prop.x,
          z: prop.z,
        });
      }
      break;
    }

    case 'scrapPile': {
      const rng = createRng(prop.seed);
      const material = getMaterial(prop.material);
      const pile = new THREE.Group();
      for (let i = 0; i < prop.count; i += 1) {
        const x = prop.x - prop.spreadX / 2 + rng() * prop.spreadX;
        const z = prop.z - prop.spreadZ / 2 + rng() * prop.spreadZ;
        const scrap = createSheet(
          0.45 + rng() * 0.5,
          0.35 + rng() * 0.4,
          material,
          [x, sampleTerrainHeight(x, z) + 0.04 + i * 0.001, z],
        );
        scrap.rotation.y = rng() * Math.PI;
        pile.add(scrap);
      }
      group.add(pile);
      if (prop.map) {
        registerMapFeature({
          color: prop.map.color,
          id: featureId,
          kind: prop.map.kind,
          radiusX: Math.max(0.8, prop.spreadX * 0.55),
          radiusZ: Math.max(0.7, prop.spreadZ * 0.55),
          shape: 'circle',
          x: prop.x,
          z: prop.z,
        });
      }
      break;
    }

    case 'water': {
      // The body was registered in the page's water pre-pass; this only
      // draws it. Looking it up rather than re-creating it keeps one source
      // of truth for where the water actually is.
      const body = getWaterBody(`${page.id}:prop:${prop.id ?? index}`);
      if (!body) break;
      group.add(buildWaterSurface(body));
      registerMapFeature({
        color: prop.map?.color ?? '#5a86a8',
        id: featureId,
        kind: prop.map?.kind ?? 'terrain',
        radiusX: prop.width / 2,
        radiusZ: prop.depth / 2,
        rotation: prop.rotY,
        shape: 'rect',
        x: prop.x,
        z: prop.z,
      });
      break;
    }

    case 'waterChannel': {
      const body = getWaterBody(`${page.id}:prop:${prop.id ?? index}`);
      if (!body || body.kind !== 'channel') break;
      group.add(buildWaterSurface(body));
      for (let segment = 0; segment < prop.points.length - 1; segment += 1) {
        const [ax, az] = prop.points[segment];
        const [bx, bz] = prop.points[segment + 1];
        const width = Math.max(prop.widths[segment] ?? 1, prop.widths[segment + 1] ?? 1);
        registerMapFeature({
          color: prop.map?.color ?? '#4e84a4',
          id: `${featureId}:segment:${segment}`,
          kind: prop.map?.kind ?? 'terrain',
          radiusX: Math.hypot(bx - ax, bz - az) / 2,
          radiusZ: width / 2,
          rotation: Math.atan2(-(bz - az), bx - ax),
          shape: 'rect',
          x: (ax + bx) / 2,
          z: (az + bz) / 2,
        });
      }
      if (prop.crossing) {
        registerMapFeature({
          color: '#9b7149',
          id: `${featureId}:bridge`,
          kind: 'landmark',
          radiusX: prop.crossing.length / 2,
          radiusZ: prop.crossing.width / 2,
          rotation: prop.crossing.rotationY,
          shape: 'rect',
          x: prop.crossing.x,
          z: prop.crossing.z,
        });
      }
      break;
    }

    case 'tree': {
      const def = TREE_DEFS[prop.tree];
      const height = prop.height ?? 2.6;
      const baseY = sampleTerrainHeight(prop.x, prop.z);
      const tree = createCutout({
        aspectRatio: def.aspectRatio,
        height,
        position: [prop.x, groundedCutoutY(baseY, height), prop.z],
        rotationY: prop.rotY ?? 0,
        textureUrl: def.url,
      });
      group.add(tree);
      // `positionalId` is already derived from the tree's generated
      // coordinates, so it is stable across reloads and identical on every
      // client — which is what makes it usable as the save key for growth.
      registerTrimmableTree({
        id: featureId,
        object: tree,
        pageId: page.id,
        treeKey: prop.id ?? positionalId,
        species: treeSpeciesOf(prop.tree),
        x: prop.x,
        z: prop.z,
        height,
        baseY,
      });
      registerMapFeature({
        color: prop.mapColor ?? def.mapColor,
        id: featureId,
        kind: 'tree',
        radiusX: 0.28,
        radiusZ: 0.28,
        shape: 'circle',
        x: prop.x,
        z: prop.z,
      });
      break;
    }

    case 'decor': {
      // Same cutout treatment as a tree, but intentionally skips
      // `registerTrimmableTree` — desert scenery like cactus isn't part of
      // the tree-growth/harvest economy.
      const def = DECOR_DEFS[prop.art];
      const height = prop.height ?? 2.4;
      const baseY = sampleTerrainHeight(prop.x, prop.z);
      const decor = createCutout({
        aspectRatio: def.aspectRatio,
        height,
        position: [prop.x, groundedCutoutY(baseY, height), prop.z],
        rotationY: prop.rotY ?? 0,
        textureUrl: def.url,
      });
      group.add(decor);
      registerMapFeature({
        color: prop.mapColor ?? def.mapColor,
        id: featureId,
        kind: 'tree',
        radiusX: 0.24,
        radiusZ: 0.24,
        shape: 'circle',
        x: prop.x,
        z: prop.z,
      });
      break;
    }

    case 'ribbon': {
      const ribbon = createTerrainRibbon(
        new THREE.Vector2(prop.x, prop.z),
        prop.width,
        prop.depth,
        getMaterial(prop.material),
        prop.rotY,
      );
      group.add(ribbon);
      if (prop.map) {
        registerMapFeature({
          color: prop.map.color,
          id: featureId,
          kind: prop.map.kind,
          radiusX: prop.width / 2,
          radiusZ: Math.max(0.22, prop.depth / 2),
          rotation: prop.rotY,
          shape: 'rect',
          x: prop.x,
          z: prop.z,
        });
      }
      break;
    }

    case 'harvestable': {
      const rng = createRng(prop.seed);
      const material = getMaterial(prop.material);
      const node = new THREE.Group();
      node.position.set(prop.x, sampleTerrainHeight(prop.x, prop.z) + 0.035, prop.z);

      if (prop.visual === 'twigBundle') {
        for (let twigIndex = 0; twigIndex < 5; twigIndex += 1) {
          const length = 0.48 + rng() * 0.38;
          const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.038, length, 7), material);
          twig.rotation.z = Math.PI / 2 + (rng() - 0.5) * 0.24;
          twig.rotation.y = (rng() - 0.5) * 0.9;
          twig.position.set((rng() - 0.5) * 0.38, 0.05 + twigIndex * 0.018, (rng() - 0.5) * 0.3);
          twig.castShadow = true;
          node.add(twig);
        }
      } else if (prop.visual === 'stoneCluster') {
        for (let stoneIndex = 0; stoneIndex < 5; stoneIndex += 1) {
          const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 + rng() * 0.12, 0), material);
          stone.scale.set(1 + rng() * 0.35, 0.55 + rng() * 0.35, 0.85 + rng() * 0.35);
          stone.position.set((rng() - 0.5) * 0.55, 0.09 + rng() * 0.06, (rng() - 0.5) * 0.48);
          stone.rotation.set(rng(), rng(), rng());
          stone.castShadow = true;
          node.add(stone);
        }
      } else {
        for (let bladeIndex = 0; bladeIndex < 7; bladeIndex += 1) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.46 + rng() * 0.25, 0.025), material);
          const angle = (bladeIndex / 7) * Math.PI * 2;
          blade.position.set(Math.cos(angle) * 0.14, 0.24, Math.sin(angle) * 0.14);
          blade.rotation.set((rng() - 0.5) * 0.25, -angle, (rng() - 0.5) * 0.42);
          blade.castShadow = true;
          node.add(blade);
        }
      }

      group.add(node);
      registerHarvestable({
        id: featureId,
        object: node,
        resource: prop.resource,
        amount: prop.amount,
        respawnSeconds: prop.respawnSeconds,
      });
      registerMapFeature({
        color: prop.mapColor,
        id: featureId,
        kind: 'resource',
        radiusX: 0.32,
        radiusZ: 0.32,
        shape: 'circle',
        x: prop.x,
        z: prop.z,
      });
      break;
    }

    case 'unique': {
      switch (prop.unique) {
        case 'clearingHouse':
          buildClearingHouse(group);
          break;
        case 'thingMaker':
          buildThingMaker(group);
          break;
        case 'seedStore':
          buildSeedStore(group);
          break;
        case 'critters':
          buildCritters(group);
          break;
        case 'displayWall':
          buildDisplayWall(group);
          break;
        case 'cozyDetails':
          buildCozyClearingDetails(group);
          break;
        case 'clearingSignpost':
          buildClearingSignpost(group);
          break;
        case 'forestTrailSign':
          buildForestTrailSignpost(group);
          break;
        case 'woodMill':
          buildWoodMill(group);
          break;
      }
      break;
    }
  }
}

export function buildPageGroup(page: PageData): THREE.Group {
  const group = new THREE.Group();
  group.name = `page:${page.id}`;

  // Neighboring ground sheets overlap a touch at alternating heights, so
  // pages read as paper sheets laid over each other instead of seams.
  const ground = createTerrainPageMesh(page, getMaterial(page.groundMaterial));
  ground.userData.terrainSurfaceOffset -= (Math.abs(page.px + page.pz) % 2) * 0.006;
  refreshTerrainSurfaceMeshes(ground);
  group.add(ground);

  // Every other biome that reaches onto this page is laid over the base as a
  // translucent sheet, faded in by the field. This is what makes a boundary
  // able to fall mid-page, at an angle, in a torn line — rather than only
  // ever at a page edge.
  (['meadow', 'forest', 'dunes', 'scrapflats'] as Biome[])
    .filter((biome) => biome !== page.biome)
    .forEach((biome, layer) => {
      const overlay = createBiomeOverlayMesh(
        page,
        biome,
        createBiomeOverlayMaterial(getMaterial(BIOME_GROUND_MATERIALS[biome])),
        layer + 1,
      );
      if (overlay) group.add(overlay);
    });

  page.terrain.forEach((patch, index) => {
    // A patch may name its own paper (sand mound, dirt mound); otherwise it
    // takes the biome's default hill.
    const material = getMaterial(
      patch.material ?? (page.biome === 'dunes' ? 'ground.dunes' : 'paper.hill'),
    );
    const repeat = new THREE.Vector2(2.2 + patch.radiusX * 0.16, 1.5 + patch.radiusZ * 0.16);
    const mesh = createTerrainPatchMesh(patch, material, 40, 12, repeat);
    group.add(mesh);
    registerMapFeature({
      color: page.biome === 'dunes' ? '#c2a05e' : '#2f7d3f',
      id: `page:${page.id}:terrain:${index}`,
      kind: 'terrain',
      radiusX: patch.radiusX,
      radiusZ: patch.radiusZ,
      shape: 'circle',
      x: patch.x,
      z: patch.z,
    });
  });

  // Water first. Everything placed afterwards asks the registry whether its
  // spot is wet, so a body registered later would be invisible to props
  // already positioned — which is how a stone cluster ended up floating on
  // the clearing pond.
  registerPageWater(page.id, page.props);

  page.props.forEach((prop, index) => {
    buildProp(page, prop, index, group);
  });

  buildTerrainEditVisuals(page.id, group);
  buildPlacedPieceVisuals(page.id, group);

  // The clearing's residents come from its 'critters' unique prop;
  // every other page gets a seeded population.
  if (page.id !== '0,0') {
    populatePageCritters(page, group);
  }

  return group;
}

/**
 * Rebuild the build pieces standing on a page. Rebuilding from state (rather
 * than caching a grown list) keeps this correct after any placement, and the
 * list is tiny — a page costs nothing until someone builds on it.
 */
function buildPlacedPieceVisuals(pageId: string, group: THREE.Group) {
  const previous = group.getObjectByName('placed-piece-visuals');
  if (previous) group.remove(previous);

  const visuals = new THREE.Group();
  visuals.name = 'placed-piece-visuals';
  const pageState = getGameState().world.pages[pageId];
  if (pageState) {
    for (const piece of Object.values(pageState.placedPieces)) {
      if (piece.page !== pageId) continue;
      const visual = buildPlacedPieceVisual(piece);
      visual.position.set(piece.x, sampleTerrainHeight(piece.x, piece.z) + 0.01, piece.z);
      visuals.add(visual);
      registerPlacedPieceVisual(piece.id, visual);
    }
  }
  group.add(visuals);
}

function buildTerrainEditVisuals(pageId: string, group: THREE.Group) {
  const previous = group.getObjectByName('terrain-edit-visuals');
  if (previous) {
    previous.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    group.remove(previous);
  }
  const edits = new THREE.Group();
  edits.name = 'terrain-edit-visuals';
  const pageState = getGameState().world.pages[pageId];
  if (pageState) {
    for (const [cellKey, edit] of Object.entries(pageState.terrainEdits)) {
      const revealed = edit.revealedLayers.at(-1);
      const material = revealed ? RESOURCE_DEFS[revealed.resource].material : 'paper.brown.warm';
      edits.add(createDugCellMesh(edit, getMaterial(material)));
      const plant = buildTerrainPlantVisual(edit);
      if (plant) {
        edits.add(plant);
        // Every planted crop needs its seed-drop-ready flag polled and its
        // pickup made clickable/walkable — not just the starter flower this
        // was originally wired for. `buildTerrainPlantVisual` already builds
        // a correct produce-basket pickup for any seed id; registering here
        // is the only step that was still buttonbloom-only.
        if (edit.state === 'planted') {
          registerTerrainPlant({
            id: `${pageId}:${cellKey}`,
            object: plant,
            pageId,
            cellKey,
            x: edit.x,
            z: edit.z,
          });
        }
      }
    }
  }
  group.add(edits);
}

export function refreshPageTerrain(pageId: string, group: THREE.Group) {
  refreshTerrainSurfaceMeshes(group);
  buildTerrainEditVisuals(pageId, group);
  buildPlacedPieceVisuals(pageId, group);
}

export function getGroundMapColor(biome: string) {
  return GROUND_MAP_COLORS[biome] ?? '#c5b482';
}
