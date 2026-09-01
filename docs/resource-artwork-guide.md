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
  `world/types.ts`) — `twigBundle`, `stoneCluster`, `fiberTuft`. That's the
  entire shape vocabulary for every loose pile in the game.
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
| **Terracotta pebbles** *(new, 2026-09-01)* | Stones | **dunes** | stoneCluster | paper.orangewrap | swatch |
| Sunbaked cardboard | Cardboard | dunes, scrapflats | stoneCluster | paper.brown.warm | swatch |
| Ochre paperclay | Soil | (dug only) | stoneCluster | paper.brown.warm | swatch |
| Carbon soil | Soil | (dug only) | stoneCluster | paper.grey | swatch |
| Carbon-copy shale | Stones | (dug only) | stoneCluster | paper.grey | swatch |
| Buttonbloom seeds | Seeds | (grown only) | fiberTuft | paper.rainbow | swatch |
| Mend-me seeds | Seeds | (grown only) | fiberTuft | paper.green | swatch |
| Raspberry bush seeds | Seeds | clearing, meadow | fiberTuft | paper.green | swatch |
| Crinkle-carrot seeds | Seeds | clearing, meadow | fiberTuft | paper.green | swatch |
| Ribbon-corn seeds | Seeds | meadow, scrapflats | fiberTuft | paper.green | swatch |
| Folded-cabbage seeds | Seeds | clearing, forest | fiberTuft | paper.green | swatch |
| Paper-tomato seeds | Seeds | meadow, dunes | fiberTuft | paper.green | swatch |
| Raspberries … paper-tomato (5 harvests) | Food | (grown only) | fiberTuft | paper.green | swatch |

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
        ├─→ world/pageRuntime.ts   — the ground harvestable cutout
        ├─→ ui/scrapbook.ts        — the scrapbook thumbnail
        └─→ tools/build-reference.mjs — the public reference site card
```

`resourcePresentation.ts` now exists (this session), wired into all three
consumers, and is **deliberately empty** — no resource has real art yet. A
resource with no entry keeps exactly its current look (generic primitive
cluster on the ground, color swatch in the scrapbook, no image on the
reference site). Nothing breaks by this being empty; a resource simply gets
better-looking the moment its entry lands, with zero changes anywhere else.
This is the identical "ships playable, gets better when the art lands" rule
`toolPresentation.ts`'s own doc comment states for tools.

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
craft-table materials, torn edges, no flat digital gradients):

1. **Draw the cutout SVG.** One resource, one file, any size/proportion —
   portrait for something tall like a stick bundle, roughly square for a
   stone or seed cluster. Save it to
   `assets/source/resources/<resource-id>.svg` (e.g.
   `assets/source/resources/kraft-twigs.svg`), matching the resource's own
   id from `RESOURCE_CORE_DEFS` so the two are never in doubt.
2. **Compile it.** `npm run assets:compile` (the same pipeline every prop
   goes through) rasterizes it to
   `assets/runtime/resources/<resource-id>.png`. If this device's Playwright
   is network-blocked (it was, this session — see
   `pencil-and-paper-sandbox-build` project memory), ImageMagick's
   `rsvg-convert` delegate is a proven fallback with zero network needed:
   `convert -background none <src> -resize 4096x4096> <dst>`.
3. **Register it** in `src/game/resourcePresentation.ts`:
   ```ts
   'kraft-twigs': {
     sourceUrl: new URL('../../assets/source/resources/kraft-twigs.svg', import.meta.url).href,
     aspectRatio: 1.4, // width ÷ height of the source art
   },
   ```
   That's the entire change. The ground pile, the scrapbook thumbnail, and
   the public reference site all pick it up the next time each is built —
   nothing else to edit, and the "if adding a feature required editing the
   docs site, the fact went in the wrong place" rule from
   `docs/single-source-of-truth.md` holds here too.
4. **Verify**: `npx tsc --noEmit`, `npx vitest run`, `npx vite build` in
   `~/pp-build` per the usual sandbox routine, plus `npm run docs:build` to
   confirm the reference site picks up the new art. None of the visual
   result (does the cutout actually look right in the world, does the
   thumbnail crop sensibly) can be confirmed from either sandbox — that
   needs the owner's own `npm run dev` playtest, same as every other art
   change this project has shipped.

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
order: the seven `fiberTuft` seed/food rows sharing one texture are the
single biggest "everything looks the same" cluster, so they'd buy the most
clarity per drawing. Terracotta pebbles (new, no art anywhere yet) is the
newest desert-exclusive material and has no existing swatch expectations to
preserve. Either is a reasonable first real test of the pipeline above.
