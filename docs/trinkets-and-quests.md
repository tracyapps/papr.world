# Trinkets and Side Quests

Two systems landed together and share one loop: a critter asks a small favour
(a **side quest**) and, when you finish it, hands you a small object (a
**trinket**). This document covers what each one is, where its data lives, and
how to add more of either without touching the runtime.

The catalog files are the source of truth. Where this document states a count,
the count comes from the code; the test suite only pins the *shape* of the
data, not the exact number, so both are free to grow.

## Trinkets

### What a trinket is

A trinket is a collectible small object a critter gives you. It is
deliberately not the same kind of thing as everything else in your scrapbook:

- **Not a resource.** It never appears in the materials tabs, it is never
  counted by a `collect` objective, and it cannot be spent.
- **Not sellable.** There is no shop path that accepts a trinket. The
  scrapbook tab says so on the panel itself: "Trinkets are keepsakes, not goods
  — they cannot be sold."
- **Not stackable.** Every trinket is its own `TrinketInstance` with its own
  `id`, even when two instances point at the same catalog definition
  (`defId`). Two Grey Wind-up Mice are two entries, not "×2".

Its whole job is to be looked at. The catalog comment puts it plainly: "it is
never sold, it costs nothing to place, and its whole job is to be looked at."

### Where a trinket shows up

A trinket lives in exactly one of two places at a time, and the save encodes
that as a single field, `placed`:

- **`placed === null`** — it is *kept*, and sits on the **bio-card shelf**.
- **`placed !== null`** — it is *set down in the world* at a page and position,
  and rendered there by `game/trinketVisuals.ts`.

The scrapbook's **Trinkets** tab (`ui/scrapbook.ts`, `renderTrinketsTab`) lists
everything the player holds and gives each row one button: **"Set down here"**
for a kept trinket, **"Take back"** for a placed one. "Set down here" drops it
at the player's feet on the current page (`placeTrinket(id, currentPageId,
avatar.position.x, avatar.position.z, 0)`). A trinket set down in the world can
also be clicked to pick it back up — it is registered as a screen interaction at
priority 78, sitting just under loose materials — and it returns to the shelf.

Because `placed` is one field, there is no "displayed *or* dropped?" ambiguity
to reconcile: it is exactly one of the two.

The bio card (`ui/playerCard.ts`, `renderTrinketShelf`) draws the shelf as
coloured paper medallions, not rendered 3D, because the card is a DOM overlay
and spinning up a second WebGL context for a dozen tiny objects would cost far
more than it is worth. The palette colour and the label carry the identity
there; the real model only exists for placed trinkets in the world, built by
`buildTrinketRig` in `game/trinketRigs.ts`. The player opens their own card from
the Trinkets tab ("Show your bio card"); a visitor's card is reached by clicking
a live avatar. Today only the player's own card shows a shelf, since trinket
ownership is not yet synced to the server.

### No duplicates in one player's bag

Uniqueness is a property of *handing them out*, not of the catalog. The catalog
is happy to contain many near-twin definitions; the giveaway is what refuses to
repeat.

`grantTrinket` (in `game/trinkets.ts`) computes `ownedTrinketDefIds()` — the set
of `defId`s the player already holds — and passes it to `pickTrinketDef`. That
function filters the catalog to the requested pool (an optional family, a set of
`shapes`, a `tag`), removes everything already owned, ranks the remainder by
rarity, and picks inside the rarest band with a seeded shuffle. Only when a pool
is *exhausted* does it fall back to the whole catalog and allow a duplicate:

> Falls back to the whole catalog when a pool is exhausted, which is the
> intended failure: a duplicate is worse than a surprise, but not worse than
> handing back nothing.

So a player who finishes forty quests ends up with forty *different*
definitions. The pool is deliberately far larger than any one player will ever
hold, which is what makes the rule satisfiable at all.

## The trinket catalog

The catalog has two halves, merged by id in `allTrinketDefs()`:

- **Authored defs** — `TRINKET_AUTHORED_DEFS` in
  `src/sim/catalogs/trinkets.ts`: **55** named objects, each with a sentence
  worth reading ("Bent a little out of shape from a very good day.").
- **Generated variants** — `TRINKET_GENERATED_DEFS` in
  `src/sim/catalogs/trinketVariants.ts`: **1,200** deterministic recombinations
  of the same vocabulary.

That is **1,255 trinket definitions total**. Split by family: handmade 402,
found 263, natural 193, curious 170, seasonal 130, story 97. (`trinkets.test.ts`
only asserts the pool is deeper than 300 — the exact figure is meant to grow.)

### The vocabulary

Every definition is a **shape × motion × palette × parts**, plus a scale, a
rarity (1–3), and free-form lower-case tags.

- **shape** — `TrinketShapeId`, 29 values: 19 solid shapes (`pebble`, `cube`,
  `sphere`, `ring`, `cone`, `star`, `heart`, `leaf`, `shell`, `key`, `button`,
  `grain`, `crystal`, `spool`, `bell`, `acorn`, `pinwheel`, `thimble`,
  `cylinder`) and the ten `windup-*` toys. `cylinder` is authored-only today;
  the generator's `SHAPES` list covers the other 18.
- **motion** — `TrinketMotionId`: the type declares eight — `still`, `spin`,
  `bob`, `wobble`, `windup`, `sway`, `flip`, `orbit` — of which seven are in use
  today (`flip` is declared and the rig can render it, but no definition uses
  it yet). All motion is animated in `game/trinketRigs.ts`, and it lives
  entirely on an inner pivot that resets every frame, so nothing drifts.
- **palette** — a base/accent/detail hex triple, plus an optional shared paper
  texture (`textureUrl`).
- **parts** — `TrinketPartId`, 15 values: `ears`, `tail`, `eyes`, `wings`,
  `key`, `hat`, `stem`, `antenna`, `fin`, `beak`, `ribbon`, `feather`, `spots`,
  `stripes`, `glitter`.
- **family** — one of `found`, `natural`, `handmade`, `curious`, `seasonal`,
  `story` (`TRINKET_FAMILIES`). The family is what the picker filters on and
  what the scrapbook shows under each name.
- **rarity** — 1–3. The picker hands out the rarest available band first, so a
  hard quest feels like it paid out.

Generated defs reuse this exact vocabulary — nothing is invented, only
arranged. The generator is `PALETTES` (30 colourways) crossed with `SHAPES`
(18 non-windup shapes, each declaring which families, motions and part-combos
suit it), plus the ten-strong `WINDUPS` list over every other palette. That is
why the pool can be deep without anyone hand-drawing a thousand wind-up frogs,
and why a retuned colour cannot drift a single definition off-style. Ids and
appearances are derived from the shape/palette index, never `Math.random`, so a
save that points at `gen-pebble-12-glitter-bob` still finds it after a reload,
and two clients agree on how it looks.

### How to add trinkets

**Add an authored def.** Add one entry to the `TRINKET_AUTHORED_DEFS` map in
`src/sim/catalogs/trinkets.ts`. The key is the id; the value is a `TrinketDef` —
copy a neighbour and change `label`, `description`, `family`, `shape`, `motion`,
`parts`, `palette`, `scale`, `rarity`, `tags`. Nothing else needs to change; the
rig, the bio-card shelf, the scrapbook tab and the placement system all read
this one table.

**Add a palette.** Add one `PaletteSeed` to the `PALETTES` array in
`src/sim/catalogs/trinketVariants.ts`. That alone grows the generated pool by
about 35–45 definitions (one per shape-motion slot, plus the wind-up line on
even palette indices). Set `season` if the colourway belongs to a season; every
variant of it is then tagged `seasonal:<season>` automatically, which is how the
seasonal quests find thematic rewards.

**Add a shape.** Add one `ShapeSeed` to the `SHAPES` array in the same file,
listing the families it suits (first is the default), the motions it may take,
the part-combos it may carry, its extra tags, and its rarity. Each added shape
multiplies by the 30 palettes — roughly 30 new defs per motion slot. If the
shape is a wind-up, also add it to `WINDUP_SHAPES` in `trinkets.ts` and the
`WINDUPS` table so the rig can build it (`trinketRigs.ts` holds the per-species
build functions).

Then run the checks under **Validators and checks** below.

## Side quests

### What a quest is

A quest is a small errand a critter asks for once it trusts you. It has three
tiers — the owner's own ladder:

- **`favor`** — a single, small, warm step at `curious` friendship. The
  commonest tier (weight 4).
- **`errand`** — two to three steps at `friend`; nudges the next biome, a new
  plant, or a new tool (weight 3).
- **`odyssey`** — rare (weight 1), high friendship (`buddy`/`pet`), multi-step:
  carry a thing or a message to a critter in another biome, or climb a rung of a
  tool/plan ladder. An odyssey is not even *considered* until the player has
  finished at least five quests (`ODYSSEY_COMPLETED_REQUESTS`).

The catalog holds **49 quests**: 16 in `src/sim/catalogs/quests.ts`
(`AUTHORED_QUESTS`) and 33 in `src/sim/catalogs/questCatalog.expansion.ts`
(`QUEST_EXPANSION_DEFS`); `allQuestDefs()` merges the two by id. By tier: 21
favor, 16 errand, 12 odyssey. (The last four, 2026-09-18, are the canopy
crowd's: crepe vine, saying hi to a sloth, a vine for a sloth's hammock, and
blotting caps.)

### "Never out of reach — it is the next step"

The whole design rests on one rule, stated plainly in the catalog:

> A quest is never out of reach. It is the next step.

That is enforced mechanically, not by taste. Every objective is graded by
`objectiveReach` against the *live* save — inventory, tools, plans, maker level,
the knowledge tree, visited biomes, planted beds, trimmed trees — into one of
four bands:

- **`done`** — already true.
- **`ready`** — doable with what the player owns right now.
- **`next-step`** — one craftable thing away (make the tool whose plan is
  learnable now, hit the maker level, learn the node).
- **`far`** — genuinely gated (behind a locked tree node, an unknown recipe).

`questReachable` refuses to offer a quest while *any* objective is `far`, and
`selectQuestFor` additionally drops a quest whose every objective is already
`done` (`questHasWork`). So a critter can safely say "bring me three ribbonwood"
only when the player can actually get ribbonwood, or is exactly one craftable
tool away.

Note the asymmetry that makes the rule kind rather than strict: materials and a
busy maker are ordinary chores a player can always resolve, so they never count
as `far`. Only a *plan* the knowledge tree has not offered yet is a hard gate.

### Objective kinds

Thirteen kinds make up the `QuestObjective` union. One line each:

- **`collect { resource, quantity }`** — have N of a material in the scrapbook.
- **`harvest { resource, quantity }`** — bring N of a *grown* produce.
- **`craft { recipeId }`** — finish a recipe at the Thing Maker.
- **`craftTool { family, tier? }`** — own a tool of that family at or above a
  tier.
- **`learnTech { nodeId }`** — learn a knowledge-tree node at the Professor.
- **`plant { seedId }`** — have one of that seed planted in any bed.
- **`visitBiome { biome }`** — have stood in a biome.
- **`visitPage { pageId }`** — have walked a specific page.
- **`dig { layer }`** — have opened a given soil layer.
- **`trim { species }`** — have trimmed a tree species.
- **`talk { critterId }`** — have met a given critter (delivery quests).
- **`place { templateKey }`** — have set a build piece down in the world.
- **`deliver { itemId }`** — carry a given item (e.g. a lifted living plant).

### Progress is measured, not hooked

There is no quest listener and no command that "tells" a quest anything. Every
objective has a `measure` derived from the live save (`objectiveMeasure` in
`game/quests.ts`), and satisfaction is:

```
satisfied[i] || measure >= baseline[i] + target[i]
```

- `baseline[i]` snapshots the measuring count at *accept* time, so "collect 3
  twigs" means **three more from now**, not "three, if you happen to have some".
- `satisfied[i]` **latches**: once true it never goes back, so a player who
  gathers the twigs and then spends them is not asked again.
- `refreshQuest` re-checks and latches on every visit. Talking to the giver is
  always enough to see how it is going.

If a content update changes a quest's objective list while it is in flight,
`refreshQuest` detects the shape change (baselines no longer line up with the
goals), re-baselines, and starts counting the rest from now rather than
satisfying the wrong things.

One honest limitation, noted in the code: tree records do not carry a species,
so a `trim` objective counts *a* trim rather than a species-specific one. Good
enough for a nudge, and documented as such.

### The reward

Every quest declares a `QuestReward`: a `trinketFamily`, optionally narrowed by
`trinketShapes` and a `trinketTag`, plus `friendship` points. `completeQuest`
grants the trinket against the player's *current* bag via `grantTrinket`, so the
payout is always something they do not already own, and it seeds the pick with
the completion time and the quest id, so two players completing the same quest
get different keepsakes. Friendship is added on the spot, and the quest is
recorded in `completed` and `completedByCritter` so it is never offered to that
critter again. On turn-in the reply is extended with the line "(You tuck
<label> into your pocket.)".

### Offering

`selectQuestFor` is deliberately conservative:

- a **`stranger`** never offers — the first meeting stays general;
- a critter holds **one** quest at a time;
- a decline or a turn-in sets a three-minute cooldown (`OFFER_COOLDOWN_MS`);
- an `exclusivityGroup` keeps two sibling quests (e.g. two "somewhere to sit"
  errands) from running at once;
- odysseys wait for the five-quest floor.

When several quests match, one is picked by a seeded roll weighted by tier (or
an explicit `weight`). Even then, the favour is only actually put to the player
on some visits: `wantsToAsk` requires at least three visits and then a 60%
chance, and the shuffle is seeded on the critter id and visit count so reopening
the same conversation is not a different quest every frame.

### How to add a quest

Quests are data. Add one object to `QUEST_EXPANSION_DEFS` in
`src/sim/catalogs/questCatalog.expansion.ts` — the authored set in `quests.ts` is
kept readable by not growing it. Only real catalog ids may appear. Skeleton:

```ts
{
  id: 'favor-example',
  title: 'A Small Kindness',
  summary: 'Bring three kraft twigs to a critter patching a nest.',
  tier: 'favor',
  giverSpecies: ['squirrel', 'bunny'],
  minFriendship: 'curious',
  objectives: [{ kind: 'collect', resource: 'kraft-twigs', quantity: 3 }],
  reward: { trinketFamily: 'natural', trinketTag: 'plant', friendship: 6 },
  opening: ['“{{name}} could use a few good twigs, if you are passing.”'],
  acceptLabel: 'I’ll gather some',
  acceptReply: ['“Kind of you. They lie all over the clearing.”'],
  declineLabel: 'Maybe later',
  declineReply: ['“No rush at all.”'],
  progressOpening: ['“Any twigs yet? No hurry.”'],
  turnInOpening: ['“These are perfect.” {{name}} tucks them away. “Here — I have been saving this.”'],
  turnInReply: ['{{name}} hands over a small keepsake.'],
}
```

Every quest needs a unique `id`, a `title`, a `summary`, a `tier`, a
`minFriendship`, at least one `objective`, a `reward`, and the five dialogue
arrays (`opening`, `acceptReply`, `progressOpening`, `turnInOpening`,
`turnInReply`) plus `acceptLabel`. `giverSpecies` / `giverPersonalities` /
`giverCritterIds` / `biomes` / `requiresQuests` / `weight` /
`exclusivityGroup` are optional targeting and pacing fields.

Then validate it:

```sh
node tools/validate-quests.mjs
```

The validator lifts the real catalog ids out of the source files (it does not
need a TypeScript toolchain) and checks that every referenced resource, seed,
tool, recipe, tech node, biome, tree species, build-piece key, critter id, tier,
friendship level, and trinket family exists, and that every objective's shape is
well-formed. It exits non-zero with a readable list, or prints a one-line
success with the quest count.

Adding a whole new *kind* of quest objective is one new variant plus its two
switches — `objectiveReach` (in `sim/catalogs/quests.ts`) and `objectiveMeasure`
(in `game/quests.ts`). Nothing else in the game learns about it.

## Where the state lives

All of it hangs off `GameState` (`src/sim/state.ts`) and is normalized on load.

- **`player.trinkets: TrinketInstance[]`** — one entry per trinket: `id`,
  `defId`, `seed` (so two of the same def still differ slightly), `acquiredAt`,
  `source` (e.g. `quest:favor-first-shiny` or `critter:0,0#raccoon`), optional
  `fromName`, and `placed` (`{ pageId, x, z, rotY } | null`). The list is capped
  at 400 on grant; a module-level serial keeps instance ids unique in-session.
- **`player.quests: QuestLogState`** — `active` (keyed by giver critter id →
  `ActiveQuestState { questId, giverId, acceptedAt, baselines[], satisfied[],
  step }`), `completed[]`, `completedByCritter{}`, `offered{}`, and
  `cooldownUntil{}`.
- **`player.conversations: Record<critterId, ConversationMemoryState>`** — the
  per-animal conversation memory: `flags`, `seen`, `visits`, `lastChatAt`,
  `journal` (the continuation threads, newest first, capped at 12), and
  `recentLines` (hashed recently-said lines, capped at 24). See
  `docs/conversation-engine.md`.
- **`player.diaryEntries: DiaryEntry[]`** — the player's scrapbook diary, capped
  at `DIARY_ENTRY_LIMIT` (400).
- **`player.visitedBiomes` / `visitedPages` / `metCritters` /
  `metCritterNames`** — the world-knowledge facts that `visitBiome`,
  `visitPage`, and `talk` objectives measure against. `noteVisitedPage` is
  called from the streaming loop, so a "visit the forest" objective resolves the
  moment the page arrives underfoot, and `noteMetCritter` is called on the first
  greeting.

## Validators and checks

Run these after editing content or catalogs:

```sh
npm run content:check            # validate src/content/conversations.json
node tools/validate-quests.mjs   # validate the expansion quest catalog
npx tsc --noEmit                 # type-check the whole project
npx vitest run                   # the full test suite
```

`npm run build` already runs `content:check`, `styles:check`, and `tsc` for you;
the quest validator is a standalone script, so run it by hand (or wire it into
your own pre-commit). The tests closest to this document are
`src/sim/catalogs/trinkets.test.ts`, `src/game/quests.test.ts`, and
`src/game/conversationEngine.test.ts`.
