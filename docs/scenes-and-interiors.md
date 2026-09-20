# Scenes: walking into a house, and the way underground

Written 2026-09-20 from an owner request. **Steps 2 and 3 are built** (the seam,
and the tent as the first enterable room; see *Built* below). The rest is design
intent. The request: once a house can be built, the player can **enter it** (a scene
change), houses can be **bigger on the inside**, and the same mechanism is
**how players get underground**, with the map changing to match each scene.

## The one idea

A **scene** is a place you can be that is not the surface. Entering one is a
**transition at a portal**, not a walk. Each scene brings its own ground, its
own light, its own map, and its own rules for what you can do there.

Three kinds, one mechanism:

| Kind | Example | Shape | Shared? |
| --- | --- | --- | --- |
| `surface` | the world today | endless, generated pages | everyone |
| `layer` | the underground | endless, generated pages, own biome set | everyone |
| `interior` | a player's house | small, player-built, own coordinates | per house |

A **portal** joins two scenes: a house door, a cave mouth, a stair. Stairs are
portals between floors, so nothing ever needs vertical physics.

## This reconciles an earlier decision

`mining-and-caves.md` decided caves are a **second page layer** with shared
geometry, and rejected "interiors like a building" for caves, because a tunnel
joining two entrances must be real geometry, not fiction. That still holds.
The underground stays a `layer` scene: expansive, generated, shared.

What changes is the vocabulary. "Layer" was going to be a field on `PageCoord`;
it becomes one *kind* of scene. Houses are the other kind, and they are
allowed to be fiction (bigger on the inside), because nothing needs to tunnel
into them. The transition, the map switching, and the presence rules are the
same for both, which is why it is worth building once.

## What the code looks like today

Facts from a survey on 2026-09-20, so the estimate is honest:

- One continuous surface, streamed as pages around the avatar
  (`world/streaming.ts`). A page id is the string `"px,pz"` (`world/types.ts`).
- `pageOfPosition` is used 26 times in 12 files; `sampleTerrainHeight` is read
  in 27 files; `getPage` is called 13 times. That is the real blast radius of
  "there is only one surface".
- Water (`world/water.ts`) and footprints (`world/footprints.ts`) are global
  registries, so a scene needs its own or a scene filter.
- The render layer has one `THREE.Scene` (`render/context.ts`). Nothing stops
  a scene being a root group that is shown or hidden, which is what pages do.
- **The server already treats `page` as a free string.** `PlayerSchema.page`,
  `PieceSchema.page`, `HomeSchema.page` and `MoveIntent.page` are all plain
  strings (validated only to 32 characters). The room checks
  `node.page !== player.page` for harvest range. No schema change is needed to
  carry a scene.
- The saved world is `state.world.pages[pageId]`, a string-keyed map. Interior
  contents can live in the same map under scene-qualified keys.
- Explored cells are keyed `"px,pz"` (`world/explored.ts`, `pp.explored.v1`).
  That is the one store that needs a real migration.

## The seam: scene-qualified page ids

Give a scene a prefix and leave the surface bare.

```
3,-2                    surface page (every id that exists today)
under:3,-2              underground page
in:<dwelling>:0,0       interior page 0,0 of one house
in:<dwelling>:f2:0,0    its second floor
```

Why this way: every surface id, save, piece and presence record stays valid
untouched, the server needs no change, and the existing `pageId()` /
`pageOfPosition()` become the surface case of a small `SceneAddress`
(`{ scene, px, pz }`) with one serializer. The 32-character limit means
dwelling ids in the id must be short hashes, not names.

The first build slice is this seam with **no behaviour change**: a renderer-free
`scenes.ts`, the address type, parse and format, surface as the only scene,
and tests that pin the old ids. Everything after threads the address through
one consumer at a time.

## What every scene must answer

A scene is defined by data, in a renderer-free catalog like the others.

- **Ground.** Its terrain sampler. An interior is a flat floor; the underground
  is its own height field. This is why `sampleTerrainHeight` needs a scene
  argument, or a per-scene function behind it.
- **Solids.** Its footprints and walls, so nothing outside can block anything
  inside.
- **Look.** Backdrop, light, and haze. The underground is a darker sheet of
  paper with torn edges (already decided). A house interior is a cutaway room.
- **Map.** What the minimap and treasure map show, and what "explored" means.
- **Rules.** What verbs work: no digging up a floor, no seeds outside a
  planter, mining only where walls are minable, and so on.
- **Population.** Which critters can be there. None inside a house at first;
  a pet later.

## Transitions

`enterScene` is a sim command, like every other action, so it can be tested
and later authorized by a server.

1. The player activates a portal (door, cave mouth, stair) within reach.
2. The command checks the portal is real, reachable, and that the player may
   enter (see *Multiplayer*).
3. The player's scene and position change, and the world swaps: the old
   scene's root is hidden, the new one shown, the map and light follow.
4. The player's scene is saved, so a reload puts them back where they were.
5. Leaving returns them to the portal's other side, never to a fixed spot.

**Accessibility, decided up front:**

- The transition is announced in words: where you are, what is here, and the
  exits ("Inside Tapps's cottage. Exits: front door, stairs up.").
- It respects reduced motion: an instant cut, not a fade or wipe.
- Focus moves somewhere sensible on arrival, never lost on a hidden element.
- Every portal is reachable and operable by keyboard, with a text name.
- Getting out is never a puzzle: an always-available **Leave** action returns
  you to the last portal you came through.

## The map changes with the scene

The map reads the active scene, and does not need to know what kind it is.

- **Surface:** unchanged.
- **Underground:** its own explored grid and its own treasure-map model. Cave
  mouths are markers on both maps, as `mining-and-caves.md` already asks.
- **Interior:** a floor plan. Rooms, doors, stairs. Nothing to fog: you own it.

Explored storage becomes keyed by scene (`pp.explored.v2`, migrating v1 as
surface). `world/explored.ts` and `world/biomeCompass.ts` are the two files
that assume one world; the model/draw split in `ui/treasureMapModel.ts` and
`ui/treasureMapDraw.ts` is what makes a per-scene map cheap.

## Bigger on the inside

The interior is its own coordinate space, sized by the *house*, not by its
footprint outside. A tiny cottage can hold a hall. That is the game's own
rule already ("it is made of paper").

- **Rooms are built, not spawned.** The materials work is what pays for this:
  floors and walls need layerboard, timber and brick by structural class
  (`materials-and-resources-v1.md`, gate table). A bigger house means more
  refined material, so "bigger on the inside" is earned.
- **Stairs are portals**, so a second floor is another interior scene
  (`in:<dwelling>:f2`). No vertical movement system.
- **Furniture** reuses placed pieces and footprints, scoped to the scene.
- **Only the shell is visible from outside.** The exterior is one build piece;
  the interior never has to match it.

## Multiplayer

The server is a socially authoritative room, and the world is deterministic
(`two-worlds-memo.md`). Scenes fit that shape:

- **Presence carries the scene.** *(Built.)* The room stores `inside` (the owner's
  account id, or empty) on each player and only the server sets it. A client draws
  only avatars whose `inside` matches its own, so a friend inside a house is not a
  ghost on the lawn. Visitors are drawn in the interior scene, not the surface.
- **Chat scope is settled:** a house keeps its chat to those inside it.
- **Entry policy is the owner's** (friends in, others knock, by default; see
  `house-and-home.md`). Blocking and removal must apply inside a house exactly
  as outside, and the block list must be checked at the door, not just at chat.
- **Pieces inside a house** are shared pieces with a scene-qualified `page`,
  so they persist and carry maker credit like any other. Same alpha caveat:
  only pieces finished while connected are shared.
- **Solo came first.** A house was enterable by its owner alone before guests
  existed. Guests are built now (`house-and-home.md`, slice 8).

## Order of work

Each slice ships alone and leaves the game working.

1. **Structural pieces** (floor, wall, door, roof, stairs) that consume the
   refined materials, gated by structural class. Without these there is no
   house, and the new materials have no consumer.
2. **The scene seam.** Address type, serializer, surface as the only scene.
   No behaviour change. *S*
3. **Portal and `enterScene` with one test interior**: a door on one authored
   house, one flat room, its own light, a text announcement, and Leave. *M*
4. **The map reads the active scene.** Explored storage keyed by scene;
   floor-plan map for interiors. *M*
5. **Player-built interiors:** rooms from walls and floors, furniture inside,
   stairs to a second floor. *L*
6. **Cave mouths as portals into the underground layer.** This is step 4 of
   the Phase 5 list, on the same mechanism. *M*
7. **Generated underground pages** and everything after in `mining-and-caves.md`. *L*
8. **Guests:** presence by scene, the entry policy, and block checks at the
   door. *L* **Built 2026-09-20.**

Steps 2 to 4 are the real work. Everything after is content on top.

## Decisions

**Answered 2026-09-20** (owner; the reasoning is in `house-and-home.md`):

1. **How are rooms made?** Built, piece by piece, on a starter tent every
   player begins with. Each part is a tech-gated project paid in refined
   material. The tent is itself a small enterable room.
2. **Who can come in?** The owner's setting. Default: friends (accepted
   friendships) walk in, everyone else knocks; the owner can make friends knock
   too, or close the door. An *open house* lets everyone in for a window.
   Blocks always win. Solo is still the first slice.
3. **Does chat cross the door?** No. A house is a room, and a party is a house
   with many people in it.

**Still owed:**
1. **Do time-derived systems keep running inside?** Plants grow from timestamps
   so they always will; the open question is whether a pet or a kitchen ticks
   while you are away, which should stay time-derived.
2. **How much of the outside can you see from a window?** Nothing, at first.
   Cheap to add later, expensive to retrofit into a hidden-root design, so
   worth a sentence now.
3. **One dwelling per player.** `land-and-dwellings.md` already says you cannot
   hold two homes, which keeps one interior tree per account. Confirm it
   extends to interiors.

## Built 2026-09-20: the seam, and the tent as a room

Solo only, and seen working in the running game (enter, walk, hit the walls,
leave, reload while inside).

- **The seam.** `world/scenes.ts`: `SceneAddress`, `formatSceneAddress`,
  `parseSceneAddress`, `sanitizeScene`. The surface formats exactly as every
  page id does today; `in:home:0,0` is an interior page. Tests pin the old ids.
- **The scene is saved.** `player.scene` (`'surface'` or `'in:home'`), sanitized
  on load (unknown or unbuilt scenes become the surface), no save version bump.
  A save made indoors picks up indoors.
- **Crossing is a command.** `sim/scene.ts`: `enterScene` (must be within reach
  of the home) and `leaveScene` (always allowed from inside). The sim decides;
  `game/sceneTransition.ts` makes the world follow.
- **The room lives far away, and the surface holds still.** `world/homeInterior.ts`
  parks the interior at `INTERIOR_ORIGIN` (40000, 40000), about 800 pages from
  the clearing, so no surface footprint, water, critter or shop can react to it,
  and no page streams there because the frame loop skips the surface while you
  are inside. This is the *Rejected* option below, made safe by pausing the
  surface rather than by special-casing every system. Plants and builds run on
  timestamps, so nothing is lost.
- **Two hooks, not a rewrite.** `world/activeScene.ts` gives the avatar and the
  camera one answer to "how high is the floor" and "is this blocked" (the room's
  floor and walls, or the surface's terrain and footprints). The interaction
  router tags each interaction `surface` (default), `interior` or `any`, so a
  click in your tent can never reach a shovel or a shop outside.
- **One renderer, two scenes.** The surface keeps its one `THREE.Scene`; the room
  has its own (`game/interiorScene.ts`) and the avatar is handed across. The frame
  loop renders whichever the player is in.
- **Size.** 6.4 by 5.2 units inside a 1.8 by 2.0 tent, growing 2.4 wider with each
  annex room. Low walls so the orbiting camera can always see in.
- **Accessibility.** Crossing is announced in words ("Inside your tent. Exit: the
  door, just in front of you."), through the toast, which is a polite live region.
  A fade for most players and a plain cut under reduced motion. **Leave** is a real
  button, first in the HUD row, visible the whole time you are inside, and E at the
  door does the same. The panel has a Go inside / Go outside button, so entering
  needs no precision. The map and Mark spot say why they are unavailable instead
  of doing nothing.
- **Presence.** Inside a home the room knows you are there (`EnterHome` /
  `LeaveHome`, `game/guests.ts`), hears your real place in the room, and shows you
  to the others inside. Only once the room has confirmed, and only after the screen
  has actually moved, so the position it hears is never the wrong one. If the room
  cannot place you (a guest has no home on record), friends still see you at your
  door (`outsideDoorstep()`).
- **Visiting.** `sceneTransition.ts` has a visiting mode: the interior is drawn from
  the host's published parts, your own saved scene is untouched, and leaving puts
  you at the host's doorstep. If the connection ends while you are a guest you are
  returned to your own door.
- **The E key.** Outside, the nearer of the Thing Maker and the home gets E and
  the prompt. Inside, E at the door leaves; E anywhere else opens the home panel.

**Not done:** the map by scene (step 4; the minimap is simply hidden indoors),
furniture and placed pieces inside, stairs and second floors, windows, pets,
and the underground.

## Rejected

- **Interiors placed far away on the surface grid** (as the general answer).
  Pages generate around them, the explored map and terrain sampler would need
  special cases, and presence would show avatars standing in empty field. The
  home interior does park far away (see *Built*), but only because the surface
  is not simulated while you are inside, and presence is pinned to the door.
  Underground layers and shared interiors will want the real scene-qualified
  pages.
- **A second `THREE.Scene` per place, as the general answer.** `render/context.ts`
  exports one scene that many files import, and root groups shown and hidden is how
  pages already work. The home interior does use a scene of its own, chosen by the
  frame loop, because nothing else needs to add to it; the surface keeps the one
  shared scene.
- **A typed `layer` field on every `PageCoord`.** Correct, but it touches
  every caller at once. The prefixed id gets the same result one consumer at
  a time, and the address type keeps it typed at the edges.
