# Plans and Blueprints

Captured 2026-08-04. Design intent only — the plan *slot* is built, the ways
of acquiring plans are not.

## What a plan is

One plan unlocks one level of one tool. Not consumed by crafting, not
stackable, not tradeable for materials. You find it once and keep it.

This is why the Thing Maker gives it a slot of its own rather than listing it
with the ingredients: a material is a quantity you gather, a plan is a fact
about what you know. Conflating them would make "3 sticks and 1 plan" read as
though you could go and pick up more plans.

**Visual language.** Plans should look like blueprints — a distinct paper
stock from everything else in the world, so one lying on the ground reads as
important from a distance. The empty slot borrows the dashed outline of a
file drop target on a web form; the filled slot is solid.

Tier 1 plans are held from the start. Everything above tier 1 must be found.

## Where plans come from

Two routes, both unbuilt. Advanced plans should be harder to find, in the same
way advanced materials are — and ideally *near* the materials they need, so a
player who has reached a region can complete the loop there.

### Scattered in the world

Ideas, roughly in order of how well they fit what already exists:

- **Buried.** Digging already returns deterministic geology by layer; a plan
  is a rare discovery in that table. Fits the tier gradient for free —
  deeper layers need better shovels, so better plans sit under them.
- **Fallen from a tree.** Trimming already rolls a deterministic yield with a
  "regional variety" slot at the flourishing stage. A plan is the rarest
  entry in that roll.
- **In a mine, near its materials.** Wants the mining system first
  (`mining-and-caves.md`), which wants world map layers.
- **Brought by a critter.** The friendship and conversation systems already
  track a relationship per critter and have story arcs. A raccoon who finds
  things on its adventures — either handing one over, or *telling you where
  it saw one* — is the warmest version of this, and reuses the conversation
  engine rather than adding a new system.

The critter route is the one worth building first: it costs the least new
machinery and it makes friendship pay off in something other than dialogue.

### Bought from a plan-maker

An **owl** who draws plans and sells them from her studio. She is an artist,
not a shopkeeper — the plans are her work.

Needs:

- An **easel** structure to draw at. The first real piece of shop furniture,
  and a good test of the building-placement system when that lands.
- A studio set piece, in the manner of the Wood Mill (`world/woodMill.ts`).
- A currency or exchange type — this is the open question the whole
  exchange/economy gap turns on, and it blocks her more than the art does.

Later: she takes the easel around the world and sells from different places,
or there is a family of owls with their own studios. That variation is worth
holding until multiplayer, when "which owl did you find?" means something.

## Open questions

- What does the owl want in exchange? Materials, a currency, or something
  she cannot get herself (a rare regional paper)? The third is the most
  characterful and needs no currency type at all.
- Can a plan be duplicated or gifted? Making a spare *tool* to give away is
  already supported. A plan is knowledge, which argues against copying it —
  but that also means a friend can never hand you a shortcut.
- Do found plans have a visible location hint, or is discovery incidental?

## Built already

- `player.plans` holds owned plan ids; `STARTER_PLAN_IDS` is derived from
  tier-1 tool recipes rather than hand-listed.
- The Thing Maker shows every rung of every ladder, with an empty plan slot
  on the ones you cannot make.
- You climb one rung at a time: `previousTierTool` gates tier N on owning
  tier N-1.
