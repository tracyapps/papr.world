# Mining and Caves

Plan only. Nothing here is implemented.

## Why This Is Not Just "Digging, But Sideways"

Digging edits a height field. Caves are a second *space* — a place the player
goes, with its own ground, its own light, and its own contents. That is the
whole difficulty, and it is why this is written down before it is built.

The world is currently a single continuous surface streamed as pages. A cave
needs somewhere the player can be that is not on that surface. Three ways to
do that, in increasing order of cost:

### Option A — Caves are separate page grids (recommended)

An underground page grid parallel to the surface one, addressed the same way
(`px,pz`) but on a different **layer**. Entering a cave is a transition
between layers at a fixed point, not a smooth walk downward.

- `PageCoord` gains a `layer: 'surface' | 'under'`.
- Streaming, page generation, terrain sampling, and the minimap all become
  layer-aware. Most of that is threading one field through code that already
  exists; the risky part is anywhere that assumes a single global height field.
- The camera does not need to handle a ceiling if caves are rendered as an
  enclosed room with its own ground sheet and a dark surround, which suits the
  paper aesthetic: a cave is a **darker sheet of paper with torn edges**.

**Why recommended:** it reuses page streaming, deterministic generation, and
the save shape wholesale. The alternative approaches all end up reimplementing
those.

### Option B — Caves are interiors, like a building

Each cave is a small self-contained scene, unrelated to world coordinates.
Cheaper to build, but tunnels connecting two entrances on opposite sides of a
hill become fiction rather than geometry, and a shared map of the underground
becomes impossible. Rules out the interesting version of this feature.

### Option C — True 3D voxel terrain

Correct in the general case and wildly disproportionate here. Rejected.

## The `mine` Verb

A fourth tool family beside `dig`, `plant`, `trim`.

| Tier | Working name | Access |
| --- | --- | --- |
| 1 | Tin Snips Pick | Loose wall deposits at a cave mouth |
| 2 | Folded Pickaxe | Seams deeper along a tunnel |
| 3 | Creasebreaker | Landmark deposits and new tunnel branches |

Mining targets a **wall face**, not the ground — that is the distinction from
digging, and it is what makes it a separate verb rather than a shovel upgrade.
Wall faces are discrete, deterministic, and regenerate slowly (see below), so
mining is closer to harvesting a renewable node than to terrain editing.

### Tunnel growth

Tier 3 mining can extend a tunnel by one segment into unmined rock. This is
the mining equivalent of terraforming: a player-shaped underground, persisted
per page-layer in the same modification store used for terrain edits.

Guardrails so a shared world stays navigable:

- Extensions snap to a coarse tunnel lattice, so player tunnels look
  deliberate and can be drawn on a map.
- Tunnels cannot break into an authored landmark chamber from the wrong side.
- A tunnel that reaches another tunnel joins it rather than overlapping, the
  same "merge, don't compound" rule that overlapping digs already follow.

## Cave Entrances

Entrances are surface props with a footprint that blocks digging and building,
placed:

- **Authored**, at a handful of landmark hillsides, so the first one a player
  finds is deliberately good.
- **Generated**, seeded per page like everything else, weighted toward pages
  with real hills — an entrance in flat meadow reads as arbitrary.

An entrance shows a torn dark opening and a little spill of the material found
inside it, so the world advertises what is down there before you commit.

## Dependency: the world map

This is the reason mining is planned rather than built. The underground is
only interesting if you can find your way back, and the current map is a
fog-of-war minimap with no notion of layers, no zoomed-out view, and no way to
represent "below". Needed first:

1. A full-page map view (the scrapbook Map tab is the natural home).
2. Layer switching in that view, so the underground can be seen at all.
3. Explored-cell storage keyed by layer as well as coordinate.
4. Landmarks that survive page unload, so a remembered cave mouth stays put.

Saved places already persist and would extend naturally to a `layer` field.

## Suggested Order

1. Full map view in the scrapbook, surface only. Useful on its own.
2. `layer` threaded through page addressing, streaming, and the map.
3. Cave entrances as surface props that transition to an authored test cave.
4. The `mine` verb against wall faces, with tier 1 only.
5. Generated cave pages, then tunnel extension at tier 3.

Steps 1 and 2 are the real work. Everything after is content on top of them.

## Open Questions

- Do critters live underground? A mole surveyor is already noted in
  `tool-and-supply-progression.md` as a future shop.
- Is light a resource (lanterns, glowing paper) or a mood? A cave that needs a
  light source is a different game from one that is simply dimmer.
- Can players build underground, or is it purely extractive?
