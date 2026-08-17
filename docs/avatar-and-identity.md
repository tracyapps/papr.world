# Avatars, Wardrobe, Player Cards & the Directory

How a player becomes *someone* in papr.world: drawing (or picking) a paper
cutout avatar, saving designs to come back to, being seen by others on a
player card, and controlling how findable they are. Companion to
`communal-multiplayer.md` (identity plumbing) — this is the expressive and
privacy layer on top of paper passports.

Written agent-followable like its sibling: decisions up top, conflicts each
with a fix (§6), phases with acceptance criteria (§7).

## Decisions locked (2026-08-10)

| Decision | Choice |
| --- | --- |
| Design history | **Opt-in per design.** Saved designs are private; each has a "show on my card" toggle, off by default. Others always see only your current avatar unless you share more. |
| Nostalgia IP | **Safe homage, unnamed.** "Dragon doodle (one beefy arm)" and friends — the wink lands, no infringement. No literal Trogdor/Monopoly naming. |
| Directory | **All lookup opt-in.** Nobody is findable by name until they enable it. Friend codes always work. In-world "made by —" links always work (you can already see the thing). |
| Editor tech | **DOM + SVG overlay**, not canvas-in-Three. Rationale in §1.4. |
| Drawing format | **Vector strokes**, not raster. Rationale in §2.1. |

## Decisions locked (2026-08-15)

| Decision | Choice |
| --- | --- |
| Where the wardrobe lives | **A closet you build and stand in front of**, not just a menu. The settings entry never goes away — the closet is the richer path, never the only door (§2.3). |
| Wardrobe tiers | **Presentation, never capacity.** Every player can save the same number of looks from day one; upgrades change how the closet looks and how many looks are *on show at once*. Capacity is not a wealth signal. |
| Displaying looks | **Reuses `sharedOnCard`** — one per-design consent flag, two surfaces (card and closet). No second "display publicly" toggle to disagree with the first. |
| Shape fitting | **Measured and baked, not wrapped.** Shapes are authored in any viewBox; the compiler fits by the artwork's own bounds (§1.3). |
| Stamps | **Pre-drawn details a player places** — eyes, mouths, and the arms/legs/hair that hang outside the cutout. A catalog key and five numbers on the wire; the art never travels (§1.6). |
| Sheet vs. cutout | **The sheet is bigger than the cutout.** 130 × 180 sheet, 100 × 140 cutout box inside it; the ring between them is appendage room. Done before designs sync, so it is a constant rather than a migration. |

---

## 1. The avatar editor

### 1.1 What it is — a stepped progression (updated 2026-08-10)

A full-screen overlay (same family as the help/settings overlays in
`hudMenus.ts` — `role="dialog"`, `aria-modal`, Escape closes, focus returns)
that walks the order a real scissors-and-paper craft happens in. Shape,
color, and pattern are **three separate fields, chosen shape-first**:

1. **Shape** — a searchable, sortable grid of cutout silhouettes. The first
   tile is always **"Draw your avatar"** (a big question mark). Picking it
   adds exactly one step: draw the cutout outline freehand and confirm
   ("Use this shape") before moving on. Every template maps to a collision
   `preset` (small / medium / wide / tall / wheeled / hovering) so gameplay
   never reads the art; drawn outlines default to `medium`.
2. **Paper color** — the construction-paper stock the cutout is made of.
3. **Paper pattern** — lined, graph, dot grid, torn edge...
4. **Drawing** — freeform crayon strokes on top: named palette, brush
   widths, whole-stroke eraser, unlimited undo/redo.

Going **back to change the shape resets the later choices** — the editor
warns and offers "Save to wardrobe, then change" so work is never silently
lost (the wardrobe is the "library of sorts" that makes shape-hopping safe).

The progression is also the accessible on-ramp: shape + paper is a
complete, personal avatar with zero drawing skill required. Freeform is
additive, never the price of admission.

### 1.2 Where it lives — the studio (rebuilt 2026-08-15)

Changing how you look happens in **its own full-screen room**, not in a modal
card floating over the world: a workshop with splattered walls, the paper
stack on one wall, your cutout laid out on a work table, and a bench of tools
along the other side. Two reasons, one aesthetic and one mechanical:

- **A card is too small to be a workshop.** Every palette was competing for
  one narrow scrolling column. A room lets paper, stamps and crayons spread
  out the way they would on a real table.
- **The scrollbar was fighting the game.** The overlay never stopped wheel
  events, so scrolling the palette also zoomed the camera underneath. The
  studio now stops wheel, pointer and stray key events at its own edge, and
  `main.ts` parks the frame loop entirely while it is open — the world is
  frozen and hidden, not dimmed. That is also why scrolling inside it can
  behave normally: nothing downstream is listening.

**Three tools, one at a time.** The bench has tabs — **Faces**, **Arms &
hair**, **Draw** — because dragging a stamp and drawing a stroke are the same
gesture on the same surface. Rather than guessing which you meant, the studio
asks which tool you picked up, and only that tool's pointer handlers are
attached at all. On a stamp tab, only stamps of *that tab's own layer* are
grabbable; on Draw, stamps are inert and the crayon is live. Paper colour and
pattern sit outside the tabs, always available, because picking paper never
competes with a drag.

**How you get in** is still tucked away, as originally asked: an entry in the
settings overlay ("Change how you look…"), not a persistent HUD button.
First-run is the exception — new players pass through the studio once before
entering the world. All screen-space rules defer to `hudLayout.ts`: the
studio is modal and claims no HUD zone.

### 1.3 Template library

Categories, all original art as SVG silhouettes (see IP decision):

- **Folks**: classic person, gingerbread person, paper-doll-chain person,
  round blob pal, sock puppet.
- **Shapes & doodles**: star, heart, cloud, lightning bolt, spiral,
  squiggle monster.
- **Animals**: cat, dog, bunny, duck, fish, bird, snail, frog, mushroom
  friend (honorary).
- **Board-game tokens** (generic objects, tokenly proportions): top hat,
  boot, thimble, wheelbarrow, rocking horse.
- **Nostalgia, safely unnamed**: dragon doodle (one beefy arm), paper
  airplane, origami crane, cootie catcher, twenty-sided die, cassette tape,
  rubber duck, ghost.

Each template = `{ key, label, category, spoken description, keywords,
preset, svg path }`. The spoken description matters: a screen-reader user
picking "snail — a round shell with a friendly stalk-eyed face" is
choosing, not guessing. The keywords are real search terms — the picker's
search box matches against them, label, and category.

**Shape pipeline** (added 2026-08-10): shapes are authored as individual
SVG files in `assets/avatar-shapes/` with metadata in `shapes.json`,
compiled by `npm run shapes:compile` (or `shapes:watch` while drawing) into
`shapes.generated.ts` plus the visual contact sheet in `designs/`. The
compiler validates loudly — non-geometry elements, missing keywords or
spoken text, duplicate keys, and orphaned SVGs all fail the build. Adding a
shape = drop in an SVG, add one JSON entry, recompile.

**One viewBox per shape, not one for all** (decision 2026-08-15): shapes
were originally required to be authored in a single `0 0 100 140` viewBox.
That constraint fought the library — a cassette, a flying dragon and a
flame do not share proportions, and forcing them to share a canvas meant
hand-fitting every export. The compiler now ignores the viewBox entirely
and measures the **path's own bounding box**, then applies one uniform
scale (longest side governing, so nothing is ever stretched), centres it,
and anchors it to a shared ground line so cutouts stand together instead
of floating at their own heights.

The transform is **baked into the emitted coordinates**, not shipped as a
wrapper `<g transform>`. This is the load-bearing part: a wrapper transform
would scale the cut-edge stroke along with the shape, so a small cutout
would get a hairline blade line and a big one a fat one. Baked coordinates
mean one stroke width reads identically across the whole library, and
`silhouettePathFor()` keeps returning a plain path string that the clip
path, the shadow, and the cut edge can all share.

### 1.4 Why DOM + SVG (not canvas, not in-engine)

- SVG *is* the vector model (§2.1) — the editing surface and the stored
  format are the same thing; no lossy translation.
- Accessibility is native: buttons are buttons, the palette is a labeled
  radio group, focus order is real. A canvas editor would re-implement all
  of that badly.
- It plays to the house strengths (HTML/CSS) and the existing overlay
  conventions; the 3D world neither runs nor renders while a modal overlay
  is up, so there's no frame-budget interaction.
- The world consumes the result as a rasterized texture (Phase B): design →
  SVG string → `Image` → canvas → `THREE.CanvasTexture`, cached per design
  hash. `applyAlphaShadow` (already in `render/builders.ts`) gives the
  cutout shadow for free.

### 1.5 Editor accessibility specifics

- Every control keyboard-reachable; visible focus; no drag-only actions
  (strokes are drawn by pointer, but everything *about* them — color,
  width, undo — is buttons).
- Color choices are named ("brick red"), never swatch-only; selection state
  is not conveyed by color alone (check mark + `aria-pressed`).
- Whole-stroke eraser and unlimited undo make mistakes cheap — motor
  accessibility is mostly forgiveness.
- No timers, no autosave-and-close surprises; explicit Save / Keep
  editing / Discard.
- Respects `prefers-reduced-motion` like the rest of the HUD.

### 1.6 Stamps and appendages (added 2026-08-15)

The template library got good, and immediately exposed its own gap: most of
the shapes are *abstract*. A flame, a cassette, a diamond. Giving one a face
means drawing two 3-unit eyes freehand with a pointer, which is fiddly at
best and impossible for some players — and giving one an **arm** was not
possible at all, because strokes are clipped to the silhouette. You could
never draw outside yourself.

**Stamps** are pre-drawn details a player places, sizes, rotates and flips:

- **`on` stamps** — eyes, brows, noses, mouths, cheeks, freckles, whiskers.
  Clipped to the cutout, drawn above the paper pattern and *below* the
  crayon, so a stamp is stuck down first and can be drawn over.
- **`behind` stamps** — arms, legs, feet, hair, antennae, wings. Separate
  pieces of paper glued behind the cutout, **not clipped**, each with its own
  cut edge. This layer is the whole reason the feature exists.

**Room to hang them.** Cutouts filled ~90% of the old 100 × 140 sheet, so
there was nowhere for an arm to go. The sheet grew to **130 × 180** with the
cutout box staying **100 × 140** inside it (`DESIGN_CUTOUT`); every shape is
exactly the size it was, and the ring around it is appendage room. The
avatar plane derives its size and its height above the terrain from those
constants, so the cutout's ground line meets the ground exactly where it did
before. Doing this *before* Phase D made it a constant; after, it would have
been a migration of every stored design.

**Roles, not colours.** A stamp is a few paths, each tagged `ink`, `paper`
or `shadow`. Ink takes the player's chosen crayon; paper and shadow are
derived from the paper stock the cutout is made of — so a googly eye's white
reads as the pale cut edge of a second piece of paper rather than a colour
that clashes with the stock. (Painting `paper` as the stock colour itself
makes eye whites invisible; that was a real bug, caught in review.)

**Placement is free, and equally reachable two ways.** Stamps land near
where they belong (eyes up top, feet at the ground line, arms out to the
side), then move by drag *or* by buttons — nudge, bigger/smaller, turn,
flip, forward/back, remove. The buttons are not a fallback bolted on: a
drag-only editor would exclude motor-impaired players from the only feature
that makes abstract shapes expressive.

**Moderation-wise, stamps are the good kind of UGC.** A stamp on the wire is
a catalog key plus five numbers — cheaper to validate than freehand strokes,
and re-renderable server-side exactly. §6.1 gets easier, not harder.

**Backings, decided automatically (2026-08-15).** Many silhouettes have
negative space *inside* their bounds — the gap between a frog's two eye
humps, the wells in a cassette. A clipped face that lands in one of those
holes loses part of itself, with nothing on screen explaining why. So when a
face stamp's ink would fall outside the cutout, it gets `backing: true`: a
die-cut halo of paper hugging its own silhouette, and a lift out of the clip
so the hole cannot eat it. That reads as what it is — a sticker punched out
of the same stock and stuck on top.

The decision is made in the **editor**, not the renderer: only the DOM can
hit-test a real path (`isPointInFill`), and `render.ts` is a pure string
builder that also runs for the in-world texture. The editor writes the answer
onto the stamp, so rendering stays a pure function of the design, the server
can validate it in Phase D like any other field, and a future "no, keep it
clipped" override is one line. In an environment without SVG geometry
(jsdom, anything older) it degrades to no backing — the behaviour that
existed before.

**Known trade-off (accepted):** the card's soft drop shadow follows the
cutout only, so a waving arm casts nothing on a player card. In-world it
does, because `applyAlphaShadow` derives the cast shadow from the rasterized
texture's alpha, which includes everything.

**Handled like a graphics app (2026-08-15).** A selected stamp shows a dashed
box with corner handles: drag the body to move, a corner to resize, the band
just outside to turn (shift snaps to 15°). Handles are drawn in *sheet* space
rather than inside the stamp's transform, so they stay a usable size on a tiny
eye. The old nudge/size/turn buttons are gone; what replaces them for
non-pointer use is the keyboard — arrows nudge (alt for fine), shift+arrows
resize, `[` and `]` turn, Delete removes — because precise dragging must never
be the only way to do something. What stayed as buttons is what a handle
cannot express: flip, layer order, colour, remove.

**One drawing, one place in the stack (revised 2026-08-15).** Strokes were
briefly owned by individual stamps. They are not: the drawing is a single
layer with a *position* (`drawingIndex`, counted in "on" stamps painted before
it), so a face can sit over your scribbles or under them, and moving it is the
same gesture as moving anything else. That removed a mode — there is no
"draw on this stamp" toggle, because there is nothing to choose between.

**The layers panel** is where order, visibility and deletion live: rows top-of-
stack first, the cutout pinned in the middle as a fixed row, hide and delete on
each row rather than in a toolbar elsewhere. Reordering happens *within* a
stamp's own pass, so nudging an arm up never jumps it in front of an eye.
`hidden` on a stamp (and `drawingHidden`) keeps a layer in the design while
taking it out of the picture.

**Colour on add-ons.** Every stamp takes any crayon colour: only
the `ink` role recolours, so paper and shadow stay tied to the stock and a
stamp never stops looking cut from the same pack.

**Pipeline:** `assets/avatar-stamps/` (one SVG + `stamps.json`) →
`npm run stamps:compile` → `stamps.generated.ts` + a contact sheet. Stamps
are normalized rather than fitted: longest side 34 sheet units, centred on
their own origin, so rotation and scale pivot where the player expects and
"scale 1" means the same thing across the whole set.

### 1.7 Media: crayon, watercolour, spray (added 2026-08-15)

A stroke now carries a `medium`. Crayon is opaque and flat, as before.
**Watercolour** is a wide, thin wash; **spray paint** is a speckled band. Both
are deliberately translucent, and each stroke is its own SVG element rather
than being merged — so passing over the same place twice really does deepen
it, the way it does on paper, and neither ever reaches full opacity, so the
paper's lined/graph/dot pattern keeps showing through underneath. That
layering is the effect, which is why these are separate media rather than an
opacity slider.

The speckle is one `feTurbulence` filter in `<defs>`, thresholded hard so it
reads as scattered dots instead of grey haze, shared by every spray stroke on
the sheet. A filter rather than a tiled dot pattern for two reasons: a pattern
visibly repeats along a stroke, and a filter survives the same SVG → `<img>` →
canvas rasterization that carries everything else to the in-world texture.

`medium` is omitted from the JSON when it is crayon, so nothing that existed
before this change serializes differently.

---

## 2. Data model

### 2.1 `AvatarDesign` — vector strokes, in `shared/`

```
AvatarDesign {
  version, id, name,
  silhouette: templateKey,      // custom outlines are a later phase
  paper: { color, pattern },
  strokes: [{ color, width, points: [x0,y0, x1,y1, ...] }],  // normalized 0..100
  preset,                       // collision body, derived from template
  createdAt, updatedAt
}
```

Why vectors, not a raster image: designs are ~1–10 KB of JSON (syncable over
the wire *today*), resolution-independent (crisp at any zoom), re-editable
stroke by stroke, cheap to store many of, and — important later —
*moderatable* (a server can re-render exactly what will be shown; no
steganographic raster surprises). The shared package validates and clamps
designs (`sanitizeAvatarDesign`: stroke/point counts, coordinate bounds,
color allowlist) exactly like chat and placement intents.

`AvatarRef.drawingKey` (already on the wire) becomes the design id. Until
designs sync (Phase D), remote players render the template silhouette +
paper + edge color — recognizable at a glance, no drawing data needed.

### 2.2 Wardrobe (the store)

Saved designs live client-side first (`pp.wardrobe.v1`, localStorage) and
move to account storage server-side in Phase D (they're small; `mailboxMax`-
style cap, say 24 designs). Each design carries `sharedOnCard: boolean`
(default false — the opt-in-per-design decision). Current avatar = a pointer
into the wardrobe, so "wear an old look" is one click and nothing is lost.

### 2.3 The wardrobe is a place (added 2026-08-15)

The wardrobe is not only a menu — it is **a closet you build and put in your
house**, walk up to, and open. Same store underneath (`wardrobe.ts`); the
closet is the diegetic front door to it, and the place your saved looks are
*displayed* rather than merely listed.

Why bother: "go to your closet" is a better mental model than "open a list,"
it gives the building verb something personal to make, and it turns saved
designs from inventory into a thing you show a visitor. A rotating bowtie
holder is a perfectly good reason to build a fancier one.

**What a tier changes — and what it must not.** Upgrades change the closet's
*style* and how many looks stand on display at once. They never change how
many looks you may **save**. Capacity as a progression lever would make a new
player quietly poorer at being themselves, and would put self-expression on
the wealth ladder that `economy.md` (flat prices, thin margins) and
`land-and-dwellings.md` (non-rivalrous improvement) both spend their whole
length avoiding. Fancier = *more on show*, not *more owned*.

**The closet never becomes the only door.** "Change how you look…" stays in
the settings overlay, reachable from anywhere. Requiring a walk home to
change your appearance is a travel cost dressed as flavour, and it lands
hardest on exactly the players the template-first editor exists for. The
closet is the richer path; the menu is the guaranteed one.

**Displaying is the consent flag you already have.** A look shown in your
closet is the same drawing shown on your card, so it reads the same
`sharedOnCard` boolean (default false). One flag, two surfaces. Adding a
separate "show in my closet" toggle would create two settings that can
disagree, and the failure mode of that disagreement is someone showing a
look they believed was private.

**Sequencing note.** The closet is a placed object — a `PlacedPiece` with a
`makerId`, persisted server-side today (`communal-multiplayer.md` Phase A) —
while designs themselves do not sync until Phase D. So the *furniture* can
exist and be visited before the *contents* do: a visitor sees your closet and
its tier before they can see a drawing inside it. Build it in that order and
nothing has to be un-built later.

**Open questions** (decide before building, not during):

- What does an empty-but-public closet show a visitor — nothing, a "still
  deciding" note, or the template silhouettes of hidden looks? (Prefer
  "nothing": absence should not be legible as concealment.)
- Does wearing a look from someone else's closet ever become a verb? That is
  the maker-credit and consent conversation in §6.9 — **don't back into it**.
- Do closets appear in houses that other people can enter before report/hide
  exists? Per §6.1: no. Displayed drawings are UGC in a place, which is the
  same moderation surface as a card, with worse discovery properties.

---

## 3. The player card

The one place another player learns about you. Reached only through things
that are already visible: clicking a player in-world, a chat name, "made by
—" on a piece, "house of —" on a dwelling, or a directory hit (opt-in, §4).

Card contents, v1: current avatar (large, with its paper texture), display
name, "papering since ‹month year›", and creations-nearby credit ("made 4
things on this page"). Plus any wardrobe designs the player has explicitly
shared. Later, optional fields (pronouns, a one-line bio) — each individually
optional, each off by default.

Blocked players see no card (the lookup answers exactly as if the player
had no card — "nothing to show", not "blocked you", which invites testing).
Departed players' creations show the tombstone credit
(`communal-multiplayer.md` §2.1): "made by a paper friend who moved away".

---

## 4. Directory & discoverability

What the research says (Steam/PSN/Xbox profile privacy, X/Wise/Signal
contact discovery): mature platforms converge on **granular, per-channel
"find me by" toggles**; the EU default is **opt-in**, and platforms that
default to discoverable regret it; contact-info lookup (email/phone) is done
by **hash matching that never exposes the value**, and is the single most
abused channel — Signal treats private contact discovery as an open research
problem. Friend codes (Nintendo-style: share deliberately, revocable) are
the least-leaky primitive in the industry.

papr.world model (all-opt-in decision):

- **Friend code**: every passport gets one (`PAPR-XXXX-XXXX`), regenerable
  (regenerating invalidates the old one). Sharing it *is* consent to be
  found by it. This ships first and may be all we ever need.
- **Find by display name**: off by default; a settings toggle ("let people
  find me by my name"). Names aren't unique — results are cards, and the
  asker picks; exact-match only, no browse-all-players list at any phase.
- **Find by email**: only ever after accounts are claimable
  (`communal-multiplayer.md` Phase G), only hash-matched, only opt-in, and
  the email itself is never shown to anyone. Honestly: may never be worth
  building — friend codes cover the use case.
- **"Hide me completely"**: master switch that beats every toggle, hides
  the card from directory results, and leaves only in-world presence and
  maker credits (with a per-player option to reduce those to "a paper
  friend" too — full pseudonymity in public spaces).
- Every toggle lives on the account, is enforced server-side, and defaults
  to the private end. Invite-only phase makes all of this low-stakes to get
  right before strangers exist.

---

## 5. Cutouts, shadows, and rendering notes

- The silhouette clips the paper pattern and the strokes (SVG `clipPath`);
  the same path, blurred and dark, is the card's paper shadow. In-world,
  `applyAlphaShadow` already derives the cast shadow from texture alpha —
  the rasterized design just works.
- Rasterize once per design change, cache by design hash; a room of 16
  distinct avatars is 16 small textures — nothing.
- The white "cut edge": real paper cutouts show the blade line. Render the
  silhouette with a 2–3 unit lighter outline (the existing `edgeColor`
  becomes the *drawn* outline; the cut edge is derived from paper color).
  This is the detail that sells "scissored out" and it costs one SVG stroke.

---

## 6. Conflicts & pitfalls

1. **Player drawings are UGC.** The moment designs sync, people can draw
   things at each other. Invite-only makes this survivable now, but the
   public phase needs: report-a-card, "hide this player's drawing" (falls
   back to their template silhouette — personal, instant, no adjudication),
   and server-side re-render for review. Vector strokes make all of this
   tractable. *Do not open the world before this exists.*
2. **`drawingKey` semantics are currently vapor.** The wire field exists but
   nothing resolves it. Phase D defines resolution (server stores design by
   id); until then remote fallback rendering (§2.1) must not block on it.
3. **localStorage wardrobe vs. account wardrobe** is the same split-brain as
   solo saves (`communal-multiplayer.md` §4.3): when Phase D lands, the
   device wardrobe imports to the account once, explicitly.
4. **Names on cards aren't identity.** Two players can both be "wren"; every
   card action keys off `accountId`. Never build a lookup that assumes name
   uniqueness.
5. **The editor must not touch `hudLayout` zones** — it's a modal overlay.
   Registering it as a HUD panel would fight the scrapbook dock reserve.
6. **`styles:check` forbids duplicate declarations** within a rule — mind it
   when adding the editor's CSS block to `styles.css`.
7. **Preset ≠ silhouette.** Collision preset comes from the template's
   mapping, not from measuring the drawing — a player who draws a huge
   flourish shouldn't get a huge hitbox (grief vector + fairness).
8. **Texture memory discipline** if wardrobes grow: only the *worn* design
   is ever a live texture per player; card previews are plain SVG DOM.
9. **Sharing a design ≠ licensing it.** If a future feature lets others
   *wear* shared designs, that's a maker-credit + consent conversation
   (`economy.md`'s non-fungible generosity applies). Don't back into it.

## 7. Phased plan

- **A. Editor foundation** *(started 2026-08-10)* — `AvatarDesign` +
  validation in `shared/`, template/paper/palette catalogs, working DOM+SVG
  editor module + wardrobe store in `src/ui/avatarEditor/` (repo pattern:
  real and typechecked, not yet imported by `main.ts`). ✅ when: module
  typechecks standalone; a design round-trips draw → save → reload → edit.
- **B. Wear it in-world** *(shipped 2026-08-15)* — `src/game/avatarLook.ts`
  is the only place the editor and the renderer meet: it rasterizes
  `designToDataUrl()` through an `<Image>` into a canvas, hands the result
  to `setAvatarTexture()` in `game/avatar.ts` (which re-runs
  `applyAlphaShadow`, so the cast shadow follows the new outline), wears
  the saved design on load, and offers the editor once to a player who has
  never been asked. Entry point: settings cog → "Change how you look…".
  Nothing here runs per frame — one raster per design change, cached on the
  material. ✅ your drawing walks around with a correct cutout shadow.
- **C. Wardrobe UI + the closet** (§2.3) — in two halves, in this order:
  - **C1, the panel:** save slots, rename, duplicate, wear, delete, and the
    per-design "share this look" toggle (writes `sharedOnCard`). Opened from
    the settings overlay. Also fixes the Phase B rough edge: a design saved
    into a full wardrobe is currently *worn but not saved* with only a
    console warning — the player must be told, and offered a slot to
    replace. ✅ when: switching looks is two clicks and survives reload.
  - **C2, the closet:** a `wardrobe` build piece in `buildPieces.ts`
    (solid, `overlap: 'none'`), placed like any other; walking up and using
    it opens the same panel. Tiers are separate template keys, not a level
    field — a fancier closet is a different object you build, and the
    capacity it reports is identical. Looks with `sharedOnCard` show on it;
    the rest are yours alone. ✅ when: a visitor can see the looks you chose
    to show, in your house, and nothing you did not choose.

  Do **not** ship C2 into visitable houses before report/hide exists (§6.1).
  A displayed drawing is a card's worth of UGC with better discovery and
  worse consent affordances.
- **D. Designs over the wire** — server stores designs by id (size-capped,
  validated), `drawingKey` resolves, remote players render real drawings
  with template fallback. Device wardrobe → account import. ✅ when: a
  friend sees your actual drawing, and a bad/oversized design is rejected
  server-side.
- **E. Player card** — card overlay, "made by —" / "house of —" entry
  points, tombstone credit, blocked-player behavior. ✅ when: clicking a
  creation shows its maker's card with only opted-in content.
- **F. Directory & permissions** — friend codes end-to-end, opt-in name
  lookup, master hide switch, settings UI for all of it, server-enforced.
  ✅ when: a fresh account is findable by nothing except its friend code.
