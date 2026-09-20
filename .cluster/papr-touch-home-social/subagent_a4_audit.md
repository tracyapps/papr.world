# Readiness audit — can we start real multiplayer testing?

Read-only investigation. Snapshot: **2026-09-20 17:14 CDT**, `HEAD = ba32f1d` ("touch interface plan, ui fixes", 2026-09-20 16:48).
Only this file was written.

**Caveats, read first.**

- The working tree was being actively edited by this cluster while this audit ran.
  `git status --short` went from 11 to 19 changed paths between two commands;
  `src/main.ts`, `src/styles.css` and `src/game/touchControls.test.ts` appeared
  mid-audit. Anything marked **WIP** below is *uncommitted* and its line numbers are
  moving. For those files I cite the symbol, not a line.
- Method: every claim is cited to source. Two literals came back masked by the tool
  pipeline and were confirmed by hexdump (`src/net/passport.ts:15` is the
  `pp.`-prefixed passport storage key; `src/net/worldEntry.ts:3` is the
  `pp.managed-world-entry.v1` handoff key). No claim rests on a masked string.
- Committed HEAD contains **none** of the WIP listed in §1; the docs that describe
  touch/plates/profiles as "not built" are accurate for HEAD and stale for the tree.

---

## 1. The owner's six asks — status

Legend: **built** = in `HEAD`; **WIP** = uncommitted in the working tree right now;
**not found** = no code and no doc anywhere.

### Ask 1 — touch/tablet controls (move pad, multi-touch)

| | |
| --- | --- |
| Exists | `src/game/touchControls.ts` (**WIP**, new, 374 lines): `padOffsetToMovement`, `twoPointerDistance`, `pinchZoomDelta`, `areTouchControlsEnabled`, `initializeTouchControls`. Multi-pointer + pinch bookkeeping is wired into `src/game/input.ts` (**WIP**: `trackedPointers` map, `orbitPointerId`, `pinchDistance`, `dropPointer`); `setVirtualMovement` is summed inside `getMovementInput` so keyboard + gamepad + thumb stay one source. `touchControls: 'auto' \| 'on' \| 'off'` setting, default `'auto'`, validated on load (`src/game/settings.ts`, WIP). `viewport-fit=cover` (`index.html`, WIP). Overlay CSS exists (`src/styles.css`, WIP) including `touch-action: none` on the canvas — the exact gap `docs/touch-and-tablet.md` names. |
| Missing | `src/game/touchControls.test.ts` **fails 2 assertions**; root suite is `1123 passed / 2 failed` (dead-zone edge case; `pinchZoomDelta(120,120)` returning `-0` instead of `+0`). `docs/touch-and-tablet.md:1-3` still says "**an estimate, not built**", and `docs/next-session.md:16-17` says "Tablet and touch controls are estimated in `touch-and-tablet.md`; not built." |
| Must be built | Slice 5 of the doc — tablet layout and 44 px targets across panels (`docs/touch-and-tablet.md:52`). And an honest device pass: the doc's own testing note says pad and pinch "need a real iPad in hand" (`docs/touch-and-tablet.md:62-64`); nothing here has been on a device. |

Housekeeping: `touchControls.ts`'s header claims unit tests live in
`touchControls.test.ts` (they do, but they are red), and two scratch files remain —
`src/game/__tmp_mock_probe.test.ts` (imports `./touchControls` under a mock) and
`src/game/__tmp_dep.ts`, which is the sole reason `npx tsc --noEmit` fails (§2a-1).

### Ask 2 — house build/improve/expand + starter tent & Thing Maker L1 in neighborhood clumps

| | |
| --- | --- |
| Exists | **Dwelling growth, built.** `src/sim/catalogs/dwellings.ts`: six parts (`floor, walls, roof, upstairs, room-1, room-2`), costs and waits, `requiresParts` ordering, refund loss 0/5/10/10 % (`DWELLING_REFUND_LOSS_PERCENT`); `dwellingStage()` returns `'tent'` when no parts exist, so the starter tent is the *absence* of parts rather than a granted object. `src/sim/dwelling.ts` (projects, timestamps, settle), `src/game/homePanel.ts` (costs in words, "Put in what I have", take-back/refund, no controls on locked cards, prompt "Press E to plan, build or go in"), `src/game/dwellingLook.ts` + `dwellingExterior.ts`, `src/world/homeSite.ts` (tent at `HOME_OFFSET {x:-2.1,z:1.2}`, door turned to the place, solid body + annex circles). Parts are gated by five abilities (`house-floors/-walls/-roofs/-stairs/-rooms`). **Thing Maker L1 built**: `world.thingMaker.level` defaults to `1` (`src/sim/state.ts:405`) and `thingMakerLook.ts` gives level 1 its own accumulating part list at full hit-box size. **Neighbor homes published and drawn**: `SetHomeIntent.parts/building` (`shared/src/protocol/messages.ts`), `HomeSchema` mirrors them (`server/src/schema/PaperRoomState.ts:64-75`), `PaperRoom.handleSetHome` joins them (`:1072`), `src/world/neighborHomes.ts` decodes, `src/net/sharedHomeVisuals.ts` draws tent/house + scaffolding + sign. |
| Missing | **Clumping is not wired.** `src/world/neighborhood.ts` (**WIP**, new, 211 lines) is a pure, tested lot allocator: `LOT_SPACING = 8`, six slots per ring, `LOT_CAPACITY = 817`, `nextLot(anchors, origin, page)`. `nextLot` has **no caller anywhere in `src/`** (only `src/world/neighborhood.test.ts`); nor does `homePlaceForLot` (`src/world/homeSite.ts`, WIP). A player's Home place is still the fixed spawn bookmark `HOME_PLACE_ID` at `x:-1.5, z:-2.2`, renameable but never relocatable (`src/world/places.ts:18`). Two players who never move Home stack on top of each other in a shared world. |
| Must be built | Call `nextLot` with the published homes on the player's page as anchors and write the result into the Home place (then `SetHome`). Design: `docs/land-and-dwellings.md:128-148` ("starter house, placed for them"), `:286-292` ("unbounded to explore, clustered to live"). No code does the placing. Also missing by design: a mail line when a build finishes (`docs/house-and-home.md:419`), parties/invites/scheduled open house/mailbox balloons (`:371-374`), priced cases and cases indoors (`:415`). |

### Ask 3 — "address" plates showing the username, linked to the player card

| | |
| --- | --- |
| Exists | **Plate drawn + hit test written (WIP).** `homeAddress()` — number derived from the account id via FNV-1a (`stableHash`), text `No. 12 · Wren`, stable across a rename; `HomeAddress` carries `accountId` so a click can open a card (`src/world/neighborHomes.ts`, WIP, "The address plate" section). Plate sprite on its own stake opposite the sign (`src/net/sharedHomeVisuals.ts`, WIP: `makeAddressPlateSprite`, `PLATE_LOCAL`, `disposeSprite`), and `pickSharedHomePlateAtScreen()` returns the `HomeAddress` (`:284-292`). Tests ride in `src/world/neighborhood.test.ts`. The card itself is built: `src/ui/playerCard.ts` (`openPlayerCardFor` :251), `ClientMessage.RequestPlayerCard` → `PlayerCardInfo` (`shared/src/protocol/messages.ts:395`), served by `PaperRoom.handlePlayerCardRequest` (`server/src/rooms/PaperRoom.ts:1011-1048`). |
| Missing | **The click is not wired.** `pickSharedHomePlateAtScreen` has **no caller**; the home click handler uses `pickSharedHomeAtScreen` only and always opens the door panel (`src/main.ts:332-345`, interaction id `home-marker`, priority 82). Clicking the plate therefore opens the door panel. The card is reachable only via that panel's "Their player card" button (`src/game/visitPanel.ts:77`, `:192`). |
| Must be built | Register a plate interaction (or branch inside `home-marker`) calling `openPlayerCardFor({accountId, name, drawingKey:''})`. **Privacy caveat:** the plate prints the display name to everybody; the name is public in synced room state and on `HomeSchema` (`server/src/schema/PaperRoomState.ts:67`). "Privacy-dependent" is honoured only for the card's *account-owned* half: a block or a guest collapses the server's answer to `found:false` → "Nothing to show here." (`PaperRoom.ts:1011-1048`; `src/ui/playerCard.ts:341`). No name/plate visibility setting exists anywhere. |

### Ask 4 — friend request with an optional short message + "basic profile info is shared" disclosure

| | |
| --- | --- |
| Exists | Friendships: `server/src/friends.ts` (mutual, quiet no, blocks win, purge, TTL), room handlers `handleFriendRequest/Answer/Remove` (`PaperRoom.ts:1147 / 1199 / 1221`), snapshot + push (`:1115-1145`), client `src/game/guests.ts` (`requestFriend` :156), panel `src/game/friendsPanel.ts`, card buttons `src/ui/playerCard.ts:217-247`, door panel buttons `src/game/visitPanel.ts:68-80`. **The wire type for the message exists and is unused (WIP):** `FriendRequestIntent = { accountId: string; message?: string }` and `FriendRequestRecord.message?` (`shared/src/protocol/guests.ts`, WIP), `LIMITS.friendRequestMessageMax = 140` (`shared/src/protocol/constants.ts:105`), `sanitizeFriendRequestMessage()` (`shared/src/protocol/validate.ts:88-93`). |
| Missing | The message is **type-and-sanitizer only**. `Request` has no message field in the store (`server/src/friends.ts:24`), `friends.request()` takes none (`:154`), `handleFriendRequest` never reads `msg.message` (`PaperRoom.ts:1147-1198`), `incoming()/outgoing()` return `{accountId,name,at}` (`:139-151`), the client sends `{accountId}` only (`src/net/client.ts:337-340`), and no UI asks for a note. A client that sent one would have it **silently dropped**. **The disclosure copy is not found** — no "basic profile info"/sharing notice in `src`, `shared`, `site` or `docs`. Only the code-level rule exists, in `profileForViewer`'s owner clause (`shared/src/protocol/profile.ts`, WIP): the owner of a profile who has sent a request has their basic fields visible regardless of visibility. |
| Must be built | Store the note (JSON field + schema), sanitize it in `handleFriendRequest`, surface it in the panel row, add the input to the card/door/panel, and write the disclosure sentence at the moment of asking. Nothing else in the pipeline needs a new shape. |

### Ask 5 — profile bio + social links with everyone / friends / friends-of-friends visibility

| | |
| --- | --- |
| Exists | **A complete, tested shared model (WIP, uncommitted).** `shared/src/protocol/profile.ts` (346 lines): `ProfileVisibility` with exactly the three levels asked for; per-field audiences `PROFILE_FIELDS = ['bio','links']`, closed-by-default (`friends`); the `SOCIAL_LINK_KINDS` allow-list; `sanitizeBio`, `sanitizeSocialLink`, `sanitizeSocialUrl` (http(s) only, length- and control-char-checked), `sanitizeProfileUpdate`; `canViewProfileField` (the full relationship × visibility matrix); and `profileForViewer(profile, relationship, {hasSentRequest})` — the owner rule. `LIMITS.bioMax = 280`, `socialLinksMax = 6`, `socialUrlMax = 200` (`constants.ts:122-126`, WIP). Tests: `shared/src/protocol/profile.test.ts` (WIP). **The database columns already exist**: `player_profiles (handle, display_name, bio, social_links jsonb, privacy jsonb)` (`server/src/database.ts:60-72`). `ClientMessage.SetProfile` + `SetProfileIntent` are in the wire contract, and `PlayerCardInfo` gained `bio?/links?/relationship?` (`shared/src/protocol/messages.ts:395`, all WIP). |
| Missing | **Everything that would make it real.** No store, no route, no room handler: `PaperRoom.onCreate` registers no `SetProfile` handler (`PaperRoom.ts:237-303`); `handlePlayerCardRequest` still sends only `{accountId, found, papersSince, sharedDesignIds}` (`:1033-1040`); nothing reads or writes `bio` / `social_links` / `privacy` in `database.ts` (grep: only the `CREATE TABLE`); no client or desk UI. This cluster's plan assigns those to round-2 agents (`B2` `server/src/profileHandlers.ts`, `B3` desk editor — `.cluster/papr-touch-home-social/plan.md`). |
| Must be built | Profile store + routes; a `SetProfile` room handler; feed bio/links/relationship into `PlayerCardInfo` through `profileForViewer`; render in the card; a desk editor. Also decide where `handle` is claimed (the table allows it; nothing sets it). |

### Ask 6 — blocking + reporting tied into all of the above

| | |
| --- | --- |
| Exists | **Server-side blocking is thorough.** `BlockStore` (`server/src/blocks.ts`; write-through, bounded at `LIMITS.blockListMax = 500`), `handleBlock/Unblock` (`PaperRoom.ts:785-813`), enforced at: chat delivery and backlog (`:529-537`, `:1110-1114`), mail (`:911-953`), the player card (`:1011-1048`), display cases (`:650-660`, `:707-722`), the front door (`decideAccess` → `'closed'`, `server/src/homeAccess.ts:31-41`), knock answers (`:1384-1404`), and friendship purge at the moment of blocking (`applyBlockAtTheDoor`, `:1436-1449`). **Reporting** is contextual, from one chat line, with the exact line snapshotted from the server's own log and never the client's claim (`PaperRoom.ts:815-861`), into a separate queue with its own token (`server/src/moderation.ts`; routes `server/src/index.ts:451-465`). `ReportIntent` already carries `accountId` + optional `messageId` + `details`. |
| Missing | **One entry point for both controls: the ⋯ menu on a chat message** (`src/ui/sharedChat.ts:123` block, `:143` report; the only `onBlock`/`onReport` call sites are `:296-300`, wired once at `src/net/sharedSession.ts:191-193`). Not tied in: the player card (friend actions only — `src/ui/playerCard.ts`), the friend row (`src/game/friendsPanel.ts` — Remove only), the door/visit panel (`Ask to leave` is explicitly not a block), the address plate, and the mail reader. Reporting also has no non-message form, so a report about a person (not a line) has no control even though the intent and schema support it. |
| Must be built | Block (+ report where it applies) on the card, the plate, and the friends/door panels, all funnelling into the existing `sendBlock`/`sendReport`. No new server state is needed: `handleReport`'s `messageId` is already optional (`:826-832`). |

---

## 2. What is missing right now to start real multiplayer testing

### (a) Code blockers — ordered by risk

1. **`npx tsc --noEmit` fails at the repo root.** One error, from a leftover scratch file:
   `src/game/__tmp_dep.ts(2,46): error TS2345: Argument of type '"a"' is not assignable to parameter of type 'keyof Settings'`.
   `npm run build` runs `tsc` (`package.json`), so **this blocks every Vercel build today**.
   Fix: delete `src/game/__tmp_dep.ts` and `src/game/__tmp_mock_probe.test.ts`.
   (Server `npx tsc --noEmit` is clean; server suite `146/146 pass`.)
2. **The root test suite is red: `1123 passed / 2 failed`** — both in the WIP
   `src/game/touchControls.test.ts` (a dead-zone edge assertion and a `-0 !== +0` pinch
   assertion). Not necessarily a product bug, but a red suite means "green before
   deploy" cannot be asserted.
3. **Uncommitted, unreviewed WIP is load-bearing for four of the six asks** (touch,
   plates, clump layout, profile contract). None of it has been through the round-3
   adversarial review defined in `.cluster/papr-touch-home-social/plan.md`. Deploying
   `HEAD` deploys none of it; deploying the tree deploys all of it unreviewed.
4. **Clump placement has no caller** (`nextLot`), so with two players in one shared
   world the homes coincide — the one gap in the six asks that changes what a
   two-client test would actually show.
5. **Block/report reach.** A tester can only block or report someone by finding a chat
   line from them. That is a real safety gap for a live test, and it is cheap to close:
   the server already supports both without a message.
6. Trap for whoever runs the test: **two tabs of one browser share one passport**
   (`docs/hosting.md:215-217`), so the smoke must use two browsers or a private window.

### (b) Configuration / environment blockers

All documented, all owner actions, none code:

1. **Railway: a volume mounted at `/data`.** Everything durable lives there
   (`docs/hosting.md:98-106`). Without a writable directory the server *refuses to
   start* — loud guard `assertDataDirWritable()` → `process.exit(1)` with the errno
   (`server/src/stores.ts:36-59`). The Dockerfile sets `PP_DATA_DIR=/data` (`Dockerfile:46`)
   and fixes volume ownership at startup (`Dockerfile:44`, `docker-entrypoint.sh`).
2. **`PP_CORS_ORIGIN` = exactly `https://papr.world`** (no trailing slash). Unset means
   `*` with credentialed reflection (`server/src/index.ts:37`, `:57-70`). Wrong origin →
   "Could not reach the paper-passport service" (`docs/hosting.md:330-334`).
3. **`VITE_SHARED_WS_ENDPOINT` (`wss://…`) and `VITE_FEEDBACK_HTTP_ENDPOINT` (`https://…`)
   on Vercel, then redeploy.** Build-time only (`vite.config.ts`, `envPrefix`;
   `docs/hosting.md:67-71`). Client-side guards give accurate errors:
   `src/net/sharedConfig.ts` (insecure `ws://` from `https`, or missing endpoint) and
   `src/net/passport.ts` (fetch failure message).
4. **`PAPR_ALPHA_CODES` / `PAPR_ALPHA_SECRET`** — an empty code list means *the door
   stands open* (`docs/hosting.md:156-160`). Codes are four letters + two digits,
   alphabet excluding I/O/0/1.
5. **`PAPR_OWNER_ACCOUNT` (the owner's passport id).** Unset → `removal: DISABLED …
   guests allowed` (`server/src/index.ts:477-481`). Set → guests refused
   (`PaperRoom.onAuth`, `server/src/rooms/PaperRoom.ts:203`).
6. **`PP_REVIEWER_TOKEN` and `PP_MODERATION_TOKEN`, two different values.** Missing
   reviewer token → `?review=1` returns 503; missing moderation token → reports are
   still written but unreadable (`server/src/index.ts:234-251`, boot log `:482-491`).
7. **`DATABASE_URL`** (Neon pooled, `sslmode=require`) only for account/desk worlds;
   absent → managed accounts disabled, `database.migrate()` skipped (`server/src/runtime.ts`,
   `server/src/index.ts:47`); present but broken → the deploy fails on purpose
   (`docs/hosting.md:39-42`).
8. **Clerk on both hosts where documented** — `CLERK_SECRET_KEY`,
   `CLERK_AUTHORIZED_PARTIES`, `PP_ADMIN_CLERK_USER_IDS` on Railway;
   `PUBLIC_CLERK_PUBLISHABLE_KEY`, `PUBLIC_PAPR_API_URL` on Vercel. The **game build**
   reads the publishable key, so without it reloads and rejoins in account worlds fail
   (`docs/hosting.md:56`, `:60-66`; `src/net/accountAuth.ts:31-35`).
9. **`wss://`, one replica.** `railway.json` `numReplicas: 1`; the JSON stores are
   single-writer by design (`docs/hosting.md:427-429`).
10. **Turn Railway *App Sleeping* off** for the alpha (`docs/hosting.md:296-300`, `:365-367`).

### (c) Operational blockers

1. **A moderation triage habit that actually happens.** `docs/alpha-invite-and-consent.md:74`
   — "Weekly from first invite: triage both the `?review=1` feedback desk **and** the
   moderation report queue (`PP_MODERATION_TOKEN`), with a stated response-time
   expectation for reports." No automation exists; the surfaces are the `?review=1` desk
   and `GET /review/reports` (`server/src/index.ts:451-465`).
2. **No separate moderator.** One person holds both tokens; the two-token split
   (`docs/hosting.md:409-411`) exists so this *can* be delegated, but is not.
3. **No notification or SLA.** A report sits in a file until somebody opens the desk.
4. **Invite discipline.** Stage 1 = 1–2 plumbing testers; Stage 2 = the 3–5 cohort; at
   most two research questions per build; personal messages, not a blast
   (`docs/alpha-invite-and-consent.md:66-74`).
5. **Back up `/data` before any protocol change.** `PROTOCOL_VERSION` is **11**
   (`shared/src/protocol/constants.ts:13`), `SAVE_VERSION` is 1
   (`docs/hosting.md:431-433` — note that doc still prints "8").
6. **The consent/one-pager is still a draft** owed an owner pass:
   `docs/alpha-invite-and-consent.md:3` — "**DRAFT — owner review before first send.**"
7. **The hosted smoke has never been run green** (§3).

---

## 3. Things explicitly owed a real-browser / two-client proof (quoted)

Two clients / two browsers:

- `docs/house-and-home.md:336-337` (guests/friends/visiting): "In the browser, with injected fake neighbors, these were seen working: … **Not yet tried: two real browsers** in one room (so the presence jump over the wire is unwatched). **Protocol v10.**"
- `docs/house-and-home.md:385` (display cases): "**Protocol v11.** Not yet tried: two real browsers in one room."
- `docs/next-session.md:42-43`: "Server and shared tests pass, including a real-socket room test. **Not proven yet:** two real browsers in one room."
- `docs/next-session.md:27-28`: "**Not proven:** two real browsers in one room. **Before deploying:** back up `/data` (`mail.json` now holds `cases`); every client must refresh (v11)."
- `docs/next-session.md:632-633`: "**Not yet proven with two live clients** — see 'Do this next' item 2."
- `docs/next-session.md:675-679` ("Phase D's by-hand proof — two browsers"): "Make a look, wear it, join one neighborhood from both browsers, and confirm the second browser renders the actual drawing (not the tinted cutout) — then change the look mid-visit and confirm it updates for the other player."

One real browser, still test-suite-only:

- `docs/next-session.md:660-673`: "The solo-save import (inventory and tech), Return to desk (both entry points now), and the player card have only been verified against the test/build suite, never a real browser or a real second player … and, with a second account online, confirm their Home marker appears as a staked-out lot (and yours doesn't, to you), and that clicking either the marker or the avatar opens the same card."
- `docs/next-session.md:649-659` (item 0): walk to the tropics — canopy mix, parrots, jungle-loam on walk-over, layer-2 dig yields rainfold pebbles, a tomato seed packet turns up, marsh reeds/duckweed, dunes/forest understory, one tropical quest end to end with the trinket landing on the shelf.
- `docs/next-session.md:517-519` (home markers): "**Not exercised in a real browser or with a live second player** … **By-hand proof owed:** open the game, confirm your own Home marker is NOT drawn for you; from a second account/browser, confirm their Home marker appears as a staked-out lot with the right name and that clicking it opens their player card."
- `docs/next-session.md:588-591` (Return to desk): "**Not yet exercised in a real browser** … click it once from inside a shared room before trusting it: confirm the avatar actually disappears for the other player and `/account/` loads clean."
- `docs/next-session.md:608-612` (wardrobe panel): "**Not yet clicked in a real browser by hand**: save a few looks, then wear/rename/duplicate/delete/share them from Settings → 'Open your wardrobe…'".
- `docs/next-session.md:619-623` (gathering feel): "**By-hand proof owed in play**: grow any food crop to ready … confirm the gold pool + sway and the gather cursor on hover".
- `docs/next-session.md:595-597` (desk inbox): "**By-hand proof owed with the rest of item 1:** receive a parcel (Pip's welcome parcel will do), collect it from the desk, reload, confirm it now reads 'parcel collected' and the pouch total rose by the attachment."
- `docs/accounts-worlds-and-social.md:193-194`: "Verified against the root test/build suite only — not yet clicked in a real browser; see `next-session.md`."

Hosted `https://` / `wss://` — the actual gate:

- `docs/hosting.md:213-234`, "The hosted smoke test", verbatim: "Do all of this against the **real** deployment, in two different browsers (or one plus a private window — two tabs of the same browser share a passport and will look like one person)." Then: `/health` returns ok · `/play` redirects to `/enter` from a cold browser · a valid code gets you in, a wrong code says so · **"Two browsers with the `same` code see each other move and chat"** · **"Two browsers with `different` codes cannot see each other at all"** · place something, restart the Railway service, it is still there · block from the ⋯ menu, reload, still blocked · report a message, `GET /review/reports` shows it with the exact text · remove (and optionally ban) from the owner browser.
- `docs/hosting.md:236-257`, "The account-era additions (2026-09-18)" — invite link → Clerk sign-up → desk shows the early-alpha line and both doors → enter Shared World → early-alpha card once → Return to desk from both Settings and the Activity drawer (avatar disappears for the other player) → save backup/restore → chat fold with unread count → Wood Mill by mail → desk avatar studio → studio autosave across a closed tab → second browser wears the first browser's look → reload lands back in the same world → **"Redeploy the Railway server while someone is in a world."**
- `docs/alpha-testing.md:158-162`: "A real Firefox pass proved a normal screenshot report, a screenshot report queued while the server was stopped and delivered by Retry, review updates, redacted export, and report/screenshot recovery after a server restart. The hosted `https://`/`wss://` proof remains part of MP.3's deployment gate, not unfinished MP.2 implementation."
- `docs/roadmap.md:490-491` (end of MP.3): "Still owed before inviting anybody: the hosted `https://`/`wss://` smoke in `hosting.md`, run against the real deployment."
- `docs/roadmap.md:535-537`: "What is left is only what cannot be done from a sandbox: the hosted smoke, the by-hand browser proofs listed in `next-session.md`, and sending the first invitations."
- `docs/alpha-invite-and-consent.md:3`: "Nothing here goes out before the hosted `https/wss` smoke passes (A1)."
- `docs/touch-and-tablet.md:62-64`: "the sandbox and the built-in browser can emulate a tablet's size and touch points, but not real multi-touch, so pad and pinch need a real iPad in hand."
- `docs/multiplayer-readiness.md:137-138` (step 10): "Deploy the server to a Node host; point the client at `wss://`, then run the roadmap's Alpha gate 1 with 3–5 testers."

---

## 4. Known silent-failure traps, the guard that exists, and whether it is tested

| Trap | Guard today | Tested? |
| --- | --- | --- |
| **Colyseus `maxPayload` defaults to 4 KB** — wearing a design closed the socket, the reconnect re-sent it, and the visit ended (`docs/next-session.md:108-110`). | `maxPayload: 512 * 1024` (`server/src/index.ts:385`, rationale `:379-384`). | **No.** The only two realroom tests build their own transport with library defaults — `new Server({ transport: new WebSocketTransport() })` at `server/src/rooms/guests.room.test.ts:111` and `server/src/rooms/cases.room.test.ts:108`. Nothing asserts the production value; a regression is invisible until a live tester wears a detailed look. |
| **`DESIGN_LIMITS.maxBytes` (98 304 = 96 KiB)** — oversized designs were rejected *on read*, silently, and the next write erased the look (`docs/next-session.md:111-119`). | `sanitizeAvatarDesign` returns null over the cap (`shared/src/protocol/avatarDesign.ts:387`); `saveDesign` stores the sanitized form; the studio refuses to say "saved" for a design that would not load back and warns past 70 % full. | **Partly.** `src/ui/avatarEditor/design.test.ts:75` ("caps stroke count and refuses oversized designs") and `server/src/avatarDesigns.test.ts` (save/bounds, corrupt-entry skipping) cover the store; the studio's "would it load back" gate is UI-only. |
| **A room process is disposed when it empties** — Colyseus disposes the process, not the saved world (`PaperRoom.ts:219-224`). | `onCreate` refuses a `join` unless durable state exists: `throw new Error('neighborhood-not-found')` (`:222-224`). The client then asks the server to reopen on Colyseus code 521 (`src/net/client.ts:232-245`); the site's door hands off with `intent=create` (`docs/roadmap.md:486-487`); fatal-vs-retry classification `src/net/rejoin.ts:44-58`. | **Yes** — `src/net/clientMatchmaking.test.ts` (521 reopen path; 525 is *not* disguised as an empty room; `create` never calls `join`), plus `server/src/persistence.test.ts` for `has()`. |
| **Railway App Sleeping / redeploy ends the seat** — the visit ended with no way back (`docs/next-session.md:147-152`). | Server holds the seat 60 s (`RECONNECT_GRACE_SECONDS`, `PaperRoom.ts:135`, applied `:406`); ping budget 40 s (`pingInterval 8000 × pingMaxRetries 5`, `server/src/index.ts:385`); client rejoins on 2 s→60 s backoff with fresh tokens, never after a deliberate leave or a removal (`src/net/rejoin.ts`, `src/net/sharedSession.ts:275-320`); close codes are explained (`src/net/closeReason.ts`). Operational guard: App Sleeping off (`docs/hosting.md:296-300`). | **Unit-tested** (`src/net/rejoin.test.ts`, `src/net/closeReason.test.ts`). **Never proved against a real redeploy** — that is the explicit item in `docs/hosting.md:255-257`. |
| **Volume not mounted / not writable** — the server booted fine, `/health` answered 200, and the failure surfaced on the first write. | `assertDataDirWritable()` at import time, `process.exit(1)` with the errno (`server/src/stores.ts:36-59`); `POST /account` persistence failure is a 500 with a real log line, not a 400 (`server/src/index.ts:106-150`). | **No test** (process-level). The guard is loud and deliberate. |
| **Protocol mismatch** — desync instead of a clean refusal. | `onAuth` throws `bad-protocol` (`PaperRoom.ts:178`); the client maps it to a fatal "papr.world was just updated. Reload the page" (`src/net/rejoin.ts:45-47`). `PROTOCOL_VERSION = 11` (`shared/src/protocol/constants.ts:13`). | **Indirectly** (room tests join with the current version). No test asserts a stale version is refused. Doc staleness: `docs/next-session.md:709` still says "`PROTOCOL_VERSION` is 9"; `docs/hosting.md:431` still says "8"; `docs/house-and-home.md` documents v10/v11. |
| **Chat in synced state** — synced state is identical for every client, so a block could never be honoured there. | Chat moved out of synced state: history-on-join + per-recipient delivery (`PaperRoom.ts:490-537`, `:1110-1114`), with the block check inline in the delivery loop (`:529-537`). | **Yes** — `server/src/blocks.test.ts` (8 cases incl. restart + write-through) and `guests.room.test.ts` ("asks a blocked guest to leave, and gives them the answer a closed door gives"). |
| **Two tabs share one passport** — the smoke silently becomes one person. | None in code; a documented procedure step (`docs/hosting.md:215-217`). | **No.** Pure operator trap. |
| **`VITE_*` are baked at build time** — a dashboard change does nothing until redeploy. | Client-side messages name the exact misconfiguration (`src/net/sharedConfig.ts`; `src/net/passport.ts`). | **No test** for production wiring; the hosted smoke covers it. |
| **Guest identity is `guest:<sessionId>`, new every connection** — cannot be removed, banned or blocked. | Guests are refused entirely whenever `PAPR_OWNER_ACCOUNT` is set (`PaperRoom.ts:203`); the real client always carries a passport. | **Yes** (`guests.room.test.ts`: "does not let a guest ask or be asked", "does not let a guest publish a home"). |
| **Caps reject with an opaque reason** — `not-allowed` does not say which cap. | Caps exist: 16 players, 500 pieces/room, 100 pieces/player, 6 cases/player, 200 friends, 50 pending, 500 blocks, 200 mailbox (`shared/src/protocol/constants.ts:27-131`). Rejections surface as a toast: "The neighborhood could not `place-piece`: `not-allowed`." (`src/net/sharedSession.ts:439-443`). | The caps are unit-tested (`friends.test.ts`, `cases.room.test.ts` "caps how many cases one account may stand"). The *message* is not player-friendly. |
| **Chat ring keeps only 50 lines** for a late joiner (`LIMITS.chatHistory = 50`, `constants.ts:76`; ring at `PaperRoom.ts:519-524`). | Deliberate; the backlog is block-filtered too (`historyFor`, `:1110-1114`). | Indirectly, by the room tests. |
| **Debounced room save (5 s)** could lose the last changes on an ungraceful kill (`server/src/persistence.ts:16`, `:70`). | `saveNow` on room dispose; the container runs `node` directly through tini so SIGTERM is not relayed through npm (`Dockerfile:59-75`, `docs/hosting.md:303`). | Yes for the store (`persistence.test.ts`); the dispose path is covered only by the restart step of the smoke. |

---

## 5. "Get to first multiplayer test today" checklist

### Owner-only (no code change) — in this order

1. **Do not deploy from this tree yet.** It is mid-edit and `tsc` fails (§2a-1). Either deploy `HEAD` unchanged, or wait for the two scratch files to be deleted and the touch test to go green.
2. **Railway:** confirm a **volume mounted at `/data`**; set `PP_CORS_ORIGIN=https://papr.world`, `PP_REVIEWER_TOKEN`, `PP_MODERATION_TOKEN` (different values). Leave `PAPR_OWNER_ACCOUNT` unset for the first two-tab test. Redeploy, then read the boot log: it must say `CORS: pinned to https://papr.world` and either `removal: DISABLED` (dogfood) or `removal: enabled` (alpha) (`server/src/index.ts:470-491`).
3. **Vercel:** `VITE_SHARED_WS_ENDPOINT=wss://paprworld-production.up.railway.app`, `VITE_FEEDBACK_HTTP_ENDPOINT=https://paprworld-production.up.railway.app`, `PAPR_ALPHA_CODES`, `PAPR_ALPHA_SECRET`. **Redeploy** (build-time).
4. **Turn App Sleeping off.**
5. **Run the hosted smoke, `docs/hosting.md:213-234`, in two different browsers** (not two tabs): `/health` ok · `/play` redirects to `/enter` from a cold browser · good code in, bad code out · **same code: see each other move and chat** · **different codes: cannot see each other** · place something, restart Railway, still there (proves the volume) · block from a message's ⋯, reload, still blocked · report a message, `GET /review/reports` shows the exact text · remove + ban from the owner browser, and confirm the ban survives a room reopen.
6. **Play the one-pager's 30–45 minute path once in a fresh profile** (`docs/alpha-invite-and-consent.md`, section 3).
7. **Mint your owner passport** in the browser you will actually play in, put the id in `PAPR_OWNER_ACCOUNT`, redeploy, confirm the log flips to `removal: enabled … guests refused` (`docs/hosting.md:161-196`).
8. Only then: send **Stage 1 — 1–2 plumbing testers** (`docs/alpha-invite-and-consent.md:66-74`), with `docs/hosting.md:213-234` as their checklist and both queues being triaged weekly.

### Code (smallest ordered set, each independently testable)

1. `rm src/game/__tmp_dep.ts src/game/__tmp_mock_probe.test.ts` → root `tsc` green. *(Minutes; blocks everything else.)*
2. Fix the two assertions in `src/game/touchControls.test.ts` (dead-zone edge, `-0`/`+0`) → root suite green.
3. **Block + report from the player card and the address plate** — funnels into the existing `sendBlock`/`sendReport`, no server change. This closes the only safety gap that matters live: reaching a person without them having spoken.
4. **Wire the plate click** to `openPlayerCardFor` (`pickSharedHomePlateAtScreen` is written and unused).
5. **Wire `nextLot`** into Home placement so a second account's home does not land on the first's (ask 2's remaining gap; needed the moment two accounts share a neighbourhood).
6. Friend-request note (store + handler + one input) and the disclosure sentence — the wire type and sanitizer already exist.
7. Profile read path: `SetProfile` handler → store → `PlayerCardInfo.bio/links/relationship` via `profileForViewer` → card render. Then the desk editor.

Items 1–3 must precede any real two-client session; 4–7 are what make the session worth having.
