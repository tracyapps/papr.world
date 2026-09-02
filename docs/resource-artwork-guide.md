# Resource Artwork Guide

Written 2026-09-01, after a playtest report that ground materials were hard
to tell apart — "sometimes I walk over some stones and they are a certain
kind of seed, other times they are something else." This doc is the answer
to two questions: **what does each material actually look like today**, and
**what is the one place to change so a new drawing shows up everywhere it
should** — the ground, the extraction source, the scrapbook thumbnail, the
build-material picker (where it applies), and the public reference site.

## The problem, precisely

Every resource in `RESOURCE_CORE_DEFS` (`src/sim/catalogs/resources.ts`) is
a real, distinct catalog entry — its own id, label, category, obtain routes.
But its *appearance* today comes from only two knobs, both in
`src/world/resources.ts`'s `RESOURCE_WORLD_DEFS`:

- `visual`: one of exactly three shapes (`HarvestVisual` in
  `world/types.ts`) — `twigBundle`, `stoneCluster`, `fiberTuft`, plus two
  added 2026-09-02: `seedPile` and `harvestedFood`. That's the entire shape
  vocabulary for every loose pile in the game.
- `material`: a flat paper texture from the shared `MaterialKey` registry
  (`render/materials.ts`) — the same registry terrain, buildings, and
  critter coats draw from.

So a resource's whole visual identity is "which of 3 shapes, which of ~30
shared flat textures." Nothing is unique to that one resource. Two resources
in the same category frequently render as the *exact same shape with a
different flat color* — that is the "which stone was that again" problem in
one sentence. The scrapbook makes it more visible, not less: until a
resource has real icon art, it renders as a plain rotated color swatch
(`ui/scrapbook.ts`, `.scrapbook-item-icon` in `styles.css`) — no pattern, no
silhouette, just a colored square.

**The chart below is every resource as it renders today.** Categories with
several rows sharing a `Visual` are the exact confusion being reported.

| Resource | Category | Biome(s) | Ground visual | Ground texture | Thumbnail today |
| --- | --- | --- | --- | --- | --- |
| Kraft-paper twigs | Sticks | clearing, forest, meadow | twigBundle | paper.brown | swatch |
| Ribbonwood sticks | Sticks | forest, scrapflats | twigBundle | paper.salmon | swatch |
| Redwood bark curls | Sticks | forest (trimmed only, never scattered) | twigBundle | paper.cork | swatch |
| Mossy paper fiber | Fiber | clearing, forest, meadow | fiberTuft | paper.monstera | swatch |
| Confetti stones | Stones | meadow, scrapflats | stoneCluster | paper.purple | swatch |
| Graphite cardstone | Stones | forest, scrapflats | stoneCluster | paper.grey | swatch |
| Bluefold pebbles | Stones | meadow | stoneCluster | paper.aqua | swatch |
| **Terracotta pebbles** *(new + real art, 2026-09-01)* | Stones | **dunes** | stoneCluster | paper.orangewrap | **real art** |
| Sunbaked cardboard | Cardboard | dunes, scrapflats | stoneCluster | paper.brown.warm | swatch |
| Ochre paperclay | Soil | (dug only) | stoneCluster | paper.brown.warm | swatch |
| Carbon soil | Soil | (dug only) | stoneCluster | paper.grey | swatch |
| Carbon-copy shale | Stones | (dug only) | stoneCluster | paper.grey | swatch |
| Buttonbloom seeds | Seeds | (grown only) | seedPile | paper.rainbow | swatch |
| Mend-me seeds | Seeds | (grown only) | seedPile | paper.green | swatch |
| Raspberry bush seeds | Seeds | clearing, meadow | seedPile | paper.green | swatch |
| Crinkle-carrot seeds | Seeds | clearing, meadow | seedPile | paper.green | swatch |
| Ribbon-corn seeds | Seeds | meadow, scrapflats | seedPile | paper.green | swatch |
| Folded-cabbage seeds | Seeds | clearing, forest | seedPile | paper.green | swatch |
| Paper-tomato seeds | Seeds | meadow, dunes | seedPile | paper.green | swatch |
| Raspberries … paper-tomato (5 harvests) | Food | (grown only) | harvestedFood | paper.green | swatch |
| **Bound lumber** *(new, 2026-09-02)* | **Refined** | (crafted only, never scattered) | twigBundle | paper.brown.warm | swatch |

Bound lumber is the first entry in a new **Refined** category: a resource
you can never find lying in the world, only make at the Thing Maker from
other resources (see `recipes.ts`'s `'resource'`-kind `RecipeOutput`, added
2026-09-02, and the `bound-lumber` recipe — kraft-twigs + redwood-bark-curls
in, bound lumber out). Once made, it behaves exactly like anything foraged:
it stacks in the scrapbook's new "Refined Materials" tab and can itself be
an ingredient in later recipes. Its `visual`/`material` are set the same as
every other resource for type-completeness (and in case it's ever dropped
or displayed), even though nothing currently puts it on the ground.

Read down the "Ground texture" column for the seven seed/food rows: six of
them are the literal same `paper.green` texture. They are seven different
things a player can hold, and on the ground they are visually one thing.

## Why the desert felt like leftovers, specifically

Before this session, dunes' only "stone" was **bluefold-pebbles** — an aqua
paper texture, the same resource meadow uses, reused verbatim in a biome it
doesn't suit visually. That's now split: bluefold-pebbles is meadow-only,
and dunes has its own exclusive **terracotta-pebbles** (`paper.orangewrap`,
a warm texture already in the registry — no new art needed for this part).
Same `stoneCluster` shape as before; the fix is that the desert now has
something no other biome hands you, the way `redwood-bark-curls` already
does for the forest. See `catalogs/obtaining.ts`'s `SCATTERED_IN` and
`catalogs/geology.ts`'s `DIG_TABLES.dunes` for the two places it's rolled.

This is the cheap half of "materials more intentional to biome": reassigning
*which* resource lives where costs nothing but a catalog edit, because
`obtaining.ts` is already the single source of truth for that
(`docs/single-source-of-truth.md`). The expensive half — each material
having a drawing distinct enough that dunes *reads* different from meadow at
a glance — is what the rest of this doc sets up.

## The architecture: one place, four consumers

This follows the exact pattern already proven twice in this codebase —
`toolPresentation.ts` for tools, `DECOR_DEFS`/`TREE_DEFS` for cactus and
trees. Author art once, register it once, and every consumer that reads
through the same lookup function updates together:

```
assets/source/resources/<id>.svg      (you draw this)
        │
        │  same compile step as every other prop
        ▼
assets/runtime/resources/<id>.png
        │
        │  one entry in RESOURCE_ART
        ▼
src/game/resourcePresentation.ts  ←── getResourceArt(resourceId)
        │
        ├─→ world/pageRuntime.ts   — the ground harvestable pile
        ├─→ ui/scrapbook.ts        — the scrapbook thumbnail
        └─→ tools/build-reference.mjs — the public reference site card
```

`resourcePresentation.ts` now has its first real entry — **terracotta
pebbles** (2026-09-01) — proving the pipeline end to end, alongside a
placeholder-quality drawing you should feel entirely free to replace. Every
other resource still keeps its current look (generic primitive cluster on
the ground, color swatch in the scrapbook, no image on the reference site).
Nothing breaks by an entry being missing; a resource simply gets
better-looking the moment its entry lands, with zero changes anywhere else.
This is the identical "ships playable, gets better when the art lands" rule
`toolPresentation.ts`'s own doc comment states for tools.

### Ground piles: one drawing, scattered — not one drawing of the whole pile

This is the one real difference between resource categories, and it's about
orientation, not process. `world/pageRuntime.ts` already scatters several
small primitive meshes per pile (five twigs, five stones, seven blades) —
adding real art keeps that exact scatter, it just swaps each primitive mesh
for a copy of your one drawing at a random position/rotation/scale. So:

- **You always draw a single item** — one twig, one pebble, one blade —
  never a composed pile scene. The game builds the pile out of copies.
- **Sticks, stones, seeds, and food (`twigBundle`/`stoneCluster`/
  `seedPile`/`harvestedFood`) all lie flat on the ground**, so they're drawn
  as seen from directly above (like a simple top-down icon) and laid flat
  by `createGroundCutout()` — a new primitive in `render/builders.ts`
  alongside the standing `createCutout()` trees and cactus already use.
  Nothing else differs between any of these four — same file format, same
  top-down framing, same registration step. Draw whatever silhouette
  actually reads as a twig vs. a pebble vs. a seed vs. a berry; the
  pipeline doesn't care. `seedPile` scatters smaller/tighter than
  `stoneCluster` (a seed pile shouldn't read as a rock pile), and
  `harvestedFood` scatters a looser, rounder cluster (tumbled produce, not
  a stone). Food resources don't actually spawn on the ground yet as of
  2026-09-02 — see the note below — but their art will be ready the moment
  that changes.
- **Fiber (`fiberTuft`) stands up**, like a tiny blade of grass, so it's
  drawn from the side and stood up with the same `createCutout()` trees
  use, just small. This is now the one category that's genuinely different
  from the rest — everything else lies flat.

Which one a resource gets is decided by its existing `visual` field in
`world/resources.ts` (`RESOURCE_WORLD_DEFS`) — that's already set for every
resource today, so there's nothing new to configure. You only ever touch
`resourcePresentation.ts`.

**On food resources and the ground:** today a harvest never lies loose in
the world — it only ever comes directly off a plant you grew
(`plantRuntime.ts`), so `harvestedFood`'s ground rendering has no resource
that actually reaches it yet. The owner has floated a real feature this
would unlock: an unharvested wild plant "dropping" its ripe produce onto
the ground after a few days if left unpicked, with an existing-drop check
so a patch doesn't accumulate unbounded raspberries. Not built — noted here
because `harvestedFood` is the rendering half of that idea already sitting
ready, in case whoever picks it up next goes looking for it.

**Not wired to this (a deliberate open question, not an oversight):** the
build-material picker (`BUILD_MATERIAL_OPTIONS`/`BUILD_MATERIAL_LABELS` in
`sim/catalogs/building.ts`). That system is six flat `MaterialKey` swatches
("Warm Kraft", "Brown Paper", …) with no tie to any specific harvested
resource — building with "Warm Kraft" doesn't consume or reference
`sunbaked-cardboard`, even though they happen to share the same underlying
texture file today. Whether a placed piece's material should someday *be* a
specific resource you harvested (so the paper you built with visually is the
paper you gathered) is a real design decision with gameplay consequences —
it would mean sourcing build materials, not just picking a color — and
deliberately isn't made here. Worth a conversation before touching it.

## How to add one resource's real artwork

Exactly the workflow already used for the cactus and marsh-grass props this
session (`docs/paper-artwork-guide.md` has the full art-direction rules —
craft-table materials, torn edges, no flat digital gradients), now proven
end to end by `terracotta-pebbles.svg` — open it alongside this list as a
worked example, and see the note inside that file for format specifics
(no `<defs>`/CSS classes needed, plain `fill="#hex"` per `<path>`).

1. **Draw one item**, not a pile — one twig, one pebble, one blade. Sticks
   and stones are drawn from directly above (top-down, like a little icon,
   since they'll lie flat on the ground); fiber/seeds/food are drawn from
   the side (since they'll stand up). Either way: any size, whatever
   proportion the item actually has — the file's own width÷height *is* the
   aspect ratio the game will use, nothing to set separately. Save it to
   `assets/source/resources/<resource-id>.svg` (e.g.
   `assets/source/resources/kraft-twigs.svg`), matching the resource's own
   id from `RESOURCE_CORE_DEFS` so the two are never in doubt.
2. **Compile it.** `npm run assets:compile` (the same pipeline every prop
   goes through) rasterizes it to
   `assets/runtime/resources/<resource-id>.png`. If this device's Playwright
   is network-blocked (it was, this session — see
   `pencil-and-paper-sandbox-build` project memory), ImageMagick's
   `rsvg-convert` delegate is a proven fallback with zero network needed —
   this is how `terracotta-pebbles.png` itself was produced:
   `convert -background none <src> -resize 4096x4096> <dst>`.
3. **Register it** in `src/game/resourcePresentation.ts`, following the
   real `terracotta-pebbles` entry already there:
   ```ts
   'kraft-twigs': {
     sourceUrl: '/assets/runtime/resources/kraft-twigs.png',
     aspectRatio: 1.4, // width ÷ height, straight from the source SVG
   },
   ```
   (The path is root-relative — `assets/` is the Vite public directory —
   not the `new URL(...)` form `toolPresentation.ts` uses; that form is for
   a DOM `<img>` consumer, this one feeds a THREE.js scene texture, same as
   `TREE_DEFS`/`DECOR_DEFS` already do.) That's the entire change. The
   ground pile, the scrapbook thumbnail, and the public reference site all
   pick it up the next time each is built — nothing else to edit, and the
   "if adding a feature required editing the docs site, the fact went in
   the wrong place" rule from `docs/single-source-of-truth.md` holds here
   too.
4. **Verify**: `npx tsc --noEmit`, `npx vitest run`, `npx vite build` in
   `~/pp-build` per the usual sandbox routine, plus `npm run docs:build` to
   confirm the reference site picks up the new art (the terracotta-pebbles
   card there now has a real thumbnail — search `docs-site/index.html` for
   `card-art` to see it). None of the visual result (does the ground decal
   actually sit right, does the thumbnail crop sensibly) can be confirmed
   from either sandbox — that needs your own `npm run dev` playtest, same
   as every other art change this project has shipped.

### What "extracted from" means for the chart above

A few resources (redwood bark curls; anything `trimmed`) never lie loose on
the ground at all — the *tree itself* is their only visual, via
`world/treeRuntime.ts`'s existing redwood art. Grown food/seeds are the
mirror case: they only ever appear as an inventory count and a scrapbook
row, never a loose pile, because they come from a garden bed you planted
(`plantRuntime.ts` draws the growing plant; the harvested item itself has no
separate world presence). `getResourceArt()` still matters for those — it's
what would give them a real scrapbook thumbnail — but there's no "ground
pile" cell to fill in for them in the chart, and that's correct, not a gap.

## Priority, if picking somewhere to start

Not prescriptive — art direction is yours — but the chart above suggests an
order: the seven `seedPile`/`harvestedFood` seed and food rows sharing one
`paper.green` texture are still the single biggest "everything looks the
same" cluster (the shape split from 2026-09-02 fixed *how* they're scattered,
not that they're still all the same green swatch), so they'd buy the most
clarity per drawing. Terracotta pebbles already has its first pass (a
placeholder worth replacing whenever you get to it) and proves the flat
ground-decal half of the pipeline works end to end; `mossy-paper-fiber` is
now the *only* `fiberTuft` resource left, and would be a good next test
since it's the one category that exercises the standing-cutout half instead
of the flat one. Bound lumber is lowest priority of
all — it never appears on the ground today, so its swatch is invisible to
players; draw it only once something (crafting output display, a future
drop/storage feature) actually shows it.
