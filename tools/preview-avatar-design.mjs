#!/usr/bin/env node
// Headless composite preview: a few whole avatars — cutout + stamps — rendered
// to one PNG.
//
//   npm run avatar:preview
//
// The other two previews check assets in isolation. This one checks the thing
// that can only go wrong when they are combined: layer order (arms behind the
// body, faces on top), placement defaults, and whether an appendage actually
// clears the cutout instead of being trapped inside it.
//
// It reads the GENERATED catalogs rather than re-deriving anything, so it is
// looking at exactly what the editor will draw. Roles are painted with real
// paper-stock colours; the browser is still the source of truth for the fine
// details (clipping, patterns, strokes), which this does not attempt.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { multiply, parsePath, transformSegments } from './svgPathFit.mjs';
import { createImage, encodePng, fillPolygons, flatten } from './rasterize.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'output', 'asset-review');

const SHEET = { width: 130, height: 180 };
const CUTOUT = { x: 15, y: 25, width: 100, height: 140 };
const GROUND_Y = CUTOUT.y + CUTOUT.height - 5;
const NATURAL_SIZE = 34;

// ---- read the generated catalogs --------------------------------------------

async function readShapes() {
  const source = await readFile(
    join(root, 'src', 'ui', 'avatarEditor', 'shapes.generated.ts'),
    'utf8',
  );
  const shapes = new Map();
  for (const match of source.matchAll(/key: "([^"]+)",[\s\S]*?path: "([^"]*)",/g)) {
    shapes.set(match[1], match[2]);
  }
  return shapes;
}

async function readStamps() {
  const source = await readFile(
    join(root, 'src', 'ui', 'avatarEditor', 'stamps.generated.ts'),
    'utf8',
  );
  const stamps = new Map();
  for (const block of source.matchAll(/\{\s*key: "([^"]+)",([\s\S]*?)\n  \},/g)) {
    const [, key, body] = block;
    const defaultScale = Number(body.match(/defaultScale: ([\d.]+)/)?.[1] ?? 1);
    const parts = [...body.matchAll(/\{ role: "([^"]+)", path: "([^"]*)" \}/g)].map((p) => ({
      role: p[1],
      path: p[2],
    }));
    stamps.set(key, { defaultScale, parts });
  }
  return stamps;
}

// ---- the sample designs ------------------------------------------------------

const PAPERS = {
  kraft: '#c9a876',
  pond: '#7d9ec4',
  clover: '#8fae72',
  pink: '#dba3ad',
};

const lighten = (hex, amount) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (shift) => {
    const v = (n >> shift) & 0xff;
    return Math.round(v + (255 - v) * amount);
  };
  return [channel(16), channel(8), channel(0)];
};
const darken = (hex, amount) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [16, 8, 0].map((shift) => Math.round(((n >> shift) & 0xff) * (1 - amount)));
};
const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));

const face = (x, y) => ({ x, y });
const DESIGNS = [
  {
    label: 'abstract-frog + face + limbs',
    silhouette: 'abstract-frog',
    paper: PAPERS.clover,
    ink: '#2b2620',
    stamps: [
      { key: 'arm-noodle', ...face(24, 110), scale: 1, rotation: 10, flip: true },
      { key: 'arm-noodle', ...face(106, 110), scale: 1, rotation: -10 },
      { key: 'legs-stick', ...face(65, GROUND_Y - 4), scale: 1 },
      { key: 'eyes-googly', ...face(65, 67), scale: 1 },
      { key: 'mouth-smile', ...face(65, 98), scale: 0.9 },
    ],
  },
  {
    label: 'flame + hair + wings',
    silhouette: 'flame',
    paper: PAPERS.pink,
    ink: '#b3402e',
    stamps: [
      { key: 'wings-small', ...face(65, 105), scale: 1 },
      { key: 'hair-curls', ...face(65, 34), scale: 1 },
      { key: 'eyes-happy', ...face(65, 80), scale: 1 },
      { key: 'mouth-teeth', ...face(65, 100), scale: 0.8 },
    ],
  },
  {
    label: 'cassette + eye + antennae',
    silhouette: 'cassette',
    paper: PAPERS.pond,
    ink: '#2b2620',
    stamps: [
      { key: 'antennae', ...face(65, 92), scale: 1 },
      { key: 'legs-boots', ...face(65, GROUND_Y - 2), scale: 1 },
      { key: 'eye-single', ...face(65, 120), scale: 0.8 },
    ],
  },
  {
    label: 'round-pal, everything on',
    silhouette: 'round-pal',
    paper: PAPERS.kraft,
    ink: '#3f6ea6',
    stamps: [
      { key: 'hair-pigtails', ...face(65, 46), scale: 1 },
      { key: 'arm-wave', ...face(112, 95), scale: 1 },
      { key: 'arm-stick', ...face(20, 108), scale: 1, flip: true },
      { key: 'legs-boots', ...face(65, GROUND_Y - 2), scale: 1 },
      { key: 'eyes-lashes', ...face(65, 72), scale: 1 },
      { key: 'nose-button', ...face(65, 88), scale: 1 },
      { key: 'mouth-smile', ...face(65, 100), scale: 0.8 },
      { key: 'cheeks-blush', ...face(65, 94), scale: 1 },
    ],
  },
];

// ---- compose -----------------------------------------------------------------

const shapes = await readShapes();
const stampCatalog = await readStamps();

const CELL = { width: SHEET.width + 8, height: SHEET.height + 8 };
const SUPERSAMPLE = 3;
const image = createImage(
  DESIGNS.length * CELL.width * SUPERSAMPLE,
  CELL.height * SUPERSAMPLE,
  [0xec, 0xe6, 0xd4],
);

function placeStamp(stamp, template) {
  const scale = (stamp.scale ?? 1) * template.defaultScale;
  const flip = stamp.flip ? -1 : 1;
  const radians = ((stamp.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return multiply(
    multiply(
      { a: 1, b: 0, c: 0, d: 1, e: stamp.x, f: stamp.y },
      { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 },
    ),
    { a: scale * flip, b: 0, c: 0, d: scale, e: 0, f: 0 },
  );
}

const report = [];
for (const [index, design] of DESIGNS.entries()) {
  const originX = (index * CELL.width + 4) * SUPERSAMPLE;
  const originY = 4 * SUPERSAMPLE;
  const paperRgb = rgb(design.paper);
  const edgeRgb = lighten(design.paper, 0.55);
  const shadowRgb = darken(design.paper, 0.22);
  const inkRgb = rgb(design.ink);

  const draw = (segments, color) =>
    fillPolygons(image, flatten(segments), originX, originY, SUPERSAMPLE, color);

  const layerOf = (key) => (key.startsWith('arm') || key.startsWith('leg') || key.startsWith('feet')
    || key.startsWith('hair') || key.startsWith('wings') || key.startsWith('antenn') ? 'behind' : 'on');

  // 1. behind stamps
  for (const stamp of design.stamps) {
    const template = stampCatalog.get(stamp.key);
    if (!template || layerOf(stamp.key) !== 'behind') continue;
    const matrix = placeStamp(stamp, template);
    for (const part of template.parts) {
      const segments = transformSegments(parsePath(part.path), matrix);
      draw(segments, part.role === 'paper' ? edgeRgb : part.role === 'shadow' ? shadowRgb : inkRgb);
    }
  }

  // 2. the cutout
  const path = shapes.get(design.silhouette);
  if (!path) {
    report.push(`${design.label}: unknown silhouette ${design.silhouette}`);
    continue;
  }
  draw(parsePath(path), edgeRgb === paperRgb ? paperRgb : edgeRgb);
  draw(parsePath(path), paperRgb);

  // 3. on stamps
  for (const stamp of design.stamps) {
    const template = stampCatalog.get(stamp.key);
    if (!template || layerOf(stamp.key) !== 'on') continue;
    const matrix = placeStamp(stamp, template);
    for (const part of template.parts) {
      const segments = transformSegments(parsePath(part.path), matrix);
      draw(segments, part.role === 'paper' ? edgeRgb : part.role === 'shadow' ? shadowRgb : inkRgb);
    }
  }
  report.push(`${design.label}: ${design.stamps.length} stamps`);
}

await mkdir(outDir, { recursive: true });
const target = join(outDir, 'avatar-design-preview.png');
await writeFile(target, encodePng(image));
console.log(report.join('\n'));
console.log(`\n${DESIGNS.length} sample designs → ${target}`);
console.log(`catalogs: ${shapes.size} shapes, ${stampCatalog.size} stamps`);
