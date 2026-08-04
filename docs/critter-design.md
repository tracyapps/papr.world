# Critter Design

## Solid vs Dig Footprints (2026-08-03)

Critters used to walk through walls and trees, and the clearing cat had taken
to standing inside the Thing Maker — visible from behind as, in the bug report's
words, "only a butt."

The fix reuses the existing footprint registry rather than adding a second
collision system, but the two questions it now answers are genuinely different:

- **`findDigFootprintBlocker`** — *can I dig here?* True for anything already
  occupying the ground, including loose material.
- **`findSolidBlocker` / `isSolidAt`** — *can I walk here?* True only for
  footprints flagged `solid`.

A twig bundle blocks digging (there is already something lying there) but a
squirrel should walk right over it. The Thing Maker blocks both. The pond is the
mirror case: not diggable, but walkable — critters wade, and water avoidance
lives in `world/water.ts`, not here.

### Going round, not just stopping

Refusing to pass through a wall is only half of it. A critter whose friend is
standing on the far side still pressed into the wall and looked stuck.

`steerAround` fixes that with a **committed waypoint**: when the goal can't be
walked to directly, pick a point off to one side, walk to that, then re-decide.
Three details, each of which was wrong at least once:

- **Waypoints, not per-frame angles.** The first attempt steered at a fixed
  angular offset from the goal direction. That direction rotates as the critter
  moves, so the offset rotated with it and the critter span on the spot at
  exactly its turn rate. A waypoint is fixed in world space and therefore
  stable.
- **Short legs (3.2u), long sight (9u).** The side is chosen by probing far
  enough along each direction to find where the goal comes back into view — the
  near end of a wall. But only one short leg of that is committed before
  looking again, so the critter hugs the obstacle and cuts the corner instead
  of arcing out into open ground.
- **The detour is dropped only when the *whole* line to the goal is clear.**
  Checking a short lookahead instead cancels the detour every frame while the
  critter is beside the wall, putting it straight back into it.

Routing is deterministic. Critter positions are never synced — every client
re-simulates from the same seed — so a route that consulted the rng would put
one animal in two places for two players standing together.

### Navigation has a query budget

**`isSolidAt` costs about 7µs.** It walks the page registry, and that is the
governing constraint on how navigation may be written.

The first version of the detour code probed the whole path every frame for
every active critter: roughly **18ms per frame**, the entire 60fps budget. The
world still rendered, so it didn't look like a crash — it looked like clicking
had stopped working, because at single-digit frame rates clicks land between
frames.

Three things keep it cheap, and `critterBehavior.test.ts` asserts the budget
rather than trusting it:

- **The direct-path check is throttled** to ~3/second per critter, staggered so
  a clearing full of critters doesn't re-check in lockstep. An animal deciding
  which way to walk does not need 60 opinions a second.
- **Sight probes use a coarser stride** (0.5 vs 0.25). Deciding *which way
  round* tolerates imprecision; deciding *whether the next step is safe* does
  not, and that one keeps the fine stride — a tree trunk must not fall between
  two samples.
- **Beyond `STEER_RANGE` (22u) critters don't steer at all**, only refuse to
  pass through things. Navigation quality nobody can see isn't worth paying
  for.

Worst case is now under 4 queries per critter per frame.

Two defects underneath made each query far worse than it needed to be, and both
were pre-existing — the new per-frame caller is just what exposed them:

- **The footprint list was rebuilt on every call.** Mapping every prop on nine
  pages and re-pushing the clearing's 15 trees and 4 shrubs, every time anyone
  asked. Props never change after a page is built, so it is now a `WeakMap`
  cache keyed on the page. 7.5µs → 0.43µs.
- **`getPage` generates a page that isn't loaded yet.** A critter probing a few
  steps ahead near a page seam triggered full procedural generation of the
  neighbours, mid-frame, and kept doing it as it wandered — building world
  nobody had walked to. Movement queries now use `peekPage`, which never
  generates: an unloaded page has nothing drawn on it and can obstruct nobody.
  Digging and hover validation still generate, because those must answer
  correctly about a page that hasn't streamed in, and they run at click rate.

Three rules that keep the movement reading as an animal rather than a physics
body:

- **Steps slide, they don't stop.** `tryStep` in `critterBehavior.ts` tries the
  full step, then each axis alone. Sliding along a wall looks like an animal
  choosing to go round it; refusing the whole step looks like it walked into
  glass, and taking it anyway is how you get half a cat inside a building.
- **Bodies have width.** `isSolidAt` takes a radius (`CRITTER_BODY_RADIUS = 0.16`),
  so a critter stops short of a wall instead of clipping into it.
- **Boxed-in critters re-target.** A critter that can't move in any direction
  picks a new wander target rather than vibrating in place.

Spawns go through `nudgeToFreeSpot` (`core/placement.ts`), the deterministic
ring search shared with water. Seeded page coordinates know nothing about ponds
or buildings; nudging afterwards keeps the seed — and therefore multiplayer
agreement — intact. Flyers are exempt: nothing blocks a butterfly.

The player uses the same `slideMove` helper with a slightly wider radius (0.22
vs 0.16 — a bigger cutout, and clipping the corner of the house is more visible
at the camera distance you view yourself from).

**Being inside something is never a trap.** If the starting point is already
blocked — a building placed on top of you, a footprint that grew, a spawn that
landed badly — the move is allowed unconditionally so you can walk out. A
player wedged in a wall with no way to free themselves is a far worse failure
than briefly clipping through one.

## Conversation Holds Attention (2026-08-03)

While a critter's dialogue is open it enters an `engaged` state that outranks
idle: it turns to the player and holds an `attentive` pose. No wandering, no
idle rotation, no spontaneous flourishes.

An animal that strolls away mid-sentence, or drops into a grooming session
while its own speech bubble is on screen, reads as the dialogue being
disconnected from the creature saying it.

Details worth keeping:

- The engaged critter's id lives in `critterBehavior.ts`, not the dialogue
  module, so `updateCritter` can consult it without importing UI. The dialogue
  calls `setEngagedCritter` on open and close.
- **Petting from inside the dialogue still works.** A flourish already in
  flight is allowed to finish and then returns to `engaged` rather than
  falling through to idle.
- **`attentive` ignores `progress`.** Every other idle action arcs back to
  rest so it can chain into the next one; this one is held for as long as the
  player is reading and exited explicitly. An arc would drift the critter out
  of attention mid-sentence.
- **Butterflies cannot stand still** — hovering is their entire idle. Being
  spoken to instead pins their curiosity high and tightens their orbit, so
  they hold station beside the dialogue card rather than drifting off.

## Rig Structure Rule (2026-08-03)

**Every face part belongs inside the rig's `head` group.** Skull, nose, eyes,
ears, muzzle, beak, whiskers, mask patches — all of it.

This is not stylistic. Rigs originally added those parts as flat siblings of
the root group, so any head animation moved the skull alone and left the face
floating. `makeHead()` in `critterRigs.ts` builds the pivot by re-parenting
existing meshes, so adding one costs nothing visually.

Two corollaries:

- Pose `headGroup`, never the skull mesh inside it. Rotating or positioning
  the skull moves it *within* its own ears and eyes. This is not hypothetical:
  it shipped twice. The second time, the cat's `flourish` assigned the skull's
  pre-refactor Y and sent its head into orbit, and because the reset branch
  wrote the same stale literal, one pet broke that cat forever.
- **Never repeat a pivot literal in an animation.** Capture the rest transform
  at build time (`const headRestY = headGroup.position.y`) and offset from it.
  Any animation containing the same number as its `makeHead` pivot is one
  edit away from the bug above.

`src/game/critterRigs.test.ts` enforces this for every species: nothing inside
a head group may move, and a completed flourish must return to rest.
- Head, ear, and body-scale pose belongs to the idle action system
  (`critterIdle.ts`). A rig's `animate()` should only handle things idle
  actions don't touch: gait, tails, wings, blinking, nose twitches. When both
  write the same rotation they fight, and the last writer per frame wins.

Bodies are non-uniformly scaled to shape each animal. Anything that scales a
body must multiply against `parts.rest.body`, never assign an absolute 1.0.


Last updated: 2026-07-16

Critters are the heartbeat of the paper world: simple, quirky paper animals that make every page feel alive even in solo play. The long-term fantasy is emotional collecting — you befriend creatures because they're charming, never because a checklist demands it. Raccoons are a strategic priority.

## Current Species

All rigs are built from primitives plus swapped paper textures, face -z, and share one animate/flourish interface (`src/game/critterRigs.ts`), so behavior code never special-cases a species.

Squirrel: scurries, tail waves, sits up proudly for its flourish. Cream tail tip only — ringed tails are reserved for raccoons. Bushy-tailed brown-paper palette.

Butterfly: the original whimsy benchmark. Flies a lazy orbit, leans toward curious players. Widest texture palette (folded stripes, rainbows, bubbles, ribbon weave) so no two look alike.

Raccoon: gray paper coat, dark eye mask (non-negotiable), cream muzzle, ringed tail, and little hands. Its flourish is sitting up on its haunches and rubbing its paws together. When curious, it perks up and raises its tail. One coat variant wears an argyle pattern, because some raccoons are fancy. The clearing's resident raccoon is named Bandit and lives behind the starter house.

Bunny: hops (real movement arc, not just animation), ears flop with the hop and snap fully upright when curious, nose twitches. Comes in any paper color, because paper bunnies can.

Bird: hops with wing flicks, pecks idly (tipping forward beak-first, never through its own body), tilts its head at you, does a big wing-stretch shimmy. Bright wrapping-paper palette.

Cat: long, low, and self-satisfied. Almond eyes, whiskers, pink triangle nose and ear linings, tail with a dark curled tip that never stops talking. Coats include orange tabby (striped wrapping paper), calico (desert camo blobs), gray, black, cream, and one houseplant-print wildcard. Cats have a higher shyness floor than other species — most watch from a distance, but the bold ones are VERY bold. Their curious tell is the slow blink (a compliment), and their flourish is sitting up tall, wrapping their tail around their front, and closing their eyes. The clearing has a resident cat near the gift-wrap patch.

## Variation System ("critter DNA")

Every individual is generated from one seed (`src/game/critterVariation.ts`):

- Coat: body texture (or flat paper color) + accent color from a per-species palette.
- Scale: 0.82–1.22.
- Speed and animation phase offset (so groups never move in lockstep).
- Shyness 0–1: bold critters approach the player; shy ones just watch.
- Wander radius around a fixed home point.
- Name, picked from a cozy list (Button, Waffles, Crumple, Pockets...).

Seeds derive from page coordinates (`hashCoords(px, pz, salt)`), so spawning is deterministic: the same page always produces the same individuals with the same names. This is the multiplayer foundation — clients don't need to sync who exists, only live behavior state.

Adding variation later is cheap: new palette entries, new part toggles (hats! tape patches! one droopy ear!), all keyed off the same seed.

## Behavior Model

State machine per ground critter (`src/game/critterBehavior.ts`): idle → wander (pick a point within its home radius) → idle, with occasional flourish (~22% of idles), interrupted by curious whenever the player comes near. Flyers drift in a seeded orbit that leans toward a nearby player.

### Travel distance defaults

Convention from cozy games (Animal Crossing villagers idle within a few tiles; Stardew animals graze near their barn; MMO ambient critters leash to ~10–20m): small home ranges keep creatures findable, which matters once players form attachments — Bandit should always be near the house.

- Wander radius: species base 5–10 units, ±25% per individual. (One page is 50 units, so a critter effectively owns a corner of a page.)
- Curiosity radius: 3.5 units base.
- Arrive threshold 0.35; walk speeds 0.9–1.9 units/sec (player is 3.1).
- Anti-stuck: wander legs abort after 20s.

### Friendship effects (planned; hooks already in)

Points 0–100 per critter per player, persisted (localStorage now, server later — `src/game/friendship.ts`). Levels: stranger 0 / curious 10 / friend 30 / buddy 60 / pet 90.

Already wired: friendship shrinks shyness and widens the curiosity radius at spawn, so befriended critters notice you sooner and come closer.

Planned per level:
- curious: does its flourish when it sees you (greeting).
- friend: approaches to arm's length; occasional gift of a paper scrap.
- buddy: follows you for a short stroll around its home range (still leashes home).
- pet: player can rename it; visits your house; appears on your scrapbook's critter page; wander home can be re-anchored to your house.

Planned interaction verbs (gentle, no failure states): crouch/hold still (points for patience), offer a material, gentle boop. Interactions grant small points with a daily-ish soft cap so friendship grows over visits, not grinding.

### The raccoon agenda

Raccoons appear in every biome's spawn table and each page rolls a 15% bonus raccoon. Scrapflats are raccoon country (45% of spawns — trash pandas love scrap piles). Long-term: raccoons should be the most gift-motivated species (offer them anything shiny), with the paw-rub flourish doubling as their "I like you" tell.

### The cat distribution system

Cats appear in every biome (as is their custom) and each page that doesn't roll a bonus raccoon rolls a 12% bonus cat. Long-term: cats should be the hardest species to befriend and the most rewarding — they ignore offered materials at low friendship, and at pet level they're the only species that seeks the *player* out.

## Performance & Scaling

Now (solo):
- Critters belong to their page's group: hidden pages cost nothing to render.
- Update loop skips critters on hidden pages and anything beyond 55 units.
- Materials are cached by texture URL; rigs are primitive meshes (no skeletons).
- Budget: 2–4 critters per page ≈ dozens active worst-case; trivially fine.

Multiplayer plan (matches the Colyseus architecture in technical-plan.md):
- Server owns critter behavior for pages that have any player nearby, at a low tick (5–10 Hz); clients interpolate. Pages with no players don't simulate at all — critter existence is deterministic from seeds, so nothing is lost when a page sleeps.
- Sync per critter: position, heading, state enum, state timestamp. Names/coats/params never sync (derived from seed).
- Friendship is per-player, per-critter, server-persisted; one player's pet raccoon is another player's charming stranger. Whether high-friendship behavior (following) is visible to others: yes, follow target is part of synced state.
- Population budget per page stays fixed regardless of player count; more players means more *pages* active, not more critters per page. Server caps total simulated critters and sleeps the farthest pages first.
- Cheap LOD ladder when a page has many observers: full anim < 25 units, position-only updates < 55, frozen beyond.

## Interaction Verb #1: Petting (implemented 2026-07-16)

Left-click a critter to pet it (`src/game/petting.ts`). Picking is a raycast with a 48px screen-space near-miss fallback (kind to trackpads, moving targets, and motor accessibility). Reach is 2.6 units — clicking a distant critter shows "<name> is over there — walk closer to say hi." On a successful pet: the critter turns to face you and does its flourish (flyers skip the flourish and keep flying), 2–3 paper hearts float up and fade, and a toast announces a species-flavored response ("Bandit chirps and rubs its little hands", "Waffles slow-blinks at you"). +4 friendship points with a 6-second per-critter cooldown; hearts and toasts always play so affection never feels rejected, but points accrue at visit pace, not click pace.

## Next Steps

1. Critter name tags on approach (probably a small DOM label, awaiting UI mockup style).
3. Scrapbook critter page: met/befriended list with names and coats.
4. Species flourish variety pass + squirrel tree-climbing as a forest-page special.
5. More species: snail (rolled-paper shell), frog, duck for river pages, moth for evening palettes.
