# Exchange

Stub, 2026-08-04. The design belongs to tapps and is being written; this
records the framing and one thing the codebase already implies, so neither is
lost.

## The framing

Communal and reciprocal, drawing on Indigenous economic models rather than
market ones. Kindness, barter, and the benefit of helping others — **not**
accumulation, price discovery, or scarcity as pressure.

This is a constraint on the *mechanics*, not a coat of paint on them. A
system that quietly rewards hoarding does not become communal because the
shopkeeper is polite.

## What the code already implies

**There may not need to be a currency, or a new system at all.**

`friendship.ts` already tracks a per-critter relationship that deepens
through interaction, and the conversation engine already gates content on
`minFriendship`. That is most of a reciprocity model already built:

- A relationship that grows when you give and stays when you take nothing.
- Content — knowledge, plans, invitations — that opens as it deepens.
- No balance, no ledger, nothing to optimise.

The obvious next primitive is **giving a thing to a critter** rather than
trading with one. That reuses friendship as the substrate, needs no currency
type, and makes "what do they want?" a question about *them* rather than
about price.

The owl who draws plans wants something she cannot get herself — a rare paper
from a biome she does not fly to. That is a need, not a price. It is also the
cheapest thing to build of everything in `plans-and-blueprints.md`.

## Things to be careful of

- **Scarcity as pressure.** Biome-exclusive materials make exploration
  meaningful; they must not make a player who cannot travel feel locked out.
  The multiplayer harvest allowance in `tool-and-supply-progression.md` is
  the same concern in another shape.
- **Anything that counts up.** A number that only grows invites optimising.
  Friendship levels are bands rather than points on the surface for exactly
  this reason — keep it that way.
- **Making generosity a strategy.** If giving is the efficient path it stops
  being kindness and becomes a build order. Better if giving opens *different*
  things rather than more things.

## Blocked on

Nothing technical. The exchange gap blocks the owl, the Wood Mill, and plan
purchasing — but all of them are waiting on the design decision, not on code.
