# Resource asset pipeline

Implemented 2026-09-04. This is the artist-facing workflow for creating a
material tile and its loose-on-the-ground artwork from one SVG.

## What still needs drawing

```text
npm run art:check
```

Reads the live catalog and the live folders and prints, every time:

- which materials already have art the compiler will pick up;
- which still need it, **with the exact path to create**;
- drawings whose filename matches no resource id — these compile into runtime
  PNGs but nothing in the game reads them, and where the name is one dash away
  from a real material it says so ("is this `terracotta-pebbles`?");
- drawings sitting loose in `assets/source/resources/`, which the resource
  pipeline never looks at; and
- materials the pipeline has no silhouette for yet.

Run it before `assets:compile` to see what compiling will and will not
produce. It only looks — it never writes or moves a file.

**Known gap: the five grown foods** (raspberries, crinkle carrots, ribbon
corn, folded cabbage, paper tomato) have no loose form. Every template in
`tools/resource-asset-pipeline.mjs` is a *material* shape — twigs, stones,
tufts, boards. Picked produce is not any of them, so a `produce` template has
to be drawn before food artwork has anywhere to go. Until then the five foods
keep their `harvestedFood` primitive cluster on the ground.

## Add a tiled resource

Put the default-color, tileable SVG in the folder matching the shape the loose
resource should have:

```text
assets/source/materials/resources/
  wood/<resource-id>.svg
  stone/<resource-id>.svg
  fiber/<resource-id>.svg
  soil/<resource-id>.svg
  board/<resource-id>.svg
  brick/<resource-id>.svg
  textile/<resource-id>.svg
```

Examples:

```text
assets/source/materials/resources/wood/redwood-bark-curls.svg
assets/source/materials/resources/stone/slate.svg
assets/source/materials/resources/board/layerboard.svg
```

The filename is the stable resource id from `RESOURCE_CORE_DEFS`, even when the
display label becomes simpler. For example, the existing save id can remain
`redwood-bark-curls` while players see “Redwood clippings.”

**This is the single easiest thing to get wrong**, and it fails silently: a
tile named for the material's everyday name (`terracotta.svg`, `redwood.svg`)
compiles perfectly and produces artwork the game never asks for, because it
looks that artwork up by save id. `npm run art:check` is the way to catch it.

Run:

```text
npm run assets:compile
```

The compiler produces:

- the default tiling PNG under the matching `assets/runtime/materials/` path;
- every declared surface colorway;
- four or six transparent loose-piece variants under
  `assets/runtime/resources/<resource-id>/`;
- a joined `resources` section in `assets/runtime/asset-manifest.json`; and
- `src/game/resourceArt.generated.ts`, which the ground renderer, scrapbook,
  and generated reference use automatically.

Loose variants always sample the default SVG colors. A `.colors.json` sidecar
continues to create surface colorways but never multiplies the loose artwork.

## Choose folders by loose form

The folder describes the generated silhouette, not the recipe family.

- Raw tree/cactus trimmings go in `wood`.
- Layerboard goes in `board`, even though it belongs to the wood recipe path.
- Red brick and Cream City brick go in `brick`.
- Canvas and woven cloth go in `textile`.
- Stone, fiber, and soil use their matching folders.

Folder placement never sets rarity, biome, recipe, tier, or structural class.
Those remain typed gameplay facts in `src/sim/catalogs/`.

## Seeds

Seeds are direct transparent cutouts rather than tiling materials:

```text
assets/source/resources/seeds/<resource-id>.svg
```

They compile once, get a generated resource-art record, and do not produce a
surface texture or colorways.

## What each half of the output is actually for (2026-09-06)

One tile compiles into two different things, and they are used in two
different places. Getting this backwards is what made a pile of pebbles look
like stickers lying in the sand.

**The tiling surface is what the world wears.** A resource with a compiled
tile keeps its real geometry — the dodecahedron cluster, the twig cylinders,
the tumbled produce — and that geometry is textured with the tile. The drawn
pattern becomes *the material the thing is made of*, exactly as it does on a
wall or a floor. This is what `pageRuntime` reaches for first, via
`getResourceSurfaceUrl()` and `getResourceSurfaceMaterial()`.

`PATTERN_REPEAT` in `pageRuntime.ts` sets how many times the tile repeats
across one piece. One tile per face reads as "this pebble is cut from that
paper". A motif drawn large — a full medallion — may need 2 or 3 before a
pebble stops looking like a coaster.

**The loose cutouts are for everything that is genuinely flat.** Seeds, whose
art is authored as a direct cutout with no tiling form, still scatter as
drawings; so do the scrapbook icon and the reference page, which want one
picture of the material rather than a scene. Those cutouts carry baked
thickness — the silhouette drawn three times: a darker copy scaled about its
centre and dropped a few pixels, the patterned face, then a soft vertical
shade. The rim is scaled rather than pushed to one side on purpose, because
pieces are spun to random angles and a one-sided edge would imply a light
direction that disagrees with the scene on most of them. `createGroundCutout`
also takes a `tilt` so a scatter of flat pieces leans instead of lying
perfectly flat.

**Why not cutouts everywhere:** a flat drawing has no silhouette from a low
camera, nothing for the light to fall across, and no self-shadowing. The
untextured primitive fallbacks looked more solid than the real artwork, which
is backwards — the fix is to put the artwork on the primitives, not to replace
them.

## Dropped and extracted materials

Loose artwork is generated because an item is holdable, regardless of how it
is obtained. A resource does not have to spawn naturally on the ground.
Redwood clippings, cave-mined Slate, crafted Layerboard, and other inventory
materials can therefore fall after extraction or be dropped later without new
artwork.

The renderer chooses loose variants deterministically from the drop/pile seed,
so a pile contains several shapes but stays identical across reloads and
clients.

## When a compile fails

`assets:compile` catches each file on its own. Anything that rendered is
written — manifest, loose variants, `resourceArt.generated.ts` — and the run
then ends **non-zero** with a list of what failed and why. Fix those files and
run again; only the broken ones have to redo.

Before 2026-09-06 a single exception aborted the process before the manifest
was written, so one unrenderable tile silently cost every *other* resource its
artwork — the game fell back to primitives and nothing said why. If art seems
to have stopped appearing, read the end of the compile output first, and check
`failures` in `assets/runtime/asset-manifest.json`.

**Watch the size of a tile's render, not its source.** A 1.2 KB SVG of a dense
repeating pattern can rasterize to a multi-megabyte PNG. The loose composition
now samples a 512px swatch rather than the full-resolution tile, which is both
faster and what keeps a large tile from killing the run — the pattern is only
ever drawn at about 180px anyway.

## What remains manual

Creating a tile does not create the gameplay resource definition. The matching
resource id still needs identity, category/tags, acquisition, recipe, and
presentation eligibility in the simulation catalogs before it becomes usable.
Until then the compiler can generate its files safely, but the game will not
place or grant it.

Legacy manually drawn resource art remains as a fallback. A generated tile with
the same resource id automatically wins, which lets the existing library move
into this layout one resource at a time.
