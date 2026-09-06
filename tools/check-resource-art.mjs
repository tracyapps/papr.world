/**
 * Which resources have artwork, which still need it, and which drawings are
 * sitting in a folder the game will never read.
 *
 * Answers the question a checklist in a doc cannot keep answering correctly:
 * a static list goes stale the moment a file is added. This reads the live
 * catalog and the live folders every time.
 *
 * Zero dependencies on purpose — `node tools/check-resource-art.mjs` runs
 * anywhere, including in a sandbox that cannot install anything or open a
 * browser. It never writes a file; it only looks.
 *
 * Run it before `npm run assets:compile` to see what compiling will and will
 * not produce.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE = join(ROOT, 'assets/source');
const TILE_ROOT = join(SOURCE, 'materials/resources');
const DIRECT_ROOT = join(SOURCE, 'resources');

/**
 * Which loose silhouette a material should be cut into, from the tags it
 * already carries in the catalog. First match wins, so a bundle of finished
 * lumber (`wood` + `board`) reads as board rather than as twigs.
 */
const FOLDER_BY_TAG = [
  ['board', 'board'],
  ['brick', 'brick'],
  ['stone', 'stone'],
  ['clay', 'soil'],
  ['soil', 'soil'],
  ['wood', 'wood'],
  ['long-fiber', 'fiber'],
  ['soft-fiber', 'fiber'],
  ['seed', 'seeds'],
];

/** Folders the compiler knows how to cut a loose shape from. */
const TILE_FOLDERS = ['wood', 'stone', 'fiber', 'soil', 'board', 'brick', 'textile'];

function readCatalog() {
  const text = readFileSync(join(ROOT, 'src/sim/catalogs/resources.ts'), 'utf8');
  const entries = [];
  for (const line of text.split('\n')) {
    const match = /^\s*'([a-z0-9-]+)':\s*\{\s*id:\s*'[a-z0-9-]+'/.exec(line);
    if (!match) continue;
    const category = /category:\s*'([a-z-]+)'/.exec(line)?.[1] ?? '?';
    const tags = [...(/tags:\s*\[([^\]]*)\]/.exec(line)?.[1] ?? '').matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    entries.push({ id: match[1], category, tags });
  }
  return entries;
}

function wantedPathFor(resource) {
  if (resource.tags.includes('food')) return null; // no produce silhouette exists yet
  const folder = FOLDER_BY_TAG.find(([tag]) => resource.tags.includes(tag))?.[1];
  if (!folder) return null;
  return folder === 'seeds'
    ? `assets/source/resources/seeds/${resource.id}.svg`
    : `assets/source/materials/resources/${folder}/${resource.id}.svg`;
}

function listSvgs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.svg'))
    .map((entry) => join(dir, entry.name));
}

function drawnFiles() {
  const found = [];
  for (const folder of TILE_FOLDERS) {
    for (const file of listSvgs(join(TILE_ROOT, folder))) {
      found.push({ folder, id: file.split('/').pop().replace(/\.svg$/, ''), path: relative(ROOT, file) });
    }
  }
  for (const file of listSvgs(join(DIRECT_ROOT, 'seeds'))) {
    found.push({ folder: 'seeds', id: file.split('/').pop().replace(/\.svg$/, ''), path: relative(ROOT, file) });
  }
  return found;
}

const catalog = readCatalog();
const drawn = drawnFiles();
const drawnById = new Map(drawn.map((entry) => [entry.id, entry]));
const catalogIds = new Set(catalog.map((entry) => entry.id));

const done = [];
const misfiled = [];
const missing = [];
const noTemplate = [];

for (const resource of catalog) {
  const wanted = wantedPathFor(resource);
  if (!wanted) {
    noTemplate.push(resource);
    continue;
  }
  const art = drawnById.get(resource.id);
  if (!art) {
    missing.push({ resource, wanted });
  } else if (art.path !== wanted) {
    misfiled.push({ resource, wanted, actual: art.path });
  } else {
    done.push({ resource, wanted });
  }
}

const unclaimed = drawn.filter((entry) => !catalogIds.has(entry.id));

/**
 * A drawing whose name is contained in exactly one missing material's id is
 * almost certainly that material, filed under its everyday name instead of
 * its save id — `terracotta.svg` for `terracotta-pebbles`. Exactly one, on
 * purpose: an ambiguous guess is worse than no guess.
 */
function likelyMatchFor(entry) {
  const candidates = missing.filter(({ resource }) => (
    resource.id.includes(entry.id) || entry.id.includes(resource.id)
  ));
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * SVGs sitting directly in assets/source/resources/ rather than in a
 * subfolder. The resource pipeline does not look at them — they compile as
 * ordinary one-off assets and reach the game only through the hand-written
 * LEGACY_RESOURCE_ART bridge in src/game/resourcePresentation.ts.
 */
const strays = listSvgs(DIRECT_ROOT).map((file) => relative(ROOT, file));

const line = (text = '') => console.log(text);
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

line();
line(`Resource artwork — ${plural(catalog.length, 'material', 'materials')} in the catalog`);
line('='.repeat(64));

line();
line(`DONE — ${plural(done.length, 'material has', 'materials have')} art the compiler will pick up`);
for (const entry of done) line(`  ✓ ${entry.resource.id.padEnd(24)} ${entry.wanted}`);
if (done.length === 0) line('  (none yet)');

if (misfiled.length) {
  line();
  line(`MISFILED — ${plural(misfiled.length, 'drawing is', 'drawings are')} in the wrong place or under the wrong name`);
  for (const entry of misfiled) {
    line(`  ✗ ${entry.resource.id}`);
    line(`      is at   ${entry.actual}`);
    line(`      move to ${entry.wanted}`);
  }
}

line();
line(`TO DRAW — ${plural(missing.length, 'material', 'materials')} with no art yet`);
for (const entry of missing) {
  line(`  ☐ ${entry.resource.id.padEnd(24)} → ${entry.wanted}`);
}
if (missing.length === 0) line('  (nothing — every material with a silhouette has art)');

if (noTemplate.length) {
  line();
  line(`NO SILHOUETTE YET — ${plural(noTemplate.length, 'material', 'materials')} the pipeline cannot cut a loose shape for`);
  line('  (add a template to tools/resource-asset-pipeline.mjs before drawing these)');
  for (const resource of noTemplate) {
    line(`  … ${resource.id.padEnd(24)} category ${resource.category}, tags ${resource.tags.join(', ')}`);
  }
}

if (unclaimed.length) {
  line();
  line(`NOT A MATERIAL (yet) — ${plural(unclaimed.length, 'drawing', 'drawings')} whose name matches no resource id`);
  line('  These compile into runtime PNGs, but nothing in the game reads them until');
  line('  a resource with that exact id exists in src/sim/catalogs/resources.ts.');
  const byFolder = new Map();
  for (const entry of unclaimed) {
    byFolder.set(entry.folder, [...(byFolder.get(entry.folder) ?? []), entry.id]);
  }
  for (const [folder, ids] of [...byFolder].sort()) {
    line(`  ${folder}/`);
    for (const id of ids.sort()) {
      const guess = likelyMatchFor({ id, folder });
      line(`      ${id.padEnd(22)}${guess ? `  ← is this "${guess.resource.id}"? then rename it to ${guess.wanted}` : ''}`);
    }
  }
}

if (strays.length) {
  line();
  line(`OUTSIDE THE PIPELINE — ${plural(strays.length, 'drawing sits', 'drawings sit')} loose in assets/source/resources/`);
  line('  Not in a subfolder, so the resource pipeline never sees these. They reach');
  line('  the game only via LEGACY_RESOURCE_ART in src/game/resourcePresentation.ts.');
  for (const path of strays.sort()) line(`      ${path}`);
}

line();
line(`Summary: ${done.length} done · ${misfiled.length} misfiled · ${missing.length} to draw · ${noTemplate.length} awaiting a silhouette · ${unclaimed.length} not yet a material`);
line();
