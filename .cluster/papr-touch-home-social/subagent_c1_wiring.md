# Subagent C1 — Client wiring: clumps, plates, friend notes, safety

Status: complete. Additive. **No protocol change, no `PROTOCOL_VERSION` bump** (still 11).
Only the five owned files were touched; `guests.ts`, `playerCard.ts`, `friendsPanel.ts`,
`visitPanel.ts`, `styles.css`, `shared/**`, `server/**`, `site/**` were left alone.

Files owned/changed:

| File | Change |
| --- | --- |
| `src/world/neighborhood.ts` | **ADD** pure resolver `resolveHomeLot` + types (A3's layout untouched). |
| `src/world/neighborhood.test.ts` | **ADD** 5 tests for the resolver (15 → 20 tests in the file). |
| `src/world/places.ts` | **ADD** `setHomePlace(x, z)`. |
| `src/net/client.ts` | `sendFriendRequest` takes an optional `message`. |
| `src/net/sharedSession.ts` | Resolver call in the publish path, neighbour-list subscription, `blockAccount`/`reportAccount`, transport `requestFriend` forwards the note. |
| `src/main.ts` | **ADD** the `home-plate` screen interaction (priority 83), above `home-marker` (82). |

(`src/main.ts` also shows other agents' uncommitted touch-stream edits in `git diff`; the only
lines I changed are the `./net/sharedHomeVisuals` import and the `home-plate` block at ~line 336.)

---

## Exact new exported signatures

```ts
// src/world/places.ts
export function setHomePlace(x: number, z: number): boolean;

// src/world/neighborhood.ts
export type HomeAnchor = LotPoint & { accountId: string };
export type ResolveHomeLotInput = {
  selfAccountId: string;
  selfLot: LotPoint | null;
  anchors: readonly HomeAnchor[];
  origin: LotPoint;
  page: string;
};
export const KEEP_HOME_LOT = 'keep' as const;
export function resolveHomeLot(input: ResolveHomeLotInput): Lot | null | typeof KEEP_HOME_LOT;

// src/net/client.ts  (NetConnection member)
sendFriendRequest: (accountId: string, message?: string) => void;

// src/net/sharedSession.ts
export function blockAccount(accountId: string): void;
export function reportAccount(accountId: string, details?: string): void;
```

`blockAccount` / `reportAccount` are exported from `src/net/sharedSession.ts` **only** (I did not
touch `playerCard.ts`). They funnel into the same room messages the chat ⋯ menu sends:
`connection?.sendBlock(accountId)` (`ClientMessage.Block`) and
`connection?.sendReport({ accountId, ...(details ? { details } : {}) })` (`ClientMessage.Report`).
`ReportIntent.messageId` stays absent, so a report about a person needs no message. Block is
silent — nothing is broadcast and the other player is never told.

---

## The clump resolution rule as implemented

`resolveHomeLot` is a pure function of the **synced** home list plus this account's own Home
place, so two clients, a fresh joiner and a reload all agree with no round trip:

1. **Never placed** (`selfLot === null`) → `nextLot(others, origin, page)`.
2. **Our slot is claimed by another home whose id sorts BEFORE ours** →
   `nextLot(others, origin, page)` (we are the newcomer; we leave them the slot).
3. **Otherwise `KEEP_HOME_LOT`** — our slot is free, or the other claimant sorts after us and
   will yield on its own re-check.

`others = anchors.filter(a => a.accountId !== selfAccountId)` (a published anchor for our own
account is ignored). "Occupied" reuses the layout's own predicate: `!isLotFree(selfLot, [anchor])`,
i.e. exactly "a point `nextLot` would refuse to hand out". `null` means the clump is full — the
caller keeps what it has (`land-and-dwellings.md`: the next neighbourhood opens adjacent).

**Production selfLot.** The caller passes the current Home place (`{x, z}`), never `null` except
when no Home place exists. A brand-new player's Home sits on the fixed spawn, which *is* the
origin lot; passing it (rather than `null`) is what makes the id tie-break correct:

- origin free → `KEEP` (equal to `nextLot`'s origin) — a solo first player is placed exactly as
  before, untouched to the last decimal;
- origin held by an **earlier** id → we move to the next free lot (the new player joins the clump);
- origin held by a **later** id → we keep, and that holder yields on its next re-check.

`null` is therefore the "no Home place at all" branch (and the tested unassigned case). Solo play
is byte-for-byte unchanged: with no connection the resolver is never called, and an empty clump
resolves to the origin itself.

---

## The ordering-trap handling

Neighbour homes only arrive after connect, one `onHomeAdd` at a time, so a first publish can run
against an empty list. Both ends are covered:

- `publishHome()` now calls `resolveHomeLotForSelf()` **before** reading/sending the position, so
  if the list is already populated when the first publish runs (state that arrived before
  `connect()` resolved), the move happens immediately.
- `subscribeNeighborHomes(resolveHomeLotForSelf)` (registered once, next to
  `onGameStateChanged(republishHomeIfChanged)`) re-resolves on **every** change of the neighbour
  list — the actual fill-in after connect, and every later add/move/remove.

`resolveHomeLotForSelf` builds anchors from `allNeighborHomes().filter(h => h.page === page)`
mapped to `{ accountId, x, z }`, with `origin = HOME_FALLBACK_PLACE` (`-1.5, -2.2`, the same fixed
spawn/Home default — no import of `main.ts`, no cycle), and `page = getCurrentPageId()`.
The resolved lot is written with `setHomePlace(lot.x, lot.z)`, which `updateGameState`s the saved
Home place (so it survives reloads and is what other clients read) and updates the minimap marker;
`resolveHomeLotForSelf` does **not** send `set-home` itself — the resulting game-state change
republishes through `republishHomeIfChanged`/`publishHome`, so there is exactly one sender. The
sequence terminates because after the move the new lot is free of every anchor, so the next
resolve returns `KEEP`.

---

## Verify — real output

`npx tsc --noEmit`
```
(no output, exit 0)
```

`npx vitest run src/world/neighborhood.test.ts src/net/clientMatchmaking.test.ts`
(`src/world/places.test.ts` and `src/net/sharedSession.test.ts` **do not exist** in this repo, so
they were not run; they are not among the files in the tree.)
```
 ✓ src/world/neighborhood.test.ts (20 tests) 5ms
 ✓ src/net/clientMatchmaking.test.ts (3 tests) 3ms
 Test Files  2 passed (2)
      Tests  23 passed (23)
```

`npx vitest run` (whole repo)
```
 Test Files  109 passed | 1 skipped (110)
      Tests  1129 passed | 1 skipped (1130)
   Duration  5.51s
```
(`1129 = 1124 before + the 5 resolver tests added here`; the 1 skipped file is the pre-existing
`src/game/__tmp_mock_probe.test.ts` scratch file, `↓ 1 skipped`, from another stream.)

Resolver tests added: unassigned → `nextLot` (and empty clump → origin untouched); keep a free
lot whichever way ids sort; the contested-origin tie (earlier id keeps, later id moves off the
spawn); purity (own anchor ignored, order-independent); and a 5-account convergence test that
starts everyone on the fixed spawn and asserts no two settled lots are closer than `LOT_SPACING`.

---

## Could not verify / left to others

- **Two live clients / a real browser.** The plate click, the actual clump settling with two real
  accounts, and the card opening are test-and-build-suite only, exactly like the rest of
  `sharedHomeVisuals.ts`. The plate's drawing has no unit test (browser-only).
- **The other agent's halves.** `guests.ts` still declares `requestFriend: (accountId: string) => void`
  (it is unmodified right now). My transport object annotates `(accountId: string, message?: string)`
  and type-checks against both the current one-arg type and the coming two-arg one, so it lands
  cleanly either way — but until the friend-note UI side (guests.ts / friendsPanel / playerCard)
  forwards the note, only my `client.ts` + transport path carries it. I did not edit `guests.ts`.
- **The server store/handler for the note and the profile read path** are other agents' items
  (audit items 6/7); the note is now on the wire from the client but the current server still
  drops it (audit §1 ask 4).
- **The plate's page filter.** Anchors are filtered to the player's current page
  (`getCurrentPageId()`), per A3's recommendation. A neighbour marker published with `page: ''`
  (older client) is excluded and could momentarily share a slot with the origin; it self-heals
  once a page-carrying marker arrives.
