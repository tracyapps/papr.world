# Papr.world

Working title for a cozy communal paper-world sandbox game.

Players enter a 3D world made entirely from paper: lined paper, construction paper, wrapping paper, tracing paper, cardboard, tape, pencil marks, crumples, folds, shadows, and cut edges. They draw themselves into the world, then draw and craft tools, gather paper materials, build homes, decorate shared neighborhoods, chat, wander, and make strange little things together.

The early goal is not a giant MMO. The early goal is to prove that a small shared paper neighborhood feels magical.

## Current Direction

- Runtime: TypeScript, Vite, Three.js
- Physics: Rapier JS
- Multiplayer: Colyseus authoritative server
- UI: DOM overlay for menus, chat, inventory, drawing tools, and settings
- Assets: GLB/glTF for authored 3D paper props; PNG/SVG/canvas textures for drawings and paper surfaces
- Distribution path: web first, LAN-hostable, then package for Steam with Tauri or Electron

## First Prototype

The first vertical slice should prove six things:

1. A player can draw a paper character and walk around as it.
2. The world looks handmade, tactile, and clearly made of paper.
3. A player can gather one paper material.
4. A player can place simple paper building pieces.
5. Two browser tabs can join the same room, chat, and see each other build.
6. The same server can run locally for solo play, LAN play, or hosted play.

## Docs

- [Game Design Plan](docs/game-design-plan.md)
- [Technical Plan](docs/technical-plan.md)
- [Multiplayer Readiness](docs/multiplayer-readiness.md)
- [Paper Artwork Guide](docs/paper-artwork-guide.md)
- [Sample Assets](docs/sample-assets.md)
- [UI and Control Placeholders](docs/ui-control-placeholders.md)
- [Visual Bug Log](docs/visual-bug-log.md)
- [Prototype Progress](docs/prototype-progress.md)
- [Critter Design](docs/critter-design.md)
- [Ideas Log](docs/ideas-log.md)

## Immediate Next Steps

Done as of 2026-07-16: modular source split, page-based world (clearing is page `0,0`), page streaming with authored + seeded neighbor pages, parallax/haze backdrop, and a movement feel pass. Details in [Prototype Progress](docs/prototype-progress.md).

1. Visual tuning pass in a real browser (backdrop spacing, fog distances, bob/lean amounts).
2. Design the first real scrapbook page for materials and discoveries.
3. Simple building placement (local UX + `PlacedPiece` data shape).
4. Critter wander upgrades so critters can live on generated pages too.

The multiplayer foundation is now scaffolded (not yet wired into the client):

- `shared/` — renderer-free protocol types + rules shared by client and server.
- `server/` — authoritative Colyseus room (`PaperRoom`).
- `src/net/` — client networking layer + remote-player interpolation (unwired;
  `main.ts` is untouched, so solo play still runs). Wiring guide in
  `src/net/README.md`.

See [Multiplayer Readiness](docs/multiplayer-readiness.md) for the full sequence
and what's load-bearing vs. safe to iterate on in parallel.
