#!/usr/bin/env node
// Headless contact sheet for stamps.
//
//   npm run stamps:preview                all stamps → output/asset-review/
//   npm run stamps:preview -- eyes arm    just those
//
// Renders the normalized geometry the compiler emits, at its default scale,
// on a paper-coloured tile with the natural-size box drawn — so it is obvious
// when a stamp is off-centre, oversized, or has its roles the wrong way round.
// Role colours here stand in for the real ones: ink is the player's crayon,
// paper and shadow come from the cutout's paper stock.

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { measure, multiply, transformSegments } from './svgPathFit.mjs';
import { collectParts } from './svgCollect.mjs';
import { createImage, encodePng, fillPolygons, flatten } from './rasterize.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stampsDir = join(root, 'assets', 'avatar-stamps');
const outDir = join(root, 'output', 'asset-review');

const NATURAL_SIZE = 34; // must match the compiler
const CELL = 64;
const COLUMNS = 8;
const SUPERSAMPLE = 3;

const BACKDROP = [0xec, 0xe6, 0xd4];
const TILE = [0xc9, 0xa8, 0x76]; // kraft, so "paper" role reads as paper
const ROLE_COLORS = {
  ink: [0x2b, 0x26, 0x20],
  paper: [0xef, 0xe9, 0xd8],
  shadow: [0x9a, 0x7c, 0x50],
};

async function normalized(file) {
  const svg = await readFile(join(stampsDir, file), 'utf8');
  const parts = collectParts(svg);
  const bounds = measure(parts.flatMap((p) => p.segments));
  const scale = NATURAL_SIZE / Math.max(bounds.width, bounds.height);
  const centre = multiply(
    { a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 },
    { a: 1, b: 0, c: 0, d: 1, e: -(bounds.minX + bounds.maxX) / 2, f: -(bounds.minY + bounds.maxY) / 2 },
  );
  return {
    parts: parts.map((p) => ({ role: p.role, polygons: flatten(transformSegments(p.segments, centre)) })),
    size: { width: bounds.width * scale, height: bounds.height * scale },
  };
}

const meta = JSON.parse(await readFile(join(stampsDir, 'stamps.json'), 'utf8'));
const byFile = new Map(meta.stamps.map((s) => [s.file, s]));

const requested = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const files = (await readdir(stampsDir))
  .filter((f) => f.endsWith('.svg'))
  .filter((f) => requested.length === 0 || requested.some((r) => f.includes(r)))
  .sort();

const rows = Math.ceil(files.length / COLUMNS);
const image = createImage(COLUMNS * CELL * SUPERSAMPLE, rows * CELL * SUPERSAMPLE, BACKDROP);

const report = [];
for (const [index, file] of files.entries()) {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  // Cell origin is the stamp's own origin: stamps are centred on (0, 0).
  const originX = (column * CELL + CELL / 2) * SUPERSAMPLE;
  const originY = (row * CELL + CELL / 2) * SUPERSAMPLE;
  const half = CELL / 2 - 2;
  fillPolygons(
    image,
    [[[-half, -half], [half, -half], [half, half], [-half, half]]],
    originX,
    originY,
    SUPERSAMPLE,
    TILE,
  );
  try {
    const { parts, size } = await normalized(file);
    const scale = (byFile.get(file)?.defaultScale ?? 1) * SUPERSAMPLE;
    for (const part of parts) {
      fillPolygons(image, part.polygons, originX, originY, scale, ROLE_COLORS[part.role] ?? ROLE_COLORS.ink);
    }
    report.push(
      `${file.padEnd(20)} ${size.width.toFixed(0)}×${size.height.toFixed(0)}` +
        ` @ ×${byFile.get(file)?.defaultScale ?? 1}  [${parts.map((p) => p.role).join(' ')}]`,
    );
  } catch (error) {
    report.push(`${file.padEnd(20)} FAILED: ${error.message}`);
  }
}

await mkdir(outDir, { recursive: true });
const target = join(outDir, 'avatar-stamps-preview.png');
await writeFile(target, encodePng(image));
console.log(report.join('\n'));
console.log(`\n${files.length} stamps → ${target} (${COLUMNS} per row, alphabetical)`);
