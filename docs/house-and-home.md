# House and home

Design intent only. Nothing here is built. Written 2026-09-20 from the owner's
"thinking out loud" notes, sorted against what the game already has. Companion
to `scenes-and-interiors.md` (how you *enter*) and `land-and-dwellings.md`
(where homes *are*).

## The short version

Everyone starts with a **tent-like house under construction**, with the
smallest Thing Maker beside it. Every later building tech is a **piece you add
to that house**, so the house is never "done", it just grows. Bigger jobs
(upper floors, wings) are **projects**: pay in materials whenever you like, then
wait a real-time build. Friends walk in, others knock, and the owner can throw
the doors open for a party.

The main call in this doc: **one mechanism for all growth** (a *dwelling
project*), so walls, a roof, a second floor and a tower floor are the same
thing with different numbers.

## Sorting the notes

| Your idea | Verdict | Why it fits (or what changes) |
| --- | --- | --- |
| Starter tent on signup | Fits, already half there | `land-and-dwellings.md` already says every player gets a starter house, mailbox and base Thing Maker. The **Home marker** ("BUILDING A HOME" sign, `sharedHomeVisuals.ts`, `HOME_PLACE_ID`) is the stake for it. The tent replaces the sign as what stands on that spot. |
| Piecemeal upgrades: walls, floor, roof, stairs, rooms | Fits, and answers scenes decision 1 | Rooms are **built**, not granted. Each part is a tech-gated plan that pays in refined material by structural class, which is exactly what the new refining ladder was for. |
| Roof replaces the tent roof | Fits | A dwelling is a list of **parts**; the exterior is drawn from whichever parts exist. Installing a roof retires the tent roof. |
| Starter Thing Maker, ~1/3 size, current model = fully upgraded | Fits, and is almost free | The Thing Maker **already has levels 1 to 3** (`world.thingMaker.level`, `upgradeThingMaker`, level 3 is "fully upgraded"). Only the *look* is missing: scale and detail by level. |
| A few Thing Maker designs | Later | A cosmetic id beside `level`. Nothing else depends on it. |
| Entry: mutuals welcome, others knock, owner can make friends knock | Fits | "Mutuals" = an accepted friendship, which `accounts-worlds-and-social.md` already defines. Blocks already override everything. New: a per-home entry setting. |
| Open house, scheduled or toggled, sign plus mailbox balloons | Fits | A small state on the home (`openHouse`, optional window). Cosmetic parts draw for everyone. |
| Parties: invites, reminders, host toast with directions | Fits, with one new piece | Invites ride the existing mail. Reminders are local, in-game. Directions reuse the guide (see below). Needs a guide target that is not a saved place. |
| Real-time party chat | Fits | Chat stays inside the house (decision made 2026-09-20). A party is just a well-attended house. |
| Snacks and smoothies | Later, needs a food system | Harvested food exists; there is no cooking or serving yet. A **free display case is a snack table**, which is the cheap first version. |
| Costume parties | Free | Avatars are already fully designable and wearable. The host sets a theme label; no new rules. |
| Display cases, sell or free, auto price | Fits, but **free first** | Player-to-player chip sales are parked (`economy.md`). See the display-case section. |
| Outdoor market instead of a tower | Fits | Cases work outdoors on your own lot. A shared market green is optional later. |
| Tower-style floors: pay in parts, then a long build | Fits, and is the growth model | See dwelling projects. |
| Guide auto-off near the destination | Done | `guideArrival.ts`, 2026-09-20. |
| M for map, G for guide/mark | Done | Swapped 2026-09-20. |

## The dwelling

A home is one record per player (you already cannot hold two homes):

- **Parts.** `tent`, then `walls`, `floor`, `roof`, `stairs`, `room:<n>`,
  `floor:<n>` and so on. The exterior and the interior are both drawn from the
  part list, so a half-upgraded house is always a coherent picture.
- **Projects.** At most one or two in flight. See below.
- **Settings.** Entry policy, open house, current party.

Stage 0 is the tent, given at signup, with a Thing Maker level 1 next to it. It
is a real home from the first minute: it holds the mailbox and the Home marker.

**Where it lives.** Solo first: in the save, next to `world.thingMaker`. Once
guests exist it moves to the authoritative room (the `HomeSchema` already
carries `page`); the settings and part list are small enough to ride the same
schema. The exterior is one build piece as far as the world is concerned, per
`scenes-and-interiors.md`.

**Interior.** The tent is enterable as soon as scenes step 3 lands: one small
round room, lantern-lit. It is "bigger on the inside" from day one, which is a
nice first taste of the idea. Until then the tent is exterior only and the Thing
Maker stays outdoors beside it, where it already is.

## Dwelling projects: one mechanism for all growth

A project is `{ part, requires, paid, startedAt?, completesAt? }`.

1. **Unlock.** A tech grants the *plan* for the part (an ordinary plan, the same
   way build-piece plans work today, so the Thing Maker and the tree already
   explain what is missing).
2. **Pay.** Put materials in whenever you like, in any amounts, over any number
   of visits. The panel says, in words, what is still needed
   ("Layerboard 4 of 6. Red brick 6 of 6."), with a "give everything I can"
   button. Contributions can be taken back at any time (refund rules below), so
   nothing is lost by stopping halfway.
3. **Build.** When the last material is in, the timer starts. It is a
   **timestamp** (`completesAt`), so it runs while you are away, the same
   time-derived way plants do. Small parts have no wait; big ones do.
4. **Finish.** A toast and a mail line when it completes. The part appears.

While a project builds, the house wears **scaffolding**. That is the same
"under construction" look the tent has at the start, so one visual idea covers
both.

Rules that keep it honest and kind:

- **Refunds are always available, and always the same shape** (decided
  2026-09-20). Taking materials back from a project pays out:
  **100%** if the build has not started, **95%** if it has (the timer was
  running), **90%** for a part that was already finished, which is dismantled.
  Amounts round to the nearest whole piece, so tiny stacks lose almost nothing.
  The refund goes straight to the bag and is announced in words.
- **No skipping the wait for chips or anything else.** There is no shortcut to
  sell, and the wait is part of the goal-setting you described.
- **The rest of the house stays usable** while one part is being built. Only the
  new part is sealed.
- **Every project states its cost and its wait before you commit**, in text.
- Wait times and material amounts are data in a catalog, so they can be tuned
  without touching code.

### What each part asks for

Uses the structural class table in `materials-and-resources-v1.md`.

| Part | Needs (tech) | Material class | Wait |
| --- | --- | --- | --- |
| Tent | nothing | given | none |
| Walls | a Walls node after Materials and Refinement 1 | 2 (layerboard, red brick) | short |
| Floor | a Floors node, same branch | 2 | short |
| Roof | a Roofing node | 2 | medium |
| Stairs and upper floor | after Materials and Refinement 2 | 3 (crossbound timber, faced masonry) | long |
| Extra room | after Walls and Floor | 2 | medium |
| Tower floor *n* | after Storybeam exists | 4, and more of it, and rarer, each floor | longer each floor |

Notes:

- Material class 4 needs storybeam, which needs canvas, which needs the fiber
  path (yarn, cloth). That is unbuilt, so tower floors beyond the third are
  *content waiting on materials*, not on this design.
- The tech nodes are new tree nodes. They must follow the existing invariant
  that ready nodes depend only on ready nodes.
- Amounts and waits per floor should rise steeply enough that a tall house is a
  long-term goal, not a weekend. Suggested starting shape: each floor asks for
  roughly one more class-3 stack than the last, and its wait grows by about half
  again. To be tuned in play.

### Thing Maker: the visual half of levels

The machine does **not** just scale up. Owner direction, with rough mockups
(2026-09-20): it stays about the same height at every level and *gains* parts,
so level 3 is today's full model and the lower levels are plainer versions of the
same machine. Every part at level N is still there at N + 1.

| Level | Adds |
| --- | --- |
| 1 | Small brown box, crank ring with a red knob, plan slot with a page in it, three buttons, small eyes, a bell on a post, a plain brown ledge for finished things. |
| 2 | Wider body, larger eyes, blue top sheet, gauge with a swinging needle, lever, paper tray, brass crank ring. |
| 3 | Widest body, plaid console, central column, belly panel, the two rollers and the strands, full-size eyes, iron crank ring. This is the original model, unchanged. |

Rules: same body height and eye line at every level; every level has a bell; the
tray stays in the same place so finished things are drawn and picked up the same
way. Upgrading rebuilds the model and rings the bell (not under reduced motion).

Accessibility note, since the small one is the risky one: **do not shrink the
interaction area or the prompt with the model.** The reach, the label, the solid
footprint and the pointer target stay the size of the full machine, so a plainer
machine is never harder to find or use.

## Who can come in

Two settings, plus one toggle:

| Setting | Options | Default |
| --- | --- | --- |
| Friends | walk in, knock, not at all | walk in |
| Everyone else | knock, not at all | knock |
| Open house | off, on now, scheduled | off |

- **Blocks always win.** A blocked player cannot enter or knock, and is not told
  why (`communal-multiplayer.md`: block is silent). Checked at the door, not
  only at chat.
- **Knocking.** The owner gets a toast and an inbox line with two buttons: *Let
  in* and *Not right now*. A knock that is not answered is left as a note if the
  owner is away ("Sam knocked at 4:10"). It expires quietly after a few minutes.
  Nothing on it needs quick reflexes.
- **Knock limits.** One knock per visitor per door every few minutes, so a knock
  cannot be turned into a buzzer.
- **Open house.** Everyone may walk in. The door shows a "Come on in" sign and
  the mailbox carries balloons, for everyone to see. Owners can schedule a window
  (and, later, repeat it) or just turn it on.
- **Privacy.** Standing at a door must not reveal where someone lives to people
  who could not already see it. The wayfinder rule from
  `accounts-worlds-and-social.md` applies: directions only where the target has
  allowed location. An open house or a live party is that permission, for its
  window.
- **Every sign is also text.** "Sam's house is open. Come on in." appears in the
  nearby list and is announced, not only drawn.

## Parties

A party is an open house with a name, a time, and a guest list.

- **Invite.** The host picks who (friends, or a chosen few) and a time.
  Invites are mail, so they arrive whether or not the guest is online.
- **Reminders.** The guest chooses ("alert me 15 minutes before", or none) when
  accepting. Delivered in game as a toast and an activity-log line. No system
  push; it only fires while the game is open, and the invite says so.
- **While it is on.** The host sees a small banner ("Your party is on", with
  who is inside). Guests who accepted see "Sam's party is on. **Get
  directions**".
- **Directions** set the guide to the host's home. Today the guide points only
  at *saved places*, so this needs a small extension: a guide target that can be
  a point, not a registry entry. When you get within the arrive radius the guide
  switches itself off (already built), and the banner button becomes **Knock**
  or **Come in**.
- **Chat.** Inside the house, in real time, for everyone present. This is the
  point of a party.
- **Snacks and drinks.** A free display case is a snack table today. Real
  cooking is a separate, later system (see open questions).
- **Decorating and costumes.** Placed pieces indoors arrive with player-built
  interiors. A costume party is a theme label on the invite; avatars already do
  the rest.

## Display cases

A build piece that holds items, placeable inside or outside your own home. It
is a **mailbox for strangers**: the machinery for held parcels already exists
(authoritative parcels, 2026-09-14), so a case should reuse it rather than
invent a second store.

Modes, chosen by the owner per case:

| Mode | What visitors can do | Status |
| --- | --- | --- |
| **Show** | Look, read the label. Cannot take. | Free to build. This is the "trinket display" `economy.md` left open. |
| **Free** | Take one, or take a limit per visit. | Free to build. It is gifting, which the economy wants first. |
| **Priced** | Pay chips, take the item. | **Parked** with player-to-player chip sales. |

Why free first: `economy.md` keeps chip sales between players parked because
peer trade is where communal economies turn into markets, and it wants **flat
prices and no price-shopping**. That points at the owner's price memory too:
**the owner never types a price.** A priced case charges the shop's own sell
price for that item, exactly, so it is the shop at a different address and
price discovery never starts. ("Slightly higher" is where margins creep back
in; recommend against it.) Proceeds go to the owner's account and arrive as
mail, so an offline owner still earns.

**Per-visitor limit (decided 2026-09-20).** Each case has an owner-set limit:
*N items per visitor per time window*, with a sensible default (one item per
visitor per day). It is tracked per visitor, so when the same person comes back
after the window, their allowance is reset. The owner can raise, lower or remove
it. A way for the owner to see who took what (a log line, not public shame) goes
with it.

**Outdoor market.** Your lot is your stall, nothing extra to build. A shared
"market green" per neighbourhood, with a handful of claimable stall slots, is an
optional later addition and avoids making a single tower a destination that
everyone must climb.

## What this changes in other docs

- `scenes-and-interiors.md`: decision 1 (rooms are built, tent is the starter
  room), decision 2 (default: friends in, others knock; owner-only stays an
  option), decision 3 (chat stays in the house) are now answered.
- `land-and-dwellings.md`: the starter house is a tent, and moving has a new
  open question (what happens to the parts you built).
- `economy.md`: the display-case modes settle the "trinket display" question
  and restate the price rule.

## Order of work

Each slice ships alone.

1. **Thing Maker levels look different.** Parts by `level` (see above), keep the
   interaction area full size. Needs nothing else. *S*
2. **The tent.** Replace the Home marker's sign with a tent on the same spot;
   the marker's name becomes its label. Exterior only. *S*
3. **Dwelling record and parts**, solo, in the save. Part list drives the
   exterior. *M*
4. **Projects:** pay, wait, finish, scaffolding, toast and mail line. Walls,
   floor, roof first. *M*
5. **Tech nodes** for walls, floors, roofing, stairs, rooms. *S*
6. **Scenes steps 2 and 3**, so the tent and then the house can be entered
   (`scenes-and-interiors.md`). *M*
7. **Display cases: Show and Free.** *M*
8. **Guests:** presence by scene, the entry settings, knock, block checks at the
   door, and friendships. **Built 2026-09-20** (see below). *L*
9. **Open house and parties.** Open house **on/off is built** with step 8;
   parties, schedules and the guide-to-a-point extension and invites by mail are
   not. *M*
10. **Priced cases**, only when player-to-player chips are unparked. *S*

Steps 1 to 5 need no multiplayer and no scenes, so they can start now.
**Step 6 is built too** (see below).

### Built 2026-09-20 (slices 1 to 5)

First seen in the running game on 2026-09-20; the tent, panel and collision were adjusted after that look.

- **The existing starter house stays.** The black-roofed test house (walls,
  windows, roof at about 2.7, 0.35) is left in the world on purpose (owner,
  2026-09-20). Later the tent can be upgraded to the same materials, and this
  house simply remains beside the owner's home as scenery. Do not remove it or
  build over it.
- **Maker look.** `thingMakerLook.ts` lists which parts each level has (they only
  accumulate), and `thingMaker.ts` builds the model from that list and rebuilds
  it when the level changes. Same height at every level, a bell at every level.
  The pointer target stays full size through an invisible hit box.
  (First built as scale-by-level, 0.34 / 0.67 / 1; replaced the same day by the
  owner's mockups.)
- **Tent and exterior.** `dwellingLook.ts` (pure plan) and `dwellingExterior.ts`
  (primitives, rebuilt only when the plan's signature changes). `world/homeSite.ts`
  says where it stands: 2.1 west and 1.2 south of the Home place, door turned to
  face it, so you spawn on the doorstep. It is solid (a circle for the body, one
  per annex room), so you cannot walk through it or dig under it. Scaffolding
  shows while anything is being built.
- **Record.** `world.dwelling { parts, projects }`, sanitized on load, no save
  version bump. `catalogs/dwellings.ts` holds the numbers; `dwellingState.ts`
  is the cycle-safe half; `dwelling.ts` holds the commands.
- **Projects.** Contribute any amount, any number of visits. The timer is a
  timestamp, so it runs while away. At most 2 projects hold materials at once.
- **Refunds.** Before the build starts 100%, once started 95%, a finished part
  taken down 90%. Taking down is blocked while another part depends on it.
  `dismantleDwelling` pays a whole house back at 90% for moving; nothing calls
  it until moving exists.
- **Panel.** `homePanel.ts`, opened with E beside the tent. Plain-language
  costs ("Layerboard: 2 of 4 in (you have 3)"), no controls on locked cards,
  time left in words, a toast when a build finishes.
- **Know-how.** Five tree nodes teach five abilities: Floors, Walls, Roofing,
  Extra rooms, Stairs and upper floors (see `knowledge-tree.md`).

| Part | Cost | Wait |
| --- | --- | --- |
| floor | layerboard 4, binding-cord 2 | 2 min |
| walls | layerboard 6, red-brick 4, binding-cord 2 | 4 min |
| roof | layerboard 8, binding-cord 4, paper-mortar 2 | 6 min |
| upstairs | crossbound-timber 6, faced-masonry 4, binding-cord 4 | 15 min |
| room-1 | layerboard 8, red-brick 6, binding-cord 3, paper-mortar 2 | 8 min |
| room-2 | layerboard 10, red-brick 8, binding-cord 4, paper-mortar 3 | 10 min |

### Built 2026-09-20 (slice 6)

The tent can be entered: Go inside in the panel (or E at the door), and back out
with the Leave button or E at the door. Solo, seen working in the game. Details in
`scenes-and-interiors.md`.

### Built 2026-09-20 (slice 8: guests, friends, visiting)

The server side is proven by real-socket tests (`guests.room.test.ts`) and the
client state by unit tests. In the browser so far only the drawn neighbor homes
and their signs have been seen (injected homes); the panels, the knock card and
the visit itself still need a look, and two real browsers in one room have not
been tried. **Protocol v10.**

- **Friendships.** Request, accept, not now, remove, take back. Account-wide, kept
  in a JSON store on the server (`friends.ts`); a block ends a friendship. Guests
  cannot have friends. The friends list is a panel opened from a HUD button
  (badge shows waiting requests); "Add friend" is also on the player card and the
  neighbor's-door panel. Friends are the tier a door can treat differently.
- **Visible homes.** A neighbor's home is drawn as the same tent or house the owner
  sees (`buildHouse`), from the parts they have finished, with scaffolding for the
  part going up, and it is solid (`world/neighborHomes.ts`, `footprints.ts`). A sign
  beside the door has their name, and says OPEN HOUSE when it is. The owner
  re-publishes their look whenever a part is finished or started.
- **Entry.** Default: friends walk in, others knock, open house off. E at a
  neighbor's door (or clicking the house) opens the door panel: what it looks like
  in words, the open-house line, and one button (Go in, Walk in, or Knock). The
  answer stays on the panel as a sentence. The room decides: `admitted`, `knocked`,
  `no-answer`, `declined`, `closed`, `busy`. **A blocked visitor gets exactly the
  `closed` answer.** Blocking a guest also puts them out and ends the friendship.
- **Knocking.** A floating card ("Bo is at your door", Let in / Not right now),
  announced through the polite toast, never takes focus, lapses on its own after 5
  minutes. The same two buttons are in the home panel. Letting someone in gives
  them a 2-minute one-use permit; they take it up at the door (never pulled through
  it from a distance). One knock per visitor per door per 3 minutes. If the owner is
  not in the room a note lands in their mailbox, at most once per pair per 6 hours.
- **Inside.** The visitor sees the host's interior (built from the host's published
  parts), the people inside with them, and only their chat. Leave puts them at the
  host's doorstep. The owner's home panel has "Who can come in" (friends: walk in /
  knock / closed; everyone else: knock / closed; open house), knocks waiting, who is
  inside, and "Ask to leave" (not a block; they can knock again).
- **Presence.** The room owns `inside`; two players see each other only when it
  matches. The first move after crossing a door is an unclamped jump that must land
  in the interior space, or near the host's door on the way out; anything else is
  put at the door. A guest (no passport, so no home on record) is still shown at
  their doorstep, as before.
- **Not built:** parties, invites and reminders; scheduled open house; the mailbox
  balloons; "directions" to an open house; showing a house's interior to someone
  outside it; furniture or pieces inside shared houses (waits for display cases).
  The inbox line for a knock is only for owners who are away; online owners get
  the card.

Still to build: the mail line for a finished build waits on the mailbox. Faced masonry has no art yet, so the
upstairs cost shows as text only.

## Open questions

1. ~~**Moving.**~~ **Decided 2026-09-20:** the old house's parts are paid back
   as materials on a move, with a 10% loss (rounded per material). Carrying the
   walls would make moving free; losing everything would make it a punishment.
2. **Cooking and serving.** Smoothies and snacks want a small food system. Not
   needed for parties to work.
3. **How long is a long wait?** The right numbers only show up in play. The
   first pass uses short waits (minutes) so the mechanism can be felt; the real
   numbers are catalog data.
4. ~~**Can a project be abandoned?**~~ **Decided 2026-09-20:** yes, with the
   refund rule above (100% / 95% / 90%).
5. **Pets and critters at a party.** Out of scope until pets exist.
6. **Reminders when the game is closed.** Needs push or email, and neither is
   built. In-game only for now.
