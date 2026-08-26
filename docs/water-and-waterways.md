# Water and Waterways

Shallow pools and the first deterministic river-channel pass are implemented.
Lakes, boats, springs, waterfalls, and water critters remain planned here.

## What Exists

`src/world/water.ts` owns a registry of water bodies and one query,
`submersionAt(x, z)` → 0..1. Everything else reads that:

- **Rendering:** a darker bed sheet sunk into the terrain plus a translucent
  drifting surface. You see the bed through the water, which is what makes
  paper read as water rather than as blue paper.
- **Wading:** movement slows toward `WADE_SPEED_FLOOR`, the avatar sinks and
  its walk bob flattens, and ripple rings spread from the feet while moving.
- **Digging:** water registers a footprint, so you cannot dig a pond.
- **Rivers:** continuous sampled channels vary in width and depth, animate
  downstream, reserve their corridor from local terrain bumps, and generate a
  bridge at deep crossings.
- **Banks:** page-seeded marsh, rock, sand, and woodland edges use cattails,
  lilies, driftwood, and stone accents without duplicating at page seams.
- **Critters:** land critters can wade shallow reaches, treat deep reaches as
  obstacles, and recognize bridges as safe crossings.

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

## Settled design

Decided 2026-08-04.

### No seasons, no weather — elevation instead

Water has no temperature and no season. Paper does not freeze convincingly, and
seasons are a large commitment for a variety problem that has a cheaper answer.

That answer is **elevation and latitude**. High ground, once the mountain
ranges are actually climbable, has snow rather than a snowy season. As the world
expands, colder and warmer regions provide the variety that seasons would have,
without any of them being a state the whole world enters at once.

This is a good trade for a streamed world: a region that is always cold is
deterministic from its coordinates. A world that is *sometimes* cold is global
mutable state that every page has to agree about.

### Players can shape water

Yes — the same way they terraform land. Confirmed uses:

- **Water features**, for their own sake.
- **A private fishing hole.**
- **Pet fish and frogs**, kept in water the player made.
- **Filling it back in**, returning it to land. Water edits are as reversible
  as digging is.
- **Built up a hill** to race toy cars down.

The cost noted in the earlier draft is real and unchanged: this is the
difference between water that is authored and water that is *simulated*. The
mitigating design is that a player-made water feature is still a **shape in the
registry** — a small pool or channel the player placed — not a fluid volume
finding its own level. It reuses the extension rule rather than defeating it.
Flow along a player-made channel is a property of the channel, not an emergent
result.

### Boats are built, bought, and extended

Boats are an **advanced buildable**, in the same class as adding a second storey
to your house. They can also be **bought** — the beaver bridgeworks in
`tool-and-supply-progression.md` is the natural seller.

And they are **extendable, like a house**: a boat can be built onto until it is
a houseboat, and a houseboat until it is a mega yacht you throw parties on. That
ambition needs large lakes to be worth anything, so it waits.

**For round one:** a canoe or kayak, suited to river-sized water. One person,
small, foldable-looking.

## Visual work still owed

Notes from playing the current build, 2026-08-04:

- **Puddles need more work.** Water texture and ripples are not accurate yet.
  Specific water materials and patterns are being added to fix this — the
  problem is material, not geometry.
- **Larger water needs visible motion.** Subtle waves on lakes; visible current
  on rivers, and especially **white caps where a stream runs past rocks**.
  Motion is what communicates depth and flow at a glance.

## Shorelines

A body of water is defined as much by its edge as its surface.

**Lakes get a mix of border types, never just one.** Some combination of:

- sandy beach
- rocks
- marshland
- wooden walkways and docks

The mix is the requirement. A lake ringed uniformly in one material reads as a
shape rather than a place.

**Ponds are exempt.** They are small enough that a single border type is fine,
and the clearing's pond stays as it is.

**Planting at the edge:** cattails (the ones that look like hot dogs on a
stick), water lilies, lily pads.

**Crossings and access are pre-made:** docks on lakes, bridges on rivers. A
player should not need a boat to get across a river they found.

## Rivers

A river is a channel: a polyline with a width and a depth profile that is
deepest along the centre line.

The hard part is not the shape, it is **continuity across pages**. Pages
generate independently from their coordinates, so a river must be derivable from
page coordinates alone or it will not line up at the seam. Two options:

1. **Deterministic global flow field.** A low-frequency noise function over the
   whole world defines drainage; a page generates the river segment crossing it
   by sampling that field. Rivers connect because they are all reading the same
   function, not because pages negotiate.
2. **Authored river corridors.** Rivers only exist on authored pages, hand
   placed. Simpler and prettier, but the world stops feeling continuous.

**Option 1, decided.** It is roughly the same technique already used for biome
and geology determinism, and it is the only one that supports the river shape
described below.

### Rivers have a life cycle

A river should not be a constant-width ribbon. It should **change along its
length**, and the flow field is what makes that derivable rather than authored:

- Begins as a **small shallow creek**.
- **Grows** as it runs — eventually to something Mississippi-sized.
- **Bends and curves** organically, travelling across several pages, varying in
  size the whole way — but never narrowing below navigable width once it is a
  river.
- Throws off **offshoots**: waterfalls, small swamps.
- **Ends in a big lake.**

That progression is a strong constraint on the flow field: it needs a notion of
*accumulated drainage* along the path, not just a direction. Width and depth
become functions of how far along the river a point is, which is derivable if
the field is integrated deterministically from a source.

Rivers should also **flow**: a current direction per point, which drifts the
surface texture and later pushes boats and floating objects. That single field
is what makes a river feel unlike a long thin pond.

## Wayfinding on the water

Exactly as on land: signs with distances, scattered along riverbanks and around
lakes. They point to shops, landmarks, points of interest, and specifically to
**the nearest bridge, dock, or beach**.

Water is an obstacle before it is a route. The signs are what keep it from
being a frustration.

## Water as a resource

Water is **not finite**, and this is a design position rather than a
simplification. There should be several ways to get it, scattered widely:

- **Wells**
- **Hand pumps**
- **Natural springs**

**Upgrades** move the player away from manual fetching: better pumps, and
**hoses** to carry water where it is needed. And, in keeping with `economy.md`,
water can be **shared with the community and neighbours** — a hose that reaches
someone else's garden is the most literal possible version of this game's
economics.

**Rain barrels** store water for gardening. Note that these currently imply
rain, and rain implies weather, which is *undecided* — see below. A rain barrel
that fills slowly on its own, with no weather system behind it, is a perfectly
cozy answer and costs nothing.

## Fish, Frogs, and Water Critters

The critter system already supports species with their own rigs, idle actions,
and friendship, and `CritterRig.flying` shows how a different locomotion mode
slots in. Water critters need a third mode beside walking and flying:

- **Fish** stay entirely within a body: bounded wander inside `submersionAt`,
  visible as a shadow and a flick of paper near the surface. They should scatter
  when you wade in and drift back when you hold still — the first critter whose
  reaction to you is *retreat*, which makes stillness a skill.
- **Frogs** are amphibious and the more interesting design: they use the existing
  hopper gait on land and switch to swimming at the shoreline. They belong to the
  pond as a *place* rather than to land or water alone.

Both want a `habitat` field on species so spawning can ask the water registry
where they can live, rather than each species hardcoding its own test.

Fish and frogs can also be **kept**, in water the player made. That is a small
addition to the same `habitat` question — a player-made pool is a water body
like any other.

## Suggested Order

1. Puddle and ripple materials — visual, independent of everything else, and
   currently the most visible problem.
2. Generalise `WaterBody` to a shape union; keep pools working unchanged.
3. Deterministic flow field with accumulated drainage; river channels that vary
   in width along their length.
4. Surface motion: current drift, and white caps against rocks.
5. Fish, as the cheapest thing that makes water feel inhabited.
6. Shoreline generation: mixed lake borders, cattails and lilies, docks and
   bridges.
7. Riverside and lakeside wayfinding signs.
8. Frogs, once shoreline transitions are worth the trouble.
9. Lakes and deep water.
10. Wells, pumps, springs, and carrying water.
11. Boats, after placed-entity persistence and platform-height sampling exist.

Player-made water features are **parked** (see `roadmap.md`). They want channels
as a registry shape and reversible water edits, and they are a whole feature
rather than a step in this one.

## Still open

- **Weather and rain.** Undecided. Rain barrels want it; nothing else does, and
  the no-seasons decision above argues against global world state. A barrel that
  simply refills is the cheap way to have the barrel without the system.
- Whether waterfalls are a channel property or their own shape kind.
- What "navigable width" means numerically, which is really a question about
  how big a canoe is.
