# Materials and Resources V1 — working design

Status: design draft, partly implemented. The folder-driven resource-art
foundation was implemented 2026-09-04. **Implementation step 3 — the unified
material metadata and its validation — landed 2026-09-05** (see "What is built"
below). Extraction, recipes, and building behavior remain planned.

## What is built (2026-09-05)

- **The vocabulary is real code.** `src/sim/catalogs/materials.ts` holds
  `ProcessStage` (0–4), `StructuralClass` (0–4), and `MATERIAL_TAGS` — types
  and tables only, no `ResourceId`, so the dependency runs resources →
  materials and never back.
- **Every resource carries all three axes.** `processStage`, `structuralClass`,
  and `tags` are required fields on `ResourceCoreDefinition`, so a new material
  cannot be added without answering them. `RESOURCES_BY_TAG` and
  `resourcesWithTag()` are derived, never hand-kept.
- **Structural classes are deliberately conservative.** Nothing raw claims
  class 2 or above; only `bound-lumber` does. Resource-costed building does not
  exist yet, and a material should not advertise a capability the game has not
  designed. Revisit with open decision 6.
- **`src/sim/catalogs/materials.test.ts` is the validation** the "Recipe
  grammar" section asks for: unknown or unused tags, missing ingredients,
  recipes that produce something less worked than what they consumed, two ready
  recipes claiming one output, recipe cycles, and any material with no way to
  get it.
- **Two obtain routes that existed in the game but could not be spoken now
  can.** `obtainRoutesFor()` emits `crafted` (from `RECIPE_DEFS`) and a new
  `bought` route (from the shop catalog, carrying price, barter, and the shop's
  own name). Found by the validation: `mend-me-seeds` has been sold at Pip's
  counter since the first shop and read as a material with no route at all,
  which is why the reference page needed a hand-written `id in SEED_DEFS`
  exception to look right. That exception is gone.
- **The `sticks` family displays as "Wood & Bark"** (audit item 1). Ids
  unchanged.

Not done from step 3's neighbours: the `tag`-kind `IngredientRequirement` is
not wired into `RECIPE_DEFS` (the tags exist and are queryable; no recipe asks
for one yet), and `artStatus` / `colorways` are not on the catalog — those
belong with the compiler-generated manifest work in "Changes required in the
current compiler".

This document records the reasoning, vocabulary, proposed catalog shape, and
implementation impact for the first complete materials pass. It deliberately
does not replace the live catalogs in `src/sim/catalogs/`. When implementation
starts, factual tables move into those typed catalogs and every player-facing
reference is generated from them. This file then keeps only decisions and
rationale, in keeping with `docs/single-source-of-truth.md`.

Loose resources scattered on the ground are outside this pass. The acquisition
loops in scope are digging, renewable trimming, later cave mining, and refining
at the Thing Maker.

## The model in one sentence

A material has an **identity**, a **family**, an **acquisition route**, a
**processing stage**, and optional **structural performance**; none of those is
inferred from its name, artwork, rarity, or tool tier.

The important separations are:

- **Tool tier** answers “can I reach this source?”
- **Depth or source tier** answers “where is the raw material?”
- **Processing stage** answers “how many transformations are behind this?”
- **structural class** answers “what scale of building can use this?”
- **rarity** answers “how often does it appear?”
- **biome affinity** answers “where is it easier to find?”

A Tier 3 tree can yield a raw Stage 0 wood. A Stage 3 wallpaper can still have
structural class 0. A common material can be the signature resource of one
biome. Keeping these axes separate makes the catalog expandable without
renaming everything whenever balancing changes.

## Naming convention

Do not use `fancy`, `heavy-duty`, `advanced`, or numbered quality prefixes as a
general material ladder. Those words work for the charming, free-form tool
names, but they become vague when a recipe graph reaches five stages.

Use two naming grammars instead. Raw names should be intentionally plainer than
the world art. The paper-craft character already lives in the drawing and does
not need to be repeated in every inventory label.

1. **Raw resources:** `[source/species] + [controlled head noun]`
   - Redwood clippings
   - Pine clippings
   - Palm clippings
   - Cattail fiber
   - Marsh-grass fiber
   - Sandstone, slate, basalt, quartz, clay, and iron rock
2. **Refined materials:** `[method/form] + [functional material noun]`
   - Binding cord
   - Soft pulp
   - Bound lumber
   - Layerboard
   - Crossbound timber
   - Paper mortar
   - Cream City brick
   - Fused glass

The catalog holds a numeric `processStage`; the display name does not have to
contain it. The player learns the hierarchy from recipes and the scrapbook
path, not from every item being called “Tier 3 X.”

### Controlled raw vocabulary

Keep a small set of head nouns and give each one a job:

| Source | Raw label pattern | Meaning |
| --- | --- | --- |
| Tree, palm, or cactus | `<species> clippings` | Any loose woody pieces taken by trimming |
| Shrub, grass, or reed | `<plant> fiber` | Spinnable, pulpable, or binding plant matter |
| Geological material | Common material name | Sandstone, slate, basalt, quartz, clay, iron rock |
| Excavated earth | `Paper Soil` | The shared landscaping resource |
| Refined output | Its actual form | Cord, pulp, paper, cloth, lumber, board, brick, glass |

Do not alternate between sticks, strips, splinters, slats, spars, and curls just
to make peer raw resources sound different. Those words can describe artwork
in an art note, but they should only enter the inventory label if they encode a
real mechanical form. The current clever compound names can survive as pattern
names, tree nicknames, colorway ids, or critter language without becoming the
canonical material name.

Examples:

- `redwood-bark-curls` keeps its stable save id but can display as **Redwood
  clippings**.
- Plaid may describe the Pine clippings texture; the item does not have to be
  called Plaidpine splinters.
- Bluefold can remain a pattern/colorway name while the resource displays as a
  clearer stone name once its geological source is decided.
- Two genuinely different sources should not both be called Sandstone. Select
  one design, or give the other a real material identity rather than an art-file
  suffix masquerading as a new resource.

### Processing stages

| Stage | Catalog label | Meaning | Examples |
| --- | --- | --- | --- |
| 0 | Raw | Harvested or excavated; no recipe | Kraft twigs, quartz chips, cattail floss |
| 1 | Prepared | Cleaned, crushed, pulped, spun, bundled | Soft pulp, binding cord, stone aggregate, bound lumber |
| 2 | Formed | A usable sheet, textile, board, or masonry unit | Handmade paper, canvas, Layerboard, red brick |
| 3 | Composite | Multiple formed materials combined for performance | Crossbound timber, faced masonry, glass pane |
| 4 | Architectural | Specialized large-scale component | Storybeam, foundation block, weatherpanel |

These labels are useful in the scrapbook and authoring tools, but should not be
automatically prefixed to item names.

### Structural classes

Structural class is metadata, not a synonym for processing stage.

| Class | Player-facing label | Typical use |
| --- | --- | --- |
| 0 | Finish | Paper, wallpaper, clothing, trim, glass decoration |
| 1 | Light | Small props, furniture, planters, fences |
| 2 | Structural | Single-story walls, doors, floors, ordinary roofs |
| 3 | Load-bearing | Second stories, long roofs, balconies, large openings |
| 4 | Long-span | Towers, halls, bridges, landmark-scale builds |

For V1 building rules, a blueprint may simply require a minimum class. A later
building simulation can add `supportProvided`, `loadImposed`, and connected
support paths without renaming the materials or invalidating recipes.

## Digging: a shared crust with biome affinities

### Recommended roll shape

Every successful dig returns two independently described things:

1. **Excavated soil**, with quantity based mainly on depth.
2. **One geological find** rolled from the shared pool for that layer.

This makes “mostly soil, plus a randomized stone” literal. Soil no longer has
to compete with stones in a single weighted table, and the landscaping loop is
reliable: every hole creates some of the material that can later fill it or be
used to raise a hill.

The same find pool is used in every surface biome. A biome applies a multiplier
to one entry in that pool; it does not replace the pool. A player can eventually
find anything anywhere, but traveling is the sensible way to target a specific
material.

Suggested first tuning rule: a biome’s favored find gets a **2.5× weight**.
This is intentionally a catalog number, not a promise. It should be playtested
for “noticeably better here” without becoming “effectively exclusive.”

### Surface strata

The live game has three shovel tiers, so V1 should settle three layers and
reserve the schema for more. The layer key must not remain a TypeScript union of
`1 | 2 | 3`.

| Layer | Name | Tool gate | Soil | Shared geological pool | Role |
| --- | --- | --- | --- | --- | --- |
| 1 | Surface fold | Flimsy Shovel, tier 1 | 2–3 Paper Soil | Confetti stones, Mossprint pebbles, Bluefold pebbles, Terracotta pebbles, Graph-paper gravel | Common color and texture variety |
| 2 | Packed bed | Okayish Shovel, tier 2 | 1–2 Paper Soil | Chalkfold chips, Graphite cardstone, Tissue geodes, Sandstone flakes, Carbon-copy shale | The first structural inputs |
| 3 | Deep seam | Heavy-duty Shovel, tier 3 | 1 Paper Soil | Marblewrap stone, Slate slips, Quartz chips, Iron rock, Foil flint | Signature and advanced inputs |

Proposed affinity matrix:

| Biome | Layer 1 favorite | Layer 2 favorite | Layer 3 favorite |
| --- | --- | --- | --- |
| Clearing | Confetti stones | Chalkfold chips | Marblewrap stone |
| Forest | Mossprint pebbles | Graphite cardstone | Slate slips |
| Meadow | Bluefold pebbles | Tissue geodes | Quartz chips |
| Dunes | Terracotta pebbles | Sandstone flakes | Iron rock |
| Scrapflats | Graph-paper gravel | Carbon-copy shale | Foil flint |

“Favorite” means boosted weight only. None of these is biome-exclusive in the
surface crust. True exclusives should be rare authored exceptions such as a
landmark seam, a specific tree, or a cave feature.

The names in these two strata tables remain working names until the selected
tile art is assigned. The direct labels visible in the current art review—
**Sandstone, Slate, Iron Rock, Basalt, Quartz, and Clay**—are the preferred
direction. `Mossy Wall` describes a finished surface rather than a raw stone,
and should become a refined/build colorway. The two different concepts labeled
`sandstone` in the review cannot both ship under that same resource identity;
choose one as Sandstone and either retire or materially re-identify the other.

### Soil behavior

Use one stackable `paper-soil` resource for terrain editing. Its visual color
can come from the target ground or a chosen finish; the inventory unit should
not fragment into five near-identical soil stacks unless soil color becomes a
meaningful creative choice.

- A dig grants Paper Soil before the geological find.
- Refilling a hole consumes Paper Soil. The current hoe behavior already does
  this for deeper cells.
- Raising a hill consumes Paper Soil proportional to added terrain volume.
- Flattening a player-made hill refunds a conservative portion, not necessarily
  100%, to avoid a duplication loop.
- Soil used as a recipe binder should use a more specific prepared ingredient,
  such as Paper Mortar or Ochre Paperclay, rather than silently consuming the
  landscaping reserve.

## Renewable trimming

The scalable unit is a **renewable source**, not a tree. Trees, cacti, shrubs,
marsh grass, and cattails should all share the same regrowth state and harvest
contract. Their art and growth silhouettes may differ.

Each source declares:

- source id and player-facing species name;
- source class: `tree`, `cactus`, or `shrub`;
- habitat/biome weights;
- minimum scissors tier;
- regrowth profile;
- deterministic weighted yields;
- art variants that represent the same species;
- visual changes for flourishing, trimmed, cropped, and resting states.

The minimum tool belongs to the source definition. Avoid another special flag
such as today’s `handlesRedwood`; that becomes one boolean per unusual plant.

### Proposed tree and cactus library

| Source | Class | Scissors | Primary yield | Occasional secondary | Notes |
| --- | --- | ---: | --- | --- | --- |
| Leafy tree | Tree | 1 | Leafy-tree clippings | — | Current generic tree art; the species can get a real name later |
| Palm tree | Tree | 1 | Palm clippings | Palm fiber | New tree; light, flexible wood |
| Pine tree | Tree | 2 | Pine clippings | — | Existing pine art; strong straight-grain wood |
| Redwood | Tree | 3 | Redwood clippings | — | Existing redwood art; premium structural wood |
| Paddle cactus | Cactus | 1 | Paddle-cactus clippings | Cactus fiber | Group appropriate existing cactus art variants |
| Barrel cactus | Cactus | 2 | Barrel-cactus clippings | Cactus fiber | A compact, springy desert wood |
| Column cactus | Cactus | 2 | Column-cactus clippings | Cactus fiber | Long straight desert members |

The exact mapping of the eight current cactus drawings into the three species
is an art-direction pass, not something to infer from file names.

### Proposed shrub library

All shrubs are scissors tier 1 in V1. This is a deliberate simplification, not
a permanent type restriction.

| Source | Primary fiber | Character | Likely habitat |
| --- | --- | --- | --- |
| Leafy shrub | Shrub fiber | Soft, good for pulp and yarn | Clearing, forest, meadow |
| Marsh grass | Marsh-grass fiber | Long, strong, good for cord and canvas | Marsh banks |
| Cattails | Cattail fiber | Soft, absorbent, good for paper and stuffing | Marsh and woodland banks |
| Ribbonroot clump | Ribbonroot fiber | Tough binder fiber | Meadow, dunes edges |

And yes: the catalog group should be called **Shrubbery** in at least one
player-facing place. This is non-negotiable for reasons of knighthood.

## Refinement paths

Recipes can already output resources and refined resources can already be used
by later recipes. The missing work is breadth, graph presentation, validation,
and structural metadata—not a brand-new crafting model.

### Fiber and paper path

| Output | Stage | Proposed recipe | Structural class |
| --- | ---: | --- | ---: |
| Soft pulp ×2 | 1 | 3 soft plant fibers | 0 |
| Binding cord ×2 | 1 | 3 long plant fibers | 1 |
| Yarn ×2 | 1 | 2 Shrub fiber + 1 Cattail fiber | 0 |
| Handmade paper ×2 | 2 | 2 Soft pulp | 0 |
| Woven cloth ×2 | 2 | 3 Yarn | 0 |
| Canvas ×1 | 2 | 2 Yarn + 1 Binding cord | 1 |
| Wallpaper ×2 | 3 | 2 Handmade paper + 1 pigment family | 0 |
| Tailored cloth ×1 | 3 | 2 Woven cloth + 1 Binding cord | 0 |

Clothing should usually be an item recipe consuming Tailored Cloth, not a
material category itself. Wallpaper is a finish material with many colorways,
not a stronger kind of paper.

### Wood path

| Output | Stage | Proposed recipe | Structural class |
| --- | ---: | --- | ---: |
| Bound lumber ×2 | 1 | 4 Kraft twigs + 1 any long fiber | 1 |
| Layerboard ×2 | 2 | 2 Bound lumber + 2 any species wood + 1 Binding cord | 2 |
| Crossbound timber ×1 | 3 | 2 Layerboard + 2 Pine clippings + 1 Binding cord | 3 |
| Storybeam ×1 | 4 | 2 Crossbound timber + 1 Redwood clippings + 1 Canvas | 4 |

**Layerboard is now the settled replacement for “fancy plywood.”** It describes
what the material is, fits the paper-craft world, and leaves room for many
grades without adjective escalation. Alternatives worth keeping in reserve:
Foldply, Pressboard, Crossply board, Laminated board, Ribbonply, and
Patchwork ply.

The existing `bound-lumber` save id should be preserved. Its current recipe
uses redwood bark curls even though the plan is a starter and redwood requires
upgraded scissors; V1 should either change the ingredients as above or move the
plan later. Changing the ingredients is the cleaner progression and preserves
Bound Lumber as the common first rung.

### Stone and masonry path

| Output | Stage | Proposed recipe | Structural class |
| --- | ---: | --- | ---: |
| Stone aggregate ×2 | 1 | 3 any stone | 1 |
| Paper mortar ×2 | 1 | 2 Ochre Paperclay + 1 any fiber | 0 |
| Red brick ×2 | 2 | 2 Terracotta pebbles + 1 Stone aggregate + 1 Paper mortar | 2 |
| Cream City brick ×2 | 2 | 2 Sandstone flakes + 1 Chalkfold chips + 1 Paper mortar | 2 |
| Faced masonry ×1 | 3 | 2 any brick + 1 Binding cord | 3 |
| Foundation block ×1 | 4 | 2 Faced masonry + 1 Graphite cardstone | 4 |

Red brick and Cream City brick are peer color/material expressions, not quality
tiers. Both can satisfy an `any brick` input. Recipes that care about appearance
can ask for an exact variety.

### Glass path (advanced)

| Output | Stage | Proposed recipe | Structural class |
| --- | ---: | --- | ---: |
| Quartz grit ×2 | 1 | 3 Quartz chips | 0 |
| Fused glass ×1 | 2 | 2 Quartz grit + 1 Carbon soil | 0 |
| Glass pane ×1 | 3 | 2 Fused glass + 1 Binding cord | 1 |
| Patterned glass ×1 | 3 | 1 Glass pane + 1 pigment family | 0 |

Heat is a Thing Maker capability unlocked at a later maker level; it need not
become a consumable fuel unless fuel creates a genuinely fun loop.

## Recipe grammar

The recipe graph needs more expressive ingredient roles while keeping the
current exact-or-family convenience:

```ts
type Ingredient =
  | { kind: 'exact'; resource: ResourceId; quantity: number }
  | { kind: 'tag'; tag: MaterialTag; quantity: number }
  | { kind: 'oneOf'; resources: ResourceId[]; quantity: number };
```

Recommended tags include `wood`, `species-wood`, `soft-fiber`, `long-fiber`,
`stone`, `brick`, `pigment`, and `soil`. Categories remain scrapbook folders;
tags describe recipe behavior. One resource may have several tags.

Every recipe definition should also declare:

- `processStage` of its output;
- Thing Maker level and required capability (`press`, `spin`, `weave`, `kiln`,
  `fuse`), if any;
- output quantity;
- unlock route;
- status (`planned` or `ready`);
- artwork readiness;
- optional byproducts only if they create a useful loop.

Catalog validation must reject recipe cycles, missing inputs, decreasing
processing stages, outputs without a resource definition, and two ready
recipes that accidentally claim the same exclusive output.

## Buildings and appearance

The material chosen for a build must become both a gameplay input and a visual
choice. Today those are separate: the build picker chooses a renderer texture
and the build recipes consume no materials.

Recommended model:

- A blueprint declares material **slots**, such as `frame`, `wall`, `roof`,
  `finish`, and `window`.
- Each slot declares accepted tags and minimum structural class.
- A material definition exposes one or more approved surface styles.
- The player chooses an eligible inventory material/colorway for each slot.
- Placement consumes the chosen resource and saves its stable resource id plus
  colorway id, not only a renderer `MaterialKey`.

Example gates:

| Blueprint piece | Accepted material | Minimum class |
| --- | --- | ---: |
| Chair or planter | wood, board, masonry | 1 |
| Ground-floor wall | board, timber, brick | 2 |
| Door | board, timber | 2 |
| Ordinary roof | board, canvas, roof-sheet | 2 |
| Second-story floor | timber, masonry | 3 |
| Second-story wall | timber, masonry | 3 |
| Wide roof or balcony | timber | 3 |
| Tower, hall, bridge span | architectural timber or masonry | 4 |

For the first building pass, use minimum-class gates. Add a connected load
graph only when freeform stacking is rich enough that the difference is visible
and understandable to players.

### Artwork contract

Each material needs one catalog-owned presentation block:

```ts
presentation: {
  inventoryIcon: 'resource.layerboard',
  worldDropArt: '/assets/runtime/resources/layerboard.png',
  worldVisual: 'boardStack',
  swatch: 'paper.brown.warm',
  mapColor: '#…',
  buildSurfaces: [
    { id: 'natural', materialKey: 'wooden-floor-light-brown' },
    { id: 'grey-print', materialKey: 'wooden-floor-grey' },
  ],
}
```

Pattern/color choices are variants of one material unless they change recipes
or structural behavior. Red brick and Cream City brick are distinct because
their ingredients and regional story differ. Blue versus pink wallpaper is
normally a colorway because only the surface changes.

## Resource asset generation

### Settled direction

One default-color tile is the authored source for both a usable surface texture
and the loose pieces of that resource. Folder placement chooses a standard
loose-piece template. The compiler fills several template silhouettes with
deterministic, differently offset samples of the tile.

This should be a **masking/composition step**, not image recognition. The tile
supplies color, pattern, and texture; a reusable template supplies the twig,
stone, fiber, board, brick, or cloth silhouette. Trying to discover convincing
stone shapes from arbitrary tile artwork would be fragile and would make the
same pattern compile differently after innocent art edits.

Recommended source organization:

```text
assets/source/materials/
  surfaces/                         decorative tiles with no inventory resource
  resources/
    wood/
      redwood.svg                   default tile and loose wood source
      redwood.colors.json           optional surface colorways
      pine.svg
      palm.svg
    stone/
      sandstone.svg
      slate.svg
      basalt.svg
      quartz.svg
      iron-rock.svg
    fiber/
      shrub.svg
      marsh-grass.svg
      cattail.svg
    soil/
      paper-soil.svg
    board/
      bound-lumber.svg
      layerboard.svg
    brick/
      red-brick.svg
      cream-city-brick.svg
    textile/
      canvas.svg
      woven-cloth.svg

assets/source/resources/
  seeds/                            direct transparent cutouts; no build tile
    buttonbloom.svg
    mend-me.svg

tools/asset-templates/resources/
  wood/loose-01.svg … loose-06.svg
  stone/loose-01.svg … loose-06.svg
  fiber/loose-01.svg … loose-06.svg
  soil/loose-01.svg … loose-04.svg
  board/loose-01.svg … loose-04.svg
  brick/loose-01.svg … loose-04.svg
  textile/loose-01.svg … loose-04.svg
```

The first folder under `materials/resources/` is a **loose-form template**, not
necessarily the recipe family. This distinction matters: Layerboard belongs to
the broad wood recipe family, but it should look like a small board or plank on
the ground, not another twig. Folder names such as `wood`, `board`, `brick`, and
`textile` describe the generated silhouette.

Most resources need no sidecar beyond the existing optional colorway file. A
rare exception can have a small metadata sidecar to override sample scale,
variant count, or template, but the normal artist workflow must remain “put the
SVG in the right folder and compile.” Gameplay behavior must not be inferred
from the folder.

### Compiler outputs

For this source:

```text
assets/source/materials/resources/stone/slate.svg
```

the compiler should emit:

```text
assets/runtime/materials/resources/stone/slate.png
assets/runtime/materials/resources/stone/slate.<colorway>.png   when declared
assets/runtime/resources/slate/loose-01.png
assets/runtime/resources/slate/loose-02.png
assets/runtime/resources/slate/loose-03.png
…
```

The manifest entry should join those roles:

```json
{
  "resourceId": "slate",
  "surface": "assets/runtime/materials/resources/stone/slate.png",
  "surfaceColorways": [],
  "looseTemplate": "stone",
  "loose": [
    "assets/runtime/resources/slate/loose-01.png",
    "assets/runtime/resources/slate/loose-02.png"
  ]
}
```

The loose variants are always sampled from the SVG’s **default palette**.
Colorways continue to compile for build surfaces but do not fan out into loose
resource variants. This avoids a combinatorial asset explosion and ensures a
resource is visually recognizable on the ground.

### How one loose variant is made

1. Read the default SVG tile.
2. Pick the next silhouette from the folder’s template set.
3. Seed sample offset, scale, reflection, and slight rotation from
   `resourceId + variant index`; builds stay deterministic.
4. Fill the silhouette with a wrapping/repeating sample of the tile. Sampling
   must wrap across tile edges rather than expose a seam or blank area.
5. Apply template-owned edge treatment and a restrained paper shadow.
6. Crop to alpha bounds with a small consistent margin.
7. Emit a transparent PNG and record dimensions/aspect ratio in the manifest.

Wood and fiber may use long narrow masks; stone uses irregular closed masks.
The compiler should not cut literal rectangular image slivers and leave them
rectangular—the recognizable silhouette still comes from the template.

### Every material is droppable

Loose artwork is a property of a holdable resource, not of its current obtain
route. The compiler generates it whether the catalog says the resource is
scattered, dug, mined, trimmed, or crafted.

This supports both possible interaction styles:

- a trim or mining action drops pieces into the world before pickup; and
- a player deliberately drops or leaves something from inventory.

Redwood clippings therefore need loose wood variants even if they only come
from a redwood. Slate and quartz need loose stone variants even if their source
is eventually a cave wall. Refined Layerboard, brick, canvas, and glass also
need an appropriate loose form if they can leave inventory.

Seeds are the explicit alternate pipeline: their authored SVG is already the
transparent loose object/icon. It compiles as a cutout and never becomes a
tiling build surface.

### Catalog and runtime contract

The asset compiler discovers and generates files; the material catalog decides
what they mean. A generated manifest (or generated TypeScript module) should let
the catalog refer to one resource art key instead of manually maintaining
`RESOURCE_ART` URLs and aspect ratios.

```ts
presentation: {
  assetKey: 'resource.slate',
  droppable: true,
  buildSurfaceEligible: true,
  defaultColorway: 'default',
}
```

The world renderer selects a loose variant deterministically from the object’s
drop id. The scrapbook may use one designated loose variant or a generated
thumbnail. Cave walls and living sources still have their own in-place art;
they point to the same resource id that the loose/drop presentation uses.

### Changes required in the current compiler

The current `tools/compile-assets.mjs` is a uniform one-source-to-one-runtime
compiler with colorway fan-out. To support the resource pipeline later:

- Move generic build/decorative materials under `materials/surfaces/`; only
  `materials/resources/<template>/` triggers loose generation.
- Add a resource composition phase after the default SVG render and before the
  final manifest is written.
- Keep template masks outside `assets/source/` so the normal recursive walk
  does not publish them as game assets.
- Reuse the one browser process and default tile render. Do not rerender every
  colorway for every loose mask.
- Expand the manifest from flat independent files to a resource record joining
  the default surface, surface colorways, and loose variants.
- Generate `resource-art.generated.ts` (or load the manifest at build time) so
  `resourcePresentation.ts` no longer hand-copies URLs and aspect ratios.
- Add a controlled cleanup list for previously generated loose variants so a
  reduction from six variants to four does not leave stale runtime files.
- Preserve the current fallback rule carefully: ImageMagick can rasterize a
  default tile, but a failed resource composition must fail loudly rather than
  silently emit incomplete art.

Compiler tests should cover deterministic output names, stable hashes for a
fixed source/template, alpha bounds, default-color sampling, exclusion of
colorways from loose variants, manifest completeness, and a droppable-art entry
for every holdable catalog resource.

## Caves and mining

Caves should reuse the acquisition schema rather than clone digging.

- Surface digging samples a horizontal stratum with a shovel.
- Cave mining samples a vertical wall stratum with a pickaxe.
- Both use a depth definition, a shared weighted pool, biome/region affinity,
  deterministic deposits, tool gates, and depletion/visual state.
- Cave depth is not automatically a new `Biome`; an underground environment
  can carry the surface region’s geology plus its own cave-zone modifiers.

Proposed initial mapping:

| Cave band | Pickaxe tier | Relationship to surface |
| --- | ---: | --- |
| Exposed wall | 1 | Mostly Layer 2 materials |
| Inner wall | 2 | Mostly Layer 3 materials |
| Deep vein | 3 | Cave-only crystals, metals, and authored seams |

This preserves the value of ordinary digging while making caves the efficient
route to quantities and true deep-vein specialties.

## Single source of truth: target architecture

The canonical facts remain typed, renderer-free catalogs under
`src/sim/catalogs/`. The proposed shape is one joined material domain rather
than one enormous file:

```text
catalogs/materials.ts       identities, tags, stages, structural class, presentation refs
catalogs/extraction.ts      dig strata, cave strata, biome affinities
catalogs/renewables.ts      tree/cactus/shrub species, regrowth, yield tables
catalogs/recipes.ts         transformation graph
catalogs/building.ts        material slots and structural requirements
catalogs/reference.ts       derived join only
```

From that source:

```text
typed catalogs
  ├─ game simulation and inventory
  ├─ world generation and interaction rules
  ├─ Thing Maker recipe graph
  ├─ build palette and placed-piece appearance
  ├─ scrapbook “how to get / how to make / used in” views
  ├─ critter fact placeholders
  └─ generated public reference and design review charts
```

No help copy should hand-type a quantity, tool tier, biome favorite, or recipe.
Critters may author personality around a placeholder, but the fact itself comes
from the catalog.

## Current-code impact audit

No code changes are part of this design pass. The implementation will need the
following rewiring.

### 1. Resource identity and presentation

- `src/sim/catalogs/resources.ts` owns identity/category while
  `src/world/resources.ts` separately owns visual/material/map color. Move or
  join the presentation block so one resource definition can be validated as a
  whole without importing Three.js.
- Rename the player-facing `Sticks & Twigs` family to `Wood & Bark`; keep stable
  resource ids. Consider whether `cardboard` remains a raw family or becomes a
  prepared/refined board tag.
- Add tags, processing stage, structural class, art status, and colorways.
- Extend `HarvestVisual` beyond the current generic shapes for prepared boards,
  cloth, brick stacks, and glass if refined items can appear in trays/storage.

### 2. Dig results and depth

- `geology.ts` currently authors a different resource list for every biome and
  layer. Replace it with shared layer pools plus per-biome affinity overrides.
- `DigDiscovery` currently returns one `resource` and quantity. It needs a
  bundle/grants shape so one dig can return soil plus a geological find.
- `DigLayer`, tool tiers, recipes, and saved revealed layers hardcode
  `1 | 2 | 3`. Replace that with validated numeric tier/depth ids and explicit
  catalog bounds before adding a fourth rung.
- `toolActions.ts` shows one resource-gain chip. It needs a combined yield
  presentation, while the command grants all outputs atomically.
- The deterministic seed should continue to include cell and layer. Affinity
  changes must not create client disagreement.
- Save migration must accept old single-resource `revealedLayers` and normalize
  them into the new grants shape.

### 3. Soil editing

- Hole refill already totals the `soil` family and charges deeper holes; retain
  that behavior.
- Add a terrain-raise command that spends soil, validates footprint/slope, and
  stores an edit delta. Do not mutate generated base terrain.
- Define refund and multiplayer authority rules before shipping raise/flatten.

### 4. Renewable sources

- Cacti are currently `DecorKind`, explicitly non-interactive. They must become
  renewable sources (or point to one) before scissors can trim them.
- Shrubs/cattails/marsh grass are decorative set pieces with no persistent
  harvest address. Give them stable generated ids and the same sparse regrowth
  state used by trees.
- `TreeSpecies` is currently only `pine | leafy | redwood`, and
  `treeSpeciesOf()` infers it from artwork-name prefixes. Replace this with an
  explicit art-variant-to-source id in page data/catalog data.
- `TrimProfile.handlesRedwood` is a one-off boolean. Replace it with
  `source.minimumToolTier`.
- `SPECIES_YIELD` is a fixed primary/secondary/variety shape. Replace it with a
  weighted yield table plus conditions such as flourishing-only.
- `obtaining.ts` hardcodes where trimmed species live (redwood forest; other
  trees clearing/forest/meadow). Derive habitats from renewable source data.

### 5. Recipe graph and Thing Maker

- Keep resource-kind recipe outputs; the live `bound-lumber` path proves
  multi-step inventory works.
- Add tags/one-of ingredient matching, maker capabilities, graph validation,
  and recursive ancestors/descendants for “how to make” and “used in.”
- Keep exact-resource ingredients for regional identity and tags for convenient
  bulk/binder slots.
- Decide consumption order for tag ingredients explicitly; never let object-key
  order choose which cherished rare wood gets spent.
- The Thing Maker needs a path view and selected ingredient confirmation once
  recipes can consume interchangeable families.

### 6. Building and structural rules

- `BUILD_MATERIAL_OPTIONS` is currently a list of renderer texture keys, not
  owned resources. Replace it with catalog-derived eligible materials/colorways.
- Current build assembly steps have empty `materials`; add material slots and
  costs before structural classes affect play.
- Save stable resource/colorway ids on placed pieces. Keep a migration from old
  `MaterialKey`-only pieces so existing builds render identically.
- Start with minimum structural class per blueprint. Defer physics-like support
  graphs until multi-story freeform building actually needs them.

### 7. Reference, scrapbook, critters, and generated docs

- Extend `reference.ts` with acquisition pools, affinities, processing stage,
  structural class, recipe ancestors/descendants, source regrowth, and art
  readiness—all derived.
- Generate the crust chart, refinement tree, and artwork checklist from the
  reference snapshot. Do not hand-maintain the final versions of these tables.
- Add catalog-backed conversation placeholders for recipe ingredients, best
  biome, depth/tool, refinement path, and structural uses.
- Let critters express uncertainty/personality in authored prose while every
  factual noun and number is substituted from the reference.

### 8. Validation and tests

Add catalog tests for:

- every resource has identity, stage, tags, status, and presentation;
- every obtainable raw resource has at least one real route;
- each dig layer has a nonempty shared pool and every affinity points into it;
- normalized weights are positive and deterministic;
- every renewable art variant maps to exactly one source;
- every recipe input/output exists and the graph is acyclic;
- output stage never decreases along a recipe edge;
- every structural blueprint slot has at least one obtainable eligible material;
- every ready resource has usable artwork or an explicit approved fallback;
- generated reference facts match simulation results.

## Suggested implementation order (later)

1. Settle the source-first raw labels and the three surface layer pools.
2. Reorganize resource tile sources and add generated loose variants/manifest
   records without changing gameplay behavior. — ◐ art foundation done
   2026-09-04
3. Add the unified material metadata and validation. — ✅ done 2026-09-05
4. Change dig results to soil plus find, including save migration.
5. Generalize trees into renewable sources; make shrubs and cacti harvestable.
6. Add the first complete wood/fiber/brick recipe chains and graph reference.
7. Connect build material slots to inventory and structural classes.
8. Generate the public charts, expand critter placeholders, and reuse extraction
   for caves.

## Decisions still needed before implementation

1. Is one generic Paper Soil stack preferable, or should fill color remember a
   source soil variety?
2. Are Pine and both tougher cactus species scissors tier 2, or should
   cacti remain tier 1 because they are common in the starter-accessible dunes?
3. Should the generic leafy source display simply as “Leafy tree,” or get a
   proper species name once its final tile/pattern is selected?
4. Should a biome favorite be roughly 2.5×, or should a guaranteed pity rule
   ensure a targeted material within a small number of digs?
5. Do material colorways stay cosmetic, or can a pattern itself ever become a
   recipe ingredient/rarity?
6. Does multi-story construction begin as a simple minimum-class gate, or is a
   visible support/load system essential to the first version?
7. **Raised 2026-09-05 by the metadata pass:** is `sunbaked-cardboard` a raw
   stage-0 find, or a prepared/formed board? It is currently catalogued as
   stage 0 tagged `board`, because the world hands it to you directly and the
   validation holds every world-found material to stage 0. If cardboard is
   meant to read as *made* rather than *found*, its obtain route has to change
   at the same time as its stage — the two cannot disagree any more.
