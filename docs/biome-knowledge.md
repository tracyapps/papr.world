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

## Settled design

Decided 2026-08-04.

### "Tell me about this place" is the entry point

Not an unprompted blurt, and not a fact dispensed once and gone. It is a
**conversation option** that keeps giving, drawing from a pool of things this
critter could say about where you are standing. Multiple responses, randomised
order, and available every time you ask.

The pool holds several *kinds* of knowledge, all scoped to the current biome
or region:

| Kind | Example | Read from |
| --- | --- | --- |
| Harvesting | *"Did you know the trees here grow a hand's width a day?"* | growth-rate and yield tables |
| Material | *"Bark curls, right here. Only place you'll find them."* | `obtainedBy` |
| Tool gating | *"You'll want a heavier pair of shears than those."* | `obtainedBy` + `TOOL_DEFS` |
| Wayfinding | *"We're close to the owl-itect's studio — just the other side of this forest."* | places / landmark registry |
| Fun fact | *"Lots of birds here. Ask one to sing you a song."* | authored, per biome |

The fun-fact kind is the one that is allowed to be hand-written, because it is
not asserting a mechanic. Everything else is generated from the table that
owns it, for the reason already stated above: a hand-written hint goes stale
silently.

**Hidden gifts.** Some of these lines point at an action — asking a bird to
sing, visiting the studio — and doing the thing can produce a small unearned
gift. Not a quest, not a checklist entry, not tracked in a UI. A reward for
following a suggestion that felt like conversation rather than instruction.

### Friendship does not gate knowledge, personality shapes it

Knowledge is shared, not withheld. Any critter will tell you what it knows,
at any friendship level.

What *does* vary is **which kind of thing they lead with**, by personality: a
friendly critter opens with a joke it heard, a practical one with a harvesting
tip, a wanderer with somewhere else you should go. That is characterisation,
not a lock.

And in every case, the conversation can continue. Asking more questions is
always available, so one critter can yield several pieces of knowledge in one
threaded exchange rather than one fact per visit. This is the design
constraint on the storylet shape: these are **threads**, not one-shots, and
`addFlags` is for "already said this one" bookkeeping inside a thread, never
for closing the topic.

### Critters know about elsewhere

Yes — and this is the piece that makes exploration prompted rather than
stumbled into. Beyond their own biome, a critter can offer:

- **Nearby biomes** and what is worth going there for.
- **Shops, stores, and landmarks**, with a rough direction.

Scope it to *nearby* rather than global. A squirrel who knows the whole world
map is an index; one who knows the next valley over is a neighbour.

### The scrapbook records it — as a searchable diary

Everything you are told gets written down, so the knowledge survives
forgetting which squirrel said it. But not as a wiki page: as a **diary**,
formatted like something the player kept rather than something the game
generated. Searchable.

Later: the player can add their own notes to entries, and highlight or mark up
anything auto-recorded. That ambition matters now only in one way — entries
need stable ids and room for player-authored fields from the start, so
annotation is added rather than retrofitted.

## Still open

- What the diary entry *looks like* — this is design work, not a decision
  waiting on code.
- Whether the hidden gift is per-suggestion (one bird song, one gift) or a
  low-probability roll each time. The first is warmer; the second is cheaper.
