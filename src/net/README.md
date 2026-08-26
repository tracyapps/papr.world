# src/net — opt-in shared neighborhood client

This folder is real, typechecked code and the first MP.3 invite-room slice is
wired. Ordinary URLs remain solo and open no socket. The in-game Friends panel
generates a code or joins a friend's existing code; `?server=wss://…` overrides
`VITE_SHARED_WS_ENDPOINT`, which itself falls back to the local server. Bare
`?shared=1` remains a legacy development shortcut to code `PAPR-22`, preserving
its old persisted room.

## What's here

- `client.ts` — the only place the client talks to the server. Sends *intents*,
  receives authoritative state, forwards changes to renderer callbacks.
- `remotePlayers.ts` — renderer-free interpolation buffer so other players move
  smoothly between the server's ~20 Hz snapshots instead of teleporting.
- `sharedSession.ts` — opt-in coordinator for passports, presence, chat, and
  finished build publication, plus observable connection/recovery states.
- `remoteAvatarVisuals.ts` / `sharedPieceVisuals.ts` — Three.js call sites for
  server-owned entities.
- `sharedConfig.ts` — tested URL gate and `AvatarDesign` → `AvatarRef` adapter.

## Prerequisite

The client needs the Colyseus browser SDK (added to the root `package.json`):

```bash
npm install
```

## Run the two-client slice

```bash
# terminal 1
cd server && npm run dev

# terminal 2
npm run dev
```

Open `http://localhost:5173`, choose **Play with friends**, enter a name, and
open a neighborhood. Copy its invitation link into an independent browser and
join there. Chat is accessible DOM; peers use named, edge-colored fallback
cutouts until full drawing sync lands. Completed local assemblies publish to
that code's authoritative persisted room and return after server restart. A
join-intent URL never creates a missing neighborhood; it shows Retry and Return
to solo instead.

## Design rules this layer keeps

- Send intents, never assertions — the server owns the truth.
- No Three.js in here; the renderer owns meshes and reads plain data back.
- Remote players are always rendered slightly in the past, and interpolated.
- The local build command still owns material spending; the server owns the
  shared piece id, maker credit, caps, and persistence. Moving the entire build
  transaction server-side belongs to the later shared-simulation hardening.
