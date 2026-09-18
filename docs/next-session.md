# Next Session

Updated 2026-09-17 after avatar Phase D (designs over the wire) landed on
top of the wardrobe panel, a HUD layout fix, and the gathering feel pass.
Start here.

## What landed

- **The account wardrobe — avatar Phase D.** `AvatarDesignStore`
  (`server/src/avatarDesigns.ts`, `data/avatar-designs.json`) holds each
  account's designs, every one through `sanitizeAvatarDesign` on write and
  on load, bounded by `wardrobeMax` (24) and `maxBytes`. Authenticated
  routes manage it (`GET/PUT/DELETE /account/designs`); `GET
  /avatar-designs/:id` is the public, unguessable-id fetch that remote
  renderers use.
- **Wearing publishes.** A new `wear-design` room message (guests refused)
  validates the design, stores it on the wearer's account, and broadcasts
  the resolved key — so a mid-visit look change reaches everyone present,
  and the account never lags the look neighbors actually see. The client
  sends it on join and on every wear while connected; solo play stays
  quiet. Join-time `drawingKey`s are cleared unless the account holds that
  design (`resolveDrawingKey`), which is the server-side rejection path for
  borrowed or invented keys.
- **Remote cutouts wear real art.** `remoteAvatarVisuals` fetches the worn
  design by id (one cached texture per distinct design per session), and
  rasterizes it through the same exported path the local avatar uses
  (`rasterizeAvatarDesignTexture`). The tinted template remains the floor:
  while loading, on failure, and for guests.
- **The desk wardrobe card.** "Your looks" lists the account library
  read-only (names + sharing state) and offers the one-time, review-then-
  confirm device → account wardrobe import
  (`POST /account/import-wardrobe` — same explicit shape as the solo-save
  migration; a second attempt returns the original receipt and stores
  nothing). Drawing previews and the desk editor remain later slices.

- **Every loose ground pickup now behaves the same.** Food produce baskets
  used to wait on the plant for a deliberate click while seed packets and
  world piles collected on walk-over — which read in play as "some
  resources don't work". `updatePlantInteractions` now gathers any ready
  drop on walk-over; the click-and-hold harvest path remains for aiming
  from a distance.
- **Ready-to-harvest plants say so.** A ready drop breathes: a soft warm
  pool of additive gold light under it (per-instance material, animated
  opacity) plus a gentle sway, phase-offset per plant so a field shimmers
  rather than marches. Both stand still under `prefers-reduced-motion`
  (light stays, pulse does not).
- **A gather cursor verb.** Hovering a loose pile or a plant whose drop is
  ready shows the hand cursor wearing that same warm gold with a small
  patient bob (`data-cursor="gather"`); a still-growing plant keeps the
  plain hand. One verb for "there is something here to take", told by
  light and motion rather than new cursor art.

- **The wardrobe panel — avatar Phase C1.** Settings → "Open your wardrobe…"
  shows every saved look with a rendered preview: wear, rename, duplicate,
  delete, edit in the studio, and the per-design "Show on my player card"
  toggle (`sharedOnCard`). Copies start private; the share toggle does not
  reorder the list. The full-wardrobe rough edge from Phase B is fixed: a
  design that will not fit is worn anyway and handed to the panel as a
  pending save — save it into a freed slot, replace an existing look, or
  keep it worn-only. See `src/ui/avatarEditor/wardrobePanel.ts` and the
  store's new `renameDesign`/`duplicateDesign`/`setSharedOnCard` seams.
- **A pre-existing HUD overlap, found and fixed.** `npm run hud:check` —
  which recent sandbox sessions could not run at all — was failing at HEAD:
  every fresh player's minimap defaulted to (16, 16), squarely over the
  tool rail slots. Two causes, both in `src/ui/hud.ts`: the minimap's
  default position read a `.tool-toolbar` element captured at module scope
  before the toolbar is built (always null), and even resolved it measured
  the 160px rail strip rather than the 184px slots box that actually shows.
  Defaults are now computed lazily from the slots box (transform-aware, so
  the dock's rail re-scale is included), and
  `settleDefaultHudWidgetPositions()` re-places widgets still on their
  wire-time defaults once the rail exists — a saved position is never
  touched. The check passes again across all 7 viewports × 2 dock states.

- **The account tech store.** Learned plans now have an authoritative,
  account-owned home: `AccountTechStore` (`server/src/accountTech.ts`,
  `data/account-tech.json`), with the bounded `AccountTech` shape and
  `sanitizeAccountTech` in the shared protocol and a new
  `LIMITS.accountPlansMax` (500). `grantPlans` is a union — replaying a
  grant can never double-count knowledge — and a grant that adds nothing
  leaves the record byte-identical.
- **The tech half of the solo-save import.** `importSoloSaveIntoAccount`
  now grants the snapshot's plan ids through that store under the same
  reserve-then-credit gate as the pouch: the receipt is still committed
  first, a second attempt still grants nothing (plans included), and both
  `/account/me` and `/account/claim` now carry a `tech` record in the
  account carry snapshot alongside the pouch.
- **Learned techniques on the desk.** The Scrapbook card shows the
  account's learned techniques as friendly names (starter plans included —
  the server stores plan ids opaquely and does not know which are starters,
  which is deliberate), refreshed immediately after a solo-save import.
- **The desk inbox is real.** The Mailbox card now shows the whole bounded
  inbox, not a five-letter preview: waiting parcels come first, each with a
  **Collect into pouch** button, followed by the chronological record of
  letters and collected parcels. Collection from the desk funnels through
  the new authenticated `POST /account/claim-mail` into the same
  `MailStore.claim` the in-world scrapbook uses — one exactly-once
  claimed-id record shared by both doors, so a parcel collected here shows
  as collected in-world and vice versa. The in-game mailbox stays a warm
  ritual; it stops being the only door.

- **Clerk-backed accounts.** Production sign-in supports the managed identity
  layer while the game keeps its own durable account id. Existing paper
  passports can be claimed idempotently instead of producing duplicate people.
- **The account desk.** A signed-in player can see their identity and live
  world memberships outside the game. Every newly provisioned alpha account
  receives an owned Solo World and access to the general Shared World.
- **Durable account/world records.** Neon stores identities, profiles, worlds,
  memberships, and signup invitations. Railway remains the authorization
  boundary and Colyseus remains the live world server.
- **A first control center.** The administrator can provision an invitee,
  email or copy an email-bound Clerk invitation, or create a one-use papr.world
  link for a friend whose email is not yet known. The recipient supplies and
  confirms the address before the restricted Clerk invitation is created.
- **Authenticated world doors.** Desk world cards pass a short-lived Clerk
  session without putting it in the URL. Railway verifies identity and the
  membership's `enter` capability, Vercel mints the existing alpha-door pass,
  and the durable world UUID selects the room/save.
- **The production entry failures were closed.** The account-entry endpoint now
  uses Vercel's callable Node handler, reports non-JSON server failures clearly,
  and uses a Node-ESM-resolvable `.js` import in the compiled function. The
  deployed Solo and Shared World entry buttons are working.
- **Return to desk.** The Settings overlay (the in-game menu — see
  `hudMenus.ts`) has an always-reachable "Return to your desk" action under a
  new "Leaving" section. It calls the same `disconnectSharedSession()` cleanup
  the "Return to solo play" button already used — leaving the Colyseus room
  for real, not just navigating away, so no stale presence lingers for anyone
  still inside — then navigates to `/account/`. The desk URL
  (`src/net/accountDesk.ts`) is same-origin in production (game and site are
  one Vercel deploy) and points at the site's own `astro dev` server locally,
  since the two only share an origin once deployed.
- **Solo-save authority migration.** The desk's scrapbook card now offers a
  one-time, reviewable import of a local solo save. `sanitizeSoloMigrationSnapshot`
  (`shared/src/protocol/validate.ts`) clamps whatever `account.ts` reads out of
  `localStorage['pencil-and-paper.game-save.v1']` — bounded stacks, bounded bag
  size, bounded plan-id list — before it ever reaches the server. The player
  sees the counts (chips, resource/tool/item stacks, learned-plan count) and
  must explicitly confirm before anything is granted; there is no background
  upload. `SoloMigrationStore` (`server/src/soloMigration.ts`) reserves the
  receipt to disk *before* crediting a single unit — `importSoloSaveIntoAccount`
  in `server/src/accountIdentity.ts` then grants chips/resources/tools/items
  through the existing `MailStore.grant` primitive, the same one-time-crediting
  path the Neighborhood Pouch already trusts. A second import attempt (reload,
  double-click, retry after a network blip) returns the original receipt
  instead of granting twice. `POST /account/import-solo-save` is the new
  endpoint; the desk renders the stored receipt afterward with no button left
  to press. Learned plans recorded in the receipt are now granted into the
  account tech store under the same one-time gate (see the tech-store bullet
  above).

## Verification at closeout

- Root suite: **565 tests pass** across 58 files.
- `npm run edge:check` passes.
- `npm run build:web` completes for the game and nine-page Astro site.
- A separately emitted Node deployment artifact imports successfully with
  `api/account-entry.js` resolving `lib/gate.js`.
- Production sign-in, account provisioning, desk world cards, and world entry
  were exercised after deployment by the owner.
- Return to desk is verified against the root suite only: 519 tests across 49
  files pass (one pre-existing Playwright-download failure, unrelated — see
  `pencil-and-paper-sandbox-build` notes), `npx tsc --noEmit` clean,
  `npm run edge:check` clean, `npx vite build` clean. **Not yet exercised in a
  real browser** — this session's sandbox cannot run Playwright or reach a
  deployed environment. The owner should click it once from inside a shared
  room before trusting it: confirm the avatar actually disappears for the
  other player and `/account/` loads clean.
- Solo-save authority migration (previous pass): root suite 570/571 pass across 59
  files (same pre-existing Playwright-download failure as above, still
  unrelated), `npx tsc --noEmit` clean, `npx vite build` clean. Server package
  checked on its own (`server/` copied fresh, its own `npm install`):
  `npx tsc --noEmit` clean, `npx vitest run` **52/52 pass**, including the new
  `soloMigration.test.ts` and the `accountIdentity.test.ts` import-flow cases.
  Site package checked on its own the same way: `npx astro check` is clean for
  both changed files (`account.astro`, `account.ts`); the 17 errors it reports
  elsewhere are pre-existing and untouched by this pass (redeclared
  block-scoped names across unrelated page scripts, plus a `vitest`-types
  error astro check picks up from a `.test.ts` file — worth a look someday,
  not blocking); `npx astro build` completes and bundles `account.astro`'s
  script.
- Account tech store (this pass): root suite **584/584 pass across 61 files**
  (that Playwright-download failure did not reproduce this time), root
  `npx tsc --noEmit` and `npm run edge:check` clean, `npm run build:web`
  completes. Server package: `npx tsc --noEmit` clean, `npx vitest run`
  **60/60 pass** including the new `accountTech.test.ts`, the expanded
  `accountIdentity.test.ts` plan cases, and `sanitizeAccountTech` in the
  shared protocol tests. Site package: `npx astro check` reports zero
  diagnostics in the changed files (`account.astro`, `account.ts`) and only
  the same pre-existing errors elsewhere; `npx astro build` completes. (The
  checker itself, `@astrojs/check`, was missing from this environment's
  `site/node_modules` and was installed with `--no-save` to run the gate;
  `site/package.json` and the lockfile are untouched.) **Still not exercised
  in a real browser** — the hand proof in "Do this next" item 1 now also
  covers the learned-techniques list after an import.
- Desk inbox (same pass, same gates re-run green): the new endpoint is thin
  glue over `MailStore.claim` (already covered by `mail.test.ts`'s
  exactly-once cases), so the identity tests cover its collaborators rather
  than the Express wrapper, matching house style. The bundled account page
  (`dist/_astro/account.astro_astro_type_script_*.js`) contains the
  claim-mail call. **By-hand proof owed with the rest of item 1:** receive a
  parcel (Pip's welcome parcel will do), collect it from the desk, reload,
  confirm it now reads "parcel collected" and the pouch total rose by the
  attachment.
- Wardrobe panel + HUD fix (this pass): root suite **592/592 across 62
  files** (8 new tests in `src/ui/avatarEditor/wardrobe.test.ts` —
  round-trips, the wardrobe cap, rename normalization, copy-name bounds,
  private-by-default duplicates, share toggle without reordering, worn
  pointer cleanup, corrupt-entry skipping), `npx tsc --noEmit` clean,
  `npm run styles:check` clean (781 rules, no shadowed declarations),
  `npm run edge:check` clean, `npx vite build` completes, and
  `npm run hud:check` passes against a real dev server across 7 viewports ×
  2 dock states — it was failing at HEAD before the minimap fix above, so
  run it after pulling. **Not yet clicked in a real browser by hand**: save
  a few looks, then wear/rename/duplicate/delete/share them from Settings →
  "Open your wardrobe…", and stuff the wardrobe past 24 looks once to see
  the pending-save card.
- Gathering feel pass (previous pass, gates re-run green — 592/592, tsc,
  styles:check at 785 rules, vite build): verified in a real headless
  browser against the dev server — the game boots with zero console/page
  errors, and a pointer sweep over the spawn clearing engages the new
  `gather` cursor over a loose pile and `hand` over other interactables.
  Note for future smokes: a fresh profile opens the first-run avatar
  studio over the world, so seed `pp.avatar.firstRunDone.v1` before
  sweeping. **By-hand proof owed in play**: grow any food crop to ready
  (growth is real-time, so this is a patience check), confirm the gold
  pool + sway and the gather cursor on hover, and walk over the basket to
  confirm it collects like every other loose pickup.
- Avatar Phase D (this pass): root suite **600/600 across 63 files** (8 new
  `avatarDesigns.test.ts` cases — save/update/bounds, ownership-scoped
  deletes, `resolveDrawingKey` incl. guests and borrowed keys, one-time
  import receipts, corrupt-entry-skipping reloads), root + server `tsc`
  clean, server **68/68**, `npx vite build` and `npm run edge:check` clean,
  site `astro check`/`astro build` clean with the wardrobe card bundled.
  Against a real running server: `GET /avatar-designs/:id` serves a seeded
  design, a bogus id 404s, and unauthenticated owner routes are refused.
  The game boots clean in a headless browser (the new
  avatarLook → sharedSession import chain has no cycle). **Not yet proven
  with two live clients** — see "Do this next" item 2.

## Do this next

1. **Still owed on browser proof.** The solo-save import (inventory and
   tech) and Return to desk have only been verified against the test/build
   suite, never a real browser or a real solo save. Play solo long enough to
   bank a few resources/tools/a learned plan, sign in at the desk, confirm
   the review counts match, accept, reload, and confirm the receipt, the
   pouch amounts, and the learned-techniques list all match; then click
   Return to desk once from inside a shared room and confirm the avatar
   disappears for the other player.
2. **Phase D's by-hand proof — two browsers.** Make a look, wear it, join
   one neighborhood from both browsers, and confirm the second browser
   renders the actual drawing (not the tinted cutout) — then change the look
   mid-visit and confirm it updates for the other player. Also import the
   device wardrobe from the desk once and confirm the "Your looks" list and
   one-time receipt behave.
3. **Continue in dependency order.** Avatar **Phase E — the player card**
   (card overlay, "made by —" entry points, blocked-player behavior) is the
   next avatar slice; the desk's drawing previews/editor and settings
   remain on the accounts side, and C2 (the closet) stays gated on
   report/hide for displayed drawings (§6.1).
4. **Give shared-world learning a server credit route.** The tech store's
   `grantPlans` is the seam; nothing calls it in-world yet, so knowledge
   earned in a Shared World still lives only in local saves. Wire server-side
   learning completion (or the first shared crafting slice) to it when that
   gameplay lands.

## Watch out for

- The account carries scrapbook inventory, chips, learned techniques, avatar
  library, friends, and messages. A world owns terrain, houses, placed storage,
  crops, and shared projects. Do not blur this boundary during migration.
- A world UUID is identity, not authorization. Every entry still requires a
  verified account and an `enter` capability.
- Clerk secrets and database credentials stay server-side. Never put session
  tokens in game URLs, logs, or persistent browser storage.
- Signup links may expire; accepted account and world memberships do not depend
  on retaining an invitation link.
- `PROTOCOL_VERSION` is 8. Bump it for wire-shape changes, not for the desk-only
  navigation control. The `wear-design` room message (Phase D) was added
  without a bump, deliberately: it is purely additive — no existing shape
  changed, older clients simply never send it, and an older server ignores
  it — unlike the v4/v8 changes that altered what existing messages mean.
- Preserve the plain offline/solo sandbox distinction. It must not silently
  overwrite authoritative account inventory or tech progress — the migration
  is explicit, reviewed, and one-time by design (`SoloMigrationStore.reserveOnce`
  writes its receipt before crediting anything, precisely so a second attempt
  can never double-grant); do not turn it into a background sync.
