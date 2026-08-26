# Exchange

Design settled 2026-08-04. Nothing here is implemented.

## The framing

Communal and reciprocal, drawing on Indigenous economic models rather than
market ones. Kindness, barter, and the benefit of helping others — **not**
accumulation, price discovery, or scarcity as pressure.

This is a constraint on the *mechanics*, not a coat of paint on them. A system
that quietly rewards hoarding does not become communal because the shopkeeper
is polite.

### Farmers market, not grocery chain

Commerce here is a **layer that lets players make things, share them, and be
rewarded for their time and effort**. That is the lens for every decision
below. A player can run a small farm, or a small business building and selling
products to other players — and that is *more* game, not a deviation from the
premise.

The distinction that matters: a farmers market is people selling what they
made to neighbours at prices everyone can see. A grocery chain is an
intermediary extracting a spread. Currency in a farmers market is a
convenience; currency in a chain is the mechanism. This design wants the first.

**Barter is always available.** Not a fallback for players without chips — a
permanently equal option, everywhere it makes sense. That is what keeps the
economy from collapsing into a single number, and it is why the currency and
the communal framing do not actually conflict: chips are one way to settle up,
never the only one.

The decisions below are what keep it a market rather than a chain. Read them as
a set — flat prices, thin margins, universal buying, and non-fungible
generosity are each load bearing.

## Shiny chips (₡)

The world's currency is the **shiny chip** — *chips* for short, written ₡.
They look like poker chips, but shiny.

What chips are for: buying tools, materials, pre-made furniture and clothing,
and anything a player would rather not make themselves. **Not plans** — every
non-starter plan is learned in the knowledge tree and cannot be bought at any
price (`knowledge-tree.md`). Nothing converts chips into progression. What
chips are explicitly *not* for: being the score. Nothing in the UI should
invite a player to watch the number go up.

### Where chips come from — and do not

**Chips cannot be mined, dug, harvested, or found in the ground.** They are not
a material and there is no chip node anywhere in the world. This is the single
rule that keeps the economy from becoming an extraction loop.

Chips enter a player's hands three ways:

1. **Selling** things you gathered, grew, mined, or made, to a shop.
2. **Mail** — arriving as a gift, a generosity payoff, or from another player.
3. **Recycling** outgrown tools and (poorly) materials.

Every route requires having done something first. There is no route that is
just *finding money*.

## Shops

### Everything sells, everything buys

Anything that can be found, harvested, or grown can be sold to a shop and
bought from one. Every shop buys at least some combination of materials.

**Implementation note that matters more than it looks:** wire each shop with
an explicit `sells` list and an explicit `buys` list from day one, even while
both are set to "everything". Whether general shops and specialty shops should
differ is undecided (below), and the difference between "we can tune that
later" and "we have to restructure for that later" is whether those two fields
exist now.

### Thin margins, flat prices

- A shop's sale price carries only a **minimal markup** over what it pays you
  for the same item. The shop is a neighbour doing you a service, not a
  business extracting a spread.
- **Prices are comparable shop to shop.** A player should never need to
  price-shop. Comparison shopping is price discovery, and price discovery is
  the market model this design is refusing.

### Specialty shops differ by geography — decided

Settled 2026-08-04. A specialty shop is special because of **where it is**: it
sits close to the biomes that produce its materials, so harvesting and selling
that material is a shorter trip.

Nothing about its *prices* differs. The advantage is entirely in the walk.

**Why this and not the alternatives.** Better rates at specialty shops would
reintroduce exactly the price-shopping that flat pricing exists to prevent —
a player comparing two shops is doing price discovery, whatever we call it.
Exclusive stock is a fine idea but it is a content decision wearing an economy
costume, and it can be layered on later without touching pricing at all.

Geography rewards *knowing the world*, which is the same thing biome-exclusive
materials and critter knowledge reward. One kind of expertise, reinforced from
three directions.

### Recycling

Recycling bins are scattered through the world. They accept:

- **Lower-tier tools**, exchanged for chips. This gives the tool ladder a
  bottom rung that does not become clutter — your outgrown Flimsy Shovel is
  worth something.
- **Materials**, at a rate distinctly *worse* than selling to a shop.

The gap between the two rates is the point: a bin is convenience, a shop is a
relationship. The bin should never be the better answer for anything except
tools you have replaced.

## Giving, mail, and mailboxes

### Direct giving

Materials, chips, tools, and other finished creations can be given to another
player — either handed over directly, or sent through the **Papr World Mail
System (PWMS)**.

**Plans cannot be given or mailed.** They are knowledge learned through the
tree, not inventory objects. Generosity takes the better form anyway: make the
tool, furniture, clothing, decoration, or structure and give them that.

### Mailboxes

**Every player is given a mailbox automatically**, along with a base Thing
Maker, at the start. Neither is earned, found, or built — they are what you
begin with.

**Mail is not location-specific.** Think of the mailbox as an inbox rather than
as a physical delivery address: things sent to you arrive, wherever you are and
wherever you have settled. Nobody can miss a gift because they moved.

If a player later relocates, a mailbox *at the new place* is something they can
build — but that is decoration and convenience, not plumbing. The mail itself
never depended on it.

**Reinforced 2026-08-06:** `land-and-dwellings.md` makes *planting your mailbox*
the ritual that begins a move. That is a ceremony, deliberately not a mechanism.
The inbox keeps working throughout, and mail must never come to depend on where
the object stands — decoupling them is what let mail ship without placed-entity
persistence in the first place.

**This settles a dependency the roadmap was carrying:** an inbox does not need
placed-entity persistence, so mail is no longer coupled to the building system.
It can ship early and on its own. Building a nicer mailbox later is a
building-system feature that happens to be mailbox-shaped.

### Generosity pays off

Sharing resources produces unearned good things:

- A little extra ₡ turns up in your mailbox.
- A nearby critter *"heard you did something nice"* and brings a collectible
  trinket or a decoration for your house.

**Trinkets from critters cannot be sold.** They are keepsakes: things to store
or display, and that is all. This is a hard rule, not a price of zero — a
trinket has no sale path at any shop.

That rule is what makes the whole generosity system safe. A gift that can be
liquidated is income, and income from giving is a farming loop. A gift that can
only be *kept* is a memento, and nobody optimises a memento.

The remaining guardrails:

- **Unpredictable** — random, not a rate.
- **Never itemised** — no "generosity: 12" anywhere, no notification tallying
  what your kindness earned.
- **Chip payouts stay small and rare.** Chips *are* fungible, so this is the
  one generosity reward that could still become a loop. Keep it clearly less
  than what the given item was worth, so giving is never the efficient way to
  earn.

## What friendship already gives you

`friendship.ts` tracks a per-critter relationship that deepens through
interaction, and the conversation engine gates content on `minFriendship`.
That is a reciprocity model already built, and it stays as the *other* half of
this system, doing what currency cannot:

- A relationship that grows when you give and stays when you take nothing.
- Content — story, invitations, personal things — that opens as it deepens.
- No balance, no ledger, nothing to optimise.

Note that `biome-knowledge.md` settles that friendship does **not** gate
knowledge. So what deepening friendship opens is invitation and story — never
information a player could otherwise be missing.

The primitive still worth building early is **giving a thing to a critter**.
The owl-itect may want a rare paper from a biome she does not fly to for one of
her finished creations. That is a need, not a price, and it reuses friendship
rather than currency. When she later sells or commissions finished goods,
barter and chips can coexist; neither route sells plan knowledge.

## Things to be careful of

- **Scarcity as pressure.** Biome-exclusive materials make exploration
  meaningful; they must not make a player who cannot travel feel locked out.
  The multiplayer harvest allowance in `tool-and-supply-progression.md` is the
  same concern in another shape.
- **Anything that counts up.** Friendship levels are bands rather than points
  on the surface for exactly this reason. Chips are unavoidably a number — so
  keep the number *quiet*: no session totals, no earnings summaries, no
  leaderboards, ever.
- **Making generosity a strategy.** Covered above; it is the failure mode this
  whole document is arranged around. **Live watch item as of 2026-08-06:** the
  garden harvest mirror in `land-and-dwellings.md` — harvesting someone's garden
  mails them the same yield — means two players harvesting each other's gardens
  net 2×. Logged there with the reasoning for shipping it generously anyway, and
  with the weakest-first list of interventions if it misbehaves. Note that the
  no-tallies rule is what keeps it unoptimisable: a player cannot see the 2×
  without doing their own bookkeeping.

## Player-run enterprise

Explicitly wanted, not merely tolerated: a player should be able to run a small
farm, or a small business making and selling goods to other players. Growing,
making, and trading are the reward for time and effort.

This mostly falls out of decisions already made — player-made furniture and
clothing can be sold, everything can be gifted or mailed, and barter is always
on the table. What it constrains is the **recipe and creation engine**, which
must generalise past tools (`plans-and-blueprints.md`), and eventually
player-authored plans, which is the version-two ambition that turns "I made a
thing" into "I made a thing other people want."

The guardrail is unchanged and is the reason player-to-player *chip* sales stay
parked for now: peer trade is where communal economies most easily turn into
markets. Barter and gifting between players carry the same warmth with less
risk, so they go first.

## Still open

- Whether players can sell *to each other* for chips, or only barter and give.
  Parked until multiplayer is real; costs nothing to defer.
- What a trinket display looks like, given trinkets are keep-only.

## Blocked on

Nothing technical. The exchange gap blocked the owl-itect's finished-goods
shop and the Wood Mill, both of which now have the economic rules they need.
