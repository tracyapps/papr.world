# Adversarial review — critter quests, trinkets, conversation memory

Scope: the feature as landed, per `interfaces.md`. Every finding below was
verified by reading the code and, where marked **probe**, by executing it with
`vite-node` against the real modules.

## Verification commands (real results)

- `npx tsc --noEmit` → **exit 0, 0 errors.** (The "53/50 pre-existing errors"
  in the subagent reports are gone; the tree compiles clean today.)
- `npx vitest run` → **66 files, 627 tests, all passed, exit 0.**
  Relevant: `trinkets.test.ts` 10, `quests.test.ts` 11,
  `conversationEngine.test.ts` 10, `conversationMemory.test.ts` 6.
- `node tools/validate-conversations.mjs` → pass (`61 storylets`).
- `node tools/validate-quests.mjs` → pass (`23 quests`, `39 total`).

So the suite is green — which is exactly why the defects below matter: **none of
them is covered by a test.**

---

## CRITICAL

### C1. `odyssey-word-to-the-sentry` can never be completed → permanently bricked giver
`src/sim/catalogs/quests.ts:290`
```ts
objectives: [{ kind: 'talk', critterId: 'meerkat' }],
```
`meerkat` is a *species*, but `talk` objectives are measured against
`player.metCritters`, which only ever stores concrete critter ids
(`'0,0#squirrel'`, `'-2,0#woodchuck'`, `` `${page.id}#${index}` ``). The only
writer is `noteMetCritter(critter.id, …)` (`src/game/conversationEngine.ts:852`),
so nothing ever inserts `'meerkat'`.

Consequences (all confirmed):
- `objectiveReach` → `'ready'` (`quests.ts:581-582`) and `questHasWork` → true, so
  the quest is offered.
- `objectiveMeasure('talk')` is `metCritters.includes('meerkat')` → always `0`
  (`src/game/quests.ts:116-117`), so `refreshQuest` never latches it and
  `hasTurnInReady` is `false` forever.
- Once accepted, `log.active[critterId]` is set, and `selectQuestFor` returns
  `null` for that critter forever (`src/game/quests.ts:326`). Meanwhile
  `activeQuestDefFor` still resolves, so the critter only ever shows the
  "still needed" progress scene. **There is no abandon-quest UI**, so the
  critter is permanently dead and the player is stuck.

Probe output:
```
talk meerkat reach = ready
sentry questReachable = true
SPECIES TALK ID: odyssey-word-to-the-sentry meerkat
```

**Fix.** Either (a) make the objective target a real, stable critter id, or
(b) support species targets end-to-end: record species at meeting time
(`noteMetCritter` → also store `${critter.id}#${critter.species}` or a
`metCritterSpecies` map) and have `objectiveReach`/`objectiveMeasure` for `talk`
match by that. (b) is the honest one — duned critters are *generated*, so there
is no stable authored id to point at. Also add a `refreshQuest`/dialogue guard
that drops or lets the player abandon an active quest whose objective can no
longer be satisfied.

---

## MAJOR

### M1. Reward trinket filters can match **0 or 1** catalog entries → wrong family, or immediate duplicates
`src/sim/catalogs/trinkets.ts:636` filters strictly on family **and** tag; the
fallback at `:651` is `candidates.length > 0 ? candidates : allTrinketDefs()`.
Probe counts of `(family, tag)` pools used by real quests:

| filter | # catalog matches | used by |
|---|---|---|
| `seasonal` + `biome:forest` | **0** | `favor-under-the-green` (`questCatalog.expansion.ts:164,171`) |
| `seasonal` + `biome:dunes` | **1** (`sunwarm-shard`) | `errand-desert-walk`, `odyssey-palm-and-shell`, `errand-fiber-and-sand`, `odyssey-sow-the-sand` |
| `story` + `plant` | **1** (`clover-print-token`) | `errand-mend-the-ground`, `odyssey-the-travelling-plant` |
| `natural` + `biome:forest` | **2** | `favor-dark-earth` (`expansion.ts:69`) |

- **0-match case is the worst:** `candidates` is empty, so the fallback is the
  *whole* catalog and the declared family is silently ignored. Probe:
  `pickTrinketDef({family:'seasonal',tag:'biome:forest'}, …, 7)` →
  `gen-key-12-glitter-still`, family `curious`, tags `['metal']`. So
  `favor-under-the-green` pays out a random curious trinket.
- **1/2-match case** means that after the first completion every further quest
  with the same filter returns the identical object —
```
2nd pick with only candidate owned -> sunwarm-shard (duplicate? true)
```
  contradicting the whole "never get a duplicate" promise in `trinkets.ts` and
  `trinkets.test.ts`.

**Fix.** Widen the search deterministically: fresh within `(family+tag)` →
fresh within `family` → any fresh → then a duplicate. And teach
`tools/validate-quests.mjs` to resolve every `reward.trinketFamily/tag/shape`
against the merged catalog and fail when a filter has < ~5 matches (it currently
only checks the family *name* is valid).

### M2. New `conversations[*]` fields are not normalized → malformed save crashes the engine
`src/sim/state.ts:568`
```ts
state.player.conversations = safeObject(player.conversations) as Record<string, ConversationMemoryState>;
```
This stops at "is an object"; it never validates `flags`, `seen`, `visits`,
`journal`, `recentLines`, `lastChatAt`. `conversationMemory.ts` then trusts them
(`takeContinuableThread` at `:111-113` does `journal.find(...)`).
Probe with a valid-schema save containing `journal: 5`:
```
normalized journal type = number | recentLines = string | flags = string
CRASH takeContinuableThread: journal.find is not a function
```
`recentLines` as a string breaks `isRecentLine`; `flags` as a string breaks
`addConversationFlags` (`flags.push`). Old saves with no such fields are safe
(probe: missing fields → empty defaults), so this is specifically the new,
un-hardened surface — the exact "can a malformed or old save crash
`normalizeState`?" case.

**Fix.** Normalize each conversation entry in `normalizeState`: `flags`→filtered
string[], `seen`→`finiteCounts`, `visits`→clamped int, `lastChatAt`→finite
number, `journal`→validated array of entries (id/kind/text/pageId/at/continued),
`recentLines`→filtered string[].

### M3. Active quests are not validated against the catalog on load → stale quest bricks a critter
`src/sim/state.ts:641-670` keeps `active[critter]` as long as `questId` is a
string; it never checks `getQuestDef`. `selectQuestFor` then refuses offers while
any active entry exists (`src/game/quests.ts:326`) even though
`activeQuestDefFor` (`:149`) resolves to `null` for an unknown id, so no
progress/turn-in scene can ever be produced. Same dead-end as C1, reachable
whenever a quest id is renamed/removed in a content update.

**Fix.** In `normalizeState`, drop active entries whose `questId` is not a known
quest (validate lazily against `getQuestDef`, or import the catalog), and add a
player-facing way to abandon an active quest.

### M4. `questHasWork` makes "go visit X" quests permanently unofferable — and that locks out the authored odyssey
`src/sim/catalogs/quests.ts:601-603` filters the offer whenever every objective
is already `'done'`; for a single-objective `visitBiome` that `'done'` state is
`visitedBiomes.includes(...)` (`:563-564`). Probe:
```
favor-under-the-green hasWork (already in forest) = false
```
So `favor-under-the-green` is dead for any player who has already stepped in the
forest (almost everyone). Worse, this is not confined to filler:
`errand-desert-walk` (`quests.ts:179`) is the `requiresQuests` gate for the
authored `odyssey-word-to-the-sentry` (`quests.ts:288`). Players normally visit
the dunes early, which makes `errand-desert-walk` un-offerable forever, which
locks the whole odyssey arc out — independently of C1.

**Fix.** Don't gate the offer on `questHasWork` for world-memory objectives
(visit biomes/pages): offer them and let `baselinesFor` capture "already true",
or simply baseline before the first visit. At minimum, remove the hard
`requiresQuests` edge from a visit-gated errand.

### M5. `dig` / `trim` reachability ignores the knowledge tree (inconsistent with `craft`/`craftTool`)
`src/sim/catalogs/quests.ts:567-573` and `:575-579`:
```ts
const recipeId = recipeForTool(target);
return recipeId ? 'next-step' : 'far';
```
Any tool that has *a recipe* reads as "one step away", regardless of whether its
tree node is locked. `craftTool` and `craft` correctly go through
`recipeReach`→`techNodeStatus`. Probe:
```
dig layer3 reach   = next-step      (heavy-duty-shovel sits behind locked digging-3)
trim redwood reach = next-step      (sturdy-scissors' node may be locked)
craftTool shovel3  = far            (correct)
```
No shipped quest currently uses `dig layer 3` or a redwood trim
(`quests with dig layer3: []`), so this is latent — but it directly violates the
"never out of reach / exactly one craftable step away" contract and will bite
the first quest that uses it.

**Fix.** Route the `dig` and `trim` branches through
`recipeReach(state, recipeId)` (or at least return `'far'` whenever
`recipeReach` returns `'far'`), exactly as `craftTool` does.

### M6. `trim` objectives ignore the species — "trim a pine" is satisfied by trimming anything
`src/game/quests.ts:107-115` counts **every** trim across every page (the code
comment admits tree records don't carry a species). Probe with a single trim on
one tree:
```
measure trim pine    = 4
measure trim redwood = 4
```
So `favor-a-neat-pine` is satisfied by trimming a leafy tree, and (via M4) it
also becomes un-offerable the moment the player trims *any* tree. The comment is
honest but the behaviour is wrong.

**Fix.** Record `species` on `TreeGrowthState` (or resolve the species from the
tree's registry key) and count only matching species; or remove `species` from
`trim` objectives and word them as a generic trim.

---

## MINOR

- **m1.** `QuestLogState.offered` is written in `acceptQuest`/`declineQuest`/
  `completeQuest` but **never read anywhere** (`grep` shows only writes). Dead
  field — either use it for offer-rate tuning or drop it.
- **m2.** The validator masks C1: `tools/validate-quests.mjs` "talk" branch
  explicitly tolerates a bare species name ("species names are tolerated
  because the authored base catalog addresses a species"). A validator that
  green-lights an unsatisfiable objective is worse than none here; reject
  species-only talk ids, or require the engine change from C1.
- **m3.** `takeContinuableThread` sets `continued = true`
  (`conversationMemory.ts:118-121`) *before* `continuationScene` is built and
  shown; dismissing the panel without reading consumes the thread. Mark it in
  `resolveConversationChoice` when the continuation opening is actually rendered.
- **m4.** Perf, not a leak: `pickTrinketAtScreen` is called twice per click
  (hitTest + interact, `main.ts:210-217`) and `updateTrinkets`
  (`trinketVisuals.ts:76-83`) does a linear `getTrinketInstance` scan per visual
  per frame → O(placed × trinkets). Keep an id→instance Map. Disposal itself is
  correct: geometries are per-rig and disposed (`trinketVisuals.ts:30-34`),
  materials are intentionally cached/shared (`materials.ts:176-186`), so nothing
  is double-freed and there is no real material leak.
- **m5.** `grantTrinket` trims with `if (length > 400) shift()`
  (`trinkets.ts:88-91`), which drops the *oldest* trinket even if it is
  currently placed in the world (it silently vanishes).
- **m6.** `SAVE_STORAGE_KEY = 'pencil…e.v1'` (`state.ts:12`) contains a Unicode
  ellipsis. Pre-existing (present in the initial commit) and consistent between
  read and write, so it works — but it reads like a truncated key; flagging for
  the record.
- **m7.** `refreshQuest`'s "shape changed" guard only compares array *lengths*
  (`src/game/quests.ts:170-171`). A same-length reordering of a quest's
  objectives re-uses the old baselines against the new order → silent
  mis-satisfaction. Low risk, but the guard reads as "shape-safe" when it is
  only "length-safe".

---

## Test honesty

The new tests are **real, not tautological** — no `expect(a===b || a!==b)`
patterns, and the core assertions exercise behaviour:
- `trinkets.test.ts` genuinely demands 120 unique picks from a <1250 pool, checks
  the shape/family filters, and checks the duplicate fallback.
- `quests.test.ts` drives inventory → `refreshQuest` → `hasTurnInReady` →
  `completeQuest` and asserts a trinket is added and `active` cleared; the
  "satisfied survives spending" test is a true behavioural test.
- `conversationMemory.test.ts` asserts single-use continuation and the 24-line
  cap with newest-first ordering.

**Coverage gaps that let the bugs above ship:** nothing tests a species-target
`talk` objective (C1), a 0/1-length reward pool (M1), malformed conversation
memory (M2), a stale active quest (M3), or visit-gated offers (M4).
`quests.test.ts` "will ask a friend" is weak but not dishonest (only asserts
`not.toBeNull()`).

---

## Checked and fine (one line each)

- **Save round-trip of the new fields on old saves:** safe — probe on a
  fields-less valid save yielded `trinkets []`, default `quests`,
  `visitedBiomes ['clearing']`, `metCritters []`; `baselines`/`satisfied`
  length mismatch is re-baselined in `refreshQuest` (`:170-181`).
- **`refreshQuest` thrash:** none — it early-returns when the satisfied set is
  unchanged (`:187`).
- **Double turn-in / two active quests:** guarded — `acceptQuest` rejects when
  active (`:229`), `completeQuest` deletes active (`:271`), and the turn-in
  button is replaced after `endsScene`.
- **`completeQuest` with a null trinket:** handled (`label` falls back to
  `'a trinket'`); in practice `pickTrinketDef` never returns null.
- **`mutateLog` re-entrancy:** no nested `updateGameState` —
  `grantTrinket`/`addFriendshipPoints`/`mutateLog` are sequential calls.
- **`beginCritterConversation` returning `undefined`:** impossible — every
  branch returns a scene and the tail is
  `relationshipMilestone(...) ?? everydayConversation(...)`.
- **`deprioritizeRecent` / `noteRecentLine` keying:** consistent for
  `trait`/`self`/`tool`/`next` (both hash the same raw line with the same
  `kind:hash` key).
- **Infinite recursion:** none — `resolveConversationChoice` → `everydayConversation`
  is a leaf that never calls back into `resolve`.
- **`pickTrinketAtScreen` "detached node":** no defect found —
  `visuals` only holds in-scene groups, invisible ones are filtered out, and
  `group.userData.trinketId` is overwritten with the *instance* id at
  `trinketVisuals.ts:52`, so the parent walk resolves correctly.
- **Per-frame whole-save writes from placing trinkets:** none — placement is a
  discrete `updateGameState`; `updateTrinkets` only reads.

## Could not confirm
- Whether `quests.test.ts`'s "will ask a friend" assertion can ever fail in
  practice (it only checks non-null).
- The real-world frequency of the `collect`-already-held suppression (M4's
  sibling case for `collect`): it is a design judgement, not a demonstrable bug.
