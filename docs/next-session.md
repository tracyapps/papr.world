# Next Session

Updated 2026-08-25 after the first MP.3 invite-room slice. Start here.

## What landed today

- **MP.3 invite rooms are underway.** The always-reachable Friends panel now
  creates validated short-code neighborhoods, joins existing codes, copies a
  join link, exposes preparing/connecting/online/offline/setup-error states,
  retries failure, and returns to a clean solo URL that retains only an
  optional inert hosted-server override. The server filters
  matchmaking and persistence by code; legacy shared development remains
  `PAPR-22`. Same-code join, cross-code isolation, missing-code recovery, and
  solo return are locally browser-proved. Protocol is v3.

- **Colyseus 0.17 migration.** The browser uses `@colyseus/sdk`; the server is
  on core/schema/transport 0.17/4.x with Express-hosted matchmaking, reflected
  credentialed CORS, graceful shutdown, and root-proxy schema callbacks.
- **MP.2 feedback is complete locally.** Settings and the Scrapbook open one
  accessible Bug / Improvement / New idea / Other sheet. Safe context is
  inspectable, passport identity is removable, explicit fresh-world
  screenshots can be previewed/removed and upload under a 350 KB cap, failed
  sends remain in a bounded local outbox, and Retry produces a durable receipt.
  The private `?review=1` desk uses `PP_REVIEWER_TOKEN` to filter, read protected
  screenshots, change status, append audit notes, and export redacted JSON.
- **Hosting notes are recorded.** `hosting.md` recommends Vercel for the static
  client and Railway plus a persistent volume for the first alpha server.

- **MP.1 — the opt-in shared neighborhood slice.** `?shared=1` joins the local
  authoritative room while ordinary URLs stay completely solo. Paper passport
  identity, the worn-design `AvatarRef` adapter, named edge-colored remote
  cutouts, interpolated movement, shared piece rendering, completed-build
  publication, and accessible DOM chat with late-join history are all wired.
- **Alpha Gate 0 is reached.** Two independent browser sessions moved, chatted,
  received a server-stamped bench, and recovered it after a full server restart.
  A third fresh session received the bounded chat history.
- **Critter Knowledge 2.2 — threaded follow-ups.** “Tell me about this place”
  answers once, then opens Gathering / Growing / Nearby / Local character.
  Repeated questions rotate facts, exact facts are remembered without closing
  a topic, and Back restores everyday chat. Authored conversations can use the
  same recursive `followUps` shape.
- **Critter Knowledge 2.3 — nearby elsewhere.** Wayfinding now includes named
  shops/landmarks within a short walk and distinct biomes on the four adjacent
  pages. It stays local rather than becoming a global index.
- **Maker identity seam is clean.** Completed pieces and in-progress build
  sites use protocol-v2 `makerId` in solo, shared, and server shapes. Legacy
  solo `ownerId` saves migrate on read.
- **Multiplayer is a parallel lane now.** It starts after 2.2 rather than after
  biome/map completion. `roadmap.md` defines MP.1–MP.3 and Alpha gate 1;
  `alpha-testing.md` defines the in-game Bug / Improvement / New idea intake,
  safe context, offline outbox, receipt, and reviewer queue.

## Verification

- Root client: **392 tests pass**; production build succeeds (164 modules).
- `shared/` and `server/`: standalone typechecks pass.
- Root and server `npm audit`: **0 advisories**.
- Independent Playwright Firefox sessions on 0.17 saw one another, propagated
  held movement, exchanged live chat, delivered chat history to a late joiner,
  shared a piece, and recovered the piece after a full server restart. A plain
  URL remained socket-free.
- Feedback browser proof: a normal screenshot send produced a receipt and a
  real 52 KB world image; a second screenshot note made while the server was
  stopped remained queued and delivered by Retry. The reviewer changed status,
  appended a private note, filtered the queue, viewed the protected image, and
  produced an export without passport ids or audit notes. Both report and image
  survived a full server restart. The review page had zero fresh console
  errors; the expected offline fetch errors occurred only during the deliberate
  server-down test.
- MP.3 browser proof used four independent Firefox profiles: Fern and Moss
  joined `ZRET-83` and saw one another; Sage's `FERN-24` chat did not leak into
  that room; joining absent `LEAF-29` exposed recovery actions; and Return to
  solo removed all shared parameters. Closing the rooms wrote distinct
  `room-invite-ZRET-83.json` and `room-invite-FERN-24.json` stores.

## Do this next

1. **Finish MP.3 and Alpha gate 1.** Add host identity/removal and personal
   mute/block, then deploy and invite 3–5 known testers around one 30–45 minute
   loop. Follow `hosting.md`; biome breadth is explicitly not the gate.
2. **Keep safety reports separate.** Product feedback is done; contextual
   player/message/design reporting belongs to the MP.3 moderation controls and
   must not be folded into the general feedback queue.

If staying in the single-player/content lane instead, the next dependency item
is **Phase 2.4 — the diary**. Give entries stable ids and player-authored fields
from day one; annotation/highlighting UI remains parked.

## Watch out for

- The worktree includes the owner's newly added water/rock assets and the
  accumulated water, plans, Pip, and UI changes. Preserve all of it; do not
  reset or treat untracked assets as disposable.
- `PROTOCOL_VERSION` is 3. Bump it on any wire-shape change.
- Shared mode is explicitly gated by `?shared=1`; preserve the plain-URL
  no-socket behavior. Explicit invite URLs use `invite=ABCD-23` and
  `intent=create|join`; bare `?shared=1` deliberately maps to legacy local code
  `PAPR-22`. Local dogfood defaults to `ws://localhost:2567` and may take an
  explicit `server=wss://…` query value later.
- `makerId` is always a durable account id (or the solo sentinel), never a
  Colyseus session id.
- Remote drawings are not an MP.1 blocker. Synchronizing and resolving actual
  designs remains avatar Phase D and adds UGC report/hide obligations.
- MP.1 publishes the finished local assembly after local material spending;
  the room owns shared ids, maker credit, caps, and persistence. Moving the
  entire build transaction server-side remains a later shared-simulation
  hardening step—do not mistake this dogfood seam for the final transaction.
- General tester feedback never silently includes passport secrets, full saves,
  chat, or drawings. See `alpha-testing.md`.
