# Next Session

Updated 2026-09-16 after the account desk and authenticated world-entry slice.
Start here.

## What landed

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

## Verification at closeout

- Root suite: **565 tests pass** across 58 files.
- `npm run edge:check` passes.
- `npm run build:web` completes for the game and nine-page Astro site.
- A separately emitted Node deployment artifact imports successfully with
  `api/account-entry.js` resolving `lib/gate.js`.
- Production sign-in, account provisioning, desk world cards, and world entry
  were exercised after deployment by the owner.

## Do this next

1. **Add Return to desk.** Put an always-reachable action in the in-game menu
   that leaves the current multiplayer room cleanly and navigates to
   `/account`. It must not leave stale presence behind or imply the avatar is
   still standing in the world. This is a small closure task, not a new portal
   system.
2. **Resume account authority migration.** Show an explicit, reviewable,
   idempotent import of the device's scrapbook inventory and learned techniques,
   then store accepted balances on the account. Do not continuously merge an
   offline sandbox into authoritative state.
3. **Continue the desk in dependency order.** Account inventory/tech summary
   follows the authority migration. Inbox, avatar library/editor, settings,
   and the social graph remain later slices.

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
  navigation control.
- Preserve the plain offline/solo sandbox distinction. It must not silently
  overwrite authoritative account inventory or tech progress.
