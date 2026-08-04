# Prototype Progress

## The Magnet Cursor (2026-08-03, eleventh pass)

Reported as "my cursor is a magnet — anytime it gets close to the centre it is
repelled drastically to the edges", after two rounds of me diagnosing the same
complaint ("I can't click on things") as a performance problem.

**One CSS bug, and it explains every symptom.**

`.game-cursor` carries the pointer position as `--cursor-x` / `--cursor-y`, set
inline in pixels. The hotspot refactor gave the child image
`transform: translate(var(--cursor-x, -14%), var(--cursor-y, -12%))` — expecting
the fallback. But **custom properties inherit**. The image picked up the
parent's pixel position, so it was translated by the pointer position a second
time, landing at double the real coordinates:

| Pointer | Drawn cursor |
| --- | --- |
| (10, 10) | (20, 20) — looks fine |
| (640, 400), centre of a 1280×800 window | (1280, 800) — bottom-right corner |

Hence "repelled from the centre". Every cursor without its own hotspot rule —
`default`, `attach`, `build`, `chop` — did this; `hand`, `dig` and `garden` had
rules that overrode the inherited value and looked correct, which is why it
wasn't obvious.

And the clicking: the real cursor is hidden over the canvas, so you aim with
the drawn one. It was lying about where the pointer was. Clicks went exactly
where they were told to go — somewhere else.

Fixed by renaming the hotspot to `--hotspot-x` / `--hotspot-y`. The rule, now
enforced in `tools/check-styles.mjs`: **a variable that positions an element
must not share a name with one that offsets its contents.** Verified by
reintroducing the collision; the check names all three offending rules.

### What I got wrong

Two prior explanations were plausible, evidenced, and not the cause. The
performance defects found along the way were real and worth fixing — 18ms/frame
of navigation probing, footprints rebuilt per query, movement triggering page
generation — but none of them was this.

The tell I walked past: "cursor jumping all over the place" is a statement about
*where a thing is drawn*. I read it as a frame-rate symptom because I had just
changed the simulation loop, and kept reading it that way through two rounds.
The user's third description — a spatial pattern, worse toward the centre — is
the shape of a doubled coordinate, and could only have been that.

## Critters Notice Buildings, And Walk Round Them (2026-08-03, tenth pass)

Animals walked through walls and trees, and the cat had adopted the inside of
the Thing Maker. The world already knew where everything stood — the dig
footprint registry — it just wasn't being asked at movement time.

What changed:

- `src/world/footprints.ts` — footprints gained `solid?: boolean`, plus
  `findSolidBlocker` / `isSolidAt`. "Cannot dig here" and "cannot walk here" are
  different questions: a twig blocks the shovel but not a squirrel; the pond
  blocks the shovel but is waded through; the Thing Maker blocks both.
- `src/game/critterBehavior.ts` — `tryStep` slides along obstacles per-axis
  instead of stopping dead or clipping through. Wander targets are rejected if
  solid or wet. Boxed-in critters re-target.
- `src/core/placement.ts` (new) — `nudgeToFreeSpot`, the deterministic ring
  search. Extracted from `nudgeOutOfWater`, which now delegates to it, because
  spawning on a pond and spawning inside a wall are the same problem.

Then a second pass, because stopping at a wall isn't enough — a critter whose
friend stood on the other side pressed into it and looked stuck:

- `steerAround` walks to a committed waypoint off to one side, then re-decides.
- The player got collision too, via the same `slideMove` helper.

Rationale for all of it is in `docs/critter-design.md`.

### Verification

Every plausible way to get this wrong was reintroduced, and each failed a test
that named it:

| Broken how | Test that caught it |
| --- | --- |
| Everything treated as solid | "lets things walk over the pond and loose material" |
| Nothing treated as solid | 4 tests, incl. "blocks the buildings a cat kept walking into" |
| Body radius ignored | "grows the blocked area with the mover's body radius" |
| Slide only, no steering | "goes round the near end of a wall, not the far one" |
| Detour dropped on a short lookahead | "walks briskly around the end of a wall" |
| Side chosen by room, ignoring sight | "goes round the near end of a wall, not the far one" |
| Detour taken even on a clear path | 3 tests, incl. "takes the direct line when nothing is in the way" |
| Route consults the rng | "routes deterministically, so clients agree" |
| Path probed every frame | "stays inside its per-frame query budget" |
| Coarse stride used for movement safety | "goes round the near end of a wall" |

147 tests, typecheck and build clean.

### The fix broke clicking

Reported as "I can't click on things to interact with them" — which was true,
and had nothing to do with input handling.

`isSolidAt` costs ~7µs (it walks the page registry). Probing the whole path
every frame for every active critter came to **18ms per frame**: the entire
60fps budget. The world still rendered, so it didn't read as a crash. It read
as clicks being ignored, because at single-digit frame rates they land between
frames.

Fixed by throttling the path check to ~3/second per critter (staggered), using
a coarser stride for "which way round?" probes than for "is the next step
safe?", and skipping steering entirely beyond 22 units from the player. 18ms →
1.1ms worst case.

The budget is now a test, not a hope. It counts `isSolidAt` calls per frame and
fails above 6; the un-throttled version measures 9.6.

**Worth remembering:** a performance regression in the simulation loop presents
as an *input* bug. Nothing about the symptom pointed at critter navigation.

Throttling wasn't enough on its own. Two older defects, which the new per-frame
caller merely exposed:

- **The footprint list was rebuilt on every query** — every prop on nine pages,
  plus the clearing's 15 trees and 4 shrubs, re-derived each call. Props are
  immutable after a page is built, so it's now a `WeakMap` cache. 7.5µs →
  0.43µs.
- **`getPage` generates missing pages.** A critter probing a few steps ahead
  near a page seam kicked off full procedural generation of the neighbours,
  synchronously, mid-frame — and again as it wandered, building world nobody
  had reached. That is the likeliest cause of the "cursor jumping all over the
  place" report. Movement now uses `peekPage`; digging still generates, because
  a click must be answered about a page that hasn't streamed in.

The dig/movement split is now asserted: "treats an unloaded page as empty for
movement, but not for digging".

### Click tolerance

Separately, and worth fixing on its own merits: a left press was cancelled by
**5px** of pointer movement. That is less than a millimetre of hand tremor, a
trackpad tap that drifts, or a click taken while the frame rate is uneven — all
of which silently did nothing, with nothing in the console.

The tight threshold only exists to separate a click from a camera drag. When
the press isn't driving the camera there is no gesture to disambiguate, so the
tolerance is now 18px in that case and 5px while orbiting. `input.test.ts`
covers both directions: a wobbled click still fires, and an orbit still doesn't
end in a click.

### The measurement was the hard part

The first version of the wall test asserted "does the critter arrive?" — and
passed with steering removed entirely, because a critter that only scrapes
along walls still blunders its way there eventually. Same for the final
position, which is meaningless once the critter arrives and wanders off again.

What actually distinguishes the fixed behaviour is **path length**: 11.7 units
going round versus 17.0 scraping, against a straight-line-around optimum of
about 9.3. That is the thing the player sees, so that is the thing the test
measures.

Two intermediate versions were also thrown out by these numbers rather than by
looking at them: the per-frame angular offset (the critter span in place at
exactly its turn rate) and a single long committed leg (took the far end of the
wall, 15.8 units).

One test was deleted rather than kept: an assertion that the critter "commits
to one side instead of dithering" passed even with the side chosen at random,
because the line-of-sight comparison already decides deterministically. The
side memory is a tie-break for symmetric obstacles, not the mechanism — so the
test was replaced with one asserting the property that *is* load-bearing, that
routing never consults the rng.

## Tool Art Scale (2026-08-03, ninth pass)

### Every tool was rendering at the fallback size

Moving slot framing into the art data (seventh pass) rewrote `.tool-slot-art`
to take its width from `var(--art-width)` — but the edit matched only part of
the rule and left the original `width: 116px` further down. CSS keeps the last
declaration, so the custom property was dead on arrival and every tool drew at
116px. The shovel, which had been correct at 320px, shrank with everything
else.

No error, no failing test, nothing to typecheck. Visible only by looking at
the screen.

Fixed by removing the shadowing declaration. The shovel's framing was never
changed, so it returns to the size it had before.

### `npm run styles:check`

`tools/check-styles.mjs` fails the build on any property declared twice in one
rule, plus a specific assertion that `.tool-slot-art` sizes from the custom
property. Wired into `npm run build` beside the existing conversation
validator.

It lives in `tools/` rather than vitest because vitest returns an **empty
string** for `.css` imports — with `?raw` and via `import.meta.glob` alike —
and the project has no `@types/node` for `fs` inside a test. Two attempts at a
vitest version silently passed against an empty stylesheet before that turned
up.

The parser is a brace-depth scanner, not a regex: a flat
`/([^{}]*)\{([^{}]*)\}/` pairs an `@media`'s opening brace with the first
inner rule's closing brace and desynchronises everything after it. The first
version of the check "passed" because it had stopped seeing most of the file.
It now reports how many rules it parsed and fails if that number looks too
small — a check that finds nothing should have to prove it looked.

Verified against the original bug and against an unrelated duplicate.

## Render Order Convention (2026-08-03, eighth pass)

### Ground overlays drew over the player

The biome ground sheets from the last pass were given `renderOrder = 1..3`.
The avatar is `transparent: true, depthWrite: false` — it must be, so the
cutout can fade out in first person — and sits at the default order of 0.
Three.js draws transparent objects in `renderOrder` sequence, and since the
avatar writes no depth, anything ordered after it paints straight over it.
Flat sheets lying on the ground rendered in front of the paper potato.

The codebase already had a convention (sky −100, backdrop −14, clouds −8)
that the new code simply did not follow, because it lived only as scattered
literals. `src/render/renderOrder.ts` now states it:

**Anything that lies on the ground belongs below zero.** Things that stand up
keep 0 and sort by depth. Effects meant to sit on top go above.

The ground band is ordered internally too — soil under water, water under its
own ripples: `biomeOverlay −6` · `water −3` · `ripple −2` · `gardenRing /
guidanceArrow −1`.

### Two more latent instances of the same bug

Fixing the reported one surfaced others with the identical failure mode:
water surfaces (order 2), wading ripples (3), and planting rings (4) would all
have drawn over the player standing in or among them. The guidance arrow was
relying on depth-sorting against a character that writes no depth — it happened
to work, which is worse than failing.

### Verified

`tsc`, 115 tests across 9 files, build.

`renderOrder.test.ts` asserts the ordering invariants and lints the source for
assignments that bypass the constants.

**The lint's first version was useless.** It matched only numeric literals, so
it passed cleanly when the original bug — `renderOrder = layer`, a *variable* —
was reintroduced. It now matches the assignment and requires `RENDER_ORDER` on
the right-hand side, with a narrow exemption for pass-through parameters.
Verified against both shapes. The lesson is the same one as the water geometry
test: match the thing you want, never try to enumerate the ways it can be
wrong.

## Continuous World Fields (2026-08-03, seventh pass)

### The grid is gone

Biome was one value per page, chosen by hashing the page's coordinates.
Neighbours were therefore completely uncorrelated — forest could sit hard
against scrapflats with a straight seam exactly on the page border. That is
what made the world read as a grid, and it also made transitions *impossible*:
there was nowhere for a boundary to be except the edge of a page.

`src/world/fields.ts` replaces that with functions of world position:

- `biomeWeightsAt(x, z)` — per-biome weights from two low-frequency fields
  acting as loose moisture and roughness axes.
- `fieldElevationAt(x, z)` — broad highlands and lowlands, ridged so highs
  have flat-ish tops and valleys have soft floors.
- `biomeConfidenceAt(x, z)` — how firmly a point belongs to its biome.

Two consequences, and they are the whole point: neighbouring pages agree
because they read the same function rather than negotiating (determinism for
multiplayer preserved, nothing synced), and a boundary can fall anywhere —
mid-page, at an angle, in a ragged tear — because nothing about it is tied to
the page lattice.

**Biome palettes are unchanged.** Forest, meadow, dunes and scrapflats look
exactly as they did; the field decides where they are and how they meet, not
what they are.

### Torn edges and blended ground

Boundaries are found by *displacing the sample point* before asking which
biome it is, with two octaves of warp at different scales. A straight border
becomes a torn one, with detail at more than one size.

Ground blending uses **per-vertex alpha on stacked biome sheets**, not a tint
on one shared texture — each biome's ground is a different piece of paper, and
tinting would throw that away for a flat colour wash. The torn edge comes free
because the field is already distorted; the renderer knows nothing about what
shape the tear is.

### Topography

Elevation is now a world field with local patches on top, so a hill on a
highland is a hill *on a highland* rather than instead of one. Generated
relief gained variety: hollows as well as hills, sand mounds that collect in
low ground, dirt mounds, and taller features on higher ground so highlands
read as genuinely rugged.

`elevationBandAt` returns 0..1 and is ready for the world map's elevation
overlay.

**The starting clearing sits in a calm basin** (`HOME_CALM_RADIUS`). Partly
design — the first place you stand should be gentle, the world more dramatic
as you travel — and partly safety, since the house, Thing Maker, pond and
signposts are hand-placed against terrain that was flat when they were put
there.

### Tuning the mix

The first field left meadow at 57% and forest at 12% — plainest biome
dominating, most interesting one starved. A correction overshot to 38% forest,
which is both visually heavy and the densest biome to render. Settled at:

    meadow 42% · dunes 23% · scrapflats 17% · forest 18%

Meadow leads deliberately: it is the connective tissue the others read as
arrivals from. That number is recorded in `fields.ts` and worth re-checking
after any change to the affinity scores.

### Tool art framing moved into the data

Slot framing was per-slot CSS (`.tool-slot-2 .tool-slot-art { ... }`), so
every new tool needed a stylesheet edit and slot *numbers* were baked into
presentation. Each tool now carries its own `frame` — width, offset, rotation,
flip, and how far it lifts when selected — applied as custom properties. The
hoe uses the lighter `garden-hoe-alt.svg` so the blade reads against the
rail's near-black paper, framed diagonally with the head high instead of a
long crushed handle.

### Verified

`tsc`, 109 tests across 8 files, build. New `fields.test.ts` covers
determinism, continuity across page borders, no discontinuity along a
400-unit walk, the calm home basin, every biome appearing somewhere, weights
forming a distribution, confidence dropping at boundaries, and — the actual
symptom — boundaries landing *off* the page grid.

### Note

Generated terrain changed shape, so the world beyond the clearing will look
different from any earlier screenshots. Authored pages keep their hand-placed
props but now sit on field elevation, which was the deliberate call.

## Water Awareness Fixes (2026-08-03, sixth pass)

Three bugs from the water pass, all with the same shape: something in the
world did not know the water existed.

### The pond's bed rendered over by the house

`buildWaterSurface` wrote the bed's vertices in **world** coordinates and
cancelled them with `bed.position.set(-body.x, 0, -body.z)`. Wrong twice:

1. The group also has `rotation.y`, which rotates that offset — so the bed
   landed several metres away rather than under its own water.
2. Clicking the pond runs a cozy `ripple` reaction that **scales** the group,
   which multiplies the offset and throws the bed further on every click.
   That is the "dark blue circle moves when I click" symptom.

Both meshes are now built in local space. There is no offset left to corrupt,
so the bed survives any transform of its parent. Two tests assert the bed's
world centre stays over the body, one of them with the group scaled.

### Critters walked on water

Land critters now:

- **avoid it** — `pickWanderTarget` tries several directions and takes the
  first dry one, falling back to walking away from the centre so a critter
  caught in a pond climbs out rather than freezing;
- **stand in it** — `settleOnGround` sinks them by 55% of the water depth
  (less than the player: a fully sunk squirrel disappears into a puddle);
- **spawn beside it** — `nudgeOutOfWater` walks a seeded spawn point to the
  nearest dry ground, deterministically, so multiplayer agreement survives.

Flyers are exempt. Hovering over a pond is where a butterfly belongs.

### Stones spawned on the pond

An ordering bug. The clearing's pond was created part-way through building the
page, so every prop placed *before* it could not see it. Water is now
registered in a **pre-pass** (`registerPageWater`) before any prop is built,
and `buildProp` skips anything that would land in water.

Authored water bodies moved into `AUTHORED_WATER_BODIES` so set-piece water
and prop water register through the same path. `setPieces` now looks the pond
up rather than declaring a second copy of its geometry — one source of truth
for where the water actually is.

### Verified

`tsc`, 98 tests across 7 files, build. The bed-placement tests were checked
against the original bug: reintroducing the world-space geometry and cancel
offset fails both.

**Note on the first attempt:** the initial regression check for this fix
passed with the bug reintroduced, because nothing asserted where geometry
ended up. The two `worldCentre` tests exist because of that gap, not in spite
of it.

## Tools, Pickup, and Water (2026-08-03, fifth pass)

### New tool art

`garden-hoe.svg` is now the Creased Hoe. `kids-scissors` (tier 1) and
`sturdy-scissors` (tier 2) are defined with recipes and art but gated behind
`TRIM_TOOLS_READY` in `catalogs/tools.ts`, because the `trim` verb has no
world interaction yet — trees still have no growth or regrowth. They stay in
the catalog so their costs, tiers, and artwork are settled work; flipping one
flag turns them on. **Crafting something you cannot then use is worse than not
seeing it.**

### Scrapbook counts

"12 tucked away" says nothing "12" does not. Counts now stand alone in their
own column with tabular figures, so a list of them does not jitter.
Undiscovered items keep their words, because a blank is ambiguous.

### Crafted things must be picked up

Finishing a craft puts the thing on the Thing Maker's tray; it is yours when
you click it. Picking up a tool equips it.

This needed a state split: `completedOutputs` stays as the history that drives
the Plans page, and a new `trayOutputs` holds objects still sitting on the
machine. Collecting clears the pile without erasing the record.

The tray visuals were append-only, driven by a counter — fine while nothing
could ever leave. They now rebuild from the array, because collecting the
first of three has to remove *that* one.

**Bug found while here:** the Plans page compared `completedOutputs` (recipe
ids) against `output.label`, so every plan showed as never made. Introduced in
the scrapbook rewrite; now compares ids.

### Water is real

`src/world/water.ts` owns a registry and one query, `submersionAt(x, z)` → 0..1.
Rendering, wading, and dig-blocking all read it.

**Water is a kind, not a colour.** The generator scatters `paper.blue` as
ordinary decoration alongside plaid and bubble prints — treating blue paper as
water would have turned every decorative scrap into a pond and removed blue
from the palette. Only `kind: 'water'` is water. TypeScript caught the one
place this mattered: adding the kind made the dig-footprint switch
non-exhaustive, which is exactly why that switch has no `default`.

Wading has three cues, because any one alone reads as a bug: the avatar slows
and sinks with a flattened bob, ripple rings spread from the feet, and rings
only appear while moving so standing still is calm. Rings are flat expanding
meshes rather than a surface shader — a shader would ripple the whole pond
uniformly, where rings originate where *you* are.

The clearing's pond is now a real water body. The blue scrap beneath it became
a pale shore.

### Plans written, not built

- `docs/mining-and-caves.md` — why caves are a second *space* rather than
  sideways digging, three implementation options with a recommendation, the
  `mine` verb, and the world-map work that has to come first.
- `docs/water-and-waterways.md` — generalising water bodies into a shape
  union, deterministic river flow fields, lakes, boats, and fish/frogs as a
  third locomotion mode beside walking and flying.

### Verified

`tsc`, 89 tests across 7 files, and the build pass. New tests cover water
geometry (shelving, rotation, overlap taking the max) and tray collection
(collecting by index from the middle, history surviving pickup).

## The Gardening Loop (2026-08-03, fourth pass)

### The Creased Hoe (slot 3)

A tier-1 garden tool with verb `plant`, craftable at the Thing Maker. The
split of labour is now: **the shovel takes ground apart, the hoe puts it back
together.** The hoe sows, lifts plants back out, and rakes soil into an open
hole.

Which of those three it does depends on what you are holding — seed selected
sows, empty hands rake — except over a planted cell, which is always a lift,
since that is the only way to clear one. Reaching for the hoe with seeds in
the scrapbook but none chosen picks one up, so the common case is one click.

The hoe has no artwork yet, so **`TOOL_ART` is now partial**. A tool's
existence is a data decision; its artwork arrives separately. Tools without
art render as a plain numbered slot and a generic paper block from the Thing
Maker, so a mechanic is never blocked on a drawing and no placeholder quietly
ships. Read it through `getToolArt()`, never index it.

### Plants grow

Four stages — seeded, sprout, bud, bloom — each a distinct silhouette rather
than the same flower scaled up, so "has it grown?" is answerable from across
the clearing. Buttonbloom reaches bloom in about 95 seconds of pottering.

Stage is **derived from elapsed time, never stored**. Same reasoning as
seeded critter spawns: no save field, no ticking while a page is unloaded, and
a future server and client agree without syncing anything but the plant time.
A plant is correct the instant its page streams back in, even after an hour
away. `updatePlanting` tracks what stage each plant was *built* at so a growth
step triggers exactly one mesh rebuild.

Seed drops now require full bloom. Previously a freshly sown bed could drop
one, which skipped the growth it was meant to reward.

### Refilling and lifting

- **Refill** is free for a tier-1 scoop (a scuff you push back with the side
  of a hoe) and costs paper soil beyond that, spending the most plentiful
  variety first so a rare regional clay isn't silently drained. This gives dug
  soil a sink and makes terracing a project rather than a free action.
- **Lift** returns the seed at seeded/sprout, and the plant itself
  (`items['plant:<seed>']`) at bud/bloom. Mis-clicks stay cheap, patience
  pays. A loose seed already lying beside the plant comes along too — it was
  earned. The bed survives a lift; lifting is not filling in.

### You can see the rules now

Spacing was invisible: a refused player had no way to see the circle they
violated. While the hoe is out, `gardenOverlay.ts` draws the rules on the
ground — a translucent preview of the plant at full bloom on the target cell,
a ring for the space it will claim, and rings around every nearby plant
showing space already claimed. **Overlapping rings are the explanation.**

The world dims to 62% while the hoe is out. Dimming the *scene lights* rather
than laying a DOM scrim over everything matters: a scrim would dim the very
rings and ghost it exists to highlight.

`gardenActions.ts` resolves what the hoe would do at a cell as a **pure
query**, and the overlay, the cursor, and the click handler all read it. Three
consumers, one answer — previously the cursor and the command each decided
validity separately, which is how you get a cursor that says yes and a click
that says no.

When an action is still refused, `gardenHint.ts` shows a card with the
requirement and the current value side by side ("Space needed 0.85 paces /
Space here 0.50"). A one-liner can say no; only numbers say what yes looks
like.

### Verified

`tsc`, 77 tests across 6 files, and the build pass. Three regressions were
verified to fail their guards: removing the bloom gate, making lift always
return the seed, and making every refill free each break the tests written
for them.

### Still open

The hoe and the plant slot need artwork. Only Buttonbloom has real stage
visuals — a second flower species would confirm the stage system generalises.

## Grounded Cutouts, Dig Scale, Plant Spacing (2026-08-03, third pass)

### Trees sit in the ground

Standing cutouts are placed by `groundedCutoutY()`, which sinks each one below
the ground line by 3.5% of its own height. Hand-drawn trunks end in ragged
paper, and resting that edge exactly on the ground left gaps that the cast
shadow read as space *under* the tree, so it looked like it was hovering.

Proportional rather than absolute: a 24-unit redwood has a proportionally
larger messy bottom than a 0.6-unit shrub. Applied at all four placement sites
(page runtime, horizon instancing, and both set-piece paths). Artwork no
longer needs a flat bottom edge — noted in the artwork guide.

### Digging is a scoop, not a crater

The dig lattice went from 1.25 units to 0.5. A single Tier 1 dig was a
1.45-unit crater — nearly as wide as the avatar is tall — and cells sat so far
apart that two digs were separate tangent circles. It is now ~0.85 units
across and 0.13 deep, and adjacent digs deliberately overlap.

Two changes were needed to make overlap actually work:

1. **Depth takes the max of overlapping edits, not the sum.** Summing
   compounds every overlap, so a row of holes would excavate a trench several
   times deeper than any single dig.
2. **The depth profile has a flat floor.** The old `cos²` falloff was so
   peaked that the midpoint between two adjacent scoops was only **9%** dug —
   a row of dimples with unturned ridges. `digInfluence()` now holds full
   depth to half the radius then smoothsteps out, putting that midpoint at
   92%, and the scoop radius rose to 0.85 × cell size.

Dug patches also lost their stamped-circle outline: the rim wobbles from three
offset harmonics seeded by the cell's stored `geologySeed`, so a hole has the
same torn shape on every reload and every future client. Overlapping soil
discs get a deterministic sliver of height offset to stop them z-fighting.

### Plants have personal space

Each seed declares a `spacing` radius. Planting is refused when two plants'
spacing circles overlap, checked against the larger of the two requirements so
a sprawling plant keeps its distance from tidy neighbours as well as its own
kind. Buttonbloom wants 0.85 (two cells); Mend-me groundcover wants 0.30, so
it sows edge to edge in an unbroken row. Crowded beds fail the pointer
hit-test, so the cursor shows the refusal before the click.

### Verified

`tsc`, 65 tests across 6 files, and the build pass.

**The first version of these tests was worthless.** Both the overlap tests
passed with the additive-depth bug reintroduced — the assertions were too
loose to distinguish sum from max at the numbers involved. Diagnosing that is
what surfaced the 9%-midpoint problem, which was the real defect. The rewritten
tests were verified against both regressions: reverting `max` to `+=` fails
"never digs deeper than a single scoop", and restoring the peaked falloff fails
"merges adjacent scoops into one continuous bed".

### Note on existing saves

Terrain edits store their own `x`, `z`, `radius`, and `depth`, so holes dug
before this change keep their old size and position on the old lattice. They
will look oversized next to new digs. Nothing breaks; the world self-heals as
they are mended or replaced.

## Scrapbook Strip, Quiet HUD, Critter Idle Actions (2026-08-03, second pass)

### Scrapbook is now a bottom strip

The pop-up book view is gone. The scrapbook is a full-width band of torn paper
along the bottom edge with category tabs across its top. Items lay out *along*
the strip rather than down a page, so a growing material list extends sideways
instead of forcing an ever-larger modal. Closing it hides the strip and
everything in it, leaving a clean world view for screenshots.

Tabs: the six material categories, plus Tools, Map, and Plans. Saved places
and the guidance picker moved into the Map tab and the floating places panel
is gone — they are navigation, not a permanent overlay. Full ARIA tabs pattern
with roving tabindex and arrow-key navigation.

### The HUD got quieter

- The permanent instructional text ("WASD, arrows, or left stick to move · …")
  is gone. Controls reference is read once and then never again, so it now
  lives behind a **?** icon in the top right.
- The floating settings panel is gone; a **cog** icon opens it as an overlay.
- That leaves the persistent HUD as: place chip, tool rail, minimap, compass,
  two icons, and whatever transient toast is currently speaking.

### Critters no longer stare at you

Two separate problems, one root cause each.

**Detached faces.** Six of seven rigs added `head`, `nose`, `eyes` and `ears`
as *flat siblings* of the root group. Animating `head.position.y` therefore
moved the skull sphere and left the face hanging in the air — visible on the
squirrel, whose curious animation bobbed a bald head up and down through a
stationary set of eyes and ears. Every rig now has a real `head` group with a
neck pivot, built by re-parenting the existing meshes so the rest pose is
unchanged. The bird's pecking and the cat's head tilt were rewritten to pose
the group rather than the skull, which would have reintroduced the same bug.

**The staring.** Standing near a critter re-entered the `curious` state every
frame, pinning it in a permanent turn-to-face. Noticing the player now latches
(`noticed`), so a critter greets you once and gets on with its life. Idle is a
rotation of natural actions — look around, ear swivel, sniff the ground,
groom, stretch, perk up, shake off — drawn from per-species weighted pools
(cats groom, birds twitch, bunnies work their ears). Being nearby mixes in a
*glance* rather than replacing the animal's own behaviour.

**Friendship changes where they live.** A critter's roaming centre drifts from
its seeded home toward the player as friendship grows, so a well-loved critter
potters about near your feet. The drift is clamped to 6.5 units so critters
never abandon their page — spawns are deterministic per page and following you
forever would break that and depopulate the world.

### Verified

- `npx tsc` (strict), 27 tests across 5 files, `npm run build` all pass.
- New `src/game/critterIdle.test.ts` covers determinism, species pools,
  friendship-scaled glancing, and rest-pose restoration.
- **Not verified visually** — no browser in this sandbox. `npm run hud:check`
  was updated for the new strip and icons.

### Follow-up: floating cat head (same day)

The head-group refactor was incomplete. Two `flourish` bodies — cat and
woodchuck — still assigned an absolute Y to the **skull mesh** inside the new
head group. After re-parenting, the cat's skull sits at local `y = 0.06`, but
flourish assigned `0.46`, launching the head ~0.4 units above the body while
the ears, eyes, nose and whiskers stayed put. The `progress >= 1` branch wrote
the same bad value as a "reset", so a single flourish (petting, or the random
12% idle chance) broke that cat permanently.

Fixed by posing the head group and capturing rest positions at build time, so
no animation repeats a pivot literal that has to be kept in sync by hand.

`src/game/critterRigs.test.ts` now enforces the invariant across all seven
species: **nothing inside a head group ever moves.** It also checks that a
completed flourish returns the head to rest (otherwise displacement
accumulates every pet) and that face parts stay near their pivot. The test was
verified against the original bug — reintroducing it fails the suite.

### Caught during implementation

`settle` and `stretch` originally wrote absolute `body.scale`, which would
have inflated every non-uniformly-scaled body (the squirrel's rests at
0.6 × 0.7 × 1.08). Rest scale is now captured per rig and animations apply
relative to it; there is a regression test.

### Still open

The plant tool slot renders as a bare numbered slot — it needs seed-pouch
artwork. Butterflies deliberately have no idle actions: their whole body is
the animation, and a hovering insect that stops to groom reads as a physics
bug.

## HUD Layout Layer (2026-08-03)

Screen space is now described once, in `src/ui/hudLayout.ts`, instead of each
overlay picking its own `top:`/`right:` pixel value in its own file. That
practice had produced four collisions that no single file could reveal:

| Collision | Cause |
| --- | --- |
| Region banner over compass | Banner `top:78` centred; compass default `y:76` centred. |
| Pet toast over both of those | Pet toast `top:64` centred, z-index 30 — a third overlay in the same strip. |
| Places panel over harvest toast | Both at right ~16–18 / top 190. The panel (z:30) beat the toast (z:26), so harvest gains were never seen. |
| Scrapbook cover over tool slot 3 | Slots ran 75→555px; the open cover rose to within 260px of the bottom. Any viewport under ~815px tall buried the lowest slot. |

What changed:

- **Zones as CSS variables.** `--hud-edge`, `--hud-rail-width`,
  `--hud-dock-reserve`, `--hud-rail-scale` are published by the layout module
  and read by `styles.css`. The left rail width is now the single source of
  truth for how far the status block and the scrapbook dock are inset.
- **Auto-stacking right rail.** `registerRailPanel()` positions panels from
  their *measured* heights, so the settings panel no longer needs to know the
  places panel is 226px tall. Hidden panels collapse their slot.
- **One toast stack.** The pet, cozy-object, and harvest toasts are now flow
  children of a single bottom-centre column (`getToastStack()`), so two of
  them cannot occupy the same coordinates. Inactive toasts leave the flow
  rather than `display: none`, which preserves the fade-out.
- **Toast/dialogue coordination.** Opening a critter conversation raises the
  toast stack (`setToastStackRaised`) so feedback never lands on the card.
- **Compass default relocated** to beneath the minimap, freeing the top-centre
  band for the region banner. Still draggable; saved positions are respected.
- **Tool rail scales to fit** the space above the dock rather than running to
  a fixed height. Scaling (not a new breakpoint) keeps the hand-placed slot
  artwork composition identical at every size.

Also fixed while here:

- The rail had no slot for `plant` mode, so choosing a seed in the scrapbook
  put the game into planting with nothing lit on the rail. Slots are now
  driven by a `SlotRequirement` union covering every `ActionMode`, with a
  fourth slot for the next tool.
- Locked slots carry their state in the accessible name; `is-locked` was a
  visual-only treatment, so screen readers announced unavailable tools as
  ready.
- Number-row shortcuts are a `Digit[1-9]` range instead of a hardcoded
  1/2/3 list, so a new slot can't be silently keyboard-unreachable.
- A `prefers-reduced-motion` block drops slide/scale/rotate across the HUD
  while keeping opacity, so appear/disappear stays perceivable.

### Verified

- `npx tsc` (strict), `npm test` (19 tests), and `npm run build` all pass.
- **Not verified visually** — this sandbox has no browser. Run
  `npm run dev`, then `npm run hud:check` (add `-- --shots` for PNGs in
  `.qa/hud-layout/`). It measures every overlay across seven viewports ×
  open/closed dock and exits non-zero on any overlap.

### Open design question

The scrapbook dock now starts at `--hud-rail-width + 28px` rather than the
left edge, which is what removes the tool-rail conflict at every size. That
horizontal position is a visual call — it is one variable in `styles.css`
(`.scrapbook-dock { left: ... }`) if it should sit differently.

## Redwood Canopy + Skyward Camera (2026-07-29)

- Seven new portrait redwood cutouts are compiled at their full 787×2385 resolution and registered as distinct tree kinds.
- Authored western forest pages place all seven designs at 20–28 world units; generated forests seed 18–30-unit redwoods among the ordinary canopy.
- A 24-unit sentinel redwood at the clearing's western entrance previews the forest scale from the starting area.
- The camera's lower pitch limit now transitions out of avatar-locked orbit and into free skyward viewing. A continuous drag reaches 87.5° upward at any zoom, while close first-person view also spans from nearly straight up to a steep downward look.
- A 2.5-degree safety margin prevents camera-up vector singularity, roll, and view flipping while remaining visually straight overhead. Vertical mouse dragging is also 36% slower than the first skyward pass for finer canopy framing; horizontal turning is unchanged.

## Scrapbook Materials Page (2026-07-29)

- The scrapbook cover now opens a full paper-book Materials page instead of stopping at the dock shell.
- Material families show aggregate quantities and expand into individual regional varieties with their own counts.
- Current groups are Sticks & Twigs, Stones & Pebbles, Fibers & Foliage, and Cardboard & Board. Zero-count varieties remain softly visible as discoveries still to make.
- Inventory updates redraw the open scrapbook immediately after harvesting, while all counts remain local-storage persistent.
- Every family and variety has a stable `iconKey`; temporary patterned swatches can be replaced by final artwork without changing saved inventory data.
- The live and candidate material lists, plus icon preparation guidance, live in `docs/scrapbook-materials.md`.

## Harvestable World + Named Regions (2026-07-29)

- Seven persistent material families now appear by biome: Kraft Twigs, Ribbonwood Sticks, Mossy Paper Fiber, Bluefold Pebbles, Confetti Stones, Graphite Cardstone, and Sunbaked Cardboard.
- Resource piles are clickable, use the interaction pointer, give immediate sound/toast feedback, persist inventory and depletion in local storage, and regrow after a per-node cooldown.
- Generated forests now place 48–68 trees, including 10–18-unit giants. The authored westward forest corridor has also been expanded into uneven 30+ tree stands with a handful of landmark giants.
- Regions receive stable, coordinate-seeded names such as Ribbonbark Forest, Crinkleleaf Grove, Cardboard Desert, and Offcut Flats. A region banner announces transitions.
- The Paper Clearing has a clickable three-way trail sign with names, arrows, and distances to nearby landscape families.
- Runtime artwork may now use up to 4096 pixels on its longest side. Tall-tree authoring and biome-palette guidance are documented in `docs/paper-artwork-guide.md`.

Last updated: 2026-07-29 (first cozy-world density + interaction pass)

## Cozy Solo Pass

- The starter clearing now has a dense near-field ring of supplied paper-tree cutouts, overlapping material patches, a porch garden, a paper pond, a listening tree, and a sticky-note wind mobile. The additions divide the oversized 50-unit ground sheet into smaller visual nooks while preserving the existing handmade asset language.
- Four world details now respond to clicks with a brief animation, a soft procedural paper sound, and rotating bits of micro-writing: the pond, listening tree, porch mobile, house window, and display-wall note. Interaction remains proximity-gated but deliberately generous for small moving targets.
- Clicking a nearby critter now opens a paper conversation card. Every species has greetings, place lore, and personal lines; players can also pet from inside the conversation. Talking and petting feed the existing persisted friendship score, which remains visible in the card.
- Temporary Places and Camera panels were reskinned as light notebook-paper cards so the development controls no longer visually overpower the cozy world.
- Verified in the in-app browser: fuller clearing renders, listening tree click produces its response, critter conversation opens for Tinsel, a lore branch updates the reply, petting advances friendship 2 → 6, and the production build completes.

## Conversation Engine

- Critters now receive two deterministic personality traits in addition to species, individual name, and shyness.
- Persistent conversation memory tracks visits, seen lines, story flags, and completed relationship moments separately for every animal.
- The dialogue card is driven by dynamic storylet choices and effects rather than fixed topic buttons.
- Everyday dialogue composes species observations with personality-specific moods. Curious, friend, buddy, and pet friendship levels each unlock a one-time remembered milestone.
- Bandit has the first signature five-scene arc, **The Moon Button**, which advances across conversations and awards friendship as the player helps recover and repair a lost treasure.
- Authoring conventions and scaling guidance live in `docs/conversation-engine.md`.
- The Thing Maker itself is now raycast-clickable and participates in the interaction-hover cursor. Clicking it nearby opens the Plan Slot Console; `E` remains available as a keyboard shortcut.

## Critters + Backdrop Fixes (same day, third pass)

- Critter system (`src/game/critters.ts`, `critterRigs.ts`, `critterBehavior.ts`, `critterVariation.ts`): six species — squirrel (long-bodied, nose-to-tail), butterfly, raccoon (dark mask, ringed tail, little hands, paw-rubbing flourish), bunny (real hop arcs), bird (peck arcs forward, beak-first), cat (slow blink, tail-talk, aloof shyness floor, sits-and-curls flourish). Every individual is seeded "DNA": paper-texture coat, scale, speed, shyness, wander radius, and a name. Deterministic per page, so multiplayer clients will agree without syncing spawns. Bandit the raccoon lives behind the starter house; scrapflats pages are raccoon country. Full design + scaling plan in `docs/critter-design.md`.
- Shared wander/curiosity behavior: home-range wandering (5–10 unit radius), player curiosity at ~3.5 units, occasional species flourishes. Friendship store (`src/game/friendship.ts`) persists points per critter and already makes befriended critters bolder at spawn.
- Backdrop cutouts are now sized from each texture's real pixel ratio (target width + height cap), fixing the giant stretched mountains — asset ratios range 1.2:1 to 3.8:1 and were all being forced panoramic. The asset compiler already caps everything at 1024px, so no manual re-exports needed. Suggestion for future skyline SVGs: let ridge lines taper to transparent at the left/right edges so overlapping cutouts never show a vertical cut.
- Pages grew 22 → 50 units (streaming pop-in now happens outside the camera), with density retuning for generated pages, a proportional spread for authored ones, and a giant paper skirt disc under the world so the ground never visibly ends.
- Verified in Chrome on the live dev server: no console errors, mountains properly proportioned, critters wandering (one walked away mid-screenshot).
- Petting (interaction verb #1) is live: left-click a critter → flourish + paper hearts + named toast; forgiving 48px pick radius; +4 friendship with 6s per-critter cooldown. Gamepad axes are now measured against a resting baseline, cancelling stick-drift camera creep.
- Level camera now aims at the avatar's head (eye-to-eye, not over it), and zooming fully in blends continuously into first person: the cutout fades, its shadow remains, pitch becomes look up/down. State-verified; visual pass pending (Chrome suspends the frame loop when its window is occluded, so test with the window in front). Debug hook: `window.__paperWorld.camera()`.
- Settings system started (`src/game/settings.ts`): typed, localStorage-persisted, observable — the permanent foundation for the options in technical-plan.md (key remapping, gamepad mapping, sensitivities, invert look). First setting: camera drag mode, defaulting to "grab the world" (drag pushes the world like paper on a table — natural-scroll feel) with "move the camera" (classic orbit) as the alternative. Toggle lives in a temp panel (`src/ui/settingsPanel.ts`, `temp-settings-*`, deletable like the places panel). Verified both modes mirror correctly and persist.
- Camera controls remapped for the interaction future: right-drag (or middle-drag) orbits with full yaw + pitch (level to overhead in one gesture); the browser context menu is suppressed over the world. Keyboard R/F still tilts; wheel still zooms. Verified left-drag is a no-op in Chrome.
- Interaction verb #1 shipped: left-click pets critters (`src/game/petting.ts`) — flourish response, floating paper hearts, named toast ("♥ Doodle flutters happily", verified live), friendship points with a per-critter cooldown. Details in `docs/critter-design.md`.
- Gamepad inputs are now measured relative to each pad's resting baseline (`game/input.ts`), fixing slow camera drift from a connected controller's stick drift.
- New `docs/ideas-log.md` for "log this" moments — first entry: the saw mill as a giant school paper cutter.

## Newest Additions (same day, second pass)

- Camera is now a pitch orbit (`src/game/camera.ts`). R/F or gamepad right stick tilts between nearly level with the character (skyline, mountains, clouds in frame) and the old overhead craft-table view. The aim point rises as the camera drops so tilting down naturally looks out and up. A terrain guard keeps the camera from dipping under the paper.
- Fluffy paper clouds (`src/render/clouds.ts`): flat cutout clusters of overlapping cream circles with a darker glued-behind layer. A ring of upright clouds sits around the horizon and a few horizontal ones float overhead for when the player looks up. Seeded, parallax-following, with a very slow bob.
- Saved places (`src/world/places.ts`): Home is auto-created at spawn and can be renamed but never removed. Players can mark, rename, and remove other places. Persisted in `localStorage`, marked on the minimap as gold/rust landmark dots.
- Guidance arrow (`src/game/guidance.ts`): pick a place and a single flat red paper arrow (with white paper backing) sits on the ground one step ahead of you — always in front, whichever way the camera faces, like a compass you're holding. It rotates to point at the destination (including behind you), glides smoothly when the camera swings, keeps a low render order so it never draws on top of the character, and hides within ~2 units of arrival.
- Temporary places panel (`src/ui/placesPanel.ts`): deliberately plain dropdown + Mark (also the M key) / Rename / Remove buttons and an `aria-live` distance readout ("14 paces away"). Built entirely from TS with `temp-places-*` naming — `index.html` and `styles.css` untouched — so the whole file can be deleted when the real scrapbook-style UI lands.
- Input guard: game keys no longer fire while a form control (like the temp dropdown) has focus.
- Gradient paper sky (`src/render/sky.ts`): a shader dome fading from warm cream at the horizon into soft blue overhead. The palette drifts through four gentle daytime moods (morning blue → clear blue → dusty warm → lavender) on a 12-minute loop — deliberately not a day/night cycle; the world never darkens. Fog haze, background, and a subtle hemisphere-light tint track the current sky so distant mountains always fade into the right color. Tuning: `PALETTES` and `CYCLE_SECONDS` at the top of `sky.ts`.

## Current Prototype State

- The prototype is now modular. `src/main.ts` is a ~110-line bootstrap; everything else lives in focused modules:
  - `src/core/` — pure math helpers (rng, hashing, clamp, deadzone).
  - `src/render/` — WebGL context, material registry, geometry builders, lighting, parallax backdrop.
  - `src/world/` — serializable page data types, authored pages, seeded generation, terrain sampling, page runtime construction, streaming, map features.
  - `src/game/` — avatar movement, follow camera, input, Thing Maker, critters.
  - `src/ui/` — HUD widgets/compass, minimap, scrapbook shell.
- The world is page-based. One page = 22 world units square. The original clearing is authored page `0,0` (spans -11..11 on both axes).
- Pages stream: the avatar's page plus its eight neighbors stay built and visible; everything else hides. Page transitions are ordinary walking — no loads, no walls. The old world-edge clamp is gone.
- Authored pages so far: the clearing (`0,0`), a two-page forest corridor west (`-1,0`, `-2,0`) with a continuing notebook path, and two dune-flat pages south (`0,1`, `1,1`).
- Every other page is generated deterministically from its coordinates (forest / meadow / scrapflats biomes), so all clients will agree on the same world without syncing page contents.
- Distant hills and mountains are no longer cutouts taped to the playable edge. They live in two parallax backdrop rings (hills nearer, mountain lines farther) that drift slowly relative to the avatar, plus a paper-toned fog haze (`THREE.Fog`) for distance fade.
- Neighboring page ground sheets overlap slightly at alternating heights, so page borders read as stacked paper sheets rather than seams.
- Movement feel pass: acceleration/deceleration (braking slightly stronger, so stops feel planted), a light speed-scaled walk bob, a paper-cutout lean into sideways motion, and a blob shadow that shrinks a touch during bob hops.
- The key light and its shadow camera follow the avatar, so shadows stay crisp on any page.
- Terrain height is sampled from page data (not meshes), continuous across page borders, and identical for simulation and rendering.
- The minimap exploration grid is unbounded (per-cell set keyed by world cell), remembers explored pages after they stream out, and tints explored ground by biome.
- Thing Maker crafting keeps running even if its page streams out; its animation pauses while hidden. Critters pause while their page is hidden.
- Compass, minimap drag/resize/persistence, scrapbook shell, and the Thing Maker console all behave as before. UI DOM and CSS were intentionally left untouched (UI mockups are in progress separately).

## Verified

- `npx tsc` passes with strict mode across all new modules (2026-07-16, both passes).
- `npm run build` (tsc + vite) passes (2026-07-16, both passes).
- Places store smoke-tested in Node: Home auto-creation, name trimming, rename, empty-rename blocked, Home removal blocked, marker add/remove on the minimap registry.
- World-generation logic smoke-tested in Node:
  - generation is deterministic for the same page coordinates
  - page math: `0,0` spans -11..11, ±11.1 lands on neighbor pages
  - all generated props stay inside their page bounds
  - forest, meadow, and scrapflats biomes all appear in a sample neighborhood
- Not yet verified visually: this session's sandbox could not run a browser (Playwright's Chromium needs system libraries the sandbox lacks). Run `npm run dev` and walk west/south to check the forest corridor, dunes, page transitions, and backdrop parallax.
- Pre-restructure source is backed up at `.backup/2026-07-16/`.

## Immediate Next Tasks

Superseded — see `docs/next-session.md`, which is written fresh at the end of
each working day. The list that used to live here predated the continuous world
fields, the scrapbook strip and the gardening loop, and had gone stale enough to
be misleading.

## Watch Next Session

- Built page groups are kept (hidden) rather than disposed, so very long walks grow memory. Fine for the prototype; revisit with pooling/disposal when pages get heavier.
- Backdrop rings are sparse by design (paper-sky gaps between mountain cutouts). If that reads as empty rather than airy, add more cutouts per ring or a third, fainter ring.
- The squirrel's tree is hardcoded to the clearing's west treeline; if that tree moves in page data, update `game/critters.ts`.
- Minimap biome tinting samples page data per explored cell each frame; if the minimap grows, cache cell colors.
