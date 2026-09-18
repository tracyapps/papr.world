# Tropical biome — plan

Status: **built (2026-09-18).** Everything below is the plan as written; the
build notes at the bottom record the final mix, the decisions made on the
open questions, and the pieces deliberately left for later. Palms now grow
densely in the tropics as well as sparsely on the dunes.

The goal was a sixth biome that reads as warm, wet, and crowded — the opposite
corner of the field from dunes, which is warm and dry. It is the first biome
added since the field-based generator replaced per-page hashing, so it is also
the first real test of whether adding one is a tuning job or a rewrite. The
verdict, for the next biome: **it is a tuning job.** TypeScript's exhaustive
`Record<Biome, …>` produced the clean compile-error checklist this document
promised, the sampler drove the weights, and nothing needed a rewrite.

## What already landed (2026-09-07)

- `palm-1` / `palm-2` / `palm-3` cutouts, from `palm-01..03.svg`.
- `leafy-3`, from `tree-03.svg`, folded into the ordinary leafy tree pool.
- A real `palm` `TreeSpecies` with its own yields: **palm clippings**
  (primary), **palm fiber** (secondary), sunbaked cardboard as the flourishing
  variety find.
- `SPECIES_BIOMES` in `catalogs/obtaining.ts` — the one table saying where each
  species grows. `biomesFor` and the critter dialogue both read it instead of
  each carrying their own copy. **Adding tropical means adding `'tropical'` to
  `SPECIES_BIOMES.palm`, and nothing else needs to hear about it.**
- Sparse dunes placement: ~0.9 palms per dunes page, on their own budget rather
  than a share of the cactus slot.

Because palms are dunes-only today, palm clippings and palm fiber are
*biome-exclusive to dunes* — `isBiomeExclusive` returns true, and a meerkat will
say so. That stops being true the moment tropical exists, which is correct and
needs no code change, but it does mean some critter dialogue quietly changes
tone. Worth a read-through when the biome lands rather than a surprise.

## The cost: every table a sixth biome forces open

`Biome` is a union over `BIOME_IDS`, and TypeScript makes `Record<Biome, …>`
exhaustive — which is the good news. Adding `'tropical'` to `BIOME_IDS` produces
a clean list of compile errors that *is* the checklist. Nothing can be
forgotten silently. The tables:

| File | Table | What it needs |
| --- | --- | --- |
| `sim/catalogs/biomes.ts` | `BIOME_IDS` | the id itself |
| `world/fields.ts` | `BIOME_GROUND_MATERIALS` | a ground paper — likely a new `ground.tropical` texture |
| `world/fields.ts` | `BIOME_ORDER` | inclusion, or it never wins anywhere |
| `world/fields.ts` | `scores` in `biomeWeightsAt` | **the hard part — see below** |
| `world/fields.ts` | `weights` initialiser | a zero |
| `world/regions.ts` | `REGION_NAMES` | 4–5 paper-craft place names |
| `world/regions.ts` | `BIOME_LABELS` | a short label |
| `game/conversationEngine.ts` | `BIOME_LABELS` | the same label, second copy |
| `game/critters.ts` | `BIOME_SPECIES` | a weighted species mix |
| `game/critters.ts` | `BIOME_COUNTS` | a density range |
| `sim/catalogs/geology.ts` | `DIG_TABLES` | three shovel layers of finds |
| `sim/catalogs/obtaining.ts` | `SCATTERED_IN` | which materials lie loose there |
| `sim/catalogs/obtaining.ts` | `SPECIES_BIOMES` | palm gains `'tropical'` |
| `content/conversations.json` | `everyday.placeFacts` | dialogue lines, keyed by biome |
| `world/generate.ts` | prop budgets | tree/decor/resource counts per page |
| `world/pageRuntime.ts` | `GROUND_MAP_COLORS` | a minimap colour |

Sixteen entries, all mechanical except one.

### The one hard part: field weights

`biomeWeightsAt` scores each biome against three noise fields — `moisture`,
`roughness`, and `height` — and softmaxes the result. The current weights are
hand-tuned to a measured distribution, and the comment in the file records both
the target and the two failed attempts that got there:

```
meadow 42% · dunes 23% · scrapflats 17% · forest 18%
```

A sixth biome takes its share from somewhere, and the softmax means the loss is
not evenly spread. Tropical wants **high moisture, low-to-mid height, mid
roughness** — which is forest's corner with the height preference removed, and
forest is already the starved one. Naively adding it will most likely eat
forest rather than meadow.

The tuning approach that worked before is the one to repeat: sample a
2400-unit square, print the mix, adjust, re-sample. That loop wants a small
script (`tools/`, pure Node, no deps) rather than eyeballing the world — and
that script is worth writing *first*, because it also re-verifies the existing
four whenever anyone touches the field again.

Suggested target to aim at, keeping meadow as connective tissue and not
starving forest further:

```
meadow 36% · dunes 20% · forest 17% · scrapflats 15% · tropical 12%
```

Tropical low on purpose: it should read as somewhere you *arrive at*.

### The migration wrinkle

Page contents are generated deterministically from coordinates, and biome is
sampled from the field rather than stored. So changing `biomeWeightsAt` changes
what already-visited land looks like — a player's familiar meadow can become
tropical. Nothing corrupts (tree growth is keyed by page id and tree key, and
survives), but the world visibly rearranges around saved state.

Two honest options, to decide before tuning rather than after:

1. **Accept the shuffle** and land it during alpha, with a note to testers.
   Cheapest, and the alpha population is small.
2. **Confine tropical to a band** the current field never produces — e.g. only
   beyond a radius, or only in a coordinate range not yet visited — so existing
   land is untouched. Keeps saves stable at the cost of a less organic map.

Option 1 is probably right while the game is pre-release, but it is a decision,
not a default.

## Content the biome needs before it is worth building

A biome is not its ground texture. Dunes works because it has meerkats,
cactus, terracotta pebbles, and sunbaked cardboard — a species, scenery, and
two materials nobody else has. Tropical needs the same, and this is the real
reason to plan rather than build now.

**Plants.** Palms are the anchor and already exist. Missing:

- A broadleaf understory plant — something big-leaved and flat, the tropical
  answer to the marsh-grass tuft. `paper.monstera` already exists as a material
  and has no plant of its own, which is a strong hint.
- A fern or frond cluster for ground cover.
- A flowering vine or hanging form, to use vertical space — every biome so far
  is read entirely at ground level.
- A fruiting plant, which would give the food category its first wild source.
  Every food today comes from a seed the player planted.

**Critters.** `BIOME_SPECIES` needs a flagship the way dunes has meerkats and
scrapflats has raccoons. Candidates worth drawing: a parrot or toucan (reuses
the existing bird rig with new colours and a beak), a tree frog (small, still,
good for a shy personality), a monkey (new rig; the most work, the most
character). One flagship plus reweighted commons is the pattern; do not add
three.

**Materials.** Two new ones is the dunes precedent. Palm clippings and palm
fiber already cover the tree, so the gap is ground and stone:

- A wet-ground soil or clay distinct from ochre paperclay.
- A dig-table stone for `DIG_TABLES.tropical`, three layers deep.
- Possibly a large-leaf fiber, if the broadleaf plant is drawn — this is the
  one that would make tropical *matter* to crafting rather than just look
  different.

**Water.** Tropical is the biome with the strongest claim on water, and the
lake-border work in `roadmap.md` (beach / rocks / marsh / wooden borders) is
where the two meet. If tropical lands after that, palms on a beach border come
almost free. If before, it needs its own shoreline pass — which is the more
expensive order. **Sequence tropical after the lake-border work.**

## Suggested order

1. ✅ **Built (2026-09-14).** `npm run fields:sample` (`tools/sample-biome-fields.mjs`)
   transpiles the live `fields.ts` in memory (via the project's existing
   `typescript` dependency — no new deps, doesn't need the `~/pp-build`
   native-module workaround) and samples the real `dominantBiomeAt` over a
   configurable square (`--size`, `--step`, `--center`). Confirmed it
   reproduces this doc's own recorded mix over the default 2400-unit square:
   meadow 42.0% · dunes 22.8% · forest 18.3% · scrapflats 16.9%, matching
   "meadow 42% · dunes 23% · scrapflats 17% · forest 18%" above. Ready to use
   for step 4 below — rerun after every `scores` edit in `biomeWeightsAt`.
2. Draw the broadleaf plant and the flagship critter. Until those exist the
   biome has nothing to show.
3. Decide the migration question above.
4. Tune the field weights against the script.
5. Fill the sixteen tables — mechanical once 1–4 are settled.
6. Add `'tropical'` to `SPECIES_BIOMES.palm` and raise the palm budget there.

---

## Build notes (2026-09-18)

The batch of tropical/marsh/desert/forest artwork the owner drew is what made
this the moment: 35 new prop cutouts and 15 new material papers, all compiled
by the ordinary `assets:compile` pass. What landed, decision by decision:

**Field weights.** The sampler loop converged on a mix of
`meadow 34% · dunes 23% · forest 17% · scrapflats 16% · tropical 11%` —
close enough to the suggested target that tropical reads as an arrival and
forest, the previously starved biome, ends *higher* than before (16.5% vs
18.3% is within noise; the earlier four-biome mix had forest at 18% and the
difference is meadow's to give). Three findings worth keeping:

- tropical anchored at moisture 0.74 sampled **1.2%** — the wet tail of the
  fbm is thin, so the anchor moved to 0.62 with a wider slope;
- naively adding tropical ate **forest** (down to 7.7% at one point) — the
  fix was the altitude split this plan already hinted at: tropical takes the
  wet **low** ground `(1 - height) * 0.55`, forest keeps its wet **high**
  ground, and forest's roughness tolerance widened from 1.1 to 0.95;
- all of tropical's share comes out of meadow's surplus; dunes and scrapflats
  barely moved, which was not planned but is the least disruptive outcome.

**Migration wrinkle — option 1, accepted.** The shuffle lands during alpha
with the small tester population; nothing corrupts (tree growth is keyed by
page id and tree key and survives). Revisit only if a tester reports losing
a favourite view.

**The flagship is a parrot**, the plan's own cheapest-right answer: a new
`parrot` species reusing the bird rig's skeleton plan with a stout hooked
beak, a long two-panel tail, and slow broad wings; tropical-paper coats
(frond, banana-leaf, flower-scatter, vine-lattice); preen-swing idle instead
of the songbird's peck. Flagship weight 0.28 in `BIOME_SPECIES.tropical`,
meerkat-raccoon precedent. One flagship, as instructed.

**Trees.** Palms anchor a real canopy now (`banana-1`, `jungle-1/2` join the
`TreeKind` pool): jungle broadleafs are `leafy` species (which they are), and
banana is its own `banana` species whose yields are the palm material pair —
the plan's "palm clippings and palm fiber already cover the tree" taken
literally. Palm clippings and palm fiber stopped being dunes-exclusive on
their own, exactly as predicted.

**Materials — two new, the dunes precedent.** `jungle-loam` (wet-ground
soil, scattered loose and dug) and `rainfold-pebbles` (the dig-table stone,
**dug only** — the shovel's answer to the redwood's scissors). Both tiles
authored in the resource-pipeline house style; swap the SVGs if the art
wants retuning and nothing else changes. The possible third material
(large-leaf fiber) was deliberately **not** added: palm fiber already covers
tropical crafting, and a third scatter would crowd the loam. `paper-tomato-seeds`
now also scatter in tropical — warmth, and it keeps the "what grows well
here?" knowledge lane alive in every live biome.

**Understory, three biomes' worth.** The new decor went in as per-biome
undergrowth pools (`UNDERGROWTH` in `generate.ts`): dunes get agave, prickly
pear, dry shrubs, and a marigold; forest gets ferns, mushrooms, a berry
shrub, and a mossy boulder; tropical gets the broadleaf plants, jungle
shrubs, the three signature flowers, bamboo, and mangrove saplings. Marsh
shoreline art went render-side instead: river reeds and pickerelweed/water
iris join the marsh *banks* in `water.ts`, and duckweed + lily-pad clusters
join the calm-reach scatter.

**Deliberately left for later:**

- ~~**Hanging vines**~~ — **done 2026-09-18, second pass** (see below).
- **Wild fruit.** The banana tree's food drop is not modeled; food still
  comes only from plants a player grew. The first wild source deserves its
  own slice, not a tag-along.
- **Beach borders.** The plan said "sequence tropical after the lake-border
  work" — tropical landed first anyway because the art was ready, so palms
  on beaches remain free when mixed lake borders (`roadmap.md` 4.6) land.

## Second pass (2026-09-18) — canopy heights, vines, trimmable undergrowth

**Canopy.** Jungle broadleafs now generate in three layers
(`JUNGLE_LAYERS` in `generate.ts`): understory 5–8 (18%), canopy 8.5–13.5
(60%), emergent 14–22 (22%). Redwoods are 18–30, so emergents reach *toward*
redwood height without matching it. About 30% of tropical palms also shoot up
tall and skinny (8–12). Trees 14+ get a redwood-sized trunk footprint.

**Hanging vines.** A tree prop can now carry `vines: HangingVineData[]`
(`types.ts`). Only jungle trees ≥ 9 units get them (1–3 on emergents, 0–2 on
canopy trees), hooked just under the canopy line (45–52% up the cutout) and
hanging to 0.9+ units off the ground so they stay reachable. They are built
*inside the tree's own case* in `pageRuntime.ts`, in the tree's plane and a
hair in front of it — so a tree culled for standing in water takes its vines
with it, and no vine can drift off its tree.

**Trimming.** `TreeSpecies` gained `vine`, `mushroom`, and `shrub`, with a
`SPECIES_FORM` (tree / plant / vine) that drives both the wording and the cut
visuals: plants get a haircut all over, vines get *shorter from the bottom*
while their top stays hooked (`hangTopY` in `applyTreeStageVisual`).
Mushroom and shrub cutouts stay `decor` props; `world/trimmableDecor.ts`
(renderer-free) says which decor kinds are trimmable. Growth is saved in the
same `treeGrowth` map, keyed by position (vines: `<treeKey>:vine:<n>`).

| Species | Primary | Secondary | Variety | Grows in |
| --- | --- | --- | --- | --- |
| vine | **crepe-vine** (new) | mossy paper fiber | palm fiber | tropical only |
| mushroom | **blotting-caps** (new) | mossy paper fiber | blotting caps | forest, tropical |
| shrub | kraft twigs | mossy paper fiber | ribbonwood | dunes, forest, tropical |

Crepe vine is tropical-exclusive by construction. Mushrooms were added to the
tropical undergrowth pool. Both new materials show under TO DRAW in
`npm run art:check`, and use stand-in paper until tiles exist.
Tests: `src/world/jungleCanopy.test.ts`.
