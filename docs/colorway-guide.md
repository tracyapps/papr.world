# Colorway Guide

Written 2026-09-03. How one drawing becomes several colorways at compile time,
so a pattern can be recoloured without redrawing it and without giving up any
control over the individual colours in it.

## The short version

Put a `<name>.colors.json` sidecar next to a `<name>.svg` in `assets/source/`.
`npm run assets:compile` then emits the default PNG **plus one PNG per
colorway**:

```
assets/source/materials/kraft-twig-tile.svg
assets/source/materials/kraft-twig-tile.colors.json
  ->  assets/runtime/materials/kraft-twig-tile.png              (as drawn)
      assets/runtime/materials/kraft-twig-tile.terracotta.png
      assets/runtime/materials/kraft-twig-tile.moss.png
      assets/runtime/materials/kraft-twig-tile.faded.png
```

Nothing on disk is rewritten. The default PNG keeps its exact old name, so
adding a sidecar to an existing asset never breaks an existing reference.

## Why it works — and why quality isn't the price

`tools/compile-assets.mjs` rasterizes SVGs by loading them in real headless
Chromium (Playwright) and screenshotting. Because that's a genuine browser,
every SVG feature survives: `<style>` blocks, custom properties, `feTurbulence`
and friends, masks, gradients, stroke, opacity.

It also means the compiler can set CSS custom properties on the document
*before* the screenshot:

```js
document.documentElement.style.setProperty('--figure', '#BFD16A');
```

That's an inline style on the SVG root element, which always beats the `:root`
rule in the artwork's own `<style>` block — no specificity fight, no
find-and-replace, no duplicated files.

So each colorway is a **full-fidelity render of the real artwork** at real
chosen values. This is not a grayscale-plus-tint approximation: every colour in
the pattern stays independently controllable, and a multiply-tint's inability
to lighten a dark ground never comes up.

## The one authoring rule

**Declare every tweakable value on `:root` and read it back with `var()`.**

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
<style>
:root {
  --ground: #54411D;
  --figure: #C3AF84;
  --ring-width: 8;
  --figure-opacity: 1;
}
</style>
<rect x="0" y="0" width="120" height="120" fill="var(--ground)"/>
<g fill="none" stroke="var(--figure)" stroke-width="var(--ring-width)" opacity="var(--figure-opacity)">
  <circle cx="0"   cy="0"   r="34"/><circle cx="120" cy="0"   r="34"/>
  <circle cx="0"   cy="120" r="34"/><circle cx="120" cy="120" r="34"/>
  <circle cx="60"  cy="60"  r="34"/><circle cx="60"  cy="60"  r="16"/>
</g>
</svg>
```

Variables declared on an inner `<g>` are **not** reachable — the override lands
on the root element, and a descendant's own declaration wins over an inherited
one. Root only.

Note `--ring-width` and `--figure-opacity`: this is not limited to colour.
Anything the artwork reads through `var()` can vary. A "bolder weave" or a
"sun-faded" variant is the same mechanism as a recolour.

## Converting a generator SVG (the svgbackgrounds.com case)

Generator output usually **declares** a palette in `:root` and then ignores it,
having baked the chosen colours into the shapes as literal hex. That is the
state `assets/source/resources/sticks-kraft-twigs.svg` is in right now:

```svg
<style>
:root { --green: #024E04; --blue: #192443; --gold: #B47C16; --red: #3F0404; }
</style>
...
<rect ... fill="#54411D"/>     <!-- never references --gold or anything else -->
```

The prep step per pattern is therefore:

1. List the literal colours actually used. For the twigs:
   `#54411D` (ground), `#877C67` (mid), `#C3AF84` (figure).
2. Rename the `:root` block to describe *roles*, not the generator's leftovers —
   `--ground`, `--mid`, `--figure` beats `--green`/`--blue`/`--gold`/`--red`.
   Role names make a sidecar readable a year later, and they carry across
   patterns so one colorway vocabulary can serve the whole material set.
3. Set each variable's default to the hex it replaces, then swap every literal
   for `var(--role)`. The default render stays pixel-identical.

The compiler helps: if a sidecar overrides a property the artwork never reads
with `var()`, it prints a warning naming the property and the colorway, because
the alternative is silently writing several identical PNGs under different
names.

## Sidecar format

```json
{
  "terracotta": {
    "label": "Terracotta",
    "vars": { "--ground": "#7A3B22", "--figure": "#F0C9A0" }
  },
  "moss": {
    "label": "Moss",
    "vars": { "--figure": "#BFD16A" }
  },
  "faded": {
    "label": "Sun-faded",
    "vars": { "--figure-opacity": "0.45" }
  }
}
```

- **The key is the colorway id.** Lowercase letters, digits and dashes only —
  it becomes part of a filename and of the asset-manifest key. Enforced.
- **`vars` is required** and every key must start with `--`. Enforced.
- **`label` is optional**, defaulting to the id. It exists because the build
  picker will want a human name (see `BUILD_MATERIAL_LABELS`).
- **Partial overrides are the point.** `moss` above changes only the figure;
  the ground keeps whatever the artwork declares. Patterns exposing one
  variable and patterns exposing four need no different handling.

A sidecar is an input, not an asset: it is never copied into
`assets/runtime/`, and never appears in the manifest as a file of its own.

## What lands in the manifest

Each colorway gets its own entry, keyed `<asset key>.<colorway id>`, carrying
the values it was rendered with:

```json
{
  "key": "materials.kraft-twig-tile.terracotta",
  "runtime": "assets/runtime/materials/kraft-twig-tile.terracotta.png",
  "type": "texture",
  "usage": "material",
  "colorway": { "id": "terracotta", "label": "Terracotta",
                "vars": { "--ground": "#7A3B22", "--figure": "#F0C9A0" } }
}
```

Recording the vars means the manifest, not a person's memory, is the record of
what "terracotta" meant — and a later tool can build the build-picker's swatch
list straight from it.

## Gotchas

- **No ImageMagick fallback for colorways, on purpose.** Ordinary SVG renders
  fall back to ImageMagick if the browser render throws. Colorway renders do
  not, because ImageMagick cannot apply the property overrides — it would write
  a file *named* for the colorway containing the default colours. A wrong asset
  that looks like a right one is worse than a failed build.
- **ImageMagick still needs SVG support** for the unrelated job of reading each
  source's dimensions. Without it `getRuntimeDimensions` falls back to
  4096×4096 and the artwork renders into the corner of a huge transparent page.
  (`magick identify assets/source/materials/anything.svg` should print a size.)
- **Colorway count is PNG count.** Patterns × colorways, all resident texture
  memory. Curate a small shared palette — four to six — rather than offering a
  colour picker.
- **Ids are permanent-ish.** A colorway id ends up inside a saved
  `PlacedPiece.material` string, so renaming one orphans existing pieces to
  their default material. Pick names you can live with.

## How this fits the material plan

The intended shape, agreed 2026-09-03:

- Each gatherable or refinable resource gets **two** assets with different
  jobs — a top-down silhouette for the ground decal (see
  `resource-artwork-guide.md`) and a **seamless tile** for built surfaces.
- `PlacedPiece.material` stays a single string, encoded `pattern.colorway`
  (e.g. `kraft-twigs.terracotta`). It is already typed `string` in the protocol
  and already validated with a fallback to `DEFAULT_BUILD_MATERIAL`, so this
  costs **no `PROTOCOL_VERSION` bump**.
- The build picker offers the patterns whose resource you have; colorways are
  free across all of them. Paint as a gathered resource is a later idea, not
  this one.
- **Materials are consumed on build.** Resources respawn, so this never blocks
  anyone from building anything — it just means "I should go find more
  ribbonwood", or better, "can I borrow some?"
- **Restyling charges the new material and recycles the old one back.** That's
  what a player expects from taking a bench apart and rebuilding it, and it
  keeps redecorating from feeling expensive.

None of that bullet list is built yet — the colorway compiler is the first
piece. Consumption and the picker's gating are the next ones.
