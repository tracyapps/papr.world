# Communal Multiplayer — Design & Architecture Outline

The plan for making papr.world feel like Glitch or Second Life at their best:
friends gathering, chatting, and building together in a world that remembers.
This extends `multiplayer-readiness.md` (the "two browsers share a
neighborhood" plumbing plan) with the *communal* layer — the social mechanics
those games ran on, what they cost architecturally, and what has to change in
our current code to support them.

Written so any agent can pick up any section independently. Each phase in
§6 has acceptance criteria; each conflict in §4 has a concrete fix.

## Decisions locked (2026-08-10)

These were decided with tapps and are not open questions:

| Decision | Choice |
| --- | --- |
| Scale | **Both, phased.** Cozy neighborhoods first (≤16/room), data model designed so neighborhoods stitch into a commons later. |
| Identity | **Real accounts** (email/passkey), phased in via a pseudonymous "paper passport" first — see §2.1. |
| Safety | **Invite-only at launch**, moving to public-ready only once moderation is rock solid. |
| First build | **Identity + persistence** before any social surface. |

---

## 1. What actually made Glitch and Second Life communal

Neither game succeeded because of raw tech. They succeeded because of a
handful of reinforcing mechanics. Inventory, mapped to papr.world:

**The world remembers.** The single biggest driver. Anything a player changes
persists and is visible to everyone after. A bench you placed is *there
tomorrow, for your friend*. This is why server-side persistence (§2.2) is
load-bearing and why `localStorage` saves are a dead end for shared spaces.

**Ambient co-presence.** Most social value comes before anyone talks: seeing
a paper cutout wander across the meadow, a nameplate resolving as they get
close, a chat bubble drifting up. Glitch streets and SL regions were small on
purpose — presence reads better in intimate spaces. Our neighborhood-room
model is already the right shape.

**Provenance everywhere.** Both games stamped a creator on everything.
"Made by wren" turns objects into social objects — conversation starters,
reputation, gratitude targets. `land-and-dwellings.md` already requires maker
id (planted gardens mail their harvest to the planter). §4.1 flags that our
current `ownerId` cannot do this job.

**Non-zero-sum generosity.** Glitch literally rewarded kindness as a
mechanic. `economy.md`'s non-fungible generosity decision is *exactly* this —
it's not flavour, it's the multiplayer glue. Implication: gifts and mailed
harvests need a **server-side mailbox** that works while the recipient is
offline (§2.2).

**Asynchronous togetherness.** The under-appreciated one. Most "playing
together" happens *apart*: coming back to find a friend built a fence, left a
note, watered your garden. Cheap, high-value features: a "while you were
away" journal, guestbooks on dwellings, letters. These are also the most
accessible social features — no scheduling, no real-time pressure (§2.7).

**Gathering places and rituals.** SL events, Glitch's shrines and street
projects. Social density needs anchors: a commons page, benches/campfires as
natural chat spots, scheduled low-key events (a weekly bonfire). The spacing
rule already protects commons from being built over.

**Group projects.** Glitch's collective feats — a shared goal with a visible
progress bar and a contributions ledger — were peak communal play. Late-phase
here (§6 Phase G), but the ledger wants maker ids, which is another reason
identity comes first.

**The scale illusion.** Neither game was one giant simulation. SL is a grid
of ~256m regions; Glitch was hundreds of small streets with door transitions.
"Big world" = many small rooms + easy travel. This validates the phased
answer: neighborhoods now, portals/commons later. We never need seamless
world streaming, and shouldn't build it.

---

## 2. Architecture pillars

### 2.1 Identity and accounts

The durable key for *everything social* is `accountId` — maker credit,
mailboxes, block lists, friendships. Colyseus `sessionId` is transport
plumbing only and must never be stored in world data (§4.1).

Phased so we never hold PII before we need to:

1. **Paper passport (build now).** Server-issued account: `accountId` (UUID)
   + secret token, created via one HTTPS call, stored client-side. No email,
   no PII. Join options carry `{ accountId, secret }`; server verifies
   (hashed secret at rest) and stamps the authenticated `accountId` onto the
   player. Invite-only launch makes this sufficient.
2. **Claimable accounts.** Attach an email (magic-link) or passkey to an
   existing passport for recovery + multi-device. The passport id never
   changes, so nothing in the world migrates. Passkeys preferred where
   available — no password to phish, nothing secret stored server-side.
3. **Guests can still try.** An invite link should let someone walk around
   before committing; if they build something, prompt to claim a passport so
   their work isn't orphaned. Never lock a person out of their own creations.

Privacy duties once email exists: store the minimum, document retention,
support deletion. **Deletion must not delete the world** — a departed
player's pieces stay, credited to a tombstone ("a paper friend who moved
away"). Decide this rule now; it's in the passport design (§4.12).

### 2.2 Persistence — the world remembers

Server owns durable state for shared spaces. The shared `RoomSnapshot` type
is already the save shape; add a `version` field and simple migrations from
day one.

- **v1: JSON file per neighborhood**, atomic write (temp file + rename),
  debounced (e.g. 5s after last change, plus on room dispose). At ≤16
  players and 500 pieces this is completely fine, transparent, and diffable.
- **v2: SQLite** when rooms multiply or mailboxes/accounts get busy. The
  seam is a `Persistence` interface so nothing else changes.
- **Mailbox**: per-account list of `{ from, kind, payload, at }`, delivered
  on join. This is the offline half of gifting and mailed harvests.

The client's `localStorage` save remains the *solo* save and becomes a
cache. Solo and shared play must run the same rules through the same command
layer (`src/sim/commands.ts` is already intent-shaped — good), differing
only in who is authoritative. See §4.3 for the split-brain trap.

### 2.3 Topology and scale (the "both, phased" plan)

- **Now:** one Colyseus room = one neighborhood (a cluster of pages), cap 16.
- **Next:** page-scoped interest — the server only syncs entities on the
  player's page and its neighbors. This is the one piece of "MMO tech" worth
  building, and it's also a privacy/perf win at small scale.
- **Later:** a commons = just another room that many people rotate through,
  reached by **portals** (Glitch-style door transitions, a page-turn
  animation is thematically perfect). No seamless cross-room streaming,
  ever — it buys little and costs enormous complexity.
- Room-per-neighborhood also shards naturally across processes/hosts when
  the day comes. Colyseus supports this; don't pre-build it.

### 2.4 Chat and social systems

- **Local-first chat**: heard on your page + adjacent pages, with chat
  bubbles in-world. Feels natural, keeps logs small, shrinks the moderation
  surface. A separate friends/whisper channel later.
- Chat history should **not** live in synced room Schema (§4.2): send
  recent history as a message on join, then append via broadcasts. Lets the
  server honor mutes/blocks per-recipient.
- **Mute/block are account-level, personal, and instant** — no appeal, no
  notification to the blocked. They're stored with the account, enforced
  server-side (a blocked player's chat is simply not delivered to you).
- Emotes/reactions: a small palette (wave, sit, heart, "come see") carries a
  lot of sociality for people who don't type fast or at all.

### 2.5 Security and server authority

Already right: intents in, validation, authoritative state, anti-teleport
clamp, protocol version gate. Still needed:

- **Rate limits per intent type** in `LIMITS` (move is naturally capped;
  place/gather/chat need explicit ones). One table in `shared/`, enforced
  server-side, readable client-side for friendly pre-checks.
- **Server-side world validation.** Spacing, water, terrain rules must run
  on the server, which means the rules and the terrain/catalog data they
  need must live in renderer-free shared code (§4.4). Precompute per-page
  masks; never port the expensive client query path (§4.7).
- **Validate the `page` field** — adjacency-check it against last position
  instead of trusting the string.
- Per-player placement caps in addition to per-room caps.
- Transport: `wss://` + HTTPS only in production; CORS locked to the client
  origin; secrets never logged.

### 2.6 Moderation — invite-only → public-ready

Phased to match the decision:

1. **Invite codes** (launch): a neighborhood has a join code/link; no
   strangers. Personal mute/block ships here anyway — friends have bad days.
2. **Host powers**: the neighborhood's host can kick, mute, and un-invite;
   ban list persists with the room save.
3. **Public readiness** (the "rock solid" bar before opening up):
   - Report primitive (report a player/message → queue with context
     snapshot for a human).
   - **Prefer friction over auto-censorship.** Word filters famously punish
     marginalized dialects, reclaimed language, and non-English speakers.
     Slow-mode, new-account limits, and human review scale better ethically.
   - ToS + age gating. **Flag:** the paper-craft aesthetic will attract
     children. If under-13s are plausibly present, COPPA/child-safety
     obligations apply (not legal advice — get real advice before public
     launch).
   - Admin tooling: view/restore room snapshots (persistence v1's JSON
     files make this almost free).

### 2.7 Accessibility of communal play

Non-negotiable framing: **safety tools are accessibility tools**, and async
play is the most inclusive social mode.

- **Text-first, always.** No voice chat requirement, ever. If voice ever
  exists it's opt-in with live captions.
- **Chat log is real DOM**, not canvas text: `role="log"`,
  `aria-live="polite"`, focusable, resizable text, user-adjustable contrast.
  Chat bubbles in-world are a *mirror* of the DOM log, never the only copy.
- **Keyboard path for every social act** — approach, greet, gift, sit,
  mute — with visible focus. Emote palette navigable by keyboard and
  screen reader (each emote has a text name that also appears in the log:
  "wren waves").
- **Quiet mode**: per-player toggle to hide other players' effects/motion,
  dim nameplates, or hide avatars entirely while staying connected —
  essential for sensory regulation without social exile. Pairs with
  reduced-motion preference.
- **No time-pressure social mechanics.** Nothing communal should require
  fast reactions or scheduled presence; guestbooks, mail, and the
  while-you-were-away journal make async participation first-class.
- Nameplates: user-controlled size/contrast; never rely on color alone for
  friend/stranger distinction.

---

## 3. Big-picture changes required

1. **`accountId` becomes the universal foreign key.** Every schema that
   says `ownerId`/`playerId` today means "session" and must mean "account".
   Do this before real build data accrues — it's the migration all others
   depend on. *(In progress as of this doc.)*
2. **`shared/` grows into the true shared-sim package.** Spacing catalogs,
   terrain queries, and resource seeding currently live under `src/sim/`
   where the server can't cleanly reach them. Either move the renderer-free
   parts into `shared/` or adopt npm workspaces so server, client, and
   shared are proper siblings (also fixes the fragile `../../../shared/src`
   imports).
3. **One command path for solo and shared.** Solo = local authority over the
   same intents; shared = server authority. Never two rule implementations.
4. **Chat re-architecture** out of synced Schema (see §2.4, §4.2).
5. **Version discipline**: `PROTOCOL_VERSION` already exists; add
   `SAVE_VERSION` + migration hooks with persistence.
6. **Put the repo in git.** There is no version control today. Multiplayer
   work means server + client + shared changing in lockstep, often by
   different agents; without history, one bad session is unrecoverable.
   `git init` + commit before/after each work session is the single
   cheapest risk reduction available.
7. **Privacy/ToS text** exists before the first invite goes out (even
   friends deserve to know what's stored).

---

## 4. Conflicts and pitfalls (each with its fix)

1. **`ownerId` is a Colyseus `sessionId`** (`PaperRoom.handlePlacePiece`,
   `PlayerSchema.id`). Evaporates on disconnect; breaks maker-credit,
   mailed harvests, permissions. **Fix:** authenticated `accountId` stamped
   server-side (§2.1); `PlacedPiece` gains `makerId`. *Severity: high — the
   longer it waits, the more world data needs migrating.*
2. **Chat history in synced Schema** pushes the full log to every client and
   can't honor blocks. **Fix:** history-on-join message + broadcast appends,
   filtered per recipient (§2.4).
3. **Save split-brain.** `localStorage` (solo) vs server (shared) will
   diverge; inventory earned solo appearing in shared spaces is effectively
   item duplication. **Fix:** server owns inventory/progress *in shared
   spaces*; importing a solo world into a shared one is explicit and
   one-way. Decide the import rule before anyone asks for it.
4. **Server can't see the world.** It hardcodes two resource nodes while the
   client generates pages deterministically; spacing/water rules need
   terrain data. **Fix:** renderer-free page seeding + terrain masks in
   shared code (big-picture change #2). Until then the server can't fully
   validate placement — acceptable invite-only, not public.
5. **`maxMoveSpeed` is one number** but presets (`wheeled`, `hovering`) may
   move differently, and future mounts will. **Fix:** clamp per preset when
   movement tuning lands; one shared table.
6. **Client clocks lie.** Patience costs, growth timers, respawns must use
   server time in shared spaces. `respawnAt` already does; keep the pattern.
7. **Terrain queries are expensive** (`isSolidAt` ≈ 7µs; it already broke
   frame budget once). Server validation must use precomputed per-page
   masks, not per-check generation.
8. **Colyseus 0.15 is aging.** Plan the 0.16/schema-v3 upgrade before public
   launch; `PROTOCOL_VERSION` makes the cutover safe. Don't upgrade
   mid-phase.
9. **No git** — see big-picture #6. This is the top process risk.
10. **Hosting split**: `vercel.json` deploys the *client* only. The server
    needs a Node host (Fly/Railway/Render/VPS) with `wss://`, health checks
    (`/health` exists), and CORS pinned to the client origin.
11. **Don't raise the room cap to fake a commons.** 16 is right; density
    comes from page-scoped interest + portals (§2.3).
12. **Account deletion vs the persistent world.** GDPR-style erasure could
    punch holes in shared builds. **Fix:** tombstone rule (§2.1) — personal
    data deleted, creations remain under an anonymous credit. Write it into
    the privacy text.
13. **Auto-moderation harms.** Word filters false-positive on dialect,
    reclaimed terms, and non-English chat. Prefer friction + human review
    (§2.6).
14. **Guest→account orphaning.** If guests can build, their work must be
    claimable, or first-session friends lose their first creation — the
    worst possible onboarding story (§2.1.3).

---

## 5. Performance notes

- 20 Hz server tick / 15 Hz client intents is right for a walking game;
  interpolation buffer already exists (`src/net/remotePlayers.ts`).
- Page-scoped interest is the main perf lever *and* a security lever; do it
  before any public phase.
- Persistence writes are debounced and off the hot path; JSON at this scale
  costs nothing.
- Keep `shared/` dependency-free (it already promises this) so both bundles
  stay small and the sandbox/CI can typecheck it in isolation.

## 6. Phased plan (agent-sized, in order)

Each phase is independently pick-up-able. Don't start a phase until the
previous one's acceptance criteria pass.

- **A. Identity + persistence** *(started 2026-08-10)* — paper passports,
  `accountId`/`makerId` in shared types + schema, JSON room persistence,
  mailbox shape. ✅ when: server restart preserves pieces; a rejoining
  player keeps their id; a piece knows its maker across restarts;
  typechecks clean in `shared/` and `server/`.
- **B. Wire the slice** — follow `multiplayer-readiness.md` §Suggested
  sequence (avatar-as-data, wire `src/net/` into `main.ts`). ✅ when: two
  tabs see each other move and build.
- **C. Social surface** — DOM chat log (accessible per §2.7), bubbles,
  nameplates, join/leave toasts, mute/block end-to-end, emote palette.
  ✅ when: a screen reader user can follow and join a conversation; block
  works across rejoin.
- **D. Invite-only rooms** — join codes, host kick/mute/ban persisted,
  room browser UI. ✅ when: a stranger without the code cannot join; host
  powers survive restart.
- **E. Interest + hardening** — page-scoped sync, per-intent rate limits,
  page adjacency validation, per-player caps. ✅ when: a client only
  receives entities for nearby pages; flood tests get rejected.
- **F. Async togetherness** — mailbox delivery on join, guestbooks,
  while-you-were-away journal, mailed harvests (needs maker id ✓).
  ✅ when: an offline gift arrives on next login.
- **G. Commons + public readiness** — portal travel between rooms, commons
  neighborhood, reports queue, slow-mode, ToS/privacy text, Colyseus
  upgrade, claimable accounts (email/passkey). ✅ when: the §2.6 "rock
  solid" checklist is green.

## 7. What this doc deliberately defers

Voice chat (likely never), seamless world streaming (never), player-run
scripting (SL's superpower and its biggest safety liability — revisit only
post-G), trading/markets (economy decisions say flat prices; multiplayer
must not quietly reintroduce markets via gifting loopholes — watch this).
