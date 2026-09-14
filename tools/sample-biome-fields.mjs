#!/usr/bin/env node
// Biome field sampler — prints the live biome-weight mix over a square of
// the world, so a change to `world/fields.ts` can be checked against the
// hand-tuned target before it ships, instead of eyeballing the game.
//
// This is step 1 of `docs/tropical-biome-plan.md`'s suggested order: useful
// immediately on its own (re-verifying the existing four biomes whenever
// anyone touches the field), and it is what step 4 (tuning weights for a
// tropical biome) will run over and over.
//
// Zero new dependencies: transpiles the live `fields.ts` with the
// `typescript` package the project already depends on, then imports and
// samples the real `dominantBiomeAt`. This deliberately does not
// re-implement the noise math by hand — a hand-copied version could drift
// out of sync with the field silently, which is exactly the stale-checklist
// problem `check-resource-art.mjs` exists to avoid for resource art.
//
// Usage:
//   node tools/sample-biome-fields.mjs
//   node tools/sample-biome-fields.mjs --size=2400 --step=4
//   node tools/sample-biome-fields.mjs --center=400,0 --size=1200

import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FIELDS_SOURCE = join(ROOT, 'src/world/fields.ts');

function parseArgs(argv) {
  const args = { size: 2400, step: 4, centerX: 0, centerZ: 0 };
  for (const arg of argv) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'size') args.size = Number(value);
    else if (key === 'step') args.step = Number(value);
    else if (key === 'center') {
      const [cx, cz] = value.split(',').map(Number);
      args.centerX = cx;
      args.centerZ = cz;
    }
  }
  return args;
}

/**
 * Transpile `fields.ts` in memory and load the real, live functions.
 *
 * `fields.ts` only ever imports types (`import type { ... }`), so a plain
 * per-file transpile — no bundler, no type-checking against the rest of the
 * project — produces a complete, import-free ES module. That is what keeps
 * this a zero-dependency script rather than one that needs the project's
 * full `~/pp-build` workaround.
 */
async function loadFields() {
  const source = readFileSync(FIELDS_SOURCE, 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    fileName: 'fields.ts',
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
    },
    reportDiagnostics: true,
  });
  const errors = (diagnostics ?? []).filter(
    (d) => d.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    throw new Error(
      `fields.ts did not transpile cleanly:\n${errors
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
        .join('\n')}`,
    );
  }

  const dir = mkdtempSync(join(tmpdir(), 'papr-fields-'));
  const outPath = join(dir, 'fields.mjs');
  writeFileSync(outPath, outputText);
  try {
    return await import(pathToFileURL(outPath).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function formatPercent(count, total) {
  return `${((count / total) * 100).toFixed(1)}%`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { dominantBiomeAt } = await loadFields();

  const half = args.size / 2;
  const counts = new Map();
  let total = 0;

  for (let x = -half; x <= half; x += args.step) {
    for (let z = -half; z <= half; z += args.step) {
      const biome = dominantBiomeAt(args.centerX + x, args.centerZ + z);
      counts.set(biome, (counts.get(biome) ?? 0) + 1);
      total += 1;
    }
  }

  console.log(
    `Sampled a ${args.size}x${args.size} square centred at ` +
      `(${args.centerX}, ${args.centerZ}) every ${args.step} units — ${total} points.\n`,
  );

  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const widest = Math.max(...rows.map(([biome]) => biome.length));
  for (const [biome, count] of rows) {
    console.log(
      `${biome.padEnd(widest)}  ${formatPercent(count, total).padStart(6)}  (${count})`,
    );
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
