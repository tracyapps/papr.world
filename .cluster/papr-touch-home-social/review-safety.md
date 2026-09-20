# Safety review — papr-touch-home-social

Profiles, blocking, reporting, and the two new access-controlled routes.
Reviewer: adversarial read of the uncommitted tree (not the author reports).

**Overall verdict: SAFE WITH FIXES.**
The privacy model is enforced server-side and the owner-rule direction is
correct (both proven by a run, below); the new `/account/profile` routes are
properly Clerk-authenticated and claimed-account-gated and can only touch the
caller's own record; block/report are wired to the real transport on all three
new surfaces. One genuine silence-rule hole remains in the reviewed surface
(the asker can distinguish a refused/blocked request from a pending one by
watching their own outgoing list), plus several smaller gaps.

Method. Read every new/changed file. Ran:
- `npx vitest run` (root): 1150 passed, 1 skipped.
- `cd server && npx vitest run`: 167 passed.
- `cd server && npx tsc --noEmit`: clean.
- Two throwaway probes under `/tmp/pp-safety-probe/` against the real
  `FriendStore`, `relationshipBetween` and `profileForViewer`.

---

## Findings

### F1 — MAJOR (silence rule) — the asker's own outgoing list is a refused/blocked oracle
`server/src/friends.ts:179` (`silently-dropped` stores nothing),
`server/src/friends.ts:213-215` (a decline splices the request),
`server/src/rooms/PaperRoom.ts:1219` + `:1222` (room notifies the asker
`'requested'` and then pushes the asker's own snapshot), amplified by the new
ask surface `src/game/friendsPanel.ts:234` (`setStatus('Your ask is on its
way.')`).

**What is wrong.** The room tells the asker "requested" in *both* the real
`'sent'` case and the `'silently-dropped'` case (target blocked the asker), and
`receiveFriendNotice` shows "Friend request sent to X." in both. But then
`pushFriends(player.accountId)` sends the asker a snapshot whose `outgoing`
list contains the target only in the real case. A declined request is likewise
spliced out immediately, while an unanswered one lingers for
`friendRequestTTL` (30 days). So the asker can read their own "waiting for an
answer" list (or the card's `state === 'outgoing'` line, or the door panel's
`relationLine`) and conclude *"they blocked me"* or *"they refused me"* —
exactly the two things the silence rule (`docs/accounts-worlds-and-social.md`;
`server/src/friends.ts:13-18`) promises never to reveal.

**Proven by run.** `/tmp/pp-safety-probe/silence.mts` (real `FriendStore`):
normal ask → `sent`, outgoing `["boris"]`; ask to someone who blocked you →
`silently-dropped`, outgoing `[]`. `server/src/friends.test.ts` itself pins the
decline case: after `answer(..., false)`, `outgoing('anna')` is `[]` while the
asker was shown "sent".

**Fix.** Make the asker's own view invariant: either keep a tombstone for a
request that was declined or silently dropped (so `outgoing` still lists the
target until the normal TTL), or stop pushing the asker's snapshot on the
decline/drop path. The cleanest form is a per-asker "pending" record that is
only removed by the asker (withdraw), by acceptance, or by the TTL — never by
the answer/drop.

**Attribution.** The mechanism is pre-existing (HEAD behaves the same); the
change set did not introduce it, but it adds the first prominent ask-by-id
surface whose confirmation ("Your ask is on its way.") sits next to the
contradicting empty list, so it is materially easier to notice now.

### F2 — MINOR — doc says a block "in either direction" gives `found: false`; the code only does the target→viewer direction
`server/src/rooms/PaperRoom.ts:1027` (only `blocks.isBlocked(accountId,
player.accountId)` — "does the card's owner block me?") vs
`docs/address-plates-and-profiles.md:101` and `:157`
("a block in either direction collapses the server's answer to `found: false`") ("a block in either direction collapses
everything to stranger and the card stays 'Nothing to show here.'").

**What is wrong.** If the *viewer* has blocked the target, the card is
`found: true` (relationship resolves to `stranger` via
`server/src/profiles.ts:80`, so only `everyone` fields show). That is not a leak
to the blocked party, but it contradicts the docs, and the inconsistency is the
kind of thing a later change will "fix" in the wrong direction. Either the code
should return `found: false` for a viewer-side block too, or the docs should say
"if *they* blocked *you*".

**Proven by code reading.**

### F3 — MINOR — a friend request now discloses an offline account's stored display name
`server/src/rooms/PaperRoom.ts:1191` — `const otherName = other?.name ??
profiles.nameFor(target) ?? 'paper friend';`

**What is wrong (small).** Before the change an offline target was named
"paper friend"; now any asker who knows the target's account id learns the
target's stored profile display name even when they are offline. The name is
already public when the target is online (room state, home sign, address
plate), so the disclosure is low-impact, but it is new and it is only populated
for accounts that have published a profile. Consider deriving `otherName` only
from live room state (or accepting the disclosure deliberately and documenting
it in `docs/accounts-worlds-and-social.md`).

**Proven by code reading.**

### F4 — INFO — Neon `social_links` object-vs-array mismatch is still unreconciled (and still unread)
`server/src/database.ts:65` — `social_links jsonb NOT NULL DEFAULT '{}'::jsonb`
(an object) while the wire shape is `links: ProfileSocialLink[]` (an array).
Confirmed nothing reads or writes the column: the only write is
`server/src/database.ts:331-334` (`INSERT INTO player_profiles (account_id,
display_name)`) and the only reads select `display_name`. The
`ProfileStore` (`server/src/profiles.ts`) is a separate JSON store. No live
impact, but the "row↔profile mapper is the right place to reconcile that" noted
in `subagent_a2_profile.md` was never written — flag it for whoever migrates
profiles into Neon, or change the column default to `'[]'::jsonb` now while it
is still empty.

### F5 — INFO — the in-room `SetProfile` handler has no client caller
`server/src/rooms/PaperRoom.ts:281` / `:1271` handle `ClientMessage.SetProfile`,
but no `NetConnection` method sends it (`grep` finds no `sendSetProfile` outside
the shared enum/type at `shared/src/protocol/messages.ts:117,235,261`). The
handler is correct and sanitized, but it is only reachable by a hand-crafted
client today. Not a defect; note it so it is not mistaken for a wired feature.

### F6 — INFO (hygiene) — scratch files left in the tree
`src/game/__tmp_dep.ts` and `src/game/__tmp_mock_probe.test.ts` are untracked
"SCRATCH FILE — safe to delete" leftovers (the probe test is `it.skip`ped). They
are inert, but they are in the change set and should not ship.

### F7 — INFO (copy) — wrong verb on the GET route's 409
`server/src/profileHandlers.ts:46` answers a **read** with "claim your paper
passport before **writing** your profile"; the write route's copy (`:73`) is the
correct one. Cosmetic.

---

## Verified correct (checked, held)

1. **Owner rule direction (Q2) — CORRECT, proven by run.**
   `server/src/rooms/PaperRoom.ts:1057-1058` computes
   `friends.incoming(player.accountId).some(r => r.accountId === accountId)`,
   and `FriendStore.incoming` maps `accountId = request.from`
   (`server/src/friends.ts:147-158`). So it is "the **target** has an
   outstanding request addressed to the **viewer**", not the reverse. Probe
   `/tmp/pp-safety-probe/direction.mts` (real store): after the target asks the
   viewer, `hasSentRequest === true` and the viewer sees the target's private
   bio/links; the reverse lookup is `false` and a plain stranger gets `{}`.
   Guest guard `!isGuestAccount(player.accountId)` at `:1057` is present.
   Guests can also never be the addressee (`FriendStore.request` rejects
   `to.startsWith('guest:')`, `server/src/friends.ts:175`), and a guest card
   target short-circuits to `notFound` at `:1026`.

2. **The block/absent/guest collapse (Q1, card path).** A target→viewer block
   returns `{accountId, found:false}` (`server/src/rooms/PaperRoom.ts:1027`,
   `:1022`) with **no** `relationship`, `bio` or `links`, identical to a
   nonexistent account and a guest; the client renders the single line
   "Nothing to show here." and hides the profile host
   (`src/ui/playerCard.ts:612-620`).

3. **Field filtering is server-side only (Q3).** The client can only send
   `{accountId}` (`shared/src/protocol/messages.ts` `PlayerCardIntent`); the
   server builds the payload from `profileForViewer(...)` and spreads only
   `...visible` (`server/src/rooms/PaperRoom.ts:1059-1069`). No client-supplied
   field survives. Empty/unpermitted fields are omitted, never sent as `''`
   (`shared/src/protocol/profile.ts:337-345`), so "has a bio but you may not see
   it" is indistinguishable from "has no bio" — the intended silence.

4. **Route access control (Q4).** Both routes call `authenticateClerkUser`
   (Clerk session token from the `Authorization: Bearer` header only,
   `server/src/admin.ts:133-157`) and then `homeForClerkUser(clerkUserId)` →
   `home.account.id` (`server/src/database.ts:172-175`). The account id comes
   from the verified Clerk subject; there is no path/body/query id, so one
   account cannot read or write another's profile. Unclaimed accounts get 409,
   unconfigured DB gets 503. Body is bounded (`PROFILE_BODY_MAX_BYTES = 8192`,
   `server/src/profileHandlers.ts:31,76`; `readBody` at
   `server/src/accountIdentity.ts:116-127`). No wildcard `/account/:id` route
   exists to shadow `/account/profile` (`server/src/index.ts:412-446`).

5. **Store hygiene (Q5).** Bounded on write (`set`/`update` → `sanitizeProfile`,
   `server/src/profiles.ts:160-179`), bounded on load (`sanitizeProfile` per
   record, `:117-124`), atomic writes (`writeAtomic` temp+rename, `:88-93`),
   loud on a corrupt file (`console.error`, `:125-129`, test-pinned), and
   `profileFor` hands out deep copies (`:96-102`, `:144-146`). The in-room
   `SetProfile` path runs `sanitizeProfileUpdate` before `profiles.update`
   (`server/src/rooms/PaperRoom.ts:1277-1282`), so it cannot set an unbounded
   bio/URL/link list either.

6. **Block/Report reach (Q6).** All three surfaces call the shared transport:
   card `blockAccount`/`reportAccount(target.accountId, …)`
   (`src/ui/playerCard.ts:494,506`), friends list `blockAccount(id)`/
   `reportAccount(id)` (`src/game/friendsPanel.ts:258,264`), visit panel
   `blockAccount(home.accountId)`/`reportAccount(home.accountId)`
   (`src/game/visitPanel.ts:226,232`), all → `connection?.sendBlock` /
   `sendReport` (`src/net/sharedSession.ts:696-710`). The report carries a real
   `accountId` and deliberately omits `messageId` (`ReportIntent.messageId`
   optional, and the room only quotes a line when one is supplied,
   `server/src/rooms/PaperRoom.ts:834-846`). Block on the visit panel is kept
   distinct from "Ask to leave" (which lives in `src/game/homePanel.ts:266`):
   different action id, its own confirmation copy, and an explicit safety hint
   string saying it "is not the same as asking a visitor to leave"
   (`src/game/visitPanel.ts:193`).

7. **Desk editor (Q7).** The bearer token is fetched fresh per request and sent
   only in the `authorization` header — never in the URL or storage
   (`site/src/scripts/account.ts:837-842,896-900`). A failed load degrades to an
   error line with the form hidden (`:890-913`). Visibility can only be one of
   the three levels: the radios are the three values and `readVisibility`
   clamps anything else to `friends` (`:712-718`), with server-side
   re-validation behind it.

8. **Desk disclosure matches the spec.** The in-game note
   (`src/ui/playerCard.ts:49-59`) and the desk card
   (`site/src/pages/account.astro`) both state the owner rule exactly as
   `docs/...` requires, and all three request surfaces go through
   `buildFriendRequestNote`, so no ask can be sent without the disclosure.

9. **All tests green.** Root 1150 pass / 1 skip; server 167 pass; server
   `tsc --noEmit` clean. (Root `tsc` reports one pre-existing unrelated error:
   missing `polygon-clipping` types in `src/ui/avatarEditor/shapeGeometry.ts`.)
