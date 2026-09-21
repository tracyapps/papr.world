#!/usr/bin/env node
/**
 * Turns the game's knowledge tree into structured data for the public site.
 *
 * Same principle as build-roadmap.mjs and build-reference.mjs next door: the
 * site does not keep a second copy of the tech tree, it renders the real one.
 * The account desk shows "Learning Digging 2 — about 6 hours left" instead of
 * an opaque node id (the id the save actually stores), and it says so by
 * looking the id up in this file — which is a rendering of
 * `src/sim/catalogs/techTree.ts`, not a description of it. Rename a node in the
 * catalog and the desk renames itself on the next deploy. Retune a node's
 * `learningHours` and the time the desk promises moves with it. There is no
 * step where anyone retypes a technique's name or its length.
 *
 * ── What it reads ────────────────────────────────────────────────────────
 *   TECH_DEFS          → one entry per node: its id, `name`, `branch`, and
 *                        (for `'ready'` nodes) `learningHours`.
 *   TECH_BRANCHES      → the branch id → label map, emitted once as `groups`
 *   TECH_BRANCH_ORDER  → so the site can name a branch without a second copy.
 *
 * Duration is the node's own promise: `learningHours` is "approximate hours to
 * finish by waiting alone" (techTree.ts), so `durationMs` is just that × an
 * hour. `'concept'` nodes carry no `learningHours` — honest placeholders, per
 * the catalog — so their `durationMs` is `null` rather than an invented number.
 * `readiness` rides along so a consumer can tell the two apart without
 * guessing from a null.
 *
 * How it loads the TypeScript catalog: exactly like build-reference.mjs — a
 * throwaway Vite server's `ssrLoadModule`, which handles TS without a separate
 * build. No parsing of source text, no tsx, no second implementation of any
 * rule the game already owns.
 *
 * Run: node tools/build-tech.mjs   →   site/src/data/tech.json
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createServer } from 'vite';

const OUT = new URL('../site/src/data/tech.json', import.meta.url);

const HOUR_MS = 60 * 60 * 1000;

// A throwaway server whose one job is to load the catalog. Closed before we
// write. `noDiscovery` silences Vite's background dependency scan, which would
// otherwise print a stack trace about the server being closed on purpose.
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
});

let TECH_DEFS;
let TECH_BRANCHES;
let TECH_BRANCH_ORDER;
try {
  const mod = await server.ssrLoadModule('/src/sim/catalogs/techTree.ts');
  TECH_DEFS = mod.TECH_DEFS;
  TECH_BRANCHES = mod.TECH_BRANCHES;
  TECH_BRANCH_ORDER = mod.TECH_BRANCH_ORDER;
} finally {
  await server.close();
}

// Catalog order is dependency order (see TECH_NODE_ORDER in techTree.ts), and
// is stable run-to-run, so the file only churns when the tree itself moves.
const nodes = Object.values(TECH_DEFS).map((node) => ({
  id: node.id,
  label: node.name,
  durationMs: typeof node.learningHours === 'number'
    ? node.learningHours * HOUR_MS
    : null,
  group: node.branch,
  readiness: node.readiness,
}));

// Branch names live in the catalog too; emitted once so the site never has to
// spell "Caring for the Land" itself.
const groups = TECH_BRANCH_ORDER.map((id) => ({
  id,
  label: TECH_BRANCHES[id].label,
}));

const tech = {
  // Convention shared with build-roadmap.mjs: this is the one field that
  // moves on every run; everything else is deterministic.
  generatedAt: new Date().toISOString(),
  groups,
  nodes,
};

await mkdir(dirname(fileURLToPath(OUT)), { recursive: true });
await writeFile(OUT, JSON.stringify(tech, null, 2));

const ready = nodes.filter((node) => node.readiness === 'ready').length;
console.log(
  `Tech built: ${nodes.length} nodes (${ready} ready, ` +
  `${nodes.length - ready} concept) across ${groups.length} branches.`,
);
