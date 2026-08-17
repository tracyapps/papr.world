# src/ui/avatarEditor — the paper-self editor

Wired in as of Phase B (docs/avatar-and-identity.md §7). This folder stays
renderer-free: it knows about DOM, SVG and localStorage and nothing else.
The bridge to the world is `src/game/avatarLook.ts`, which rasterizes a
design onto the avatar plane — if you find yourself importing `three` in
here, that is the seam you actually want.

## The flow (three steps)


1. **Shape** — searchable/sortable grid of cutout shapes. The first tile is
   always **"Draw your avatar"** (big question mark). Search matches label,
   category, and each shape's `keywords`.
2. **Outline** *(custom only)* — draw the cutout edge, confirm ("Use this
   shape"), or go back to the grid.
3. **Studio** — a full-screen workshop. Paper stack on the left, the cutout
   on a work table in the middle, a tool bench on the right with three tabs:
   **Faces** (stamps that clip to the cutout), **Arms & hair** (stamps behind
   it), **Draw** (crayons). **"Change shape…"** warns that selections reset
   and offers "Save to wardrobe, then change" first.

The tabs are load-bearing, not cosmetic: dragging a stamp and drawing a
stroke are the same gesture, so only the active tool's pointer handlers are
attached — and only stamps on that tool's own layer are grabbable.

A selected stamp gets graphics-app handles: drag the body to move, a corner
to resize, the band just outside to turn (shift snaps to 15°). The keyboard
does all three — arrows nudge (alt for fine), shift+arrows resize, `[` `]`
turn, Delete removes — because precise dragging must never be the only way.
Buttons remain only for what a handle cannot express: flip, layer order,
colour, remove. Undo covers stamps and strokes in one history.

Stamps also take any crayon colour (the `ink` role only — paper and shadow
stay tied to the stock), and can be **drawn on**: "Draw on it" routes strokes
into `DesignStamp.strokes`, which live in the stamp's own coordinate space,
so they move, turn and scale with it.

The studio also seals itself off: wheel, pointer and stray key events stop
at the overlay, and `main.ts` parks the frame loop while
`isAvatarStudioOpen()` is true. Without that, scrolling the stamp tray also
zoomed the game camera underneath.

## Editing the shape library

Source of truth: `assets/avatar-shapes/` — one SVG per shape plus
`shapes.json` (label, category, spoken description, search keywords,
collision preset).

Draw at **any size in any viewBox**. The compiler measures the artwork's
own bounding box, scales it uniformly into the 100 × 140 cutout box, centres it,
stands it on a shared ground line, and bakes that transform into the
emitted coordinates — so one cut-edge stroke width reads the same on all of
them.

```bash
npm run shapes:compile   # validate + regenerate
npm run shapes:watch     # recompile on every save while drawing
npm run shapes:preview   # PNG contact sheet, no browser needed
```

Outputs: `shapes.generated.ts` (never hand-edit) and
`designs/avatar-template-contact-sheet.html` (visual review — refresh after
compiling). The compiler fails loudly on non-geometry elements, missing
keywords/spoken text, duplicate keys, and unlisted SVGs; `shapes.test.ts`
guards the fit itself (in bounds, filling the sheet, on the ground line).

## Editing the stamp library

Source of truth: `assets/avatar-stamps/` (one SVG + `stamps.json`). Stamps
are the pre-drawn details — eyes and mouths that clip to the cutout
(`layer: "on"`), and arms, legs and hair that sit behind it and may hang
outside it (`layer: "behind"`). Paths carry a role — `ink` (player's
crayon), `paper` (pale cut-edge tint), `shadow` (darker stock) — set with
`data-role`/`class` or inferred from fill lightness.

Adding one is: draw an SVG at any size, drop it in, add a `stamps.json`
entry (`key`, `label`, `category`, `spoken`, `keywords`, `layer`,
`defaultScale`), recompile. Watch for zero-area geometry — an open path or a
`<line>` fills to nothing, so draw thin things as closed outlines.

```bash
npm run stamps:compile   # validate + regenerate
npm run stamps:watch     # recompile on every save while drawing
npm run stamps:preview   # PNG of every stamp
npm run avatar:preview   # PNG of whole composed avatars — checks layering
```

## Geometry lives in one place

`shared/` owns the coordinate space, and everything derives from it:

- `DESIGN_SHEET` (130 × 180) — the whole sheet, and the SVG viewBox.
- `DESIGN_CUTOUT` (100 × 140 at 15, 25) — where the silhouette is fitted.
  The ring between the two is where appendages hang.
- `DESIGN_GROUND_Y` — the line cutouts stand on; `game/avatar.ts` positions
  the plane so it meets the terrain there.

The compilers hardcode matching numbers (they are `.mjs` tools and cannot
import the TS), and `shapes.test.ts` fails if the two ever drift apart.

## What's here

- `shapeTypes.ts` — `SilhouetteTemplate` type + category order.
- `shapes.generated.ts` — GENERATED shape data. Edit assets, not this.
- `stampTypes.ts` — `StampTemplate`, roles, and the `on`/`behind` layer.
- `stamps.generated.ts` — GENERATED stamp data. Edit assets, not this.
- `catalog.ts` — papers, crayons, brushes; re-exports shapes and stamps.
- `render.ts` — pure design → SVG string; `silhouettePathFor` resolves
  template keys *and* drawn custom outlines. Owns the layer order: behind
  stamps (unclipped) → cut edge → clipped paper, pattern, on stamps,
  strokes.
- `stampBacking.ts` — decides, by hit-testing the real cutout path, whether
  a face stamp needs its own scrap of paper (it lands in a hole or off the
  edge). DOM-only, editor-only; the answer is stored on the stamp.
- `wardrobe.ts` — saved designs in localStorage (`pp.wardrobe.v1`).
- `editor.ts` — the overlay. `openAvatarEditor({ initial?, onSave, onCancel })`;
  opens on the style step when `initial` is given, on shapes otherwise.
- Types + validation in `shared/` (`AvatarDesign`, `sanitizeAvatarDesign`,
  incl. `customOutline` rules) because the server stores designs in Phase D.

## How it reaches the world (Phase B, shipped)

`src/game/avatarLook.ts` owns the seam:

```ts
initializeAvatarLook();   // main.ts — wear the saved design, or first-run
openAvatarLookEditor();   // settings cog → "Change how you look…"
```

Saving stores the design in the wardrobe, marks it worn, rasterizes it
(`designToDataUrl` → `<Image>` → canvas → `THREE.CanvasTexture`) and calls
`setAvatarTexture()` in `game/avatar.ts`, which re-runs `applyAlphaShadow`
so the cast shadow matches the new outline. A design that fails to
rasterize leaves the previous look in place rather than blanking the
player out of the world.

Still open: wardrobe UI (Phase C) and designs over the wire (Phase D).

## Design rules this layer keeps

- Templates are the accessible path — a full avatar with zero drawing.
- Vector strokes only; rasters never enter the data model.
- Collision preset comes from the template mapping (custom outlines default
  to `medium`), never measured from the art — a player who stamps on six
  arms does not get a wider hitbox.
- Stamps travel as a catalog key plus five numbers. Like silhouettes, the
  art itself never goes over the wire.
- Every drag has a button equivalent. The stamp controls are not a
  fallback; they are the accessible path to the same edit.
- The editor is a modal overlay; it must never register HUD zones.
