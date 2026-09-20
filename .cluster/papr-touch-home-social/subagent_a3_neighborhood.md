# Subagent A3 — Neighbourhood clump lots + address plates

Status: complete. Additive; existing tests untouched and passing. **No wire change, no
`PROTOCOL_VERSION` bump** (the address number is derived, the lot is just an x/z that
`HomeMarker` already carries).

Files changed (only the ones I own):
- NEW `src/world/neighborhood.ts` — the deterministic lot layout.
- NEW `src/world/neighborhood.test.ts` — 15 tests.
- EDIT `src/world/neighborHomes.ts` — `homeAddress()`, `NeighborHome.page`.
- EDIT `src/net/sharedHomeVisuals.ts` — the plate beside the sign, `pickSharedHomePlateAtScreen`.
- EDIT `src/world/homeSite.ts` — `homePlaceForLot()` (the one new seam).

Nothing else was touched: no `main.ts`, `playerCard.ts`, `shared/**`, `server/**`.

---

## 1. Exported API

### `src/world/neighborhood.ts` (new, renderer-free, pure)

```ts
export const LOT_SPACING = 8;            // centre-to-centre lot spacing, world units
export const LOT_POSITION_SLACK = 0.5;   // a home may sit this far off its slot and still own it
export const LOT_RING_SLOTS = 6;         // slots per ring step
export const LOT_MAX_RING = 16;          // loop guard / "the clump is full"
export const LOT_CAPACITY = 817;         // 1 + 6·(1+…+16)

export type LotPoint = { x: number; z: number };
export type Lot = LotPoint & { facing: number; ring: number; index: number };

export function nextLot(anchors: readonly LotPoint[], origin: LotPoint, page: string,
                        maxRing = LOT_MAX_RING): Lot | null;   // THE entry point
export function isLotFree(candidate: LotPoint, anchors: readonly LotPoint[],
                          spacing = LOT_SPACING): boolean;      // the spacing predicate
export function lotInRing(ring: number, slot: number, origin: LotPoint, page = ''): Lot;
export function ringSlotCount(ring: number): number;
export function slotIndex(ring: number, slot: number): number;
export function stableHash(text: string): number;               // FNV-1a, exact in every engine
```

- `anchors` = ground already taken (neighbours' Home places, and optionally any landmark or
  shop a caller wants the clump to give way to). `origin` = the page's spawn point.
  `page` = the canonical page id (`pageId(px, pz)`, `world/types.ts`); `''` means "unknown
  page / solo / test" and simply means no turn.
- `Lot` is a **place**: where the Home bookmark goes. `facing` is `homeFacing()` — every home
  in the game already turns its door at its own place, so the layout does not invent a second
  idea of facing. `index` is the lot's place in the queue (0 = origin), so "how many
  neighbours were here before you" needs no sync.
- `null` from `nextLot` means **the clump is full** — `land-and-dwellings.md`'s answer ("the
  next neighbourhood opens adjacent"), not an error path.
- Layout: origin first, then concentric rings of `6·ring` slots at radius `ring · LOT_SPACING`,
  nearest free slot first, so a full inner ring spills outward. Even rings are turned half a
  slot past odd rings so the clump does not read as spokes; the page id adds its own turn so
  two pages' clumps are not identical.

### `src/world/neighborHomes.ts`

```ts
export type HomeAddress = { accountId: string; name: string; number: number; text: string };
export function homeAddress(home: { accountId: string; name: string }): HomeAddress;
```

Plus `NeighborHome.page: string` (new field) and `NeighborHomeInput.page?: string`. `signWords()`
is byte-for-byte unchanged; no existing export changed shape.

### `src/world/homeSite.ts`

```ts
export function homePlaceForLot(lot: { x: number; z: number }): { x: number; z: number };
```

The single seam from "where the neighbourhood put you" to the `place` that `homePosition`,
`homeFacing`, `homeDoorstep` and `homeSolids` take. Today it is an identity: a lot *is* where
the Home bookmark sits. If lots ever stop coinciding with places, this is the one line that
changes — the clump then composes as `homePosition(homePlaceForLot(lot))`.

### `src/net/sharedHomeVisuals.ts`

```ts
export function pickSharedHomePlateAtScreen(clientX: number, clientY: number): HomeAddress | null;
```

`pickSharedHomeAtScreen`, `addSharedHome`, `removeSharedHome`, `clearSharedHomeVisuals`,
`sharedHomeCount`, `SharedHomeHit` all keep their existing signatures and behaviour.

---

## 2. The spacing constant: `LOT_SPACING = 8`, and why

Derived from what a home actually claims, not picked for looks:

| quantity | value | source |
|---|---|---|
| house body radius | 1.25 | `homeSite.HOME_BODY_RADIUS` |
| annex reach + annex radius | 1.75 + 0.95 = **2.7** from the house middle | `HOME_ANNEX_REACH`, `HOME_ANNEX_RADIUS` |
| two fully grown houses, worst alignment | 2.7 + 2.7 = **5.4** just to stop touching | — |

5.4 would leave **none of the usable gap** `land-and-dwellings.md` insists on (the gap is the
protected thing, and it must stay walkable, plantable, decoratable). A display case claims
about a metre of ground and a walker needs about half of one. **8 → 2.6 of clear ground
between annex walls in the worst-angled pair** (measured: the closest pair of slots in the
first five rings is 7.9995).

The 1.25-radius walker body and the 2.6 gap also mean two neighbours never merge into a
terrace, while 8 is small enough that they still read as neighbours.

**`LOT_POSITION_SLACK = 0.5`**: `HomeSchema` sends x/z as 32-bit floats, so a neighbour's home
arrives a few millionths off the slot it was given. Half a unit absorbs that with enormous
margin and is still far too small to squeeze two real neighbours closer than 7.5 (a worst-case
gap of 2.1 — still more than the 5.4 two grown houses need). It also keeps the honest case
right: a home that *moved* off the grid blocks whatever slot is genuinely near it.

**`LOT_RING_SLOTS = 6`**: a ring's own lots come out `2·k·S·sin(π/6k)` apart — exactly `S` on
ring 1, slightly more further out — so a ring can never crowd itself, and the step alone does
all the spacing. Measured over rings 0–4 (61 slots): closest pair 7.9995 ≥ `LOT_SPACING`.

**`LOT_MAX_RING = 16`** (817 lots, 128 units of radius) is a loop guard, not a policy: far past
what one 50-unit page (`world/types.ts`) will hold. Its meaning is the design answer — past it,
`nextLot` returns `null` and the next neighbourhood opens adjacent rather than densifying.

---

## 3. Determinism

**Guarantee.** `nextLot` is a pure function of `(anchors, origin, page, maxRing)`. It stores
nothing, reads no clock, no RNG, no module state, and does not mutate its inputs. Two clients
and the server that are given the same taken ground name the same lot **without syncing a lot
number or an index**.

Two details that make that hold across engines/machines:

1. **Only exact integer arithmetic feeds the shape of the answer.** The page turn and the
   address number come from `stableHash` (FNV-1a over `charCodeAt`, `Math.imul` — exact and
   defined, unlike `**`/float tricks). No `Date`, no `Math.random`, no locale.
2. **Positions are quantised to thousandths** (`round3`). `Math.cos`/`Math.sin` are allowed to
   differ in the last bit between engines, so the answer is rounded far coarser than that
   difference: two machines compare lots with `===`, not leniently. And the **first lot is the
   origin itself, returned untouched** — a solo player's home stays exactly where it has always
   been, to the last decimal (this is why `initializePlaces(SPAWN_X, SPAWN_Z)` behaviour is
   preserved for one player alone).

**How it is tested** (`src/world/neighborhood.test.ts`):

- same inputs twice, and the **same anchors in reverse order**, give a deeply equal lot;
- inputs passed **frozen** (`Object.freeze` on both the array and the origin), so a stray write
  would throw instead of quietly changing what the next caller is handed;
- the empty neighbourhood gives the origin **exactly** (`toEqual({ ...ORIGIN, facing, ring: 0, index: 0 })`);
- the full sweep `fill(8)` yields `ring/index` pairs `[0,0] [1,1]…[1,6] [2,7]`, i.e. inner ring
  filled before spilling, and `lot.index === its position in the queue`;
- an already-taken slot is **skipped** (`[origin, ring1#0]` → `ring1#1`);
- a neighbour **not on a slot** (a moved home 5 units from the origin) pushes the sweep outward
  rather than crowding them;
- **every pair of the first 61 slots is ≥ `LOT_SPACING`** on three different pages (the page
  turn must not break spacing);
- a page id turns that page's clump and never moves the origin; the same page twice is equal;
- `nextLot(..., maxRing = 0)` returns the origin while free and `null` once it is taken, and
  `LOT_CAPACITY === 1 + 6·(1+…+LOT_MAX_RING)`;
- `isLotFree` answers the rule directly: exactly `LOT_SPACING` away is free, a home on the same
  point is not, and `NaN`/`Infinity` anchors are ignored so one bad record cannot wall off a page.

Real first clump on page `0,0` from `origin (-1.5, -2.2)` (probe run, `vite-node`):

```
(-1.5, -2.2) r0#0  (6.483, -1.673) r1#1  (2.035, 4.977) r1#2  (-5.948, 4.449) r1#3
(-9.483, -2.727) r1#4  (-5.035, -9.377) r1#5  (2.948, -8.849) r1#6  (13.648, 2.951) r2#7 …
slots in 5 rings: 61   closest pair: 7.9995 (r1#1 to r1#6)   spacing: 8
```

---

## 4. The address plate

**Text format: `No. 12 · Wren`** — `No. ` + number + ` · ` (U+00B7 middle dot) + the owner's
display name. `number` is `1 + (stableHash(accountId) % 99)`, i.e. **derived from the account
id alone**:

- it is identical on every client with nothing stored, nothing synced, and no lot record to look
  up (the wire has no lot index, and this needs none);
- it **survives a rename** — the house keeps its number when the owner changes their name;
- two homes may share a number; nobody files by it.

`HomeAddress` exposes `accountId` and `name` precisely so a click can open the card:
`openPlayerCardFor({ accountId: address.accountId, name: address.name, drawingKey: '' })`.
The plate shows only the display name, which the sign and the avatar already show in public;
blocks are enforced where they always were, by the card request itself (`found: false`).

**Drawn** (`sharedHomeVisuals.ts`): its own short stake (0.62 tall) on the far side of the door
from the sign, local `(1.15, 1.7)` — clear of the tent body (2.05 > 1.25), of the annex room at
local `(1.75, 0)` (1.80 > 0.95) and of the sign's board (2.45 away), and 1.17 from the doorstep
so a visitor is not walking into it. Same paper-cutout style as the sign (`rgba(247,241,222,.96)`
board, `rgba(74,61,43,.75)` edge, Georgia serif), one size down (320×128 canvas → 1.02×0.41
world units at y 0.52): the number in `#8a5a2a` over the name in `#3f3428`. The plate **never**
changes with the open-house state — an address does not. The sign is untouched (its canvas,
colours, stripes, size and y are unchanged; only the shared texture/sprite boilerplate moved
into a `boardSprite()` helper).

Housekeeping: the two post geometries are now in a `sharedGeometries` set so `disposeGroup` does
not dispose them when one home is removed (the plate added a second shared geometry, and the old
`!== postGeometry` guard would have torn down the plate post for everyone).

---

## 5. Verify (real output)

```
$ npx tsc --noEmit
(exit 0)
```

```
$ npx vitest run src/world/neighborhood.test.ts src/world/neighborHomes.test.ts src/world/homeSite.test.ts

 RUN  v4.1.10 /Users/tapps/Library/CloudStorage/Dropbox/work/custom-work-tools/games/pencil-and-paper

 ✓ src/world/homeSite.test.ts (6 tests) 3ms
 ✓ src/world/neighborHomes.test.ts (9 tests) 3ms
 ✓ src/world/neighborhood.test.ts (15 tests) 5ms

 Test Files  3 passed (3)
      Tests  30 passed (30)
   Start at  17:14:46
   Duration  125ms (transform 87ms, setup 0ms, import 121ms, tests 11ms, environment 0ms)
```

Whole repo, for the record:

```
$ npx vitest run
 Test Files  109 passed | 1 skipped (110)
      Tests  1124 passed | 1 skipped (1125)
```

(Two transient failures seen mid-run at 17:14 came from another work stream's in-flight edits and
cleared on the next run; no test of mine or of the files I touch failed at any point. An earlier
`npx tsc --noEmit` run showed one error in `src/game/__tmp_dep.ts`, another stream's untracked
scratch file, since removed; it never named a file I own.)

---

## 6. Wiring left for the integration step

Nothing outside my file list was touched, so these are the exact seams. All of round 2's items
belong to **B1 (client social)** unless marked otherwise.

1. **Who assigns the lot — the one real decision left.**
   *Recommended, no protocol change:* the **server** assigns, because
   `land-and-dwellings.md` makes spacing a rule both sides enforce and the server the authority.
   In `server/src/rooms/PaperRoom.ts` → `handleSetHome(client, msg)`, when
   `this.state.homes.get(player.accountId)` does **not** exist yet: build `anchors` from the
   homes already in `this.state.homes` whose `page === intent.page`, take `origin` from the
   page's spawn, call `nextLot(anchors, origin, intent.page)`, and store that lot's x/z instead
   of the client's. Use `isLotFree(intent, anchors)` as the validation half for a home that
   already exists (a moved house).
   ⚠️ `server/` cannot import `src/`: the layout must move to `shared/src/world/neighborhood.ts`
   for this (a `shared/**` owner's edit). Its only client-side dependency is
   `homeFacing()` — the shared copy should drop the `facing` field (or inline
   `Math.atan2(-HOME_OFFSET.x, -HOME_OFFSET.z)`), and the client can keep adding it.
   *Client-side alternative* (round-trip free but trusts the client): in
   `src/net/sharedSession.ts` → `publishHome()`, before `sendSetHome`,
   ```ts
   const page = getCurrentPageId();
   const anchors = allNeighborHomes().filter((h) => h.page === page).map((h) => h.place);
   const lot = nextLot(anchors, { x: SPAWN_X, z: SPAWN_Z }, page);   // SPAWN_X/Z: src/main.ts
   ```
   and write `homePlaceForLot(lot)` into the Home place (that write is a `world/places.ts` /
   `main.ts` change, which is why I left it). Note the ordering trap: the neighbour list only
   arrives over `onHomeAdd`, so this must run *after* the room's homes land, not on connect.

2. **`NeighborHome.page`** is new and already populated from `HomeMarker.page` — use it to build
   the per-page anchor list in (1). Existing consumers are unaffected (optional input, `''`
   default).

3. **The plate opens the card**:
   ```ts
   const address = pickSharedHomePlateAtScreen(x, y);
   if (address) { openPlayerCardFor({ accountId: address.accountId, name: address.name, drawingKey: '' }); return true; }
   ```
   Register it in `src/main.ts`'s `registerScreenInteraction` **above** the existing
   `home-marker` (priority 82) entry, e.g. a `home-plate` interaction at 83 — otherwise the house
   and the sign catch the click first and open the door panel. (`visitPanel.ts`'s existing
   `act === 'card'` branch can equally feed `homeAddress(home)`.)
   Without this, the plate is already clickable-through, exactly like the sign and the house.

4. **Words, not just paper**: `game/guestsUi.ts` / `game/visitPanel.ts` can add
   `homeAddress(home).text` to the doorway line, so a screen reader hears the address the way it
   hears the sign (`house-and-home.md`: "Every sign is also text").

5. **Set pieces.** The clump only dodges what the caller passes as `anchors`. When shops,
   landmarks and water join the spacing rule (`land-and-dwellings.md`: "houses join that list"),
   the caller adds them to the same array — no change to the layout module.

6. **Not done, by design.** No `startinglots` on the wire; no lot index in `HomeMarker`; no
   `PROTOCOL_VERSION` change; the plate's drawing has no unit test (browser-only, like the rest
   of `sharedHomeVisuals.ts`) — the numbers to eyeball are in §4.
