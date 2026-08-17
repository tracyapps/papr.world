#!/usr/bin/env node
// Headless contact sheet: renders every fitted avatar shape into one PNG.
//
//   npm run shapes:preview                 all shapes → output/asset-review/
//   npm run shapes:preview -- cat snail    just those
//
// The HTML contact sheet is the pretty review surface, but it needs a browser.
// This one needs nothing. It renders the SAME fitted geometry the compiler
// bakes — same collector, same fit — so if a shape looks wrong here it is
// wrong in game. The dashed cutout box and ground line are drawn too, so it is
// obvious when a shape is sitting somewhere it shouldn't.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fitMatrix, measure, transformSegments } from './svgPathFit.mjs';
import { collect } from './svgCollect.mjs';
import { createImage, encodePng, fillPolygons, flatten } from './rasterize.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shapesDir = join(root, 'assets', 'avatar-shapes');
const outDir = join(root, 'output', 'asset-review');

// Must match the compiler (and DESIGN_SHEET / DESIGN_CUTOUT in shared/).
const SHEET = { width: 130, height: 180 };
const CUTOUT = { x: 15, y: 25, width: 100, height: 140 };
const PADDING = { x: 3, top: 3, bottom: 5 };
const GROUND_Y = CUTOUT.y + CUTOUT.height - PADDING.bottom;

const CELL = { width: SHEET.width + 6, height: SHEET.height + 14 };
const COLUMNS = 8;
const SUPERSAMPLE = 2;

const PAPER = [0xec, 0xe6, 0xd4];
const INK = [0x3d, 0x35, 0x2d];
const GUIDE = [0xd5, 0xcc, 0xb5];

async function fitted(file) {
  const svg = await readFile(join(shapesDir, file), 'utf8');
  const segments = collect(svg);
  const bounds = measure(segments);
  const fit = fitMatrix(bounds, CUTOUT, PADDING);
  return { polygons: flatten(transformSegments(segments, fit.matrix)), scale: fit.scale, bounds };
}

/** A hairline guide rectangle, drawn as four thin filled bars. */
function guideBox(image, x, y, w, h, originX, originY, scale) {
  const t = 0.5;
  const bars = [
    [x, y, w, t],
    [x, y + h, w, t],
    [x, y, t, h],
    [x + w, y, t, h],
  ];
  for (const [bx, by, bw, bh] of bars) {
    fillPolygons(
      image,
      [[[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh]]],
      originX,
      originY,
      scale,
      GUIDE,
    );
  }
}

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const files = (await readdir(shapesDir))
  .filter((f) => f.endsWith('.svg'))
  .filter((f) => requested.length === 0 || requested.some((r) => f.includes(r)))
  .sort();

const rows = Math.ceil(files.length / COLUMNS);
const image = createImage(
  COLUMNS * CELL.width * SUPERSAMPLE,
  rows * CELL.height * SUPERSAMPLE,
  PAPER,
);

const report = [];
for (const [index, file] of files.entries()) {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const originX = (column * CELL.width + 3) * SUPERSAMPLE;
  const originY = (row * CELL.height + 7) * SUPERSAMPLE;
  try {
    const { polygons, scale, bounds } = await fitted(file);
    guideBox(image, 0, 0, SHEET.width, SHEET.height, originX, originY, SUPERSAMPLE);
    guideBox(image, CUTOUT.x, CUTOUT.y, CUTOUT.width, CUTOUT.height, originX, originY, SUPERSAMPLE);
    guideBox(image, 0, GROUND_Y, SHEET.width, 0, originX, originY, SUPERSAMPLE);
    fillPolygons(image, polygons, originX, originY, SUPERSAMPLE, INK);
    report.push(
      `${file.padEnd(24)} ${Math.round(bounds.width)}×${Math.round(bounds.height)} → ×${scale.toFixed(2)}`,
    );
  } catch (error) {
    report.push(`${file.padEnd(24)} FAILED: ${error.message}`);
  }
}

await mkdir(outDir, { recursive: true });
const target = join(outDir, 'avatar-shapes-preview.png');
await writeFile(target, encodePng(image));
console.log(report.join('\n'));
console.log(`\n${files.length} shapes → ${target} (${COLUMNS} per row, alphabetical)`);
