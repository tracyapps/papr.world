# Tool and Supply Progression

## Design Goal

Progression should reveal new layers of the paper world rather than make the
player numerically powerful. A better tool opens a new verb, depth, material,
shape, or crafting possibility. It should never make the player's earlier
materials or favorite homemade tool meaningless.

The central loop is:

```text
gather loose materials
  → make a first tool
  → reach a new landscape layer
  → gather regional and unusual materials
  → improve the Thing Maker, tools, and buildings
  → reach deeper layers and new shops
```

## Ground Rules

1. Tools do not permanently break. A flimsy tool remains useful for the jobs it
   was built to do. Better tools add access, yield, and expressive options.
2. Common materials never become trash. Advanced recipes still use ordinary
   sticks, fiber, stone, and card as handles, binding, packing, or structure.
3. Rare means place-specific or tool-gated, not a punishing random drop rate.
4. Harvested landscapes visibly respond, then always recover.
5. A player should always have several useful things to do while one patch or
   tree is resting.
6. Most recipes accept a material family plus quantity; a few signature parts
   ask for a specific variety. This preserves both convenience and regional
   identity.

## Material Access Layers

The access layer is separate from visual rarity. A strange purple pebble can be
common in one region, while ordinary-looking vellum clay may require a deep dig.

### Layer 0 — Loose and Fallen

Collected by hand from visible ground piles. These materials bootstrap every
player and never require equipment.

- Kraft-paper twigs
- Bluefold pebbles
- Mossy paper fiber
- Confetti stones
- Fallen local sticks and leaves
- Loose cardboard scraps

Main uses: first tool handles, bindings, starter decorations, basic walls, and
Thing Maker level-one recipes.

### Layer 1 — Shallow and Trimmable

Reached with a first folded tool: a Flimsy Shovel or Snippy Scissors.

- Carbon soil
- Graph-paper gravel
- Ochre paperclay
- Cork sticks
- Bubbletree sticks
- Crepegrass fiber
- Corrugated bark

Main uses: sturdier tools, garden beds, dyes, surface finishes, windows, fences,
and the first Thing Maker improvement.

### Layer 2 — Compact and Structural

Reached with a reinforced tool. Deposits require a deliberate dig patch, and
trees can offer larger branches or bark without being felled.

- Graphite cardstone
- Tissue geodes
- Foil flint
- Marblewrap pebbles
- Plaidpine splinters
- Redwood strips
- Vellum reeds
- Honeycomb card

Main uses: structural lumber, reinforced building pieces, moving parts, better
tools, and precision Thing Maker parts.

### Layer 3 — Deep and Peculiar

Reached with a precision tool and usually tied to a distinctive landmark,
biome, animal request, or visible seam. These should feel discovered rather
than farmed.

- Carbon-copy shale
- Iridescent tissue crystal
- Foil-vein cardstone
- Ribbonroot cores
- Pressed flower paper
- Ancient newsprint layers
- Region-specific patterned heartwood

Main uses: signature architecture, animated decorations, unusual tools,
high-level Thing Maker modules, and memorable shop commissions.

## Tool Families

Tools have a **verb** and a **tier**. The visual form can come from a plan or a
player drawing. A moon-shaped blade and traditional scissors may both perform
the `trim` verb if assigned to the same tool template.

### Digging — `dig`

| Tier | Working name | Access | Player-facing difference |
| --- | --- | --- | --- |
| 0 | Hands | loose surface finds | Pick up exposed pieces only. |
| 1 | Flimsy Shovel | shallow patches | Opens folded soil flaps and shallow pockets. |
| 2 | Not-So-Flimsy Shovel | compact seams | Digs deeper, yields more, and reveals two-layer patches. |
| 3 | Deepfold Spade | peculiar deposits | Reaches landmark seams and preserves delicate finds. |

The Flimsy Shovel should not break. “Flimsy” describes its folded-paper reach,
not a durability chore. It can always work Layer 1 patches after higher tools
exist.

### Tree Gathering — `trim`

| Tier | Working name | Access | Player-facing difference |
| --- | --- | --- | --- |
| 0 | Hands | fallen twigs and leaves | Collect what the tree has already shed. |
| 1 | Kid's Scissors | shoots and small branches | Trims renewable stick and fiber growth. |
| 2 | Sturdy Scissors | bark curls and structural branches | Collects regional wood and better branch bundles. |
| 3 | Professional Shears | rare canopy and heartwood offerings | Makes precise cuts that preserve special patterns. |

Scissors replace the conventional saw fantasy. Trees are never killed for
lumber. Raw branches go to the woodchuck's giant school paper cutter, where they
become planks, strips, shingles, dowels, and decorative edging.

### The Verb Set

Declared in `ToolVerb` (`sim/catalogs/tools.ts`) so the catalog can grow without
widening the type under pressure. Only `dig`, `plant`, and `trim` are
implemented.

| Verb | Tool | What it does to the world | Status |
| --- | --- | --- | --- |
| `dig` | shovels | Opens soil, reveals geology layers | Built |
| `plant` | garden hoe | Sows, tends, lifts, refills, levels ground | Built |
| `trim` | scissors | Cuts renewable growth from trees | Built |
| `harvest` | *tbd* | Gathers food once fully grown | Declared |
| `mine` | pickaxes, multi-tier | Takes rock from cave walls and formations | Declared |
| `build` | *tbd* | Turns materials into structures and vehicles | Declared |
| `affix` | tape, glue, fiber | Assembles clothing, decoration, curtains, flags | Declared |
| `disassemble` | *tbd* | Returns a built or mended item to its materials | Declared |

**Why `harvest` is separate from `plant`.** Gathering food currently falls under
`plant`, and should not stay there. Sowing edits a bed; gathering empties one.
They are different interactions with different tools, and gardening is expected
to grow enough that the split will be needed. Splitting it later means
retagging every garden action; splitting the *type* now costs nothing.

**Why `build` and `disassemble` are a pair.** Anything assembled can be taken
back apart for its materials. Building without disassembly makes every
placement permanent and every mistake a loss — which is the opposite of a game
where you can always fill a hole back in.

`build` covers structures — walls, roofs, stairs, decks — and transportation:
boats, skateboards, scooters. (Jet packs remain aspirational.)

#### Possible, undecided

- `mix` / `cook` — food, smoothies, charcuterie boards, snacks for having
  friends over. Wants a party to be worth catering, so it wants multiplayer.
- `paint` — walls, murals, canvases for the future player art shows. Open
  question: whether this splits into *decorate* (applying a finish) and *art
  creation* (making an original). Those are different enough that one verb may
  be doing two jobs. See the mural rules in `mining-and-caves.md`, which already
  need a "this surface is canvas, not material" distinction.

Do not create a new tool family merely to add another inventory slot. Each verb
needs a distinct world interaction.

## Renewable Tree Model

Each harvestable tree has a small amount of **growth** rather than hit points.
Trimming consumes growth; time restores it. The tree is never destroyed.

Suggested stages:

| Stage | Growth | Visual response | Available harvest |
| --- | ---: | --- | --- |
| Flourishing | 75–100% | Full silhouette and canopy flutter | Best yield; chance for regional variety |
| Trimmed | 40–74% | A few outer branches tuck away | Normal small-stick and fiber yield |
| Cropped | 1–39% | Narrower/lower canopy, visible new buds | Small yield only |
| Resting | 0% | Trunk and a few folded buds remain | No harvest; friendly “growing back” response |

Prototype visuals can scale the cutout gently from its bottom pivot and add bud
pieces. Long term, tall trees—especially redwoods—should keep a stable trunk and
swap or hide separate canopy layers. Shrinking a whole redwood would make its
trunk feel rubbery.

Timing should be tuned for play sessions, not real-world obligation:

- Prototype: one growth step every 60–120 seconds; full recovery in 4–8 minutes.
- Later cozy balance: visible new growth within a few minutes and full recovery
  in roughly 15–30 minutes, including catch-up while the page is unloaded.
- No watering streaks, daily penalties, or paid speed-ups.

Persist `growth`, `lastGrowthAt`, and the tree's stage. Recalculate growth from
elapsed time when its page loads rather than running timers for every hidden
tree.

For multiplayer, use a hybrid rule: the shared tree stage changes visibly for
everyone, but each player has a short personal harvest allowance. This prevents
one fast player from leaving every newcomer an empty forest while preserving a
world that visibly reacts.

## Anywhere Digging and Persistent Ground

The player can attempt to dig on almost any exposed terrain. Marked seams,
crumpled mounds, and animal hints still matter because they advertise unusually
good locations, but they are bonuses rather than the only valid dig targets.

Digging is a small terrain-editing action, not a respawning resource-node click.
Each action creates or deepens a shallow, irregular paper depression. Bare dug
ground does **not** automatically return to normal. It remains part of the local
landscape until the player plants it.

### Spatial Model

The world is divided into small invisible dig cells (`TERRAIN_CELL_SIZE`,
currently 0.5 units). The pointer can target anywhere; the result snaps softly
to the nearest cell, giving every location a stable save id while still
feeling like free digging rather than a visible grid.

**Scoops are meant to overlap.** The scoop radius (0.85 × cell size) is much
larger than half a cell, so adjacent digs merge into one continuous worked
bed. Two rules make that work:

1. **Depth takes the maximum of overlapping edits, never the sum.** Summing
   compounds every overlap, so a tidy row of holes excavates a trench several
   times deeper than any single dig.
2. **The depth profile has a flat floor, not a cone.** `digInfluence()` holds
   full depth to half the radius then smoothsteps to zero. A peaked falloff
   leaves the midpoint between adjacent scoops barely dug, so a row reads as
   separate dimples with unturned ridges between them.

Both are covered by tests in `src/sim/commands.test.ts` — they were written
after a first attempt shipped tests that passed with the bugs still present.

Scale reference: one Tier 1 scoop is ~0.85 units across and 0.13 deep. The
earlier 1.25-unit lattice made a single dig a 1.45-unit crater, nearly as wide
as the avatar is tall.

### Planting Spacing

Each seed declares a `spacing` radius in `SEED_DEFS`. Planting is refused when
two plants' spacing circles overlap, checked against the **larger** of the two
requirements so a sprawling plant keeps its distance from tidy neighbours too.

This is what gives gardening a natural shape instead of a uniform grid:

| Seed | Spacing | Effect |
| --- | ---: | --- |
| Buttonbloom | 0.85 | Needs elbow room — at least two cells between blooms |
| Mend-me | 0.30 | Groundcover — sows edge to edge in an unbroken row |

Because the lattice is 0.5, spacing under ~0.5 means "plantable in every
adjacent dug cell". Crowded beds fail the pointer hit-test, so the cursor
shows the refusal before the click rather than after it.

A cell can contain layers:

1. Surface: the original ground and any visible loose material.
2. Shallow: opened by a Tier 1 shovel.
3. Compact: opened by a Tier 2 shovel by revisiting the same depression.
4. Deep seam: opened by a Tier 3 shovel if the location's deterministic geology
   contains one.

The same coordinate always contains the same material layers. Leaving and
returning—or reloading the game—must never reroll a disappointing hole into a
better one.

### Hills and Yield

Every valid ground cell yields something useful, usually soil, loose card, or a
small regional material. Hills are richer because their folded layers expose
more material:

- Flat ground: baseline quantity and mostly soil/fiber/card.
- Hill slope: approximately 1.25–1.5× yield and a better stone/cardstone table.
- Hill crest or authored seam: approximately 1.5–1.75× yield and an improved
  chance of regional or unusual material.
- Special landmark seam: authored contents, still accessed by the appropriate
  shovel tier.

These numbers are starting points, not promises. Hills should feel rewarding
without making flat-ground digging pointless. Biome determines *what* can be
found; hill influence and tool tier determine quantity and depth.

### What Can Be Dug

A dig action needs an exposed terrain footprint and must be within tool reach.
It is blocked when its circular footprint overlaps:

- A tree's root area
- Houses, shops, the Thing Maker, and other buildings
- Placed building pieces or decorations with a ground footprint
- Signs, machines, bridges, water, and authored landmarks
- Another active dig cell that is too close to merge cleanly

Critters and players are temporary blockers only while standing on the target;
they do not permanently reserve the ground. Loose harvestables can either be
picked up first or give a “something is already lying here” response.

The minimap feature registry is not precise enough for this rule. Digging and
building should share a dedicated **world footprint registry** with real circle
or rotated-rectangle bounds and interaction padding. The constraint is
reciprocal: a player cannot dig beneath an existing object, and cannot later
place an ordinary object across a depression unless that build piece explicitly
supports uneven ground, foundations, or stilts.

### Tool Responsibilities (implemented)

The shovel takes ground apart; the hoe puts it back together.

| Tool | Verb | Owns |
| --- | --- | --- |
| Flimsy Shovel | `dig` | Opening new soil, revealing geology layers |
| Basic Garden Hoe | `plant` | Sowing, lifting plants, refilling holes, leveling earth (for flat building surface) |

The hoe's action at a cell is resolved by a single pure query
(`game/gardenActions.ts`) that the preview overlay, the cursor, and the click
handler all read. Anything that needs to know "can I do this here?" must go
through it — separate validity checks are how a cursor ends up promising
something the click refuses.

Which action fires depends on what is held: a selected seed sows, empty hands
rake the hole closed. A cell with something growing is always a lift.

### Growth Stages (implemented)

Garden plants pass through `seeded → sprout → bud → bloom`, each a distinct
silhouette. Stage is **derived from elapsed time since `plantedAt`**, never
stored — no save field, no ticking while unloaded, and deterministic across
clients. Only a plant in full bloom sets seed.

Seeds declare `stageSeconds` (cumulative) alongside `spacing`.

### Lifting and Refilling (implemented)

- Lifting returns the **seed** at seeded/sprout and the **plant** at
  bud/bloom, plus any seed already dropped beside it. The bed survives.
- Refilling is free at or below `FREE_REFILL_DEPTH` (a tier-1 scoop) and
  costs paper soil beyond it, spending the most plentiful variety first.
  This is the promised cut-and-fill conservation rule in its first form.

### Planting and Ground Recovery

An empty depression persists as exposed low-profile soil. Planting changes it
from a scar into a purposeful bed:

1. Planting a normal seed changes the cell to `planted` and grows a plant from
   the depression. The paper soil rises slightly with its roots but remains a
   reusable, recognizable garden bed after harvest.
2. Planting a groundcover or “mending” seed gradually restores the original
   terrain profile completely. This is the intentional erase/repair action.
3. Deep cells take longer or require more than one seed stage to mend, giving
   depth a visual consequence without creating a permanent mistake.

There is no automatic dirt regrowth timer. The player's planting choice changes
the landscape, which makes gardening, digging, and settlement design part of the
same creative system.

### Rendering and Simulation

The current terrain sampler can already add negative height patches, but the
renderer places sculpted hills above a separate flat ground sheet. A true hole
would be hidden by that sheet. Before implementing digging, each page needs a
single subdivided/deformable surface (or equivalent clipped topology) driven by:

```text
authored/generated base terrain
  + persistent player terrain edits
  = final sampled and rendered height
```

Avatar movement, critter feet, tree/build placement, camera floor protection,
and the visible mesh must all sample that same final height. Dynamic edits live
in a separate page-modification store; generated `PageData` remains immutable.

Dig animations can then push a ring of vertices downward, lift a torn rim, and
reveal a region-colored soil layer. Plant growth gradually relaxes those
vertices toward either the garden-bed profile or the original surface.

## Recipes and Material Choice

Recipes should combine broad and exact requirements:

```text
Flimsy Shovel
  4 × any Sticks
  3 × any Fiber
  2 × any Cardboard

Not-So-Flimsy Shovel
  6 × any Sticks
  4 × any Fiber
  3 × Graphite Cardstone
  1 × Corrugated Bark
```

When a recipe says “any Sticks,” the scrapbook/Thing Maker lets the player choose
which varieties to spend. This gives plentiful materials a purpose and lets a
player preserve a favorite rare pattern. Exact ingredients should be reserved
for the part of a recipe whose identity matters.

A healthy advanced recipe is roughly:

- 50–65% common family materials
- 20–35% regional materials
- 5–15% distinctive or deep materials

## Terraforming as Progression

Digging, planting, and building should share one flexible terrain canvas. Tool
progression changes not only which materials the player can reach, but how much
of the landscape they can intentionally reshape.

### Terrain Tool Capabilities

| Tier | Terrain capability | Building opportunity |
| --- | --- | --- |
| 0 | Read the slope and use naturally flat ground | Tiny structures, tents, and objects with forgiving footprints |
| 1 | Dig individual beds and shallow depressions | Gardens, little foundations, stepping paths, and small retaining edges |
| 2 | Cut and fill connected cells; make short terraces | Medium houses, patios, hillside rooms, stairs, and layered gardens |
| 3 | Grade a larger selected footprint with precision | Large houses, courtyards, shop sites, bridges, and neighborhood projects |

The progression should not imply that hills are mistakes waiting to be flattened.
Players always have alternatives:

- Find naturally level ground.
- Build a smaller footprint that fits the slope.
- Use stilts, piers, stairs, or a stepped foundation.
- Cut a terrace into the hill.
- Move soil from a cut area to fill a nearby low area.
- Preserve the hill and make it the building's defining feature.

### Cut, Fill, and Soil

Terraforming should conserve material in a readable, forgiving way:

- Digging produces regional soil/card fill in the scrapbook.
- Raising or repairing terrain consumes compatible fill.
- Plant roots can slowly lift a dug cell without requiring fill.
- Precision tools reduce waste or let one unit of fill affect a slightly larger
  area; they do not create land from nothing.

This creates useful reasons to dig even after a resource has been discovered.
Soil from a hill excavation might become a garden terrace or the foundation for
a new room.

### Building Fit

Every build footprint samples the terrain beneath it. Plans declare how much
height variation they tolerate:

- Flexible decorations and tiny objects tolerate almost any surface.
- Ordinary floors require a modestly level footprint.
- Stilted, stepped, or foundation pieces intentionally tolerate slopes.
- Large rooms require either naturally suitable land or better grading tools.

The placement preview should show the high and low corners with a paper outline,
then explain the available choices: “Needs a flatter patch,” “Add two piers,” or
“Grade with a Tier 2 shovel.” This makes a larger house a player-created project,
not an arbitrary level gate.

## The Never-Empty Horizon

There should nearly always be another appealing possibility, but not an urgent
obligation. The game offers parallel goal horizons instead of one mandatory
quest chain.

### Five-Minute Possibilities

- Gather the last few fibers for a recipe.
- Dig one promising hill cell.
- Plant or mend one depression.
- Speak to a nearby animal.
- Add a trim, sign, flower, or window to a build.

### One-Session Projects

- Craft or improve a tool.
- Complete a shop work order.
- Terrace a small hillside garden.
- Process a regional wood into a new building finish.
- Add a room, porch, path, or workshop corner.
- Follow a material clue into another landscape.

### Long-Horizon Creations

- Shape a home site for a large house.
- Collect every regional variation of a material family.
- Fully improve the Thing Maker.
- Befriend a shopkeeper and finish their conversation arc.
- Restore, garden, or build across an entire neighborhood page.
- Collaborate on a bridge, public garden, market, or animal sanctuary.

The scrapbook can surface these as **possibilities** or pinned personal projects,
not quests with deadlines. Players should be able to write or name their own
goal—“house on the red hill,” “all seven redwoods,” “purple stone kitchen”—and
attach materials, places, plans, and screenshots to it.

New progression should favor lateral expression: a different pattern, building
method, plant, region, conversation, or service. Avoid endlessly increasing
quantities merely to manufacture a longer grind.

## Thing Maker Progression

The Thing Maker is the main complexity gate. A plan may be **learned** earlier
(`knowledge-tree.md` — every non-starter plan comes from the knowledge tree and
nowhere else), but the machine needs suitable modules before it can fold the
result accurately.

### Level 1 — Hand Crank

- Makes Tier 1 tools and basic build pieces.
- Accepts loose/fallen materials.
- Existing personality: enthusiastic, slightly improvised.

### Level 2 — True Rollers

- Makes Tier 2 tools and structural pieces.
- Unlocks material-family substitution in larger recipes.
- Suggested upgrade: common sticks/fiber/card plus Corrugated Bark, Graphite
  Cardstone, and a salvaged roller from the crow.

### Level 3 — Precision Creaser

- Makes Tier 3 tools, moving decorations, and patterned architectural parts.
- Suggested upgrade: refined lumber from the woodchuck, a deep stone bearing,
  Ribbonroot binding, and a rare alignment piece from an animal request.

### Level 4 — Neighborhood Press (later)

- Produces shared/public build pieces and copies player-made templates.
- This is a community milestone, not a solo-stat grind.

Maker upgrades should visibly attach new rollers, guides, stamps, lights, and
paper labels to the existing machine.

## Animal-Run Shops

Shops should be characters first and vending menus second. Friendship, favors,
local discoveries, and conversation can change their stock or services. Every
shop supports the quiet shiny-chip currency and can also use barter or work
orders; Pip’s shop establishes that shared transaction seam without turning it
into a score.

### Woodchuck Lumber Yard

Working names: **Wouldchuck Yard**, **The Grain & Guillotine**, or **Chuck's Cut
& Crease**.

- Proprietor: a woodchuck, naturally.
- Landmark: an enormous school paper cutter with a ruled cutting bed.
- Service: turns renewable branch bundles into planks, shingles, strips, dowels,
  and patterned trim.
- Sells/trades: finished structural pieces, offcuts, and bark samples. Plans
  are learned in the knowledge tree and are not sold anywhere.
- Requests: bring wood from different tree families, repair the cutter's guide,
  or identify a mysterious patterned branch.

### Crow Junk Yard

Working names: **Crow & Found**, **The Re-Nest**, or **Odds & Caws**.

- Proprietor: a crow who remembers where every shiny oddment came from.
- Landmark: stacked boxes, bent fasteners, foil scraps, buttons, and machine
  parts arranged into precarious collections.
- Service: swaps duplicate/common materials for salvage credit, repairs tool
  fittings, and supplies Thing Maker upgrade components.
- Sells/trades: found oddments, foil, ink tabs, rollers, springs, stamps, and
  rotating one-off decorations.
- Requests: recover labeled junk, sort a collection, or trace an item's former
  owner through conversations.

### Chipmunk Garden Shop — first slice built 2026-08-08

Current name: **Pip’s Seed & Garden**.

- Proprietor: Pip, a striped chipmunk who keeps the good packets sorted behind
  a cork-paper counter.
- Landmark: an open-rafter walk-through greenhouse on the east meadow, with a
  notebook-paper center aisle and two rows of oversized raised planters.
- Service: seeds, plant starts, dyes, fibers, soil blending, and finished garden
  pieces.
- Sells/trades: region-adapted seeds, decorative flowers, food-shaped crafts,
  compost card, and gentle tree-growth helpers.
- Requests: test soil from a new biome, bring unusual fiber, help pollinating
  critters, or design a garden display.

The first playable service sells one of any seed for ₡2 or two paper fibers,
buys every gathered/grown core resource, and puts a purchased seed directly in
the player’s hand. Every stocked seed also derives one full-grown display bed
from the catalog, so adding a plant expands the greenhouse instead of leaving
its prop list behind. Starts, dyes, soil blending, requests, and
friendship-driven stock remain later layers on this same storefront.

### Later Possibilities

- Mole surveyor/excavation desk for geological maps and surveying. Lives
  underground; see `mining-and-caves.md`.
- Beaver bridgeworks for large shared construction projects — and the natural
  seller of boats (`water-and-waterways.md`).
- Sheep yarn shop for binding, weaving, clothing, curtains, and hanging
  decorations. Owns the `affix` verb.
- Magpie gallery for player-made art and rotating community exhibits.
- The owl-itect's studio, which sells and commissions finished furniture,
  clothing, small structures, and decoration. Plans remain in the knowledge
  tree (`plans-and-blueprints.md`).

### Every shop buys as well as sells

Settled 2026-08-04, in `economy.md`. Restated here because it constrains the
shop data shape rather than the economy alone:

- Anything findable, harvestable, or growable can be sold to a shop.
- Every shop needs an explicit **`sells`** list and an explicit **`buys`** list
  from the first implementation, even while both are "everything". Whether
  specialty shops differ from general shops is undecided, and those two fields
  are the difference between tuning it later and restructuring later.
- Markup over buy price is minimal, and prices are comparable shop to shop.
  Nobody should price-shop.

## Required Data Shape

These are design-facing fields; names can change during implementation.

```ts
// Matches sim/catalogs/tools.ts as of 2026-08-04.
type ToolVerb =
  | 'affix' | 'build' | 'dig' | 'disassemble'
  | 'harvest' | 'mine' | 'plant' | 'trim';

type ToolDefinition = {
  id: string;
  verb: ToolVerb;
  tier: 1 | 2 | 3;
  planId: string;
  iconKey: string;
  worldAssetKey: string;
};

type IngredientRequirement =
  | { kind: 'family'; family: ResourceCategoryId; quantity: number }
  | { kind: 'exact'; resource: ResourceId; quantity: number };

type HarvestAccess = {
  verb?: ToolVerb;
  minimumTier: 0 | 1 | 2 | 3;
  layer: 'loose' | 'shallow' | 'compact' | 'deep';
};

type RenewableNodeState = {
  nodeId: string;
  growth: number;
  lastGrowthAt: number;
};

type DigCellState = {
  id: string; // page id + quantized local coordinate
  pageId: string;
  x: number;
  z: number;
  depth: 1 | 2 | 3;
  state: 'dug' | 'planted' | 'mending';
  geologySeed: number;
  plantedSeedId?: string;
  changedAt: number;
};

type WorldFootprint = {
  entityId: string;
  shape: 'circle' | 'rect';
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  rotation?: number;
  blocksDigging: boolean;
  blocksBuilding: boolean;
};
```

Resources should eventually add `accessLayer`, `rarity`, `originTags`, and
`processingTags` beside their current category and icon metadata.

## Implementation Order

### Phase 1 — One Economy

1. Remove the Thing Maker's private prototype inventory.
2. Make recipes consume the same resource inventory shown in the scrapbook.
3. Add material-family recipe requirements and a player choice when several
   varieties qualify.
4. Add scrapbook sections for tools and plans.

### Phase 2 — First Tool Loop

1. Add the Flimsy Shovel plan and persistent equipped-tool state.
2. Add the shared world-footprint registry and validate trees, the house, the
   Thing Maker, and placed objects as digging blockers.
3. Replace flat-plus-hill rendering with a page surface that supports persistent
   negative terrain edits.
4. Allow shallow digging on any exposed cell; tune hills as richer test areas.
5. Add two or three Layer 1 resources and their scrapbook entries.
6. Add one normal seed and one mending seed to prove both persistent garden beds
   and intentional terrain restoration.
7. Use the new resources in the Not-So-Flimsy Shovel recipe.

### Phase 3 — Renewable Trees

1. Add Snippy Scissors and the `trim` interaction.
2. Split one small tree into visual growth stages.
3. Persist growth and offline/page-unloaded recovery.
4. Expand the rule to tree families, then create redwood-specific canopy stages.

### Phase 4 — Thing Maker Upgrade

1. Convert machine level and costs to persistent data.
2. Build the True Rollers upgrade from Layer 1 and one Layer 2 component.
3. Gate Tier 2 recipes by machine capability, not an abstract player level.

### Phase 5 — First Shop Cluster

1. Build the woodchuck lumber service first because it completes the tree-to-
   building loop.
2. Add Crow & Found as the duplicate-material sink and upgrade-parts source.
3. Add Bun & Bloom when planting and dyes have a playable use.
4. Give every proprietor a conversation arc before expanding their inventory.

## First Playable Progression Slice

The smallest useful test is:

1. Pick up loose sticks, fiber, and cardboard.
2. Craft a Flimsy Shovel in the Thing Maker.
3. Dig ordinary ground for Carbon Soil, then try a hill and find a larger yield
   plus Graph-paper Gravel.
4. Craft Snippy Scissors.
5. Trim a renewable Cork Tree and collect Cork Sticks.
6. Bring the sticks to the woodchuck's giant paper cutter for the first plank.
7. Use the plank, soil, and gravel to improve either a building piece or the
   Thing Maker's rollers.

That slice proves gathering, tool access, renewable scenery, processing, a shop
character, building value, and machine progression without requiring the entire
economy first.
