# Biome-Exclusive Materials, and Critters Who Know Things

Captured 2026-08-04. Design intent, plus one thing in the code that needs
fixing before any of it can be built.

## The mechanic

Some materials exist only in some biomes. Exploring the world is not
flavour — it is the requirement for building certain things. `redwood-bark-curls`
is the first of these: forest-only, redwood-only, sturdy-scissors-only.

Critters are the **discovery layer**. A creature who lives somewhere knows
what grows there, and knowing it is what makes talking to them worth doing:

- Unprompted: *"Did you know you can get bark curls here? For the good
  shelving. It's the only place you'll find them."*
- Asked *how do I get this?*: *"I hear you need a heavier pair of shears
  than those."*

This gives friendship a payoff beyond dialogue, gives each biome a resident
expert, and turns "where do I find X" from a wiki question into a
conversation.

## What already supports this

The conversation engine is in better shape for it than expected:

- Storylets already filter on `biomes`, `pageIds`, `regionNames`, species,
  personality, friendship level, and flags.
- `fillTemplate` already substitutes context into lines.
- `requiresFlags` / `addFlags` can record that a critter has already told you
  something, so the same squirrel does not repeat its one fact forever.

So a biome-scoped knowledge storylet needs no new machinery. What it needs is
something true to say.

## The problem: nothing knows how a material is obtained

There is no single place that answers *"how do I get this?"*. The answer is
scattered across four:

| Source | Answers |
| --- | --- |
| `BIOME_RESOURCES` in `world/resources.ts` | what scatters as loose piles, per biome |
| `catalogs/geology.ts` | what digging turns up, by layer and biome |
| `SPECIES_YIELD` in `catalogs/trees.ts` | what trimming gives, by tree species |
| `biomes` on each resource | ...ambiguous, see below |

A critter answering "how do I get bark curls" would have to consult three
tables and would still get it wrong.

### An inconsistency introduced 2026-08-04

The `biomes` field on a resource meant *"where this scatters as a loose
pile"* for every resource until `redwood-bark-curls`, where it was used to
mean *"where this can be obtained"* — because bark curls scatter nowhere.
Two meanings in one field. Harmless today because only the generator reads
it, and it correctly reads it as "scatters". It will not stay harmless.

## The fix, when this gets built

Give each resource one `obtainedBy` descriptor — the single source of truth
that the generator, the critter dialogue, and any future recipe hint all
read. Roughly:

```ts
obtainedBy: Array<
  | { kind: 'scattered'; biomes: Biome[] }
  | { kind: 'dug'; biomes: Biome[]; layer: 1 | 2 | 3 }
  | { kind: 'trimmed'; species: TreeSpecies; minimumTier: 1 | 2 | 3 }
>
```

Then:

- `BIOME_RESOURCES` is *derived* from the `scattered` entries rather than
  hand-maintained, so a resource can never be scattered somewhere its own
  definition disagrees with.
- The critter's "only place you'll find it" line is computed: a material
  whose `obtainedBy` names exactly one biome is exclusive, and the game knows
  it without anyone asserting it in prose.
- The "you'll need a heavier pair of shears" line reads `minimumTier` and
  names the actual tool from `TOOL_DEFS`, so retuning a tier never produces a
  lying squirrel.
- `biomes` on the resource goes away, taking its two meanings with it.

**Generated from data, not hand-written.** A hand-written hint is a fact
duplicated outside the system that owns it, and it goes stale silently the
first time a yield table is retuned. The critter should be reading the same
table the game plays by.

Wording can still be authored — the *shape* of the line and its variants per
species and personality — with the material, biome, and tool substituted in.
That is what `fillTemplate` already does.

## Open questions

- Does a critter volunteer its fact once, or is it a topic you can ask about
  again? (Flags support either; repeating on request seems kinder.)
- Does friendship gate the good hints? Tempting, but it risks making the
  world's knowledge feel withheld rather than shared.
- Do critters know about materials in *other* biomes — "my cousin says
  there's something in the dunes" — as a nudge to travel? That is the piece
  that would make exploration feel prompted rather than stumbled into.
- Should the scrapbook record what you have been told, so the knowledge
  survives forgetting which squirrel said it?
