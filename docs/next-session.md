# Next Session

Written fresh at the end of each working day. Updated 2026-08-15 after the
avatar shape pipeline rework and Phase B wiring. Start here.

> **Today: the avatar stopped being a placeholder — and grew a face.** The shape library grew
> to 58 hand-drawn cutouts, the compiler learned to fit artwork drawn at any
> size in any viewBox, and the editor is now wired into the world — your
> design rasterizes onto the avatar plane, the cast shadow follows its
> outline, and the settings cog has a "Change how you look…" entry. Then
> **stamps** landed: 39 pre-drawn details you place, size, turn and flip —
> eyes and mouths that clip to the cutout, and arms, legs and hair that hang
> *outside* it. Plans: `avatar-and-identity.md` (§1.3 shapes, §1.6 stamps,
> §2.3 the closet, §7 phases) and `roadmap.md` Phase 6.

## Where things stand

- **The editor is a room now.** Full-screen studio (`.avatar-studio`):
  paper stack, work table, tool bench with three tabs — Faces / Arms & hair /
  Draw. Only the active tab's pointer interactions are wired, so a drag can
  never leave a stray stroke. The studio stops wheel/pointer/stray keys at its
  own edge and `main.ts` parks the frame loop via `isAvatarStudioOpen()` —
  that pair fixes the scroll-also-zooms-the-camera bug.

- **Avatar Phase B shipped.** `src/game/avatarLook.ts` is the one seam
  between the DOM+SVG editor and Three.js; `setAvatarTexture()` in
  `game/avatar.ts` swaps the map and re-runs `applyAlphaShadow`. First-run
  offers the editor once (`pp.avatar.firstRunDone.v1`); skipping is a real
  choice, not a postponement.
- **Shapes: one viewBox per shape, not one for all.** The compiler ignores
  the viewBox, measures the path's own bounding box, applies one uniform
  scale, centres it, stands it on a shared ground line, and *bakes* the
  transform into the coordinates (a wrapper transform would scale the
  cut-edge stroke with the shape — see `avatar-and-identity.md` §1.3).
- **The sheet is now bigger than the cutout.** `DESIGN_SHEET` 130 × 180
  around a `DESIGN_CUTOUT` of 100 × 140 — cutouts are exactly the size they
  were, and the ring around them is where appendages hang. The avatar plane
  derives its size and height from those constants, so the ground line still
  meets the terrain where it did. Done deliberately *before* Phase D: after
  designs sync it would have been a migration.
- **Stamps**: `assets/avatar-stamps/` + `npm run stamps:compile`, roles
  (`ink` / `paper` / `shadow`) recoloured from the crayon and the paper
  stock, `layer: on | behind` deciding clipped-or-not. Placement is drag
  *or* buttons — the buttons are the accessible path, not a fallback.
- 58 shapes and 39 stamps compile; `shapes.test.ts` and `stamps.test.ts`
  guard the fit, the normalization, and the layer order. 371 tests pass.
- **Not yet verified: a real browser.** The sandbox has none, so the raster
  path (SVG data URL → `<Image>` → canvas → `CanvasTexture`) has never
  actually run. That is the first thing to check on the mac.
- **Pre-existing breakage, untouched:** `PlacedPiece.ownerId` was renamed
  to `makerId` in `shared/`, but `src/sim/state.ts`, `src/sim/commands.ts`
  and `src/game/placement.ts` still write `ownerId`. Seven `tsc` errors;
  `npm run build` fails on them. Nothing to do with avatars — it is the
  tail of multiplayer Phase A.

## Do this first (any agent, in order)

1. **Fix the `ownerId` → `makerId` rename** in `src/sim/` and
   `src/game/placement.ts`, then `npm run build`. The client is writing a
   field the shared type no longer has; anything that reads maker credit is
   reading undefined.
2. **Play-test the avatar end to end on the mac.** Fresh profile (or clear
   `pp.avatar.*` and `pp.wardrobe.*` in localStorage) → first-run editor
   should open over the world → pick a shape, paper, draw → Save. Check:
   the cutout appears on the plane, the *shadow matches its outline* (not
   the old placeholder's), first person still fades it out, and reloading
   keeps the look.
3. **Review the art as a designer.** Three contact sheets now:
   `designs/avatar-template-contact-sheet.html` (shapes, with the sheet
   border, cutout box and ground line), `designs/avatar-stamp-contact-sheet.html`
   (stamps at natural size on their origin), and — the useful one —
   `npm run avatar:preview`, which composes whole avatars so layering and
   default placement are visible. `shapes:preview` / `stamps:preview` render
   PNGs if you're away from a browser. Redraw anything weak with
   `shapes:watch` / `stamps:watch` running.
   The starter stamp set is deliberately plain: mine are geometric
   stand-ins, and hand-drawn ones will look enormously better.
4. **Check the names.** Three files draw something other than what they're
   called, so `shapes.json` keys them by what they *are*: `pelicin.svg` →
   `flamingo`, `firef.svg` → `fire-badge`, `power.svg` → `raised-fist`.
   Also `prarie-dog.svg` → key `prairie-dog`. Rename the files if you'd
   rather they match; only `shapes.json` refers to them.

## Then

- **Avatar Phase C — wardrobe UI, then the closet** (`avatar-and-identity.md`
  §2.3 + §7). C1 is the panel over the existing store (`wardrobe.ts`, done,
  capped at 24): save slots, rename, duplicate, wear, delete, share toggle.
  It also has to fix the rough edge Phase B leaves — a design saved into a
  full wardrobe is *worn but not saved* with only a console warning; the
  player needs telling and a slot to replace. C2 turns the wardrobe into a
  **buildable closet** you stand in front of, displaying the looks you
  chose to share.
  Three things already decided, so don't relitigate them mid-build: tiers
  change style and how much is on display, **never capacity**; displaying
  reuses the per-design `sharedOnCard` flag rather than a second toggle;
  and the settings entry stays reachable from anywhere — the closet is the
  richer door, never the only one. C2 does not go into visitable houses
  before report/hide exists (§6.1).
- **Multiplayer Phase B — wire the slice** (`multiplayer-readiness.md`
  §Suggested sequence): wire `src/net/` into `main.ts`, run `server/`
  locally, prove two tabs see each other. The join already carries passport
  credentials via `src/net/passport.ts` → `getOrCreatePassport()`.
- Cross-dependency unchanged: avatar designs go over the wire in avatar
  Phase D, which needs multiplayer Phase B first.

## Watch out for

- `PROTOCOL_VERSION` is **2** — stale clients are refused at join, by
  design. Bump it again on any wire-shape change.
- `PlacedPiece.ownerId` was **renamed to `makerId`** and holds an
  accountId, never a sessionId. Nothing should ever store a sessionId.
- `shapes.generated.ts` is generated — edit `assets/avatar-shapes/` and
  recompile. The compiler fails loudly and specifically; read its message.
- `harp.svg` warns on 21 skipped `<line>` elements: a solid cutout cannot
  show zero-width lines, so the harp has no strings. Draw them as thin
  closed shapes if you want them.
- The editor is a modal overlay and must never register a HUD zone
  (`hudLayout.ts` owns all screen space).
- Server saves land in `server/data/` (accounts.json, room-*.json). Chat is
  deliberately not persisted (privacy default, documented in shared/).

---
