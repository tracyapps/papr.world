# Multiplayer Readiness

The plan for getting from the current single-player prototype to "two browsers
share a paper neighborhood." It separates the **load-bearing plumbing** (hard to
retrofit, do it early) from **mechanics and assets** (safe to keep iterating on
in parallel).

Guiding idea: don't finish the whole game and then bolt on networking. Get a
minimal authoritative loop live — position, chat, placed pieces — then grow
features on top of a network that already exists.

> **See also:** `communal-multiplayer.md` (2026-08-10) — the communal/social
> layer on top of this plumbing: what made Glitch/Second Life work, locked
> decisions (real accounts phased, invite-only first, cozy→commons), the
> conflict list, and the phased plan. Its **Phase A landed**: paper passports
> (durable `accountId`, minted at `POST /account`, scrypt-hashed secrets),
> JSON room persistence (pieces + nodes survive restarts), `makerId` on
> placed pieces, per-player piece caps, and `src/net/passport.ts` on the
> client. `PROTOCOL_VERSION` is now **3**; v3 adds validated invite-code
> matchmaking to the join contract.

## Can it live on any web server?

Two halves, two answers:

- **The client** (`vite build` → static files in `dist/`) runs on *any* static
  host — Netlify, GitHub Pages, itch.io, plain nginx/Apache. Solo play needs
  nothing more.
- **The server** (`server/`) is a long-running Node.js process holding
  WebSocket connections. It **cannot** run on static hosting. It needs a host
  that keeps a process alive and allows WebSockets: Fly.io, Railway, Render, or
  a VPS. Once networked, serve the client over HTTPS and the socket over `wss://`
  or browsers will block the connection.

## What's already scaffolded (done)

- **`shared/`** — renderer-free, Colyseus-free protocol package: serializable
  state shapes, client/server message contracts, limits, and the validation
  rules both sides share (name/chat sanitizing, anti-teleport movement clamp).
  This is the single source of truth. *Typechecks clean.*
- **`server/`** — authoritative Colyseus room (`PaperRoom`) with join/leave,
  movement validation, chat relay + history, build-piece placement, a stub
  resource-gather, and a schema mirroring the shared types. *Typechecks against
  real Colyseus and passes an end-to-end smoke test: two clients join, move
  (with teleport clamped), chat broadcasts, a piece is placed, a node
  decrements.*
- **`src/net/`** — ✅ opt-in shared coordinator over `@colyseus/sdk` 0.17, a tested
  URL/config gate, renderer-free interpolation, remote paper-cutout and shared
  piece call sites, plus passport identity. Solo stays the default and opens no
  socket. Wiring/run guide in `src/net/README.md`.

## Load-bearing work still remaining

These are the things that are painful to add later, in rough order:

1. **Avatar-as-data adapter.** ✅ The drawn `AvatarDesign` is durable and
   validated, and the MP.1 adapter emits `AvatarRef` (preset + design id + edge
   color). Remote
   rendering may use the template/edge fallback until designs go over the wire
   in avatar Phase D; actual drawing sync is not a blocker for two-tab dogfood.
2. **A clean simulation seam for the local player.** ✅ The frame sends
   throttled movement intents and samples remote interpolation while local
   prediction remains responsive and the server clamps impossible movement.
3. **Renderer hooks for remote entities.** ✅ Named fallback cutouts
   spawn/despawn at terrain or bridge height; network build pieces reuse the
   existing piece builder and suppress the local device's duplicate echo.
4. **Server-side persistence.** ✅ *Done 2026-08-10* — rooms save
   pieces + nodes to `server/data/room-*.json` (atomic, debounced; chat and
   positions deliberately transient). Accounts persist alongside. SQLite is a
   later swap behind the same `RoomStore` seam.
5. **Identity + rooms UI.** 🚧 Display name entry, invite-code create/join,
   visible connection/recovery states, and solo return are built. Host controls
   remain (solo local, LAN address, hosted).

## Mechanics to settle first — but only their data shapes

Nail down the *data model* of these before wiring the socket, so you don't
design them twice under network constraints. Polish can come after.

- **Building placement** (local UX + `PlacedPiece` shape). ✅ Built locally.
- **One gatherable material** (`ResourceNode` + the inventory grant on gather).
  ✅ Local gatherables exist; the server stub already proves the intent shape.
- **Avatar drawing → `AvatarRef`** (see load-bearing #1). ✅ Durable design,
  preset, and the fallback join adapter now exist.
- **Author identity on anything a player makes.** Added 2026-08-06 from
  `land-and-dwellings.md`: a planted garden must know who planted it, because
  harvesting it mails the same yield to them. Retrofitting a maker id onto
  already-placed entities is exactly the kind of migration this list exists to
  avoid. It also pays for maker-crediting, which `game-design-plan.md` wants
  anyway.
  ✅ Protocol, server, completed solo pieces, and in-progress solo builds now
  use `makerId`; legacy `ownerId` solo saves migrate on read (2026-08-25).
- **House spacing as a placement validation rule.** Also from
  `land-and-dwellings.md`: houses may not be placed too close to other houses,
  shops, landmarks, or water. It belongs in `shared/` with the other rules both
  sides enforce — client for a responsive refusal, server as the authority —
  which means it wants to exist before placement goes over the wire.

You do **not** need the full scrapbook, critters, gifting, or helping rewards
before multiplayer. Those layer on afterward through the same intent/validate
seams.

## Safe to iterate on independently (non load-bearing)

Nothing below blocks or is blocked by the networking work:

- Paper art, materials, GLB props, backdrop/fog/sky tuning.
- Page authoring and seeded generation (already deterministic per page id, so
  clients agree without syncing page contents — good multiplayer property).
- Critter behavior and wander upgrades.
- HUD/minimap/compass/scrapbook UI mockups.
- Movement feel (speed, bob, lean).

## Suggested sequence

1. ✅ Local building placement (UX + data). *(mechanic)*
2. ✅ Durable avatar drawing + preset data; add the `AvatarRef` join adapter as
   part of step 5. *(load-bearing seam mostly done)*
3. ✅ One gatherable material end-to-end locally. *(mechanic)*
4. ✅ Align solo build ownership with protocol-v2 `makerId` and keep an
   `ownerId` save migration. *(identity)*
5. ✅ Wire `src/net/` into an explicit shared/development mode in `main.ts`: send
   move, render remote
   players, render placed pieces. *(load-bearing)*
6. ✅ Prove the slice: two tabs → same room → accessible DOM chat → see each
   other build; restart the server and verify the piece remains.
7. ✅ Build the in-game product feedback/outbox/receipt path in
   `alpha-testing.md`: explicit screenshot capture/upload, offline
   outbox/Retry, receipts, atomic server queue, private reviewer triage, and
   redacted export are browser-proved.
8. ✅ Upgrade client/server/schema/transport to Colyseus 0.17, rerun the full
   two-client/restart slice, and confirm both npm audits are clean.
9. 🚧 Invite-code room UI, connection/rejection hints, and a clean return to
   solo play are built and locally browser-proved. Add host controls and
   personal mute/block before Alpha gate 1.
10. Deploy the server to a Node host; point the client at `wss://`, then run
   the roadmap's Alpha gate 1 with 3–5 testers. The recommended accounts and
   environment settings are recorded in `hosting.md`.

The full game, map, underground, and every biome are explicitly **not** alpha
prerequisites. A coherent loop and safe, reviewable feedback are.

## Running it locally

```bash
# once, from repo root — installs @colyseus/sdk for the client
npm install

# terminal 1 — the authoritative server (from repo root)
cd server && npm install && npm run dev   # ws://localhost:2567

# terminal 2 — the client
npm run dev
```

Typecheck the pieces independently: `npm run typecheck` inside `shared/` or
`server/`.
