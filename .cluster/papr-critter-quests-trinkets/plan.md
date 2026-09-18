# Task: Critter storytelling expansion, quests, and trinkets (papr.world)

## From the owner
- Expand critter dialog + storytelling; make repeat advice less common.
- Push biome-specific AND tool-level advice further (materials/refinement coming).
- Interaction-aware continuation dialog: a critter remembers what it told you
  yesterday and adds to that story today.
- Side quests from animals after a friendship level (stranger stays general).
- Quests aware of the player's tech tree / inventory / progress: not out of
  reach; nudge the next tech step / next biome / a new plant.
- Highest friendship levels: rarer multi-step quests (deliver a thing/message to
  a critter in another biome, make a new tool, etc.).
- Trinkets: a new item type, NOT sellable, displayed in the player bio card and
  placeable as world decoration. Many variants, loose-stone sized, Thing-Maker
  style 3D, minimal duplicates in one inventory (small variations, colorways,
  some moving/turning — like Glitch's cubimals).
- Easy system to add more missions + trinkets as the game grows.

## Recon facts (verified in repo)
- Content: `src/content/conversations.json` (version 1): `everyday`
  {greetings, placeFacts, selfReplies, traitReplies, choices}, `milestones[]`,
  `storylets[]`. Validated by `tools/validate-conversations.mjs` (`npm run content:check`).
- Engine: `src/game/conversationEngine.ts` — eligibility (species/personality/
  friendship/page/biome/region/flags), placeholders ({{name}}, {{material:id}},
  {{tool-for:id}}, {{found-in:id}}, {{only-here:id}}), generated place knowledge
  (materials, harvest, wayfinding, fun) + follow-ups, storylet picker,
  relationship milestones, everyday fallback.
- Memory: `src/game/conversationMemory.ts` — `{flags, seen, visits}` per critter +
  diary entries. Friendship: `src/game/friendship.ts` levels
  stranger/curious/friend/buddy/pet at 0/10/30/60/90.
- UI: `src/game/critterDialogue.ts` (panel), `src/ui/scrapbook.ts` (tabs),
  `src/ui/playerCard.ts` (bio card), `src/game/thingMaker.ts` (crafting + tray).
- Catalogs: resources (ResourceId), seeds (SeedId), tools (ToolId/ToolFamilyId,
  tiers 1-3), recipes (RecipeId), tech tree (TechNodeId, techNodeStatus),
  obtaining (ObtainRoute/biomesFor/toolRequiredFor), geology, trees, shops.
- State: `src/sim/state.ts` GameState (player.inventory/tools/items/friendships/
  conversations/plans/…; world.pages.…), normalized on load; commands in
  `src/sim/commands.ts` reduce through `dispatchGameCommand`.
- Placement visuals: `src/game/placement.ts`, `src/world/buildPieceVisuals.ts`,
  loose piles via `src/world/resourceDropVisual.ts` (stones ≈ Dodecahedron 0.09-0.17).
- Interactions: `src/game/interactionRouter.ts` + registration in `src/main.ts`.

## Deliverable files (all under the repo)
New:
- `src/sim/catalogs/trinkets.ts` — trinket types, families, authored defs, merged
  catalog, uniqueness picker.
- `src/sim/catalogs/trinketVariants.ts` — generated variants (subagent B).
- `src/game/trinketRigs.ts` — three.js builders + motion (subagent B/driven by spec).
- `src/game/trinkets.ts` — runtime: grant/list/place/pickup/visuals/update.
- `src/sim/catalogs/quests.ts` — quest types, reachability, authored catalog, merge.
- `src/sim/catalogs/questCatalog.expansion.ts` — extra quests (subagent C).
- `src/game/quests.ts` — runtime: state, evaluate, select, scene data.
- `docs/trinkets-and-quests.md` — design + how to add content (subagent D).
- tests + `tools/validate-quests.mjs`, `tools/validate-trinkets.mjs`.

Modified:
- `src/game/conversationMemory.ts` — journal + lastChatAt + recent-line memory.
- `src/game/conversationEngine.ts` — continuations, anti-repeat, tool/refinement
  advice, next-step nudges, quest hooks.
- `src/game/critterDialogue.ts` — quest accept/progress/turn-in UI, trinket toast.
- `src/sim/state.ts` — quests/trinkets/visitedBiomes/visitedPages/metCritters + normalize.
- `src/sim/commands.ts` — acceptQuest/turnInQuest/placeTrinket/pickUpTrinket/noteBiome.
- `src/content/conversations.json` — more content + `continuations` (subagent A).
- `src/ui/scrapbook.ts` — Trinkets tab; `src/ui/playerCard.ts` — trinket shelf + local preview.
- `src/main.ts`, `src/styles.css` — wiring + styles.
- `tools/validate-conversations.mjs` — validate `continuations`.

## Subtasks
1. S1 recon (done).
2. Dispatch A (content), B (trinket rigs+variants), C (quest expansion), D (docs+review).
3. Build core: trinkets catalog/runtime, quests catalog/runtime, memory+engine.
4. Wire UI + main + styles + save normalization + commands.
5. Validate: tsc, vitest, content:check, quest/trinket validators.
6. Review (adversarial subagent) + fix.
7. Deliver summary + docs.

## Interfaces (frozen)
See `interfaces.md` in this folder.
