# Next Session

Written 2026-08-03, end of a long day. Start here in the morning.

## Where things stand

Everything typechecks, 147 tests pass, the build is clean. The prototype is in a
good playable state.

Landed today:

- **Scrapbook** is a bottom strip of ripped paper with category tabs; closing it
  gives a clean screenshot view. Help `?` and settings cog top-right.
- **Critters** have per-species idle actions, hold still while you talk to them,
  wade instead of walking on water, avoid buildings and trees, and now walk
  *around* obstacles rather than pressing into them.
- **Gardening** is a real loop: dig, sow, grow through stages, lift, refill.
  Plant-mode overlay explains why a spot is refused.
- **World** uses continuous biome + elevation fields instead of per-page hashing,
  with torn page edges.
- **The player has collision** as of tonight — this is the newest thing and the
  least play-tested.

## Tomorrow, in order

### 1. Put this under version control (30 minutes, highest value)

~13k lines with a manual `.backup/` folder. Tonight involved three thrown-away
approaches inside one file; each one was recovered by hand. `git init`, one
commit, done. Nothing else on this list is as cheap or as protective.

### 2. Play-test the two new movement systems

They are the freshest code and the only way to judge them is to walk around.

- Does player collision ever feel *sticky* — the house porch, the gap between
  the Thing Maker and the display wall, the treeline?
- Do critters take sensible routes, or visibly loop?
- Watch for the 22-unit steering cutoff being noticeable.
- Check every cursor kind after last night's fix: `default`, `attach`, `build`,
  `chop` were the broken ones; `hand`, `dig`, `garden` were always fine.

### 3. Your art tuning pass

All small, all yours, none blocking:

- Hoe and scissors framing in `src/game/toolPresentation.ts` (`width`, `left`,
  `top`, `rotate` per tool).
- Garden cursor hotspot — `--hotspot-x` / `--hotspot-y` in `styles.css`,
  currently borrowing dig's `-42% / -70%`.
- Plant slot icon and seed-pouch art.

## The real gap

Three of the four things you named on day one still aren't started. Worth
picking **one** and going deep rather than touching all three:

- **Exchange / economy** — only the Wood Mill exists, and it doesn't trade yet.
  How you earn, what you spend, what a shop feels like to walk into.
- **Building placement** — the footprint system now knows what's solid, which is
  most of what placement needs.
- **Harvest and regrowth maths** — the multiplayer scarcity question: how fast
  things grow back so several people harvesting the same clearing never strips
  it, without anyone standing around waiting. Blocked on nothing but a decision.

Designs already written and waiting: `mining-and-caves.md` (needs world map
layers first), `water-and-waterways.md` (rivers, lakes, boats, fish).

## Two things to keep an eye on

- **`isSolidAt` costs ~0.43µs and runs per frame.** If it creeps back up, the
  symptom is *broken clicking*, not stutter. `critterBehavior.test.ts` fails if
  the per-frame query budget is exceeded — believe it.
- **Page groups are kept, not disposed**, so very long walks grow memory. Fine
  for now; revisit when pages get heavier.
