# Your desk — layout restructure

**Date:** 2026-09-20 · **Repo:** `~/Dropbox/work/custom-work-tools/games/pencil-and-paper`
Uncommitted. Nothing deployed.

---

## Assessment

**What was preserved.** papr.world's identity and paper-craft visual language
(the `_tokens.scss` custom properties and the `_paper.scss` recipes, unchanged);
the site nav and footer; the page's purpose and every string of core copy; all
real functionality — worlds and their Enter buttons, the scrapbook, learned
techniques, the mailbox with claiming, the wardrobe and studio link, profile
editing with per-field visibility, and both one-time imports with their
receipts; the Clerk sign-in and passport-claim flows; and every `data-*` hook
`account.ts` binds, so no route, permission or flow changed.

**What was restructured.** Card order and grouping; the fixed three-column grid;
where the profile editor lives; how the scrapbook list is presented; the
prominence of letters and of the learning status; the size and placement of the
account id; the addition of a card preview; and new artwork for four areas.

**The single biggest source of mediocrity.** The page had no hierarchy. Every
area was a card of roughly equal weight in a fixed `auto-fit` grid, so the two
things you actually open the desk for — getting into a world and hearing from
people — sat underneath a 26-row inventory list and a duplicated settings form.
Worse, the grid *stretched* its items to the tallest neighbour, so the empty
Letters column and the half-empty Looks column were guaranteed rather than
accidental: equal-height columns can only ever be right for one of them.

**Transformation mode: `Layout Restructure`.** Not Refinement — the problem was
structure, not polish. Not Full Redesign — the identity and the flows stay.

**Design direction.** A personal account desk for a cozy paper-game player, in
the site's existing warm paper-and-crayon language, centred on *letting the two
things that matter sit at the top and putting a real door on everything else.*

---

## Main changes

### 1. Order is now an argument about importance

| Was | Now |
| --- | --- |
| Head → notice → passport card → **profile form** → doors → three equal columns → footer | Head → notice → **doors (full width)** → **card preview + at-a-glance (uneven two-up)** → signed-in strip → **tabs** → footer |

- **Your doors** moved to the top, directly under the head. Going somewhere is
  the reason the page exists.
- **Your card** — a new preview of the profile as other people see it, with
  **Update my profile** beside it, which jumps to the Profile tab.
- **At a glance** — the three status lines you asked for, in one panel:
  learning, letters, looks. Each reads as a sentence
  (`Learning Digging 2 — about 5 hours left`, `2 letters waiting`,
  `Not learning anything right now.`).
- **The passport card is gone.** It used to announce "PAPER PASSPORT CONNECTED"
  with a 36-character id as the second-largest thing on the page. The name is now
  one line in a slim strip; the id is small monospaced type inside the Account tab,
  where a receipt belongs.

### 2. Tabs, not one long page

`Scrapbook · Letters · Looks · Profile · Account`, as proper ARIA tabs (arrow
keys, Home/End, roving tabindex, `hidden` panels, focus ring). The tab lives in
the URL hash, so **Update my profile** deep-links to it, a reload lands where you
were, and Back works.

Because every panel is in the DOM from the start — hidden, not absent — the
renderers still find their hooks exactly where they always were.

### 3. The scrapbook is grouped, with roll-ups

One `<details>` per kind — Resources, Seeds, Produce, Tools, Items — each
`<summary>` carrying a roll-up (`11 kinds · 589`). The largest opens by default,
the rest stay closed, so a long inventory reads as a page of headings rather than
26 rows. Learned techniques stay their own block beneath.

### 4. The two columns are deliberately unequal, and no longer stretched

The glance row is `1.15fr / 0.85fr`, and — the part that actually matters —
`align-items: start`, so each card is its own height. Measured after the change:
card preview 421px, glance 385px, and **1px of trailing space inside each** (i.e.
neither card has a dead tail). Before, the grid would have stretched the shorter
one to 421px and left a 36px void at its bottom.

### 5. The confusing import buttons — a real bug, not just unclear copy

Both "Bring it into your account" buttons were **still on screen after the import
had already happened**, receipt line and all. The cause: the site's shared button
recipe sets `display: inline-flex`, and in CSS a `display` declaration beats the
browser's built-in `[hidden] { display: none }` rule — so `element.hidden = true`
did nothing to a button. Now fixed at the root, and the block is retitled
**"Bringing older progress in"** with copy that says plainly it is a one-time
bridge for progress made *before you had an account*, that nothing is copied
until you press the button, and that it is not needed otherwise.

### 6. Artwork for the four secondary areas

New `DeskArt.astro` — `scrapbook`, `learning` (the Professor's card-and-paperclip
idea), `wardrobe` and `mailbox` — drawn as inline SVG in the site's idiom: tokens
only so both themes work, hand-cut silhouettes with unequal corners, the
site's double-layer "sheet underneath", and exactly one crayon-coloured element
each. No emoji, no gradients, no glow.

**These are desk-side stand-ins.** You noted the in-game mailbox art is planned
but not built; when it lands, these four should be redrawn to match it. The
mailbox-beside-the-player's-house item is a **game** change, not a desk one, and
is not in this pass — see Follow-ups.

---

## Files

| File | Change |
| --- | --- |
| `site/src/pages/account.astro` | Rewritten structure, new styles, tab behaviour |
| `site/src/scripts/account.ts` | Grouped stacks, looks grid, card preview, glance lines, receipt/button fix |
| `site/src/components/DeskArt.astro` | New — the four illustrations |
| `tools/build-tech.mjs` | New — generates the technique labels |
| `site/src/data/tech.json` | New — generated (99 nodes, 7 branches) |
| `package.json` | `tech:build` script, chained into `site:build` |
| `DELIVERY/desk-art-preview.html` | Review aid — the four drawings, both themes, two sizes |
| `DELIVERY/desk-shots/` | Rendered screenshots of the new desk |

---

## Running it

```bash
cd site && npx astro dev          # http://localhost:4321/account/
npm run site:build                # regenerates tech.json, then builds the site
```

`site/src/data/tech.json` is generated and committed, like `roadmap.json`. Rename
a node in `src/sim/catalogs/techTree.ts` and the desk's learning line follows on
the next build — there is no second copy to keep in sync.

**Changing things later:** colours and spacing live in `site/src/styles/_tokens.scss`;
the desk's own layout in the `<style>` block at the bottom of `account.astro`;
what each area *contains* in `site/src/scripts/account.ts`; the illustrations in
`DeskArt.astro`.

---

## Validation

| Check | Result |
| --- | --- |
| `cd site && npx astro build` | clean, 9 pages |
| `cd site && npx astro check` | 16 pre-existing errors in unrelated files; **zero in `account.astro` or `account.ts`** |
| Rendered in Chromium at 1440 / 900 / 390, light and dark | no horizontal overflow, no console errors, all four alternate tabs open |
| Glance row heights | card preview 421px vs glance 385px — content-sized, not stretched; 1px trailing inside each |
| Mobile tab bar | all five tabs visible, none clipped |
| Mobile glance artwork | 3 illustrations render at 34px |
| Contrast, both themes, 16 new text styles | all pass WCAG AA, 4.64:1 – 14.66:1 |
| Screenshots inspected | yes — the rendered page was read back and reviewed panel by panel |

**Fixes found by this pass:** the grid was re-stretching the glance card (caught
by reading the render, not by the build); a set of my own scoped-CSS rules were
matching nothing because runtime-built elements never carry Astro's scope
attribute (caught by the renderer work, and a pre-existing instance of the same
mistake with `.mailbox__heading` was fixed with it); the glance art was hidden on
mobile; and the mobile tab bar clipped "Profile".

**Not verified:** how it looks to a person. The configured vision model returns
400 for every call in this environment, so the screenshots were read back through
the image-recognition path rather than seen. Nothing here has been clicked by a
signed-in human, and the desk's signed-in state needs Clerk — the render checks
inject representative content into the same hooks the renderers fill.

---

## Follow-ups

1. **The in-game mailbox next to the player's house.** You asked for this and it
   is a game change (`world/homeSite.ts` plus a mesh), not a desk one. The desk's
   mailbox drawing should then be redrawn to match the in-game art.
2. **Real avatar thumbnails on the desk.** The looks grid shows names and swatches;
   drawing the actual looks needs the game's renderer, which the separate Astro
   package cannot import. A small public preview-image route on the server would
   settle it.
3. **`share` the card preview with the in-game card.** `src/ui/playerCard.ts` is
   the source of truth for what a card shows; the desk's preview is a deliberate
   echo, and the two should be kept in step by hand until they share a renderer.
