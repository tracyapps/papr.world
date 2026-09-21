# Tech data generator — `tools/build-tech.mjs`

**Status:** done and verified. Three files touched, all outside the "do not edit" zones.

| File | Change |
| --- | --- |
| `tools/build-tech.mjs` | new — generator |
| `site/src/data/tech.json` | new — generated output (committed) |
| `package.json` | `tech:build` script added; chained into `site:build` |

No `src/**`, `site/src/pages/**`, or `site/src/scripts/**` files were edited.

## 1. How the TS catalog is read

**Via Vite's `ssrLoadModule`**, copying `tools/build-reference.mjs` verbatim in
spirit (not `build-roadmap.mjs`, which parses markdown and had no TS trick to
copy). `build-tech.mjs` spins up a throwaway Vite server, calls
`server.ssrLoadModule('/src/sim/catalogs/techTree.ts')`, reads
`TECH_DEFS` / `TECH_BRANCHES` / `TECH_BRANCH_ORDER`, and closes the server.
This handles TS with no separate build step, no `tsx`, no source parsing, and
no second implementation of any rule the game already owns. `vite` is already a
root dependency and `optimizeDeps.noDiscovery` silences the closed-server stack
trace exactly as `build-reference.mjs` does. **No new dependencies.**

Read from the catalog:
- `TECH_DEFS` → per node: `id`, `name`, `branch`, `readiness`, and (ready-only) `learningHours`.
- `TECH_BRANCHES` + `TECH_BRANCH_ORDER` → branch id → label, emitted once as `groups`.

## 2. File shape (`site/src/data/tech.json`)

Top level: `generatedAt`, `groups`, `nodes`.

- `groups` — `{ id, label }[]`, from `TECH_BRANCH_ORDER` (the catalog's real
  branch names, so the site never spells "Caring for the Land" itself).
- `nodes` — one per `TECH_DEFS` entry, in catalog order (= dependency order,
  stable run-to-run):
  `{ id, label, durationMs, group, readiness }`.
  - `label` = node `name`.
  - `durationMs` = `learningHours × 3600000`, or **`null` for `'concept'`
    nodes** — they carry no `learningHours` and the catalog deliberately keeps
    them as honest placeholders, so no number is invented.
  - `group` = `branch` (the catalog's only natural grouping — a branch/era/tier
    style tag; nothing else was invented).
  - `readiness` rides along so a consumer can tell the two kinds apart without
    inferring it from a null duration.

### `cat site/src/data/tech.json | head -40`

```json
{
  "generatedAt": "2026-09-21T00:22:01.461Z",
  "groups": [
    { "id": "caring-for-the-land", "label": "Caring for the Land" },
    { "id": "materials", "label": "Materials & Refinement" },
    { "id": "building-construction", "label": "Building & Construction" },
    { "id": "interior-design", "label": "Interior Design" },
    { "id": "fine-arts-textiles", "label": "Fine Arts & Textiles" },
    { "id": "cooking", "label": "Cooking" },
    { "id": "transportation", "label": "Transportation" }
  ],
  "nodes": [
    {
      "id": "digging-1",
      "label": "Digging 1",
      "durationMs": 3600000,
      "group": "caring-for-the-land",
      "readiness": "ready"
    },
```

Sample of both node kinds:

```json
{"id":"digging-1","label":"Digging 1","durationMs":3600000,"group":"caring-for-the-land","readiness":"ready"}
{"id":"water-tending","label":"Water Tending","durationMs":null,"group":"caring-for-the-land","readiness":"concept"}
```

Totals: **99 nodes — 23 ready, 76 concept — across 7 branches.**

### The desk line

`durationMs` is the node's own promise ("approximate hours to finish by waiting
alone"), so a consumer has `label` + total length. Time *left* is a function of
`ActiveLearningState.startedAt` and task credit (`getLearningProgress` in
`src/sim/learning.ts`), which is live game state the public site does not hold —
so this file supplies the label and the full duration, and the desk-side code
(other agents) decides how to render "left". Field naming deliberately matches
the catalog: `id` is the exact node id a save stores in `activeLearning.nodeId`.

## 3. Determinism check

`node tools/build-tech.mjs` run twice, second run compared against the first:

```
$ cp site/src/data/tech.json /tmp/tech.a.json && node tools/build-tech.mjs
Tech built: 99 nodes (23 ready, 76 concept) across 7 branches.

$ diff <(grep -v generatedAt /tmp/tech.a.json) <(grep -v generatedAt site/src/data/tech.json)
DIFF-EXCLUDING-generatedAt: none

$ diff /tmp/tech.a.json site/src/data/tech.json
2c2
<   "generatedAt": "2026-09-21T00:21:57.789Z",
---
>   "generatedAt": "2026-09-21T00:22:01.461Z",
```

**Exactly one line differs — `generatedAt`.** Matching `build-roadmap.mjs`'s
convention (`new Date().toISOString()`), it is the only field that moves between
runs. Everything else (group order, node order, values) is deterministic.

## 4. Wiring into `site:build`

`package.json` now has (existing scripts neither renamed nor reordered — one
added, one extended):

```json
"tech:build": "node tools/build-tech.mjs",
"site:build": "npm run tech:build && npm run roadmap:build && npm run reference:stage && npm --prefix site run build",
```

`tech:build` sits in the script list alphabetically (between `styles:check` and
`test`), and `site:build` runs it first, ahead of `roadmap:build`, exactly the
way `roadmap:build` was already chained. `site:dev` was left untouched (not
asked, and `tech.json` is committed so dev works as-is).

## 5. Verification

- `node tools/build-tech.mjs` — runs, prints `Tech built: 99 nodes (23 ready, 76 concept) across 7 branches.`
- Two-run diff — limited to `generatedAt` (above).
- `cd site && npx astro build`:

```
19:22:18 ✓ Completed in 30ms.
19:22:18 [@astrojs/sitemap] `sitemap-index.xml` created at `dist`
19:22:18 [build] 9 page(s) built in 858ms
19:22:18 [build] Complete!
```

Build succeeds; nothing imports `tech.json` yet, so it is inert until a page or
script consumes it.

## 6. Not verified / open points

- The **full `npm run site:build`** chain was not run end-to-end (it shells into
  `reference:stage` and a fuller build); only its new first step
  (`node tools/build-tech.mjs`) and the Astro build inside `site/` were run
  directly. The chain change is a plain `&&` prefix identical in shape to the
  existing `roadmap:build` step.
- **Consumption** of `tech.json` by the account desk is out of scope (that lives
  in `site/src/pages/**` / `site/src/scripts/**`, owned by other agents). Nothing
  yet reads the file; field names were chosen to mirror the catalog so the
  consuming code can look up by `activeLearning.nodeId` directly.
- `readiness` and `groups` are extras beyond the required `{ id, label,
  durationMs }` — both are real catalog facts, added so a consumer can resolve a
  branch name and distinguish a real lesson from a concept placeholder without
  guessing. If the consuming code would rather have the bare minimum, dropping
  both is a two-line change.
