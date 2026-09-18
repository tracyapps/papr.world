# Subagent C — Quest expansion report

**Scope owned:** `src/sim/catalogs/questCatalog.expansion.ts` (expanded),
`tools/validate-quests.mjs` (new). No other files touched.

## Result

- **23 quests in the expansion file** (was 6). Merged with the authored set in
  `quests.ts`, `allQuestDefs()` now yields **39 total** quests.
- `node tools/validate-quests.mjs` → passes (exit 0).
- `npx tsc --noEmit` → **0 errors mention `questCatalog.expansion.ts`** (53
  pre-existing errors elsewhere are untouched and out of scope).

## Counts by tier (expansion file)

| tier | count | minFriendship |
| --- | --- | --- |
| favor | 10 | `curious` |
| errand | 7 | `friend` |
| odyssey | 6 | `buddy` / `pet` |

## Counts by objective kind (expansion file)

`collect 10 · place 4 · talk 4 · plant 3 · visitBiome 3 · dig 2 · harvest 2 ·
trim 2 · craft 1 · craftTool 1 · learnTech 1 · deliver 1 · visitPage 1`

All thirteen objective kinds in `QuestObjective` are exercised.

## Quests added (17)

Favors (single step, `curious`): `favor-dark-earth`, `favor-pink-shavings`,
`favor-just-one-scoop` (dig 1), `favor-berry-beginnings` (plant),
`favor-a-neat-pine` (trim pine), `favor-under-the-green` (visitBiome),
`favor-a-root-worth-it` (harvest), `favor-this-way-is-friendly` (place plank).

Errands (two steps, `friend`): `errand-clay-and-cardstone`,
`errand-cabbage-twice-over` (plant + harvest), `errand-the-layer-underneath`
(learnTech `digging-2` + dig 2), `errand-twig-and-bench` (collect + place,
`exclusivityGroup: 'somewhere-to-sit'`), `errand-fiber-and-sand`
(collect palm fiber + visitBiome dunes).

Odysseys (multi-step, `buddy`/`pet`): `odyssey-curls-and-lumber`
(craftTool sturdy scissors + collect bark curls + craft bound-lumber),
`odyssey-word-across-the-paper` (visitPage `-2,0` + talk `-2,0#woodchuck` +
talk `1,0#pip`), `odyssey-sow-the-sand` (visitBiome dunes + trim palm + plant),
`odyssey-the-travelling-plant` (deliver `plant:buttonbloom-seeds` +
talk `-2,0#woodchuck`).

The 6 pre-existing expansion quests were left verbatim.

## Validator (`tools/validate-quests.mjs`)

Node ESM, no deps, modelled on `tools/validate-conversations.mjs`. Because the
catalogs are TypeScript it reads them **as text** and lifts ids out with targeted
regexes rather than importing:

- `RESOURCE_CORE_DEFS`, `SEED_DEFS`, `TOOL_DEFS`, `RECIPE_DEFS`, `TECH_DEFS`
  via `id: '<kebab>'` inside each object body;
- `TOOL_FAMILIES` via its `id:` fields; `BUILD_PIECE_DEFS` via `key:`;
- `BIOME_IDS` array; `TreeSpecies` / `CritterSpecies` / `PersonalityTrait` /
  `FriendshipLevel` / `TrinketFamilyId` type-union literals;
- authored critter ids from `spawnCritter(…, '<id>'` calls in `critters.ts`;
- recipe item ids from `itemId:` in `recipes.ts` (plus `plant:<seedId>`).

It splits the expansion array into quest objects, then checks per quest:
required non-empty `title`/`summary`/`opening`/`acceptLabel`/`acceptReply`/
`progressOpening`/`turnInOpening`/`turnInReply`; `tier ∈ {favor,errand,odyssey}`;
`minFriendship` ∈ the 5 levels; `reward.trinketFamily` ∈ the 6 families;
`reward.friendship` an integer 5..18; unique lowercase-kebab ids (checked
against the authored set too); and every objective + `giver*`/`biomes`/
`requiresQuests` id against the real catalog. Exits non-zero with a readable
list; on success prints quest count plus tier and objective-kind breakdown.

### Validator output

```
Quest expansion looks good: 23 quests (favor 10, errand 7, odyssey 6).
Objective kinds: collect 10, craft 1, craftTool 1, deliver 1, dig 2, harvest 2, learnTech 1, place 4, plant 3, talk 4, trim 2, visitBiome 3, visitPage 1.
Merged with the authored set: 39 total quests.
```

## Assumptions

1. **`talk` critter ids** are the authored ids from `critters.ts`
   (`'-2,0#woodchuck'`, `'1,0#pip'`), matching the format `metCritters` stores
   (`critter.id`). The validator also tolerates a bare species name because the
   authored base catalog uses one (`{ kind:'talk', critterId:'meerkat' }`).
2. **`deliver` item ids** reuses the real, obtainable lifted-plant item
   (`plant:<seedId>`, created by `liftPlant` in `commands.ts`). The only
   recipe-produced item ids are `tape-tapper`/`crease-scout`, both `planned`
   (hidden), so a `deliver` on them would be a dead quest; the validator accepts
   either but the shipped quest uses a liftable plant.
3. **`learnTech`** targets a `ready` node (`digging-2`). `objectiveReach`
   grades `concept` nodes `'far'`, so a concept-node objective would make its
   quest permanently unreachable — avoided on purpose.
4. **Reachability** kept in mind but validated structurally, not by running the
   sim: every resource/seed/biome/tool/recipe referenced is genuinely obtainable
   (verified against `obtaining.ts`, `geology.ts`, `trees.ts`, `recipes.ts`), so
   `questReachable` can keep offering each quest.
5. **Pre-existing bug noted, not fixed** (outside my two files):
   `quests.ts` line ~265 `errand-mend-the-ground` has `giverSpecies: ['bunny',
   'gentle', 'butterfly']` — `'gentle'` is a personality, not a species. It
   surfaces as the one pre-existing tsc error `quests.ts(265,29)`.
6. `weight` / `exclusivityGroup` are optional; used sparingly
   (`exclusivityGroup: 'somewhere-to-sit'` on the collect+bench errand).

## Files

- `src/sim/catalogs/questCatalog.expansion.ts` — 23 quests.
- `tools/validate-quests.mjs` — validator (exit 0 on the current catalog).
