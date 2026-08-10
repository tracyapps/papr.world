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
> client. `PROTOCOL_VERSION` is now **2**.

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
- **`src/net/`** — client networking layer over `colyseus.js` plus a
  renderer-free remote-player interpolation buffer. Real and typechecked, but
  **not imported by `main.ts`**, so solo play is untouched. Wiring guide in
  `src/net/README.md`.

## Load-bearing work still remaining

These are the things that are painful to add later, in rough order:

1. **Avatar-as-data.** "See each other" needs the drawn character saved as a
   durable `AvatarRef` (preset + drawing key + edge color) — the shape is
   already defined in `shared/`. Until the draw screen produces this, remote
   players have nothing meaningful to show. **Biggest real prerequisite.**
2. **A clean simulation seam for the local player.** `game/avatar.ts` currently
   computes movement client-side. That's fine — but the frame loop needs to
   (a) send `net.sendMove(...)` each tick and (b) position remote cutouts from
   `net.sampleRemote(...)`. See the wiring guide. No rewrite required for the
   first slice; local prediction stays, the server just validates.
3. **Renderer hooks for remote entities.** Functions to spawn/despawn a remote
   avatar mesh and to add/remove a placed build piece from network callbacks.
   These reuse existing builders; they're new call sites, not new systems.
4. **Server-side persistence.** ✅ *Done 2026-08-10* — rooms save
   pieces + nodes to `server/data/room-*.json` (atomic, debounced; chat and
   positions deliberately transient). Accounts persist alongside. SQLite is a
   later swap behind the same `RoomStore` seam.
5. **Identity + rooms UI.** Display name entry, and a minimal room browser /
   host controls (solo local, LAN address, hosted).

## Mechanics to settle first — but only their data shapes

Nail down the *data model* of these before wiring the socket, so you don't
design them twice under network constraints. Polish can come after.

- **Building placement** (local UX + `PlacedPiece` shape). Already your next
  task — the right call.
- **One gatherable material** (`ResourceNode` + the inventory grant on gather).
- **Avatar drawing → `AvatarRef`** (see load-bearing #1).
- **Author identity on anything a player makes.** Added 2026-08-06 from
  `land-and-dwellings.md`: a planted garden must know who planted it, because
  harvesting it mails the same yield to them. Retrofitting a maker id onto
  already-placed entities is exactly the kind of migration this list exists to
  avoid. It also pays for maker-crediting, which `game-design-plan.md` wants
  anyway.
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

1. Local building placement (UX + data). *(mechanic)*
2. Avatar drawing produces a saved `AvatarRef`. *(load-bearing)*
3. One gatherable material end-to-end locally. *(mechanic)*
4. `npm install`, then wire `src/net/` into `main.ts`: send move, render remote
   players, render placed pieces. *(load-bearing)*
5. Prove the slice: two tabs → same room → chat → see each other build.
6. Add chat UI + rejection hints, then server-side persistence.
7. Room browser / LAN host controls.
8. Deploy the server to a Node host; point the client at `wss://`.

## Running it locally

```bash
# once, from repo root — installs colyseus.js for the client
npm install

# terminal 1 — the authoritative server (from repo root)
cd server && npm install && npm run dev   # ws://localhost:2567

# terminal 2 — the client
npm run dev
```

Typecheck the pieces independently: `npm run typecheck` inside `shared/` or
`server/`.
