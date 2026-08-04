# One Source of Truth

Built 2026-08-04. How a fact enters the game and reaches every place that
mentions it, without ever being typed twice.

## The direction of the arrow

The catalogs in `src/sim/catalogs/` **are** the database. They are typed,
renderer-free, and the game imports them directly. Everything else reads
them:

```
src/sim/catalogs/*.ts
  ├─→ game mechanics        (imports the catalog directly)
  ├─→ conversation lines    ({{material:…}} placeholders)
  └─→ docs-site/            (tools/build-reference.mjs, rebuilt every deploy)
```

Markdown files in `docs/` are **not** a source of facts. They record *why* a
decision was made — the reasoning, the alternatives, the thing that bit us.
If a rule lives in prose and also in code, prose loses and eventually lies.

This is the opposite of a docs-first pipeline, deliberately. TypeScript
already gives the guarantee that matters: rename a tool and every usage is a
compile error. No parser can offer that.

## What each layer may contain

| Layer | Holds | Never holds |
| --- | --- | --- |
| `catalogs/*.ts` | Facts: names, tiers, costs, timings, where things come from | Prose, opinions, roadmap notes |
| `catalogs/reference.ts` | The assembled join of those facts | Anything not derivable from a catalog |
| `content/conversations.json` | Wording, tone, who says it | Facts — those are placeholders |
| `docs/*.md` | Reasoning, history, open questions | Rules the code also states |
| `docs-site/` | Nothing. Generated, gitignored | Anything hand-edited |

## `obtaining.ts` — the join that was missing

"How do I get this?" used to be answered by four tables that did not know
about each other, plus a `biomes` field that had acquired two meanings. So
nothing could answer it, and therefore nothing could *say* it.

`catalogs/obtaining.ts` is now the one answer. Notably it **derives** rather
than restates:

- `BIOME_SCATTER` (and so `BIOME_RESOURCES`) is generated from one scatter
  table, so the generator and the reference cannot disagree about where a
  material lives.
- Dig routes are read back out of `DIG_TABLES` — the table the game actually
  rolls against.
- Trim routes are read out of `SPECIES_YIELD`.
- `isBiomeExclusive()` is *computed*. Nobody asserts that bark curls are
  forest-only; it falls out of there being one biome in the answer. If bark
  curls ever become obtainable elsewhere, every claim of exclusivity —
  including the ones a critter makes out loud — stops being made, on its own.

## `reference.ts` — the assembled view

One function, `gameReference()`, returns everything: biomes, materials with
their routes and required tools, tool ladders, recipes, and the tuning
constants. Renderer-free, so a plain Node script can load it.

**If a fact is not derivable from a catalog it does not belong in this file.**
It belongs in a catalog first. The moment `reference.ts` starts holding
authored content it becomes a second source of truth, which is the thing this
whole arrangement exists to prevent.

## `status` — the roadmap, as data

`ContentStatus` is `'ready' | 'planned'`. It already gated recipes out of the
Thing Maker; now it also decides which reference page something lands on.
Nothing is judged at render time — mark a recipe `ready` and it moves from
Coming Soon to the live pages by itself.

A material with no obtain route is automatically `planned`: the game defines
it but cannot hand it to you, so it is a roadmap item whether or not anyone
remembered to say so.

## Critters quote the catalog

`fillTemplate` in `conversationEngine.ts` supports catalog placeholders
alongside the existing `{{name}}` / `{{biome}}` ones:

| Placeholder | Gives |
| --- | --- |
| `{{material:id}}` | Full name |
| `{{material-short:id}}` | Short name |
| `{{tool:id}}` | Tool name |
| `{{tool-for:id}}` | The tool that material needs, or "nothing but your hands" |
| `{{found-in:id}}` | Readable list of biomes |
| `{{only-here:id}}` | An exclusivity clause, or an honest one saying it turns up elsewhere |

So an authored line reads:

> "Not with your hands, and not with the little round-tipped pair. I hear you
> need {{tool-for:redwood-bark-curls}} to get through the bark."

Wording stays authored — tone, personality, who says it. Only the facts are
looked up. A hand-written *"you'll need the sturdy scissors"* is a fact copied
outside the system that owns it: retune a tier and the squirrel keeps saying
it, confidently, forever.

See `forest-bark-curls-knowledge` in `content/conversations.json` for a worked
example, and `docs/biome-knowledge.md` for the design behind it.

## The site

`npm run docs:build` → `docs-site/`. Loads the real TypeScript catalogs
through Vite's `ssrLoadModule` — no parsing, no second copy — and emits
`index.html` (searchable, filterable by biome, sortable into tabs) and
`reference.json` (the same snapshot, for anything else that wants it).

Gitignored. A committed copy is one more thing that can go stale.

### Vercel, for docs.papr.world

`vercel.json` is committed:

```json
{ "buildCommand": "npm run docs:build", "outputDirectory": "docs-site" }
```

Point a Vercel project at the repo, add `docs.papr.world` as a domain, and
every push regenerates the site from that commit's catalogs. The published
reference is a function of the code, not a thing anyone maintains.

## Adding a feature to this system

1. Put the facts in a catalog under `src/sim/catalogs/`.
2. If it is a new *kind* of fact, add a variant to `ObtainRoute` or a field to
   `reference.ts` — derived, never authored.
3. Give it a `status`.
4. Write game code that imports the catalog.
5. Author wording that uses placeholders for the facts.

Nothing needs updating in the reference site. That is the test of whether it
was done right: **if adding a feature required editing the docs site, the
fact went in the wrong place.**

## Known gap

None outstanding from this pass. `DIG_TABLES` became a table per depth on
2026-08-04, so `obtainRoutesFor` reports real layers and the shovel ladder
earns its tiers from where material sits rather than from a number on the
tool.
