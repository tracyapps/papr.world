# Technical Plan

## Recommended Stack

- Language: TypeScript
- Client tooling: Vite
- Renderer: Three.js
- Physics: Rapier JS
- Multiplayer: Colyseus
- Server runtime: Node.js
- UI layer: DOM/CSS overlay
- Runtime 3D asset format: GLB/glTF 2.0
- Desktop packaging later: Tauri first, Electron as fallback

## Why This Stack

The game needs a 3D world, but most objects are flat, folded, layered, or lightly dimensional paper pieces. Three.js gives direct control over that look without forcing a full editor-first engine workflow.

Colyseus is a good early multiplayer fit because it supports an authoritative server, room-based state synchronization, and local or hosted deployment. This maps well to neighborhoods, LAN rooms, and future hosted worlds.

Rapier is enough for the needed paper physics: simple collisions, movement, triggers, lightweight rigid bodies, and playful interactions. The world does not need exact real-paper simulation in the first version.

## Architecture Principles

### Separate Simulation From Rendering

Simulation owns:

- Player position and action state
- World entities
- Scrapbook inventory
- Discovered templates
- Build pieces
- Gathering rules
- Chat messages
- Shared items and gifts
- Helping rewards
- Critter friendship state
- Saveable state
- Permissions

Rendering owns:

- Three.js scene objects
- Materials
- Camera
- Lighting
- Animation playback
- Visual effects
- Interpolation between network updates

This separation keeps the game portable. A future Steam wrapper can reuse the same client, and a future console port could reuse the world model and server protocol even if the renderer changes.

### Treat User Art as Data

Player drawings should be saved as durable data, not as renderer-only objects.

Possible drawing data:

- Raster image for immediate avatar texture
- Vector strokes for future editing
- Metadata: brush colors, paper material, outline style
- Gameplay body preset: small, medium, wide, tall, wheeled, hovering

The visible drawing can be expressive while the hidden collision body remains stable.

### Keep the Server Authoritative

The client can request actions, but the server should decide what actually changes.

Server owns:

- Player join/leave
- Position validation
- Chat delivery
- Resource gathering
- Inventory changes
- Scrapbook entries
- Template discovery and sharing
- Build placement
- Helping reward grants
- Critter friendship updates
- Room persistence
- Permissions

Client owns:

- Input
- Local prediction where useful
- Rendering
- UI feedback
- Drawing interactions before save

## Project Structure

Suggested folder shape once implementation starts:

```text
apps/
  client/
    src/
      game/
        input/
        renderer/
        simulation/
        assets/
        ui/
        world/
        scrapbook/
      main.ts
  server/
    src/
      rooms/
      schema/
      persistence/
      permissions/
packages/
  shared/
    src/
      protocol/
      world/
      entities/
      scrapbook/
      templates/
      critters/
assets/
  source/
    blender/
    textures/
    drawings/
  runtime/
    glb/
    textures/
docs/
```

The shared package should contain serializable types and rules that both client and server can use.

## Networking Model

Start room-based.

Room types:

- Solo local room
- LAN room
- Private hosted room
- Public hosted room

First synchronized state:

- Player id, display name, avatar reference
- Player position and facing
- Chat messages
- Placed build pieces
- Resource node state
- Shared/gifted item events
- Critter presence and simple behavior state

Avoid synchronizing:

- Three.js objects
- Physics engine internals
- Raw input events unless needed
- Large drawing payloads every frame

## World Persistence

Early persistence can be simple JSON files or SQLite. The shape should still look like future database records.

Save:

- Room metadata
- Terrain seed
- Placed pieces
- Ownership data
- Resource node changes
- Player drawings
- Scrapbook entries
- Discovered templates
- Shared gifts
- Helper reward history
- Critter friendship state
- Quantized terrain edits: dug depth, planting state, geology seed, and change time

Do not save:

- Renderer object ids
- Temporary animation state
- Camera state unless intentionally user-specific

## Page-Based World Model

The next prototype architecture step is to convert the current single clearing into a page-based world. A page is the authored/gameplay unit for local exploration. It should be serializable and renderer-independent.

Suggested page coordinates:

- Page id: stable string such as `0,0`, `1,0`, `river-03`, or a generated id.
- Page coordinate: integer `{ pageX, pageY }`.
- Page size: one square gameplay unit in world-page space. The renderer can decide the Three.js dimensions.

Suggested page data:

- Biome or paper theme: forest, clearing, dunes, plains, river, town, cave, etc.
- Terrain pieces: sheets, hills, ribbons, dunes, holes, ramps.
- Paths: notebook strips, taped bridges, stepping scraps.
- Props: trees, rocks, windows, signs, critters, decorations.
- Resources: material nodes and respawn/rules metadata.
- Discoveries: templates, notes, scrapbook entries, hidden interactions.
- Build permissions: owned, shared, public, blocked.
- Backdrop hints: far mountain set, hill silhouettes, haze color, parallax strength.
- Seed: for deterministic scatter inside authored rules.

Runtime page system:

- Keep the current page and immediate neighbors active.
- Hide, unload, or pool distant page objects.
- Keep player/world simulation data independent from Three.js meshes.
- Let authored page data and seeded generation produce the same runtime entity format.
- Treat page transitions as ordinary movement, not portal loads, whenever possible.
- Layer persistent player terrain edits over immutable authored/generated page data.
- Render and simulate one final height function so holes, hills, feet, props, and camera safety agree.

### Terrain Editing and Spatial Footprints

Free digging should target an invisible, quantized cell beneath the pointer. A
cell's geology is deterministic from page seed and local coordinate; its current
depth and planting state are persistent world changes.

The existing minimap-feature bounds are presentation hints, not collision data.
Add a renderer-independent world-footprint registry shared by digging and build
placement. Trees, structures, machines, landmarks, water, and placed objects
register accurate circular or rotated-rectangular footprints with explicit
`blocksDigging` and `blocksBuilding` flags.

Dig validation order:

1. Target is exposed terrain and within tool reach.
2. Cell is inside a buildable/diggable page region.
3. Dig radius does not intersect a blocking footprint.
4. Cell spacing/merge rule permits the depression.
5. Equipped tool reaches the requested depth.
6. Server or local simulation commits the edit and deterministic yield.

In multiplayer the server owns footprint validation, terrain changes, and yield.
Clients may preview a valid/blocked paper outline before sending the action.

Building validation should sample the final terrain beneath the entire proposed
footprint and compare height variance against the plan's `slopeTolerance`.
Foundation, stilt, stair, bridge, and terrace pieces can declare higher tolerance
or custom support rules. The same preview can offer valid remedies—move, add
supports, or grade—rather than returning only a generic placement failure.

Cut and fill should operate on the same quantized terrain cells. Digging grants a
serializable regional fill resource; raising a cell consumes compatible fill.
Larger grading tools can select connected cells, but the server still commits
each resulting edit against footprints, permissions, and page limits.

The current renderer uses a flat ground sheet plus separate hill meshes. True
negative terrain requires a subdivided page surface—or equivalent clipped
topology—whose vertices can be updated around changed cells. Terrain edits
should be spatially indexed per page so height sampling and mesh updates touch
only nearby cells.

Early authored/generative mix:

- Author the main path, landmarks, rivers, and major terrain beats.
- Seed smaller details: tree cluster variation, scraps, small hills, flowers, tape bits, paper wrinkles.
- Store generated results deterministically from page id plus seed so multiplayer clients agree.

## Paper Material System

Materials should be reusable and parameterized.

Material properties:

- Paper type
- Base color or texture
- Fiber texture
- Crumple normal map
- Edge color
- Roughness
- Translucency
- Fold crease intensity
- Printed pattern
- Dirt/wear amount

Examples:

- `paper.lined.blue`
- `paper.construction.brown`
- `paper.tracing.frosted`
- `paper.wrapping.red-stars`
- `paper.cardboard.light`

## Scrapbook Data Model

The scrapbook is the inventory, discovery log, and relationship record. It should be serializable and renderer-independent.

Early scrapbook entry types:

- Material stack
- Tool template
- Item template
- Build piece template
- Decoration
- Gift from another player
- Critter note
- Helping reward
- Snapshot or memory

Suggested entry fields:

- Stable id
- Entry type
- Display name
- Asset or template key
- Quantity when relevant
- Creator player id when relevant
- Source: found, crafted, gifted, rewarded, critter, event
- Created or discovered timestamp
- Optional note or sticker metadata
- Material category id for grouped totals and browsing
- Stable icon key, independent of the artwork file path

Sharing should copy or grant scrapbook entries through server-approved actions. The server should preserve creator credit where useful.

## Asset Runtime Rules

- Ship 3D authored assets as GLB where possible.
- Keep source files separate from runtime files.
- Use stable manifest keys instead of file paths as public API.
- Use simple collision proxies for build pieces and props.
- Normalize pivots and scale before export.
- Use repeated materials to reduce memory and draw calls.

## Controls

Initial action map:

- Move
- Look or turn
- Interact
- Use tool
- Place
- Rotate piece
- Open inventory
- Open chat
- Cancel
- Pause/settings

Support keyboard/mouse first, but keep gamepad support active early because Steam and possible console paths benefit from it.

Input sources:

- Keyboard
- Mouse
- Gamepad left stick
- Gamepad right stick
- Gamepad D-pad
- Gamepad face buttons
- Gamepad shoulders/triggers

Settings should eventually include:

- Keyboard remapping
- Gamepad remapping
- Camera sensitivity
- Invert camera X/Y
- Movement mode: camera-relative or character-relative
- Hold/toggle options for tool use where appropriate

## UI Surfaces

Use DOM UI over the 3D canvas.

Needed surfaces:

- Start menu
- Character drawing screen
- Room browser
- Chat
- Scrapbook
- Tool belt
- Build picker
- Settings
- Host/LAN controls

The persistent HUD should be quiet so the paper world remains the focus.

Current HUD prototype:

- Compass and minimap are DOM widgets.
- Both can be dragged and resized by the user.
- Widget `{ x, y, scale }` preferences are saved in `localStorage`.
- Future settings/persistence should move these into user settings rather than world state.

## Distance Scenery

Far scenery should be handled separately from page props. Mountains and distant hills should not be normal clickable/collidable objects at the edge of the playable area.

Recommended approach:

- Use one or more parallax backdrop layers outside the page grid.
- Let the active biome or authored page corridor choose backdrop sets.
- Add haze/tracing-paper fog for distance fade.
- Keep distant scenery non-interactive and cheap to render.
- Fade or swap backdrop sets gradually across page transitions.

## Distribution Path

### Web

The first build runs in a browser and talks to a local or hosted Colyseus server.

### LAN

The server can run on one player's machine. Other players connect by local network address.

### Steam

Package the web client as a desktop app with Tauri or Electron. The packaged app can:

- Start a local solo server
- Connect to LAN servers
- Connect to hosted servers
- Use platform features later

### Console

Console is a later port phase. The safest preparation is to keep simulation, world data, art formats, and server protocol independent from Three.js-specific classes.

## Early Risks

- Freeform drawing can create gameplay confusion if hidden bodies are not clear.
- Multiplayer building needs permissions early to avoid griefing.
- User-generated art needs storage limits and moderation strategy.
- Paper visuals may become expensive if every object has unique textures.
- Infinite-world ambition can swamp the prototype.

## First Implementation Order

Completed prototype foundation:

1. Scaffold Vite/Three.js client.
2. Render paper clearing with placeholder avatar.
3. Add movement and camera.
4. Add source-to-runtime asset compiler and manifest.
5. Add sample paper materials, props, trees, house shell, Thing Maker, minimap, compass, and scrapbook shell.
6. Add draggable/resizable compass and minimap user preferences.

Next implementation order:

1. Split the current single `src/main.ts` prototype into focused modules.
2. Add serializable page data types and make the current clearing page `0,0`.
3. Render pages from data instead of hardcoded scene construction.
4. Add neighboring pages and basic page activation/deactivation around the avatar.
5. Add authored page examples for forest/path, dunes/plains, and river corridor.
6. Add seeded scatter inside page rules.
7. Move far hills/mountains into parallax/haze backdrop layers.
8. Add first real scrapbook material/discovery page.
9. Add simple building placement.
10. Add Colyseus server and room schema.
11. Sync players and placed pieces.
12. Add chat.
13. Add local save and local server mode.
