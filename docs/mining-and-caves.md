# Mining and Caves

Plan only. Nothing here is implemented. Design settled 2026-08-04.

## Why This Is Not Just "Digging, But Sideways"

Digging edits a height field. Caves are a second *space* — a place the player
goes, with its own ground, its own light, and its own contents. That is the
whole difficulty, and it is why this is written down before it is built.

The world is currently a single continuous surface streamed as pages. A cave
needs somewhere the player can be that is not on that surface.

## Approach: caves are a second page layer — decided

An underground page grid parallel to the surface one, addressed the same way
(`px,pz`) but on a different **layer**. Entering a cave is a transition between
layers at a fixed point, not a smooth walk downward.

- `PageCoord` gains a `layer: 'surface' | 'under'`.
- The underground gets its **own biome set** — chamber and tunnel types — sitting
  alongside the surface biomes rather than replacing them. `Biome` either grows
  or gains a sibling type per layer; that choice is worth making deliberately,
  since every table keyed by biome (dig tables, scatter, dialogue) inherits it.
- Streaming, page generation, terrain sampling, and the minimap all become
  layer-aware. Most of that is threading one field through code that already
  exists; the risky part is anywhere that assumes a single global height field.
- The camera does not need to handle a ceiling if caves are rendered as an
  enclosed room with its own ground sheet and a dark surround, which suits the
  paper aesthetic: a cave is a **darker sheet of paper with torn edges**.

**Why:** it reuses page streaming, deterministic generation, and the save shape
wholesale. The underground is the same expansive map as the surface — that is
the point of it, and the two rejected alternatives both give it up.

The layer is generated as a **combination of open cave areas and connecting
tunnels**, not a uniform warren. See *Shape of the underground* below.

### Rejected

- **Interiors, like a building.** Each cave a small self-contained scene,
  unrelated to world coordinates. Cheaper, but a tunnel joining two entrances
  on opposite sides of a hill becomes fiction rather than geometry, and a
  shared map of the underground becomes impossible. Rules out the interesting
  version of the feature.
- **True 3D voxel terrain.** Correct in the general case, wildly
  disproportionate here.

## Shape of the underground

**Caves and tunnels are biomes.** That is the whole mental model, and it is the
one that should drive implementation: walking underground is walking through
the world, with different biomes, exactly as walking above ground is. Not a
dungeon, not a level, not a minigame — the same kind of place, on a different
sheet of paper.

Two consequences worth stating plainly, because they are budget decisions:

- **The underground is as expansive as the surface.** Not a handful of caves
  attached to the world; a second full map. Chamber types are biomes with their
  own rock, their own materials, their own residents.
- **It is a world subway system.** Tunnels are the lines, chambers are the
  stations, entrances are the station mouths. That is why entrances get
  subway-style signage, why tunnels always connect and never dead-end, and why
  the carved wall directions read as transit signage rather than as
  breadcrumbs.

The subway metaphor is doing real design work: it explains at a glance why the
underground is navigable-by-design rather than maze-like, and it means a player
who understands the surface already understands this.

The underground is **authored-feeling, not maze-like**. It exists already,
generated the same way biomes are; the player discovers it rather than carving
it.

- **Tunnels always connect.** No mazes, no dead ends, no small confusing
  passages. A tunnel goes somewhere.
- **Tunnels open into chambers.** The rhythm is passage → space → passage: a
  tunnel opening into a small or cathedral-sized chamber, each with its own
  rock patterns and rock types, then on to the next. Variety lives in the
  chambers.
- **Always well lit.** See *Light* below. This is a friendly, cozy underground,
  not a dark or scary one.
- **Wayfinding is carved into the walls.** Where the surface has signposts, the
  underground has directions carved along the tunnel walls — same information,
  same distances, native material.

## The `mine` Verb

A fourth tool family beside `dig`, `plant`, `trim`. Declared in `ToolVerb`;
nothing implemented.

| Tier | Working name | Access |
| --- | --- | --- |
| 1 | Tin Snips Pick | Rock formations — the soft, renewable ones |
| 2 | Folded Pickaxe | Wall seams, and the rarer materials in them |
| 3 | Creasebreaker | Landmark deposits and the hardest wall material |

Mining targets a **wall face or a formation**, not the ground — that is the
distinction from digging, and what makes it a separate verb rather than a
shovel upgrade.

### What can and cannot be mined

| Surface | Minable? | Behaviour |
| --- | --- | --- |
| Rock formations (stalagmites, stalactites) | Yes, tier 1 | **Renewable — behave like trees.** Softest thing down here, regrow over time, accessible from the very first pick. |
| Tunnel and chamber walls | Yes, tier 2+ | Harder, hold the **rarer materials**. Mining barely changes the wall's shape. |
| Walls carrying carved wayfinding or player murals | **No** | Never change shape, never lose their carving or artwork. |
| Cave floors | **No** | Too tough to mine. |
| Glowing ceiling stone | **No** | Protected so the lights cannot be accidentally mined out. |

**Formations are the everyday loop; walls are the reward loop.** Formations
regrow, so a player who only ever wants rocks has a renewable supply from tier
1 and never needs to strip a chamber. Walls are where progression lives.

**Mining does not reshape space.** Unlike digging, taking material from a wall
leaves the wall essentially where it was — possibly a very slight change with
the highest-tier tool, undecided. This is deliberate: the underground stays
navigable, the carved directions stay meaningful, and a shared map stays
accurate. It also means **tunnel extension is not part of this design** — an
earlier draft proposed tier-3 tunnel digging, and the pre-authored,
always-connected underground replaces it. If player-carved tunnels ever come
back, they come back as a separate feature with its own guardrails, not as a
side effect of the mine verb.

## Light

**No dark caves.** Light is atmosphere and generosity, not a resource to
manage. There is never a moment where a player cannot see because they failed
to prepare.

Sources, all present rather than earned:

- **Lanterns already installed** along tunnels, flickering very gently.
- **Glowing stone**, including on chamber ceilings where it cannot be mined.
- **Light-emitting critters** — lightning bugs are the obvious one.
- **Mining helmets with lights** worn by the ground-dwelling critters, which
  doubles as characterisation.

Later, as a clothing item: **your own helmet with a light on it**, shining any
colour you choose — or cycling the rainbow like an LED strip. This belongs to
the clothing/plans system rather than to mining, and is a want rather than a
need precisely because the caves are already lit.

## Underground residents

Critters live down here. Confirmed: **moles** (the surveyor shop noted in
`tool-and-supply-progression.md`), **friendly bats**, and **lightning bugs**.

**No spiders.**

## Building underground

Players can build down here, not just extract. Confirmed uses:

- Structures and furniture, the same as on the surface.
- **Gardens** — mushrooms, and possibly crystals.
- **Benches** and other placed comforts.
- **Murals painted on walls.**

Murals need a rule to be safe: some wall surfaces are **designated
un-minable** and are the only ones that can be painted or drawn on. Nobody
should be able to mine away another player's artwork. This is the same
protection the carved wayfinding walls need, so it is one mechanism serving
two purposes: a wall is either *material* or *canvas*, never both.

## Cave Entrances

Entrances are **subway entrances**, essentially — a deliberate, legible way in,
with the underground's equivalent of a subway sign readable from a distance.
They are surface props with a footprint that blocks digging and building.

They appear:

- **Authored**, at a handful of landmark hillsides, so the first one a player
  finds is deliberately good.
- **Generated**, seeded per page like everything else, weighted toward pages
  with real hills — an entrance in flat meadow reads as arbitrary.

Entrances are **marked on the map, both above ground and below**, and appear in
surface signposts and underground wall carvings alike. Getting to a cave, and
getting back out to the right place, should never be a puzzle.

## Dependency: the world map

This is the reason mining is planned rather than built. The underground is only
interesting if you can find your way around it, and the current map is a
fog-of-war minimap with no notion of layers, no zoomed-out view, and no way to
represent "below".

**The map interface is owner design work in progress (as of 2026-08-04), and
this whole feature waits on it.** What the map will need to support:

1. A full-page map view (the scrapbook Map tab is the natural home).
2. Layer switching, so the underground can be seen at all.
3. Explored-cell storage keyed by layer as well as coordinate.
4. Landmarks that survive page unload, so a remembered cave mouth stays put.
5. Cave entrances as first-class map markers on both layers.

Saved places already persist and would extend naturally to a `layer` field.

## Suggested Order

1. Full map view in the scrapbook, surface only. Useful on its own. *(Waits on
   the owner's map interface design.)*
2. `layer` threaded through page addressing, streaming, and the map.
3. Cave entrances as surface props that transition to an authored test cave —
   one chamber, one tunnel, lit, with a carved sign.
4. The `mine` verb against rock formations at tier 1, with regrowth reusing the
   tree-growth model.
5. Wall mining at tier 2, and the rarer material tables behind it.
6. Generated cave pages: the chamber-and-tunnel rhythm at scale.
7. Underground building, gardens, and mural surfaces.

Steps 1 and 2 are the real work. Everything after is content on top of them.

## Still open

- Whether the highest-tier tool changes wall shape *very slightly*, or not at
  all. Not at all is safer for the shared map.
- Whether mushrooms and crystals are one garden system or two.
- How chamber rock-type variety is authored versus generated.
