# Accounts, worlds, and social identity

2026-09-15 · Working architecture based on the account, landing-page, friends,
world-access, local-chat, and home ideas described for the invited alpha.

## The central rule

**A person carries their account; a world keeps its places.**

| Scope | Lives here |
| --- | --- |
| Account | handle, profile, avatar library, friends/blocks, DMs/mail, scrapbook inventory, chips, tech-tree knowledge and learning timestamps |
| World membership | which worlds appear on the landing page, role, invite/build/chat permissions, home-plot entitlement |
| World | terrain edits, houses, placed storage and its contents, crops, public signs/guestbooks, shared projects |
| Session | current position, facing, nearby presence, selected local-chat radius |
| Device | graphics, sound, controls, reduced motion, and an optional offline sandbox save |

The things in your scrapbook travel with you; the things you put into a chest,
cabinet, garden plot, or house stay in that world. Moving an item between those
places is a server transaction, not a client-side copy.

## Identity and sign-in

Use a managed identity provider rather than teaching the game server to store
passwords. **Clerk for identity + Neon Postgres for durable game data** is the
selected implementation for the current static site and Railway WebSocket server:

- email/password, Google, Apple, recovery, phone identities, and multiple
  linked sign-in methods are supported by Clerk;
- the browser receives a short-lived access token; Railway verifies its JWT
  against Clerk and authorizes every gameplay and control-center action;
- Postgres gives global lookup, friendships, world membership, and transactional
  inventory a durable home without replacing Colyseus as the live game server;
- Clerk secrets and database credentials live only on Railway. Administrator
  access is checked server-side and never inferred from frontend state or
  user-editable public metadata.

The game keeps its own stable `account_id`. Clerk's user id is an
identity attached to it, not the foreign key stamped on world data. That
preserves the existing paper-passport promise.

### Claiming an existing paper passport

1. The player signs in or creates an email/Google/Apple identity.
2. While the existing passport secret is on the device, Railway verifies it
   and links that passport's `account_id` to the auth user.
3. Existing mail, pouch balances, blocks, and maker credits keep the same id.
4. The passport secret is retired after a recovery window; other devices use
   normal account sign-in.

Do not silently mint a second account for an already signed-in passport.
Claiming must be idempotent, and an auth identity may claim only one account.

## Names and profiles

- `handle`: globally unique, case-insensitive lookup key; changed infrequently
  with a short redirect/history window so friends do not lose someone.
- `display_name`: non-unique friendly name shown over the avatar.
- optional bio and web/social links: profile data with per-field visibility.
- email and phone: authentication/recovery data, never public profile fields.
- presence: `online`, optionally current world, and `last_seen_at`, governed by
  privacy settings (`everyone`, `friends`, `nobody`).

Friendship is a mutual accepted edge. Blocks are account-global and override
friendship, presence, DMs, wayfinding, and world chat delivery.

## Worlds, permissions, and invites

Stop using one code for three different jobs. They become distinct records:

1. **Signup invitation** — may create/claim an account during the closed alpha.
2. **World invitation** — grants a particular account membership in a world.
3. **World id + slug/name** — durable identity and friendly label; never a
   secret and never an authorization decision by itself.

A world membership starts with `owner`, `admin`, `member`, `visitor`, or
`viewer`, plus explicit capabilities where needed (`enter`, `build`, `invite`,
`moderate`, `claim_home`). This supports invitation bundles for account + solo
only, the general shared world, a named friend-group world, and permission to
create new worlds.

World invitations are **non-expiring by default**. An admin may explicitly add
an expiry, use limit, or revoke them. Clerk's closed-alpha signup invitations
expire after 30 days. Once either invitation is accepted, membership no longer
depends on keeping the link; the world stays on the landing page until access
is removed.

## Landing page

The first useful account home contains:

1. world cards for Solo, general shared, and custom worlds, with online count
   and permission label;
2. inbox for DMs, parcels, invitations, and world notices;
3. avatar library/editor, usable without entering a world;
4. account scrapbook and tech-learning status;
5. friends: handle search, requests, online/last-seen state, and DM;
6. settings: sign-in methods, password/recovery, phone, privacy, profile,
   blocks, and session/device management.

Crop readiness and container summaries can be added to a world card once those
systems are server-owned. They are read models, not a second source of truth.

## Local chat, DMs, and activity

World speech is spatial. The server stamps the sender's page and position;
recipients choose a page radius (suggested initial choices: current page, 1,
2, or 4 pages). The server filters delivery before sending. Radius never
affects DMs.

Every delivered speech line appears both as a short-lived bubble attached to
the avatar and in an accessible DOM activity log. That one log gets multi-
select filters: nearby chat, DMs, friends, gifts/mail, world changes, learning,
gardens, and system notices.

Mutual friends may use the wayfinder only when the target allows location
sharing. Offer `off`, `same world`, and `precise in-world` privacy levels. A
player editing an avatar on the landing page is online, but has no unattended
body standing in a world.

## A default home

Provision a modest **home plot in each world that grants `claim_home`**, rather
than one building magically shared across worlds:

- a mailbox (a local ritual/access point for the account-wide inbox);
- a named sign linking to that account's profile for this world;
- a tent or partial paper-frame shelter with one editable wall;
- a starter work surface/Thingmaker pad, not the complete progression machine;
- one small world-owned storage box;
- two or three critter-attractor spots, so local wildlife visits without being
  permanently owned or duplicated.

Messages at the sign follow the owner's privacy setting (`friends`, `world
members`, or `nobody`). Gifts may be allowed separately.

## Migration from today's prototype

- Existing `accountId` values remain canonical and are claimable.
- The server-owned Neighborhood Pouch becomes the first account scrapbook
  ledger; rename it after the landing page makes the scope clear.
- Today's local solo bag and tech tree are not continuously uploaded. On first
  claim, offer one explicit, idempotent alpha migration with a review summary.
  After acceptance, the server owns account inventory and tech. Offline play
  becomes a separate unsynced sandbox unless a conflict protocol is built.
- Existing neighborhood save filenames seed world records. The first verified
  owner/admin claims them; terrain and pieces are not rewritten.

## Delivery order

1. **Durable reopen fix.** Empty room processes can reopen an existing save;
   join links do not create guessed worlds. Implemented with protocol v8.
2. **Auth foundation.** Clerk application/config, auth UI, Railway JWT
   verification, owner allowlist, invitation control, and one-time
   paper-passport claim. Production sign-in, the first control-center seam,
   durable identity tables, the idempotent claim API, and the explicit
   player-facing claim screen are implemented.
3. **Account/world schema.** Profiles, world registry, memberships, persistent
   signup/world invitations, and admin invitation screen. The foundational
   profile, world, and membership tables are implemented. Every claimed
   account idempotently receives an owned solo world and membership in the
   general shared world; durable invitation records and their controls remain.
4. **Landing page.** The signed-in account desk and identity summary are
   implemented, including live world-membership cards. Gameplay entry from a
   membership, inbox, avatar editor, account inventory/tech summary, and
   settings remain.
5. **Authority migration.** Account inventory + tech, then world-local
   containers/crops/homes.
6. **Social graph.** Search, requests, DMs, presence/privacy, and wayfinding.
7. **Spatial conversation.** Page-radius delivery, bubbles, and activity filters.

Do not put global friendship or account inventory in Colyseus room state.
Rooms consume authenticated account/world facts; they do not own them.
