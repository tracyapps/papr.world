# Roadmap

Written 2026-08-04, from the design decisions settled in `biome-knowledge.md`,
`economy.md`, `mining-and-caves.md`, `plans-and-blueprints.md`,
`tool-and-supply-progression.md`, and `water-and-waterways.md`.

**Amended 2026-08-06:** Phase 1 re-sequenced around `knowledge-tree.md`, and
some stale cross-references left over from an earlier phase renumber corrected.

## How to use this

This is ordered by **dependency**, not by enthusiasm. Each item says what it
unblocks and roughly what it costs. The point of the ordering is that you can
pick up anywhere in the current phase and not be wrong.

**The parking lot at the bottom is the important part.** Every good idea that
is not next lives there. Moving something out of the parking lot is a decision
you make on purpose. Wandering into it is how a week disappears.

Sizes: **S** = a sitting. **M** = a few sessions. **L** = a project with its
own shape. **XL** = needs its own doc first.

Nothing in Phases 1–4 requires the map work, which is deliberately deferred.

---

## Phase 0 — The foundation — **DONE**

### 0.1 The `obtainedBy` descriptor — ✅ built

`sim/catalogs/obtaining.ts` exists and does the job: one table answering *"how
do I get this?"*, with `BIOME_SCATTER` derived rather than hand-kept, plus
`biomesFor`, `isBiomeExclusive`, and `toolRequiredFor` computed from the live
tables.

This unblocks every critter knowledge line, the "only place you'll find it"
computation, the tool-name-in-dialogue substitution, and the plan constraint
check below.

**Remaining scrap — S:** `ResourceDefinition.biomes` in `world/resources.ts` is
now vestigial and still carries the two-meanings problem. Delete it once nothing
reads it.

---

## Phase 1 — Plans and the knowledge tree

**Promoted to the front on 2026-08-04.** Reason: progression cannot be tested at
all until plans can be reached. Advanced materials need advanced tools, advanced
tools need their plans, and every higher rung currently shows an empty plan slot
with no way to fill it.

**Re-sequenced 2026-08-06** — see `knowledge-tree.md`. The diagnosis above was
right about the blockage and wrong about the cheapest way through it. The
missing piece is not a way to *find* plans; it is that nothing tells the player
what a locked slot even wants. A knowledge tree fixes that, grants plans
directly from some of its nodes, and is a **view over catalog data that already
exists** rather than a new system.

So the tree goes first, and **1.4–1.6 are no longer blocking** — they become the
exploration route to plans rather than the only route.

Two rules from that document most likely to get lost in implementation:

1. **A node is paid for in patience or in doing, and either finishes it alone.**
   Real-world clock, one node at a time, no notifications, nothing purchasable.
2. **Tool plans come from the tree and nowhere else.** Not found, not sold, not
   gifted — you gift the made tool instead. Everything-else plans (furniture,
   clothing, structures, decoration) keep the full object design and are now the
   only kind that gets sited, sold, or detected.

### 1.1 `TECH_DEFS` and the tree as a read-only view — ✅ built (2026-08-07)

Catalog, derived unlock icons, the Professor, and the full-screen accessible
view shipped first as a deliberately read-only slice. It has since been
play-tested and extended by 1.2/1.3 below with lesson selection, progress,
and tool-plan grants.

<details><summary>Original 1.1 spec</summary>

A node is a **skill**, not a recipe — *Gardening 1, Gardening 2, Advanced
Gardening* — and one node can grant several things. That needs a small new
declarative catalog (`TECH_DEFS`): node ids, prerequisite edges, learning
duration, task list, and what the node grants.

Everything else is referenced by id, not restated: recipes from `RECIPE_DEFS`,
ladder order from `toolsInFamily` / `previousTierTool`, materials from
`obtainedBy`. **If a node definition starts duplicating ingredient lists or
tool names, that is the review catch.**

Opened from **the Professor** — a HUD paperclip with googly eyes, dark-rimmed
glasses, and a graduation cap. Movable like the minimap, so he registers with
`hudLayout.ts` rather than carrying his own coordinates. Never named *Clippy*
anywhere.

He shows **ambient state, never a score**: reading a book while a node is
learning, a friendly face when nothing is, plus an optional coarse clock
(`showLearningTimer`, default on). No tallies, no notifications, no speaking
unprompted.

The tree renders full-screen. Whole tree visible from the start, unreachable
nodes muted with their requirement stated, cost in small print on every card.
Cards carry two tiers of unlock icons — large for what the node grants, small
for what those grants then enable, **derived from `obtainedBy`** rather than
hand-listed. Full-screen layout is owner-designed.

Ships useful entirely on its own: it is the legibility fix, and legibility is
the actual complaint.

Accessibility is decided up front in `knowledge-tree.md` and is not optional
polish — the graph is a view over a semantic nested list, never a canvas of
positioned boxes.

</details>

### 1.2 Node costs — the learning clock and the tasks — ✅ built (2026-08-08)

Depends on 1.1. Both ways of paying, either of which finishes a node alone.

The clock is **real-world elapsed time** — learning advances while the game is
closed, because the timer exists precisely for the player who cannot play right
now. One node at a time, so this is a single persisted start moment rather than
a collection; keeping it a single field is what enforces the rule.

What keeps that from becoming a check-in habit is the surrounding design, not
the clock: no queue to optimise, no notifications, no catch-up bonuses, and
approximate remaining time rather than a finish timestamp.

Tasks start with the two answerable from existing player state: *make N of X*
and *own tool Y*. Finite set per node, jumps priced off one shared value scale
across the whole tree, nothing ever totalled.

### 1.3 Nodes granting tool plans — ✅ built with 1.2 (2026-08-08)

Depends on 1.2. `player.plans` already accepts an id from any source; a node
completing is the same write.

**After this, progression is playable end to end**, which is what the whole
phase was for.

### 1.4 Retire tool plans from the other routes — ✅ built (2026-08-08)

Depends on 1.3. World siting, owl stock, and critter gifts become
everything-else plans only. Mostly data and copy, but do it deliberately rather
than leaving the old routes as dead paths someone re-enables later.

Every recipe now declares exactly one `planSource`: starter, knowledge tree,
or world. World siting filters on that source and refuses direct tool-plan
siting. The Thing Maker uses the same field to route a locked tool rung to the
exact Professor lesson instead of telling the player to search the world.

### 1.5 Deterministic plan siting — **M**

**Everything-else plans only** — no tool plan is ever sited. Every findable plan
gets **one definite location in the world**, derived from its id — not a random
roll at dig time.

This is the load-bearing choice in the whole phase, and it is worth being
explicit about why: **a hot/cold detector is impossible against a random roll.**
"Warmer" only means something if there is a *there* to be nearer to. Siting
plans deterministically is what makes the detector buildable, keeps the world
consistent across sessions and players, and makes the whole thing testable
headlessly.

Siting is biased into a biome where the plan's own ingredients can be obtained,
so reaching a region completes the loop there — which is the behaviour
`plans-and-blueprints.md` asks for.

**Sites are non-exclusive** (settled 2026-08-06): a site yields for every player
who does not already hold that plan. The first to dig it up takes it from
nobody. A plan is knowledge, not ore, and an exclusive site would reintroduce
by geography exactly the hoarding the duplicate rule forecloses. Dug ground
still stays dug — availability was never a property of the hole.

### 1.6 The no-self-gating constraint test — ✅ built (2026-08-08)

Asserts across every plan that it never requires a material only obtainable with
the tool that plan unlocks. `toolRequiredFor` in `obtaining.ts` is what makes
this checkable.

**Now covers tree nodes too**, and matters more there: a node's *tasks* must not
require a material gated behind the tool that node grants. Same deadlock, new
place for it to hide.

Cheap now, and it prevents the worst possible bug in this system: a plan nobody
can ever use, discovered months later.

The catalog tests now cover both halves: a tool recipe cannot require a material
behind the tool it makes, and a lesson task cannot ask for its own grant or an
exact material gated behind that grant.

### 1.7 Plan detector — hot/cold — **M**

Depends on 1.5. Coarse proximity bands, **no direction**. One detector per plan
hunted, so hunting a different plan means making a different detector.

The coarseness is the design, not a limitation — it converts "somewhere in the
world" into "somewhere around here" and stops, so finding the plan still means
walking around.

### 1.8 Finding and picking up a plan — **M**

Depends on 1.5. The world-side half: a plan at its site, visible as blueprint
stock (distinct paper, readable from a distance), and the pickup interaction.

Includes the gifting rules from 3.6, which are cheap once pickup exists: a plan
you already own offers only gift-or-mail.

### 1.9 Basic-plan visual hints — **S**

Depends on 1.8. Simpler furniture and decoration plans get something findable if
you are looking. Rarer ones rely on chance or the detector.

---

## Phase 2 — Critter knowledge

Reuses the conversation engine almost entirely, and makes the world feel
inhabited. Independent of Phase 1 — swap the order freely if plans get tiring.

### 2.1 "Tell me about this place" — **M**

Depends on Phase 0. A conversation option, biome-scoped, drawing from a pool with
randomised order and repeat availability.

Build it in this order — each step is playable:

1. **Material and tool-gating lines**, generated from `obtainedBy` + `TOOL_DEFS`.
   The bark-curls line is the reference case.
2. **Harvesting lines** from growth-rate and yield tables.
3. **Wayfinding lines** from the places registry — *"the owl-itect's studio is
   just the other side of this forest."*
4. **Authored fun facts** per biome. The only hand-written kind, because it
   asserts no mechanic.

Personality shapes *which kind leads*, never *what is available*. Friendship
gates nothing here.

### 2.2 Threaded follow-ups — **M**

Depends on 2.1. Keep asking, keep learning. `addFlags` marks "already said this
one" *inside* a thread; it never closes the topic. One critter should be able to
yield several things in one exchange.

### 2.3 Nearby-elsewhere knowledge — **S**

Depends on 2.1. Critters mention adjacent biomes, shops, and landmarks. Scope to
*nearby*, not global — a squirrel who knows the whole map is an index, not a
neighbour.

### 2.4 Critters who bring you plans — **M**

Depends on 2.1 and Phase 1. A raccoon who found something on its
adventures, either handing it over or telling you where it saw one. Reuses the
conversation engine rather than adding a system.

Everything-else plans only — a critter never carries a tool plan.

### 2.5 The diary — **L**

Depends on 2.1 having something to record. A searchable record of what you have
been told, formatted like something the player kept.

**Build the data shape properly on day one**: stable entry ids and room for
player-authored fields, so annotation and highlighting can be *added* later
rather than retrofitted. The annotation UI itself is parked.

---

## Phase 3 — Economy, shops, mail

The design is settled and nothing here is blocked on code. This phase is
sequenced so the *guardrails* land with the mechanics rather than after them.

### 3.1 Chips as a quantity — ✅ built (2026-08-08)

`player.chips`. Displayed quietly. **No session totals, no earnings summary, no
tallies anywhere, ever** — this is the constraint from `economy.md` and it is
easier to honour before a UI exists than to remove after one does.

Implemented as a backward-compatible `player.chips` field. The first shop
shows only the pouch balance; there are no earnings or session totals.

### 3.2 Shop data shape — ✅ built (2026-08-08)

Every shop gets an explicit `sells` list and an explicit `buys` list, both
initially "everything". This is five minutes now and a restructure later. It is
the single highest leverage line in this phase.

`Pip’s Seed & Garden` is the first catalog. It explicitly sells every seed and
buys every core resource, giving later regional shops the contract to narrow
without changing transaction commands.

### 3.3 Buying and selling — ✅ first playable slice (2026-08-08)

Depends on 3.1, 3.2. Flat prices across shops, minimal markup over buy price.
One price table, not per-shop pricing — that is what "no price-shopping" means
mechanically.

The seed shop establishes the shared rule: loose materials and spare seeds buy
for ₡1, garden produce buys for ₡2, and seed packets sell one at a time for ₡2.
Two paper fibers are an equal-value barter for any packet, so the loop is
playable from a new save with no free currency. A bought packet becomes the
selected seed immediately, connecting the counter directly to planting.

### 3.4 The owl and plan purchase — **M**

Depends on 1.6, 3.3. Two prices per plan: chips, or a barter list that costs
slightly less. Barter list differs by plan type and never asks for a material
gated behind that plan's own tool.

**She does not sell tool plans** (2026-08-06). Her stock is furniture, clothing,
structures, and decoration — which suits an owl-itect better anyway, and keeps
her studio a place you visit because you want something lovely rather than
because you are stuck.

Needs an easel structure and a studio set piece, in the manner of
`world/woodMill.ts`.

### 3.5 Mailbox and PWMS — **L**

Depends on 3.1. Every player gets a mailbox; materials, chips, tools, and plans
can be sent to it.

Open first: **is the mailbox a placed world object or a scrapbook tab?** The
world object is warmer and pulls in placed-entity persistence — which is also a
prerequisite for boats (4.11) and buildings, so doing it here means doing it once.
The scrapbook tab ships in a day and gives that up.

### 3.6 Plan gifting rules — **S**

Depends on 3.5. A plan you already own offers *only* gift or mail. A plan in
your Thing Maker cannot come back out. Small code, and it is the rule that makes
hoarding structurally impossible rather than merely discouraged.

Applies to everything-else plans only — tool plans are learned, so there is no
duplicate to gift. Generosity with tools is **making one and handing it over**,
which is warmer than passing on a spare blueprint.

### 3.7 Recycling bins — **S**

Depends on 3.1. Tools for chips; materials for noticeably fewer chips. The gap
between the two rates is the design.

### 3.8 Generosity payoffs — **M**

Depends on 3.5. Random, non-fungible, never itemised. Trinkets and decorations
brought by a critter who *"heard you did something nice."* Keep the chip payout
small, rare, and worth less than the thing you gave.

**Build this last in the phase, on purpose.** It is the piece most likely to
turn into a farming loop, and it is easiest to tune correctly once you can see
what everything else is worth.

---

## Phase 4 — Water: rivers and lakes

Ordered so that the most visible current problem is fixed first and each step
after is independently playable.

### 4.1 Puddle and ripple materials — **S**

No dependencies. The most visible unfinished thing in the current build, and a
material problem rather than a geometry one. Do it first because it is a good
mood to start a phase in.

### 4.2 `WaterBody` becomes a shape union — **M**

`pool | channel | basin`, with `submersionAt` as a **max over shapes** — take the
deepest, never the sum, the same rule overlapping digs already follow. Existing
pools keep working unchanged.

**Unblocks everything else in this phase.**

### 4.3 Deterministic flow field with accumulated drainage — **L**

Depends on 4.2. A low-frequency global function defines drainage; each page
derives its own river segment by sampling it, so seams line up without pages
negotiating.

The harder requirement, from `water-and-waterways.md`: rivers **change along
their length** — creek to river to Mississippi, bending across several pages,
throwing off waterfalls and swamps, ending in a lake. That needs *accumulated
drainage along the path*, not just a direction. Width and depth become functions
of distance-from-source.

This is the real engineering in the phase. Budget for it.

### 4.4 Surface motion — **M**

Depends on 4.3. Current drift on the texture, subtle waves on large water, and
white caps where a stream runs past rocks. Motion is what communicates depth and
flow at a glance.

### 4.5 Fish — **M**

Depends on 4.2. The cheapest thing that makes water feel inhabited. Needs a
`habitat` field on species so spawning asks the water registry rather than each
species hardcoding a test. Scatter when you wade in, drift back when you hold
still.

### 4.6 Shorelines and crossings — **L**

Depends on 4.3. Lakes get a *mix* of border types — beach, rocks, marsh, wooden
walkways — never a single one uniformly. Cattails, water lilies, lily pads.
Pre-made docks on lakes and bridges on rivers, so a river is never a wall.

Ponds are exempt; the clearing's pond stays as it is.

### 4.7 Riverside and lakeside wayfinding — **S**

Depends on 4.6. Signs with distances to shops, landmarks, and specifically the
nearest bridge, dock, or beach. This is what keeps water from being a
frustration.

### 4.8 Frogs — **M**

Depends on 4.5, 4.6. Amphibious: existing hopper gait on land, swimming at the
shoreline. Worth it once shoreline transitions exist.

### 4.9 Lakes and deep water — **L**

Depends on 4.6. No drowning: you can always wade, and deep water is where a boat
becomes *necessary*, not where you die. Cheap reflection trick — a flipped,
faded, offset copy of nearby cutouts — sells a lake more than any shader.

### 4.10 Wells, pumps, springs — **M**

Independent of the rest of the phase. Water is not finite. Several access points
scattered widely. Upgrades toward less manual fetching, then hoses, then sharing
water with neighbours — which is the most literal possible expression of this
game's economics.

### 4.11 Boats — **L**

Depends on 4.9, placed-entity persistence, and platform-height sampling. Round
one is a canoe or kayak. The houseboat-to-mega-yacht extension is parked until
lakes are large enough to justify it.

**The real cost is platform-height sampling** — the avatar's ground sampling
accepting a platform height instead of always reading the terrain field. That is
shared with every future building you can stand on, so do it once, properly.

---

## Phase 5 — Deferred: map, then underground

**Waiting on owner design work for the map interface and functionality
(in progress as of 2026-08-04).** Logged here so the dependencies do not get
rediscovered later.

Nothing underground can start before the map, because the underground is only
worth having if you can find your way around it.

1. **Full-page map view**, surface only, in the scrapbook Map tab. Useful on its
   own, independent of caves. — **L**
2. **`layer` threaded** through page addressing, streaming, terrain sampling,
   and the map. The risk is anywhere that assumes a single global height field.
   — **L**
3. **Explored-cell storage keyed by layer**, and landmarks that survive page
   unload. — **M**
4. **Cave entrances** as subway-style surface props, transitioning to one
   authored test cave: a chamber, a tunnel, lighting, one carved sign. — **M**
5. **`mine` at tier 1 against rock formations**, with regrowth reusing the tree
   growth model. — **M**
6. **Wall mining at tier 2+** and the rarer material tables behind it. — **M**
7. **Generated cave pages** — the chamber-and-tunnel rhythm at scale. — **L**
8. **Underground building**, gardens, and protected mural surfaces. — **L**

Steps 1 and 2 are the real work; everything after is content on top of them.

---

## Parking lot

Good ideas. Not now. Each one has a reason it is parked — the reason is the
useful part, because it tells you what would have to change for it to move.

| Idea | Parked because |
| --- | --- |
| Diary annotation and highlighting UI | Needs a diary with entries in it first (2.5). The *data shape* is not parked. |
| Player-authored plans and a marketplace | Version-two at the earliest. Constrains today only in that plan ids, recipe shape, and output type must stay open rather than enumerated. |
| Clothing, including the light-up mining helmet | Wants the `affix` verb and the plan engine generalised past tools. Delightful, not foundational. |
| Houses, multi-storey building, furniture | Wants `build`, `disassemble`, and placed-entity persistence. The mailbox (3.5) is the cheapest excuse to build that persistence. Design intent now captured in `land-and-dwellings.md` — read it before starting, since spacing and maker-id are cheap now and expensive later. |
| Moving house to another neighbourhood | Wants dwellings to exist first. Designed in `land-and-dwellings.md`. Cheaper than it looks — home is a single `HOME_PLACE_ID` record that already drives signs, map, and places panel. |
| Vehicles and transporters | Wants advanced tree nodes and, for vehicles, the platform-height sampling that boats (4.11) also need — do that once. Designed in `land-and-dwellings.md`; the rule that matters is **transporters only connect places you have already walked to**, built on the existing saved-places registry. |
| Houseboats and mega yachts | Wants lakes large enough to matter (4.9) and boats that exist (4.11). |
| Player-made water features and toy-car channels | Wants channels as a registry shape (4.2) and reversible water edits. Genuinely appealing; genuinely a whole feature. |
| Weather and rain | Undecided, and the no-seasons decision argues against global world state. A rain barrel that simply refills gives you the barrel without the system. |
| Snow and cold regions | Needs climbable mountains first. |
| `mix` / `cook` | Wants a party to cater, so it wants multiplayer. |
| `paint` as a verb | Needs the decorate-versus-create split resolved, and shares the "canvas not material" surface rule with cave murals. |
| Specialty vs. general shop differentiation | Decision owed (below). Costs nothing to defer *if* 2.2 lands with both fields. |
| Player-to-player selling for chips | Where communal economies turn into markets. Barter and gifting between players carry the same warmth with less risk, so they go first. |
| Player-run farms and small businesses | Explicitly wanted (`economy.md`), and mostly falls out of sellable player-made goods + the generalised plan engine. Not a separate build. |
| Tier-3 tunnel extension / player-carved tunnels | Replaced by the pre-authored, always-connected underground. If it returns, it returns as its own feature with its own guardrails. |
| Recipes deriving names from `TOOL_DEFS` | Small cleanup. Two names were renamed by hand on 2026-08-04, which is the argument for doing it — but it is not blocking anything. |
| A family of owls / travelling easel | Worth holding until multiplayer, when *"which owl did you find?"* means something. |

---

## Decisions still owed

Small, and each unblocks something specific.

1. **Hidden gift frequency** — once per suggestion, or a low roll each time.
   *Blocks nothing; affects 2.1's warmth.*
2. **Whether the top-tier pick changes wall shape slightly.** Not at all is
   safer for a shared map. *Blocks Phase 5.*
3. **Whether the plan detector is itself made from a plan.** Recursive and
   charming. *Blocks 1.6's recipe.*
4. **Old-house disposition when a player moves** — leading answer is that it
   reverts to a starter house for a new player, avoiding abandoned-lot blight.
   *Blocks moving; see `land-and-dwellings.md`.*
5. **Whether wild critter friendship is location-bound** — leaning yes, because
   home ranges are what make attachments have a place. *Cheap now, and it
   changes what friendship means, so decide before friendship is built out.*
6. **Whether famous original landmarks become permanent prime real estate**, or
   whether making them reachable-from-anywhere defuses it.
   *See `land-and-dwellings.md`.*

**Settled 2026-08-04, previously listed here:** specialty shops differ by
**geography** only; the mailbox and base Thing Maker are **given automatically**
and mail is an **inbox, not an address**.

---

## If you only do one thing

**Phase 1.5 — deterministic plan siting for everything-else plans.** Tool-plan
progression is now end-to-end and guarded: lessons grant those plans, old world
routes reject them, and catalog tests catch self-gating tasks. The next plan
work is the exploration route for furniture, clothing, structures, decoration,
and oddities — never tools.

*Superseded 2026-08-08.* This used to say Phase 1.4. It landed with an explicit
`planSource` on every recipe and a direct Thing Maker → Professor lesson route.

*Superseded 2026-08-08.* This used to say Phase 1.2, followed immediately by
1.3. They landed together because completion without the plan grant would
have left a finished lesson in an unusable state.

*Superseded 2026-08-07.* This used to say Phase 1.1. See
`prototype-progress.md` → "The Knowledge Tree, Read-Only" for what shipped
and what is still unverified on screen.

*Superseded 2026-08-06, before that.* Before 1.1, this said deterministic
plan siting. Siting is still wanted — it is now 1.5, it applies only to
furniture-and-decoration plans, and it is an exploration route rather than
the critical path. See `knowledge-tree.md` for why the swap.
