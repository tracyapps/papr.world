# Subagent C3 — Server profiles, relationship & friend-request notes

Status: complete. Purely additive. `PROTOCOL_VERSION` left at **11**. No `shared/**`
file touched (A2's contract consumed as-is). `server/src/database.ts` left
**untouched** (see "database.ts" below).

## Files changed and why

| File | Change | Why |
| --- | --- | --- |
| `server/src/profiles.ts` (NEW) | `ProfileStore` (JSON, `data/profiles.json`, keyed by accountId) + `relationshipBetween` | The durable profile + the one-hop relationship the visibility rules need. |
| `server/src/profiles.test.ts` (NEW) | 14 tests | Store round-trip / sanitize-in / sanitize-on-load / restart / corrupt-file-loud; every `relationshipBetween` branch incl. blocks. |
| `server/src/profileHandlers.ts` (NEW) | Clerk-gated `GET`/`POST /account/profile` | The owner's read/write half of profiles; modelled on `avatarDesignHandlers.ts`. |
| `server/src/stores.ts` | +`ProfileStore` import, +`profiles` export | One process-wide instance, same as every other store. |
| `server/src/index.ts` | +`profileApi`, +2 routes beside the other `/account/*` | Registers the handlers. |
| `server/src/friends.ts` | `Request.message?`, `request()` 5th arg, `incoming()`/`outgoing()` carry it, load re-sanitizes | Store the optional note on a request. |
| `server/src/friends.test.ts` | +6 tests | Note round-trip, sanitize, restart, quiet-no, block. |
| `server/src/rooms/PaperRoom.ts` | `SetProfile` handler; card gains `relationship` + viewer-filtered `bio`/`links`; friend request passes the note | Make the profile real in the room and deliver it through `profileForViewer`. |

## Store shape

`<PP_DATA_DIR>/profiles.json` (default `data/profiles.json`):

```json
{
  "version": 1,
  "profiles": {
    "<accountId>": {
      "name": "Wren",
      "bio": "draws tents",
      "links": [{ "kind": "website", "url": "https://wren.example" }],
      "visibility": { "bio": "friends", "links": "friends" }
    }
  }
}
```

- **Sanitize in AND out.** `set()` runs `sanitizeProfile` before it touches disk;
  `load()` runs `sanitizeProfile` + `sanitizeName` on every entry; a non-object
  entry is skipped, a broken field heals to its default. `name` rides along so a
  card / request to someone offline reads with the name they chose.
- **Atomic + write-through.** `mkdir -p` + temp-file + `renameSync`, flushed on
  every `set`/`update` (profile edits are deliberate and rare, matching
  `FriendStore`/`AccountTechStore`, not `BlockStore`'s debounce).
- **Loud on corrupt.** A bad file logs `profiles: failed to read …` and starts
  empty rather than silently hiding every bio.
- **Bounded.** Every field is capped by the shared sanitizers (`bioMax` 280,
  ≤`socialLinksMax` 6 links, `socialUrlMax` 200 each); `profileFor`/`set` hand
  back deep copies so a caller cannot mutate the store.
- **Why JSON, not Neon.** `player_profiles` already has `bio`/`social_links`/
  `privacy` columns, but nothing ever read or wrote them. Every other account
  fact (friends, blocks, tech, designs, mail) is a JSON store that works with
  `DATABASE_URL` unset; wiring Neon would make profiles the one account feature
  that needs a database. The shared `PlayerProfile` is exactly the table's
  intent, so a later migration is a copy.

## Route contracts (`profileHandlers.ts`)

Both are Clerk-authenticated (`authenticateClerkUser`) and claimed-account-gated
via `database.homeForClerkUser`. Responses set `cache-control: private, no-store`.

| Method | Path | Request | Success | Errors |
| --- | --- | --- | --- | --- |
| `GET` | `/account/profile` | — (Bearer Clerk) | `200 { profile: PlayerProfile }` (the caller's own) | `503` accounts not configured · `409` passport not claimed · `502` account service failed |
| `POST` | `/account/profile` | JSON `ProfileUpdate` (`{ bio?, links?, visibility? }`), body ≤ 8192 B | `200 { profile }` (whole merged, sanitized profile) | `503`/`409` as above · `400` body not a usable update (non-object, or a present-but-invalid field) · `502` save failed |

`POST` merges field-by-field: an absent field is left alone, a present field
replaces it; a `visibility` patch touches only the field it names.

## Relationship algorithm (`relationshipBetween(viewer, target, deps)`)

```
viewer === '' or target === ''            -> 'stranger'
viewer === target                         -> 'self'
deps.isBlocked(viewer,target) || (target,viewer) -> 'stranger'   // BLOCK WINS
deps.areFriends(viewer, target)           -> 'friend'
any f in deps.friendsOf(target) with deps.areFriends(viewer,f) -> 'friend-of-friend'
otherwise                                 -> 'stranger'
```

- **One hop, symmetric.** Friendship in `FriendStore` is mutual and stored both
  ways, so "is a friend of the target also a friend of the viewer" is the same
  relation read from either end — there is no direction to choose. A test asserts
  `('anna','boris')` and `('boris','anna')` agree.
- **`isBlocked` is an optional third dep** (a superset of the stated two-function
  shape). The room passes `blocks.isBlocked(a,b) || blocks.isBlocked(b,a)`, so a
  block in *either* direction collapses to `stranger`. This is what makes the
  block branch unit-testable and makes "blocks beat everything" true inside the
  helper, not only at the call site.
- **The card.** `handlePlayerCardRequest` keeps its exact collapse for
  `!accountId` / `guest:` / target-blocked-viewer → `found:false`
  ("Nothing to show here."). Only a non-blocked target reaches the relationship;
  a viewer who blocked the target resolves to `'stranger'` (friendship was
  already purged by the block, so this changes nothing observed today and hides
  the non-public fields). `papersSince` and `sharedDesignIds` are unchanged.
- **Owner rule.** `hasSentRequest` = the target has an outstanding request to the
  viewer (`friends.incoming(viewer).some(r => r.accountId === target)`); passed to
  `profileForViewer`, so the owner's basic fields show regardless of visibility —
  matching A2's documented rule. Skipped for a guest viewer (a guest can never be
  the addressee of a request).

## `SetProfile` in the room

Registered in `onCreate` mirroring `handleSetHomePolicy`: no `player` → return;
guest → `reject(…,'guest-not-allowed')`; `sanitizeProfileUpdate` null →
`reject(…,'invalid')`; else `profiles.update(player.accountId, player.name, update)`.
**No send of any kind** — a profile is account data, not room state, so there is
no broadcast and no echo.

## Friend-request note lifecycle

- `Request` gains `message?: string`; `request(from, fromName, to, toName, message?)`
  sanitizes once via `sanitizeFriendRequestMessage` and stores it **only when
  non-empty**.
- `incoming()` and `outgoing()` return `message` **conditionally** — an absent
  note leaves the record byte-identical to before, so the existing
  `toEqual({accountId,name,at})` tests still pass.
- `load()` re-sanitizes the note; it survives save/load (tested).
- **A note is not a lever.** A declined request drops the note with the request;
  a request to somebody who blocked you is still `silently-dropped` and stores
  nothing (tested). `QUIET NO` is intact.
- `PaperRoom.handleFriendRequest` now passes `msg?.message`; because
  `friendsSnapshot` maps `friends.incoming()` straight into `FriendsSnapshot`,
  the note lands on `FriendRequestRecord.message` for the intended recipient. The
  offline-name fallback also consults `profiles.nameFor(target)` before
  `'paper friend'`.

## Verify — real output

`cd server && npx tsc --noEmit`
```
SERVER TSC EXIT: 0
```

`cd server && npx vitest run`
```
 Test Files  18 passed (18)
      Tests  167 passed (167)
```
(was 146 before this round; +21 new tests)

`npx tsc --noEmit` (repo root)
```
ROOT TSC EXIT: 0
```

`npx vitest run` (repo root)
```
 Test Files  110 passed | 1 skipped (111)
      Tests  1150 passed | 1 skipped (1151)
```
(was 1124 passed | 1 skipped; the real-socket `server/src/rooms/guests.room.test.ts`
and `cases.room.test.ts` still pass unchanged)

## Unverified / notes for the reviewer

- **No new live-socket test.** `guests.room.test.ts`'s `PlayerCard` listener is a
  no-op, so no existing test requests a card. The room glue
  (`SetProfile` handler, card filtering) is type-checked and the pure pieces it
  calls (`ProfileStore`, `relationshipBetween`, `profileForViewer`) are unit-tested,
  but there is **no real-socket assertion** that `SetProfile` persists and that a
  card returns relationship-filtered `bio`/`links`. The room test file is not in
  my ownership set, so I did not add one.
- `PlayerCardInfo.relationship` is now always present on `found:true` (additive
  optional field). No client reads it yet — B1 owns the card UI.
- `server/src/database.ts` deliberately left alone: the desk routes get the
  account id and display name from `homeForClerkUser`, so no new read path was
  needed; the Neon `player_profiles` columns stay unused.
- `PROTOCOL_VERSION` is still **11**; every change is a new key or an optional-only
  field/argument.
