# Roadmap

Written 2026-08-04, from the design decisions settled in `biome-knowledge.md`,
`economy.md`, `mining-and-caves.md`, `plans-and-blueprints.md`,
`tool-and-supply-progression.md`, and `water-and-waterways.md`.

**Amended 2026-08-06:** Phase 1 re-sequenced around `knowledge-tree.md`, and
some stale cross-references left over from an earlier phase renumber corrected.

**Amended 2026-08-25:** Plan acquisition is now one model: starter plans begin
in the scrapbook and every later plan is learned through a suitably placed
knowledge-tree node. The unused world-siting and detector path was removed.

**Amended 2026-08-25 (new-day pass):** multiplayer is now an explicit parallel
lane beginning after Critter Knowledge 2.2, not a reward for finishing every
biome. A small invite-only alpha gate and its in-game feedback system are
defined below and in `alpha-testing.md`.

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

**Remaining scrap — ✅ built (2026-08-25):** the vestigial
`ResourceDefinition.biomes` field is gone. World scatter and obtainability now
have one source of truth in `obtaining.ts`.

---

## Phase 1 — Plans and the knowledge tree — **DONE**

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

The tree is now the only progression route for every non-starter plan. Tool
plans establish the first playable ladder; furniture, clothing, decoration,
building, and structure plans join later nodes as those creation systems become
real. They are spread across relevant branches and tiers rather than arriving
as one catalog dump.

Two rules from that document most likely to get lost in implementation:

1. **A node is paid for in patience or in doing, and either finishes it alone.**
   Real-world clock, one node at a time, no notifications, nothing purchasable.
2. **Every non-starter plan comes from the tree and nowhere else.** Plans are
   knowledge, not objects: they are not found, sold, gifted, mailed, sited, or
   detected. Generosity means giving someone the thing you made.

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

### 1.3 Nodes granting plans — ✅ built with 1.2 (2026-08-08)

Depends on 1.2. `player.plans` already accepts a recipe id; node completion
writes each recipe id in that node's grants.

The first grants are tool recipes, so tool progression is playable end to end.
The grant boundary is now `RecipeId[]`, which also accepts later furniture,
clothing, decoration, building, and structure recipes without a new system.

### 1.4 One plan-source model — ✅ built (2026-08-25)

Depends on 1.3. Every recipe declares exactly one `planSource`: `starter` or
`knowledge-tree`. The Thing Maker routes every locked ready recipe to its exact
Professor lesson. There is no world, shop, critter, gift, mail, or detector
fallback to drift back into the design later.

The unused `planSites` and `planDetector` modules and their tests were removed.
No save migration was needed because neither system had been wired into player
state or gameplay.

### 1.5 Non-tool plan grant seam — ✅ built (2026-08-25)

`TECH_DEFS` grants recipe ids rather than assuming every grant is a tool id.
The tree view resolves each recipe's output: tools retain their full tool art,
while future output kinds have a readable plan fallback. Derived material and
recipe reachability still runs only for tool outputs.

This checks off the infrastructure, not the future content. Each creation plan
should be added with the gameplay slice that can actually make and use it, then
placed on an appropriate later node. Do not author the whole catalog at once.

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
exact material gated behind that grant. The useful invariant formerly housed in
the plan-siting test now lives with tool progression, where it applies to the
actual acquisition route.

---

## Phase 2 — Critter knowledge

Reuses the conversation engine almost entirely, and makes the world feel
inhabited. Independent of Phase 1 — swap the order freely if plans get tiring.

### 2.1 "Tell me about this place" — ✅ built (2026-08-25)

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

The repeatable option now interleaves four pools in every live biome:
catalog-derived local materials and tool gates, seed growth and harvest yields,
nearby registered-place wayfinding, and authored biome fun facts. The order is
stable but varied by page and personality; personality changes which kind leads
without hiding anything. Pip’s Seed & Garden is now a registered landmark too.

The dialogue UI shipped with the content pass: replies and questions have
separate panes, long choice lists scroll without pushing the reply off-screen,
and interaction toasts clear the measured dialogue height rather than a fixed
guess.

### 2.2 Threaded follow-ups — ✅ built (2026-08-25)

Depends on 2.1. Keep asking, keep learning. `addFlags` marks "already said this
one" *inside* a thread; it never closes the topic. One critter should be able to
yield several things in one exchange.

“Tell me about this place” now opens four repeatable follow-up lanes: gathering,
growing, nearby places, and local character. Each lane rotates through its own
facts without closing, records the exact fact in that critter's memory, and has
a route back to everyday questions. The choice shape supports nested
`followUps`, so authored critter scenes can use the same mechanism rather than
inventing one-off UI.

### 2.3 Nearby-elsewhere knowledge — ✅ built (2026-08-25)

Depends on 2.1. Critters mention adjacent biomes, shops, and landmarks. Scope to
*nearby*, not global — a squirrel who knows the whole map is an index, not a
neighbour.

Wayfinding answers now combine registered landmarks and shops within a short
walk with the distinct biomes one page north/east/south/west. Asking generates
only those four deterministic neighboring pages; it never turns a critter into
a global directory.

### 2.4 The diary — **L**

Depends on 2.1 having something to record. A searchable record of what you have
been told, formatted like something the player kept.

**Build the data shape properly on day one**: stable entry ids and room for
player-authored fields, so annotation and highlighting can be *added* later
rather than retrofitted. The annotation UI itself is parked.

---

## Parallel lane — Multiplayer and the first invited alpha

**Starts now, after 2.2; it does not wait for the rest of the biomes, the map,
or the underground.** Deterministic pages, local building, gathering, saved
avatar designs, an authoritative server scaffold, paper passports, and room
persistence are enough foundation to learn from two-player play while content
work continues independently.

The implementation checklist remains in `multiplayer-readiness.md`; communal
rules remain in `communal-multiplayer.md`; the tester gates and feedback payload
are in `alpha-testing.md`. This lane only records where they enter the main
dependency order.

### MP.0 Maker identity contract — ✅ cleaned up (2026-08-25)

The solo client now writes protocol-v2 `makerId` on completed and in-progress
builds. Old solo saves with `ownerId` migrate on read. Client, shared protocol,
and server therefore agree before pieces begin crossing the wire.

### MP.1 Two-client vertical slice — ✅ built (2026-08-25)

Wire the existing `src/net/` client into an explicit development/shared mode:
two tabs join one room, see fallback paper cutouts move, exchange DOM chat, and
see the same placed piece. Keep solo mode as the default and reuse the same
intent/validation rules. This is **internal dogfood**, not the tester invite.

Shared play is now an explicit `?shared=1` URL mode; unadorned URLs remain
socket-free solo play. Paper passports, the worn-design `AvatarRef` adapter,
interpolated named fallback cutouts, accessible DOM chat with bounded late-join
history, server pieces, and completed-build publication are wired through one
coordinator. A two-Firefox smoke proved movement, cross-client chat, a shared
piece, and piece recovery after a full server restart. Alpha Gate 0 is met.

### Colyseus 0.17 migration — ✅ complete (2026-08-25)

Client and server now run the 0.17 SDK/core/schema/transport line. The migration
uses the root schema callback proxy so the first full state is not missed after
the reflection handshake, and the 0.17 server lifecycle owns Express,
matchmaking, WebSockets, and graceful shutdown. Two clients re-proved presence,
movement, live and late-join chat, placement, restart persistence, and the
plain-URL no-socket invariant. Root and server audits report zero advisories.

### MP.2 In-game alpha feedback — ✅ complete locally (2026-08-25) — **M**

Add **Send feedback** to an always-reachable game menu and the scrapbook. It
must accept Bug / Improvement / New idea / Other, attach safe reproduction
context automatically, allow an optional screenshot, survive a lost connection
in a local outbox, and show a receipt when sent. Player/message safety reports
are a separate contextual action once chat or shared drawings are exposed.

Never attach passport secrets, full saves, private chat, or player drawings.
The first server queue may be a versioned JSON store behind a small interface,
matching room persistence; it still needs review/export/status tooling rather
than becoming an inbox nobody checks.

The complete slice is live from Settings and the Scrapbook: all four
categories, bug-specific fields, inspectable safe context with removable
passport identity, explicit fresh-world screenshot capture/preview/removal,
size-capped upload, a bounded browser outbox, Retry, durable receipts, server
validation/rate limiting/deduplication, and an atomic versioned JSON queue. The
token-protected `?review=1` desk filters reports, reads protected screenshots,
changes status, appends audit notes, and exports JSON with identity and private
notes redacted. Browser proof covered normal delivery, server-offline
screenshot retry, triage, export, and full restart recovery.

### MP.3 Invite-only alpha shell — 🚧 underway (2026-08-25) — **M**

Minimal connect/room UI, join codes, clear connection states, host kick/mute,
personal mute/block, and a clean return to solo play. Deploy the already-audited
Colyseus 0.17 server over `wss://` using the split in `hosting.md`. This is
deliberately smaller than the later public commons
and public-discovery work, but invite-only is not a reason to deploy known
server debt.

The first load-bearing slice is built locally: the Friends panel can generate
an invite code, join an existing code, copy a join link, report preparing /
connecting / online / offline / setup-error states, retry a failed visit, and
return to a solo URL with all active shared-session parameters removed.
Matchmaking is filtered by validated code,
and each code has its own persisted neighborhood id; the old `?shared=1`
development save remains available as `PAPR-22`. Independent browsers proved
same-code presence/chat, different-code chat isolation, missing-code recovery,
and return-to-solo. Feedback context now records the neighborhood code.

Still required before Alpha gate 1: host identity and removal, personal
mute/block (plus contextual safety reports at the point they become necessary),
Railway/Vercel deployment configuration, and a hosted `https://`/`wss://`
restart smoke. Invite codes are an alpha discovery boundary, not a substitute
for those safety controls.

### Alpha gate 1 — small invited playtest

Invite the first interested testers when all of these are true:

1. A new player can complete one coherent 30–45 minute loop — learn, gather,
   garden or build, talk to critters, and find the result again after reload —
   without a developer beside them. Breadth of biomes is not the gate.
2. Two players can join by code, see one another move, chat, and make one
   persistent world change; reconnect and server restart preserve ownership.
3. There is no known save-loss, progression dead end, water-navigation trap,
   or protocol mismatch in that loop. Alpha may be rough; it may not eat work.
4. MP.2 is reachable and verified end to end, including offline retry and a
   reviewable server receipt. The build clearly says it is alpha and that
   resets may still be necessary.
5. Mute/block and host removal work before testers can chat. Contextual safety
   reporting ships before testers can share drawings or meet outside a known
   invite-only group.

Start with 3–5 testers, one neighborhood, and one or two specific questions per
build. Expand only after reports can be triaged and resolved reliably. This is
a feedback milestone, not a claim that the game is content-complete.

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

### 3.4 The owl-itect and finished creations — **M**

Depends on 3.3 and the first ready furniture or decoration slice. The owl sells
finished creations and takes commissions for lovely things a player would
rather not make themselves. Chips, barter, and small material work orders can
coexist without making her a progression gate.

**She does not sell plans.** Those are learned through the tree. Her stock can
include furniture, clothing, small structures, and decoration, which keeps her
studio a place you visit because you want something lovely rather than because
you are stuck.

Needs an easel structure and a studio set piece, in the manner of
`world/woodMill.ts`.

### 3.5 Mailbox and PWMS — **L**

Depends on 3.1. Every player gets a mailbox; materials, chips, tools, and made
creations can be sent to it. Plan knowledge is never transferable.

Open first: **is the mailbox a placed world object or a scrapbook tab?** The
world object is warmer and pulls in placed-entity persistence — which is also a
prerequisite for boats (4.11) and buildings, so doing it here means doing it once.
The scrapbook tab ships in a day and gives that up.

### 3.6 Giving made creations — **S**

Depends on 3.5 and the relevant creation system. Tools, furniture, clothing,
decoration, and other finished creations can be handed over or mailed. Plans
cannot: generosity is **making a thing and giving that thing**, which is warmer
and cannot bypass another player's chosen learning path.

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

### 4.1 Puddle and ripple materials — ✅ built (2026-08-25)

No dependencies. The most visible unfinished thing in the current build, and a
material problem rather than a geometry one. Do it first because it is a good
mood to start a phase in.

`paper.water` supplies the translucent layered surface, and movement through
registered water produces bounded, reusable ripple rings at the player's feet.

### 4.2 `WaterBody` becomes a shape union — **M** — ◐ pool + channel built

`pool | channel | basin`, with `submersionAt` as a **max over shapes** — take the
deepest, never the sum, the same rule overlapping digs already follow. Existing
pools keep working unchanged.

**Unblocks everything else in this phase.**

Pool and curved channel shapes now share max-over-shapes submersion and depth.
`basin` remains before this item is complete.

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

### 4.4 Surface motion — **M** — ◐ river slice built

Depends on 4.3. Current drift on the texture, subtle waves on large water, and
white caps where a stream runs past rocks. Motion is what communicates depth and
flow at a glance.

Channel-following UV drift and visible fast-current accents are live. Large
lake waves and rock-derived whitecaps remain with lakes/flow-field work.

### 4.5 Fish — **M**

Depends on 4.2. The cheapest thing that makes water feel inhabited. Needs a
`habitat` field on species so spawning asks the water registry rather than each
species hardcoding a test. Scatter when you wade in, drift back when you hold
still.

### 4.6 Shorelines and crossings — **L** — ◐ river slice built

Depends on 4.3. Lakes get a *mix* of border types — beach, rocks, marsh, wooden
walkways — never a single one uniformly. Cattails, water lilies, lily pads.
Pre-made docks on lakes and bridges on rivers, so a river is never a wall.

Ponds are exempt; the clearing's pond stays as it is.

Generated rivers now vary bank treatment by page and place rocks, cattails,
water lilies, driftwood, and arched bridges over deep reaches. Mixed lake
borders, docks, and lake-specific transitions remain.

### 4.7 Riverside and lakeside wayfinding — **S**

Depends on 4.6. Signs with distances to shops, landmarks, and specifically the
nearest bridge, dock, or beach. This is what keeps water from being a
frustration.

### 4.8 Frogs — **M**

Depends on 4.5, 4.6. Amphibious: existing hopper gait on land, swimming at the
shoreline. Worth it once shoreline transitions exist.

### 4.9 Lakes and deep water — **L** — ◐ deep-water navigation built

Depends on 4.6. No drowning: you can always wade, and deep water is where a boat
becomes *necessary*, not where you die. Cheap reflection trick — a flipped,
faded, offset copy of nearby cutouts — sells a lake more than any shader.

Land critters avoid deep registered water and use bridges; the avatar can still
wade shallow reaches. Lakes, reflections, and boat-scale deep-water traversal
remain.

### 4.10 Wells, pumps, springs — **M**

Independent of the rest of the phase. Water is not finite. Several access points
scattered widely. Upgrades toward less manual fetching, then hoses, then sharing
water with neighbours — which is the most literal possible expression of this
game's economics.

### 4.11 Boats — **L** — ◐ platform-height prerequisite built

Depends on 4.9, placed-entity persistence, and platform-height sampling. Round
one is a canoe or kayak. The houseboat-to-mega-yacht extension is parked until
lakes are large enough to justify it.

**The real cost is platform-height sampling** — the avatar's ground sampling
accepting a platform height instead of always reading the terrain field. That is
shared with every future building you can stand on, so do it once, properly.

Player and land-critter grounding now consult a shared bridge-deck height before
terrain, including the bridge's arch. Boats and general placed-entity platform
persistence remain.

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

## Phase 6 — Becoming someone: avatars, identity, multiplayer

**Tracked in their own docs to avoid double-maintenance — this section is a
pointer, not the plan.** Both docs carry locked decisions up top, a
conflicts-with-fixes list, and lettered phases with acceptance criteria, in
this roadmap's spirit.

**Scheduling correction:** the multiplayer plumbing no longer waits here in
chronological order. MP.1–MP.3 run in the parallel lane above while Phases 2–5
continue; Phase 6 remains the home of the broader identity, social, and public
world work.

- `communal-multiplayer.md` — the communal layer (what made Glitch/Second
  Life work), identity plumbing, persistence, moderation phases, directory.
  **Phase A shipped 2026-08-10**: paper passports (`accountId`), JSON room
  persistence, `makerId` on placed pieces, protocol v2.
- `avatar-and-identity.md` — the avatar editor, wardrobe, player cards,
  discoverability permissions. **Phase A shipped 2026-08-10**: the full
  step-flow editor (shape → paper → pattern → draw, custom outlines,
  keyword search), shape compile pipeline (`npm run shapes:compile` /
  `shapes:watch` from `assets/avatar-shapes/`), wardrobe store.
  **Phase B shipped 2026-08-15**: designs rasterize onto the avatar plane
  via `src/game/avatarLook.ts`, settings cog → "Change how you look…",
  first-run pass for new players; the shape pipeline now fits artwork from
  any viewBox (58 shapes), and **stamps** landed — 39 pre-drawn details a
  player places, including arms, legs and hair that hang outside the cutout
  (the sheet grew to 130 × 180 around a 100 × 140 cutout box to make room). Next up is **Phase C — wardrobe UI, then the
  closet**: C1 is the panel (save slots, rename, duplicate, wear, delete,
  per-design share toggle); C2 makes the wardrobe a **buildable closet in
  your house** that displays the looks you chose to share. Tiers are style
  and display only — never capacity (decision 2026-08-15, §2.3).
- `multiplayer-readiness.md` — the wiring checklist for the first two-player
  slice; still accurate, item 4 (persistence) now done.

The cross-dependency to keep in mind: avatar Phase D (designs over the
wire) needs multiplayer Phase B (wire the slice) first; everything else in
the two docs proceeds independently of this file's Phases 1–5.

## Parking lot

Good ideas. Not now. Each one has a reason it is parked — the reason is the
useful part, because it tells you what would have to change for it to move.

| Idea | Parked because |
| --- | --- |
| Diary annotation and highlighting UI | Needs a diary with entries in it first (2.4). The *data shape* is not parked. |
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
3. **Old-house disposition when a player moves** — leading answer is that it
   reverts to a starter house for a new player, avoiding abandoned-lot blight.
   *Blocks moving; see `land-and-dwellings.md`.*
4. **Whether wild critter friendship is location-bound** — leaning yes, because
   home ranges are what make attachments have a place. *Cheap now, and it
   changes what friendship means, so decide before friendship is built out.*
5. **Whether famous original landmarks become permanent prime real estate**, or
   whether making them reachable-from-anywhere defuses it.
   *See `land-and-dwellings.md`.*

**Settled 2026-08-04, previously listed here:** specialty shops differ by
**geography** only; the mailbox and base Thing Maker are **given automatically**
and mail is an **inbox, not an address**.

---

## If you only do one thing

**Finish MP.3 — the invite-only alpha shell.** MP.2's player-triggered
screenshot feedback, offline Retry, private review desk, redacted export, and
restart recovery are proved. Join codes, honest connection states, failure
recovery, and clean solo return are now built and locally browser-proved. Next
add host removal, mute/block, deployment configuration, and the hosted
`https://`/`wss://` smoke. Colyseus 0.17 and its clean audit are already in place.

Phase 1 is complete as infrastructure. Future furniture, decoration, clothing,
building, and structure plans are content within their respective creation
slices, not another plan-acquisition phase.
