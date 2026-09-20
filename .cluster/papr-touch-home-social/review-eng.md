# Engineering review — `papr-touch-home-social` (uncommitted change set)

**Overall verdict:** Wire claim is right (fully additive, no `PROTOCOL_VERSION` bump needed), clump determinism/termination and the touch core hold up under reading — but the change set ships one real latent break (a new `playerCard ↔ sharedSession` import cycle), one client-authoritative griefing vector in the home clump, and a large surface of "works in theory, no test, no browser proof."

## Tree state — MOVING TARGET (read before trusting "tree green")
The tree was green when this review began, and turned red *during* it. A second, concurrent workstream (the custom-shape/`polygon-clipping` cutout editor) landed into the same working tree while I reviewed:
- new files `src/ui/avatarEditor/shapeGeometry.ts`, `shared/src/protocol/avatarShape.test.ts`;
- modified `shared/src/protocol/avatarDesign.ts`, `docs/touch-and-tablet.md`, `package.json`, `package-lock.json`.

At review end `npx tsc --noEmit` **fails**: `src/ui/avatarEditor/shapeGeometry.ts(18,29): error TS2307: Cannot find module 'polygon-clipping'…` — the dep is declared in `package.json:39` and `package-lock.json` but **not installed** (`node_modules/polygon-clipping` is missing). So the "all landed, tree green" premise no longer holds for the working tree; whatever is committed must be re-greened first. This review's findings are about the touch/home/social change set (the 27 files in the original task list) and are unaffected by that workstream, except that `shared/src/protocol/avatarDesign.ts` now appears in `git diff shared/` and is classified in §1b.

## Environment checked
- `npx tsc --noEmit` at review start → **exit 0**; at review end → **FAIL** (concurrent shape-editor work, above).
- `npx vitest run` (root) at review start → **1150 passed, 110 files, 1 skipped, exit 0** (proven-by-run).
- `cd server && npx vitest run` → **167 passed, 18 files, exit 0** (proven-by-run).
- No gameplay e2e/browser tests exist (playwright is only used by `tools/build-og.mjs` etc.), so nothing in this change set has browser proof (proven-by-run: file search).

---

## Findings

### F1 — MAJOR (latent BLOCKER): new `playerCard ↔ sharedSession` import cycle, masked by `main.ts` import order
- **Where:** `src/ui/playerCard.ts:28` (`import { blockAccount, reportAccount } from '../net/sharedSession'`) and `src/net/sharedSession.ts:32` + `:724` (`import { handlePlayerCardResponse, setPlayerCardRequestHandler } from '../ui/playerCard'`, then a **top-level** call `setPlayerCardRequestHandler(requestPlayerCard)`).
- **What is wrong:** `playerCard.ts` now imports the module that already imports it, closing a cycle. `sharedSession` mutates playerCard's `let requestCardHandler` (`playerCard.ts:90`) at module-evaluation time (`sharedSession.ts:724`). Under ESM, whichever module is evaluated **first** wins:
  - `sharedSession` first → it pulls playerCard in, playerCard finishes, then line 724 assigns → fine.
  - `playerCard` first → playerCard hits its import at line 28, sharedSession runs to line 724 while playerCard is still mid-body, and assigning the not-yet-initialized `let` throws **`ReferenceError: Cannot access 'requestCardHandler' before initialization`**.
  Today `main.ts` happens to reach `sharedSession` first via `src/main.ts:9` → `src/game/avatarLook.ts:24` (`import { publishWornDesign } from '../net/sharedSession'`), which is evaluated before `src/main.ts:41` (`ui/playerCard`). Nothing documents or enforces that; reorder two imports in `main.ts`, or add any new entry/import edge that pulls `playerCard` in first, and the game dies at boot.
- **Proven-by-run:** I loaded the real modules through Vite's SSR module runner (`/tmp/cycle-probe8.mjs`, `/tmp/stub-context.ts`, `/tmp/dom-shim.mjs`; no repo files touched):
  - `playerCard` first → `THREW: Cannot access 'requestCardHandler' before initialization` at `playerCard.ts` `setPlayerCardRequestHandler`.
  - `sharedSession` first → `LOADED OK`.
  Exactly the reported failure.
- **Fix (minimal, idiomatic, uses the file's own seam):** remove the *cycle*, not the order. The offending import is the only new `playerCard → sharedSession` edge:
  1. `playerCard.ts`: delete line 28. Add a second injection point mirroring `setPlayerCardRequestHandler`:
     ```ts
     type PlayerCardSafetyHandlers = {
       block: (accountId: string) => void;
       report: (accountId: string, details?: string) => void;
     };
     let safetyHandlers: PlayerCardSafetyHandlers | null = null;
     export function setPlayerCardSafetyHandlers(next: PlayerCardSafetyHandlers | null): void {
       safetyHandlers = next;
     }
     ```
     and call `safetyHandlers?.block(...)` / `safetyHandlers?.report(...)` where `renderSafetyActions` currently calls the imports (`playerCard.ts` block/report handlers).
  2. `sharedSession.ts`: at the existing top-level injection site (`:724`), add `setPlayerCardSafetyHandlers({ block: blockAccount, report: reportAccount });` (import it from `../ui/playerCard`). With the cycle gone, sharedSession always fully evaluates playerCard first, so this assignment — and the already-present `setPlayerCardRequestHandler` one — can never hit the TDZ.
  - Do **not** "fix" this by pinning `main.ts` import order; that is the fragility, not the cure.
  - Note `friendsPanel.ts:11` and `visitPanel.ts:11` may keep importing `blockAccount/reportAccount` from `sharedSession` — those edges are not part of the cycle.

### F2 — MAJOR: the home clump is client-authoritative → one client can force others off a lot (griefing), and no server checks the published spot
- **Where:** `src/world/neighborhood.ts:270-284` (`resolveHomeLot`, the `accountId < selfAccountId` yield at `:281-282`), `src/net/sharedSession.ts:645-666` (`resolveHomeLotForSelf`, the only place it runs), `server/src/rooms/PaperRoom.ts:1077-1098` (`handleSetHome` stores any finite `x/z` + client-supplied `page` with no position/page validation), `shared/src/protocol/validate.ts:323-333` (`sanitizeSetHome` only checks finiteness + truncates `page`).
- **What is wrong:** `resolveHomeLot` runs *only in the client*, and it yields to any anchor whose `accountId` sorts lower. The server accepts a `set-home` at arbitrary coordinates on an arbitrary page. So a modified client can publish a Home on a specific neighbour's lot, then simply never honour its own `KEEP/yield` result (the rule is client-side, so it can be skipped). If the griefer's `accountId` is lower than the victim's, the victim's honest client sees a lower-id anchor inside its slot (`isLotFree(selfLot,[anchor]) === false`) and re-lots itself; the griefer re-publishes on the new spot and the victim is displaced again, indefinitely. The griefer is never pushed because it has the lower id (higher-id neighbours only ever yield *to* it).
- **Not a determinism bug:** the yield is strictly one-directional (`<`, and ids are unique), so two honest clients can never yield to each other; for a fixed anchor set the process is monotone (lowest-id home on a contested slot always keeps), so it terminates. `neighborhood.test.ts` "settles a clump…" (5 ids) and "gives an unassigned player the next free lot" support this. The defect is purely trust: the "tie-break" is enforceable only by the honest client that is losing.
- **Secondary, benign inconsistency:** `resolveHomeLotForSelf` tags `page = getCurrentPageId()` (`sharedSession.ts:648`) while the origin is the fixed spawn `HOME_FALLBACK_PLACE` (`sharedSession.ts:661`, `homeSite.ts:13`, which is on page `0,0`). A home published while its owner stands on another page is tagged with that page but sits at spawn coords, so it becomes clump ground for a page it is not on. Low impact, but the page/origin choices don't agree.
- **Concrete fix:** make the lot server-authoritative. In `handleSetHome`, derive the account's lot from the room's own `state.homes` via `nextLot`/`resolveHomeLot` and reject (or overwrite) any `set-home` whose `x/z` is not within `LOT_POSITION_SLACK` of the assigned lot; also rate-limit position changes. Failing that, at minimum stop treating a client-supplied position as an authority for *displacing another account*, and document the exposure.
- **Proven-by-reading** (no run needed): the rank/trust chain above is directly from the listed lines.

### F3 — MINOR: ghost pointers are never reaped, so a lost `pointerup` can silently turn single-finger orbit into pinch
- **Where:** `src/game/input.ts:110` (`trackedPointers`), `:152-165` (`dropPointer`), `:483-495` (pointermove self-heal clears `pendingPrimary` only), `:497-510` (pinch branch keyed on `trackedPointers.size > 1`).
- **What is wrong:** `trackedPointers` is only emptied on `pointerup`/`pointercancel`/`blur`/HUD-capture. A touch that ends off-window (no `pointerup` observed) leaves a ghost entry; `size` then reads 2 forever, so every single-finger drag enters the pinch branch and yaw/pitch orbit stops working until reload. `pendingPrimary` has a self-heal in pointermove; `trackedPointers` has none. Low probability, high confusion.
- **Fix:** in the pointermove self-heal, drop a tracked pointer whose `buttons` is 0 (or whose `pointerType === 'touch'` and it is no longer producing events), and/or listen for `lostpointercapture`/`pointerout` to call `dropPointer`. Proven-by-reading.

### F4 — MINOR: leftover scratch probes shipped in the tree; one is counted as the "1 skipped" test
- **Where:** `src/game/__tmp_dep.ts`, `src/game/__tmp_mock_probe.test.ts` (both untracked, self-labelled "SCRATCH FILE — safe to delete"); root run reports `1150 passed | 1 skipped`.
- **What is wrong:** throwaway probe files are part of the change set and one adds a skipped test to the suite. Delete both before commit. (The files' own comments say the sandbox refused `rm`; they're still not committable.) Proven-by-reading.

### F5 — MINOR (test fragility): `input.test.ts` mock of `./settings` is now incomplete
- **Where:** `src/game/input.test.ts:15` (`vi.mock('./settings', () => ({ getSetting: () => 'grab-world' }))`), `src/game/input.ts:5` (new `import … from './touchControls'`), `src/game/touchControls.ts:2` (`onSettingsChanged`).
- **What is wrong:** `input.ts` now transitively imports `touchControls`, which imports `onSettingsChanged` from `./settings` — a name the mock doesn't provide. Harmless today because nothing calls it during import, but any top-level `onSettingsChanged` in `touchControls` would blow up inside input's tests with a confusing "not a function". Add `onSettingsChanged: () => {}` to the mock. Proven-by-reading.

### F6 — INFO: `ClientMessage.SetProfile` is dead wire surface
- **Where:** `shared/src/protocol/messages.ts:117,235,261`, `server/src/rooms/PaperRoom.ts:280-282,1265+` (`handleSetProfile`).
- No client anywhere sends `set-profile` (file search under `src/` and `site/` is empty); writes actually go over `POST /account/profile` (`site/src/scripts/account.ts:839`). It is additive and harmless, but it is untested and currently unreachable — either wire the game client to it or note it as reserved.

### F7 — INFO: no `PROTOCOL_VERSION` bump needed — claim verified (details in §1). Deliberately no bump; the cost is that a new client silently loses profiles/notes against an old server (accepted by the precedent, but unpinned by any test).

---

## 1. Wire back-compat classification (`git diff shared/`, hunk by hunk)

| Location | Change | Classification | OLD client → NEW server | NEW client → OLD server |
|---|---|---|---|---|
| `shared/src/index.ts:8` | `export * from './protocol/profile'` | new export, no wire | n/a | n/a |
| `shared/src/protocol/constants.ts:105` | `LIMITS.friendRequestMessageMax` | new key | ignored | ignored |
| `shared/src/protocol/constants.ts:122,124,126` | `bioMax`, `socialLinksMax`, `socialUrlMax` | new keys | ignored | ignored |
| `shared/src/protocol/guests.ts:119` | `FriendRequestRecord.message?` | **new optional field** | extra JSON field ignored | absent → note not shown |
| `shared/src/protocol/guests.ts:131` | `FriendRequestIntent.message?` | **new optional field** | absent → request stored with no note | extra prop simply unread |
| `shared/src/protocol/messages.ts:117` | `ClientMessage.SetProfile = 'set-profile'` | new key (string enum, no ordinal shift) | never sent by old client | old server has no handler → message dropped silently |
| `shared/src/protocol/messages.ts:235,261` | `SetProfileIntent` + `ClientPayloads` entry | new type/mapping | n/a | n/a |
| `shared/src/protocol/messages.ts:399,401,403` | `PlayerCardInfo.bio?/links?/relationship?` | **new optional fields** | extra JSON fields ignored | absent → card renders no profile |
| `shared/src/protocol/validate.ts:29` | `stripControlChars` made `export` | visibility only; **no behaviour change** | n/a | n/a |
| `shared/src/protocol/validate.ts:88` | new `sanitizeFriendRequestMessage` | new function | n/a | n/a |

**No hunk changes the meaning or shape of an existing field.** All values are additive; `ClientMessage` uses string literals (no numeric drift).

### 1b. `git diff shared/` hunks that appeared *during* the review (concurrent shape-editor workstream)

| Location | Change | Classification |
|---|---|---|
| `shared/src/protocol/avatarDesign.ts:54,56` | `DESIGN_LIMITS.maxShapePieces/maxShapeAnchors` | new keys, additive |
| `shared/src/protocol/avatarDesign.ts:98-155` | `ShapeOp`/`ShapePiece`/`CustomShape` types + `sanitizeCustomShape` | new types/function, additive |
| `shared/src/protocol/avatarDesign.ts:230` | `AvatarDesign.customShape?` | **new optional field**, additive |
| `shared/src/protocol/avatarDesign.ts:390,405` | custom-silhouette degrade path | **behaviour change**, *not* purely additive |

The last row is the one to watch: the old sanitizer degraded an unusable `customOutline` to `silhouette:'round-pal'`; it now stays `'custom'` when a new `customShape` is present (`if (!customOutline && !customShape) silhouette = 'round-pal'`). For an **old client's** input this is unchanged (it never sends `customShape`), and an **old client receiving** such a design sees no `customShape` and (re-sanitizing with its own old code) degrades it to a template — so it still degrades gracefully and needs no version bump. But it is a genuine change to what the server *emits* for new-client input, so it is **not** in the same "purely additive" class as the profile/touch work, and it landed with the tree red. Out of scope for the 8-agent set, flagged for the record.

**No hunk changes the meaning or shape of an existing field.** All values are additive; `ClientMessage` uses string literals (no numeric drift). The server gate is exact equality (`PaperRoom.ts:182`, `options.protocol !== PROTOCOL_VERSION → 'bad-protocol'`), so leaving the version at 11 keeps old/new interoperating, and every new capability degrades gracefully in both directions. **The "no bump needed, following the wear-design precedent" claim is correct** (the precedent itself is asserted in `docs/address-plates-and-profiles.md:225-228`). Caveat worth stating in delivery: against an old server a new client silently loses profiles and friend-request notes (no error, no test asserting the degradation).

---

## 3. Clump determinism & griefing (detail)

- **Deterministic from synced state: yes.** `resolveHomeLot` is a pure function of `{selfAccountId, selfLot, anchors, origin, page}` (`neighborhood.ts:270`); `selfLot` is each client's own saved place, `anchors` come only from synced home markers, `origin`/`page` are constants. Tie-break compares account-id strings, which every client reads the same. Proven-by-reading + `neighborhood.test.ts` purity tests.
- **Oscillation: no.** The yield test is a strict `<` on unique ids (`neighborhood.ts:282`), so A-yields-to-B and B-yields-to-A cannot both hold. Positively fixed-pointing.
- **Termination: yes, for honest clients.** Monotone: the lowest-id home on a contested slot never moves; each move strictly reduces contested homes. Supported by `neighborhood.test.ts` "settles a clump with no two homes resolved onto the same lot". Concurrent same-lot collisions resolve in one extra round (both compute the same `nextLot`, then the higher id yields again). **Griefing breaks this in practice** — see **F2**.
- **`page: ''` griefing:** a `''`-tagged marker is filtered out of the anchor set on any real page (`sharedSession.ts:649-650`), so it cannot displace anyone; it can only visually overlap. Not a displacement vector.
- **"Solo play unchanged (first lot == origin exactly)": true.** `lotInRing(step 0)` returns `origin.x/origin.z` verbatim, no rounding, no turn (`neighborhood.ts:139-140`); `nextLot([], origin, page)` is the identity lot; and `resolveHomeLotForSelf` early-returns with no connection (`sharedSession.ts:646`), so solo never even moves the place. Proven-by-reading + `neighborhood.test.ts` "gives the first lot to the origin itself, untouched".

## 4. Touch regressions (detail)

- **Keyboard/gamepad/orbit with touch off: unchanged.** `setVirtualMovement` is only fed by the pad; `applyVisibility` calls `releasePad()` when disabled (`touchControls.ts:328-334`), which zeroes the virtual stick (`:234-239`), so the keyboard/gamepad paths in `getMovementInput` (`input.ts:224-252`) are byte-for-byte the old behaviour. The HUD-press branch now calls `dropPointer(id)` instead of `clearPointerGestures()` (`input.ts:394-399`), which is identical for the single mouse pointer.
- **Pinch/orbit coherence: coherent.** A second finger landing clears `isOrbiting`/`orbitButton`/`orbitPointerId`/`pendingPrimary` and sets the pinch baseline (`input.ts:404-416`); only the owning pointer may steer the orbit (`:527`); a lifting finger recomputes the pinch baseline so a 2→3→2 finger count never jumps (`dropPointer:152-165`). 3+ fingers are ignored.
- **Unit clamp with three sources: yes.** The radial normalize at `input.ts:254-258` still runs after keys + virtual stick + gamepad, so summed sources cap at unit speed.
- **`-0`/`+0`: fixed.** `noNegativeZero` on both axes of `padOffsetToMovement` and on `pinchZoomDelta` (`touchControls.ts:29,84-86,129`).
- **Listener leak on setting change: none.** `onSettingsChanged(applyVisibility)` is registered only inside `if (!elements)` (`touchControls.ts:379-382`), i.e. once.
- Residual: **F3** (ghost pointer) and **F5** (test mock).

---

## 5. Honest "no test, no browser proof" list

Every item below is claimed by the change set but has **no automated test and no browser run** in the repo:

1. `src/game/input.ts` multi-pointer logic: `orbitPointerId` ownership, `trackedPointers` add/drop, the pointermove pinch wiring, "second finger ends the orbit", 3+ fingers ignored. (`input.test.ts` exercises only click-vs-drag with one mocked `pointerId`.)
2. `getMovementInput` summing the virtual stick and clamping three sources; `setVirtualMovement`.
3. The whole touch overlay DOM: `buildOverlay` (pad, Act/Rotate/zoom buttons), pad `setPointerCapture`, single-owner `padPointerId`, `applyVisibility`, `refreshTouchControls` availability toggles.
4. `areTouchControlsEnabled()` for `auto/on/off`, incl. `matchMedia('(pointer: coarse)')`.
5. Settings persistence/validation of the new `touchControls` enum (`settings.ts:159-161`) — there is no `settings.test.ts`.
6. `sharedSession.ts` `resolveHomeLotForSelf` wiring: page filtering, `HOME_FALLBACK_PLACE` origin, the `setHomePlace` side-effect, `subscribeNeighborHomes`.
7. `main.ts:331-346` home-plate screen interaction (priority 83, `pickSharedHomePlateAtScreen` → `openPlayerCardFor`).
8. `sharedHomeVisuals.ts` plate rendering/picking and `disposeSprite`/shared-geometry disposal.
9. `PaperRoom.handleSetProfile` room behaviour (guest reject, invalid reject, merge) — no room test.
10. `server/src/profileHandlers.ts` HTTP routes (`GET`/`POST /account/profile`, Clerk auth, 409 no-account, 8 KB cap) — no `profileHandlers.test.ts`.
11. The site desk editor (`site/src/pages/account.astro`, `site/src/scripts/account.ts`) end-to-end.
12. `playerCard.renderProfile` trusting server-sent `relationship/bio/links`.
13. Friend-request note end-to-end (client input → `ClientMessage.FriendRequest.message` → `FriendStore` → `FriendsSnapshot` → panel): only `FriendStore` is unit-tested; the room handler (`PaperRoom.ts:1191`) and client wiring are not.
14. Real-finger pinch/orbit on a device — no e2e (playwright is used only by `tools/build-og.mjs`).
15. `FRIEND_REQUEST_DISCLOSURE` copy vs. actual behaviour (the owner-rule it describes *is* correctly implemented — `PaperRoom.ts:1055-1058` reads `friends.incoming(viewer)`, i.e. target→viewer — but nothing tests the pairing).

---

### Provenance legend
- **proven-by-run:** the two vitest suites, `tsc`, and the cycle reproduction (`/tmp/cycle-probe8.mjs` over the real modules via Vite SSR).
- **proven-by-reading:** every finding above that cites code without a run; no finding relies on the authors' `.cluster/*.md` reports.
