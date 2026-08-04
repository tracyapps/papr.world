# Next Session

Written 2026-08-04. Start here.

## Where things stand

Everything typechecks, 179 tests pass, the build is clean. Under git now.

Landed today:

- **Renewable trees.** `trim` is live. Growth is derived from time, never
  ticked; a tree is never destroyed. Kids scissors refuse redwoods, which is
  what sturdy scissors are for. See `prototype-progress.md` → "Renewable
  Trees".
- **Tool ladders.** Tier and family are data, never parsed from a name — so
  tools can be renamed to follow their artwork without reordering anything.
  Shovels now have three rungs (the dig system has exactly three geology
  layers, so that ladder is complete).
- **Plans are real.** `STARTER_PLAN_IDS` is derived from tier-1 recipes
  rather than hand-written. The Thing Maker shows every rung of every ladder
  with a plan slot on each — dashed when unfound, solid when held.
- **One rung at a time.** Tier N needs tier N-1 in hand.
- **Folding Hook deleted**; Tape Tapper and Crease Scout hidden behind
  `status: 'unimplemented'`, which is now the single readiness switch.

## Do this first

### 1. Play-test trimming (still unverified on screen)

Nothing below has been seen running. Make Kids Scissors, press 4, walk into
the treeline.

- Does clicking a tree feel like it hits the tree you meant? Picking is
  reach-filtered raycast with a 48px screen-space fallback — the fallback may
  be too generous in a dense forest.
- Watch a cut tree for five minutes. Does regrowth read as growth, or as a
  mesh quietly rescaling?
- Redwoods should barely change height. Check one against a neighbour.
- The `chop` cursor was one of the four broken before the cursor fix; this is
  the first thing to use it.

### 2. Look at the new Thing Maker panel

It is functional but has had no design pass — that was the agreed split.

- Every ladder is `open` by default. Probably wrong once there are five.
- The rungs are `<details>` inside `<details>`. Native, keyboard-operable,
  correctly announced — but two levels of disclosure may be one too many.
- The plan slot's ghost mark is a CSS clip-path placeholder, not your icon.
- Scissors art has no `activeLift`/`activeBadgeLift`, so slot 4 does not
  rise on select like slots 2 and 3.
- The two new shovels borrow the flimsy shovel's exact art framing.

### 3. Player collision (critter pathing is signed off)

**Critter pathing was play-tested across 2026-08-03/04 and is working.** Done.

Player collision has still not been deliberately tested.

- Does it ever feel *sticky* — the porch, the Thing Maker gap, the treeline?

## The real gap

Two of the four day-one things are still unstarted. Harvest and regrowth is
now done.

- **Exchange / economy.** Only the Wood Mill exists and it does not trade.
  This now also blocks the owl who sells plans — see
  `plans-and-blueprints.md`. The open question is what she wants in exchange;
  "a rare paper she cannot get herself" needs no currency type at all, which
  makes it the cheapest way in.
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
