# Next Session

Updated 2026-09-20 after the touch/tablet pass, the neighbourhood clump and
address plates, profiles and visibility, friend-request notes, the safety reach
fix, and one-command data backups. Start here.

## What landed

- **Trim/dig lag, and the notification badge (2026-09-20).** Two reports, one of
them a real bug with a measurable cause.

  **The lag was `refreshBuiltTerrainNear`.** Every trim, dig, plant and placement
  rebuilt the terrain of a 3×3 block of pages: nine pages, eight of them with
  nothing changed. A page's ground is an 80×80 grid (~6,500 vertices) plus a base
  sheet, up to three biome overlays and the hill patches — every one carrying
  `userData.terrainSurface` — and a rebuild walks every vertex through
  `sampleTerrainHeight` and recomputes normals and bounds. One click was well over
  200,000 height samples. Worse: **trimming and mining change no terrain at all**
  (`trimTree`/`mineRock` only write `treeGrowth`/`rockGrowth` and scatter drops),
  so the whole ground pass was wasted for exactly the two actions reported. And
  digging was worse than a click — a dug bed mends over time, and the once-a-second
  mend sweep in `game/planting.ts` refreshed **per cell**, so a twelve-cell bed
  rebuilt nine pages twelve times a second, for the whole mend. Now:
  `refreshBuiltPageTerrain(pageId)` refreshes one page and takes the id every
  caller already had rather than re-deriving it from coordinates;
  `refreshBuiltPageDrops(pageId)` is the trim/mine path (drops only, no ground
  pass); the mend sweep collects dirty pages and refreshes each once.
  `refreshBuiltTerrainNear` is gone. Files: `world/streaming.ts`,
  `world/pageRuntime.ts`, `game/{treeInteractions,rockInteractions,toolActions,planting,plantInteractions,placement}.ts`.

  **The badge counted everything ever recorded.** `totalLogCount()` summed
  `activityLog + travelLog + diaryEntries`, so after an hour the bubble read
  "99+" and meant nothing — a badge you cannot clear is worse than none. It is
  now a real notification badge: **new, unseen** items only, in the categories the
  player switches on, defaulting to other people (`messages`, `mail`, `social`
  ON; `activity`, `travel`, `conversations` OFF). Opening the Logs drawer / mail
  tab / friends list marks the relevant kind seen, so it always means "something
  you have not looked at". New `src/ui/notifications.ts` (pure model + a local
  seen store — never the save shape) + 25 tests, `notifyCategories` in
  `game/settings.ts`, a Notifications section in Settings, and an accessible name
  that says what is new in words (`Logs, 3 new — 2 messages, 1 letter`).
  `getChatUnreadCount()` was exported from `ui/sharedChat.ts` so the badge reads
  the chat panel's own counter rather than scraping its rendered text.

  **Verified:** `npx tsc --noEmit` clean, root suite **1,265 pass**, server suite
  **179 pass**, `npm run styles:check` clean (1,058 rules), `npx vite build`
  completes, and `npm run hud:check` passes in a real headless browser across 7
  viewports × 2 dock states. **Not measured:** the frame-time improvement was not
  profiled on a device — the reduction is structural (9 pages → 1, and no ground
  pass at all for trim/mine). Worth a real feel-check on the target hardware.
- **Data backups, one command (2026-09-20).** Answering "is backing up `/data`
  easy, and does a deploy need a re-import?": it is now one command, and **no
  deploy ever needs a re-import** — `/data` is a Railway volume that survives
  redeploys, so the files are simply still there when the new process starts. A
  copy is worth having only before a *shape* change (`SAVE_VERSION` or a store's
  fields), where a bad migration reads as "the world is empty" rather than as an
  error. New: `tools/backup-data.mjs` (`npm run data:backup`) snapshots a local
  data dir with a sha256 manifest, can pull from a running server, and can
  restore (refuses without `--yes`, never deletes); `GET /admin/backup`
  (`server/src/backup.ts` + `backupHandlers.ts`) is a read-only, allowlisted
  snapshot behind its own `PP_BACKUP_TOKEN` — unset means CLOSED, and the boot log
  says which. Full write-up in `docs/data-backups.md`; `hosting.md` gained the
  third token and lost a stale `PROTOCOL_VERSION is 8` line. Verified end-to-end
  against a real local server (401 with no token, 401 with a wrong one, 200 with
  the right one, 503 when unset, and the CLI pulling over HTTP).
- **Drawable shapes (2026-09-20, eighth pass, uncommitted).** "Draw your avatar"
  is now a real shape editor: large sheet, pencil with no length limit, movable
  auto-smoothed points, pieces that add or cut out (unite/subtract), multi-stroke,
  undo/redo, keyboard nudging, starters (oval/square/triangle). A shape is
  `AvatarDesign.customShape` (`pieces`); `customOutline` is kept as the legacy
  flattened loop. **No protocol bump** (additive, old clients ignore it; limits
  `maxShapePieces` 12 / `maxShapeAnchors` 600). Shapes you use land in **My shapes**
  under the draw tile (`pp.shapes.v1`, device-local, 40 max, edit/delete there);
  the studio gained **Edit shape…**. New dependency **`polygon-clipping`** — run
  `npm install` (pure JS; `package-lock.json` already updated). Code:
  `src/ui/avatarEditor/{shapeGeometry,shapeEditor,shapeInventory}.ts`. Owed:
  sync My shapes to the account (designs already carry their own copy), a
  live-updating My shapes grid across tabs, pinch-zoom on the drawing sheet.

- **Touch/tablet play, and the social layer (2026-09-20, seventh pass).** Two
  things at once, both uncommitted. **Touch (slices 1–3):** a new
  `src/game/touchControls.ts` — an analog move pad read camera-relative with a
  radial deadzone, an Act button (what E does), a Rotate button (build mode),
  and zoom +/− as the non-gesture twin of pinch — plus multi-pointer bookkeeping
  and pinch-zoom in `src/game/input.ts` (pointers tracked by `pointerId` now, so
  a second finger stops fighting the first), a `touchControls: 'auto'|'on'|'off'`
  setting (`pointer: coarse`), `viewport-fit=cover`, `touch-action: none` on the
  canvas, and nine `100vh` → `100dvh`. Slices 4 (tap-to-aim previews) and 5
  (tablet layout, 44 px targets) are still owed. `docs/touch-and-tablet.md`
  records the pattern review — the one plan change is that the Act button stays
  put and lights up rather than appearing under the thumb. **No protocol change.**
  **Neighbourhood clumps and address plates:** `src/world/neighborhood.ts` places
  homes on deterministic concentric-ring lots (`LOT_SPACING = 8`, self-healing
  tie-break by account id) so two players' starter tents stop stacking; the
  starter tent and Thing Maker L1 are unchanged. Every neighbour home gained an
  **address plate** (`No. 12 · Wren`, number derived from the account id) that
  opens their player card, registered above the house click. **Profiles:**
  `shared/src/protocol/profile.ts` — bio (280) and up to 6 social links with
  per-field visibility (everyone / friends / friends-of-friends, default
  friends), and `profileForViewer(..., { hasSentRequest })` for the owner rule
  (asking to be friends shows them your basics). Store `data/profiles.json`,
  desk routes `GET`/`POST /account/profile`, an in-room `SetProfile`, and a
  "Your profile" card on the desk. **Friend notes:** a request may carry an
  optional ≤140-char note, shown to the recipient, with the disclosure sentence
  written in-game and on the desk. **Safety reach:** Block and Report are now on
  the player card, the friends panel and the door panel, not just the chat ⋯
  menu. Two real defects were found by review and fixed: a `playerCard ↔
  sharedSession` import cycle that only booted by import-order luck, and a
  silence-rule hole where a blocked request's absence from the asker's own list
  revealed the block (now a tombstone, so the asker's view is invariant).
  `docs/address-plates-and-profiles.md` is new; the full review is in
  `.cluster/papr-touch-home-social/review.md` and the delivery in `DELIVERY/`.
  **Not verified in a browser or with two clients.** Before deploying: back up
  `/data`. **Housekeeping owed:** delete `src/game/__tmp_dep.ts` and
  `src/game/__tmp_mock_probe.test.ts` (inert scratch files; the sandbox refused
  the delete), and note that a concurrent avatar-shape workstream has left
  `polygon-clipping` declared but uninstalled, so `npm install` is needed before
  the tree typechecks.
- **Small fixes (2026-09-20, sixth pass).** Tech tree cards: the status tag no
  longer runs over the title (the heading row wraps), "Not yet in the game" is now
  "Soon" (screen readers still hear "not in the game yet"), and tags are a little
  smaller (9 px, was 9.5). Critter conversations: the card stays at the bottom, and
  when the animal is behind it the view slides up (a screen-space camera offset,
  `game/dialogueFraming.ts`, eased, instant under reduced motion) until the animal
  is in the clear band above the card, then slides back on close. Seen working
  with a butterfly. Tablet and touch controls are estimated in
  `touch-and-tablet.md`; not built.
- **Display cases (2026-09-20, fifth pass).** Protocol **v11**. A `display-case`
  build piece (tech node `display-cases`), outdoors only. **Show** holds keepsake
  looks (copies; the trinket stays on the shelf); **Free** holds stacks from the
  owner's pouch that a visitor takes one at a time, under an owner-set limit per
  visitor per time window (default 1 a day), with an owner-only log. A blocked
  visitor hears what an empty case says. Solo cases are Show only
  (`world.localCases`). Server: `server/src/cases.ts` (rules), `mail.ts` (store),
  `PaperRoom.ts` (six messages, `cases` in synced state). Client: `game/cases.ts`
  (state and words), `game/casePanel.ts` (docked panel, E and click). Seen working
  in the browser (solo Show; Free through a fake server). **Not proven:** two real
  browsers in one room. **Before deploying:** back up `/data` (`mail.json` now
  holds `cases`); every client must refresh (v11). Not built: priced cases, cases
  indoors, the mesh showing its contents. Next: the map by scene (step 4), or
  parties.
- **Guests, friends and visiting (2026-09-20, fourth pass).** Protocol **v10**.
  Friendships (account-global, `server/src/friends.ts`), per-home door settings
  (friends walk / knock / closed, others knock / closed, open house), knock with
  Let in / Not right now, blocks at the door (a blocked visitor hears the same
  `closed` as a shut door), ask-to-leave, an offline owner's mailbox note.
  Neighbors' homes are drawn and solid, with a name sign that says OPEN HOUSE.
  Visiting works in `sceneTransition.ts`; presence is by scene (`inside` is
  server-owned). Client: `game/guests.ts` (state), `visitPanel.ts`,
  `knockNotices.ts`, `friendsPanel.ts`, `homePanel.ts` (Who can come in),
  `world/neighborHomes.ts`, `net/sharedHomeVisuals.ts`. Server and shared tests
  pass, including a real-socket room test. **Not proven yet:** two real browsers
  in one room. Not built: parties, invites, scheduled open house, mailbox
  balloons. **Before deploying:** back up `/data` (new `friends.json` and
  `homePolicies` in the room save). Display cases followed (below).
- **Housekeeping, key swap, and the house design (2026-09-20, third pass).**
  (1) Art: crossbound-timber moved to `board/`; `LEGACY_RESOURCE_ART` retired
  (the last legacy entry was already generated); the dead Thing Maker
  `bound-lumber` recipe, the recipe `resource` output kind and the `crafted`
  obtain route are gone. The art conventions now live in one place, the top of
  `resource-asset-pipeline.md`. (2) `M` opens the map, `G` marks this spot
  (were `N` / `M`); the guide switches itself off inside `ARRIVE_RADIUS`
  (`guideArrival.ts`). (3) New doc `house-and-home.md`: starter tent, dwelling
  projects, Thing Maker look by level, entry, parties, display cases. **Slices 1
  to 5 are now built** (same day): `thingMakerLook.ts`, `dwellingLook.ts`,
  `dwellingExterior.ts`, `homePanel.ts`, `sim/dwelling.ts` and
  `catalogs/dwellings.ts`, plus five house know-how nodes in the tree. Refunds:
  100% before the build starts, 95% once started, 90% for a finished part or a
  move. Display cases will carry an owner-set per-visitor limit per time window.
  **Seen once in the game:** the panel's cards were squeezed into a 26px column
  (fixed) and the avatar stood inside the tent (the tent now moved to the
  doorstep and is solid, `world/homeSite.ts`). **The black-roofed test house stays** (owner's call; see `house-and-home.md`). **Maker look revised (owner's mockups):** same height at every level, parts
  added by level (a bell on all three), seen working at levels 1, 2 and 3.
  `dismantleDwelling` (move payback) has no caller until moving
  exists. **Slice 6 is built too:** you can go inside the tent (panel button or E
  at the door), walk its room, and leave (Leave button or E at the door);
  `player.scene` is saved, so a reload inside picks up inside. Files:
  `world/scenes.ts`, `world/homeInterior.ts`, `world/activeScene.ts`,
  `sim/scene.ts`, `game/sceneTransition.ts`, `game/interiorScene.ts`; the surface
  is skipped in the frame loop while inside. Seen working in the browser. Next:
  display cases (slice 7), then the map by scene (step 4) or guests.
  **After pulling:** run `npm run assets:compile` on the Mac to regenerate
  from the moved source (it should match what is there), and `npm run art:check`.
- **Know-how grants, the structural refining rung, and the scene plan
  (2026-09-20, second pass).** See 1.9 and Phase 5b in `roadmap.md`. New:
  `catalogs/abilities.ts`, `isKnowledgeOutput`/`hasAbility` in `recipes.ts`,
  mill stage 2/3 in `millRefining.ts` (refined inputs, `requiresAbility`), the
  `refine` task kind in `learning.ts`, locked trades on Chisel's counter. Ready
  nodes: Wetland Growing, Materials & Refinement 1 and 2. Fixed the three
  earlier build-plan lessons that paid out instantly. New tests: `abilities`,
  `refiningLadder`. New doc: `scenes-and-interiors.md` (nothing built yet; six
  decisions owed). Not played in the running game; art for faced masonry is
  undrawn. The crossbound-timber tile was moved `wood/` → `board/` on 2026-09-20
  (source, runtime PNGs, generated TS and manifest edited to match; the next
  `npm run assets:compile` on the Mac will rewrite them identically).

- **Tree growth, build-piece plans, shallow-water planting (2026-09-20).** See
  1.8 in `roadmap.md`. 22 new tree nodes (19 concept, 3 ready). Build pieces
  are learned plans now (`unlearnedBuildPlan` in `recipes.ts`; gated in
  `commands.ts`, `placement.ts`, and the build palette). Lotus and reeds plant
  in shallow water (`wetBed` through `gardenActions.ts`, `planting.ts`,
  `plantTerrain`). New tests: `buildPlans`, `wetBedPlanting`,
  `gardenActions.wetBed`. Not yet played in the running game. Open decision:
  should shallow-water planting get a tree node (needs an ability-grant seam)?

- **Treasure map + sense of direction (2026-09-18, eighth pass).** See the
  "Landed early" note under Phase 5 in `roadmap.md`. New files:
  `src/world/explored.ts`, `src/world/biomeCompass.ts`,
  `src/ui/directionHints.ts`, `src/ui/treasureMap.ts` (overlay),
  `src/ui/treasureMapModel.ts`, `src/ui/treasureMapDraw.ts` (renderer-free).
  Key **N** opens it (M stays "mark spot"); the help sheet also said **B**
  for the scrapbook when the key is actually **I** — fixed. Explored areas
  are not yet in the save backup file.

- **The real reason looks vanished and worlds dropped (2026-09-18, seventh
  pass).** Two silent limits, found after a finished avatar saved as an early,
  half-done version twice:
  - **Colyseus' WebSocket `maxPayload` defaults to 4 KB.** Wearing a look
    sends the whole design; anything bigger closed the socket instantly (and
    again on every rejoin). Now 512 KB in `server/src/index.ts`.
  - **Designs over `DESIGN_LIMITS.maxBytes` (32 KB) were rejected on read,
    silently.** The editor stored raw pointer floats (17 characters each), so
    a dozen strokes crossed it; the next write of anything erased the look,
    and account sync brought back the last version that fit. Now:
    coordinates are rounded to 0.1 (`roundCoord`, ~3x smaller), the limit is
    96 KB, `saveDesign` stores the sanitized form, unreadable entries are kept
    in the file (`unreadable`) instead of erased, and the studio refuses to
    say "saved" (or finish) for a design that would not load back, with a
    "detail N% full" note past 70%.
  - Game Clerk now loads exactly like the desk (UI bundle + `ui` option);
    rejoin tolerates a few missing tokens before "sign-in has ended", and
    logs why a join was refused.
  - **Needs BOTH deploys:** Railway (payload + shared limit) and Vercel.

- **Looks never get lost; worlds find you again (2026-09-18, sixth pass).**
  Fix for "15 minutes of avatar work gone, and the world logged me out":
  - **Studio autosave** (`editor.ts`): every change lands in the wardrobe
    within ~1.5s, plus on tab hide/close. Close keeps the work; "Save &
    wear" finishes; **Undo my changes** restores the look as it was when the
    studio opened. A full wardrobe keeps a draft (`pp.avatar-draft.v1`) and
    offers it back next time.
  - **Account wardrobe sync** (`src/net/accountWardrobe.ts`): signed-in
    players' looks sync both ways with `/account/designs` (newest copy wins;
    deletes tracked with `pp.wardrobe.synced.v1` / pending-deletes). A new
    browser wears the account's looks instead of the first-run prompt.
  - **Studio from the desk** (`studio/index.html` → `/play/studio/`,
    `src/studio/main.ts`). `/api/account-entry` accepts `{purpose:'studio'}`
    to let any claimed account through the door without a world.
  - **The game loads Clerk headlessly** (`src/net/accountAuth.ts`) for fresh
    tokens: in-memory only, never URLs or storage. Needs
    `PUBLIC_CLERK_PUBLISHABLE_KEY` in the game build (new `vite.config.ts`).
  - **Reload = still signed in** (`resumeWorldEntry` in `worldEntry.ts`) and
    **auto-rejoin** after a lost visit (`src/net/rejoin.ts`): 2s → 60s
    backoff, immediate retry on wake/tab-visible/online; never after leaving
    on purpose or being removed; stops with a clear message on sign-out,
    lost access, or a protocol update.
  - Why worlds dropped: not inactivity (pings allow 40s of silence). A
    server deploy/restart, Railway App Sleeping, or a laptop asleep longer
    than the 60s reconnect grace ends the seat; the old code never rejoined.

- **Pre-invite tie-ups (2026-09-18, fifth pass).** Checked Alpha gate 1
  criterion by criterion (status written under the gate in `roadmap.md`) and
  closed what could be closed in code: an **early-alpha notice** on the
  invitation page, the desk, and a once-per-browser in-game card
  (`src/ui/alphaNotice.ts`, setting `alphaNoticeSeen`); **save backup and
  restore** in Settings → Your save (`exportSaveBackup` / `parseSaveBackup` /
  `restoreSaveBackup` in `state.ts` — restore runs the normal load
  normalisation and asks before replacing anything; the consent note had
  already promised testers this); the **neighborhood chat folds** to its
  header with an unread count and joins "hide all HUD"; the **share card**
  (`site/public/og.png`) re-rendered with the real Dokdo/Karla fonts; hosting
  smoke and tester one-pager refreshed for the account/desk flow. Verified:
  web tsc + 614 tests (the asset-pipeline render test needs the Mac's
  Chromium, as always), server tsc + 68 tests, edge tsc, Astro site build,
  content/quest/style checks.

- **Refining moved to the Wood Mill — in person or by mail (2026-09-18,
  fourth pass).** Raw → refined is now a trade with Chisel, not a Thing Maker
  recipe. `src/sim/catalogs/millRefining.ts` is the one table: bound lumber
  (4 kraft twigs + 1 any long fiber — the materials plan's starter recipe,
  no redwood needed), plus four new stage-1 materials from the plan —
  **binding cord**, **soft pulp**, **stone aggregate**, **paper mortar**.
  "Any X" slots only accept *raw* materials with that tag, and take from
  whatever you hold most of. Open the counter by clicking the big paper
  cutter, pressing E at the mill, or asking Chisel ("Could you refine some
  materials for me?"). **Mail order:** Scrapbook → Mail → "Order from the
  Wood Mill…" opens the same board in mail mode; the fee is ₡3 *or* one
  extra of each raw input, and the parcel arrives ~90 s later (the button
  reads "On its way · …" until then). New command `refineAtMill`, new
  `player.refinedCounts`, new quest objective `refine` (the two bound-lumber
  quests use it), new obtain route `refined`. The Thing Maker's old bound-lumber
  plan was removed 2026-09-20 (saves drop unknown plan ids on load), along
  with the `resource` recipe-output kind and the `crafted` obtain route. Chisel's and the
  lumber storylets were rewritten to point at the mill. Four new materials
  show in `npm run art:check` as TO DRAW.
- **Conversation fixes (same pass).** (1) Openings are a weighted, seeded
  draw instead of "highest priority wins" — every stranger in the jungle was
  opening on the same tool-ladder lecture. Story arcs (priority ≥ 50) and
  friendship milestones still come first; tool lessons are never a first
  hello; seen scenes get rarer. (2) No more dead ends: a question that
  neither ends the scene nor has follow-ups used to leave the *same* buttons
  up. Now one-off questions disappear once asked, repeatable knowledge
  becomes "Tell me more about that", every non-everyday scene gets "Let's
  talk about something else", the everyday menu refreshes when used up and
  always ends with "See you later" (closes the card after the reply). New
  tropical knowledge scene and a canopy-critter first hello.
  `conversationFlow.test.ts` walks every storylet two levels deep.
  `tools/validate-conversations.mjs` now reads species/biomes from source
  (its hand-copied lists were missing parrot and tropical).
- **Upside-down hearts fixed.** Petting hearts billboarded with `lookAt()`
  and then overwrote `rotation.z` — from some camera angles `lookAt` solves
  with x ≈ π, so those hearts flipped. They now copy the camera's
  orientation and roll in their own plane.

- **Jungle animals: toucan, sloth, monkey — the canopy crowd (2026-09-18,
  third pass).** The first critters that live *in* trees. New
  `src/game/critterCanopy.ts` turns each page's jungle trees and palms into
  branch lines, crowns, trunks, and vines, and moves critters between them as
  queues of posed legs: sloths hang upside down and shuffle along branches
  (and down vines), monkeys sit, swing, and leap tree to tree, toucans fly
  perch to perch. All three come down to the ground sometimes and climb/fly
  back up. Click one overhead to ask it down (monkeys/toucans come at once, a
  sloth… sets off). Talk reach uses ground distance while they're up a tree.
  Rigs checked visually in a headless render (all poses × 3 species); **not
  yet seen in the running game**. Four new quests (crepe vine, say hi to a
  sloth, a vine for the sloth's hammock, blotting caps), greetings and
  self-replies for all three, four new tropical place facts. Tropical critter
  count 3–5 → 4–6. Details: `critter-design.md` → "Canopy Behavior".

- **Jungle canopy, hanging vines, trimmable undergrowth (2026-09-18, second
  pass).** Jungle trees now come in understory / canopy / emergent layers (up
  to 22 units, still under redwood height). Vines hang from tall jungle trees
  and can be trimmed for **crepe vine**, a new tropical-only material.
  Mushrooms (→ new **blotting caps**) and shrubs (→ twigs/fiber) are
  trimmable everywhere they grow. Details and the yield table are at the
  bottom of `tropical-biome-plan.md`.
- **Interface size + compact tool bar.** Settings → Display now has
  **Interface size** (60–120%, `hudScale`), which scales the tool bar and the
  whole scrapbook dock (cover, strip, and cards — via CSS `zoom` on
  `.scrapbook-dock`), and a **Compact tool bar** toggle (`toolbarStyle`). The
  old "UI size" slider was renamed **Text size**, because that is all it
  ever did. Compact mode is a small floating palette: the same slots, art,
  and shortcut badges, each drawn at `--hud-compact-slot-scale` (0.34 ×
  interface size), only as tall as its tools. A « / » toggle on the tool bar
  itself switches modes (`aria-pressed`, one stable name). `hudLayout.ts`
  owns all of it: `--hud-rail-width` follows the mode and scale, so the
  status chips, scrapbook cover, and minimap default all slide left with it.
  Rendered and checked in a headless harness (full/compact × 100/70%); **not
  yet checked in the running game** — run `npm run dev` and `npm run
  hud:check`.

- **The tropical biome is real — the sixth biome, built end to end.** The
  owner's art drop (35 new prop cutouts, 15 new material papers, all compiled
  through the ordinary `assets:compile`) was the unblock; the build followed
  `tropical-biome-plan.md`'s own order. `tropical` joined `BIOME_IDS` and
  every exhaustive table TypeScript then demanded (ground paper
  `ground.tropical` from the new leaf-canopy-green sheet, region names
  Creaseline/Ribbonfrond/Sunfold/Confetti-Blossom/Tapedrop, both
  `BIOME_LABELS` copies, `GROUND_MAP_COLORS`, `DIG_TABLES`, dig scatter,
  species mix and counts). The field was retuned with `npm run
  fields:sample` to **meadow 34 · dunes 23 · forest 17 · scrapflats 16 ·
  tropical 11** — the load-bearing part was the altitude split (tropical
  takes the wet *low* ground, forest keeps the wet *high* ground and a wider
  roughness tolerance), because the naive version starved forest to 7.7%.
  The migration shuffle (option 1 in the plan) is accepted for alpha; tree
  growth survives by page id + tree key as designed. Full build notes,
  including the mistakes worth rereading before tuning the field again, are
  at the bottom of `tropical-biome-plan.md`.
- **The new props live in the world, three biomes' worth of understory.**
  `generate.ts` gained an `UNDERGROWTH` table: dunes scatter agave, prickly
  pear, dry shrubs, and a marigold on their own budget (cactus density
  untouched, the palm precedent); forest floors get fern clusters,
  mushrooms, a berry shrub, and one mossy boulder; tropical pages crowd
  broadleaf plants, jungle shrubs, hibiscus/anthurium/bird-of-paradise,
  bamboo, and mangrove saplings among a real canopy (palms anchored, `jungle-1/2`
  broadleafs, `banana-1`). New `TreeKind`s register in `TREE_DEFS` and the
  horizon impostor map; `banana` is a new `TreeSpecies` whose yields are the
  palm material pair, per the plan's "palm clippings and palm fiber already
  cover the tree."
- **Marsh shores got the new waterplants (render-side, `water.ts`).** Marsh
  banks now roll between cattails, marsh grass, river reeds, and an
  occasional pickerelweed/water-iris accent; calm reaches scatter lily pads,
  a lily-pad cluster, or a duckweed skim. Woodland banks keep their original
  look. The hanging-vine art stays unplaced on purpose — a ground cutout
  cannot hang; it wants the canopy-anchor system (parking lot).
- **Two new tropical materials, the dunes precedent.** `jungle-loam` (wet
  green-brown soil — scattered loose *and* dug) and `rainfold-pebbles`
  (aqua stone, **dug only**, the shovel's answer to the redwood's scissors).
  Both tiles were authored in the resource-pipeline house style under
  `materials/resources/{soil,stone}/` — swapping the SVGs later changes
  nothing else. `paper-tomato-seeds` now also scatter in tropical, which
  keeps the "what grows well here?" knowledge lane alive in every live
  biome. Palm clippings/fiber stopped being dunes-exclusive on their own.
- **Parrots — the tropical flagship.** One new `CritterSpecies`, built the
  way the plan said ("reuses the existing bird rig with new colours and a
  beak"): hooked two-cone beak, long swinging two-panel tail, slow broad
  wings, jungle-paper coats (including one blue one — every flock has one),
  preen-swing idle, head-cock curious tell at flagship weight 0.28.
  Eleven greetings, nine self-replies, and eleven tropical place facts
  joined `conversations.json` in the established voice.
- **Six new quests and the tropical trinket batch.** Quests: two favors
  (jungle loam for a wallow; palm fronds for a preening parrot), two errands
  (walk to the tropics; trim a banana tree), one dig favor (rainfolds,
  second layer), and one odyssey (carry a word to a parrot in the jungle —
  `talk { critterId: 'parrot' }`, species-addressed like the authored set).
  Trinkets: six authored tropical/forest keepsakes (pressed hibiscus, parrot
  feather, banana-leaf boat, bamboo whistle, bird-of-paradise bloom, mossy
  pebble friend — tagged `biome:tropical` so jungle quests pay out jungle
  things) and three generator palettes (Hibiscus, Parrot, Lagoon) wearing
  the new papers; the pool grew to **1,255 defs**. Catalog totals now: 45
  quests, 55 authored + 1,200 generated trinkets; counts refreshed in
  `trinkets-and-quests.md`.


- **"Return to your desk" is now where players actually look for it.** The
  owner reported checking the Activity drawer for a way out and not finding
  one — it only lived in Settings → Leaving. `src/ui/activityLog.ts`'s
  drawer now opens with the same "Return to your desk" action at the top,
  above the entries, wired identically (`disconnectSharedSession()` then
  `window.location.assign(accountDeskUrl())`). One new `.activity-log-leave`
  CSS rule for the separator; everything else reuses the existing
  `hud-setting`/`hud-setting-action`/`hud-setting-button` classes Settings
  already uses, so the two buttons look and behave like the same feature
  shown twice, not two different ones.
- **Avatar Phase E1 — the player card overlay + click-a-player entry
  point.** See `avatar-and-identity.md` §7E for the full account. Short
  version: clicking a live neighbor in-world now opens a card (name,
  avatar, "made N things on this page," papering-since date, any wardrobe
  designs they've opted to show). Name/avatar/creations render instantly
  from state every client already has synced; papering-since and shared
  designs are a new `request-player-card`/`player-card` room-message round
  trip, thin glue over the existing accounts and avatar-designs stores. A
  target who doesn't exist, is a guest, or has blocked the asker all answer
  identically ("Nothing to show here.") — the feature can't be used to test
  who has blocked whom. "Made by —"/"house of —" entry points and a
  chat-name entry point are explicitly left for a later slice (see
  avatar-and-identity.md for why); this pass only touches currently-online
  players.
- **Home markers — a neighbor's "house of —" entry point, shipped.** Every
  signed-in player's Home bookmark (`src/world/places.ts`) now publishes to
  a new `homes` MapSchema on the room, keyed by account id so it persists
  whether or not that player is online, and every other client renders it
  as a staked-out building lot: four corner stakes, a dashed lot outline,
  and a hazard-striped sign reading "BUILDING A HOME" plus the owner's
  name — the owner's own choice
  ("I think it would be a nice touch to almost 'see' the under-construction
  house when someone signs up, so players can actually see their neighbors
  popping up around"). Clicking the marker opens the same player card E1
  shipped. Server-authoritative like everything else here: the client sends
  `SetHomeIntent {x, z, page}`, the room stamps the account id and name from
  the live connection and upserts `HomeSchema`, guests are refused
  (`guest-not-allowed`). `PROTOCOL_VERSION` bumped 8→9. See
  avatar-and-identity.md §7E and `papr-world-land-and-dwellings` for how
  this relates to the still-open decisions (old-house disposition,
  neighborhood capacity, critter friendship binding) — none of them block a
  marker-only feature like this one; moving Home later is just overwriting
  the one record, per that doc's own design.
- **The account wardrobe — avatar Phase D.** `AvatarDesignStore`
  (`server/src/avatarDesigns.ts`, `data/avatar-designs.json`) holds each
  account's designs, every one through `sanitizeAvatarDesign` on write and
  on load, bounded by `wardrobeMax` (24) and `maxBytes`. Authenticated
  routes manage it (`GET/PUT/DELETE /account/designs`); `GET
  /avatar-designs/:id` is the public, unguessable-id fetch that remote
  renderers use.
- **Wearing publishes.** A new `wear-design` room message (guests refused)
  validates the design, stores it on the wearer's account, and broadcasts
  the resolved key — so a mid-visit look change reaches everyone present,
  and the account never lags the look neighbors actually see. The client
  sends it on join and on every wear while connected; solo play stays
  quiet. Join-time `drawingKey`s are cleared unless the account holds that
  design (`resolveDrawingKey`), which is the server-side rejection path for
  borrowed or invented keys.
- **Remote cutouts wear real art.** `remoteAvatarVisuals` fetches the worn
  design by id (one cached texture per distinct design per session), and
  rasterizes it through the same exported path the local avatar uses
  (`rasterizeAvatarDesignTexture`). The tinted template remains the floor:
  while loading, on failure, and for guests.
- **The desk wardrobe card.** "Your looks" lists the account library
  read-only (names + sharing state) and offers the one-time, review-then-
  confirm device → account wardrobe import
  (`POST /account/import-wardrobe` — same explicit shape as the solo-save
  migration; a second attempt returns the original receipt and stores
  nothing). Drawing previews and the desk editor remain later slices.

- **Every loose ground pickup now behaves the same.** Food produce baskets
  used to wait on the plant for a deliberate click while seed packets and
  world piles collected on walk-over — which read in play as "some
  resources don't work". `updatePlantInteractions` now gathers any ready
  drop on walk-over; the click-and-hold harvest path remains for aiming
  from a distance.
- **Ready-to-harvest plants say so.** A ready drop breathes: a soft warm
  pool of additive gold light under it (per-instance material, animated
  opacity) plus a gentle sway, phase-offset per plant so a field shimmers
  rather than marches. Both stand still under `prefers-reduced-motion`
  (light stays, pulse does not).
- **A gather cursor verb.** Hovering a loose pile or a plant whose drop is
  ready shows the hand cursor wearing that same warm gold with a small
  patient bob (`data-cursor="gather"`); a still-growing plant keeps the
  plain hand. One verb for "there is something here to take", told by
  light and motion rather than new cursor art.

- **The wardrobe panel — avatar Phase C1.** Settings → "Open your wardrobe…"
  shows every saved look with a rendered preview: wear, rename, duplicate,
  delete, edit in the studio, and the per-design "Show on my player card"
  toggle (`sharedOnCard`). Copies start private; the share toggle does not
  reorder the list. The full-wardrobe rough edge from Phase B is fixed: a
  design that will not fit is worn anyway and handed to the panel as a
  pending save — save it into a freed slot, replace an existing look, or
  keep it worn-only. See `src/ui/avatarEditor/wardrobePanel.ts` and the
  store's new `renameDesign`/`duplicateDesign`/`setSharedOnCard` seams.
- **A pre-existing HUD overlap, found and fixed.** `npm run hud:check` —
  which recent sandbox sessions could not run at all — was failing at HEAD:
  every fresh player's minimap defaulted to (16, 16), squarely over the
  tool rail slots. Two causes, both in `src/ui/hud.ts`: the minimap's
  default position read a `.tool-toolbar` element captured at module scope
  before the toolbar is built (always null), and even resolved it measured
  the 160px rail strip rather than the 184px slots box that actually shows.
  Defaults are now computed lazily from the slots box (transform-aware, so
  the dock's rail re-scale is included), and
  `settleDefaultHudWidgetPositions()` re-places widgets still on their
  wire-time defaults once the rail exists — a saved position is never
  touched. The check passes again across all 7 viewports × 2 dock states.

- **The account tech store.** Learned plans now have an authoritative,
  account-owned home: `AccountTechStore` (`server/src/accountTech.ts`,
  `data/account-tech.json`), with the bounded `AccountTech` shape and
  `sanitizeAccountTech` in the shared protocol and a new
  `LIMITS.accountPlansMax` (500). `grantPlans` is a union — replaying a
  grant can never double-count knowledge — and a grant that adds nothing
  leaves the record byte-identical.
- **The tech half of the solo-save import.** `importSoloSaveIntoAccount`
  now grants the snapshot's plan ids through that store under the same
  reserve-then-credit gate as the pouch: the receipt is still committed
  first, a second attempt still grants nothing (plans included), and both
  `/account/me` and `/account/claim` now carry a `tech` record in the
  account carry snapshot alongside the pouch.
- **Learned techniques on the desk.** The Scrapbook card shows the
  account's learned techniques as friendly names (starter plans included —
  the server stores plan ids opaquely and does not know which are starters,
  which is deliberate), refreshed immediately after a solo-save import.
- **The desk inbox is real.** The Mailbox card now shows the whole bounded
  inbox, not a five-letter preview: waiting parcels come first, each with a
  **Collect into pouch** button, followed by the chronological record of
  letters and collected parcels. Collection from the desk funnels through
  the new authenticated `POST /account/claim-mail` into the same
  `MailStore.claim` the in-world scrapbook uses — one exactly-once
  claimed-id record shared by both doors, so a parcel collected here shows
  as collected in-world and vice versa. The in-game mailbox stays a warm
  ritual; it stops being the only door.

- **Clerk-backed accounts.** Production sign-in supports the managed identity
  layer while the game keeps its own durable account id. Existing paper
  passports can be claimed idempotently instead of producing duplicate people.
- **The account desk.** A signed-in player can see their identity and live
  world memberships outside the game. Every newly provisioned alpha account
  receives an owned Solo World and access to the general Shared World.
- **Durable account/world records.** Neon stores identities, profiles, worlds,
  memberships, and signup invitations. Railway remains the authorization
  boundary and Colyseus remains the live world server.
- **A first control center.** The administrator can provision an invitee,
  email or copy an email-bound Clerk invitation, or create a one-use papr.world
  link for a friend whose email is not yet known. The recipient supplies and
  confirms the address before the restricted Clerk invitation is created.
- **Authenticated world doors.** Desk world cards pass a short-lived Clerk
  session without putting it in the URL. Railway verifies identity and the
  membership's `enter` capability, Vercel mints the existing alpha-door pass,
  and the durable world UUID selects the room/save.
- **The production entry failures were closed.** The account-entry endpoint now
  uses Vercel's callable Node handler, reports non-JSON server failures clearly,
  and uses a Node-ESM-resolvable `.js` import in the compiled function. The
  deployed Solo and Shared World entry buttons are working.
- **Return to desk.** The Settings overlay (the in-game menu — see
  `hudMenus.ts`) has an always-reachable "Return to your desk" action under a
  new "Leaving" section. It calls the same `disconnectSharedSession()` cleanup
  the "Return to solo play" button already used — leaving the Colyseus room
  for real, not just navigating away, so no stale presence lingers for anyone
  still inside — then navigates to `/account/`. The desk URL
  (`src/net/accountDesk.ts`) is same-origin in production (game and site are
  one Vercel deploy) and points at the site's own `astro dev` server locally,
  since the two only share an origin once deployed.
- **Solo-save authority migration.** The desk's scrapbook card now offers a
  one-time, reviewable import of a local solo save. `sanitizeSoloMigrationSnapshot`
  (`shared/src/protocol/validate.ts`) clamps whatever `account.ts` reads out of
  `localStorage['pencil-and-paper.game-save.v1']` — bounded stacks, bounded bag
  size, bounded plan-id list — before it ever reaches the server. The player
  sees the counts (chips, resource/tool/item stacks, learned-plan count) and
  must explicitly confirm before anything is granted; there is no background
  upload. `SoloMigrationStore` (`server/src/soloMigration.ts`) reserves the
  receipt to disk *before* crediting a single unit — `importSoloSaveIntoAccount`
  in `server/src/accountIdentity.ts` then grants chips/resources/tools/items
  through the existing `MailStore.grant` primitive, the same one-time-crediting
  path the Neighborhood Pouch already trusts. A second import attempt (reload,
  double-click, retry after a network blip) returns the original receipt
  instead of granting twice. `POST /account/import-solo-save` is the new
  endpoint; the desk renders the stored receipt afterward with no button left
  to press. Learned plans recorded in the receipt are now granted into the
  account tech store under the same one-time gate (see the tech-store bullet
  above).

## Verification at closeout

- Tropical build + art wiring (2026-09-18 pass): root suite **638/638 pass
  across 67 files** (two stale tests updated: `fields.test.ts`'s
  generated-biome list, and the place-knowledge conversation test now passes
  because tropical has a scattered seed keeping the harvest lane alive),
  root `npx tsc --noEmit` clean, `npm run content:check` clean, `node
  tools/validate-quests.mjs` clean at 45 quests, `npm run styles:check`
  clean at **802 rules** (no CSS touched), `npx vite build` completes,
  `npm run edge:check` clean, `npm run fields:sample` records the mix in the
  entry above. `npm run assets:compile` compiled all 51 new SVGs with zero
  failures (446 assets, 34 resource materials, 186 loose variants); `npm run
  art:check` reports the two new tiles as picked up. **Not yet exercised in
  a real browser** — the by-hand proof is item 0 in "Do this next." Site and
  server packages untouched this pass, not re-checked.
- Home markers (this pass): root suite **595/596 pass across 62 files**
  (the one failure is the same pre-existing Playwright-download gap noted
  throughout this doc — `chromium_headless_shell` isn't installed in this
  sandbox copy, unrelated to this change), root `npx tsc --noEmit` clean,
  `npm run styles:check` clean and unchanged at **792 rules** (no CSS
  touched this pass), root `npx vite build` completes, `npx tsc -p
  tsconfig.edge.json` clean. Server package checked on its own (fresh
  `server/` copy, its own `npm install`): `npx tsc --noEmit` clean, `npx
  vitest run` **68/68 pass across 12 files** (`handleSetHome` is thin glue
  over the same pattern `handlePlayerCardRequest` already uses — no
  dedicated test added, matching how that method's own untested-glue
  precedent was justified in the E1 entry below). Site package untouched,
  not re-checked. **Not exercised in a real browser or with a live second
  player**, same sandbox limitation as every entry below. **By-hand proof
  owed:** open the game, confirm your own Home marker is NOT drawn for you;
  from a second account/browser, confirm their Home marker appears as a
  staked lot with the right name and that clicking it opens their player
  card; move Home to a new spot (once there's a way to do that from the
  places panel) and confirm the marker relocates rather than duplicating.
- Activity-log fix + Phase E1 (this pass): root `npx tsc --noEmit` clean,
  root suite **503/503 pass across 47 files** (no Playwright-download
  failure this run — see `pencil-and-paper-sandbox-build` notes on why that
  one comes and goes), `npm run styles:check` clean at **792 rules, no
  shadowed declarations** (was 785 at the top of this session), root
  `npx vite build` completes, `npx tsc -p tsconfig.edge.json` clean. Server
  package checked on its own (fresh `server/` copy, its own `npm install`):
  `npx tsc --noEmit` clean, `npx vitest run` **68/68 pass across 12 files**
  (`handlePlayerCardRequest` is thin glue over `accounts.getForClaim`,
  `avatarDesigns.listFor`, and `blocks.isBlocked`, all already covered by
  their own suites — matching how the desk inbox and claim-mail glue went
  untested directly in an earlier pass). Site package untouched this pass,
  not re-checked. **Not exercised in a real browser or with a live second
  player** — this sandbox has no path from the Linux VM `device_bash` runs
  in to a browser on the actual host, so the "run `npm run dev` and view it
  in Chrome" verification `pencil-and-paper-sandbox-build` describes was not
  actually reachable this pass despite having browser tools available; flag
  that gap for whoever tries it next, not just "no browser available."
  **By-hand proof owed:** click "Return to your desk" from the Activity
  drawer and confirm it behaves like the Settings one; click a neighbor
  in-world and confirm the card opens with the right name/avatar/count,
  fills in papering-since once the account round trip lands, and shows any
  shared wardrobe looks; block someone (or have them block you) and confirm
  their card reads "Nothing to show here." with no other tell.
- Root suite: **565 tests pass** across 58 files.
- `npm run edge:check` passes.
- `npm run build:web` completes for the game and nine-page Astro site.
- A separately emitted Node deployment artifact imports successfully with
  `api/account-entry.js` resolving `lib/gate.js`.
- Production sign-in, account provisioning, desk world cards, and world entry
  were exercised after deployment by the owner.
- Return to desk is verified against the root suite only: 519 tests across 49
  files pass (one pre-existing Playwright-download failure, unrelated — see
  `pencil-and-paper-sandbox-build` notes), `npx tsc --noEmit` clean,
  `npm run edge:check` clean, `npx vite build` clean. **Not yet exercised in a
  real browser** — this session's sandbox cannot run Playwright or reach a
  deployed environment. The owner should click it once from inside a shared
  room before trusting it: confirm the avatar actually disappears for the
  other player and `/account/` loads clean.
- Solo-save authority migration (previous pass): root suite 570/571 pass across 59
  files (same pre-existing Playwright-download failure as above, still
  unrelated), `npx tsc --noEmit` clean, `npx vite build` clean. Server package
  checked on its own (`server/` copied fresh, its own `npm install`):
  `npx tsc --noEmit` clean, `npx vitest run` **52/52 pass**, including the new
  `soloMigration.test.ts` and the `accountIdentity.test.ts` import-flow cases.
  Site package checked on its own the same way: `npx astro check` is clean for
  both changed files (`account.astro`, `account.ts`); the 17 errors it reports
  elsewhere are pre-existing and untouched by this pass (redeclared
  block-scoped names across unrelated page scripts, plus a `vitest`-types
  error astro check picks up from a `.test.ts` file — worth a look someday,
  not blocking); `npx astro build` completes and bundles `account.astro`'s
  script.
- Account tech store (this pass): root suite **584/584 pass across 61 files**
  (that Playwright-download failure did not reproduce this time), root
  `npx tsc --noEmit` and `npm run edge:check` clean, `npm run build:web`
  completes. Server package: `npx tsc --noEmit` clean, `npx vitest run`
  **60/60 pass** including the new `accountTech.test.ts`, the expanded
  `accountIdentity.test.ts` plan cases, and `sanitizeAccountTech` in the
  shared protocol tests. Site package: `npx astro check` reports zero
  diagnostics in the changed files (`account.astro`, `account.ts`) and only
  the same pre-existing errors elsewhere; `npx astro build` completes. (The
  checker itself, `@astrojs/check`, was missing from this environment's
  `site/node_modules` and was installed with `--no-save` to run the gate;
  `site/package.json` and the lockfile are untouched.) **Still not exercised
  in a real browser** — the hand proof in "Do this next" item 1 now also
  covers the learned-techniques list after an import.
- Desk inbox (same pass, same gates re-run green): the new endpoint is thin
  glue over `MailStore.claim` (already covered by `mail.test.ts`'s
  exactly-once cases), so the identity tests cover its collaborators rather
  than the Express wrapper, matching house style. The bundled account page
  (`dist/_astro/account.astro_astro_type_script_*.js`) contains the
  claim-mail call. **By-hand proof owed with the rest of item 1:** receive a
  parcel (Pip's welcome parcel will do), collect it from the desk, reload,
  confirm it now reads "parcel collected" and the pouch total rose by the
  attachment.
- Wardrobe panel + HUD fix (this pass): root suite **592/592 across 62
  files** (8 new tests in `src/ui/avatarEditor/wardrobe.test.ts` —
  round-trips, the wardrobe cap, rename normalization, copy-name bounds,
  private-by-default duplicates, share toggle without reordering, worn
  pointer cleanup, corrupt-entry skipping), `npx tsc --noEmit` clean,
  `npm run styles:check` clean (781 rules, no shadowed declarations),
  `npm run edge:check` clean, `npx vite build` completes, and
  `npm run hud:check` passes against a real dev server across 7 viewports ×
  2 dock states — it was failing at HEAD before the minimap fix above, so
  run it after pulling. **Not yet clicked in a real browser by hand**: save
  a few looks, then wear/rename/duplicate/delete/share them from Settings →
  "Open your wardrobe…", and stuff the wardrobe past 24 looks once to see
  the pending-save card.
- Gathering feel pass (previous pass, gates re-run green — 592/592, tsc,
  styles:check at 785 rules, vite build): verified in a real headless
  browser against the dev server — the game boots with zero console/page
  errors, and a pointer sweep over the spawn clearing engages the new
  `gather` cursor over a loose pile and `hand` over other interactables.
  Note for future smokes: a fresh profile opens the first-run avatar
  studio over the world, so seed `pp.avatar.firstRunDone.v1` before
  sweeping. **By-hand proof owed in play**: grow any food crop to ready
  (growth is real-time, so this is a patience check), confirm the gold
  pool + sway and the gather cursor on hover, and walk over the basket to
  confirm it collects like every other loose pickup.
- Avatar Phase D (this pass): root suite **600/600 across 63 files** (8 new
  `avatarDesigns.test.ts` cases — save/update/bounds, ownership-scoped
  deletes, `resolveDrawingKey` incl. guests and borrowed keys, one-time
  import receipts, corrupt-entry-skipping reloads), root + server `tsc`
  clean, server **68/68**, `npx vite build` and `npm run edge:check` clean,
  site `astro check`/`astro build` clean with the wardrobe card bundled.
  Against a real running server: `GET /avatar-designs/:id` serves a seeded
  design, a bogus id 404s, and unauthenticated owner routes are refused.
  The game boots clean in a headless browser (the new
  avatarLook → sharedSession import chain has no cycle). **Not yet proven
  with two live clients** — see "Do this next" item 2.

## Do this next

**Before inviting testers (owner-only, in this order — everything codeable is done):**

1. Commit, push, and let Vercel + Railway redeploy.
2. Run the hosted smoke in `hosting.md` — the original list plus the new
   "account-era additions" (fresh browser profile as the tester).
3. Play the 30–45 minute loop once in a fresh profile yourself (or have a
   friend do it) — the one-pager's path in `alpha-invite-and-consent.md`.
4. Review and personalise `alpha-invite-and-consent.md` (refreshed for the
   invite link → desk flow), then send Stage 1: 1–2 plumbing testers.
5. Triage `?review=1` and the moderation queue weekly from the first invite.


0. **Walk to the tropics and look around (the 2026-09-18 by-hand proof).**
   Follow the wet air until the ground turns dark green (the minimap should
   show the new jungle color): confirm the canopy mixes palms, jungle
   broadleafs, and bananas over a crowded understory; that parrots
   fly-and-preen and say tropical things; that jungle loam piles collect on
   walk-over and a layer-2 dig yields rainfold pebbles; and that a tomato
   seed packet turns up there. On the way, check a marsh river bank for
   reeds/pickerelweed/iris and a calm reach for duckweed and lily-pad
   clusters, and confirm dunes/forest pages picked up their new understory
   without thinning the cactus. Talk to a parrot, take one tropical quest
   start to finish, and watch the trinket land on the shelf.
1. **Still owed on browser proof — now including the two newest features.**
   The solo-save import (inventory and tech), Return to desk (both entry
   points now), and the player card have only been verified against the
   test/build suite, never a real browser or a real second player. Play
   solo long enough to bank a few resources/tools/a learned plan, sign in at
   the desk, confirm the review counts match, accept, reload, and confirm
   the receipt, the pouch amounts, and the learned-techniques list all
   match; click Return to desk from both the Activity drawer and Settings,
   from inside a shared room, and confirm the avatar disappears for the
   other player each time; and open a neighbor's player card to confirm it
   renders correctly and that a blocked pairing reads "Nothing to show
   here."; and, with a second account online, confirm
   their Home marker appears as a staked-out lot (and yours doesn't, to
   you), and that clicking either the marker or the avatar opens the same
   card.
2. **Phase D's by-hand proof — two browsers.** Make a look, wear it, join
   one neighborhood from both browsers, and confirm the second browser
   renders the actual drawing (not the tinted cutout) — then change the look
   mid-visit and confirm it updates for the other player. Also import the
   device wardrobe from the desk once and confirm the "Your looks" list and
   one-time receipt behave.
3. **Continue in dependency order.** Avatar **Phase E's remaining
   entry points** — "made by —" on a piece and a chat-name entry point,
   both opening the same card E1 already shipped ("house of —" shipped this
   pass as the home-marker feature) — are the next avatar slice; see
   avatar-and-identity.md §7E for why each was left rather than rushed (no
   maker-credit click behavior exists at all yet). Also worth a look: a way
   to actually move Home from the places panel now that a home marker is
   something neighbors see move — `src/world/places.ts` fixes Home at
   spawn today with no relocate function. Past that: the desk's drawing
   previews/editor and settings remain on the accounts side, and C2 (the
   closet) stays gated on report/hide for displayed drawings (§6.1).
4. **Give shared-world learning a server credit route.** The tech store's
   `grantPlans` is the seam; nothing calls it in-world yet, so knowledge
   earned in a Shared World still lives only in local saves. Wire server-side
   learning completion (or the first shared crafting slice) to it when that
   gameplay lands.

## Watch out for

- The account carries scrapbook inventory, chips, learned techniques, avatar
  library, friends, and messages. A world owns terrain, houses, placed storage,
  crops, and shared projects. Do not blur this boundary during migration.
- A world UUID is identity, not authorization. Every entry still requires a
  verified account and an `enter` capability.
- Clerk secrets and database credentials stay server-side. Never put session
  tokens in game URLs, logs, or persistent browser storage.
- Signup links may expire; accepted account and world memberships do not depend
  on retaining an invitation link.
- `PROTOCOL_VERSION` is 11. Bump it for wire-shape changes, not for the desk-only
  navigation control. The `wear-design` room message (Phase D) was added
  without a bump, deliberately: it is purely additive — no existing shape
  changed, older clients simply never send it, and an older server ignores
  it — unlike the v4/v8 changes that altered what existing messages mean.
  The tropical build changed no wire shapes at all (it is page generation
  and catalogs), but it *did* reshuffle what already-visited land looks
  like — accepted on purpose during alpha (option 1 in
  `tropical-biome-plan.md`); tree growth survives by page id + tree key.
- Preserve the plain offline/solo sandbox distinction. It must not silently
  overwrite authoritative account inventory or tech progress — the migration
  is explicit, reviewed, and one-time by design (`SoloMigrationStore.reserveOnce`
  writes its receipt before crediting anything, precisely so a second attempt
  can never double-grant); do not turn it into a background sync.
