# Sample Assets

These generated assets are practical references for the first phase. They are deliberately simple, exact-size examples that show texture budget, naming, source/runtime separation, and how much detail should survive at gameplay camera distance.

## Size Rules

- Use `512x512` for reusable paper material tiles.
- Use `1024x1024` for larger ground or terrain sheets.
- Keep character cutouts at `512x512` while prototyping.
- Avoid unique large textures on every placed object.
- Prefer repeated materials plus small variation meshes.

## Naming and Folders

Use folders to describe the asset's role. Use filenames to describe the specific material/object and variant.

Recommended source folders:

```text
assets/source/materials/
  paper/
  cardboard/
  cork/
  tape/
  fabric/
assets/source/props/
  nature/
  building/
  tools/
  critters/
  decor/
assets/source/ui/
assets/source/characters/
```

Use `materials/` for repeatable/tileable texture squares that cover geometry. Use `props/` or a domain folder for standalone cutouts and non-repeating elements.

Good material names:

```text
assets/source/materials/paper/construction-green-01.svg
assets/source/materials/paper/construction-green-02.svg
assets/source/materials/paper/lined-blue-folded-01.svg
assets/source/materials/cardboard/corrugated-brown-01.svg
assets/source/materials/tape/clear-glossy-01.svg
```

Good standalone asset names:

```text
assets/source/props/nature/tree-oak-flat-01.svg
assets/source/props/nature/bush-round-01.svg
assets/source/props/building/wall-sheet-01.svg
assets/source/props/building/roof-folded-01.svg
assets/source/props/critters/paper-potato-01.svg
```

Avoid:

- `tree1.svg` once the object type matters.
- `green.svg` when there may be many green materials.
- Mixing tileable material textures and standalone props in the same folder long-term.
- Encoding gameplay behavior only in the filename.

The compiler preserves folder structure and turns paths into keys. For example:

```text
assets/source/materials/paper/construction-green-01.svg
```

becomes:

```text
materials.paper.construction-green-01
```

That key is easier for the game to use than a flat filename list.

## Generated Examples

Compile every asset currently under `assets/source`:

```text
npm run assets:compile
```

The compiler:

- Recursively scans `assets/source`.
- Converts `.svg` files to runtime `.png` files using Chromium so SVG filters, gradients, transforms, rotations, and blend effects are closer to browser/game rendering.
- Copies supported raster/model files into `assets/runtime`.
- Preserves folder structure, such as `assets/source/nature/tree1.svg` to `assets/runtime/nature/tree1.png`.
- Writes `assets/runtime/asset-manifest.json`.
- Clamps runtime image exports to a default max dimension of `1024px` while leaving source art untouched.
- Preserves transparency for SVG cutouts, tape, characters, and other layered assets.

The sample generator creates source SVG files and runtime PNG files:

```text
npm run assets:sample
```

Runtime files:

- `assets/runtime/textures/paper_construction_brown_01.png`
- `assets/runtime/textures/paper_construction_green_01.png`
- `assets/runtime/textures/paper_notebook_blue_lined_01.png`
- `assets/runtime/textures/terrain_clearing_sheet_01.png`
- `assets/runtime/textures/resource_brown_paper_patch_01.png`
- `assets/runtime/textures/avatar_placeholder_flat_01.png`

Metadata:

- `assets/runtime/asset-manifest.json`
- `assets/runtime/sample-assets.json`

Mood/reference sheet:

- `assets/reference/paper-world-asset-reference-01.png`

Reference sheet prompt:

```text
Compact reference sheet showing handmade paper game assets: a torn ground sheet, brown construction paper resource scraps, a blue lined notebook paper path, a simple flat paper character cutout, a paper wall, a folded roof, transparent tape strips, and a tiny paper critter. Charming handcrafted stop-motion paper craft, orthographic asset reference, clean neutral background, soft studio lighting, visible contact shadows and paper edge shadows, no labels or text.
```

## What To Look For

- Fibers are visible up close, but not so loud that repeated tiles shimmer.
- Notebook lines are oversized enough to read from the camera.
- The ground sheet uses broader stains and edge marks instead of only tiny noise.
- The placeholder avatar has transparent empty space and a clear paper edge.
- The harvestable resource reads as layered scraps, not terrain.

## What To Avoid

- Photorealistic paper texture that clashes with handmade shapes.
- Texture detail that only works in a close-up render.
- Perfectly flat color with no fiber, smudge, edge, or crease detail.
- Many unique 2K or 4K textures before the art direction is proven.
- Runtime assets without a matching source file or manifest key.
- Tile materials that rely on transparent empty areas instead of a full background.
- SVG blend modes that only render correctly in one viewer.

## Transparency Rules

Use a full background rectangle for tileable material textures, such as construction paper, lined paper, cardboard, cork, or wrapping paper.

Use transparency intentionally for standalone/layered assets:

- Character cutouts
- Trees and bushes
- Stickers
- Tape
- Windows or tracing paper
- Loose scraps
- UI icons

For semi-transparent materials like tape, keep the transparent or translucent parts in the source SVG. The compiler should preserve alpha in the runtime PNG.

For standalone props, leave the artboard background transparent unless the object is intentionally a printed card or sheet. A full white rectangle in a tree/window SVG will compile as a white rectangle in the game.

## SVG Effects

The asset compiler renders SVGs in Chromium. This is intentional because the game is browser-based and many paper effects rely on browser-supported SVG features:

- `feTurbulence`
- `feColorMatrix`
- `feBlend`
- `filter`
- `linearGradient`
- Transforms such as rotate, scale, and translate

Avoid relying on effects that only work in one design tool but not in a browser preview. If it looks correct when opened directly in a browser, it should generally compile correctly.

## Tile Material Artboards

For repeatable materials, prefer square power-of-two artboards:

- `512x512` for most material tiles
- `1024x1024` for larger terrain/special surfaces

Small non-square tiles can work, but square power-of-two material textures are easier to repeat, mipmap, compress, and reason about.

## Cutout Artboards

The compiler scales SVGs down proportionally so the longest runtime PNG side is no larger than `1024px`.

For standalone cutouts like trees, windows, avatars, creatures, stickers, or tools:

- Keep the whole object inside the SVG artboard/viewBox.
- Leave a little transparent margin around organic edges, tips, shadows, and filter effects.
- Do not let leaves, branches, shadows, or outlines touch the artboard edge unless that crop is intentional.
- Use any source dimensions that are comfortable while drawing; the compiler will scale the runtime image down.

If a tree looks squared off after compile, the source SVG viewBox is probably clipping it before the game ever sees it. Increase the artboard/viewBox or move the drawing inward, then re-run `npm run assets:compile`.

## When Explicit Metadata Is Still Useful

The auto-generated manifest is enough for basic discovery, but some game behavior should still be specified intentionally later:

- Is the asset a tileable material, a cutout, a prop, or a UI image?
- Should it cast shadows?
- What collision shape should it use?
- What in-game scale should it have?
- Is it a scrapbook item, build template, critter, resource, or decoration?
- Does it need custom animation, pivot, or interaction data?

For now, add source art freely and run `npm run assets:compile`. When an asset becomes gameplay-relevant, give it explicit data.
