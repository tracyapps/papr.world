# Water and Waterways

Shallow water is implemented. Rivers, lakes, boats, and water critters are
planned here.

## What Exists

`src/world/water.ts` owns a registry of water bodies and one query,
`submersionAt(x, z)` → 0..1. Everything else reads that:

- **Rendering:** a darker bed sheet sunk into the terrain plus a translucent
  drifting surface. You see the bed through the water, which is what makes
  paper read as water rather than as blue paper.
- **Wading:** movement slows toward `WADE_SPEED_FLOOR`, the avatar sinks and
  its walk bob flattens, and ripple rings spread from the feet while moving.
- **Digging:** water registers a footprint, so you cannot dig a pond.

**Water is a kind, not a colour.** The world generator scatters `paper.blue`
as ordinary decoration alongside plaid and bubble prints. If blue paper meant
water, every decorative scrap would have become a pond and blue would have
left the palette. A patch is water only when authored or generated as
`kind: 'water'`.

The clearing's pond is the reference body.

## Rules for Anything New

Three bugs in the first water pass all had the same shape — something in the
world did not know the water was there. The rules that came out of it:

1. **Register water before placing anything.** `registerPageWater` runs as a
   page pre-pass. Water created mid-build is invisible to everything placed
   before it, which is how a stone cluster ended up floating on the pond.
2. **Anything positioned on the ground must ask.** Props, harvestables, and
   critter spawns all consult `isInWater` / `nudgeOutOfWater`. Generators work
   from seeded coordinates that know nothing about ponds, so the check belongs
   at placement, not in each generator.
3. **Land critters avoid water, but stand in it if caught.** Avoidance is in
   `pickWanderTarget`; the sink is in `settleOnGround`. Standing *on* the
   surface reads as a bug, not as confidence.
4. **Build water geometry in local space.** Writing world coordinates into
   vertices and cancelling them with a negative local offset breaks the moment
   the parent is rotated or scaled — and the pond's cozy click reaction scales
   it.

## The Extension Rule

Anything that can answer `submersionAt` gets wading, ripples, and later boats
for free. New water shapes should be new *shapes in the registry*, not new
systems. Concretely, `WaterBody` needs to grow from a rotated ellipse into a
small union of shapes:

```ts
type WaterShape =
  | { kind: 'pool'; x: number; z: number; halfWidth: number; halfDepth: number; rotationY: number }
  | { kind: 'channel'; points: Array<[number, number]>; width: number }   // rivers
  | { kind: 'basin'; polygon: Array<[number, number]> };                  // lakes
```

`submersionAt` becomes a max over shapes — the same "take the deepest, never
the sum" rule that overlapping digs follow, and for the same reason: a river
meeting a lake is one body of water, not double depth.

## Rivers

A river is a channel: a polyline with a width and a depth profile that is
deepest along the centre line.

The hard part is not the shape, it is **continuity across pages**. Pages
generate independently from their coordinates, so a river must be derivable
from page coordinates alone or it will not line up at the seam. Two options:

1. **Deterministic global flow field.** A low-frequency noise function over
   the whole world defines drainage; a page generates the river segment
   crossing it by sampling that field. Rivers connect because they are all
   reading the same function, not because pages negotiate.
2. **Authored river corridors.** Rivers only exist on authored pages, hand
   placed. Simpler and prettier, but the world stops feeling continuous.

Option 1 is the right foundation and is roughly the same technique already
used for biome and geology determinism.

Rivers should also *flow*: a current direction per point, which drifts the
surface texture and later pushes boats and floating objects. That single field
is what makes a river feel unlike a long thin pond.

## Lakes

Basins large enough that the far shore is a horizon element. Two new problems:

- **Deep water.** Beyond wading depth the avatar should swim or be refused
  entry. Cozy answer: you can always wade, and deep water is where a boat
  becomes necessary rather than where you drown. No drowning in this game.
- **Reflection.** A cheap paper-appropriate trick — a flipped, faded, slightly
  offset copy of nearby cutouts — would sell a lake more than any shader.

## Boats

A boat is a placed entity you stand on, which makes it the first thing in the
game that moves the player without their feet on terrain. Prerequisites:

- Placed-entity persistence (`placedEntities` in the page modification store
  is still an empty placeholder).
- The avatar's ground sampling has to accept a platform height instead of
  always reading the terrain field.

That second point is the real cost, and it is shared with any future
building-you-can-stand-on. Worth doing once, properly.

Paper boats are the obvious form. Folded newspaper, slightly soggy at the
edges. They should ship water very gently and need occasional bailing, which
is a chore only if it has a deadline — so it should not have one.

## Fish, Frogs, and Water Critters

The critter system already supports species with their own rigs, idle actions,
and friendship, and `CritterRig.flying` shows how a different locomotion mode
slots in. Water critters need a third mode beside walking and flying:

- **Fish** stay entirely within a body: bounded wander inside `submersionAt`,
  visible as a shadow and a flick of paper near the surface. They should
  scatter when you wade in and drift back when you hold still — the first
  critter whose reaction to you is *retreat*, which makes stillness a skill.
- **Frogs** are amphibious and the more interesting design: they use the
  existing hopper gait on land and switch to swimming at the shoreline. They
  belong to the pond as a *place* rather than to land or water alone.

Both want a `habitat` field on species so spawning can ask the water registry
where they can live, rather than each species hardcoding its own test.

## Suggested Order

1. Generalise `WaterBody` to a shape union; keep pools working unchanged.
2. Deterministic flow field and river channels.
3. Fish, as the cheapest thing that makes water feel inhabited.
4. Frogs, once shoreline transitions are worth the trouble.
5. Lakes and deep water.
6. Boats, after placed-entity persistence and platform-height sampling exist.

## Open Questions

- Does water have a temperature or season? Paper does not freeze convincingly.
- Can players dig a channel and route water themselves? Very appealing, and it
  turns the flow field from scenery into a toy — but it means water has to be
  simulated rather than authored, which is a much larger commitment.
- Do the shops care about water? A boat is exactly the sort of thing the
  beaver bridgeworks in `tool-and-supply-progression.md` should sell.
