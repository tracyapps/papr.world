# Subagent report — trinket & quest documentation

## Files written

1. **`docs/trinkets-and-quests.md`** (new, ~18 KB)
2. **`docs/conversation-engine.md`** (extended, +4 sections, +1 stale-list fix)

## `docs/trinkets-and-quests.md` — sections

- **Trinkets** — what it is / is not (not a resource, not sellable, not
  stackable); where it lives (`placed` field: bio-card shelf vs. world
  placement); no-duplicates guarantee (`ownedTrinketDefIds` → `pickTrinketDef`,
  pool-exhaustion fallback).
- **The trinket catalog** — authored vs generated halves, the
  shape × motion × palette × parts vocabulary, family/rarity.
- **How to add trinkets** — three paragraphs: add an authored def
  (`TRINKET_AUTHORED_DEFS`), add a palette (`PALETTES`), add a shape (`SHAPES`
  + `WINDUP_SHAPES`/`WINDUPS` for toys).
- **Side quests** — the three tiers, the "never out of reach" rule and the four
  reach bands, the full 13 objective kinds with one-line meanings, measurement
  (baseline + latched satisfied) rather than hooks, the reward, the offering
  rules.
- **How to add a quest** — copy-pasteable TS skeleton + `node
  tools/validate-quests.mjs`.
- **Where the state lives** — save fields.
- **Validators and checks** — the four commands.

## `docs/conversation-engine.md` — sections added

- **Continuation: picking a thread back up** — `continuations` content section,
  `recordJournalEntry`/`takeContinuableThread`, the 20-minute gap rule, each
  thread continues exactly once.
- **Repeat advice** — `recentLines`, `deprioritizeRecent`, and why a line is
  only marked said when actually read.
- **Generated answer families** — `replyPool` values
  `trait`/`place`/`self`/`tool`/`next`; `tool` quotes the tool catalog's
  `limitation`, `next` quotes *available* knowledge-tree nodes
  (`readiness: 'ready'` + `techNodeStatus === 'available'`).
- **Quests inside a conversation** — the six-stage scene order, `questAction`
  and `journalKind`, and "a stranger is never asked for anything".

## Numbers verified from the code (not guessed)

- Trinkets: **49 authored + 1,085 generated = 1,134 total**; unique ids 1,134.
  By family: handmade 364, found 238, natural 171, curious 154, seasonal 119,
  story 88. (Determined by bundling the real modules with esbuild and running.)
- Vocabulary: 29 shapes (19 solid + 10 wind-up), 15 parts, 27 palettes,
  18 non-wind-up generator shapes + 10 wind-ups.
- Quests: **39 total** (16 authored + 23 expansion); tiers 15 favor / 13 errand
  / 11 odyssey. `validate-quests.mjs` independently agrees: "39 total quests".
- Constants: `CONTINUATION_MIN_GAP_MS` 20 min, journal cap 12, `recentLines`
  cap 24, `DIARY_ENTRY_LIMIT` 400, trinket list cap 400,
  `OFFER_COOLDOWN_MS` 3 min, `ODYSSEY_COMPLETED_REQUESTS` 5, `TIER_WEIGHT`
  favor 4 / errand 3 / odyssey 1, `wantsToAsk` visits ≥ 3 and 60%.
- Validators re-run clean: `npm run content:check` (61 storylets),
  `node tools/validate-quests.mjs`, `npx tsc --noEmit` (exit 0).

## Where code and doc disagreed / findings

1. **Existing `conversation-engine.md` had a stale species list.** It listed the
   animal tags as `squirrel, butterfly, raccoon, bunny, bird, cat`. The code
   (`CritterSpecies` in `critterVariation.ts`) and the content validator both
   include **`woodchuck`, `meerkat`, `fox`** as well, and `everyday.greetings`
   in the JSON has all nine. I corrected the doc to the full nine. (Reported as
   required; the fix is in the extended file.)

2. **`lastChatAt` is write-only.** `endConversationVisit` stamps
   `memory.lastChatAt`, and the comment on `takeContinuableThread` says only
   entries "from *before this sitting*" qualify. But the implementation gates on
   `now - entry.at >= CONTINUATION_MIN_GAP_MS` — the entry's own record time —
   and never reads `lastChatAt`. Grep confirms `lastChatAt` has no readers
   anywhere in `src/`. So the practical rule is "a thread qualifies 20 minutes
   after it was recorded", which can be within the same sitting. I documented
   the actual behaviour rather than the comment; the code itself is fine — this
   is a dead field / slightly overstated comment, not a bug.

3. **`TrinketMotionId` declares `flip`, but no definition uses it.** Seven of
   the eight declared motions appear in the merged catalog. Not a bug (the rig
   and `motionPhrase` both handle `flip`), but the doc now says so explicitly
   rather than implying eight are live.

4. **Minor: two doc comments in `quests.ts` describe the "never out of reach"
   rule as though it blocks offering; the actual gate is `questReachable` +
   `questHasWork` in `selectQuestFor`.** I wrote the doc against the runtime
   (`game/quests.ts`), which is the operative behaviour.

No other discrepancies. Runtime behaviour, catalog counts, and the two
validators all lined up with what the new docs claim.
