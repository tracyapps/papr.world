# Address plates, profiles, and the neighborhood clump

Written 2026-09-20 from the owner's request, alongside the touch pass. Companion
to `house-and-home.md` (what the house *is*), `land-and-dwellings.md` (where
homes *are* — the spacing-not-ownership rule this doc obeys), and
`accounts-worlds-and-social.md` (the account/world boundary this doc does not
cross).

This doc answers four of the owner's asks in one place because they are one
system: **a neighbour's house carries an address that opens their card; the card
is where you ask to be friends and where you block or report; and what the card
shows is governed by the profile's own visibility settings.**

## The short version

- New players' homes are **placed for them**, in a **clump** around the page's
  spawn point, instead of every player's tent stacking on the same spot.
- Every home carries two boards: the existing **sign** (OPEN HOUSE / BUILDING A
  HOME) and a new **address plate** — `No. 12 · Wren` — which is a click target
  that opens that player's **player card**.
- The card is the one place you learn about a person: their name, avatar,
  creations, papering-since, shared looks, a **short bio**, **social links**, and
  three actions — **ask to be friends** (with an optional short note),
  **block**, **report**.
- A profile field is visible to **everyone**, **friends**, or **friends of
  friends**. One rule overrides that: **if you ask someone to be friends, they
  can read your basics** — asking is not a blind request, and the game says so
  out loud at the moment of asking.

## Neighborhood clumps

**Why.** `land-and-dwellings.md`'s rule is *spacing, not ownership*: there is no
title to land, only a rule that certain things cannot be built too close. The
starter home is the clearest case — every player gets one at signup, and in a
shared world they would all stand on the spawn point.

**The layout** (`src/world/neighborhood.ts`, renderer-free and pure). The first
home on a page is the clump's origin (it *is* the spawn point, which is where
every Home bookmark starts). After that, lots are concentric rings of `6·ring`
slots at radius `ring · LOT_SPACING`, nearest free slot first, so a full inner
ring spills outward. Even rings are turned half a slot past odd rings so the
clump does not read as spokes, and the page id adds its own turn so two pages do
not get identical clumps.

- **`LOT_SPACING = 8`.** Derived from what a home claims, not picked for looks:
  the house body plus a full-size annex reaches 2.7 from the middle, so two fully
  grown houses need 5.4 just to stop touching. The design insists the gap is the
  protected thing and must stay usable, so 8 leaves ~2.6 of clear walkable ground
  in the worst-angled pair — close enough to read as neighbours, far enough never
  to merge into a terrace.
- **Deterministic with no sync.** The answer is a pure function of `(anchors,
  origin, page)`: no clock, no RNG, no stored lot number. Positions are quantised
  to thousandths so two engines agree exactly, and the first lot is the origin
  returned untouched — which is why **solo play is unchanged to the last
  decimal**.
- **Self-healing, not racy.** Two brand-new players can both publish at the
  origin before either sees the other. `resolveHomeLot` resolves it by account
  id: a lot contested by an account that sorts *earlier* is yielded, and the
  later account moves out to the next free lot. Both clients compute the same
  answer from the same synced state, so it settles without a round trip.
- **`LOT_CAPACITY = 817`** over the first 17 rings is a guard, not a policy. When
  a clump is full `nextLot` returns `null` and the design's answer applies: the
  next neighbourhood opens adjacent, rather than densifying.

**Starter home and Thing Maker.** The starter home is still the **tent** (the
*absence* of built parts, `dwellingStage()`), with the **Thing Maker at level 1**
beside it — both unchanged. What changed is only *where* they stand: placed on
the player's clump lot rather than on the raw spawn bookmark.

**Open:** the clump only dodges what the caller passes as anchors. When shops,
landmarks and water join the spacing rule, the caller adds them to the same
array — no change to the layout module. And lot assignment is **client-side**
today (the client knows the page spawn; the server does not). A hostile client
could publish a home on someone else's lot; the self-heal moves the *victim's*
client, not the offender's. Moving assignment into the server is the honest fix
and needs the layout moved to `shared/` plus a server-side page-spawn table.

## The address plate

**Text: `No. 12 · Wren`** — a number and the owner's display name. The number is
`1 + (stableHash(accountId) % 99)`: derived from the account id alone, so it is
identical on every client with nothing stored or synced, and it **survives a
rename** (the house keeps its number when the owner changes their name). Two
homes may share a number; nobody files by it.

**Drawing** (`src/net/sharedHomeVisuals.ts`): its own short stake on the far side
of the door from the sign, in the same paper-cutout style, one size down. The
plate **never** changes with the open-house state — an address does not.

**The click** opens the player card: `pickSharedHomePlateAtScreen` is registered
as a screen interaction at priority 83, *above* the house/sign handler (82), so a
click on the plate opens the card rather than the door panel.

### Privacy, honestly

The plate prints the **display name**, which is already public: it is in synced
room state, over the avatar, and on the home sign. So nothing new is exposed by
the words on the plate.

What the plate *links to* — the card — respects privacy fully: an unknown
account, a guest, or a block in either direction collapses the server's answer to
`found: false` → **"Nothing to show here."**, with no reason given. That is the
same silence rule the rest of the social layer uses.

**What does not exist yet:** a per-viewer choice to *hide the plate itself*. Room
state is identical for every client, so one client cannot be shown a marker
another cannot without a per-recipient projection the room does not have. The
concrete fix is a per-viewer home projection (send homes per client rather than
in shared state) — a real change, deliberately not bundled here. Until then, a
player who wants no sign at all has no switch, which is worth deciding before
inviting strangers rather than friends.

## The player card

Reached by clicking a live avatar, a neighbour's home, or the **address plate**.
It renders in two waves, because that is how the data arrives:

1. **Instantly, from already-synced state:** name, avatar, "made N things on this
   page."
2. **On the server's answer** (`PlayerCardInfo`): papering-since, shared looks,
   and now the **relationship**, **bio** and **links** — the last three filtered
   by the visibility rules below.

**Actions on the card:** ask to be friends (with an optional note), accept or
decline an incoming request, **block**, and **report**.

## Profiles and visibility

A profile is `{ bio, links, visibility }`.

| Field | Bound |
| --- | --- |
| bio | 280 characters, control characters stripped |
| links | up to 6; kinds from a fixed allow-list (website, instagram, x, youtube, twitch, discord, other); `http(s)` URLs only, 200 characters each |

**Visibility is per field**, and each field is set to one of three audiences:

| Audience | Who sees it |
| --- | --- |
| Everyone | anyone who can find you, including a stranger |
| Friends | only accepted friends |
| Friends of friends | friends, and their friends |

Default is **friends** — closed by default, widened deliberately.

**The rule that overrides all of it (the owner's).** If you ask someone to be
friends, they can read your basics — your bio and links — *regardless of the
visibility above*. The reason is the one the owner gave: a request should not be
a blind request; the person being asked should be able to see who is asking. It
is implemented as `profileForViewer(profile, relationship, { hasSentRequest })`
in `shared/src/protocol/profile.ts`, and it is pinned by a test
("always shows the basics to someone the owner has asked to be friends"). It
applies **only to the actual addressee of a live request**, never to the public.

**Where the relationship comes from** (`server/src/profiles.ts`,
`relationshipBetween`): `self`, `friend`, `friend-of-friend` (one hop through the
mutual friendship graph), or `stranger`; a block in **either direction**
collapses everything to `stranger` and the card stays "Nothing to show here."

**What the player is told.** Because the override is surprising, both surfaces say
it plainly where it matters:

- Desk ("Your profile" card): *"One thing worth saying plainly: if you ask
  somebody to be friends, they can read your bio and your links — whatever you
  have set above. Asking to be friends should never be a blind request; the
  person you are asking gets to see who is asking. Nobody else sees more than
  your settings allow."*
- In-game (the moment of asking): *"Asking someone to be friends shows them who's
  asking — your name, and whatever you've written to share (your bio and links).
  Your privacy settings won't hide it from the person you've asked."*

## Friend requests, with a short note

A friendship is still a mutual accepted edge (`server/src/friends.ts`), with the
three properties that matter: **mutual or nothing**, **quiet no** (declining
tells the asker nothing), and **blocks win**.

New: a request may carry an **optional note**, ≤140 characters, sanitized on the
server, stored with the request, and shown to the recipient. It is **not a
lever**: a declined request drops the note with the request, and a request to
someone who blocked you is still silently dropped and stores nothing. The note
changes nothing about who may learn what.

## Block and report

Both already existed and both already worked — the **gap was reach**, and only
one entry point: the ⋯ menu on a chat line. That meant you could not block or
report a person who had not spoken. Now both are on:

- the **player card**,
- the **friends panel** (per row, friends and incoming requests),
- the **home door / visit panel** (kept clearly distinct from "Ask to leave",
  which is not a block and does not end a friendship).

Both funnel into the existing room messages, so **no new server state was
needed** — `ReportIntent.messageId` was already optional, which is what makes a
report about a person (rather than a line) possible.

**The silence rule is unchanged:** a blocked player gets exactly what a closed
door or an empty answer gives, and is never told why. Reporting a person needs no
typed reason.

## Where it lives

| Thing | Home |
| --- | --- |
| Clump layout | `src/world/neighborhood.ts` (pure); `resolveHomeLot` in the same file |
| Home placement write | `src/world/places.ts` (`setHomePlace`) |
| Plate (words + hit test) | `src/world/neighborHomes.ts`, `src/net/sharedHomeVisuals.ts` |
| Card | `src/ui/playerCard.ts` |
| Friend/entry panels | `src/game/friendsPanel.ts`, `src/game/visitPanel.ts`, `src/game/guests.ts` |
| Block/report transports | `src/net/sharedSession.ts` |
| Profile model + visibility rules | `shared/src/protocol/profile.ts` |
| Profile store + relationship | `server/src/profiles.ts` |
| Desk routes | `server/src/profileHandlers.ts` (`GET`/`POST /account/profile`) |
| Desk editor | `site/src/pages/account.astro`, `site/src/scripts/account.ts` |

**Store choice.** Profiles live in `data/profiles.json` (`ProfileStore`), keyed by
account id — the same shape as friends, blocks, tech and designs, and it works
with `DATABASE_URL` unset. The Neon `player_profiles` table already has `bio`,
`social_links` and `privacy` columns; nothing had ever read or written them. A
later migration to Neon is a copy, since the shared `PlayerProfile` is exactly
that table's intent.

**Wire.** All additive: one new client message (`set-profile`), optional-only new
fields on `PlayerCardInfo` and the friend-request records, and new `LIMITS`. No
`PROTOCOL_VERSION` bump, following the `wear-design` precedent (a purely additive
message does not bump).

## Open questions

1. **Hiding the address plate from specific viewers.** Needs a per-viewer home
   projection (see "Privacy, honestly"). Decide before inviting strangers.
2. **`handle`.** The Neon table allows a unique, case-insensitive handle;
   nothing claims one. Is a handle wanted, or is the display name enough?
3. **Server-side lot assignment.** The clump is client-assigned and self-healing;
   a hostile client can still claim a taken lot. Move the layout to `shared/` and
   assign in `PaperRoom.handleSetHome` when it matters.
4. **Friends-of-friends scope.** One hop, symmetric. Two hops? Transitive
   "friends of friends of friends" is almost "everyone" and was not built.
5. **Profile in the game, not just the desk.** The wire has `set-profile` and the
   room honours it; the desk is today's editor. An in-game editor is unbuilt.
