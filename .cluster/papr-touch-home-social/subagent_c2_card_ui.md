# Subagent C2 — player card profile, friend-request note + disclosure, block/report reach

Status: complete. Built against the interfaces in `subagent_a2_profile.md` and
`subagent_a4_audit.md` (asks 3/4/5/6). No protocol change; `PROTOCOL_VERSION`
stays 11; all new fields were already optional in `shared/`.

Owned files only (nothing else touched):
- `src/ui/playerCard.ts`
- `src/game/friendsPanel.ts`
- `src/game/guests.ts`
- `src/game/visitPanel.ts`
- `src/styles.css`

I did **not** touch `src/net/**`, `src/main.ts`, `shared/**`, `server/**`, `site/**`.
The parallel agent's `blockAccount` / `reportAccount` (in `src/net/sharedSession.ts`)
and `sendFriendRequest(accountId, message?)` (in `src/net/client.ts`) had landed by
the time I verified.

---

## 1. The exact disclosure sentence (ask 4)

Verbatim, as it appears to the player at the moment of asking (exported as
`FRIEND_REQUEST_DISCLOSURE` in `src/ui/playerCard.ts`):

> **Asking someone to be friends shows them who's asking — your name, and whatever
> you've written to share (your bio and links). Your privacy settings won't hide it
> from the person you've asked.**

### Why it is true, given `profileForViewer`

Read against `shared/src/protocol/profile.ts`:

1. **"your name"** — the name is not part of the profile at all; it always rides
   with the request itself. `FriendRequestRecord = { accountId, name, at, message? }`
   (`shared/src/protocol/guests.ts`) is exactly what the recipient is shown, so a
   request cannot arrive without the asker's name.

2. **"your bio and links … privacy settings won't hide it from the person you've
   asked"** — `profileForViewer(profile, relationship, options)` sets
   `seesBasics = options.hasSentRequest === true`, and when true it returns `bio`
   and `links` **regardless of each field's visibility**:

   ```ts
   if (profile.bio.length > 0
     && (seesBasics || canViewProfileField(relationship, profile.visibility.bio))) {
     view.bio = profile.bio;
   }
   // same shape for links
   ```

   `hasSentRequest` means *the profile's owner has an outstanding friend request
   addressed to this viewer* (documented in the module header, and asserted in
   `profile.test.ts`: *"always shows the basics to someone the owner has asked to be
   friends"* — a stranger sees `{}` without it and the full basics with it). So a
   recipient who is otherwise a stranger to me still sees my `bio`/`links` the moment
   my request reaches them, even though my default audience is `friends`.

3. **"whatever you've written to share"** is the honest hedge for the empty cases:
   `profileForViewer` omits an empty field entirely (`profile.bio.length > 0`), so an
   empty bio or no links simply shows nothing — the sentence never promises a bio you
   never wrote.

The sentence says nothing about the *other* direction (nothing about what I see of
them), and nothing about blocks — both deliberate.

---

## 2. Every new control and where it lives

All controls are `<button>` / `<input>` / `<textarea>` / `<a>` (keyboard reachable,
tab order is source order). Destructive/quiet controls reuse the existing
`is-quiet` shared styling. A `@media (pointer: coarse)` block lifts every new
control (and the existing panel buttons) to the 44px floor; nothing new animates, so
`prefers-reduced-motion` needs no change.

### 2a. Player card — `src/ui/playerCard.ts` (ask 5 read path)

- **Profile block** `[data-card-profile]` inside the dialog (between the meta line and
  the friend actions), rendered by `renderProfile()` from `handlePlayerCardResponse`:
  - quiet relationship line (only if `info.relationship` is present):
    `self → "This is you."`, `friend → "You're friends."`,
    `friend-of-friend → "You have a friend in common."`; `stranger` renders nothing.
  - the bio as a paragraph;
  - links as real anchors — kind-labelled (`Website / Instagram / X / YouTube /
    Twitch / Discord / A link`), `href` only when it matches `^https?://`,
    `target="_blank"`, `rel="noopener noreferrer nofollow"`, `aria-label` names the
    destination and "(opens in a new tab)".
  - **Empty stays empty:** if there is no line, no bio and no links, the block is
    hidden. `found:false` still collapses to the one quiet line
    `"Nothing to show here."` and clears the profile block — never a reason.
- **Friend actions** (`renderFriendActions`): in the "none" state, before the
  `Add friend` button, an optional note field + the disclosure (see §3).
- **Safety row** `[data-card-safety-host]` (`renderSafetyActions`), below the friend
  actions, shown in shared play for a non-guest, non-self account:
  - `Block` (quiet) → one `window.confirm` → `blockAccount(accountId)` → button hides,
    a polite live region says "You will not see their messages any more."
  - `Report` (quiet) → expands an inline optional-details `<textarea>` (bounded to
    `LIMITS.reportDetailsMax`) with a `Send the report` button; a report needs no text
    → `reportAccount(accountId, details?)`.
- **Accessibility preserved/extended:** still `role="dialog"`, `aria-modal`, Escape
  closes, focus returns to the opener, `role="status" aria-live="polite"` for answers.
  Added: the heading now has `tabindex="-1"` and focus lands on it on open (unless a
  friend control was deliberately refocused), matching the stated convention.

### 2b. Friends panel — `src/game/friendsPanel.ts` (asks 4 + 6)

- **Incoming request note:** `row()` now takes an optional note; when a
  `FriendRequestRecord.message` is present it renders as a full-width
  `.friends-row-note` paragraph (`flex-basis:100%`, `overflow-wrap:anywhere`, **no
  clamp/ellipsis**) carrying `aria-label="Note from {name}: {note}"`.
- **Per-row safety controls:**
  - friend row: `Remove` · `Block` · `Report`;
  - incoming row: `Accept` · `Not now` · `Block` · `Report`;
  - both Block and Report route through the shared `confirmBlock()` /
    `blockAccount()` / `reportAccount()` (one confirm at most for Block, none for
    Report; report needs no typed reason).
  - the panel gains a polite status region `[data-friends-status]` for its own quiet
    confirmations ("You will not see their messages any more." / "Report sent. …").
- **Panel "add" flow:** a collapsed `<details>` "Ask someone to be friends"
  (`[data-friends-add]`, hidden outside shared play) with an account-id field, the
  same optional note field + disclosure, and `Ask`
  (`requestFriend(accountId, note)`). See §4 for why this is an account-id box.

### 2c. Home door / visit panel — `src/game/visitPanel.ts` (asks 4 + 6)

- **Friend-request note + disclosure** `[data-visit-friend]`, shown while you can add
  (`none` state, shared play, non-guest). Rebuilt only when the neighbor changes, so
  a half-typed note survives the panel's 500 ms gentle refresh; the `Add friend`
  action button reads the field and passes the note.
- **`Block` and `Report` action buttons** (quiet), alongside `Their player card`, for
  any non-guest neighbor in shared play.
- **Distinction copy** `[data-visit-safety-hint]` (shown when those controls are):
  > Blocking is quiet and lasting: it stops their messages to you and closes your
  > door to them. It is not the same as asking a visitor to leave.

  ("Ask to leave" lives in `src/game/homePanel.ts` for a guest already inside your
  home — untouched. The hint keeps the two from being read as the same gesture.)

### 2d. Transport — `src/game/guests.ts`

- `GuestTransport.requestFriend` is now
  `(accountId: string, message?: string) => void`; `requestFriend(accountId, message?)`
  passes the optional note straight through. Backwards-safe: the parallel agent's
  existing one-arg impl is still assignable, and their wiring now forwards the note.

### 2e. Styles — `src/styles.css`

New rules (all in one commented block after the player-card rules): profile block,
`.player-card-relationship/-bio/-links/-link`, `.player-card-safety*`,
`.player-card-report*`, `.friend-request-note*`, `.friend-request-disclosure`,
`.friends-row-note`, `.friends-status`, `.friends-add*`, `.visit-friend`,
`.visit-safety-hint`, and the `@media (pointer: coarse)` 44px floor. The shared
button rules were extended by **adding selectors** (`.player-card-safety-row button`,
`.friends-add-ask`) to the existing green/quiet/focus-visible lists — no properties
were duplicated or shadowed.

---

## 3. The note field (ask 4)

`buildFriendRequestNote(scope)` (exported from `playerCard.ts`, reused by all three
surfaces) builds:

- a single-line `<input type="text">` bounded by `maxlength = LIMITS.friendRequestMessageMax`
  (140), `autocomplete="off"`, placeholder "Say hello, if you like…";
- a live counter `n/140` (`aria-hidden`, decorative);
- the disclosure paragraph;
- an optional-by-construction value: `input.value.trim().slice(0, 140) || undefined`
  — an empty field simply sends no message (the server's
  `sanitizeFriendRequestMessage` also returns null for empty), so the note is **never
  required**.

The wire carries it via `requestFriend(accountId, message)` →
`sendFriendRequest` → `FriendRequestIntent.message?`.

---

## 4. Things I could not fully honour, and why

- **The friends panel has no "add" surface of its own.** It only ever lists friends,
  incoming and outgoing requests — there is no list of non-friend neighbors in it, and
  no way to enumerate who is in the room from these files (`remoteAvatarVisuals.ts`
  exposes counts/picks, not a roster, and it is not a file I own). So the only way to
  host an "add" flow there is a field for the neighbor's **account id**. I implemented
  that (collapsed `<details>`, honest hint copy). It is a hedge to satisfy the literal
  ask 4 wording "the friends panel's 'add' flow"; if the owner prefers, it is a
  self-contained deletion, or it can be replaced with an in-room neighbor picker once
  a roster is exposed. Flagged for the main agent / round-3 review.
- **Report from a compact friends row takes no details** (a textarea per row would be
  unusable). The card is where the optional details are offered. `ReportIntent.details`
  stays optional everywhere, and no surface ever requires a reason.

---

## 5. Module-cycle note (please read)

My change introduces a real cycle: `playerCard.ts → ../net/sharedSession` while
`sharedSession.ts → ../ui/playerCard` (it already imports
`handlePlayerCardResponse` / `setPlayerCardRequestHandler`). The task explicitly
required importing `blockAccount` / `reportAccount`, so I kept the static import.

This is **safe only because of the current entry order**, and I verified it:

- `sharedSession.ts`, at module top level, calls
  `setPlayerCardRequestHandler(requestPlayerCard)`. That setter assigns a module-level
  `let` in `playerCard.ts`, so if `playerCard.ts`'s body has not run yet it is a TDZ
  ReferenceError.
- Safe today: `main.ts` reaches `sharedSession` first via `game/avatarLook.ts`
  (line 9 imports `avatarLook`, which imports `../net/sharedSession`) **before**
  `ui/playerCard` (line 41). Evaluating `sharedSession` therefore evaluates its own
  dependency `playerCard` (its body runs) before `sharedSession`'s body — so the setter
  sees an initialised binding.
- I reproduced both orders in a minimal ESM harness in `/tmp/esmcycle`:
  - avatarLook-first (mirrors current `main.ts`): prints `card has handler: true` ✅
  - playerCard-first: `ReferenceError: Cannot access 'requestCardHandler' before
    initialization` ❌

**Action for the main agent:** do not reorder `main.ts` so `./ui/playerCard` is
reached before `./net/sharedSession`, or (more robustly) convert the two safety calls
to the same injection pattern as `setPlayerCardRequestHandler`. I could not fix this
from my own file set.

---

## 6. Verify — real output

### `npx tsc --noEmit`
```
tsc exit: 0
```

### `npm run styles:check`
```
> node tools/check-styles.mjs

Stylesheet looks good: 1014 rules, no shadowed declarations.
```

### `npx vitest run src/ui src/game/friendsPanel* src/game/guests*`
(no `friendsPanel*` or `guests*` test file exists beyond `guests.test.ts`; the glob
matched `src/game/guests.test.ts` + `src/ui/**`)
```
 ✓ src/game/guests.test.ts (23 tests)
 ✓ src/ui/multiplayerPanelState.test.ts (1 test)
 ✓ src/ui/diaryView.test.ts (3 tests)
 ✓ src/ui/treasureMapModel.test.ts (3 tests)
 ✓ src/ui/activityFeed.test.ts (4 tests)
 ✓ src/ui/avatarEditor/stamps.test.ts (15 tests)
 ✓ src/ui/avatarEditor/design.test.ts (19 tests)
 ✓ src/ui/avatarEditor/shapes.test.ts (7 tests)
 ✓ src/ui/avatarEditor/wardrobe.test.ts (12 tests)

 Test Files  9 passed (9)
      Tests  87 passed (87)
```

### `npx vitest run` (whole repo)
```
 Test Files  110 passed | 1 skipped (111)
      Tests  1150 passed | 1 skipped (1151)
```
(The 1 skipped file is the leftover scratch `src/game/__tmp_mock_probe.test.ts`, not
mine. Zero failures.)

### Diff footprint
```
 src/game/friendsPanel.ts |  80 ++++++-
 src/game/guests.ts       |   7 +-
 src/game/visitPanel.ts   |  50 ++++-
 src/styles.css           | 433 ++++++++++++++++++++++++++++++--
 src/ui/playerCard.ts     | 302 +++++++++++++++++++++++++++++--
```
Note `styles.css` was already modified (uncommitted) by A1's touch work before I
started; that figure is cumulative for the file, not all mine.

---

## 7. Unverified / not claimed

- **No DOM test exists** for `playerCard` / `friendsPanel` / `visitPanel`, and the
  suite runs in the node environment (no jsdom). Everything above is verified by
  `tsc` + `styles:check` + the existing suite; the *behaviour* (card renders a bio,
  the note reaches the wire, block/report fire, focus order) has **not** been
  exercised in a real browser or against a second client. That two-client pass is on
  the audit's owed list for the whole cluster.
- **Assumed** `PlayerCardInfo.bio/links/relationship` reach the client only when the
  server ran `profileForViewer` (B2's job). The card renders whatever it is handed and
  never asks why a field is missing.
- **Assumed** the parallel agent keeps `main.ts`'s import order (§5).
- The friends-panel add-by-account-id flow is a hedge, not a designed flow (§4).
