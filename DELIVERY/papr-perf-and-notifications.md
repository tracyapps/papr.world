# papr.world — trim/dig stutter, and the notification badge

**Date:** 2026-09-20 · **Repo:** `~/Dropbox/work/custom-work-tools/games/pencil-and-paper`

Uncommitted working-tree changes. Nothing committed, nothing deployed.

---

## 1. The stutter was real, and it had three parts

### What was happening

Every trim, dig, plant, placement and tool action called one function,
`refreshBuiltTerrainNear(x, z)` (`src/world/streaming.ts`), which rebuilt the
terrain of a **3×3 block of pages** — nine of them, eight with nothing changed on
them.

`refreshPageTerrain` runs four builders:

| Builder | What it does |
| --- | --- |
| `refreshTerrainSurfaceMeshes` | **Every vertex** of every `userData.terrainSurface` mesh → `sampleTerrainHeight`, then `computeVertexNormals()`, then `computeBoundingSphere()` |
| `buildTerrainEditVisuals` | Dispose + rebuild every dug cell, its rim mesh, its plant and its pickup |
| `buildResourceDropVisuals` | Dispose + rebuild every loose drop |
| `buildPlacedPieceVisuals` | Dispose + rebuild every placed piece |

A page's ground is not one mesh. It is an **80×80 grid** (~6,500 vertices) for the
base sheet, *plus* up to three biome overlays at the same resolution, *plus* the
hill and mound patches, each a radial mesh of its own. Every one of them carries
`userData.terrainSurface`, so every one gets the full vertex walk.

Nine pages × four grids ≥ 26,000 vertices = **well over 200,000 height samples and
dozens of normal/bounds recomputes, per click.**

### Three compounding causes

1. **Nine pages when one changed.** Nothing in this game edits two pages at once.
2. **A ground pass for actions that change no ground.** `trimTree` writes
   `treeGrowth` and scatters drops. `mineRock` writes `rockGrowth` and scatters
   drops. Neither touches terrain — so for exactly the two actions reported, the
   entire vertex walk was wasted. Only the drop visuals had anything to do.
3. **Digging was worse than a click.** A dug bed *mends over time*, and the
   once-a-second sweep in `game/planting.ts` refreshed once **per cell**. A
   twelve-cell bed = 12 × 9 = **108 page rebuilds every second**, for the whole
   mend. That is a sustained stutter, not a spike, and it matches "dig feels
   laggy" better than the click did.

### The fix

| Change | Where |
| --- | --- |
| `refreshBuiltPageTerrain(pageId)` — refresh **one** page, and take the id the caller already had rather than re-deriving it from coordinates | `world/streaming.ts` |
| `refreshBuiltPageDrops(pageId)` — drops only, no ground pass | `world/streaming.ts`, `world/pageRuntime.ts` (`refreshPageDrops`) |
| Trim and mine use the drops-only path | `game/treeInteractions.ts`, `game/rockInteractions.ts` |
| Dig / plant / lift / refill / raise / recover / harvest / place use the single-page refresh, passing the page they changed | `game/toolActions.ts`, `game/planting.ts`, `game/plantInteractions.ts`, `game/placement.ts` |
| The mend sweep collects dirty pages and refreshes each once | `game/planting.ts` |
| `refreshBuiltTerrainNear` deleted | `world/streaming.ts` |

**Net effect:** 9 pages → 1 for every action; ground pass removed entirely for
trim and mine; the mend sweep down from `9 × cells` to `1 × pages` per second.

**Why passing the page id matters:** every caller already knows it — the tree's
page, the rock's page, the piece's page. Re-deriving it from coordinates would be
slower *and* a chance to disagree with the command that made the edit.

---

## 2. The notification badge now means something

**The bug:** `totalLogCount()` summed `activityLog.length + travelLog.length +
diaryEntries.length`. That is a count of everything ever recorded, so it only ever
grew. After an hour it read "99+" and told you nothing. A badge you cannot clear
is worse than no badge.

**Now:** the badge counts **new, unseen items** in the categories you switch on.

| Category | Default | Counts | Cleared by |
| --- | --- | --- | --- |
| Messages from neighbours | **ON** | the chat panel's own unread counter | expanding the chat |
| Letters and parcels | **ON** | mail that has arrived and not been looked at | opening the mail tab |
| People waiting on you | **ON** | friend requests + knocks at your door | opening the friends list (knocks clear themselves when answered or lapsed) |
| Your own activity | off | garden/harvest/gathering/crafting/building | opening the Logs drawer |
| Places you discover | off | new pages | opening the Logs drawer |
| Critter conversations | off | remembered conversations | opening the Logs drawer |

The defaults are the ones you asked for: **other people, not your own journal.**

Settings → **Notifications** has all six with plain-language one-liners. The
button's accessible name says what is new in words (*"Logs, 3 new — 2 messages,
1 letter"*), not just a number.

Seen-marks are a **local setting**, never saved world state, so an old save cannot
be broken by this. There is no per-letter read flag in the game, so "newest
arrival seen" lives in that local store rather than inventing state on the save.

---

## 3. Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| Root suite | **1,265 pass** / 1 skipped (25 new notification tests) |
| Server suite | **179 pass**, server tsc clean |
| `npm run styles:check` | clean, 1,058 rules |
| `npx vite build` | completes |
| `npm run hud:check` | **passes in a real headless browser** — 7 viewports × 2 dock states, no overlaps |

**Not measured:** actual frame time on the target hardware. The improvement is
structural (9 pages → 1, and no ground pass at all for trim and mine), and the
arithmetic above is from the real grid sizes — but I did not profile it on a
device, because a real measurement needs someone holding the mouse. Worth a
feel-check when you next play: trim a bush in a dense area and dig a bed, and see
whether the hitch is gone.

---

## 4. Things worth your eye

- **Knocks count as "people waiting on you" while pending.** The knock card is
  shown automatically, so this is arguably already "seen" — but it self-clears
  when answered or lapsed (5 minutes), so it cannot stick. Easy to change if you
  would rather knocks never count.
- **The mail noun is "letter"**, not "parcel". The mailbox's own copy says
  "Letters and parcels"; mill parcels are still counted, they are just spoken of
  as letters in the badge. Say the word and it becomes "post" or "parcel".
- **The badge polls once a second** for the states that have no change event
  (chat unread, mail arrival). Cheap, but it is a poll.
