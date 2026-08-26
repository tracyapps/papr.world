# Plans and Blueprints

Captured 2026-08-04. Acquisition model replaced 2026-08-25.

> **Current decision:** every plan is recipe knowledge, and every non-starter
> plan is granted by the **knowledge tree**. Plans are not physical world
> objects. They are not buried, bought, detected, picked up, gifted, or mailed.
>
> The starter set is learned automatically. Later plans are distributed across
> the tree where their associated skills become relevant: tools first, then
> building pieces, furniture, decoration, clothing, structures, vehicles, and
> other creations as those systems arrive.

## What a plan is

A plan is the fact that the player knows how to make one recipe. It is kept in
`player.plans`, is not consumed by crafting, and does not stack.

This is why the Thing Maker gives it a slot of its own rather than listing it
with ingredients: a material is a quantity you gather; a plan is knowledge you
learn. The slot remains useful visual language even though no physical
blueprint item changes hands.

The word *blueprint* can still describe the paper treatment shown in the
scrapbook and Thing Maker. It no longer implies a loose object in the world.

## Where plans come from

Exactly two sources exist:

1. **Starter knowledge.** A small authored set makes the first useful actions
   available immediately.
2. **Knowledge-tree nodes.** Completing a node grants the recipe ids listed in
   that node. This is the source for every later plan, regardless of output
   type.

`RecipeDefinition.planSource` enforces that boundary as
`starter | knowledge-tree`. There is deliberately no `world` source.

## Distribution through the tree

Plans should arrive alongside the skill that makes them understandable, not in
one giant recipe dump.

- Tool plans live early in the branches that teach their verbs: digging,
  gardening, trimming, building, and later cooking or transportation.
- Basic build pieces can arrive with the first real construction lessons.
- Furniture and room-scale decoration spread through Building & Construction
  and Interior Design.
- Clothing, textiles, paint, and crafted ornament spread through Fine Arts &
  Textiles.
- Larger structures arrive farther down Building & Construction, after the
  relevant material and tool prerequisites.
- Cross-disciplinary creations may sit behind prerequisites from several
  branches rather than being copied into each one.

A node may grant several closely related plans, but **plans are staggered
across the tree**. A node should not unlock an entire category merely because
the implementation can store an array.

## Progression rules

- The whole tree stays visible, including later creation categories, so a
  locked Thing Maker slot always has an explainable route.
- A recipe remains `planned` until its output and interaction are real. A
  concept node may preview future creations but does not grant fake ids.
- A ready knowledge-tree recipe maps back to exactly one ready node.
- A node may not require the tool or material access that its own grant is
  supposed to unlock. Catalog tests enforce this.
- Tool ladders still climb one rung at a time. Owning the previous tool is a
  crafting requirement in addition to knowing the next plan.

## Making and generosity

Plans themselves are not transferable. Generosity happens through the thing
you make:

- make a spare tool for another player;
- give furniture, clothing, or decoration;
- contribute pieces to a shared structure;
- sell or barter finished work through shops when those systems arrive.

This keeps knowledge progression legible while preserving the warmer social
gesture: the gift is something you made, not a duplicate permission slip you
happened to find.

Shops may sell finished items at a convenience markup. An owl-itect can still
design, display, commission, or sell finished furniture and structures; she is
not a second route around the knowledge tree.

## The plan engine is bigger than tools

Tools are only the opening act. The long-term system must support arbitrary
recipe outputs—houses, furniture, clothing, decoration, fencing, vehicles,
oddities—without assuming every plan resolves to a `ToolId`.

The tree therefore grants `RecipeId[]`. Current tool recipe ids happen to match
their tool ids, but consumers must resolve the recipe output before assuming it
is a tool. That keeps later plan additions data-driven instead of requiring a
second progression system.

Player-authored plans and a marketplace remain a later possibility. They are
not part of tree progression and need their own authorship, safety, discovery,
and economy design before they become real.

## Built already

- `player.plans` stores learned recipe ids.
- `STARTER_PLAN_IDS` is derived from recipe data.
- Ready tech nodes grant recipe ids on completion.
- The Thing Maker routes a missing learned plan to its Professor lesson.
- The tree can render any recipe grant, using tool artwork where available and
  a labelled fallback for future non-tool outputs.
- Catalog tests guard source validity, lesson mapping, and self-gating.

## Next additions

Add concrete non-tool recipes only with their gameplay slice. The first useful
examples should arrive with building/creating work, then be assigned to several
appropriately spaced ready nodes rather than collected into a single “plans”
lesson.
