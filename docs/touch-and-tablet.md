# Touch and tablet play

Status: **an estimate, not built.** Owner question 2026-09-20: how big a lift is
playing on a tablet, with a movable four-arrow pad and multi-touch?

## What already helps

- Movement goes through one function, `getMovementInput()` in `game/input.ts`,
  which already sums the keyboard and gamepad into `{x, y}` from -1 to 1. A touch
  pad is one more source added there.
- The camera already has `addYaw`, `adjustCameraPitch` and `adjustCameraZoom`
  (used by drag, wheel and the gamepad's right stick). Touch calls the same ones.
- Input is Pointer Events, so a finger already arrives as a left press. One-finger
  drag on empty ground already orbits, and a tap is already a click.
- Most keyboard actions have an on-screen button already: the tool rail, map,
  mark spot, scrapbook.

## What is missing

- Nothing tells the browser the canvas owns touch: no `touch-action: none` on the
  canvas, no pinch handling, no `pointerType` anywhere. `input.ts` tracks one
  pointer (`lastPointerX/Y`), so a second finger fights the first.
- **E** (interact) has no button. **R** (rotate a build piece) has none.
- Build placement, garden and tool previews follow the hover position; a finger
  has no hover.
- Layout: `100vh` in nine places (iPad Safari's toolbars move it), and many
  targets under 44 px (the tech tree tags are 9 px).

## Recommended pattern

1. **Left thumb: a move pad, drawn like the old four-arrow pad but read as
   analog.** Thumb position inside it gives direction and strength, so walking
   stays smooth and camera-relative (a true 4-way pad would lock movement to
   stiff diagonals). Settings: hand (left or right), size, opacity; drag it to
   reposition in a "move controls" mode; optionally floating (appears under the
   thumb).
2. **Other hand: one-finger drag orbits (exists), pinch zooms.** The camera
   follows the avatar and never pans on its own, so "two fingers to pan" has
   nothing to pan; two fingers are for zoom (and, optionally, tilt).
3. **An Act button** (does what E does) that appears when something is in reach,
   sitting beside the thumb. A rotate button in build mode.
4. **Tap to aim, tap again to confirm** for build and garden previews.
5. **Accessibility:** every gesture has a non-gesture twin (zoom buttons for
   pinch), nothing needs two hands at once, targets are at least 44 px, keyboard
   and gamepad keep working, a setting turns touch controls on, off or auto
   (`pointer: coarse`).

## Slices

| # | Slice | Size |
| --- | --- | --- |
| 1 | Foundations: `touch-action`, multi-pointer bookkeeping, pinch, `dvh`, no long-press menu | S |
| 2 | Move pad and its settings | M |
| 3 | Act and rotate buttons; zoom buttons | S |
| 4 | Tap-to-aim previews for build, garden and tools | M |
| 5 | Tablet layout and 44 px targets across the panels | M to L |

Slices 1 to 3 give a playable prototype (about one focused session). Slice 5 is
the same work as the owner's planned all-at-once UI pass, so mock it up with touch
sizes in mind and do it together.

**Testing:** the sandbox and the built-in browser can emulate a tablet's size and
touch points, but not real multi-touch, so pad and pinch need a real iPad in
hand. Gesture math (pad direction, pinch scale) is pure and can have unit tests.
