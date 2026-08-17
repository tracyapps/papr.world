#!/usr/bin/env node
// Avatar shape compiler.
//
//   npm run shapes:compile        one-shot
//   npm run shapes:watch          recompile on every save in assets/avatar-shapes/
//
// Source of truth: assets/avatar-shapes/
//   * shapes.json — metadata (key, label, category, spoken, keywords, preset, file)
//   * one SVG per shape — ANY viewBox, any units, any canvas size. Draw it at
//     whatever proportions the shape wants; the compiler measures the real ink
//     and fits it into the 100 × 140 cutout box for you. (That box sits inside
//     a larger 130 × 180 sheet; the ring around it is where stamped-on arms,
//     legs and hair live — see tools/compile-avatar-stamps.mjs.)
//
// Fitting rules (changed 2026-08-15 — shapes used to be forced to author in
// one viewBox, which fought every shape that isn't person-shaped):
//   * The path's own bounding box is measured — the viewBox is ignored, so a
//     shape that overshoots its canvas still fits.
//   * ONE uniform scale, longest side governing: nothing is ever stretched.
//   * Centred left-to-right, anchored to the ground line, so every cutout
//     stands on the same baseline instead of floating at its own height.
//   * The transform is BAKED into the emitted coordinates rather than shipped
//     as a wrapper <g transform>. That keeps one cut-edge stroke width reading
//     identically across every shape, whatever it was drawn at.
//
// Elements: <path> is the native form, but <rect>, <circle>, <ellipse>,
// <polygon> and <polyline> are converted for you (export straight from the
// drawing tool). <line> has no area to fill, so it is skipped with a warning;
// <text> and <image> are refused — a silhouette has to be geometry.
// transform= on the element or any ancestor <g> is applied.
//
// Outputs:
//   * src/ui/avatarEditor/shapes.generated.ts — the in-game catalog module
//   * designs/avatar-template-contact-sheet.html — visual review sheet
//
// Validation is loud and fails the compile: a typo'd category or an unlisted
// SVG should be caught here, at authoring time, never in the editor.

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fitMatrix, measure, serializePath, transformSegments } from './svgPathFit.mjs';
import { collect } from './svgCollect.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shapesDir = join(root, 'assets', 'avatar-shapes');
const generatedPath = join(root, 'src', 'ui', 'avatarEditor', 'shapes.generated.ts');
const sheetPath = join(root, 'designs', 'avatar-template-contact-sheet.html');

const CATEGORIES = ['folks', 'shapes', 'animals', 'tokens', 'nostalgia'];
const PRESETS = ['small', 'medium', 'wide', 'tall', 'wheeled', 'hovering'];

/**
 * Must match DESIGN_SHEET / DESIGN_CUTOUT in
 * shared/src/protocol/avatarDesign.ts. The sheet is bigger than the cutout:
 * the ring around it is where stamped-on arms, legs and hair live. Shapes are
 * fitted to the CUTOUT, so they are exactly the size they always were.
 * (`shapes.test.ts` fails if these two drift apart.)
 */
const SHEET = { width: 130, height: 180 };
const CUTOUT = { x: 15, y: 25, width: 100, height: 140 };
/**
 * Breathing room inside the cutout box. `x`/`top` clear the cut-edge stroke
 * (2.4 wide, half of it outside the path); `bottom` also clears the card
 * shadow, which is offset 3.5 down.
 */
const PADDING = { x: 3, top: 3, bottom: 5 };
const GROUND_Y = CUTOUT.y + CUTOUT.height - PADDING.bottom;

/** Contact-sheet paper rotation — mirrors catalog.ts PAPER_COLORS fills. */
const SHEET_PAPERS = [
  ['kraft brown', '#c9a876'],
  ['newsprint', '#e8e2d0'],
  ['brick red', '#c96a5b'],
  ['pumpkin orange', '#d99a5b'],
  ['school-bus yellow', '#e0c265'],
  ['clover green', '#8fae72'],
  ['pond blue', '#7d9ec4'],
  ['grape purple', '#9a83b5'],
  ['eraser pink', '#dba3ad'],
  ['charcoal gray', '#6b675f'],
];

function fail(errors) {
  for (const error of errors) console.error(`  ✗ ${error}`);
  throw new Error(`avatar shapes: ${errors.length} problem(s) — nothing written`);
}

/** Measure, fit to the sheet, bake the transform, return path data + report. */
function fitToSheet(segments, file, errors) {
  try {
    const bounds = measure(segments);
    if (bounds.width <= 0 || bounds.height <= 0) {
      errors.push(`${file}: artwork has no area`);
      return null;
    }
    const fit = fitMatrix(bounds, CUTOUT, PADDING);
    return {
      path: serializePath(transformSegments(segments, fit.matrix)),
      source: { width: bounds.width, height: bounds.height },
      scale: fit.scale,
      drawn: { width: fit.drawnWidth, height: fit.drawnHeight },
    };
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
    return null;
  }
}

async function compile() {
  const errors = [];
  const warnings = [];
  const metaRaw = JSON.parse(await readFile(join(shapesDir, 'shapes.json'), 'utf8'));
  const shapes = Array.isArray(metaRaw.shapes) ? metaRaw.shapes : [];
  if (shapes.length === 0) errors.push('shapes.json: no shapes[]');

  const seen = new Set();
  const compiled = [];
  for (const s of shapes) {
    const where = `shapes.json → "${s.key ?? '?'}"`;
    if (!/^[a-z0-9-]+$/.test(s.key ?? '')) errors.push(`${where}: key must be kebab-case`);
    if (s.key === 'custom') errors.push(`${where}: "custom" is reserved for player-drawn outlines`);
    if (seen.has(s.key)) errors.push(`${where}: duplicate key`);
    seen.add(s.key);
    if (!s.label) errors.push(`${where}: missing label`);
    if (!CATEGORIES.includes(s.category)) {
      errors.push(`${where}: category "${s.category}" not one of ${CATEGORIES.join('/')}`);
    }
    if (!s.spoken || s.spoken.length < 10) {
      errors.push(`${where}: "spoken" must really describe the shape (screen readers read it)`);
    }
    if (!Array.isArray(s.keywords) || s.keywords.length < 2) {
      errors.push(`${where}: give at least 2 search keywords`);
    }
    if (!PRESETS.includes(s.preset)) {
      errors.push(`${where}: preset "${s.preset}" not one of ${PRESETS.join('/')}`);
    }

    let fitted = null;
    try {
      const svg = await readFile(join(shapesDir, s.file), 'utf8');
      const segments = collect(svg, {
        error: (message) => errors.push(`${s.file}: ${message}`),
        warn: (message) => warnings.push(`${s.file}: ${message}`),
      });
      if (segments.length === 0) errors.push(`${s.file}: nothing drawable found`);
      else fitted = fitToSheet(segments, s.file, errors);
    } catch {
      errors.push(`${where}: cannot read ${s.file}`);
    }

    compiled.push({
      ...s,
      keywords: (s.keywords ?? []).map((k) => String(k).toLowerCase()),
      path: fitted?.path ?? '',
      report: fitted,
    });
  }

  // Unreferenced SVGs are almost always a forgotten shapes.json entry.
  const referenced = new Set(shapes.map((s) => s.file));
  for (const file of await readdir(shapesDir)) {
    if (file.endsWith('.svg') && !referenced.has(file)) {
      errors.push(`${file}: SVG present but not listed in shapes.json`);
    }
  }
  if (errors.length > 0) fail(errors);
  // Warnings repeat per element (a harp has twenty strings); collapse them so
  // one skipped-element decision reads as one line.
  const warningCounts = new Map();
  for (const warning of warnings) warningCounts.set(warning, (warningCounts.get(warning) ?? 0) + 1);
  for (const [warning, count] of warningCounts) {
    console.warn(`  ! ${warning}${count > 1 ? ` (×${count})` : ''}`);
  }

  const entries = compiled
    .map(
      (s) => `  {
    key: ${JSON.stringify(s.key)},
    label: ${JSON.stringify(s.label)},
    category: ${JSON.stringify(s.category)},
    spoken: ${JSON.stringify(s.spoken)},
    keywords: ${JSON.stringify(s.keywords)},
    preset: ${JSON.stringify(s.preset)},
    path: ${JSON.stringify(s.path)},
  },`,
    )
    .join('\n');

  await writeFile(
    generatedPath,
    `// GENERATED by tools/compile-avatar-shapes.mjs — DO NOT EDIT.
// Source of truth: assets/avatar-shapes/ (shapes.json + one SVG per shape).
// Regenerate with: npm run shapes:compile   (or shapes:watch while drawing)
//
// Paths below are already fitted to the ${CUTOUT.width} × ${CUTOUT.height} cutout box inside the
// ${SHEET.width} × ${SHEET.height} sheet: uniformly scaled from whatever canvas they were drawn
// on, centred, and standing on a shared ground line. The ring outside the
// cutout box is stamp room. Source viewBoxes vary on purpose — see the compiler.

import type { SilhouetteTemplate } from './shapeTypes';

export const SILHOUETTES: SilhouetteTemplate[] = [
${entries}
];
`,
  );

  // ---- contact sheet (shape review only — papers rotate, no strokes) -------
  const cells = compiled
    .map((s, i) => {
      const [paperLabel, fill] = SHEET_PAPERS[i % SHEET_PAPERS.length];
      const edge = '#f3ecdc';
      const r = s.report;
      const fitNote = r
        ? `drawn ${Math.round(r.source.width)}×${Math.round(r.source.height)} → ×${r.scale.toFixed(2)}`
        : '';
      return `<figure><div class="cut"><svg viewBox="0 0 ${SHEET.width} ${SHEET.height}" role="img" aria-label="${s.label}">
<rect class="sheet" x="0" y="0" width="${SHEET.width}" height="${SHEET.height}"/>
<rect class="cutbox" x="${CUTOUT.x}" y="${CUTOUT.y}" width="${CUTOUT.width}" height="${CUTOUT.height}"/>
<line class="ground" x1="0" y1="${GROUND_Y}" x2="${SHEET.width}" y2="${GROUND_Y}"/>
<path d="${s.path}" transform="translate(2.5 3.5)" fill="#3d352d" opacity="0.18"/>
<path d="${s.path}" fill="${fill}" stroke="${edge}" stroke-width="2.4" stroke-linejoin="round"/>
</svg></div><figcaption><strong>${s.label}</strong><br><span>${s.category} · ${paperLabel} · preset: ${s.preset}</span><br><span class="fit">${fitNote}</span><br><span class="kw">${s.keywords.join(', ')}</span></figcaption></figure>`;
    })
    .join('\n');

  await writeFile(
    sheetPath,
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>papr.world — avatar shape contact sheet</title>
<style>
  body{font-family:Georgia,serif;background:#ece6d4;color:#2d261e;margin:24px}
  h1{font-size:22px} p.note{max-width:70ch;font-size:14px;opacity:.8}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:18px;margin-top:18px}
  figure{margin:0;background:#f6f1e3;border:1px solid rgba(74,69,60,.3);border-radius:12px;padding:12px}
  .cut svg{width:100%;height:auto;display:block}
  .sheet{fill:none;stroke:rgba(74,69,60,.2);stroke-width:.6}
  .cutbox{fill:none;stroke:rgba(74,69,60,.3);stroke-width:.6;stroke-dasharray:3 2}
  .ground{stroke:rgba(74,69,60,.3);stroke-width:.6}
  figcaption{font-size:12px;margin-top:8px;line-height:1.35} figcaption span{opacity:.7}
  .kw{font-style:italic} .fit{font-size:11px;font-family:ui-monospace,monospace}
</style></head><body>
<h1>Avatar shape contact sheet</h1>
<p class="note">Generated by <code>npm run shapes:compile</code> from assets/avatar-shapes/.
Draw at any size in any viewBox — the compiler measures the artwork, fits it
uniformly into the ${CUTOUT.width} × ${CUTOUT.height} cutout box (dashed) and stands it on the ground
line. The solid border is the full ${SHEET.width} × ${SHEET.height} sheet — the ring between them is
where stamped arms, legs and hair go. Edit an SVG or shapes.json, recompile, refresh this page;
<code>npm run shapes:watch</code> does it on every save.</p>
<div class="grid">${cells}</div></body></html>
`,
  );

  console.log(
    `avatar shapes: ${compiled.length} compiled → shapes.generated.ts + contact sheet` +
      (warnings.length > 0 ? ` (${warnings.length} warning(s))` : ''),
  );
}

const watching = process.argv.includes('--watch');
try {
  await compile();
} catch (error) {
  console.error(error.message);
  if (!watching) process.exit(1);
}

if (watching) {
  console.log(`watching ${shapesDir} — Ctrl-C to stop`);
  let timer = null;
  watch(shapesDir, () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await compile();
      } catch (error) {
        console.error(error.message); // keep watching; fix the file and resave
      }
    }, 150);
  });
}
