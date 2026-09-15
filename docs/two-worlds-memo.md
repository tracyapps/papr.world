# The two-worlds memo

2026-09-02 · Adopted 2026-09-02 (owner approved, no changes). Sets the multiplayer shape that the 2026-09-02 roadmap plan builds on. Testers receive a summary of this in the one-pager; this memo is the internal record.

## What this memo settles

The multiplayer architecture question that was drifting: how much of the game moves onto the authoritative server, and when.

**Decision: a solo-complete world on a socially-authoritative server.**

- **Server owns social truth** — identity (paper passports / durable `accountId`), chat, placed pieces + `makerId`, and, as they land: **mail, guestbooks, journal events, moderation.** Everything warm that happens *between people* is authoritative, persisted, and survives restarts.
- **Client owns private progression** — inventory, tech tree and learning clock, gardens, diary, critters, saved places — in local storage, exactly as today.
- **The world stays deterministic.** Pages generate identically for everyone from their coordinates, so terrain, water, and scenery never need syncing.
- **Explicit non-goals:** moving the simulation server-side (the cost shape that hurt Palia — MMO infrastructure that only survives on very large populations); player-to-player chip markets (parked until gifting culture is visibly strong).

**2026-09-14 addendum — transferable inventory.** Private solo progression
still belongs to the client. Anything that can cross between players now lives
in a separate server-owned **Neighborhood Pouch**, keyed by paper passport. The
client cannot upload its solo bag into it. Server-validated shared actions may
credit or debit it, and mail moves pouch balances atomically. This closes the
split-brain duplication route without turning the whole solo simulation into an
MMO backend.

## Why this shape

- Solo must stand alone (the Stardew principle): one world loop, complete alone, enriched by others — not a separate multiplayer mode.
- Small persistent rooms are the proven scale for a small team (WEBFISHING's lobby model; Minecraft's many-small-servers ecosystem). The docs' own "scale illusion" already says this: many small rooms, never seamless streaming.
- Phase E "shared-simulation hardening" is **compatible, not contradicted**: it hardens the *published surface* (page-scoped sync, per-intent rate limits, adjacency validation). It is not a step toward moving the sim server-side.

## What this means in the alpha — the honest breakage list

Testers: **these are expected, not bugs.** Do report anything that *isn't* on this list.

1. **Harvest piles are per-client.** Two players can harvest the same pile; each sees their own.
2. **Critters are per-client RNG.** Two players pet different squirrels; critter conversations and friendship are private.
3. **Gardens and plantings are private.** Your friend cannot see your garden yet.
4. **Pieces placed while solo stay solo.** Only pieces finished while connected publish to the neighborhood; re-place a build while connected to share it.
5. **Remote avatars are placeholders.** Others see a tinted cutout + your name until drawn designs arrive over the wire (warmth-quad item, in flight).
6. **Solo inventory, learning, and chips are personal.** Nothing in the private
   bag syncs. The separate Neighborhood Pouch is server-kept because its
   contents may be mailed to another person.

## What already works (so nobody undersells it)

Same-code co-presence, named remotes, accessible chat with late-join history, shared pieces stamped with maker credit, persistence across a full server restart, and block / report / host removal.

## Consequences we accept

- The **harvest mirror** (harvest a neighbour's garden, they get the yield in their mailbox) needs page-modification sync, so it waits. It is the **first logged candidate** for revisiting this seam.
- Bug reports should say whether they happened in solo or a shared neighborhood — the feedback sheet already captures game mode automatically.

## When we revisit this seam

- **Phase E-lite** (per-intent rate limits, adjacency validation, page-scoped interest check) — scheduled as the hard gate before growing past 5 testers.
- When the harvest mirror or shared gardens create real demand for page-mod sync.
- Written conflict rules (dig/edit overlap, harvest conflict) are a later memo, not now.
