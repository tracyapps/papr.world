# Land, Dwellings, and Moving

Captured 2026-08-06, deliberately **before** multiplayer work starts, because
every decision here is expensive to retrofit once two people share a
neighbourhood and one of them has built a house.

Design intent only. Nothing here is built.

## The problem this document is arranged around

Two things have to be true at once, and they pull against each other:

1. **Everyone must feel they have room.** Room to expand a house, start a
   garden, run a small farm, landscape. Without that, building is anxious.
2. **The world must not become a grid of "mine, keep out."** The whole social
   contract is *"come see what I made"* (`game-design-plan.md`), and fences are
   the opposite of that.

Most games solve (1) with land ownership and then live with (2) forever.

## The reframe: spacing, not ownership

**Nothing is owned. Some things simply cannot be built too close together.**

A house may not be placed within a certain distance of:

- another player's house,
- a shop, landmark, or set piece,
- water and other protected footprints.

That is the entire rule. It is **zoning, not property**, and the difference is
the whole design:

- The protected thing is the **gap**, not a parcel. Nobody holds title to it.
- The gap is fully usable by anyone — walk it, garden it, plant in it,
  decorate it, sit in it. It just cannot have a house on it.
- Therefore there is no boundary to defend, no trespass to resent, and fencing
  accomplishes nothing mechanically. If a fence gets built it is because it
  looks nice.

**This is the existing footprint system with a larger radius.** Shops,
landmarks, water, and placed objects already protect their footprints from
digging (`game-design-plan.md`). Houses join that list. No new concept.

### Why this beats a parcel

A parcel says *"this is yours."* Spacing says *"there is always room."* They
produce the same elbow room and opposite feelings. The second one is also
honest: what the game is actually guaranteeing is not a possession, it is a
**guarantee against crowding.**

## Non-rivalrous improvement

**Taking from an improvement never deprives the person who made it.**

The reference case, and the one that prompted this: **harvest a garden someone
else planted, and they receive the same yield in their mailbox.** You get the
crop. They get the crop. The garden was worth planting either way.

This is not a new principle. It is the one already settled for plan sites
(`knowledge-tree.md`): *a site yields for every player who does not already
hold that plan; the first to find it takes it from nobody.* Gardens are that
rule applied to things players make rather than things the world hides.

Stated generally, and worth holding as the spine of shared space:

> **An improvement to the world yields for everyone who engages with it.
> Improving land is never a gift you can be robbed of.**

The consequence is the vibe the whole document is chasing: a garden near a path
reads as a **community garden** by default, because there is no version of
events where a passer-by harvesting it hurts you. Nobody has to decide to be
generous. The mechanic is generous, so the players get to be relaxed.

### What this should extend to

Harvesting is the clearest case, but the principle should be checked against
everything shared:

- Trees someone planted, and the trimming yield from them.
- Paths, bridges, and stairs someone built across awkward ground.
- Water access someone dug or piped (`water-and-waterways.md`).
- Decoration and landscaping — which cost the passer-by nothing already, and
  should never become damageable.

**Nothing a player builds may be destroyed or degraded by another player.** Not
as a permission setting — as a fact about the world. This is what makes the
absence of fences safe rather than trusting.

### The watch item: generosity as a strategy

Honest flag, unresolved.

If harvesting your garden gives us both a full yield, then two players who
harvest **each other's** gardens receive 2× what they would get harvesting their
own. That is the precise shape of the failure mode `economy.md` is arranged
around — *"making generosity a strategy."*

Three reasons it may be fine as-is:

1. Cooperation being efficient is the stated goal, not an exploit.
2. There is no competition for it to unbalance — no leaderboards, no scarcity,
   no PvP.
3. **The no-tallies rule does mechanical work here.** A player cannot see a
   session total, an earnings summary, or a yield history, so the 2× is not
   visible, not comparable, and not optimisable without the player keeping their
   own spreadsheet. The refusal to count is what keeps this from becoming a
   loop.

Alternatives if it does misbehave in play, weakest intervention first: mirror
once per growth cycle regardless of harvester; mirror a smaller share to the
planter; mirror a "someone tended your garden" note plus a token rather than a
full yield.

**Do not pre-emptively nerf this.** The generous version is the one that creates
the feeling, and the guardrails above can be added after watching it.

## Starter houses and neighbourhoods

Every new player gets a **starter house, placed for them** in a neighbourhood,
alongside the mailbox and base Thing Maker they already receive automatically
(`economy.md`).

Two properties matter:

- **You begin with everything you need.** Nobody has to earn the right to a
  home, and nobody spends their first session hunting for somewhere to exist.
- **Neighbourhoods share the biome they sit in**, so house styles and materials
  fit their landscape. This already matches
  `game-design-plan.md`: *"each neighbourhood has a material theme and seed."*

A player can be perfectly happy never leaving: expand the starter house, furnish
it, paint it, landscape around it. The starter house is a real home, not a
tutorial hut.

## Moving

The wanted behaviour, taken from Glitch: after a while you know the world, you
find a biome you love, and you want to **live there instead**.

By then a long-time player has advanced tools and the knowledge tree nodes a
built-from-scratch dwelling requires. Moving is therefore a *late* expression of
competence, not a menu option — which is the right shape for it.

### Home is where the mailbox is

**There is exactly one mailbox, and it is wherever you live.** Moving does not
leave a mailbox behind at the old house — it physically comes with you. The old
house keeps standing; it simply stops being *home*.

Everything that points at "home" therefore updates on the move: wayfinding
signs, the compass, the map, the places panel.

**This already exists in code.** `world/places.ts` has `HOME_PLACE_ID`, created
at the spawn point, renameable but never removable, and it already feeds signs,
the map, and the saved-places panel. Moving house is **moving that one place
record** — not a new wayfinding system. Anything reading it updates for free.

### The ritual: planting the mailbox

Planting your mailbox at the new site is the gesture that begins a move. It is
warm, it is legible, and it is exactly the kind of small ceremony this game
should have.

**One correction, so this does not quietly undo a settled decision.**
`economy.md` established that **mail is an inbox, not an address** — things sent
to you arrive wherever you are, nobody can miss a gift because they moved, and
crucially *this is what decoupled mail from placed-entity persistence so it could
ship early.*

So: **the mailbox is the ritual, never the plumbing.** Planting it marks the
move and starts the new home. The inbox keeps working throughout, unchanged, and
mail never depends on where the object stands. Keep the ceremony; do not let it
become a dependency.

### Open questions on moving

These are genuinely unresolved and are logged so they are not rediscovered:

1. **What happens to the old house?** Leading answer: it **reverts to a starter
   house** for a future new player. This avoids abandoned-lot blight — a real
   problem in games of this kind, and one Glitch had — and it is consistent with
   the anti-hoarding rules everywhere else: **you cannot hold two homes.**
   Alternatives are that it stays as an empty shell someone can claim, or that
   it is dismantled back into materials.

2. **Do befriended critters follow you?** The current lean is **no, and that is
   the point.** `critter-design.md` gives critters small home ranges on purpose,
   so that attachments have a place attached to them — *"Bandit should always be
   near the house."* A friendship you built is partly with a location. Moving
   away and coming back to visit is a warmer story than packing your friends,
   and it gives long-distance travel an emotional reason to exist.

3. **Do pets follow?** Distinct from wild friends, and the lean is **yes.** A
   **pet carrier** as a plan-made item is a lovely object and gives the move a
   piece of preparation to do. This is also the natural place for the wild/pet
   distinction to become mechanical rather than vibes.

4. **Can you move again?** Presumably yes, and freely. Any cooldown would exist
   only to stop something, and it is not clear what.

5. **Does a neighbourhood fill up?** *Answered below* — at capacity the next
   neighbourhood opens adjacent. Nobody densifies and nobody is turned away.

6. **Are the best spots contested?** Land near shops, water, or a landmark is
   more desirable, and spacing rules make desirable spots genuinely finite. This
   is the one place the "there is always room" promise could ring hollow.

   Partly answered by clustered growth below — new neighbourhoods bring their
   own shops and landmarks with them, so desirability is reproduced rather than
   competed for. What remains open is whether *specific* famous places (the
   original Wood Mill, say) become permanently prime real estate. Mitigations to
   consider: make the desirable thing **reachable from anywhere** rather than
   adjacent to anywhere, which the transporter design below also serves.

## The world always grows

Settled in principle 2026-08-06: **the world is unbounded.** More players means
more world, not competition for a fixed amount of it. It is made of paper, so it
is allowed to be bigger on the inside.

### This is already how it works

Worth stating plainly, because it changes the estimate: **the infinite world is
mostly already designed and partly already built.**

`technical-plan.md` specifies stable page ids, integer page coordinates,
deterministic generation from page seed plus local coordinate, and player edits
layered on top of immutable generated data. That is precisely the mechanism
behind every game with an endless world: the world is **not stored, it is
computed** — a pure function of coordinates and a seed, generated on approach,
with only modifications persisted.

`multiplayer-readiness.md` already notes the consequence: clients agree on page
contents without syncing them. The property that makes the world infinite is the
same one that makes it cheap to network.

**So there is no "build an infinite world" task.** There is only: keep page
generation pure, keep edits as deltas, and never introduce anything that assumes
a global bounded extent.

### What is not free

- **Storage scales with modification, not with area.** Empty world is free;
  every dwelling, garden, path, and dug cell is a stored record. The budget to
  watch is *built things per player*, not square kilometres.
- **Wayfinding at scale.** A world you can always explore further into is a
  world you can be lost in. The saved-places registry, signs, and the eventual
  map are what make bigness pleasant rather than exhausting — they are not
  polish, they are the thing that makes the size survivable.

### The real constraint is social density, not size

This is the part that needs a decision, and it is not a technical one.

A world large enough that you can always explore more is also large enough that
**nobody ever wanders past your garden.** That breaks the social contract the
game is built on — *"come see what I made"* requires somebody near enough to
come. Endless worlds routinely produce lonely ones.

**Proposed resolution: unbounded to explore, clustered to live.**

- The **wild world** extends forever in every direction, generated on demand.
- **Dwelling is clustered.** New neighbourhoods are sited adjacent to already
  settled ones, so the built world grows outward like a town rather than
  scattering like dust.

This also answers the neighbourhood-capacity question above (open question 5):
a full neighbourhood does not densify or turn players away — the next
neighbourhood opens next door.

The result is that you can walk for a day and find nothing but world, and also
walk five minutes and find three neighbours. Both are true at once, which is the
combination Glitch had and endless-world games usually do not.

## Travel: vehicles and transporters

Advanced knowledge tree nodes should unlock ways to cross the world faster —
vehicles first, then transporters that jump between distant regions, so the far
biomes (mountains, tundra, crystal caves) are reachable in a sitting.

### The rule that keeps the world worth having

**A transporter may only connect places you have already walked to.**

A transporter that goes *anywhere* collapses the world it is built on: if
distance costs nothing, exploring is pointless and the endless world becomes a
loading screen. Requiring that you got there once, on foot, preserves the thing
that made the size valuable — and reframes travel tech as being about
**revisiting**, not discovering. Coming home is the problem it solves, not
going out.

**This is a small build, because the destination list already exists.**
`world/places.ts` holds saved places, `M` is already bound to "mark this spot as
a saved place," and signs, the map, and the places panel already read from it. A
transporter network is a new use of that registry, not a new registry.

### Dependencies worth knowing before starting

- **Vehicles share their real cost with boats.** Roadmap 4.11 identifies
  platform-height sampling — the avatar accepting a platform height instead of
  always reading the terrain field — as the expensive part, and explicitly notes
  it is shared with everything you can stand on. Land vehicles, boats, and
  buildings all want it. Do it once, properly.
- **Mountains and caves are gated elsewhere.** Climbable mountains are a
  prerequisite for snow and cold regions (roadmap parking lot), and caves sit
  behind the deferred map work in Phase 5. Travel tech can arrive before the
  destinations do, but the destinations are the longer pole.

## What this constrains, technically

Logged for `multiplayer-readiness.md`, because these are data-shape decisions
and the document's own advice is to settle those before wiring the socket:

- **A dwelling is a placed entity with an owner and a position.** That makes
  placed-entity persistence load-bearing for homes, as it already is for boats
  and buildings.
- **Spacing is a placement validation rule**, so it belongs in `shared/`
  alongside the other rules both client and server enforce — the client for a
  responsive "you cannot build here," the server as the authority.
- **Improvements need an author.** The harvest mirror requires knowing who
  planted a garden, so authored things carry a maker id from the first version.
  This is also what `game-design-plan.md` wants for crediting makers, so it pays
  for itself twice.
- **The mirror is a mail write**, which the inbox design already supports
  without placed entities.
- **Moving house is a write to the existing `HOME_PLACE_ID` record**, not new
  wayfinding. Everything reading saved places updates for free.
- **Nothing may assume a bounded world extent.** Page generation stays a pure
  function of page id plus seed; edits stay deltas layered on top. This is
  already the plan in `technical-plan.md` — the requirement is to not
  accidentally break it, e.g. with a global height field, a fixed page table, or
  a map that assumes known bounds.

## Decisions owed

1. Old-house disposition (open question 1) — blocks nothing today, blocks moving.
2. Whether wild critter friendship is location-bound (2) — cheap now, and it
   changes what friendship *means*, so it wants deciding before friendship is
   built out.
3. Whether famous original landmarks stay permanently prime real estate (6), or
   whether reachability defuses it.

*Neighbourhood capacity is no longer open: the next neighbourhood opens
adjacent.*
