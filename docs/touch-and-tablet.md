# Touch and tablet play

Status: **slices 1–3 built (2026-09-20); slice 5 still owed.** The plan below is
the owner's 2026-09-20 estimate, kept as the record of the reasoning. What was
actually built, and the one place the plan changed, are at the bottom under
"Built".

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

| # | Slice | Size | State |
| --- | --- | --- | --- |
| 1 | Foundations: `touch-action`, multi-pointer bookkeeping, pinch, `dvh`, no long-press menu | S | **built** |
| 2 | Move pad and its settings | M | **built** (pad; the extra settings are not) |
| 3 | Act and rotate buttons; zoom buttons | S | **built** |
| 4 | Tap-to-aim previews for build, garden and tools | M | **owed** |
| 5 | Tablet layout and 44 px targets across the panels | M to L | **owed** |

Slices 1 to 3 give a playable prototype. Slice 5 is the same work as the owner's
planned all-at-once UI pass, so mock it up with touch sizes in mind and do it
together.

**Testing:** the sandbox and the built-in browser can emulate a tablet's size and
touch points, but not real multi-touch, so pad and pinch need a real iPad in
hand. Gesture math (pad direction, pinch scale) is pure and can have unit tests.

## Why these patterns, and what the alternatives were

Owner question, 2026-09-20: *"if there are better, more established game patterns
for this, the plan can be modified."* Reviewed the plan against the conventions
that mobile/console 3D games have settled on. The plan already matches the
mainstream; three alternatives were considered and rejected, one was adopted.

**Kept — the analog move pad ("virtual stick").** This is the default for 3D
games on touch because the camera is free: the stick's direction is read relative
to the camera, so "push up" always means "walk away from the camera" however the
camera has been swung. A **fixed four-way D-pad** is the alternative and is wrong
here — it quantises movement to eight compass points that do not rotate with the
camera, which reads as fighting the controls the moment the player orbits. The
plan's instinct was right: keep the *look* of the old arrow pad (so it is
recognisable) but read the thumb as a vector.

**Kept — pinch to zoom, one finger to orbit.** The genre convention splits the two
hands: one thumb moves, the other hand looks. Because this camera is a follow
camera that never pans on its own, there is no camera *position* to drag, so the
only remaining two-finger job is zoom. Taking the **log of the pinch ratio**
rather than a raw pixel difference is what makes the gesture its own undo (spread
then close returns exactly where you started). Adopted deliberately; see
`PINCH_ZOOM_GAIN` in `touchControls.ts`.

**Adopted — an always-present Act button, not a conditional one.** The plan said
the Act button "appears when something is in reach". Established practice for
primary action buttons on touch is to keep them in a **fixed position** and
change their *state* (brightness/outline), because a control that moves under a
thumb is a control you mis-tap. The plan changed here: the button stays put and
lights up when something is in reach — the same information the keyboard player's
prompt carries, moved into the button.

**Rejected — "tap the ground to walk there" (tap-to-move).** Common in isometric
and point-and-click games, and it solves the "no hover" problem for free. Rejected
because this game is about *being* the paper character (the camera can zoom
straight into first person), and tap-to-move would replace direct control with
pathing — a different game feel. The "no hover" problem it solves is handled by
slice 4 instead (tap to aim, tap to confirm).

**Rejected — floating stick that spawns under the thumb.** Some mobile shooters do
this to remove the need to find the pad. Rejected as the default because it makes
the thumb's *starting* position meaningless, and this is a slow, calm walking game
where the pad's fixed home is a landmark the hand can return to without looking.
It stays on the settings list as an option for slice 5.

**Rejected — accelerometer tilt to steer.** Not reliable in a tablet held flat on
a lap, and it fights the accessibility rule that every gesture needs a
non-gesture twin.

**Accessibility, restated because it constrains all of the above:** every touch
gesture has a button twin (zoom +/− for pinch), nothing needs two hands at once,
targets are ≥44 px, and a player with a keyboard or a gamepad is never made worse
off. Touch is a *source* added to the existing sum, never a replacement.

## Built 2026-09-20 (slices 1–3)

Files: `src/game/touchControls.ts` (new), `src/game/touchControls.test.ts` (new),
`src/game/input.ts`, `src/game/settings.ts`, `index.html`, `src/main.ts`,
`src/styles.css`.

- **Foundations.** `#game` now carries `touch-action: none` plus the
  no-callout/no-select trio; `body` gets `overscroll-behavior: none`; the viewport
  meta gains `viewport-fit=cover`; nine genuinely-full-viewport `100vh` rules
  became `100dvh` so iPad Safari's sliding toolbars cannot clip the layout.
- **Multi-pointer.** `input.ts` now tracks pointers **by `pointerId`** instead of
  holding one `lastPointerX/Y`. One finger still orbits exactly as before; a
  second finger becomes a pinch (`adjustCameraZoom`) rather than fighting the
  first; a third is ignored. Keyboard, gamepad and left-click are unchanged.
- **Move pad.** An analog pad, thumb-position → direction *and* strength, radial
  deadzone (`PAD_DEADZONE`), read camera-relative, fed into the movement sum via
  `setVirtualMovement` so a full pad throw plus a held key still clamps to one
  unit of speed.
- **Act / Rotate / zoom.** Act does what E does, Rotate does what R does in build
  mode (and only shows there), and +/− buttons are the non-gesture twin of pinch.
- **A setting.** `touchControls: 'auto' | 'on' | 'off'`, default `'auto'`
  (`pointer: coarse`). `'auto'` keeps the overlay off a desktop without making
  anyone find a toggle; the explicit values cover a touchscreen laptop or a
  tablet with a mouse attached.
- **Verified:** `npx tsc --noEmit` clean, 37 touch/input tests pass, whole root
  suite green, `npm run styles:check` clean.

**Not verified, and cannot be from here:** real multi-touch. The pad-while-
orbiting case, a genuine two-finger pinch, and pointer-cancel behaviour when iOS
claims a gesture are reasoned about and unit-tested at the maths level only. This
needs a real iPad in hand — the same gap the plan named.

**Still owed (slice 4, slice 5):** tap-to-aim previews for build/garden/tools;
and the tablet layout pass (44 px targets across the panels, the pad's size /
opacity / hand / reposition settings, and a settings-menu row for
`touchControls`). The overlay is sized from one CSS custom property per element so
those drop in without restructuring.
