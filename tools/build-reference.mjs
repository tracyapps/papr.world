#!/usr/bin/env node
/**
 * Builds the public reference site from the game's own catalogs.
 *
 * The point of this script is that it does **no authoring**. It loads the
 * same TypeScript modules the game imports at runtime — via Vite's
 * `ssrLoadModule`, which handles TS without a separate build — and renders
 * whatever they currently say. There is no parsing of prose, no second copy
 * of any rule, and no step where a human retypes a number.
 *
 * That is the whole design: a page here cannot disagree with the game,
 * because it is not a description of the game, it is a rendering of it. Rename
 * a tool and the page renames itself. Retune tree regrowth and the published
 * figure changes on the next push. Mark a recipe `planned` and it moves to
 * Coming Soon on its own.
 *
 * Run: npm run docs:build   →   docs-site/
 */

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'vite';

const OUT = new URL('../docs-site/', import.meta.url);

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
  // This server exists only to load one TypeScript module and is closed
  // immediately. Vite's background dependency scan does not finish before
  // that happens, and then prints a few hundred lines of stack trace about a
  // server that was closed on purpose. Nothing is pre-bundled here, so there
  // is nothing to scan for.
  optimizeDeps: { noDiscovery: true },
});

let reference;
let resourceArt;
try {
  const mod = await server.ssrLoadModule('/src/sim/catalogs/reference.ts');
  reference = mod.gameReference();
  // Presentation, not a catalog fact — lives beside the game's own
  // `getResourceArt()` rather than in `sim/catalogs/`, and is loaded the
  // same ssrLoadModule way as the reference itself so this page can never
  // show art the game doesn't. Empty until resources start getting real
  // drawings; see docs/resource-artwork-guide.md.
  const artMod = await server.ssrLoadModule('/src/game/resourcePresentation.ts');
  resourceArt = artMod.RESOURCE_ART;
} finally {
  await server.close();
}

const esc = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const titleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);

/** A route in words. The only place obtaining is turned into English. */
function describeRoute(route, toolsById) {
  const biomes = (route.biomes ?? []).map(titleCase).join(', ');
  switch (route.kind) {
    case 'scattered':
      return `Lies loose on the ground in ${biomes}.`;
    case 'dug': {
      const tool = Object.values(toolsById).find((entry) => entry.verb === 'dig' && entry.tier >= route.layer);
      return `Dug up in ${biomes}${tool ? ` with a ${tool.name} or better` : ''}.`;
    }
    case 'trimmed': {
      const tool = Object.values(toolsById).find((entry) => entry.verb === 'trim' && entry.tier >= route.minimumTier);
      return `Trimmed from ${route.species} trees${tool ? ` with ${tool.name} or better` : ''}.`;
    }
    case 'grown':
      return 'Gathered from a plant you grew.';
    case 'crafted':
      return 'Made at the Thing Maker.';
    default:
      return 'Unknown.';
  }
}

const toolsById = Object.fromEntries(reference.tools.map((tool) => [tool.id, tool]));
const ready = (entry) => entry.status === 'ready';
const planned = (entry) => entry.status !== 'ready';

function materialCard(resource) {
  const routes = resource.routes.length
    ? resource.routes.map((route) => `<li>${esc(describeRoute(route, toolsById))}</li>`).join('')
    : '<li class="muted">No way to obtain this yet.</li>';
  const art = resourceArt[resource.id];
  return `
  <article class="card" data-name="${esc(resource.label.toLowerCase())}" data-category="${esc(resource.category)}"
    data-biomes="${esc(resource.biomes.join(' '))}" data-exclusive="${resource.exclusive}"
    data-tool="${esc(resource.toolRequired ?? '')}">
    <header>
      ${art ? `<img class="card-art" src="${esc(art.sourceUrl)}" alt="" aria-hidden="true">` : ''}
      <h3>${esc(resource.label)}</h3>
      ${resource.exclusive ? `<span class="tag tag-exclusive">Only in ${esc(titleCase(resource.biomes[0]))}</span>` : ''}
    </header>
    <p class="meta">${esc(resource.categoryLabel)}${resource.toolRequiredLabel ? ` · needs ${esc(resource.toolRequiredLabel)}` : ' · gathered by hand'}</p>
    <ul class="routes">${routes}</ul>
    ${resource.usedIn.length ? `<p class="meta">Used in: ${resource.usedIn.map((id) => esc(id)).join(', ')}</p>` : ''}
  </article>`;
}

function toolCard(tool) {
  return `
  <article class="card" data-name="${esc(tool.name.toLowerCase())}" data-family="${esc(tool.family)}">
    <header>
      <h3>${esc(tool.name)}</h3>
      <span class="tag">Level ${tool.tier}</span>
    </header>
    <p class="meta">${esc(tool.familyLabel)} · ${esc(tool.verb)}</p>
    <p>${esc(tool.description)}</p>
    <p class="limitation">${esc(tool.limitation)}</p>
    ${tool.requires ? `<p class="meta">Needs a ${esc(toolsById[tool.requires]?.name ?? tool.requires)} first.</p>` : ''}
  </article>`;
}

function recipeCard(recipe) {
  const ingredients = recipe.ingredients
    .map((ingredient) => (ingredient.kind === 'exact'
      ? `${ingredient.quantity} ${ingredient.resource}`
      : `${ingredient.quantity} any ${ingredient.family}`))
    .join(' · ');
  return `
  <article class="card" data-name="${esc(recipe.name.toLowerCase())}">
    <header><h3>${esc(recipe.name)}</h3><span class="tag">${recipe.durationSeconds}s</span></header>
    <p>${esc(recipe.description)}</p>
    <p class="meta">${esc(ingredients)}</p>
    <p class="meta">Thing Maker level ${recipe.minimumMakerLevel} · ${esc(recipe.planName)}</p>
  </article>`;
}

function biomeCard(biome) {
  const exclusives = biome.exclusives.length
    ? `<p class="meta">Only here: ${biome.exclusives.map((id) => esc(id)).join(', ')}</p>`
    : '';
  return `
  <article class="card" data-name="${esc(biome.id)}">
    <header><h3>${esc(titleCase(biome.id))}</h3><span class="tag">${biome.resources.length} materials</span></header>
    <p class="meta">${biome.resources.map((id) => esc(id)).join(', ') || 'Nothing catalogued yet.'}</p>
    ${exclusives}
  </article>`;
}

const rules = reference.rules;
const recoveryMinutes = (rules.trees.fullRecoverySeconds / 60).toFixed(1);

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>papr.world — reference</title>
<style>
  :root {
    color-scheme: light dark;
    --ink: #3e3123; --muted: #7a6a58; --paper: #fbf6e9; --card: #fffdf4;
    --line: rgb(62 49 35 / 0.16); --accent: #315f5c; --exclusive: #8a4a33;
  }
  @media (prefers-color-scheme: dark) {
    :root { --ink: #ece3d2; --muted: #a89882; --paper: #22201c; --card: #2b2823; --line: rgb(236 227 210 / 0.16); --accent: #7fb3ae; --exclusive: #d99476; }
  }
  * { box-sizing: border-box; }
  body { background: var(--paper); color: var(--ink); font: 16px/1.5 ui-rounded, "Segoe UI", system-ui, sans-serif; margin: 0; padding: 0 20px 80px; }
  .wrap { margin: 0 auto; max-width: 1080px; }
  header.top { padding: 40px 0 8px; }
  h1 { font-size: 30px; margin: 0 0 4px; }
  /* The way back to the rest of the site. This page is generated and does not
     share the site's stylesheet, so it carries its own small version. */
  .back {
    display: inline-block; margin: 0 0 14px; padding: 7px 13px 8px;
    border: 1px solid var(--line); border-radius: 10px;
    color: var(--ink); text-decoration: none;
    font: 600 13px/1 ui-rounded, "Segoe UI", system-ui, sans-serif;
    letter-spacing: .04em; text-transform: uppercase;
  }
  .back:hover { background: var(--card); }
  .back:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
  .lede, .meta, .muted { color: var(--muted); }
  .lede { margin: 0 0 4px; }
  .generated { font-size: 13px; }
  .controls { display: flex; flex-wrap: wrap; gap: 8px; margin: 22px 0 6px; position: sticky; top: 0; background: var(--paper); padding: 10px 0; z-index: 2; }
  input[type="search"], select { background: var(--card); border: 1px solid var(--line); border-radius: 8px; color: inherit; font: inherit; padding: 9px 11px; }
  input[type="search"] { flex: 1 1 260px; }
  nav.tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
  nav.tabs button { background: transparent; border: 1px solid var(--line); border-radius: 999px; color: inherit; cursor: pointer; font: inherit; font-size: 14px; padding: 7px 15px; }
  nav.tabs button[aria-selected="true"] { background: var(--accent); border-color: var(--accent); color: var(--paper); font-weight: 700; }
  section[hidden] { display: none; }
  h2 { font-size: 20px; margin: 28px 0 10px; }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 13px 14px; }
  .card header { align-items: baseline; display: flex; gap: 8px; justify-content: space-between; }
  .card h3 { font-size: 16px; margin: 0 0 2px; }
  /* Empty until a resource has real art (docs/resource-artwork-guide.md) — first pass, worth an eyeball once art exists. */
  .card-art { flex: none; height: 30px; object-fit: contain; width: 30px; }
  .card p { margin: 5px 0; }
  .meta { font-size: 13px; }
  .limitation { border-left: 2px solid var(--line); font-size: 14px; padding-left: 9px; }
  .routes { font-size: 14px; margin: 6px 0; padding-left: 18px; }
  .tag { background: var(--line); border-radius: 999px; flex: none; font-size: 11px; font-weight: 700; padding: 3px 9px; text-transform: uppercase; }
  .tag-exclusive { background: var(--exclusive); color: var(--paper); }
  .empty { color: var(--muted); font-style: italic; }
  table { border-collapse: collapse; font-size: 14px; width: 100%; }
  th, td { border-bottom: 1px solid var(--line); padding: 7px 8px; text-align: left; }
  .note { border-left: 3px solid var(--accent); font-size: 14px; margin: 14px 0; padding: 2px 0 2px 12px; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
</head>
<body>
<div class="wrap">
<header class="top">
  <a class="back" href="/">&larr; papr.world</a>
  <h1>papr.world reference</h1>
  <p class="lede">Generated from the game's own catalogs. If a rule here is wrong, the game is wrong too.</p>
  <p class="generated meta">Built ${esc(reference.generatedAt)}</p>
</header>

<div class="controls">
  <input type="search" id="search" placeholder="Search materials, tools, recipes…" aria-label="Search the reference">
  <select id="biome" aria-label="Filter by biome">
    <option value="">All biomes</option>
    ${reference.biomes.map((biome) => `<option value="${esc(biome.id)}">${esc(titleCase(biome.id))}</option>`).join('')}
  </select>
  <label style="align-self:center;font-size:14px"><input type="checkbox" id="exclusive"> Only exclusive materials</label>
</div>

<nav class="tabs" role="tablist">
  <button role="tab" aria-selected="true" data-tab="materials">Materials</button>
  <button role="tab" aria-selected="false" data-tab="tools">Tools</button>
  <button role="tab" aria-selected="false" data-tab="recipes">Recipes</button>
  <button role="tab" aria-selected="false" data-tab="biomes">Biomes</button>
  <button role="tab" aria-selected="false" data-tab="rules">Rules</button>
  <button role="tab" aria-selected="false" data-tab="soon">Coming soon</button>
</nav>

<section id="materials">
  <div class="grid">${reference.resources.filter(ready).map(materialCard).join('')}</div>
</section>

<section id="tools" hidden>
  <div class="grid">${reference.tools.filter(ready).map(toolCard).join('')}</div>
</section>

<section id="recipes" hidden>
  <div class="grid">${reference.recipes.filter(ready).map(recipeCard).join('')}</div>
</section>

<section id="biomes" hidden>
  <div class="grid">${reference.biomes.map(biomeCard).join('')}</div>
</section>

<section id="rules" hidden>
  <h2>Trees</h2>
  <p class="note">A tree is never destroyed. Trimming spends growth; time restores it. A tree cut to nothing is fully back in ${recoveryMinutes} minutes.</p>
  <table>
    <thead><tr><th>Stage</th><th>Growth</th></tr></thead>
    <tbody>${rules.trees.stages.map((stage) => `<tr><td>${esc(titleCase(stage.stage))}</td><td>${stage.from}–${stage.to}</td></tr>`).join('')}</tbody>
  </table>
  <h2>Scissors</h2>
  <table>
    <thead><tr><th>Level</th><th>Growth per cut</th><th>Pieces</th><th>Redwoods</th></tr></thead>
    <tbody>${rules.trees.trimByTier.map((row) => `<tr><td>${row.tier}</td><td>${row.cost}</td><td>${row.pieces}</td><td>${row.handlesRedwood ? 'Yes' : 'No'}</td></tr>`).join('')}</tbody>
  </table>
  <h2>Seeds</h2>
  <table>
    <thead><tr><th>Seed</th><th>Spacing</th><th>Stages (seconds)</th></tr></thead>
    <tbody>${rules.seeds.map((seed) => `<tr><td>${esc(seed.name)}</td><td>${seed.spacing}</td><td>${seed.stageSeconds.join(' · ')}</td></tr>`).join('')}</tbody>
  </table>
</section>

<section id="soon" hidden>
  <p class="lede">Defined in the catalogs but not playable yet. These appear here automatically the moment they are marked ready.</p>
  <div class="grid">${
  [...reference.recipes.filter(planned).map(recipeCard), ...reference.resources.filter(planned).map(materialCard)].join('')
  || '<p class="empty">Nothing waiting — everything defined is playable.</p>'
}</div>
</section>
</div>

<script>
  const tabs = [...document.querySelectorAll('[data-tab]')];
  const sections = tabs.map((tab) => document.getElementById(tab.dataset.tab));
  tabs.forEach((tab, index) => tab.addEventListener('click', () => {
    tabs.forEach((other, otherIndex) => {
      other.setAttribute('aria-selected', String(otherIndex === index));
      sections[otherIndex].hidden = otherIndex !== index;
    });
  }));

  const search = document.getElementById('search');
  const biome = document.getElementById('biome');
  const exclusive = document.getElementById('exclusive');
  function applyFilters() {
    const term = search.value.trim().toLowerCase();
    const wantBiome = biome.value;
    const wantExclusive = exclusive.checked;
    for (const card of document.querySelectorAll('.card')) {
      const name = card.dataset.name || '';
      const biomes = (card.dataset.biomes || '').split(' ');
      const matchesTerm = !term || name.includes(term) || card.textContent.toLowerCase().includes(term);
      const matchesBiome = !wantBiome || biomes.includes(wantBiome) || name === wantBiome;
      const matchesExclusive = !wantExclusive || card.dataset.exclusive === 'true';
      card.hidden = !(matchesTerm && matchesBiome && matchesExclusive);
    }
  }
  for (const control of [search, biome, exclusive]) control.addEventListener('input', applyFilters);
</script>
</body>
</html>`;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });
await writeFile(new URL('index.html', OUT), page);
// The raw data too, so anything else — a critter, a wiki, a spreadsheet —
// can consume the same snapshot without re-deriving it.
await writeFile(new URL('reference.json', OUT), JSON.stringify(reference, null, 2));

console.log(`Reference built: ${reference.resources.length} materials, ${reference.tools.length} tools, ${reference.recipes.length} recipes.`);
