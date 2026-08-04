# UI and Control Placeholders

This is the living placeholder list for controls, buttons, panels, and settings that come up during design. Keep this broad early, then promote items into implementation specs when the game needs them.

## Input Goals

- Support keyboard and mouse first.
- Support gamepad/joystick controls early enough that movement and UI patterns do not become keyboard-only.
- Let players remap controls.
- Keep camera control, movement, drawing, chat, and menus from fighting each other.
- Make settings feel accessible from solo, LAN, and hosted play.

## Control Modes

### World Movement

Keyboard and mouse:

- Move forward, back, left, right
- Rotate/orbit camera
- Interact
- Use active tool
- Place build piece
- Rotate build piece
- Open scrapbook
- Open chat
- Cancel/back
- Pause/settings

Gamepad:

- Left stick: move
- Right stick: camera
- South face button: interact/confirm
- East face button: cancel/back
- West/North face buttons: tool or context actions
- Shoulder buttons: cycle tools or scrapbook tabs
- Triggers: use tool/place
- Start/menu: pause/settings
- Select/view: scrapbook or map

### Drawing

- Brush
- Eraser
- Color picker
- Paper type picker
- Undo
- Redo
- Clear
- Save
- Cancel
- Zoom/pan canvas

### Building

- Select piece
- Preview piece
- Place
- Rotate
- Flip
- Change material
- Decorate
- Remove/pack up
- Share/copy template

### Chat and Social

- Open chat
- Send message
- Whisper or direct message
- Emote
- Gift/share item
- Invite to build
- Thank/helper reward action
- Report/block/mute

## Panels

Persistent or near-persistent:

- Tiny status chip
- Context prompt
- Tool belt
- Chat preview

Opened on demand:

- Scrapbook
- Build picker
- Drawing surface
- Room browser
- Friends/neighbors
- Sharing/gifting
- Critter friendship page
- House decoration/bling
- Settings
- Host/LAN setup

## Settings Placeholders

Controls:

- Keyboard remapping
- Gamepad remapping
- Invert camera X/Y
- Camera sensitivity
- Movement mode: camera-relative or character-relative
- Toggle/hold for tool use where applicable

Accessibility:

- Text size
- Chat visibility
- Reduced motion
- Color assistance for paper materials
- Camera shake amount
- Audio sliders

Multiplayer:

- Room privacy
- Chat enabled/disabled
- Build permissions
- Sharing permissions
- Friend-only interactions
- Mute/block list

## Current Prototype Controls

- `W` / `ArrowUp`: move into the screen
- `S` / `ArrowDown`: move toward the camera
- `A` / `ArrowLeft`: move left on screen
- `D` / `ArrowRight`: move right on screen
- Gamepad left stick / D-pad: move
- Gamepad right stick: orbit camera
- Right or middle mouse drag: orbit camera
- `1`: interaction / hands-free mode
- `2`: shovel mode (when a shovel is in the scrapbook)
- `3`: Creased Hoe — sow, lift plants, refill holes
- `4`: reserved tool slot
- Left click: interact or use the selected mode
- `B`: open and close the scrapbook strip
- `M`: mark this spot as a saved place
- `Escape`: close the top panel, then return to interaction mode

The full list is in-game behind the **?** icon (`src/ui/hudMenus.ts`). Keep the
two in sync — that overlay replaced the permanent on-screen hint text.

## Implementation Notes

- **Never hardcode a panel's screen position.** Screen space is described once
  in `src/ui/hudLayout.ts` and published as CSS variables. New panels call
  `registerRailPanel()`; new transient messages append to `getToastStack()`.
  Every HUD collision so far came from two files independently choosing the
  same pixel coordinates, which no single-file review can catch.
- **Keep the persistent HUD minimal.** Anything a player reads once belongs
  behind the help icon, not on screen forever. Anything they adjust
  occasionally belongs behind the cog. Anything they browse belongs in the
  scrapbook strip. The world view is the point.
- **New scrapbook content is a tab**, not a new panel or modal. Add it to
  `TABS` in `src/ui/scrapbook.ts`.
- **Show rules in the world, not only in text.** Spacing, reach, and blocking
  are spatial facts; a ground overlay teaches them in one glance where a toast
  cannot. See `game/gardenOverlay.ts`. Text explains the numbers *after* the
  overlay has shown the shape of the problem.
- **A cursor must never promise what a click will refuse.** Hit-tests and
  commands must resolve validity through the same query.
- Every `ActionMode` must be represented by exactly one tool rail slot,
  otherwise the game can enter a mode with nothing selected on the rail.
- Visual-only state classes (`is-locked`, `is-active`) must be mirrored into
  the accessible name; a screen reader cannot see a dimmed icon.
- `npm run hud:check` measures the live HUD for overlaps across seven
  viewports and both scrapbook dock states. Run it against `npm run dev`
  before calling a layout change done.
- Tool selection now routes through an action-mode layer. The visible rail uses
  numbered slots while tool ownership remains in the serializable player state;
  future key remapping and controller glyphs can change a slot's binding without
  changing tool or crafting data.
- The selected tool is communicated by its rail state and cursor artwork. Do not
  add the earlier semi-transparent “held tool” overlay back to the viewport.
- **One cursor per verb, not per action.** The hoe's three jobs (sow, lift,
  rake) all share `garden`; which one is about to happen is already carried by
  the ground overlay and the status chip. `build` stays reserved for
  structural building.
- Cursor hotspots live in `--cursor-x` / `--cursor-y` per kind. The
  valid/invalid state rules read those variables — they used to repeat the dig
  cursor's offset literally, so any other tool cursor snapped to dig's hotspot
  the moment it became valid.
- Gamepad support should use the browser Gamepad API in the web prototype.
- Controller support should be tested before Steam packaging, not after.
- UI panels should pause or gate camera drag when the pointer is over menus.
- The scrapbook should be the main inventory surface, not a renamed generic backpack.
