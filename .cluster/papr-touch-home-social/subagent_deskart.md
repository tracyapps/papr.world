# Desk artwork — four paper-craft drawings for the desk

**Status:** done, verified, and **one piece of scaffolding left behind that I could not
delete** (see §0 — it needs a human hand or a fresh approval).

| | |
|---|---|
| Component | `site/src/components/DeskArt.astro` (25,047 bytes, `sha256 d45feed52d141cb12cbc1a64fb9ca7421f16c6c2c7807a0a759d0df0a745d65b`) |
| Review aid | `DELIVERY/desk-art-preview.html` (127,411 bytes, self-contained, opens from the filesystem) |
| Build | `cd site && npx astro build` → **exit 0, 10 pages, no warnings** (log in §4) |
| Touched | the two files above, plus the temporary scaffolding in §0. **No other tracked file was modified by me.** |

---

## 0. ⚠ Left behind — please remove before this ships

I created a throwaway Astro page to prove the component compiles and that Astro's scoped
styles actually reach SVG children (they do — §4). The command that would have removed the
scaffolding was **denied by the safety guard** (`AUTOCLAW_SAFETY_GUARD_DENIED`,
`risk=File delete command`, approval timed out), and the guard's rules for that turn forbid
retrying it by any other route. The files are harmless but one of them is a **live route**
(`/deskart-check/`) that would be published by the next `npm run site:build`:

```sh
rm -f site/src/pages/deskart-check.astro \
      _deskart-shot.tmp.mjs _deskart-map.tmp.mjs _deskart-check.tmp.mjs \
      _deskart-shadow.tmp.mjs _deskart-e2e.tmp.mjs
pkill -f "astro preview --port 4399"     # still running (pids 52626/52644 when last checked)
rm -rf site/dist/deskart-check           # build output; site/dist is gitignored
```

Nothing else needs to happen; the route disappears with the page and the next build.

Also for the record: while I was working, sibling agents were editing `package.json`,
`site/src/pages/account.astro`, `site/src/scripts/account.ts` and adding
`site/src/data/tech.json` + `tools/build-tech.mjs`. I did not touch any of them, and my
build succeeded with those edits in place.

---

## 1. The component API

```astro
---
import DeskArt from '../components/DeskArt.astro';
---
<DeskArt name="scrapbook" />          <!-- scrapbook | learning | wardrobe | mailbox -->
<DeskArt name="mailbox" size={44} />  <!-- default 110; square, in px -->
<DeskArt name="learning" class="desk__art" />
```

- One inline `<svg viewBox="0 0 120 120">`, no external asset, no dependency, no JS.
- `role="presentation" aria-hidden="true" focusable="false"` on the root. Nothing inside is
  focusable or named — the drawing says nothing the heading above it does not already say,
  so it is not given a name. (`Critter.astro` *is* a real button with a real accessible name
  precisely because you can click it and something happens; this is the opposite case and
  gets the opposite treatment.)
- `class` is merged onto the root, so a caller can place it.
- Nothing in the repo imports it yet — the desk page is being rewritten by another agent, so
  wiring was out of scope. An unused component costs nothing in the bundle.

## 2. The four drawings

Every drawing is built from the same three moves: a hand-written silhouette (no two corners
alike, edges bowing), the same silhouette again a few units down-right in a darker stock
(the "sheet underneath"), and one — never two — crayon-coloured part.

### `scrapbook` — a closed album with a lean to it
1. **Cover** — `--paper-2`, with its own copy in `--paper-3` offset +4/+5. Unequal corners
   (4/16/6/14-ish) written as curves, not arcs.
2. **Spine** — `--kraft`, its own copy in `--kraft-3`, plus a dashed `--ink-faint` stitch
   line down the middle: the album reads as *bound* rather than as a poster lying flat.
3. **One strip of tape** (~17×12.6 at −2.5°) in `--tape`, with two `--edge-soft` dashed sides
   — the torn edge where it came off the roll, the same trick `@include tape` does with
   borders.
4. **Corner mount** — `--kraft-2` triangle with a `--ink-faint` fold line, the way a real
   album holds its first photograph.
5. **Title label** — `--paper` on its own `--paper-3` sheet, carrying two ruled `--ink-soft`
   lines so it reads as typewritten rather than as a blank white rectangle.
6. **Pressed flower** — five mismatched `--crayon-3` petals (0°/69°/146°/214°/288°, not 72°
   apart) with a `--ink-soft` centre and stem. **The drawing's single crayon.**

### `learning` — the Professor's desk, not the Professor
`src/ui/professor.ts` + `src/game/professorRig.ts` say the Professor is a paperclip with a
card; so the paperclip is here, and everything else is the work on the desk.
1. **Back card** — `--kraft`, rotated 10.5°, shifted left and up.
2. **Middle card** — `--kraft-2`, rotated 3.5°. The fan is deliberately wide: at 44px, a
   stack that shows three corners reads as a stack, and one that shows one corner reads as a
   single card.
3. **Top card** — `--paper-2` with a `--paper-3` sheet underneath (offset 4/5), rotated −4.5°.
   On it: three hand-ruled lines (`--ink-soft` at 45% — they drift and stop short of the
   edge), a wobbly triangle with a dot at its apex, a dashed leader line and a squiggle of
   handwriting.
4. **Paperclip** straddling the card's top-left edge — one open wire loop, stroke only
   (`--ink-soft`, 2.1), because a filled clip at this size is a blob.
5. **Pencil** across the bottom, point hanging off the card: body `--crayon-3` with a faint
   `--ink` seam, ferrule `--kraft-3`, sharpened wood `--kraft`, graphite `--ink`.
   **The drawing's single crayon** is the pencil body.

### `wardrobe` — a clothes rail with the drawer it stands on
1. **Two uprights** — `--kraft`, cut asymmetric (the right one is not the left one mirrored).
2. **Rail** — `--kraft-3`, a shade *darker* than the uprights. This is load-bearing: the
   jumper hanging from it is kraft too, and when both were `--kraft-2` the sweater read as
   part of the rail (caught in the raster check, §4). A rod carries no under-sheet — only
   sheets do.
3. **Three garments**, each in an `.art-sway` group so it can hang and swing: wire hanger
   (stroke-only `--ink-soft`) plus —
   - a **dress** (`--paper-2`, waist seam, three buttons),
   - a **jumper** (`--kraft-2`, chest patch in `--crayon-2` — **the drawing's single crayon**),
   - a **shirt** (`--paper-3`, collar V).
4. **Drawer** — `--kraft` with a `--kraft-3` sheet underneath and a recessed `--ink-soft`
   handle. It grounds the drawing and stops the rail floating.

### `mailbox` — box on a post, flag up, yesterday's letter leaning on the post
1. **Post** — `--kraft` with a `--kraft-3` sheet underneath; everything else stands in front.
2. **Box** — `--paper-2` with a rounded top and a `--paper-3` sheet underneath.
3. **Door** — `--paper-3`, one step darker than the box **in both themes**, carrying the
   **slot** and a `--ink-soft` handle. The slot is `--sh-2` — the one place where no paper
   token will do: a hole has to be dark in both themes, and every paper/ink token flips.
4. **Flag** — `--ink-soft` arm, `--kraft-3` mount, and the plate in `--crayon`
   (**the drawing's single crayon**), raised.
5. **Envelope** — `--paper-2` with a `--paper-3` sheet underneath, an `--ink-soft` flap V and
   a `--paper` stamp with a dashed `--edge-soft` perforation edge. Deliberately **not**
   `--paper`: this drawing ends up on a `.paper-card`, which is already `--paper`, and a
   sheet that matches the page it lies on is a hole rather than a letter.

## 3. Tokens

Used: `--paper-2`, `--paper-3`, `--kraft`, `--kraft-2`, `--kraft-3`, `--tape`, `--ink`,
`--ink-soft`, `--ink-faint`, `--edge`, `--edge-soft`, `--sh-1`, `--sh-2`, `--crayon`,
`--crayon-2`, `--crayon-3`.

No hex anywhere in the component. **`--paper` is used by exactly one thing** — the scrapbook's
title label — and never as a large silhouette, for the reason above. `--green` is unused
(nothing here is "done"), as are the scenery tokens (`--h*`, `--m*`, `--potato*`, `--cloud*`).

The shadow is `filter: drop-shadow(3px 5px 0 var(--sh-1))` on the root — the same hard,
zero-blur offset TreeLine gives its trees ("paper does not do soft blur"). I tested whether
the SVG root clips that shadow and it does not: the filter result paints outside the element
box with or without `overflow: visible`, so the component leaves the default clipping alone
and, instead, none of the four drawings is allowed to use the last ~2 units of the 120 box.

## 4. How this was verified

**The vision model was unavailable in this run** (`image` tool → `400` from
`zai/zai_glm-5.3-flash`), and the run's own model cannot view images, so nothing below is
"it looked right to me". Everything is either the real build, the real DOM, or a rasterised
pixel analysis. §5 lists what that leaves unproven.

### 4a. The build

```
$ cd site && npx astro build
19:32:54 [content] Syncing content
19:32:54 [content] Synced content
19:32:54 [types] Generated 20ms
19:32:54 [build] output: "static"
19:32:54 [build] mode: "static"
19:32:54 [build] directory: .../pencil-and-paper/site/dist/
19:32:54 [build] Collecting build info...
19:32:54 [build] ✓ Completed in 28ms.
19:32:54 [build] Building static entrypoints...
19:32:54 [vite] ✓ built in 733ms
19:32:54 [build] ✓ Completed in 750ms.

 building client (vite)
19:32:54 [vite] transforming...
19:32:54 [vite] ✓ 22 modules transformed.
19:32:54 [vite] rendering chunks...
19:32:54 [vite] computing gzip size...
19:32:54 [vite] dist/_astro/clerk.C7oqyTSi.js                                          1.02 kB │ gzip: 0.56 kB
19:32:54 [vite] dist/_astro/admin.astro_astro_type_script_index_0_lang.CswxrfEx.js     4.76 kB │ gzip: 2.01 kB
19:32:54 [vite] dist/_astro/Base.astro_astro_type_script_index_0_lang.2SRAyu75.js     10.95 kB │ gzip: 4.27 kB
19:32:54 [vite] dist/_astro/account.astro_astro_type_script_index_1_lang.D37EJeaS.js  38.09 kB │ gzip: 9.86 kB
19:32:54 [vite] ✓ built in 52ms

 generating static routes
19:32:54 ▶ src/pages/account.astro
19:32:54   └─ /account/index.html (+5ms)
19:32:54 ▶ src/pages/admin.astro
19:32:54   └─ /admin/index.html (+1ms)
19:32:54 ▶ src/pages/deskart-check.astro          ← the temporary page from §0
19:32:54   └─ /deskart-check/index.html (+4ms)
19:32:54 ▶ src/pages/enter.astro
19:32:54   └─ /enter/index.html (+1ms)
19:32:54 ▶ src/pages/how-it-works.astro
19:32:54   └─ /how-it-works/index.html (+1ms)
19:32:54 ▶ src/pages/index.astro
19:32:54   └─ /index.html (+2ms)
19:32:54 ▶ src/pages/invite.astro
19:32:54   └─ /invite/index.html (+2ms)
19:32:54 ▶ src/pages/roadmap.astro
19:32:54   └─ /roadmap/index.html (+2ms)
19:32:54 ▶ src/pages/together.astro
19:32:54   └─ /together/index.html (+1ms)
19:32:54 ▶ src/pages/world.astro
19:32:54   └─ /world/index.html (+2ms)
19:32:54 ✓ Completed in 30ms.

19:32:54 [@astrojs/sitemap] `sitemap-index.xml` created at `dist`
19:32:54 [build] 10 page(s) built in 882ms
19:32:54 [build] Complete!
```

A bare `astro build` proves nothing about an unreferenced component, which is why the temp
page existed. With it: the component compiles, `SiteNav`/Base are unaffected, and the scoped
styles do reach inside the SVG —

```
<g class="art-sway" style="--sway-delay:0s" data-astro-cid-qqey24om>      ← scope attribute on an SVG child
.art-sway[data-astro-cid-qqey24om]{transform-box:fill-box;transform-origin:50% 0%}
@media (prefers-reduced-motion:no-preference){.art-sway[...]{animation:deskart-sway 9s cubic-bezier(.2,.7,.3,1) infinite;animation-delay:var(--sway-delay, 0s)}}
@keyframes deskart-sway{0%,to{transform:rotate(-1.1deg)}50%{transform:rotate(1.1deg)}}
.deskart{display:block;filter:drop-shadow(3px 5px 0 var(--sh-1))}
```

### 4b. The built page, in a browser (`astro preview` + Playwright, Chromium)

```
{ "count": 8,
  "sizes": ["110x110","110x110","110x110","110x110","44x44","44x44","44x44","44x44"],
  "accessible": true,                    ← aria-hidden + role=presentation + focusable=false on all 8
  "filter": "drop-shadow(rgba(54, 39, 27, 0.16) 3px 5px 0px)",
  "animationName": "deskart-sway",       ← the scoped rule matched the real SVG group
  "animationDuration": "9s",
  "transformBox": "fill-box",
  "transformOrigin": "16.1386px 0px",    ← centre-x of the garment box, top edge: the rail
  "animationRunning": true,
  "transformSamples": [                  ← sampled 1.4s apart: the matrix is advancing
    "matrix(0.999995, 0.00327453, -0.00327453, 0.999995, 0, 0)",
    "matrix(0.999873, 0.015948, -0.015948, 0.999873, 0, 0)"] }
dark theme: {"paper":"#2b241d","panelBg":"rgb(36, 29, 23)","svgStillDrawn":110}
console errors: none
```

### 4c. What is actually drawn — light vs dark

Since I cannot look, each drawing is rasterised (once per theme) into a 110×110 and a 44×44
bitmap and every pixel is classified to its nearest **token**, so the drawing can be read as
a token map and the two themes can be compared pixel by pixel. Number of drawn pixels that
keep the same token identity when the theme flips:

| drawing | drawn area | light→dark agreement @110px | @44px |
|---|---|---|---|
| scrapbook | 43% of the square | **84.7%** | 70.3% |
| learning | 43% | **83.6%** | 61.6% |
| wardrobe | 41% | **91.1%** | 78.7% |
| mailbox | 35% | **80.9%** | 58.6% |

The residue is anti-aliasing at shape edges (which is why the 44px numbers are lower — at
44px most pixels *are* edge), not a part going missing. Spot-checked by hand in the maps: the
scrapbook's spine/tape/flower, the learning pencil's amber body, the wardrobe's rail-vs-jumper
split and the blue patch, and the mailbox's slot, flag and door all keep their own tone in
both themes.

At 44px, each drawing still shows **7–9 distinct tones** and 33–43% of the square in a solid
paper stock — nothing collapses into one blob. Ink bounds, all inside the 0–120 box
(x0, y0, x1, y1):

```
scrapbook  16.1  25.1  105.8  101.7
learning    8.6  16.8  104.1  103.5
wardrobe   14.9  25.6  104.7  115.7
mailbox    16.3  31.0  111.4  117.1
```

### 4d. The sway hangs from the rail, not from the corner

The animation is pinned at each end of its arc and the boxes are measured on screen:

```
rail moves:   dx 0  dy 0
dress moves:  dx -0.25  dy 0
shirt moves:  dx -0.22  dy 0
```

The rail does not move at all and the hems travel ~0.25px at 110px — i.e. `transform-box:
fill-box; transform-origin: 50% 0%` is doing what it claims. ±1.1° over 9s is the same
amplitude `TreeLine.astro` gives the trees; `prefers-reduced-motion: no-preference` wraps the
whole animation, so anyone who asked for less motion gets a still drawing.

Two bugs in my own first draft were caught by these maps and fixed: the wardrobe's jumper was
`--kraft-2` against a `--kraft-2` rail (they merged into one shape), and the mailbox's door
and envelope were `--paper` (invisible against the page the drawing sits on).

## 5. What I could not verify

1. **Nothing was judged with eyes.** The vision model 400'd on every call. "Does it read as a
   mailbox" is exactly the judgement a token map cannot make. That is what
   `DELIVERY/desk-art-preview.html` is for — open it in a browser; you get all four on both
   themes at 110px and 44px, plus the sway frozen at the far end of its swing.
2. **Chromium only.** `transform-box: fill-box` on an SVG `<g>` was verified in headless
   Chromium. If some browser ignores it, the group rotates about the SVG origin instead, which
   shifts a garment by well under a pixel — visible only if you were staring at it.
3. **No `astro check`.** The repo's own build script is `npm run build` (`content:check`,
   `styles:check`, `tsc`, `vite build`) and `npm --prefix site run build`; I ran the
   site-only build the task asked for. A file that is not imported is not type-checked by
   `astro build`, so my temp page did that job instead.
4. **The preview file's token values are copied by hand** from `_theme.scss` and the
   `theme-night` mixin (the preview has to be self-contained). They were correct at
   `d45feed5`; if a token moves, the preview is stale until someone re-runs the generator.
5. **Placement and scale on the real desk are untested**, since the component is not wired in
   yet. If a card wants something smaller, `size` takes any number; below ~40px the scrapbook's
   label lines and the mailbox's stamp stop resolving to anything.
6. The temporary scaffolding of §0 is still on disk.
