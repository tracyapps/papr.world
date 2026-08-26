#!/usr/bin/env node
/**
 * Builds everything papr.world serves, into one folder Vercel can publish.
 *
 * Three separate things live at one domain:
 *
 *   web/              the public site      (Astro, from site/)
 *   web/play/         the game             (Vite, from src/)
 *   web/reference/    the generated catalog (from tools/build-reference.mjs)
 *   web/assets/runtime/  the game's art, at the path its code asks for
 *
 * ── Why the game's art sits at the root rather than under /play ──────────
 * The game asks for its textures by absolute path — '/assets/runtime/…' —
 * in a dozen places in src/. Rewriting all of those to respect a base path
 * would be a real change to working game code for the sake of a hosting
 * detail. Putting the folder where the code already looks costs one copy
 * and changes nothing. The site's own art lives under /assets/materials,
 * /assets/props and so on, so the two never collide.
 *
 * Run: npm run build:web
 */

import { rm, mkdir, cp, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const root = new URL('../', import.meta.url);
const at = (path) => fileURLToPath(new URL(path, root));

const OUT = at('web/');

/** Run a command, inheriting stdio so its output is the build log. */
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)),
    );
  });
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function step(text) {
  console.log(`
== ${text} ==`);
}

// ── 1. Data the site renders ──────────────────────────────────────────────

step('Reading docs/roadmap.md');
await run(process.execPath, [at('tools/build-roadmap.mjs')], { cwd: at('.') });

step('Reading the game catalogs');
await run(process.execPath, [at('tools/build-reference.mjs')], { cwd: at('.') });
// Into site/public/reference, so the dev server and the deploy serve the
// identical page and there is only one route for it to travel.
await run(process.execPath, [at('tools/stage-reference.mjs')], { cwd: at('.') });

// ── 2. The game ───────────────────────────────────────────────────────────

step('Checking the door');
// lib/, api/ and middleware.ts run on the edge, not in the browser, so they
// have their own tsconfig. This is the code that decides who gets into the
// alpha; it should not be the only code nobody type-checks.
await run('npx', ['tsc', '-p', 'tsconfig.edge.json'], { cwd: at('.') });

step('Checking the game');
// The same checks `npm run build` runs. Catching a bad conversation file or a
// stray hardcoded colour here is much better than catching it in production.
await run('npm', ['run', 'content:check'], { cwd: at('.') });
await run('npm', ['run', 'styles:check'], { cwd: at('.') });
await run('npx', ['tsc'], { cwd: at('.') });

step('Building the game');
// Served from /play/, so Vite must write that into the script and style URLs
// it generates. The absolute '/assets/runtime/…' paths inside the game's own
// source are handled by the copy further down.
await run('npx', ['vite', 'build', '--base=/play/', '--outDir=web/play', '--emptyOutDir'], {
  cwd: at('.'),
});

// ── 3. The site ───────────────────────────────────────────────────────────

step('Building the site');
if (!(await exists(at('site/node_modules')))) {
  console.log('site/node_modules missing — installing');
  await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: at('site') });
}
await run('npx', ['astro', 'build'], { cwd: at('site') });

// ── 4. Assemble ───────────────────────────────────────────────────────────

step('Assembling web/');

// The game was built straight into web/play, so clear everything else around
// it rather than wiping the folder we just filled.
// Everything except web/play, which we just filled.
const { readdir } = await import('node:fs/promises');
if (await exists(OUT)) {
  for (const entry of await readdir(OUT)) {
    if (entry === 'play') continue;
    await rm(join(OUT, entry), { recursive: true, force: true });
  }
}

await mkdir(OUT, { recursive: true });

// The site is the root of the domain. It already carries /reference, staged
// into site/public before the build.
await cp(at('site/dist/'), OUT, { recursive: true });

// The game's runtime art, at the absolute path its code asks for.
await cp(at('assets/runtime/'), at('web/assets/runtime/'), { recursive: true });

step('Done');
console.log('web/            the public site');
console.log('web/play/       the game');
console.log('web/reference/  the generated catalog');
console.log('\nPreview it with:  npx serve web');
