# Paper Artwork Guide

## Cutout Bottom Edges

**You do not need to draw a straight, flush bottom on tree or plant art.**

Standing cutouts are placed by `groundedCutoutY()` (`src/render/builders.ts`),
which sinks each one below the ground line by `CUTOUT_GROUND_SINK_RATIO` of
its own height (currently 3.5%, floored at 0.02 and capped at 0.45 units).

The sink is proportional because the ragged part of a drawing scales with the
drawing — a 24-unit redwood has a proportionally larger messy bottom than a
0.6-unit shrub. Without it, gaps under a ragged trunk let the cast shadow
separate from the art and the tree appears to hover.

Draw trunks running off the bottom edge of the canvas if that is more natural;
the buried portion is simply never seen. Adjust the one ratio if a new batch of
art needs more or less burial.

This guide defines how to create artwork for the paper world. It should help the game look handmade, coherent, and expandable without requiring every asset to be custom-modeled from scratch.

## Visual Rule

Everything visible should look like it could be made on a craft table.

Allowed materials:

- Lined paper
- Printer paper
- Construction paper
- Cardstock
- Cardboard
- Wrapping paper
- Tissue paper
- Tracing paper
- Graph paper
- Newspaper
- Sticky notes
- Tape
- Glue
- Pencil, ink, crayon, marker, paint, stamp marks

Avoid:

- Plastic-looking surfaces
- Metal unless it is drawn, foil, or printed paper
- Realistic stone, wood, or grass textures
- Perfectly clean digital gradients
- Assets that look like generic low-poly 3D models

## Shape Language

Most things should be made from:

- Flat sheets
- Cutouts
- Folded planes
- Rolled tubes
- Crumpled balls
- Layered strips
- Taped joints
- Pop-up-book forms
- Cardboard boxes

Use thickness sparingly. Paper should usually be thin, with visible edges.

## Texture Language

Every paper material should have at least some tactile detail.

Useful layers:

- Base paper color
- Fiber grain
- Subtle stains or smudges
- Crumple normal map
- Fold crease map
- Edge darkening
- Tiny tears
- Pencil construction marks
- Tape shine
- Printed pattern

The goal is not noise everywhere. The goal is touchable imperfection.

## Lighting and Shadows

Shadows are part of the art direction. Flat paper in 3D only feels magical when the lighting reveals its layers.

Use:

- Soft contact shadows
- Slight edge shadows between stacked paper
- Backlighting for tracing paper
- Tiny shadow gaps under folded pieces
- Ambient occlusion in creases

Avoid:

- Harsh shiny highlights on normal paper
- Overly dark scenes where paper color disappears
- Perfectly flat unshadowed planes

## Character Artwork

Player characters begin as drawings. **This is now implemented** (2026-08-10,
`src/ui/avatarEditor/` — see docs/avatar-and-identity.md for the full design):

1. Player picks a cutout **shape** first — a template silhouette from the
   library, or draws their own outline ("Draw your avatar", always the first
   tile).
2. Then **paper color**, then **paper pattern**, then crayon **drawing** —
   three separate fields, in craft order.
3. Everything is stored as **vector data** (`AvatarDesign` in `shared/`):
   silhouette key or outline points, paper keys, stroke polylines. Never a
   raster. The runtime texture is rasterized from SVG at wear time (Phase B).
4. The game adds the pale "cut edge" along the silhouette, the paper shadow
   derived from it, and the hidden body preset.

Hidden body presets (collision and movement only; the drawing controls
identity): small, medium, wide, tall, wheeled, hovering. Presets come from
the shape's catalog entry — never measured from the art, so a big flourish
never buys a big hitbox.

## Tool Artwork

Tools can be drawn or template-based. Either way, they should map to clear gameplay verbs.

Early tool verbs:

- Cut
- Fold
- Tape
- Glue
- Paint
- Carry
- Plant
- Erase or peel

Tool visuals can be strange. Tool behavior should stay readable.

Example:

- A drawn spoon, claw, or moon-shaped blade can all use the `cut` verb if the player assigns it.

## Environment Artwork

### Trees

Paper trees can be made from:

- Rolled cardboard trunks
- Layered construction-paper canopies
- Accordion-fold leaves
- Torn-paper bark strips
- Hole-punched fruit

Tree artwork can be genuinely tall. The compiler now preserves runtime artwork
up to 4096 pixels on its longest side, and world trees have no fixed height cap.
Use roughly 4–8 world units for ordinary canopy trees and 10–18 for landmark
giants whose tops require the player to tilt the camera upward.

For tall cutout trees:

- Put the trunk base at the bottom-center pivot so the tree always plants cleanly.
- Keep transparent gutters narrow; empty pixels make the visible tree smaller.
- Favor portrait source art rather than padding a tree into a square canvas.
- Preserve readable bark, knots, tape, and branch detail through the full height.
- Make a few silhouette families, then vary paper pattern and bark palette by region.
- Leave occasional canopy gaps so trails, signs, and harvestables remain discoverable.

The default compile cap is 4096. `ASSET_MAX_SIZE` can override it for an
exceptional source, but 4096 should cover most tall-tree artwork without making
texture memory unreasonable.

The first redwood family is the reference implementation: seven 787×2385
portrait cutouts (`redwood.svg` through `redwood7.svg`) rendered at roughly
18–30 world units. Their narrow one-third width-to-height ratio is a useful
target for future canopy giants because it preserves towering scale without
turning every trunk into a broad visual wall.

### Ground

Paper ground can be:

- Large sheets with visible seams
- Torn patches
- Folded hills
- Crumpled mounds
- Graph-paper paths
- Notebook-paper fields

### Water

Paper water can be:

- Shiny wrapping paper
- Blue tissue paper layers
- Transparent tracing paper over blue paper
- Wavy cut strips

### Rocks

Paper rocks can be:

- Crumpled gray paper
- Cardboard lumps
- Torn stacked ovals
- Pencil-shaded cutouts

Color is ecological storytelling, not a realism constraint. Grass can remain
recognizably grassy and wood recognizably woody while local materials inherit
the region: salmon ribbonwood, aqua folded pebbles, graphite cardstone, confetti
rock, plaid bark, or printed wrapping-paper grain. A harvested material should
visually remember where it came from.

## Building Artwork

Building pieces should feel like craft components.

Starter kit:

- Floor sheet
- Wall sheet
- Folded roof
- Door flap
- Window cutout
- Tape strip
- Corner tab
- Stair fold
- Sign

Each piece needs:

- Stable pivot
- Clear front/back
- Simple collision proxy
- Material slot
- Optional decoration layer

## Asset Creation Workflow

### For 3D Authored Assets

1. Build source asset in Blender or another DCC tool.
2. Keep geometry simple and paper-like.
3. Apply transforms.
4. Set pivot for gameplay placement.
5. Name objects clearly.
6. Assign reusable paper materials.
7. Add a simple collision proxy if needed.
8. Export to GLB.
9. Optimize with glTF Transform.
10. Test in the runtime scene.

### For Texture Assets

1. Scan or create paper texture.
2. Make it tile when useful.
3. Create optional normal/roughness maps for crumples and fibers.
4. Keep resolution proportional to on-screen size.
5. Save source and runtime versions separately.
6. Add manifest entry with a stable key.

Tileable material textures should usually have a full background rectangle. Reserve transparency for cutouts, tape, tracing paper, windows, stickers, UI icons, and other assets that are meant to layer over something else.

For browser-safe SVG source art, preview the file in a browser when using filters, blend modes, gradients, or transforms. The compile pipeline uses Chromium so browser rendering is the source of truth.

### For Avatar Cutout Shapes (the template library)

Source of truth: `assets/avatar-shapes/` — one SVG per shape plus
`shapes.json` metadata. The compiler turns them into the in-game catalog.

1. Draw or edit the silhouette in any vector tool, **at whatever size and
   proportion the shape actually wants** (changed 2026-08-15 — shapes used
   to be forced into one viewBox, which fought every shape that isn't
   person-shaped). The compiler measures the real ink, scales it uniformly
   into the 100 × 140 sheet, centres it, and stands it on a shared ground
   line. A wide cassette stays wide; a tall flame stays tall; nothing is
   ever stretched. Multiple paths in one file are merged (used for e.g.
   detached frog eyes), and a `transform` on the element or any ancestor
   `<g>` is applied. `<rect>`, `<circle>`, `<ellipse>`, `<polygon>` and
   `<polyline>` are converted for you, so a straight export works. `<line>`
   is skipped with a warning — a solid cutout has no way to show a
   zero-width line (harp strings, say, need to be drawn as thin closed
   shapes). `<text>` and `<image>` are refused: a silhouette is geometry.
2. Add or edit the entry in `shapes.json`: `key` (kebab-case), `label`,
   `category` (folks / shapes / animals / tokens / nostalgia), `spoken`
   (screen-reader description — concrete enough to choose a body by, ≥10
   chars), `keywords` (≥2 lowercase search terms), `preset` (hidden body).
3. `npm run shapes:compile` — or `npm run shapes:watch` to recompile on
   every save while iterating.
4. Review `designs/avatar-template-contact-sheet.html` in a browser
   (regenerated by the compiler; shows every shape with its keywords, the
   sheet border, the ground line, and what it was scaled by). With no
   browser handy, `npm run shapes:preview` renders the same fitted
   geometry to `output/asset-review/avatar-shapes-preview.png` — same
   collector, same fit, no dependencies.

Never edit `src/ui/avatarEditor/shapes.generated.ts` by hand.

IP rule (decision 2026-08-10): nostalgia shapes are original art and
**safe unnamed homage** — no third-party names in labels, keywords, or
spoken text.

### For Avatar Stamps (eyes, mouths, arms, hair)

Source of truth: `assets/avatar-stamps/` — one SVG per stamp plus
`stamps.json`. Same "draw at any size" freedom as shapes, but stamps are
**normalized**, not fitted: longest side 34 sheet units, centred on their
own origin, because a stamp is placed, rotated and scaled by the player and
all three pivot on that origin.

1. Draw the stamp. Multiple paths are kept **separate**, because each one
   carries a role:
   - `ink` — takes the player's chosen crayon (outlines, pupils, hair)
   - `paper` — the pale cut-edge tint of a second piece of paper (eye
     whites, wings)
   - `shadow` — a darker tint of the paper stock (creases, nostrils, blush)

   Declare it with `data-role="ink"` or `class="ink"`. With neither, the
   role is inferred from the fill's lightness — dark → ink, light → paper,
   middle → shadow — so a plain black-and-white export lands correctly with
   no markup at all. Consecutive same-role elements are merged into one
   path, so an eye pair drawn as two circles stays one part.
2. Add the `stamps.json` entry: `key`, `label`, `category` (eyes / faces /
   hair / limbs / extras), `spoken`, `keywords`, `defaultScale`, and
   **`layer`** — the one that matters:
   - `on` — clipped to the cutout. Faces. A face cannot slide off a face.
   - `behind` — glued behind the cutout, unclipped, with its own cut edge.
     Arms, legs, hair, antennae, wings. **This is the only layer that may
     hang outside the silhouette**, and it is the reason stamps exist:
     crayon strokes are clipped and can never make an arm.
3. `npm run stamps:compile` (or `stamps:watch`).
4. Review: `designs/avatar-stamp-contact-sheet.html` in a browser, or
   `npm run stamps:preview` for a PNG. `npm run avatar:preview` composes
   whole avatars — cutout plus stamps — which is the only way to catch
   layer-order and placement problems, since those only appear in
   combination.

Stamps are recoloured and drawn on by players: the `ink` role takes their
crayon, and strokes they add live in the stamp's own space and ride its
transform. So draw stamps as *shapes to be coloured*, not as finished art in
one fixed colour — an outline with a fillable interior gives them more to
work with than a solid blob.

Zero-area geometry is a trap worth knowing: a `<line>`, or a "stroke" drawn
as an open path, fills to nothing. Draw thin shapes as closed outlines.

### For Player Drawings

1. The original drawing data IS the stored form — vector strokes in
   `AvatarDesign`, validated by `sanitizeAvatarDesign` (stroke/point caps,
   on-sheet clamping, color allowlist, 32 KB ceiling).
2. Runtime texture and UI thumbnails are rendered from it via
   `designToSvg` / `designToDataUrl` (`src/ui/avatarEditor/render.ts`).
3. Paper type and body preset ride along inside the design.

## File Naming

Use readable names, but let the manifest be the real runtime API.

Examples:

```text
assets/source/materials/paper/construction-brown-01.svg
assets/source/props/building/wall-sheet-01.svg
assets/source/blender/building/wall-sheet-01.blend
assets/runtime/materials/paper/construction-brown-01.png
assets/runtime/props/building/wall-sheet-01.png
```

Manifest keys:

```text
materials.paper.construction-brown-01
props.building.wall-sheet-01
props.tools.scissors-paper-01
props.critters.squirrel-paper-01
```

Use `materials/` for tileable textures that cover geometry. Use `props/` for standalone objects, cutouts, and non-repeating elements.

## Material Starter Set

Create these first:

- Brown construction paper
- Green construction paper
- White printer paper
- Blue lined notebook paper
- Yellow sticky note paper
- Gray crumpled paper
- Clear tracing paper
- Red patterned wrapping paper
- Cardboard
- Transparent tape

## Quality Checklist

Before an asset is considered usable:

- It reads as paper from a distance.
- It has a clear silhouette.
- It has a stable pivot.
- It uses shared materials where possible.
- It has a simple collision plan.
- It casts and receives shadows correctly.
- It is not visually too clean.
- It works at gameplay camera distance.
- It has source and runtime files separated.
- It has a manifest key.

## First Art Tasks

1. Make a paper ground sheet.
2. Make brown construction-paper resource patches.
3. Make one flat placeholder avatar.
4. Make one wall, floor, roof, and door.
5. Make three paper material textures.
6. Make one tiny paper critter.
7. Make a tape strip and fold crease detail.

## First Asset Brief

Create a tiny "paper clearing" kit before making anything complex.

Required assets:

- `paper.construction.brown.01`: brown construction paper with fibers and tiny color variation.
- `paper.construction.green.01`: green construction paper for simple plants or tree canopies.
- `paper.notebook.blue-lined.01`: lined notebook paper for paths, signs, or UI-flavored world pieces.
- `terrain.clearing.sheet.01`: a large uneven ground sheet with visible torn edges.
- `resource.brown-paper-patch.01`: a harvestable clump of layered brown paper scraps.
- `avatar.placeholder.flat.01`: a simple upright paper cutout used before player drawing exists.
- `building.floor.sheet.01`: flat placeable floor.
- `building.wall.sheet.01`: upright placeable wall.

Success criteria:

- The clearing reads as paper even with no UI.
- The avatar casts a useful shadow on the ground.
- The resource patch is visually distinct from regular ground.
- The building pieces are simple enough to repeat many times.
- The kit can be rendered in a browser without long load times.

## Tool Rail Framing

Each tool's artwork carries its own framing in `src/game/toolPresentation.ts`:

```ts
frame: { width, left, top, rotate, flipX?, activeLift?, activeBadgeLift? }
```

Values are in the slot's own pixel space; the slot box is **184 × 140**, and
art is allowed to bleed outside it. Framing used to live in CSS as per-slot
rules, which meant every new tool needed a stylesheet edit and slot *numbers*
were baked into presentation. A tool can now move slots freely.

Practical notes for drawing tools:

- Wide tools (the hoe is 3.5:1) need a diagonal `rotate` or they render as a
  crushed sliver. Negative rotation lifts the drawing's right-hand end.
- The rail is near-black. Metal and dark handles disappear against it — the
  hoe needed an alt version with lighter metal (`garden-hoe-alt.svg`).
- `activeLift` moves the art up when its slot is selected; pair it with
  `activeBadgeLift` so the number badge travels with it.
- A tool with no entry here still works. It renders as a plain numbered slot
  until its drawing exists, so a mechanic is never blocked on art.
