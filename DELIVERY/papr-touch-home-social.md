# papr.world — touch/tablet, homes & neighborhoods, profiles, and multiplayer readiness

**Date:** 2026-09-20 · **Repo:** `~/Dropbox/work/custom-work-tools/games/pencil-and-paper` · **Base:** `ba32f1d`

Everything below is uncommitted working-tree changes on top of `ba32f1d`. Nothing
has been committed; nothing has been deployed.

---

## 1. Your six asks, and where each one landed

### 1. Touch / tablet controls — **built** (slices 1–3 of the plan)

- A new **analog move pad**: thumb position gives direction *and* strength, read
  camera-relative, with a radial deadzone. It feeds the same movement sum as the
  keyboard and gamepad, so a full pad throw plus a held key still clamps to one
  unit of speed.
- **Act** button (does what E does), **Rotate** (build mode only), and **zoom +/−**
  buttons as the non-gesture twin of pinch.
- **Multi-touch**: `input.ts` now tracks pointers by `pointerId`. One finger still
  orbits exactly as before; a second becomes a pinch-zoom instead of fighting the
  first; a third is ignored.
- **Foundations**: `touch-action: none` on the canvas, no long-press callout,
  `viewport-fit=cover`, and nine genuinely-full-viewport `100vh` rules moved to
  `100dvh` (iPad Safari's sliding toolbars).
- A setting: `touchControls: 'auto' | 'on' | 'off'` (default `auto` =
  `pointer: coarse`).

**The plan changed in exactly one place.** Your doc said the Act button "appears
when something is in reach". Established practice for a primary action button on
touch is to keep it in a **fixed position and change its state**, because a
control that moves under a thumb is a control you mis-tap. So it stays put and
lights up when something is in reach. The reasoning, and three alternatives I
rejected (tap-to-move, floating stick, tilt-to-steer), are written up in
`docs/touch-and-tablet.md`.

### 2. House build/improve/expand + starter tent & Thing Maker in neighborhood clumps

- The house system itself (parts, projects, waiting, refunds, the panel) was
  already built; **nothing was changed there.** The starter home is still the
  tent and the Thing Maker is still level 1.
- **New: the clump.** Every player's Home used to sit on the spawn point, so in a
  shared world every tent stacked on the same spot. Homes are now placed on a
  **deterministic lot layout** — concentric rings of 6·ring slots at 8 units
  spacing, nearest free slot first, the whole clump anchored on the page's spawn.
- `LOT_SPACING = 8` is derived, not picked: two fully-grown houses need 5.4 just
  to stop touching, and `land-and-dwellings.md` insists the gap is the protected
  thing and must stay usable — 8 leaves ~2.6 of walkable ground in the worst case.
- **Deterministic with no sync, and self-healing.** If two brand-new players both
  publish at the origin before seeing each other, the account id that sorts later
  yields to the next free lot; both clients compute the same answer. Solo play is
  unchanged to the last decimal (the first lot is the origin, untouched).

### 3. "Address" plates linked to the player card — **built**

- Every neighbouring home now carries an **address plate** beside the existing
  sign: **`No. 12 · Wren`**. The number is derived from the account id alone, so
  it is identical on every client with nothing stored or synced, and it survives
  a rename.
- Clicking the plate **opens that player's card**. It is registered at a higher
  priority than the house/sign handler, so the plate is not swallowed by the door
  panel.
- **Privacy**: the words on the plate are the display name, which is *already*
  public (it is over the avatar and in synced state). What respects privacy is
  what the plate *links to* — see §5. **One honest gap:** there is no per-viewer
  switch to hide the plate itself, because room state is identical for every
  client; it needs a per-viewer home projection. Recorded as an open decision.

### 4. Friend request with an optional short note + the disclosure

- A request may now carry an **optional note (≤140 chars)**, sanitized server-side,
  stored with the request, and shown to the recipient.
- **The disclosure you asked for** is written in two places, because the rule is
  surprising enough that it should be said out loud:
  - In game, at the moment of asking: *"Asking someone to be friends shows them
    who's asking — your name, and whatever you've written to share (your bio and
    links). Your privacy settings won't hide it from the person you've asked."*
  - On the desk: *"One thing worth saying plainly: if you ask somebody to be
    friends, they can read your bio and your links — whatever you have set above.
    Asking to be friends should never be a blind request; the person you are
    asking gets to see who is asking. Nobody else sees more than your settings
    allow."*
- **A note is not a lever.** A declined request drops the note with the request,
  and a request to someone who blocked you is still silently dropped.

### 5. Profiles: short bio, social links, everyone / friends / friends-of-friends

- New shared model (`shared/src/protocol/profile.ts`): `bio` (280 chars, control
  chars stripped), up to **6 links** from a fixed kind allow-list
  (website/instagram/x/youtube/twitch/discord/other), `http(s)` URLs only, 200
  chars each. **Visibility is per field**, and defaults to **friends** (closed by
  default, widened deliberately).
- **The rule that overrides it** — always visible if you send a request — is
  implemented as `profileForViewer(profile, relationship, { hasSentRequest })`
  and pinned by a test. It applies **only to the actual addressee of a live
  request**, never to the public.
- The **relationship** is computed server-side: self / friend / friend-of-friend
  (one hop through the mutual friendship graph) / stranger. A block in either
  direction collapses to stranger.
- **Editor on the desk** ("Your profile" card) with the bio, the links, both
  audience controls, and the disclosure paragraph.
- **Store**: `data/profiles.json` (keyed by account id), the same shape as
  friends/blocks/tech/designs, and it works with `DATABASE_URL` unset. The Neon
  `player_profiles` table already had `bio`/`social_links`/`privacy` columns —
  nothing had ever read or written them; a later migration is a copy.

### 6. Blocking and reporting tied in

Both already existed and both already worked. **The gap was reach**: the only
entry point was the ⋯ menu on a chat line, so you could not block or report
someone who had not spoken. Both are now on the **player card**, the **friends
panel**, and the **home door panel** (kept clearly distinct from "Ask to leave").
No new server state was needed — `ReportIntent.messageId` was already optional.

**The silence rule is unchanged and was hardened** (see §3).

---

## 2. What I'd add right now before real multiplayer testing

Ordered. Items 1–3 are code; the rest are yours.

1. **`npm install`** — a *different, concurrent* workstream is landing an avatar
   shape editor in this same tree and it is mid-install: `polygon-clipping` is in
   `package.json` but missing from `node_modules`. Until it is installed,
   `npx tsc --noEmit` reports one error and three test files fail, **all in
   `src/ui/avatarEditor/*`** — none in this change set. A plain `npm install`
   clears it.
2. **Two scratch files to delete** — `src/game/__tmp_dep.ts` and
   `src/game/__tmp_mock_probe.test.ts`, both self-labelled "safe to delete" and
   both inert (typecheck passes; the second is an `it.skip`). My delete was
   refused by the sandbox's safety guard; remove them in your terminal:
   `rm src/game/__tmp_dep.ts src/game/__tmp_mock_probe.test.ts`
   Commit-shape matters because the first one is tracked-able junk and the second
   is the "1 skipped" in every test summary.
3. **Run the hosted smoke in two browsers** — `docs/hosting.md`'s list plus the
   "account-era additions". This is the gate your own docs call out as still owed,
   and it is the only thing standing between you and Stage 1 invites. Nothing in
   this change set makes it *harder*; the clump actually makes it easier to see
   two players at once.
4. **Configuration** (all owner-side, all documented in `docs/hosting.md`):
   Railway volume at `/data`; `PP_CORS_ORIGIN` pinned; `VITE_SHARED_WS_ENDPOINT`
   + `VITE_FEEDBACK_HTTP_ENDPOINT` set **and redeployed** (build-time); App
   Sleeping off; `PAPR_OWNER_ACCOUNT` set before real invites (unset ⇒ removal
   disabled and guests allowed); `PP_REVIEWER_TOKEN` and `PP_MODERATION_TOKEN`
   as two different values.
5. **Decide the two open privacy questions** (below) before inviting people you
   don't already know — they only matter for strangers.

---

## 3. Two real defects the review caught, and the fixes

Both were found by adversarial review *of our own change*, proven by running code
against the real modules, and fixed. Full detail in
`.cluster/papr-touch-home-social/review.md`.

- **A latent boot crash.** The player card had started importing the session
  module (`blockAccount`/`reportAccount`) while the session already imports the
  card — a cycle. It only worked because `main.ts` happened to evaluate the
  session first via an unrelated import; reversed, the game died at boot with
  `ReferenceError: Cannot access 'requestCardHandler' before initialization`.
  Fixed by removing the edge: the card takes both calls through the injection
  seam it already had. Pinned by a new test that fails if the import ever returns.
- **A silence-rule hole.** A blocked friend request stored nothing, so it never
  appeared in the asker's own outgoing list — meaning *"I asked and it isn't in my
  list"* told you *"they blocked me"*. A declined request vanished the same way.
  Fixed with tombstones: the asker's list now looks byte-for-byte identical
  whether the request was delivered, refused, or declined, and a repeat request
  answers `already-sent` in every case. The recipient still sees nothing, and the
  note is carried so the asker's view cannot be compared for differences.

Two minor fixes too: a ghost touch pointer that could silently turn every later
single-finger drag into a pinch (now reaped), and an incomplete test mock.

**Not fixed, deliberately:** the clump is client-authoritative, so a modified
client can park on a neighbour's lot. Determinism and termination are proven for
honest clients; the real fix is server-side lot assignment, which needs the layout
moved to `shared/` plus a server page-spawn table. Recorded as an open decision.

---

## 4. What is proven, and what is not

**Proven (run, this session):** root `tsc` clean for every file in this change
set; **1,141 tests pass** (the 3 failing files are the other workstream's missing
dependency); server **168 tests pass** and server `tsc` clean; styles check clean
at 1,014 rules; the import cycle reproduced and then proven gone; the profile
visibility truth table and the owner rule unit-tested; the friend-store silence
invariance unit-tested; clump determinism and the 5-account convergence tested;
wire back-compat classified hunk-by-hunk.

**Not proven — no test, no browser:** the whole touch overlay DOM, real
multi-finger pinch (needs an iPad), the clump publish wiring and the plate click,
the `/account/profile` routes, the desk editor end-to-end, the friend-note path
end-to-end, and the card's profile render. These are type-checked and built, not
clicked. The two-browser hosted smoke is still owed on top of all of it.

---

## 5. Open decisions

1. **Hiding the address plate per viewer.** Needs a per-viewer home projection;
   room state is shared today. Decide before inviting strangers.
2. **Server-side lot assignment**, per §3.
3. **`handle`.** The Neon table allows a unique handle; nothing claims one. Is a
   display name enough?
4. **In-game profile editor.** The wire supports it (`set-profile`) and the room
   honours it; today the desk is the only editor.
5. **Friends-of-friends scope.** One hop, symmetric. Two hops approaches
   "everyone" and was not built.

---

## 6. Files changed

**New:** `docs/address-plates-and-profiles.md`, `src/game/touchControls.ts` (+test),
`src/world/neighborhood.ts` (+test), `shared/src/protocol/profile.ts` (+test),
`server/src/profiles.ts` (+test), `server/src/profileHandlers.ts`,
`src/ui/playerCardDependencies.test.ts`.

**Changed:** `index.html`, `src/styles.css`, `src/game/{input,settings,guests,friendsPanel,visitPanel}.ts`,
`src/main.ts`, `src/net/{sharedSession,client,sharedHomeVisuals}.ts`,
`src/world/{places,neighborHomes,homeSite}.ts`, `src/ui/playerCard.ts`,
`shared/src/protocol/{constants,guests,messages,validate}.ts`, `shared/src/index.ts`,
`server/src/{friends,index,stores,database}.ts`, `server/src/rooms/{PaperRoom.ts,guests.room.test.ts}`,
`site/src/{pages/account.astro,scripts/account.ts}`, `docs/touch-and-tablet.md`,
`docs/next-session.md`.

`PROTOCOL_VERSION` stays at **11** — every wire change is additive (new keys and
optional fields only), following the `wear-design` precedent.

**Before deploying anything from this tree:** back up `/data`, and remember every
client must refresh.
