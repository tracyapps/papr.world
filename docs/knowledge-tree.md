# The Knowledge Tree

Settled 2026-08-06. Supersedes nothing in `plans-and-blueprints.md` — plans
stay exactly as designed. This document adds the thing that was missing around
them, and in doing so re-sequences Phase 1 of the roadmap.

## The problem this solves

It is not "how do you get plans." That was answered: find them, buy them from
the owl, be given one by a critter.

The problem is that **the Thing Maker shows empty plan slots and says nothing
about what would fill them.** A player looking at a locked tier-2 shovel has no
way to learn that the plan exists in the world, let alone what kind of effort
would reach it. Every builder game solves this with a visible tree, and that is
the part worth borrowing.

So the tree is, first and above everything else, a **map of what exists**. Not
a new progression currency. Not a gate. A map.

## What the tree is

**A node is a skill, not a recipe.** *Gardening 1, Gardening 2, Advanced
Gardening.* Learning a node unlocks a cluster of related things — usually a tool
rung, sometimes several recipes, sometimes just the ability to see further up
that branch.

This is worth stating first because it was wrong in the first draft of this
document, which assumed one node per recipe. Skills are the better unit: they
group things a player thinks of together, they let one node grant more than one
capability, and they mean the tree reads like a curriculum rather than an
inventory.

Each node's card shows:

- the skill's name and what it is for;
- **what it grants**, in two tiers of prominence (below);
- what it requires — which nodes must come first;
- its cost, in small print: an approximate learning time, and how many tasks
  would carry it.

#### Two tiers of unlock icons

The card answers *"what does this actually get me?"* at a glance, using the
pattern most builder games settle on:

1. **Large icons: the things this node grants directly** — tool plans, chiefly.
   Named, not just pictured.
2. **Small icons: what those things then let you do** — the materials they can
   harvest, the ground they can open, the recipes they make reachable.

The second tier is the one that prevents frustration, because it answers the
question a player actually has, which is never *"do I want the Okayish Shovel"*
but *"what is behind the Okayish Shovel."*

**The small tier is derived, never hand-authored.** `obtainedBy` already knows
which resources require which tool (`toolRequiredFor`), so the "this unlocks
that" set falls out of data that is kept correct for other reasons. Hand-listing
it would create a second place to forget to update — and a tech card that lies
about what it unlocks is worse than one that says nothing.

Between these icons and the critters who tell you where things are
(`biome-knowledge.md`), a player should rarely be stuck without a next thing to
try.

### What is derived, and what is new data

The first draft claimed the tree needed no new data. That was true for a
recipe-shaped tree and is **not** true for a skill-shaped one. Being honest
about it here, because "it's just a view" is the kind of claim that quietly
becomes an estimate.

There is one new declarative catalog — call it `TECH_DEFS` — holding node ids,
prerequisite edges, learning duration, the task list, and what the node grants.
It is small, hand-authored, and sits beside the other catalogs. What it must
**not** do is restate anything already known:

| The tree needs | Comes from |
| --- | --- |
| Node ids, edges, duration, tasks, grants | `TECH_DEFS` — new |
| Recipes a node unlocks | referenced by id into `RECIPE_DEFS` |
| Tool ladder ordering | `toolsInFamily` + `previousTierTool` |
| Ingredients shown on a card | `RecipeDefinition.ingredients` |
| "Where do I get this material" | `obtainedBy` (`sim/catalogs/obtaining.ts`) |
| What you own | `player.plans`, `player.tools` |
| What to hide entirely | `RecipeStatus === 'planned'` |

So: **new data for the tree's own shape, referenced ids for everything else.**
If a node definition starts duplicating ingredient lists or tool names, that is
the mistake to catch in review.

### The whole tree is visible from the start

Settled 2026-08-06. Every node is on the page from the first time you open it,
including ones far out of reach.

Visibility is the entire point — a map that hides the far side is not doing the
job that made this worth building. Seeing *Advanced Gardening* sitting four
nodes away, knowing it exists and roughly what it costs, is the thing that turns
a locked slot into a plan.

Nodes you cannot start yet are **muted**, not hidden, and each states plainly
what it is waiting on. Cost sits in small print on every card — an approximate
learning time and a task count — so the far side of the tree is legible as
*distant*, not as mysterious.

Muting must not be colour alone; see the accessibility notes.

### Where it lives: the Professor

Settled 2026-08-06, replacing an earlier decision to put the tree behind the
scrapbook's **Plans** tab.

**The Professor** is a paperclip with big googly eyes, dark-rimmed glasses, and
a graduation cap. He sits in the HUD, top centre by default, and clicking him
opens the tree full-screen. He fits a world made of stationery, and he gives the
tree a front door rather than burying it three clicks into a book.

**Naming.** Never *Clippy*, in the game, the art files, or the code. That name
and that specific character design belong to somebody; an anthropomorphic
paperclip does not. The paper-cutout style, the glasses, and the cap do the rest
of the work.

#### He shows state, but never a score

This reverses a rule from the first draft of this document, which said the
Professor must look identical at all times. That rule conflated two different
things and was wrong about one of them:

- **Ambient state** — *is something cooking?* — is useful and warm. A kettle
  that is visibly on is not nagging you.
- **A score** — *you are 47% of the way to Advanced Gardening* — is the pressure
  this game is arranged to avoid.

The usability case is decisive, and it is created by a decision made elsewhere in
this document: **one node at a time means an idle slot is wasted time, and there
is otherwise no way to notice without opening the tree.** A Professor who is
visibly not reading is the cheapest possible fix for *"oh — I forgot to start
the next one."*

So he has two resting states:

- **Reading a book** while a node is learning.
- **A friendly, attentive face** when nothing is.

That is personality doing real work, and it costs the game nothing in coziness.

#### The clock

A small clock or timer may sit with him, showing **approximate** remaining time —
*about a day*, *about two hours*. This is consistent with the rules already
settled above, and depends on them:

- **Coarse, and it does not tick.** No seconds counting down in peripheral
  vision. What makes a clock stressful is watching it move; discrete jumps
  against a lazy number are the opposite feeling.
- **No finish timestamp.** "About a day left," never "ready Thursday 4:35pm."

The clock is also what gives the **task-completion jump** somewhere to land.
Without a visible clock, finishing a task has no payoff at the moment it
happens — which would quietly shave the "generous and visible jump" rule down to
nothing.

**Setting: `showLearningTimer`, defaulting to on.** Players who would rather not
see it can hide it, keeping the reading/idle state. The default matters more
than the toggle, since most players never open settings, and the jump needs a
surface for the majority.

#### What stays forbidden

- **Nothing that accumulates.** No lifetime nodes learned, no streaks, no
  session counts. A coarse countdown toward one finite thing is fine; a tally is
  not, and that is the line `economy.md` actually draws.
- **He never speaks unprompted.** No tips, no *"it looks like you're building a
  shovel,"* no attention-getting animation on a timer. He is clicked or he is
  ignored. This is also what keeps the homage affectionate rather than
  derivative — the famous assistant is a punchline because it interrupted.
- **No notification when learning finishes.** He changes back to his idle face,
  and that is all. You find out by looking, not by being told.

#### Placement, collapsing, and access

**Placement is the player's.** Movable like the minimap and compass, which means
he registers with `hudLayout.ts` rather than carrying his own coordinates — all
screen space is owned there. Repositioning needs a keyboard path, not drag-only,
and the control is a real `<button>` with an accessible name, not a decorated
image.

**He can be collapsed away entirely.** See the HUD-collapse principle below.

**Motion.** If the eyes move, they respect `prefers-reduced-motion`, and they
never move to attract attention. The reading animation must be recognisable as a
*state* from a still frame, not only from movement.

The full-screen tree view itself is owner-designed; this document specifies what
must be true of it, not what it looks like.

### Collapsing the HUD

Broader than the Professor, and worth stating here because he is the first
widget to want it: **every persistent HUD widget should be collapsible**, and
ideally the whole HUD at once.

Some players want a task-and-goal surface; some want to walk around inside a
paper world with nothing on top of it. Neither is the real way to play. Since
`hudLayout.ts` already owns all screen space, collapse belongs there as a
layout-level capability rather than something each widget reimplements.

Collapsed state persists, is keyboard reachable, and never silently re-expands
because something happened — a widget that pops back to tell you news is a
notification wearing a layout costume.

## Learning a node: patience or doing, player's choice

Settled 2026-08-06, after an argument worth preserving — the first draft of this
document banned learning timers outright, and that was too broad. What follows
is the position that survived.

**A node has a cost, and it can be paid two ways, either of which finishes it
on its own:**

1. **Wait.** Start it learning and go do anything else — explore, garden, talk
   to neighbours, or close the game and go to work.
2. **Do.** Complete the node's tasks. Each one jumps the clock forward, and
   completing them all finishes the node outright with no waiting.

Neither is the "real" route. This is the same shape as the owl's two prices
(`plans-and-blueprints.md`) — one path costs time, the other costs effort, and
the game does not have an opinion about which kind of player you are today.

### Why a timer earns its place

The rate limit is doing real work. Without it the tree gets eaten in a weekend
and there is nothing left to want, which is a worse outcome than waiting. A
learning timer also creates the specific pleasure of having something *in
progress* while you wander — you are not idle, you are between things.

And the accelerating tasks are the good part: a visible jump forward is a
genuine reward, earned by playing rather than by paying or waiting.

### The clock is real-world time

**Learning advances whether or not the game is open.**

An earlier draft of this section argued the opposite — that the clock should
run only on time spent in the world, to avoid training the player to log in and
log out. That reasoning was sound for a design where the timer was the *only*
way to finish a node. It stops being sound once tasks can finish one outright,
because the timer's job changes:

**The timer is the route for the player who cannot play right now.** Making it
require presence would defeat the only thing it is there for. A player whose
week gets eaten by work should come back to something finished, not to a clock
that waited for them and a branch they are now behind on.

So the trade is accepted deliberately: real-world time, and closing the game is
a legitimate way to play. What keeps that from becoming a check-in habit is not
the clock, it is the surrounding rules — **one node at a time**, so there is no
queue to optimise, and **no notifications**, so the game never reaches out to
tell you something is ready. Together those turn it into a slow cooker rather
than a scheduler.

Fairness across play patterns is handled by the second route rather than the
first: the player who *is* playing gets there faster through tasks. Nobody is
penalised for the shape of their week in either direction.

### Presenting the wait

- **Show approximate remaining time, never a finish timestamp.** "About a day
  left," not "ready at 4:35pm on Thursday." A clock time is an appointment.
- **No countdown that ticks in front of you.** Progress is something you check,
  not something that performs.
- **No catch-up bonuses, streaks, or "while you were away" summaries.** Coming
  back after two weeks and after two hours should feel the same.

### Tasks: the other way to pay

A node's tasks are drawn from its own subject matter, and are always things you
would have enjoyed doing anyway:

- make a quantity of something you can already make;
- reach a biome, or a landmark;
- befriend a critter far enough to be told a thing;
- hand something over — to the owl, to a shop, to a neighbour.

Four rules keep this from becoming the grind it could easily become. This is the
same failure mode `economy.md` watches for around generosity payoffs, and it
deserves the same suspicion:

1. **The task set per node is finite and small** — three or four, fixed, never a
   refreshing queue. There is nothing to farm because the list runs out.
2. **Tasks are never invented chores.** If a task would not be worth doing with
   no timer attached, it does not belong on the list.
3. **The jump is generous and visible.** A task that moves the bar a sliver is a
   chore; one that moves it a satisfying chunk is a reward. The temptation
   during balancing is always to shave this — do not.
4. **Nothing is ever totalled.** No "time saved this week," no lifetime tasks
   completed, no comparison between players. A number counting *down* toward one
   finite thing is not a score. An accumulating one is, and that is the line
   `economy.md` actually draws.

### The value scale

Task jumps are priced on **one consistent scale across the whole tree**, not
tuned per node. An easy task is worth the same everywhere; a multi-step task is
worth the same everywhere.

This is what makes the difficulty curve fall out of composition rather than
hand-balancing. Early nodes are short and their tasks are single, simple
actions. Deep nodes are long, and their tasks are **multi-step chains** — gather,
refine, then build — which is the same structure the game already wants for
furniture and clothing anyway.

So the early tree doubles as a **getting-started wizard**: the first nodes teach
the basic verbs by asking you to use them once each. Nobody has to write a
tutorial, because the first few tasks *are* one. And by the time a player is
deep enough for a genuinely long wait, they have chosen to be there.

### What is still forbidden

- **Paying to skip.** No chips, no anything, converts directly into learning
  progress. Patience and doing are the only two currencies here, and this is a
  culture-and-equity line, not a balance dial.
- **More than one node learning at a time.** See below — this is what stops the
  timer becoming a queue to manage.
- **Any notification that learning has finished.** You find out because you
  opened the tree yourself, not because the game reached out to you. The
  paperclip does not change appearance when learning finishes.

### One node at a time

Only one node can be learning. Some nodes additionally require others first,
so parts of the tree have a fixed order.

One-at-a-time is doing two jobs. It makes the choice *mean* something — picking
this branch is picking not that one, for now. And it is the rule that keeps
real-world timing harmless: with a queue, the efficient player logs in to keep
the pipeline full, and the game has quietly become a chore chart. With one, the
worst case is that you forget about it and are pleasantly surprised.

The craft wait already in `getCraftDuration` — six to ten seconds, shortened by
Thing Maker level — remains the model for how waiting should feel at the small
scale: a pleasant beat, never a wall.

## The split: tool plans versus everything else

Settled 2026-08-06. This is the structural decision of this document, and it
changes `plans-and-blueprints.md` — the two classes of plan now behave
differently on purpose.

### Tool plans — the tree, and only the tree

**Every tool plan comes from a knowledge tree node. Tool plans cannot be found
in the world, cannot be bought from the owl, and cannot be gifted or mailed.**

The reasoning: the tool ladder is the spine of progression, and a spine should
be *predictable*. A player who wants the next shovel should be able to look at
the tree, see exactly what standing between them and it, and go get it — rather
than hoping for a lucky dig or a shop having stock. It is a stable, scalable
model, and it is what makes the game easy to walk into: the answer to "how do I
get better tools" is always the same answer.

It also removes a whole class of tuning problem. Tool tiers no longer have to be
balanced against a random roll *and* a shop price *and* a barter list.

**What replaces gifting a tool plan: gifting the tool.** You cannot hand someone
the knowledge, but you can make the thing and give it to them, which is warmer
anyway — a gifted tool is something you made, not something you happened to find
twice. The generosity survives the change; only the object does.

### Everything else — found, bought, gifted, as designed

Furniture, clothing, buildings and structures, decoration, oddities: these
remain **plan objects** exactly as `plans-and-blueprints.md` describes them.
Blueprint stock, found in the world, sold by the owl, brought by critters,
gift-only when duplicate.

This is where delight lives, and delight should be *found*. Nobody needs a
research node to be allowed to own a nice chair.

| | Tool plans | Everything-else plans |
| --- | --- | --- |
| Knowledge tree | **Only source** | No |
| Found in the world | No | Yes |
| Bought from the owl | No | Yes |
| Brought by a critter | No | Yes |
| Is a physical object | No — it is knowledge | Yes — blueprint stock |
| Giftable | No; gift the made tool instead | Yes, and duplicates are gift-only |

The two halves answer different questions. The tree answers *"how do I get
better at this game?"* — and should be legible, ordered, and never luck. The
world answers *"what did I find today?"* — and should be surprising.

### Plan sites are non-exclusive

Settled 2026-08-06, and previously only implied. Applies to the
everything-else plans, which are now the only sited kind.

A sited plan yields for **every player who does not already have it.** The
first person to dig it up does not take it from anyone.

Two reasons. `economy.md` requires that scarcity cannot be manufactured, and
the duplicate rule exists so a player physically cannot deny a plan to others —
an exclusive site would reintroduce by geography exactly what that rule
forecloses. And a plan is knowledge, not ore. Ore is a quantity in the ground.
Knowledge does not leave the place you learned it.

This also resolves the terrain question cleanly. Dug ground stays dug — no
healing on a timer, per `game-design-plan.md` — and that stays true, because
plan availability was never a property of the hole.

## What this does to the roadmap

The tree **demotes deterministic plan siting from blocking**, and narrows what
it is for.

Siting sat at the front because progression could not be *played* until plans
could be found. With tool plans coming from the tree, that is no longer true at
all: the entire tool ladder becomes reachable, testable, and tunable without any
siting existing.

Siting and the hot/cold detector remain wanted, and now apply **only to the
everything-else plans** — furniture, clothing, structures, decoration. That is a
better job for them: a detector you build because you want a particular chair is
a nicer object than one you build because it is the only way to progress.

The argument in 1.1 for determinism is unchanged and still correct: a hot/cold
detector cannot work against a roll made at dig time, because there is nothing
for "warmer" to be nearer to. Deterministic siting is not predictable siting —
the player still has no idea where it is.

## Build order

1. **`TECH_DEFS` and the tree as a read-only view — M.** Author the node
   catalog, then render it: every node, what it grants, what it requires, its
   cost in small print, muted when unreachable. The whole tree visible.

   Ships useful on its own — it is the legibility fix, and it is worth looking
   at before any of it is earnable.

2. **Node costs — M.** The learning clock and the tasks.

   The clock is **real-world elapsed time** and needs a persisted start moment
   per in-progress node. One node at a time, so this is a single field, not a
   collection — and keeping it a single field is what enforces the rule.

   Tasks start with the two cheapest to check: *make N of X* and *own tool Y*,
   both answerable from existing player state. Jumps come off the shared value
   scale, not per-node tuning.

3. **Nodes granting tool plans — S.** `player.plans` already takes an id from
   anywhere; this is the same write. At this point the ladder is climbable and
   **progression is playable end to end.**

4. **Remove tool plans from every other route — S.** The owl's stock, world
   siting, and critter gifts become everything-else plans only. Mostly a data
   and copy change, but do it deliberately rather than letting the old routes
   linger as dead paths.

5. **The no-self-gating test (roadmap 1.5) — S.** Unchanged and now more
   valuable: a tree makes a deadlock look like an authored dead end rather than
   bad luck, which means players will report it as a bug in the design.

Siting, the detector, and the owl follow at whatever pace they deserve.

## Accessibility notes, decided up front

Trees are the single worst-offending UI pattern in builder games for anyone not
using a mouse, and retrofitting this is much harder than doing it now.

- **The graph is a view over a list, and the list is the real thing.** Keyboard
  and screen-reader users traverse a nested structure with real semantics — not
  a canvas of absolutely-positioned boxes with a tabindex sprinkled on.
- **Never colour alone** for locked / available / owned. Shape, label, and the
  blueprint paper stock already do this work in the Thing Maker; reuse it.
- **Every node states its own requirements in text.** "Needs the Okayish Shovel
  and 4 sticks" beats a line drawn between two boxes, for everybody.
- **Position is never the only thing carrying meaning.** If the layout says
  "deeper is later," the node says so too.
- **Learning progress is stated in words, not just a bar.** "About a third of
  the way" beats a filled rectangle for anyone not reading it visually — and
  the vagueness is deliberate, since a precise percentage is the kind of number
  that invites watching.
- **The Professor's state has a text equivalent.** Reading-versus-idle carries
  real information now, so it cannot live only in the artwork: his accessible
  name says which he is doing.
- **Unlock icons are labelled.** The two-tier icon grid is the card's main
  answer to "what does this get me," which makes unlabelled pictograms a way of
  withholding it. Text alternatives are not optional decoration here.
- **The task-completion jump must not rely on animation to be understood.** The
  reward can be animated; the fact that it happened has to survive
  `prefers-reduced-motion`.

## Settled 2026-08-06, previously open

Recorded rather than deleted, because each was a real fork:

- **Tasks can finish a node outright.** They are a full second route, not an
  accelerant. The finite task list is what prevents farming; a percentage cap
  would only have forced waiting on someone who would rather be doing.
- **One node at a time**, with fixed ordering on parts of the tree.
- **The whole tree is visible from the start**, unreachable nodes muted.
- **Nothing can be paid for with chips.** Culture and equity line, not a dial.
- **The clock is real-world time**, and closing the game is a legitimate way to
  play.
- **Tool plans come only from the tree**, and are not objects. Everything-else
  plans keep the full object design.
- **The tree opens from the Professor**, a movable HUD paperclip, not a
  scrapbook tab. He shows ambient state (reading / idle) and an optional coarse
  clock, but never a score and never a notification.
- **Every HUD widget is collapsible**, for players who want the world without
  the furniture.

## Still open

1. **How long is "long"?** The deep end of the tree wants a wait that reads as
   committed rather than punitive, and there is no way to pick that number
   without playing it. Tune from the shallow end up, and treat any duration that
   makes a player feel they *should not* close the game as too long.
2. **Do node tasks show up anywhere outside the tree?** A gentle in-world nudge
   is helpful; a quest marker is a different game. Leaning: visible in the
   tree view only, and never on the world view or the paperclip.
3. **Does the tree show things other players have made or learned?** Charming,
   and a comparison surface — which is the thing `economy.md` keeps refusing.
   Hold until multiplayer forces an answer.
