# src/net — client networking (not yet wired in)

This folder is real, typechecked code, but **nothing imports it yet**, so solo
play in `main.ts` is completely unaffected. Flip multiplayer on when the
load-bearing mechanics (avatar-as-data, building placement, one gatherable) are
ready.

## What's here

- `client.ts` — the only place the client talks to the server. Sends *intents*,
  receives authoritative state, forwards changes to renderer callbacks.
- `remotePlayers.ts` — renderer-free interpolation buffer so other players move
  smoothly between the server's ~20 Hz snapshots instead of teleporting.

## Prerequisite

The client needs the Colyseus browser SDK (added to the root `package.json`):

```bash
npm install
```

## Wiring it into main.ts (roughly 15 lines, when ready)

```ts
import { connect } from './net/client';

const net = await connect(
  { endpoint: 'ws://localhost:2567', name: myName, avatar: myAvatarRef },
  {
    onPlayerJoin: (p) => spawnRemoteAvatar(p),      // renderer creates a mesh
    onPlayerLeave: (id) => removeRemoteAvatar(id),
    onPieceAdd: (piece) => addBuildPiece(piece),
    onChat: (line) => appendChatLine(line),
    onRejected: (info) => flashHint(info.reason),
  },
);

// In the frame loop, after updateAvatar():
net.sendMove({ x: avatar.position.x, z: avatar.position.z, facing: getYaw(), page: currentPage });

// Also in the frame loop, move each remote cutout to its interpolated point:
for (const id of net.remoteIds()) {
  const s = net.sampleRemote(id);
  if (s) positionRemoteAvatar(id, s.x, s.z, s.facing); // height sampled locally
}
```

The endpoint is `ws://localhost:2567` for solo/LAN and `wss://<your-host>` once
the server is deployed. Start the server with `npm run dev` inside `../server`.

## Design rules this layer keeps

- Send intents, never assertions — the server owns the truth.
- No Three.js in here; the renderer owns meshes and reads plain data back.
- Remote players are always rendered slightly in the past, and interpolated.
