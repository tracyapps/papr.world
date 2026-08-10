# Next Session

Written 2026-08-07, updated 2026-08-08 after the learning flow landed.
Start here.

> **Roadmap 1.1 through 1.4 and the 1.6 deadlock guard are built and
> play-tested.** The seven-branch
> shared timeline now has its first visual design pass, compact visible
> requirements, selectable cards, and the complete one-at-a-time learning
> flow: persisted real-world clock, finite task jumps, Professor state, and
> tool-plan grants on completion. Tool plans now have one explicit source,
> cannot leak into world siting, and locked Thing Maker rungs link directly
> to their Professor lesson.
>
> **One inference to confirm or correct:** the merge from 10 branches to 7
> included folding Woodworking + Building & Tinkering + Structures &
> Architecture into one "Building & Construction" branch. The owner only
> explicitly asked for the Fiber Arts + Art & Design merge — this second one
> was read from the mockup PDF showing exactly seven colour bands with no
> separate Woodworking label. If that's not what was meant, it's a branch
> reassignment away from being split back out.

## Where things stand

Everything typechecks; the full tests, stylesheet/content checks, production
build, and direct browser check of the progression handoff are clean.

Landed:

- **The knowledge tree and learning flow.** Six playable nodes (one per
  existing tool), one persisted active lesson, real-world progress, finite
  task credit, automatic completion, and tool-plan grants.
- **The Thing Maker now closes the loop.** Missing advanced tool plans say
  they are learned with the Professor and route directly to the matching
  lesson. Tool plans are rejected by the world-siting route at both the
  catalog filter and direct-call boundary.
- **Progression deadlocks are catalog failures.** Tests reject a tool recipe
  or lesson task that depends on the tool it is meant to unlock.
- **The tree redesigned twice more, same day (2026-08-07):** first to 10
  branches, then to 7 branches on one shared-timeline grid (column position
  derived from the prerequisite graph, not hand-positioned) with
  requirement text moved to `.sr-only`.
- **The Professor is now a small 3D character (2026-08-08)**, not CSS
  shapes — his own tiny Three.js scene rendered into a canvas inside the
  HUD widget, blinking on his own clock. See `professorRig.ts`.
- **Every HUD widget can be nudged by keyboard** (Alt+Arrow, Alt+Shift+Arrow
  for finer) and **collapsed away**, not just dragged. Built for the
  Professor; minimap and compass got it for free.
- A small `hud.ts` fix so a widget's own buttons (the Professor's open/
  collapse controls) behave like buttons instead of starting a drag.

## Do this first

### 0. Play-test the 3D Professor (also unverified — no browser in this sandbox)

`npm run dev`, look for him top-centre of the HUD.

- Does he actually blink, and does the rest state (not mid-blink) look calm
  rather than shocked? That was the whole point of this pass.
- Do the paperclip loops behind him read as a paperclip at 56px, or as an
  unclear grey smear? This is the piece most likely to need a second pass —
  it's the least literal translation from the SVG.
- Does the graduation cap read as a cap? It's a flat diamond facing the
  camera dead-on (matching the SVG, which draws it the same way) rather
  than a perspective-correct board — worth checking that reads as
  intentional and not as a floating black tile.
- Watch him for 10+ seconds. Does the idle sway feel alive without being
  distracting at icon size? Is the blink interval (~4.4s) too frequent, too
  rare, or about right?
- Click the collapse toggle, wait a few seconds, bring him back. Does he
  resume cleanly, still blinking, still sized correctly? (The canvas
  measures zero while `display: none`, then re-measures on the first frame
  back — that's the part most likely to misbehave if it's going to.)
- Two live WebGL contexts now exist on this page — his and the world's.
  Does anything else feel like it dropped frames?

### 1. Re-check the knowledge tree and learning flow

`npm run dev`, then look for the paperclip at top-centre of the HUD.

- Click the Professor. Does the tree open full-screen with seven stacked
  branch rows (Caring for the Land, Materials, Building & Construction,
  Interior Design, Fine Arts & Textiles, Cooking, Transportation), each on
  the *same* shared set of timeline columns? Scroll right — do all seven
  rows' columns move together, staying lined up?
- Find two cards in different branches sitting in the same column (started
  together) and one card pushed further right than its branch-mates because
  it needs something from another branch first. Does that read as
  intentional timeline structure, or just as ragged spacing?
- Only 6 cards across the whole tree are real ("Learned"/"Ready to
  start"/"Locked"); everything else reads "Not yet in the game" in a
  visibly different, dotted-border card. Does that distinction land, or does
  it read as broken/unfinished rather than intentional?
- The requirement sentence is now screen-reader-only — nothing shows on
  screen for a locked card except an empty indicator hook. With a screen
  reader (or the accessibility tree in devtools), does the requirement
  sentence still read correctly, still naming the source branch for a
  cross-branch requirement (e.g. "Needs: Growing Food (Caring for the
  Land)")?
- On a fresh save the tier-1 real nodes should read "Learned" already
  (starter plans already grant those tools) — is that legible, or does it
  read as a bug?
- Focus the Professor (Tab to it, or click then don't drag) and try
  Alt+Arrow. Does he nudge smoothly? Try Alt+Shift+Arrow for the finer step.
  Same on the minimap and compass.
- Click the small tab at his bottom-right corner. Does he shrink to a dot and
  come back cleanly?
- Open the tree, then press Escape with focus on the close button, then again
  with focus elsewhere in the card. Does it close from anywhere?
- Read a locked card (Digging 2, Digging 3, Trimming 2) end to end as if you
  had never seen the design doc. With no visible requirement text now, is it
  still clear *why* it's locked, or does it need that visual indicator
  before it makes sense at a glance?
- The paperclip, cap, and glasses are placeholder CSS shapes, not art — is
  the silhouette readable at a glance regardless?

### 2. Play-test trimming (still unverified on screen)

Make Kids Scissors, press 4, walk into the treeline.

- Does clicking a tree feel like it hits the tree you meant? Picking is
  reach-filtered raycast with a 48px screen-space fallback — the fallback may
  be too generous in a dense forest.
- Watch a cut tree for five minutes. Does regrowth read as growth, or as a
  mesh quietly rescaling?
- Redwoods should barely change height. Check one against a neighbour.
- The `chop` cursor was one of the four broken before the cursor fix; this is
  the first thing to use it.

### 3. Look at the Thing Maker panel

It is functional but has had no design pass — that was the agreed split.

- Every ladder is `open` by default. Probably wrong once there are five.
- The rungs are `<details>` inside `<details>`. Native, keyboard-operable,
  correctly announced — but two levels of disclosure may be one too many.
- The plan slot's ghost mark is a CSS clip-path placeholder, not your icon.
- Scissors art has no `activeLift`/`activeBadgeLift`, so slot 4 does not
  rise on select like slots 2 and 3.
- The two new shovels borrow the flimsy shovel's exact art framing.

### 4. Player collision (critter pathing is signed off)

**Critter pathing was play-tested across 2026-08-03/04 and is working.** Done.

Player collision has still not been deliberately tested.

- Does it ever feel *sticky* — the porch, the Thing Maker gap, the treeline?

## The real gap

One of the four day-one things is now a playable first slice. Harvest and
regrowth is done, and exchange has a seed-shop foundation.

- **Exchange / economy.** Pip’s Seed & Garden now persists shiny chips, names
  explicit buy/sell stock, and supports flat-price buying, selling, and equal
  barter. The next economy work is generalising the first catalog beyond seeds
  and giving another shop the same commands. The owl is still waiting on that
  broader stock/plan layer — see `plans-and-blueprints.md`.
- **Building placement.** The footprint system knows what is solid, which is
  most of what placement needs. The owl's easel would be its first real test.

Also newly wanted, cheap, and warm: **critters who know things** — a plan they
found, or which material only grows here and what tool it takes. Reuses the
friendship and conversation systems instead of adding machinery, and makes
friendship pay off in something other than dialogue. Probably the best next
feature by effort-to-delight.

**Done 2026-08-04:** `catalogs/obtaining.ts` now answers "how do I get this?"
in one place, and critters can quote it — see `docs/single-source-of-truth.md`.
`forest-bark-curls-knowledge` in `conversations.json` is the worked example;
walk into a forest and talk to someone.

Designs written and waiting: `mining-and-caves.md` (needs world map layers),
`water-and-waterways.md`, `plans-and-blueprints.md`, `biome-knowledge.md`.

## Keep an eye on

- **`isSolidAt` runs per frame.** If its cost creeps up, the symptom is
  *broken clicking*, not stutter. `critterBehavior.test.ts` fails if the
  per-frame query budget is exceeded — believe it.
- **Tree recovery re-poses on a 500ms throttle** over only the trees that are
  mid-regrowth. If that set ever grows large, it is the thing to watch.
- **Page groups are kept, not disposed**, so very long walks grow memory.
- **The multiplayer harvest allowance is not built** — only the shared half
  of the scarcity model. Additive when needed, not a deferred refactor.

## Set up docs.papr.world

`vercel.json` is committed and `npm run docs:build` works. To publish:

1. New Vercel project pointed at this repo. It will read `vercel.json`
   (build `npm run docs:build`, output `docs-site`).
2. Add `docs.papr.world` as a domain and point the DNS CNAME at Vercel.
3. Push. Every push regenerates the site from that commit's catalogs.

Nothing to maintain afterwards — the site is a function of the code.

## Collision audit (2026-08-04)

Static audit rather than play-testing — the sticky treeline had a findable
cause. A tree's dig footprint (0.52, redwood 0.8) was also its *physical*
footprint, while the trunk it draws is 0.28. With a 0.22 player body you
stopped 0.74 units from the centre of a tree less than a third that wide.

`DigFootprint` now takes optional `solidRadiusX`/`solidRadiusZ`, defaulting to
the dig radius so nothing that did not opt in changed. Trees opt in at trunk
width. Roots still block digging; the trunk blocks walking.

Worth checking on screen:

- The treeline should now let you brush past trees rather than bounce.
- Squeezing *between* two trees should work — the gap is 1.04 units wider
  than it was.
- Critters use the same query, so their pathing loosened too. It looked good
  before; make sure it did not become "walks through the tree".
- `slideMove` tries the X axis before Z when a diagonal is blocked, so an
  inside corner always slides sideways first. Consistent, not wrong, but it
  is the thing to look at if a corner feels odd.
