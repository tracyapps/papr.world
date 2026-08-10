# Plans and Blueprints

Captured 2026-08-04. Design intent only — the plan *slot* is built, the ways
of acquiring plans are not.

> **Amended 2026-08-06 — read this first. There are now two kinds of plan.**
>
> **Tool plans** come from the **knowledge tree** (`knowledge-tree.md`) and from
> nowhere else. They are not objects. They cannot be found in the world, bought
> from the owl, brought by a critter, gifted, or mailed. You gift the *made
> tool* instead.
>
> **Everything-else plans** — furniture, clothing, buildings and structures,
> decoration, oddities — work exactly as this document describes: blueprint
> stock, found, bought, gifted, duplicates gift-only.
>
> Sections below marked **[tool plans: superseded]** still describe the design
> accurately for the everything-else class. They are kept because that class is
> the larger one and the reasoning still applies to it.
>
> Why the split: the tool ladder is the spine of progression, and a spine should
> be predictable rather than lucky. The world should surprise you with a nice
> chair, not with whether you can dig a deeper hole this month.

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

Tier 1 plans are held from the start.

**[tool plans: superseded]** — tool plans above tier 1 are learned in the
knowledge tree. The paragraphs below about finding and buying apply to the
everything-else class.

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

**Amended 2026-08-06: she does not sell tool plans.** Her stock is furniture,
clothing, structures, and decoration — which suits her better anyway. She is an
*owl-itect*; drawing a nicer chair is more her subject than drawing a sturdier
shovel, and it keeps her studio a place you visit because you want something
lovely rather than because you are stuck.

Needs:

- An **easel** structure to draw at. The first real piece of shop furniture,
  and a good test of the building-placement system when that lands.
- A studio set piece, in the manner of the Wood Mill (`world/woodMill.ts`).
- A currency or exchange type — this is the open question the whole
  exchange/economy gap turns on, and it blocks her more than the art does.

Later: she takes the easel around the world and sells from different places,
or there is a family of owls with their own studios. That variation is worth
holding until multiplayer, when "which owl did you find?" means something.

## Buying a plan: chips or barter, player's choice

Settled 2026-08-04.

The owl accepts either. A plan has **two prices** and the player picks:

1. **Shiny chips (₡)** — the world's currency. See `economy.md`.
2. **Barter** — items and materials she wants for her work: her favourite paper
   to draw on (a particular wood, run through the Thing Maker into blank
   blueprint stock), some lead rocks, and so on.

**The barter route costs slightly less than the chip price**, because you spent
time and effort making the thing instead of spending money. Close to equivalent
in value, deliberately tilted toward the player who made something.

Two rules on the barter list (the second is now mostly historical for her stock,
since she no longer sells tool plans — but it stays as a constraint on the
knowledge tree, where the same deadlock is possible):

- **It differs by plan type.** Each plan asks for something that suits what it
  is. This is characterisation, not a pricing table.
- **It can never require the tool that plan unlocks.** A plan for tier-2
  scissors may not ask for a material only tier-2 scissors can harvest. This
  is the one hard constraint, and it needs to be *checked in data*, not
  remembered — the `obtainedBy` descriptor in `biome-knowledge.md` is exactly
  what makes that check possible, and a test that asserts it across every plan
  is cheap insurance against a future retune quietly creating a deadlock.

## Duplicates: gift them, never hoard them

Settled 2026-08-04. **Applies to everything-else plans only** — tool plans are
learned, so there is no such thing as a duplicate one, and generosity with tools
takes the form of making one for someone.

Three rules that fall out of "a plan is knowledge":

1. **Once a plan goes into your Thing Maker, it is yours and cannot come back
   out.** You cannot un-learn it to hand it over.
2. **A plan you do not already have** offers both options: *keep* or
   *gift / mail*.
3. **A plan you already have** offers *only* gift or mail.

Rule 3 is the important one. It means a player physically cannot collect
duplicates of a plan to keep others from getting it — a found duplicate has
exactly one use, which is giving it to somebody. Scarcity cannot be
manufactured by hoarding.

Mailing uses the PWMS and lands in the recipient's mailbox (`economy.md`).

## Finding plans: hints, chance, and the plan detector

Settled 2026-08-04. **Everything-else plans only** — no tool plan is ever sited
in the world, so the detector never hunts one.

- **Basic plans carry visual hints.** Something findable, if you are looking.
- **Beyond basic, plans are found by chance** — the deterministic rare-roll
  slots described above, in digging, trimming, and mining.
- **A plan site is non-exclusive** (settled 2026-08-06). It yields for every
  player who does not already hold that plan; the first to find it takes it
  from nobody. Otherwise geography would reintroduce exactly the hoarding the
  duplicate rule above forecloses.
- **Or by building a plan detector.** A metal-detector-ish tool, except each
  one is tuned to *one particular plan*: to hunt a different plan, you make a
  different detector.

The detector deliberately does **not** give a direction. It reports **hot and
cold only**, at a coarse grain, so finding the plan still means wandering and
searching. It converts "somewhere in the world" into "somewhere around here",
and stops there.

This is the mechanism that prevents a player sweeping up every plan at once,
without making plans feel withheld: the effort is real but it is *pleasant*
effort — making a thing, then going for a walk with it.

## The plan engine is bigger than tools

Tools are the opening act, not the shape of the system.

**Early game:** the knowledge tree unlocks tools — to farm, harvest, build. Then
better tools, to make more complex things.

**After that, and forever:** plans for houses, furniture, clothing, decoration,
fencing — and this is where plans-as-objects live permanently. This is what keeps the game fresh — there is always another thing to
make and another version of it to improve.

Player-made furniture and clothing can be **given to others, sold to shops, or
bought pre-made from shops at a higher cost** than making it yourself. The
markup is the shop's convenience fee, and it is the mechanism that keeps making
things worthwhile without punishing the player who would rather buy.

### Architectural requirement

**The plan engine must generalise to arbitrary objects from the start.** A
plan is *"a fact about what you know how to make"* — nothing in its data shape
should assume the output is a tool.

The long-term possibility, explicitly not for version one: **players authoring
their own plans**, with a marketplace, in the manner of Second Life. That is a
someday, but it constrains today: any programming choice made now should be
one that can grow toward it **without toppling the tower**. Concretely, that
means the plan id space, the recipe shape, and the output type must all be open
rather than enumerated against the current tool catalog.

## Built already

- `player.plans` holds owned plan ids; `STARTER_PLAN_IDS` is derived from
  tier-1 tool recipes rather than hand-listed.
- The Thing Maker shows every rung of every ladder, with an empty plan slot
  on the ones you cannot make.
- You climb one rung at a time: `previousTierTool` gates tier N on owning
  tier N-1.

## Still open

- Whether the plan detector is itself made from a plan (recursive, and
  charming) or is a base capability.
- How "already have this plan" is presented at the moment of pickup — the UI
  needs to make gift-only feel generous rather than denied.
- Whether recipes should derive their display names from `TOOL_DEFS` instead of
  duplicating the string. They currently duplicate it; two places renamed by
  hand on 2026-08-04 proved the point. 