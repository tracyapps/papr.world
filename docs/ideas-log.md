# Ideas Log

A running log for "omg, log this" moments. Not commitments — a place where ideas can't escape. Newest at the top.

## 2026-07-30

### Animal Shopkeepers

- Woodchuck lumber yard built around the giant school paper cutter. Working names: Wouldchuck Yard, The Grain & Guillotine, Chuck's Cut & Crease.
- Crow junk yard for salvage, duplicate-material trades, oddments, and Thing Maker parts. Working names: Crow & Found, The Re-Nest, Odds & Caws.
- Rabbit garden shop for seeds, fiber, dyes, soil blends, and planting plans. Working names: Bun & Bloom, The Root Fold, Hareloom Garden.
- Shops are ongoing characters with conversations and favors, not vending machines. The complete economic role for each is in `docs/tool-and-supply-progression.md`.

## 2026-07-16

### Saw Mill = Giant School Paper Cutter

A "saw mill" building for turning trees into usable lumber — but it's a giant version of the classroom paper cutter (the guillotine kind with the big swing arm and the grid ruled into the bed).

- Feed a gathered tree in, pull the enormous arm, get cardstock planks/lumber strips out.
- The arm swing wants a deeply satisfying *SHUNK* sound and a paper-edge flutter.
- The safety guard should be comically oversized, because everyone remembers the teacher warnings.
- The ruled grid on the cutting bed can double as a UI for choosing plank sizes (cut at the 3, cut at the 5...).
- Fits the Thing Maker family: big charming machine with a personality; maybe it's nervous around the squirrels.
- Output: `lumber` material type for building pieces (floors, beams, fences), distinct from raw paper scraps.

### Zoom-into-first-person (implemented same day — testing)

Zooming all the way in doesn't switch views; it *becomes* the paper potato. Below ~3.4 units of camera distance, the orbit framing blends continuously into an eye-level view just behind the avatar's face; the cutout fades out on the way in (its ground shadow stays — you're still paper). Pitch becomes look up/down when fully zoomed. Blend knobs: `FIRST_PERSON_BLEND_START`, `MIN_DISTANCE`, `EYE_HEIGHT` in `src/game/camera.ts`. If it doesn't feel right in testing, raising `MIN_DISTANCE` back to ~4.4 disables it entirely.

### Parking lot (earlier ideas already in flight elsewhere)

- Critter friendship/pet progression: see `critter-design.md` (levels, verbs, multiplayer scaling).
- Squirrel tree-climbing returns as a forest-page flourish: noted in `critter-design.md`.
- Skyline SVGs with edges that taper to transparent so overlapping backdrop cutouts never show a vertical cut: noted in `prototype-progress.md`.

## 2026-08-03

### World map elevation overlay

`elevationBandAt(x, z)` already returns 0..1 across the whole world, so the
map can shade highlands and lowlands with no new simulation — just a colour
ramp over explored cells. Worth pairing with the layer switching that
`docs/mining-and-caves.md` needs, since both are "the map shows more than one
kind of information about a place".
