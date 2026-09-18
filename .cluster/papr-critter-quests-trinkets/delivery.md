# Delivery — critter storytelling, side quests, and trinkets

## What changed, by owner request

| Requested | Implemented | Where |
| --- | --- | --- |
| Expand critter dialog + storytelling | 41 → 61 storylets; +6 greetings/species, +6 placeFacts/biome, +5 self/trait lines | `src/content/conversations.json` |
| Make repeat advice less common | `recentLines` per critter + `deprioritizeRecent()` pushes said lines to the back of every pool | `conversationMemory.ts`, `conversationEngine.ts` |
| Biome- and tool-level advice | `buildToolReplies()` quotes the tool catalog's own `limitation` text per family; material advice now names the refinement route; new `replyPool: "tool"` and `"next"` | `conversationEngine.ts`, `conversations.json` |
| Interaction-aware continuation | Per-critter journal + `continuations` content section + `continuationScene()`; a thread said yesterday is picked up once, after a 20-minute gap | `conversationMemory.ts`, `conversationEngine.ts`, `conversations.json` |
| Side quests after a friendship level | `selectQuestFor()` — `stranger` is never asked for anything; 39 quests across three tiers | `sim/catalogs/quests.ts`, `game/quests.ts` |
| Quests never out of reach | `objectiveReach()` grades all 13 objective kinds against the live save; `questReachable()` refuses anything `'far'` | `sim/catalogs/quests.ts`, `game/quests.ts` |
| Highest-friendship multi-step quests | `odyssey` tier: cross-biome message-carrying (`talk`), `deliver`, `craftTool`, `learnTech`; gated at `buddy`/`pet` and after 5 finished quests | `quests.ts`, `questCatalog.expansion.ts` |
| Trinkets as quest rewards, wired by the dev | `completeQuest()` → `grantTrinket()` → bio-card shelf | `game/quests.ts`, `game/trinkets.ts` |
| Trinkets: unsellable collectibles | Separate `player.trinkets` bag — not `inventory`, not `items`, no recipe output, no shop buys it | `sim/state.ts` |
| Displayed in the bio card | Bio-card shelf; `openMyPlayerCard()` preview from the scrapbook | `ui/playerCard.ts`, `ui/scrapbook.ts` |
| Placeable as decoration | "Set down here" / "Take back" in the scrapbook; click a placed trinket to pick it up | `game/trinkets.ts`, `game/trinketVisuals.ts`, `main.ts` |
| Many variants, no duplicates | ~48 authored + ~1,100 generated; `pickTrinketDef()` refuses to reuse an owned def | `sim/catalogs/trinkets.ts`, `trinketVariants.ts` |
| Loose-stone size, Thing-Maker-style 3D | Primitives-only rigs at ~0.16–0.24 units, cast shadows, paper textures | `game/trinketRigs.ts` |
| Some pieces move (cubimals) | 8 motions incl. `windup` — ten little wind-up animals, each with a turning key | `game/trinketRigs.ts` |
| Easy to add more missions/trinkets | Data-only catalogs + generators + two validators + `docs/trinkets-and-quests.md` | see docs |

## Adversarial review — findings and disposition

A separate reviewer audited the whole feature. Every finding was reproduced and then fixed,
with a test added for each so the suite can never go green on the defect again.

| # | Finding | Disposition |
| --- | --- | --- |
| C1 (critical) | `odyssey-word-to-the-sentry` asked for `critterId: 'meerkat'` — a species — so it could be accepted and then never completed, bricking that animal forever | `talk` now resolves against *either* a critter id or a met species (`metCritterSpecies`); test added |
| M1 (major) | Reward filters matched 0–1 trinkets, so `seasonal + biome:forest` paid an unrelated `curious` key and small pools repeated | `pickTrinketDef` is now an 8-rung cascade that loosens one constraint at a time, family last; a test asserts 8 distinct rewards per quest across the whole catalog |
| M2 (major) | A malformed `conversations[*]` (e.g. `journal: 5`) crashed `takeContinuableThread` | Per-critter normalization of flags/seen/visits/journal/recentLines/lastChatAt |
| M3 (major) | An active quest holding a retired id bricked its giver | Unknown quest ids are dropped on load via a validator hook registered by `game/quests.ts` (avoids an import cycle) |
| M4 (major) | `questHasWork` plus a hard `requiresQuests` edge could lock the dune odyssey out permanently | The hard edge is removed (with a comment explaining why); test asserts it stays ungated |
| M5 (major) | `dig`/`trim` reach promised a next step regardless of the tech tree | Both now route through `recipeReach`; test asserts layer-3 dig is `far` while its lesson is locked |
| M6 (major) | "Trim a pine" was satisfied by trimming any tree | `TreeGrowthState.species` recorded on each cut; measure matches the species asked for |
| m4, m5 (minor) | Per-frame save lookups; 400-cap could drop a *placed* trinket | Placement cached on the visual; the cap now evicts a shelved trinket only |

Accepted as-is (documented, not defects): the `offered` counter is written for future
rate-tuning but not yet read; `takeContinuableThread` marks a thread used at the moment the
scene is built, which *is* the moment its line is shown; the unicode `SAVE_STORAGE_KEY` is
pre-existing. No abandon-quest UI was added — the C1 fix removes the only way to get stuck,
and M3 hands back any giver whose quest no longer exists.

## Verification (all green)

- `npx tsc --noEmit` → 0 errors
- `npx vitest run` → 67 files, 638 tests passing (38 new)
- `npm run content:check` → "61 storylets"
- `node tools/validate-quests.mjs` → "23 quests (favor 10, errand 7, odyssey 6)… 39 total"
- `npm run styles:check` → 802 rules, clean
- `npm run build` → vite build succeeds

## Assumptions stated at delivery

1. **Trinkets are per-save, like friendship and the diary.** Nothing in the current
   code syncs a local player's friendship, diary, or plans to the server either, so
   trinkets follow the same rule. The bio card renders the local shelf today and
   `renderTrinketShelf()` is written to take another player's list unchanged once
   `PlayerCardInfo` carries one — that is the single seam to close for multiplayer.
2. **Odyssey rarity** is approximated by "5 quests finished", since the game has no
   play-hours counter yet.
3. **`trim` objectives count any trim**, not a species-specific one, because tree
   save records do not carry a species. Documented in the code.
4. **Bio-card trinkets render as coloured paper medallions**, not 3D — a second
   WebGL context per card overlay was not worth it. The real model is the placed one.

## Files

New: `sim/catalogs/trinkets.ts`, `sim/catalogs/trinketVariants.ts`,
`sim/catalogs/quests.ts`, `sim/catalogs/questCatalog.expansion.ts`,
`game/trinkets.ts`, `game/trinketVisuals.ts`, `game/trinketRigs.ts`, `game/quests.ts`,
`tools/validate-quests.mjs`, `docs/trinkets-and-quests.md`, 4 test files.

Modified: `content/conversations.json`, `conversationEngine.ts`, `conversationMemory.ts`,
`critterDialogue.ts`, `sim/state.ts`, `ui/scrapbook.ts`, `ui/playerCard.ts`,
`main.ts`, `styles.css`, `tools/validate-conversations.mjs`, `docs/conversation-engine.md`.

Known loose end: `src/sim/game/` holds a one-line placeholder file left by an
authoring path typo (see its header). It exports nothing and nothing imports it;
the directory can be deleted.

## Not touched (out of scope, deliberately)

Server-side trinket/quest persistence, Colyseus schema changes, and any UI for
showing *another* player's trinkets (seam noted above). No new materials, biomes,
or biomes' artwork were added — the quest catalog is written to use whatever the
live catalogs contain, so the material/refinement work in flight will flow through
automatically.
