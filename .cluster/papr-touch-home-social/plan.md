# Plan — papr.world: touch/tablet, home & neighborhoods, profiles, multiplayer readiness

taskId: `papr-touch-home-social`
Repo: `~/Dropbox/work/custom-work-tools/games/pencil-and-paper` (HEAD `ba32f1d`, clean tree at start)
Date: 2026-09-20

## What the owner asked for (verbatim intent)

1. **Touch/tablet**: make the game touch-interface friendly; validate/replace the
   plan in `docs/touch-and-tablet.md` with more established game patterns.
2. **House**: player's own house — building / improving / expanding. Wire the
   **starter tent** and **Thing Maker level 1** to spawn in **neighborhood
   clumps**, with **"address" plates** showing the username, linked to their
   **player card** (privacy-dependent).
3. **Friend request**: from the plate/card, privacy permitting, send a friend
   request with an **optional short message**; the act of asking must tell the
   recipient they'll be sharing **basic profile info**.
4. **Profile**: additional bio info — short bio, social links — with per-field
   visibility: **everyone / friends / friends-of-friends**, but **always visible
   when I send a request**.
5. **Blocking/reporting** must tie in to all of the above.
6. **Status**: what is missing right now that should be added to start **real
   multi-player testing**.

## Current state (verified against source, not memory)

- `docs/touch-and-tablet.md` — plan only, "not built". Touch gaps confirmed in code:
  no `touch-action` on the canvas, one-pointer bookkeeping (`lastPointerX/Y`),
  no pinch, no touch move pad, no Act(R)/Rotate buttons, `100vh` in places.
- Home exists: `world/homeSite.ts` (tent at fixed offset from the Home place),
  `sim/dwelling.ts` + `catalogs/dwellings.ts` (parts/projects/refunds),
  `game/homePanel.ts`, `game/dwellingLook.ts`/`dwellingExterior.ts`,
  `world/neighborHomes.ts` + `net/sharedHomeVisuals.ts` (neighbor tent + sign).
  Home marker published via `ClientMessage.SetHome`; server `HomeSchema`.
- **No clumping**: every player's Home place defaults to their spawn point, so in
  a shared world homes would stack. No lot assignment exists.
- Player card: `src/ui/playerCard.ts` + `ClientMessage.RequestPlayerCard` →
  `PlayerCardInfo { accountId, found, papersSince?, sharedDesignIds? }`.
- Friends: `server/src/friends.ts` (mutual, blocks win, quiet no), client
  `src/game/guests.ts` + `game/friendsPanel.ts`. **No request message.**
- Profiles: Neon `player_profiles` table **already has** `bio`, `social_links`,
  `privacy`, `handle` columns — but **no API and no UI read/write them**.
- Blocks/reports: `server/src/blocks.ts`, `moderation.ts`, `shared/protocol/moderation.ts`,
  `/review/reports` with its own token. Wired into chat/mail/cases/doors/card.
- Protocol is **v11**. `LIMITS` in `shared/src/protocol/constants.ts`.

## Work streams (file-disjoint per round)

### Round 1 (parallel, 4 subagents)

| # | Subagent | Role | Owns (files) | Output |
|---|----------|------|--------------|--------|
| A1 | Touch controls | Implement touch/tablet play S1–S3 | `src/game/touchControls.ts`(new)+test, `src/game/input.ts`, `src/game/settings.ts`, `index.html`, `src/main.ts`, `src/styles.css` | `subagent_a1_touch.md` |
| A2 | Profile contract | Shared profile + visibility + friend-message wire contract | `shared/src/protocol/profile.ts`(new)+test, `messages.ts`, `guests.ts`, `validate.ts`, `constants.ts`, `shared/src/index.ts` | `subagent_a2_profile.md` |
| A3 | Neighborhood | Clump lot layout + address plate | `src/world/neighborhood.ts`(new)+test, `src/world/neighborHomes.ts`, `src/net/sharedHomeVisuals.ts`, `src/world/homeSite.ts` | `subagent_a3_neighborhood.md` |
| A4 | Readiness audit | Status review for real multiplayer testing | (read-only) writes audit | `subagent_a4_audit.md` |

### Round 2 (depends on Round 1)

| # | Subagent | Role | Owns | Depends |
|---|----------|------|------|---------|
| B1 | Client social | Player card bio/links + friend request w/ message + plate wiring | `src/ui/playerCard.ts`, `src/game/friendsPanel.ts`, `src/game/guests.ts`, `src/main.ts`, `src/styles.css` | A1, A2, A3 |
| B2 | Server profile | Profile store + routes + friend message | `server/src/profileHandlers.ts`(new), `database.ts`, `index.ts`, `stores.ts`, `friends.ts` | A2 |
| B3 | Desk profile | Profile editor on the account desk | `site/src/pages/account.astro`, `site/src/scripts/account.ts`, `site/src/styles/*` | A2, B2 |

### Round 3

| # | Subagent | Role | Output |
|---|----------|------|--------|
| R1 | Review | Adversarial review: facts, protocol back-compat, privacy/block correctness, access-control | `review.md` |

## Ownership rules

- One file = one owner per round. No subagent edits a file outside its list.
- Every subagent must run `npx tsc --noEmit` plus its targeted `npx vitest run <files>`
  and report exact output. `npm run styles:check` if CSS changed.
- Nothing may break: keyboard/gamepad input, solo play, `PROTOCOL_VERSION` semantics
  (additive changes only unless bumping v12), block/report silence rules.
- Additive-only wire changes; never weaken "a block is silent".

## Delivery

- Code changes in the repo (touch controls, shared profile/visibility model,
  neighborhood clumping, address plates, friend-request message, server profile
  routes, desk profile editor).
- Docs: refreshed `docs/touch-and-tablet.md`, new `docs/address-plates-and-profiles.md`,
  updated `docs/next-session.md`.
- `DELIVERY/` summary report for the owner.

## Open assumptions (stated at delivery)

- "Neighborhood clumps" = deterministic lot assignment around already-published
  homes on the same page (spacing, not ownership — matches `land-and-dwellings.md`).
- "Friends of friends" visibility = one-hop through the accepted-friendship graph.
- Profile image/avatar stays as-is; only bio + social links are added as fields.
