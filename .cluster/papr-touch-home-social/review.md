# Review — papr-touch-home-social

Two independent reviewers (safety/privacy, protocol/engineering) audited the
uncommitted change set. This file merges their verdicts and records what was
fixed in response.

Sources: `review-safety.md`, `review-eng.md` (both in this directory).

## Verdicts

- **Safety / privacy / access:** SAFE WITH FIXES. Core model sound; one genuine
  silence-rule hole, plus doc drift and small gaps.
- **Protocol / engineering:** wire claim correct (fully additive, no
  `PROTOCOL_VERSION` bump needed); clump determinism and touch core hold up; but
  one real latent boot-crash (import cycle) and one client-trust issue (clump).

## Fixed in response

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| E1 | MAJOR (latent BLOCKER) | New `playerCard ↔ sharedSession` import cycle; the game booted only because `main.ts` happened to evaluate the session first. Reversed, it threw `ReferenceError: Cannot access 'requestCardHandler' before initialization`. Proven by run. | Removed the edge. `playerCard.ts` no longer imports the session; it takes `block`/`report` through `setPlayerCardSafetyHandlers`, the same injection seam it already had for `setPlayerCardRequestHandler`. `sharedSession.ts` injects them. Pinned by `src/ui/playerCardDependencies.test.ts`. |
| S1 | MAJOR (silence rule) | The asker's own outgoing list was a blocked/refused oracle: a silently-dropped (blocked) request stored nothing, so "I asked and it is not in my list" ⇒ "they blocked me". Proven by run. | Tombstones: a refused request is stored with `state:'gone'` — visible in `outgoing()` to the asker alone, never in `incoming()`, never answerable, and carrying the note so the asker's view is byte-for-byte an honest send's. Declines now keep the asker's copy instead of splicing it, closing the "it vanished ⇒ they said no" read. A repeat request is caught as `already-sent` **before** the block check, so the second oracle (a different answer on re-ask) is closed too. Bounded by the same per-asker cap. Tests updated and added. |
| S2 | MINOR | Docs said a block in *either* direction collapses the card to `found:false`; the code only checked target→viewer. | Code now checks both directions (`blocks.isBlocked(a,b) || blocks.isBlocked(b,a)`), matching the door rule and the docs. |
| E3 | MINOR | A tracked pointer that ended off-window was never reaped, so one ghost entry left `trackedPointers.size` at 2 forever — every later single-finger drag read as a pinch, and the camera stopped turning until reload. | `pointermove` now drops a tracked pointer that is moving with no button held. |
| E5 | MINOR | `input.test.ts` mocked `./settings` without `onSettingsChanged`, which `input.ts` now reaches transitively through the touch overlay. | Mock completed. |

## Reported, deliberately not fixed (recorded as open)

| # | Severity | Finding | Why not fixed |
| --- | --- | --- | --- |
| E2 | MAJOR (trust) | The clump is client-authoritative: `handleSetHome` accepts any finite x/z, and `resolveHomeLot` only runs in the honest client. A modified client can park on a neighbour's lot and, if its account id sorts first, force the honest neighbour to keep re-lotting. | The fix is server-authoritative lot assignment, which needs the layout moved to `shared/` and a server-side page-spawn table — a real change, not a patch. Determinism and termination for honest clients are proven; recorded as an open decision in `docs/address-plates-and-profiles.md`. |
| S3 | MINOR | `handleFriendRequest` now names an offline target from the profile store where it used to say "paper friend". | An improvement (a name the player chose, already public), not a leak. Kept. |
| S4 | INFO | Neon `player_profiles.social_links` is `jsonb DEFAULT '{}'` (object) while the wire shape is an array; the column is still unread. | Documented in `docs/address-plates-and-profiles.md`. The JSON store is authoritative; a later Neon migration reconciles it. |
| E6 | INFO | `ClientMessage.SetProfile` has no client sender; the desk uses `POST /account/profile`. | Reserved wire surface, additive and harmless. Documented. |
| E4 | MINOR | Two scratch files (`src/game/__tmp_dep.ts`, `__tmp_mock_probe.test.ts`) remain in the tree. | The sandbox's safety guard refused the delete; see the delivery report. Inert — `tsc` passes and the one skipped test is `it.skip`. |

## Verified correct (held under adversarial reading)

- **Owner rule direction.** `hasSentRequest` is "the target has an outstanding
  request addressed to the viewer" (`friends.incoming(viewer)`), not the reverse;
  guest viewers are guarded. Proven by probe.
- **Block silence.** Unknown / guest / blocked all collapse to `found:false`
  ("Nothing to show here."), with no profile fields, and empty fields are omitted
  (no existence leak).
- **Visibility is server-side only**; the client sends just `{accountId}`.
- **`/account/profile` routes**: Clerk-authenticated, claimed-account-gated,
  keyed solely by the verified Clerk subject, 8 KB body bound, store sanitized on
  load and on write, atomic writes, loud on a corrupt file.
- **Block/report reach**: wired to the real transport on the card, the friends
  panel and the visit panel; the report carries a valid `accountId` and omits
  `messageId`; visit-panel Block stays distinct from "Ask to leave".
- **Wire back-compat**: every `shared/` hunk classified — new keys and optional
  fields only, no existing field's meaning changed, `ClientMessage` uses string
  literals so there is no ordinal drift. No bump needed.
- **Clump**: deterministic from synced state; the yield is strictly one-way on
  unique ids so honest clients cannot oscillate; solo play is the origin exactly.
- **Touch**: keyboard/gamepad/orbit unchanged with touch off; the movement sum
  still clamps to unit speed; `-0`/`+0` handled; no listener leak.
- **Desk editor**: token only in the `Authorization` header; failed load degrades;
  visibility clamped to the three allowed values.

## Not verified by anyone (state honestly in delivery)

No test and no browser run covers: the multi-pointer logic and the whole touch
overlay DOM; `settings` persistence for the new enum; the clump publish wiring and
the plate click; `handleSetProfile`; the `/account/profile` HTTP routes; the desk
editor end-to-end; the friend-note path end-to-end; the card's profile render; and
real-finger pinch on a device. Full list in `review-eng.md` §5.

## Tree-state caveat

A concurrent, unrelated workstream (an avatar custom-shape editor) landed into the
same working tree during the review and is mid-install: `polygon-clipping` is
declared in `package.json` but absent from `node_modules`, so at the time of
writing `npx tsc --noEmit` reports one error and three test files fail — **all in
`src/ui/avatarEditor/*`**, none in this change set. `npm install` clears it.
