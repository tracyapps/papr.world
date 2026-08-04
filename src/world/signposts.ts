import * as THREE from 'three';
import { registerCozyObject } from '../game/cozyInteractions';
import { setGuidanceTarget } from '../game/guidance';
import { getMaterial, type MaterialKey } from '../render/materials';
import { formatPageDistance } from './distance';
import { registerMapFeature } from './mapFeatures';
import { getBuiltinNavigationPlace } from './places';
import { sampleTerrainHeight } from './terrain';

type SignDefinition = {
  label: string;
  placeId: string;
  arrow: 'left' | 'right';
  yaw: number;
  material: MaterialKey;
};

type SignpostOptions = {
  id: string;
  x: number;
  z: number;
  signs: SignDefinition[];
};

function arrowShape(direction: 'left' | 'right') {
  const point = direction === 'right' ? 1 : -1;
  const shape = new THREE.Shape();
  shape.moveTo(-1.15 * point, -0.23);
  shape.lineTo(0.62 * point, -0.23);
  shape.lineTo(0.62 * point, -0.38);
  shape.lineTo(1.22 * point, 0);
  shape.lineTo(0.62 * point, 0.38);
  shape.lineTo(0.62 * point, 0.23);
  shape.lineTo(-1.15 * point, 0.23);
  shape.closePath();
  return shape;
}

function textMaterial(label: string, distance: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 220;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#fff4d1';
    context.strokeStyle = 'rgb(69 42 25 / 0.55)';
    context.lineWidth = 5;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 54px Georgia, serif';
    context.strokeText(label, canvas.width / 2, 82, canvas.width - 76);
    context.fillText(label, canvas.width / 2, 82, canvas.width - 76);
    context.font = 'italic 700 38px Georgia, serif';
    context.strokeText(distance, canvas.width / 2, 150, canvas.width - 100);
    context.fillText(distance, canvas.width / 2, 150, canvas.width - 100);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({
    alphaTest: 0.05,
    depthTest: true,
    depthWrite: true,
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
  });
}

export function buildDirectionSignpost(parent: THREE.Group, options: SignpostOptions) {
  const group = new THREE.Group();
  group.position.set(options.x, sampleTerrainHeight(options.x, options.z), options.z);

  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.1, 2.75, 7),
    getMaterial('paper.brown'),
  );
  // Boards sit in front of the pole rather than being visually bisected by it.
  post.position.set(0, 1.3, -0.1);
  post.castShadow = true;
  group.add(post);

  options.signs.forEach((definition, index) => {
    const destination = getBuiltinNavigationPlace(definition.placeId);
    if (!destination) return;
    const worldDistance = Math.hypot(destination.x - options.x, destination.z - options.z);
    const boardGroup = new THREE.Group();
    boardGroup.position.y = 2.26 - index * 0.55;
    boardGroup.rotation.y = definition.yaw;

    const board = new THREE.Mesh(
      new THREE.ExtrudeGeometry(arrowShape(definition.arrow), {
        depth: 0.075,
        bevelEnabled: true,
        bevelSize: 0.018,
        bevelThickness: 0.012,
        bevelSegments: 1,
      }),
      getMaterial(definition.material),
    );
    board.position.z = 0.025;
    board.castShadow = true;

    const text = new THREE.Mesh(
      new THREE.PlaneGeometry(1.72, 0.5),
      textMaterial(definition.label, formatPageDistance(worldDistance)),
    );
    text.position.set(definition.arrow === 'right' ? -0.14 : 0.14, 0, 0.115);
    boardGroup.add(board, text);
    group.add(boardGroup);

    registerCozyObject({
      id: `${options.id}:${definition.placeId}`,
      label: `${definition.label} sign`,
      messages: [`Guidance set for ${definition.label} · ${formatPageDistance(worldDistance)} away.`],
      object: boardGroup,
      reaction: 'bob',
      sound: 'tap',
      onInteract: () => setGuidanceTarget(definition.placeId),
    });
  });

  parent.add(group);
  registerMapFeature({
    id: options.id,
    kind: 'landmark',
    color: '#d49855',
    radiusX: 0.3,
    radiusZ: 0.3,
    shape: 'rect',
    x: options.x,
    z: options.z,
  });
}

export function buildClearingSignpost(parent: THREE.Group) {
  buildDirectionSignpost(parent, {
    id: 'clearing-trail-sign', x: -4.05, z: -4.7,
    signs: [
      { label: 'Ribbonbark Forest', placeId: 'ribbonbark-forest', arrow: 'left', yaw: 0.22, material: 'paper.brown' },
      { label: 'Wood Mill', placeId: 'wood-mill', arrow: 'left', yaw: 0.08, material: 'paper.salmon' },
      { label: 'Cardboard Desert', placeId: 'cardboard-desert', arrow: 'right', yaw: -0.08, material: 'paper.brown.warm' },
      { label: 'Offcut Flats', placeId: 'offcut-flats', arrow: 'right', yaw: 0.3, material: 'paper.grey' },
    ],
  });
}

export function buildForestTrailSignpost(parent: THREE.Group) {
  buildDirectionSignpost(parent, {
    id: 'ribbonbark-midway-sign', x: -50, z: -3.2,
    signs: [
      { label: 'Home', placeId: 'home', arrow: 'right', yaw: -0.08, material: 'paper.brown.warm' },
      { label: 'Wood Mill', placeId: 'wood-mill', arrow: 'left', yaw: 0.1, material: 'paper.salmon' },
    ],
  });
}

export function buildWoodMillSignpost(parent: THREE.Group) {
  buildDirectionSignpost(parent, {
    id: 'wood-mill-yard-sign', x: -88.8, z: -3.4,
    signs: [
      { label: 'Wood Mill', placeId: 'wood-mill', arrow: 'left', yaw: 0.12, material: 'paper.salmon' },
      { label: 'Home', placeId: 'home', arrow: 'right', yaw: -0.06, material: 'paper.brown.warm' },
    ],
  });
}
