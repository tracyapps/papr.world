import * as THREE from 'three';
import { aspect } from '../core/math';
import { createCutout, createRoofFace, createSheet, createWall, createWindowWall, groundedCutoutY } from '../render/builders';
import { getMaterial } from '../render/materials';
import { registerCozyObject } from '../game/cozyInteractions';
import { registerTrimmableTree } from '../game/treeInteractions';
import type { TreeSpecies } from '../sim/catalogs/trees';
import { registerMapFeature } from './mapFeatures';
import { sampleTerrainHeight } from './terrain';
import { buildWaterSurface, getWaterBody } from './water';

// Hand-built one-off set pieces for the authored clearing page:
// the starter house shell and the prop display wall.

export function buildClearingHouse(parent: THREE.Group) {
  const houseX = 2.7;
  const houseZ = 0.35;
  const wallWidth = 2.6;
  const wallHeight = 1.7;
  const wallCenterY = wallHeight / 2 + 0.05;
  const roofWidth = 3.05;
  const roofRidgeY = 2.42;
  const roofEaveY = 1.82;
  const roofOverhangZ = 1.44;

  const corkPaper = getMaterial('paper.cork');
  const wallSidingPaper = getMaterial('wall.siding1');
  const wallSidingPaperAlt = getMaterial('wall.siding2');
  const roofShinglePaper = getMaterial('roof.shingle1');
  const roofShinglePaperAlt = getMaterial('roof.shingle2');
  const orangeWrapPaper = getMaterial('paper.orangewrap');

  const floor = createSheet(2.6, 2.6, corkPaper, [houseX, 0.04, houseZ]);
  parent.add(floor);
  registerMapFeature({
    color: '#66503a',
    id: 'starter-house',
    kind: 'building',
    radiusX: 1.35,
    radiusZ: 1.35,
    shape: 'rect',
    x: houseX,
    z: houseZ,
  });

  const wallA = createWindowWall(wallWidth, wallHeight, wallSidingPaper, [houseX, wallCenterY, houseZ - 1.32], 0, {
    height: 0.78,
    width: 0.56,
    x: 0.55,
    y: 1.0,
  });
  const wallB = createWindowWall(wallWidth, wallHeight, wallSidingPaperAlt, [houseX - 1.32, wallCenterY, houseZ], Math.PI / 2, {
    height: 0.66,
    width: 0.58,
    x: -0.55,
    y: 1.02,
  });
  parent.add(wallA, wallB);

  const roofLeft = createRoofFace(roofWidth, roofShinglePaper, houseX, roofRidgeY, roofEaveY, houseZ, houseZ - roofOverhangZ);
  const roofRight = createRoofFace(roofWidth, roofShinglePaperAlt, houseX, roofRidgeY, roofEaveY, houseZ, houseZ + roofOverhangZ);
  const roofRidgeCap = createSheet(roofWidth + 0.08, 0.12, orangeWrapPaper, [houseX, roofRidgeY + 0.035, houseZ]);
  const frontEaveStrip = createSheet(roofWidth + 0.12, 0.14, roofShinglePaper, [houseX, roofEaveY + 0.02, houseZ - roofOverhangZ - 0.035]);
  const backEaveStrip = createSheet(roofWidth + 0.12, 0.14, roofShinglePaperAlt, [houseX, roofEaveY + 0.02, houseZ + roofOverhangZ + 0.035]);
  parent.add(roofLeft, roofRight, roofRidgeCap, frontEaveStrip, backEaveStrip);

  const frontWindow = createCutout({
    alphaTest: 0,
    aspectRatio: aspect(262, 436),
    height: 0.72,
    position: [houseX + 0.55, 1.0, houseZ - 1.355],
    textureUrl: '/assets/runtime/props/window-single-open-01.png',
  });
  parent.add(frontWindow);
  registerCozyObject({
    id: 'starter-house-window',
    label: 'Open paper window',
    messages: [
      'It flaps once and lets a square of warm pretend-sunlight inside.',
      'From in here, the clearing sounds like soft paper rain.',
    ],
    object: frontWindow,
    reaction: 'sway',
    sound: 'rustle',
  });

  const sideWindow = createCutout({
    alphaTest: 0,
    aspectRatio: aspect(241, 309),
    height: 0.62,
    position: [houseX - 1.355, 1.02, houseZ + 0.55],
    rotationY: Math.PI / 2,
    textureUrl: '/assets/runtime/props/window-small-square-closed-01.png',
  });
  parent.add(sideWindow);
}

export function buildDisplayWall(parent: THREE.Group) {
  const windowTestRotation = 0.85;
  const windowTestWall = createWall(1.55, 1.35, getMaterial('wall.siding1'), [-0.85, 0.72, 1.65], windowTestRotation);
  parent.add(windowTestWall);

  const displayNormal = new THREE.Vector2(Math.sin(windowTestRotation), Math.cos(windowTestRotation));
  const displayRight = new THREE.Vector2(Math.cos(windowTestRotation), -Math.sin(windowTestRotation));
  const displayWallPosition = (localX: number, localY: number, lift = 0.06): THREE.Vector3Tuple => [
    -0.85 + displayRight.x * localX + displayNormal.x * lift,
    0.72 + localY,
    1.65 + displayRight.y * localX + displayNormal.y * lift,
  ];

  const displayOpenWindow = createCutout({
    alphaTest: 0,
    aspectRatio: aspect(262, 436),
    height: 0.7,
    position: displayWallPosition(-0.33, 0.12),
    rotationY: windowTestRotation,
    textureUrl: '/assets/runtime/props/window-single-open-01.png',
  });
  const displayClosedWindow = createCutout({
    alphaTest: 0,
    aspectRatio: aspect(241, 309),
    height: 0.58,
    position: displayWallPosition(0.25, 0.13),
    rotationY: windowTestRotation,
    textureUrl: '/assets/runtime/props/window-small-square-closed-01.png',
  });
  const displayPostIt = createCutout({
    alphaTest: 0.01,
    aspectRatio: aspect(384, 410),
    height: 0.38,
    position: displayWallPosition(0.58, -0.32, 0.065),
    rotationY: windowTestRotation,
    textureUrl: '/assets/runtime/props/post-it.png',
  });
  const displayTape = createCutout({
    alphaTest: 0.01,
    aspectRatio: aspect(39, 248),
    height: 0.62,
    opacity: 0.78,
    position: displayWallPosition(-0.66, -0.25, 0.07),
    rotationY: windowTestRotation,
    textureUrl: '/assets/runtime/props/tape-01.png',
  });
  parent.add(displayOpenWindow, displayClosedWindow, displayPostIt, displayTape);
  registerCozyObject({
    id: 'display-wall-note',
    label: 'Friendly sticky note',
    messages: [
      'Someone wrote: “You are doing better than you think.”',
      'The back says: “Drink some water, neighbor.”',
      'A tiny pencil star is hiding under the fold.',
    ],
    object: displayPostIt,
    reaction: 'bob',
    sound: 'tap',
  });

  const stickyNoteOnMaker = createCutout({
    alphaTest: 0.01,
    aspectRatio: aspect(384, 410),
    height: 0.28,
    position: [-0.02, sampleTerrainHeight(-0.02, -3.22) + 1.08, -3.98],
    rotationY: -0.42,
    textureUrl: '/assets/runtime/props/post-it.png',
  });
  parent.add(stickyNoteOnMaker);
}

/**
 * A dense near-field layer for the starter clearing. These are deliberately
 * made from the same supplied paper sheets and cutouts as the original scene:
 * the clearing should feel accumulated and handmade, not freshly decorated by
 * a different game.
 */
export function buildCozyClearingDetails(parent: THREE.Group) {
  const addPatch = (x: number, z: number, width: number, depth: number, material: Parameters<typeof getMaterial>[0], rotY: number) => {
    const patch = createSheet(width, depth, getMaterial(material), [x, sampleTerrainHeight(x, z) + 0.025, z]);
    patch.rotation.y = rotY;
    parent.add(patch);
    return patch;
  };

  // Overlapping scraps break the enormous ground sheet into small, inviting
  // "rooms": pond, porch garden, tree nook, and picnic patch.
  // A pale shore scrap under the pond. The pond itself is real water below.
  addPatch(-5.2, 4.7, 3.5, 2.5, 'paper.aqua', -0.18);
  addPatch(5.7, 4.5, 3.2, 2.1, 'paper.monstera', 0.25);
  addPatch(-1.7, -6.8, 3.8, 2.3, 'paper.green', -0.12);
  addPatch(6.6, -4.7, 2.8, 2.2, 'paper.bubbles', 0.4);
  addPatch(-6.9, -3.8, 2.5, 1.8, 'paper.plaid', -0.36);
  addPatch(1.2, 7.4, 3.4, 2.0, 'paper.orangewrap', 0.18);

  const treeDefs = [
    ['/assets/runtime/props/tree-01.png', aspect(722, 936)],
    ['/assets/runtime/props/tree-02.png', aspect(624, 871)],
    ['/assets/runtime/props/pine-tree-medium-01.png', aspect(560, 879)],
    ['/assets/runtime/props/pine-tree-medium-02.png', aspect(623, 846)],
    ['/assets/runtime/props/pine-tree-tall-01.png', aspect(543, 997)],
  ] as const;
  const treeSpots: Array<[number, number, number, number, number]> = [
    [-9.2, -7.2, 2.9, 0.24, 2], [-6.7, -8.9, 3.4, -0.2, 4], [-3.4, -9.5, 2.7, 0.18, 0],
    [0.3, -10.0, 3.2, -0.12, 3], [4.6, -9.0, 3.5, 0.22, 4], [8.3, -7.0, 2.8, -0.2, 1],
    [9.4, -2.5, 3.2, 0.16, 2], [9.0, 2.5, 2.7, -0.24, 0], [8.1, 7.2, 3.4, 0.12, 3],
    [4.4, 9.1, 2.8, -0.15, 1], [0.0, 10.0, 3.3, 0.2, 4], [-4.1, 9.4, 2.7, -0.22, 0],
    [-8.0, 7.3, 3.25, 0.14, 2], [-9.4, 3.0, 2.8, -0.12, 1], [-9.8, -2.0, 3.4, 0.2, 4],
  ];
  // Which species each drawing is, for the growth model. The first two
  // entries in `treeDefs` are leafy; the rest are pines.
  const treeSpecies: TreeSpecies[] = ['leafy', 'leafy', 'pine', 'pine', 'pine'];
  treeSpots.forEach(([x, z, height, rotationY, textureIndex], index) => {
    const [textureUrl, aspectRatio] = treeDefs[textureIndex];
    const baseY = sampleTerrainHeight(x, z);
    const tree = createCutout({
      textureUrl,
      aspectRatio,
      height,
      position: [x, groundedCutoutY(baseY, height), z],
      rotationY,
    });
    parent.add(tree);
    // The clearing's treeline is hand-placed rather than generated, so it
    // never passed through `buildProp` and was invisible to trimming — the
    // most walkable trees in the game were the only ones you could not cut.
    // The id matches its dig footprint in `world/footprints.ts` so the two
    // systems are talking about the same tree.
    registerTrimmableTree({
      id: `clearing-cozy-tree:${index}`,
      object: tree,
      pageId: '0,0',
      treeKey: `cozy-tree:${index}`,
      species: treeSpecies[textureIndex],
      x,
      z,
      height,
      baseY,
    });
  });

  // A tiny planted border beside the house, built from small versions of the
  // supplied leafy cutouts so it reads as toy shrubs rather than new art.
  for (const [index, z] of [-1.0, -0.25, 0.5, 1.25].entries()) {
    const height = 0.62 + (index % 2) * 0.08;
    const shrub = createCutout({
      textureUrl: index % 2 ? '/assets/runtime/props/tree-01.png' : '/assets/runtime/props/tree-02.png',
      aspectRatio: index % 2 ? aspect(722, 936) : aspect(624, 871),
      height,
      position: [4.35, groundedCutoutY(sampleTerrainHeight(4.35, z), height), z],
      rotationY: -0.2 + index * 0.08,
    });
    parent.add(shrub);
  }

  // The clearing's pond is the first real water body: wadeable, rippling,
  // and the reference shape for the rivers and lakes in
  // docs/water-and-waterways.md.
  // The body itself is declared in AUTHORED_WATER_BODIES and registered in
  // the page's water pre-pass, so props placed earlier already know the pond
  // is here. This only draws it.
  const pondBody = getWaterBody('0,0:clearing-pond');
  const pond = pondBody ? buildWaterSurface(pondBody) : new THREE.Group();
  parent.add(pond);
  registerCozyObject({
    id: 'blue-paper-pond',
    label: 'Blue paper pond',
    messages: [
      'Plip! A ripple runs all the way to the papery shore.',
      'For a moment, the drawn clouds look back at you.',
      'Something underneath makes one mysterious little bubble.',
      'Shallow enough to wade. Cold enough to notice.',
    ],
    object: pond,
    reaction: 'ripple',
    sound: 'plop',
  });

  const listeningTreeHeight = 3.05;
  const listeningTree = createCutout({
    textureUrl: '/assets/runtime/props/tree-02.png',
    aspectRatio: aspect(624, 871),
    height: listeningTreeHeight,
    position: [-1.7, sampleTerrainHeight(-1.7, -6.8) + listeningTreeHeight / 2, -6.8],
    rotationY: -0.12,
  });
  parent.add(listeningTree);
  registerCozyObject({
    id: 'listening-tree',
    label: 'Listening tree',
    messages: [
      'Its paper leaves rustle: “No rush.”',
      'A folded branch leans down as if it wants to hear your news.',
      'The tree keeps your secret tucked safely between two leaves.',
    ],
    object: listeningTree,
    reaction: 'sway',
    sound: 'rustle',
  });

  // A little porch mobile made from actual sticky-note cutouts. It turns when
  // clicked and gives the house an always-moving detail at eye level.
  const mobile = new THREE.Group();
  mobile.position.set(5.2, sampleTerrainHeight(5.2, -1.9), -1.9);
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2;
    const note = createCutout({
      textureUrl: '/assets/runtime/props/post-it.png',
      aspectRatio: aspect(384, 410),
      height: 0.34 + (index % 2) * 0.05,
      position: [Math.cos(angle) * 0.45, 1.05 + (index % 2) * 0.18, Math.sin(angle) * 0.45],
      rotationY: -angle,
    });
    mobile.add(note);
  }
  parent.add(mobile);
  registerCozyObject({
    id: 'porch-paper-mobile',
    label: 'Sticky-note wind mobile',
    messages: [
      'The notes spin and make four tiny claps.',
      'One note whispers, “Again!” as it sails past.',
    ],
    object: mobile,
    reaction: 'spin',
    sound: 'chime',
  });
}
