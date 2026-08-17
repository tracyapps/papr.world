#!/usr/bin/env node
// Avatar stamp compiler — the sibling of compile-avatar-shapes.mjs.
//
//   npm run stamps:compile        one-shot
//   npm run stamps:watch          recompile on every save
//
// A stamp is a pre-drawn detail a player sticks onto their cutout: eyes, a
// nose, a mouth, or — the reason this exists — an arm, a leg, a tuft of hair
// that hangs OUTSIDE the cutout, which freehand strokes can never do because
// strokes are clipped to the silhouette.
//
// Source of truth: assets/avatar-stamps/
//   * stamps.json — metadata (key, label, category, spoken, keywords, layer,
//     defaultScale, file)
//   * one SVG per stamp, drawn at any size in any viewBox.
//
// Two things make stamps different from shapes:
//
// 1. ROLES. A stamp is not one silhouette; it is a few parts that recolour
//    differently. Each path carries a role:
//      * ink    — the player's chosen crayon colour (the pupil, the outline)
//      * paper  — the paper stock the cutout is cut from (the eye white)
//      * shadow — a darker tint of that stock (a crease, a nostril)
//    Declare it with data-role="ink" (or class="ink"). With neither, the role
//    is inferred from the fill: dark → ink, light → paper, mid → shadow, so
//    a plain black-and-white export just works.
//
// 2. NORMALIZATION, not fitting. Shapes are fitted to a fixed box; stamps are
//    normalized so their longest side is NATURAL_SIZE and their centre is the
//    origin. Placement then means "put this centre at x,y and multiply by
//    scale" — rotation and flip come free around the same origin, and one arm
//    asset serves both sides.
//
// Outputs:
//   * src/ui/avatarEditor/stamps.generated.ts
//   * designs/avatar-stamp-contact-sheet.html

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { measure, multiply, serializePath, transformSegments } from './svgPathFit.mjs';
import { collectParts } from './svgCollect.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stampsDir = join(root, 'assets', 'avatar-stamps');
const generatedPath = join(root, 'src', 'ui', 'avatarEditor', 'stamps.generated.ts');
const sheetPath = join(root, 'designs', 'avatar-stamp-contact-sheet.html');

const CATEGORIES = ['eyes', 'faces', 'hair', 'limbs', 'extras'];
/** Where the stamp sits relative to the cutout. */
const LAYERS = ['on', 'behind'];
const ROLES = ['ink', 'paper', 'shadow'];

/**
 * Longest side of a stamp at scale 1, in sheet units. 34 makes a pair of eyes
 * a comfortable default on a 100-wide cutout — big enough to see, small enough
 * that the first thing a player does is not "shrink this".
 */
const NATURAL_SIZE = 34;

function fail(errors) {
  for (const error of errors) console.error(`  ✗ ${error}`);
  throw new Error(`avatar stamps: ${errors.length} problem(s) — nothing written`);
}

/**
 * Normalize parts: uniform scale so the longest side is NATURAL_SIZE, then
 * translate so the artwork's centre is (0, 0).
 */
function normalize(parts, file, errors) {
  try {
    const all = parts.flatMap((part) => part.segments);
    const bounds = measure(all);
    if (bounds.width <= 0 && bounds.height <= 0) {
      errors.push(`${file}: artwork has no area`);
      return null;
    }
    const scale = NATURAL_SIZE / Math.max(bounds.width, bounds.height);
    const centreX = (bounds.minX + bounds.maxX) / 2;
    const centreY = (bounds.minY + bounds.maxY) / 2;
    const matrix = multiply(
      { a: scale, b: 0, c: 0, d: scale, e: 0, f: 0 },
      { a: 1, b: 0, c: 0, d: 1, e: -centreX, f: -centreY },
    );
    return {
      parts: parts.map((part) => ({
        role: part.role,
        path: serializePath(transformSegments(part.segments, matrix)),
      })),
      width: bounds.width * scale,
      height: bounds.height * scale,
      source: { width: bounds.width, height: bounds.height },
    };
  } catch (error) {
    errors.push(`${file}: ${error.message}`);
    return null;
  }
}

async function compile() {
  const errors = [];
  const warnings = [];
  const metaRaw = JSON.parse(await readFile(join(stampsDir, 'stamps.json'), 'utf8'));
  const stamps = Array.isArray(metaRaw.stamps) ? metaRaw.stamps : [];
  if (stamps.length === 0) errors.push('stamps.json: no stamps[]');

  const seen = new Set();
  const compiled = [];
  for (const s of stamps) {
    const where = `stamps.json → "${s.key ?? '?'}"`;
    if (!/^[a-z0-9-]+$/.test(s.key ?? '')) errors.push(`${where}: key must be kebab-case`);
    if (seen.has(s.key)) errors.push(`${where}: duplicate key`);
    seen.add(s.key);
    if (!s.label) errors.push(`${where}: missing label`);
    if (!CATEGORIES.includes(s.category)) {
      errors.push(`${where}: category "${s.category}" not one of ${CATEGORIES.join('/')}`);
    }
    if (!s.spoken || s.spoken.length < 10) {
      errors.push(`${where}: "spoken" must really describe the stamp (screen readers read it)`);
    }
    if (!Array.isArray(s.keywords) || s.keywords.length < 2) {
      errors.push(`${where}: give at least 2 search keywords`);
    }
    if (!LAYERS.includes(s.layer)) {
      errors.push(`${where}: layer "${s.layer}" must be "on" (clipped to the cutout) or "behind"`);
    }
    if (s.defaultScale !== undefined && !(s.defaultScale > 0.1 && s.defaultScale < 4)) {
      errors.push(`${where}: defaultScale must be between 0.1 and 4`);
    }

    let normalized = null;
    try {
      const svg = await readFile(join(stampsDir, s.file), 'utf8');
      const parts = collectParts(svg, {
        error: (message) => errors.push(`${s.file}: ${message}`),
        warn: (message) => warnings.push(`${s.file}: ${message}`),
      });
      for (const part of parts) {
        if (!ROLES.includes(part.role)) {
          errors.push(`${s.file}: role "${part.role}" not one of ${ROLES.join('/')}`);
        }
      }
      if (parts.length === 0) errors.push(`${s.file}: nothing drawable found`);
      else normalized = normalize(parts, s.file, errors);
    } catch {
      errors.push(`${where}: cannot read ${s.file}`);
    }

    compiled.push({
      ...s,
      keywords: (s.keywords ?? []).map((k) => String(k).toLowerCase()),
      defaultScale: s.defaultScale ?? 1,
      parts: normalized?.parts ?? [],
      size: normalized ? { width: normalized.width, height: normalized.height } : null,
      report: normalized,
    });
  }

  const referenced = new Set(stamps.map((s) => s.file));
  for (const file of await readdir(stampsDir)) {
    if (file.endsWith('.svg') && !referenced.has(file)) {
      errors.push(`${file}: SVG present but not listed in stamps.json`);
    }
  }
  if (errors.length > 0) fail(errors);
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
    layer: ${JSON.stringify(s.layer)},
    defaultScale: ${s.defaultScale},
    width: ${s.size ? s.size.width.toFixed(2) : 0},
    height: ${s.size ? s.size.height.toFixed(2) : 0},
    parts: [
${s.parts.map((p) => `      { role: ${JSON.stringify(p.role)}, path: ${JSON.stringify(p.path)} },`).join('\n')}
    ],
  },`,
    )
    .join('\n');

  await writeFile(
    generatedPath,
    `// GENERATED by tools/compile-avatar-stamps.mjs — DO NOT EDIT.
// Source of truth: assets/avatar-stamps/ (stamps.json + one SVG per stamp).
// Regenerate with: npm run stamps:compile   (or stamps:watch while drawing)
//
// Paths are normalized: longest side ${NATURAL_SIZE} sheet units, centred on (0, 0), so a
// placed stamp is "translate to x,y · rotate · scale" and nothing else.

import type { StampTemplate } from './stampTypes';

export const STAMP_NATURAL_SIZE = ${NATURAL_SIZE};

export const STAMPS: StampTemplate[] = [
${entries}
];
`,
  );

  // ---- contact sheet ------------------------------------------------------
  const swatch = { ink: '#3f3a33', paper: '#e8e2d0', shadow: '#b9a888' };
  const cells = compiled
    .map((s) => {
      const parts = s.parts
        .map((p) => `<path d="${p.path}" fill="${swatch[p.role]}"/>`)
        .join('');
      return `<figure><div class="cut"><svg viewBox="-24 -24 48 48" role="img" aria-label="${s.label}">
<rect class="bounds" x="-${NATURAL_SIZE / 2}" y="-${NATURAL_SIZE / 2}" width="${NATURAL_SIZE}" height="${NATURAL_SIZE}"/>
<line class="axis" x1="-3" y1="0" x2="3" y2="0"/><line class="axis" x1="0" y1="-3" x2="0" y2="3"/>
${parts}
</svg></div><figcaption><strong>${s.label}</strong><br><span>${s.category} · ${s.layer === 'on' ? 'on the cutout' : 'behind, hangs outside'}</span><br><span class="fit">${s.size ? `${s.size.width.toFixed(0)}×${s.size.height.toFixed(0)} @ ×${s.defaultScale}` : ''}</span><br><span class="kw">${s.keywords.join(', ')}</span></figcaption></figure>`;
    })
    .join('\n');

  await writeFile(
    sheetPath,
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>papr.world — avatar stamp contact sheet</title>
<style>
  body{font-family:Georgia,serif;background:#ece6d4;color:#2d261e;margin:24px}
  h1{font-size:22px} p.note{max-width:70ch;font-size:14px;opacity:.8}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:18px;margin-top:18px}
  figure{margin:0;background:#f6f1e3;border:1px solid rgba(74,69,60,.3);border-radius:12px;padding:12px}
  .cut svg{width:100%;height:auto;display:block;background:#cbbfa4;border-radius:8px}
  .bounds{fill:none;stroke:rgba(74,69,60,.35);stroke-width:.5;stroke-dasharray:2 1.5}
  .axis{stroke:rgba(74,69,60,.5);stroke-width:.5}
  figcaption{font-size:12px;margin-top:8px;line-height:1.35} figcaption span{opacity:.7}
  .kw{font-style:italic} .fit{font-size:11px;font-family:ui-monospace,monospace}
</style></head><body>
<h1>Avatar stamp contact sheet</h1>
<p class="note">Generated by <code>npm run stamps:compile</code> from assets/avatar-stamps/.
Each stamp is normalized to a ${NATURAL_SIZE}-unit box (dashed) centred on the origin (cross).
Colours here are a stand-in: <em>ink</em> takes the player's crayon, <em>paper</em>
and <em>shadow</em> come from the paper stock the cutout is made of.</p>
<div class="grid">${cells}</div></body></html>
`,
  );

  console.log(
    `avatar stamps: ${compiled.length} compiled → stamps.generated.ts + contact sheet` +
      (warnings.length > 0 ? ` (${warningCounts.size} warning kind(s))` : ''),
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
  console.log(`watching ${stampsDir} — Ctrl-C to stop`);
  let timer = null;
  watch(stampsDir, () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        await compile();
      } catch (error) {
        console.error(error.message);
      }
    }, 150);
  });
}
