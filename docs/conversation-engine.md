# Writing Critter Conversations

All editable conversation wording lives in `src/content/conversations.json`. You do not need to edit TypeScript to revise a line or add a conversation. JSON is strict about punctuation, so run this from the project folder after editing:

```sh
npm run content:check
```

The checker reports duplicate IDs, missing lines, and misspelled animal, personality, friendship, or location-type tags. `npm run build` also runs this check automatically.

## Quick wording edits

The `everyday` section contains repeatable greetings and answers grouped by species or personality. Change text inside quotes without changing its surrounding key. A list may contain as many variations as you want; the game rotates through them as conversations are seen.

The available animal tags are `squirrel`, `butterfly`, `raccoon`, `bunny`, `bird`, `cat`, `woodchuck`, `meerkat`, and `fox`. Personality tags are `bold`, `curious`, `dramatic`, `gentle`, `mischievous`, `shy`, and `sleepy`. Friendship levels are `stranger`, `curious`, `friend`, `buddy`, and `pet`.

## Add a standalone conversation

Add an object inside the `storylets` list. Remember the comma between neighboring objects.

```json
{
  "id": "forest-roof-tip",
  "storyArc": "Forest know-how",
  "priority": 20,
  "maxPlays": 1,
  "species": ["squirrel", "bird"],
  "personalities": ["curious", "gentle"],
  "friendshipLevels": ["curious", "friend", "buddy"],
  "biomes": ["forest"],
  "opening": [
    "{{name}} points into {{region}}. “Ribbonwood is sturdy enough for roof frames. Look around the tree line for loose bundles.”"
  ],
  "choices": [
    {
      "id": "where",
      "label": "Where exactly?",
      "replies": ["“The pinkish curled sticks stand out against the forest floor.”"],
      "friendship": 1,
      "endsScene": true
    }
  ]
}
```

Every storylet needs a unique `id`, at least one `opening`, and one or more `choices`. Every choice needs a unique `id` within that scene, a player-facing `label`, and one or more `replies`.

## Targeting tags

All targeting fields are optional. When several fields are present, all of them must match. Within one list, any listed value can match.

- `critterIds`: exact residents, such as `"0,0#raccoon"` for Bandit.
- `species`: one or more animal types.
- `personalities`: one or more traits; either of an animal's two traits can match.
- `friendshipLevels`: exact allowed relationship levels.
- `minFriendship` / `maxFriendship`: a relationship range instead of an exact list.
- `pageIds`: exact world pages such as `"0,0"`.
- `biomes`: location types: `clearing`, `forest`, `meadow`, `dunes`, `scrapflats`, or `tropical`.
- `regionNames`: exact named regions shown in the game, such as `"The Paper Clearing"`.
- `requiresFlags`: facts that must already be remembered.
- `excludesFlags`: facts that must not yet be remembered.

Use `priority` when several scenes can match; the highest number wins. At equal priority, the game favors the least-seen scene to keep conversations fresh. `maxPlays` limits how often an animal can receive that scene; omit it for repeatable material or location advice.

## Text placeholders

These placeholders work in openings, choice labels, and replies:

- `{{name}}` — this animal's name
- `{{species}}` — its animal type
- `{{region}}` — the current named region
- `{{biome}}` — the friendly location type
- `{{pageId}}` — the exact page coordinate

## Ongoing story arcs

Choices can add memory flags. A later scene can require those flags, creating a storyline that continues across visits:

```json
{
  "id": "lost-map-1",
  "excludesFlags": ["lost-map:promised"],
  "opening": ["{{name}} has misplaced a tiny map."],
  "choices": [{
    "id": "help",
    "label": "I'll help",
    "replies": ["“Meet me by the folded hill when you know more.”"],
    "addFlags": ["lost-map:promised"],
    "friendship": 2,
    "endsScene": true
  }]
}
```

The next scene would use `"requiresFlags": ["lost-map:promised"]` and usually add another flag. Also add an `excludesFlags` completion flag so a finished scene cannot repeat. Bandit's Moon Button scenes in the content file are a complete five-part example.

## Follow-up threads inside one visit

A choice can open another set of questions without ending the conversation. Add
`followUps` using the same choice shape:

```json
{
  "id": "local-wood",
  "label": "What wood grows nearby?",
  "replies": ["“Ribbonwood curls up along the forest floor.”"],
  "followUps": [
    {
      "id": "tool",
      "label": "What should I bring?",
      "replies": ["“Bring {{tool-for:redwood-bark-curls}}.”"]
    },
    {
      "id": "use",
      "label": "What is it useful for?",
      "replies": ["“It makes a sturdy little frame.”"]
    }
  ]
}
```

Follow-ups can nest again. The game rotates repeated answers and keeps the
thread open; `endsScene` is still the explicit way to close it. Generated local
knowledge also records which exact fact was said, but those memory flags never
make the topic unavailable.

## Choice effects

- `friendship`: adds relationship points from 0 to 100.
- `addFlags`: remembers one or more story facts for that individual animal.
- `endsScene`: shows “Keep chatting” and “See you soon” after the reply.
- `followUps`: replaces the current questions with another choice list after the reply.
- `returnToEveryday`: returns a thread to the standard everyday questions.
- `action`: currently supports `"pet"` for a choice that also pets the animal.
- `replyMode`: use `"random"` to pick a randomized reply instead of rotating through the list in order. The default is `"cycle"`.

For example, a petting choice with randomized reactions looks like this:

```json
{
  "id": "pet",
  "label": "Give a gentle pet",
  "replyMode": "random",
  "replies": [
    "{{name}} leans happily into your hand.",
    "{{name}} gives a pleased little paper crinkle.",
    "You smooth one rumpled edge. {{name}} looks delighted."
  ],
  "action": "pet"
}
```

Random replies are generated from the animal, scene, choice, and number of times that response has been seen. This keeps them varied while ensuring a saved interaction does not change merely because the game was reloaded.

Prefer small scenes that recombine. Add a branch when a choice should change memory, friendship, or a later scene; use extra reply variations when the difference is only flavor.

## Continuation: picking a thread back up

The last thing an animal told you should not vanish the moment you walk away.
The `continuations` section in `conversations.json` holds the lines a critter
uses to pick a topic back up on a later visit:

```json
"continuations": {
  "materials": [
    "“Picking up where we left off on {{lastTopic}} — I had another look.”",
    "“More on {{material:ribbonwood-sticks}}: they turn up in {{found-in:ribbonwood-sticks}}, {{only-here:ribbonwood-sticks}}.”"
  ]
}
```

The section is keyed by *topic kind* — `materials`, `harvest`, `wayfinding`,
`fun` — and falls back to the `place` list for any kind without its own.
`{{lastTopic}}` is filled from a small label map (for example `materials` →
“the materials around here”), so one list of lines can serve every way the
topic came up. Placeholders like `{{material:...}}` read the game's own
catalogs, exactly as elsewhere in the file.

Two functions do the bookkeeping, both in `conversationMemory.ts`:

- **`recordJournalEntry`** writes a line the critter should be able to follow
  up on. It is called by `resolveConversationChoice` whenever a choice carries
  a `journalKind`. Entries are newest-first, capped at 12, and deduplicated by
  their stable id.
- **`takeContinuableThread`** returns the thread this critter may pick back up,
  or `null`. Only **un-continued** entries qualify, and only once they are at
  least **20 minutes** old (`CONTINUATION_MIN_GAP_MS`) — long enough that a
  thread is genuinely “from an earlier sitting” rather than a line said a moment
  ago. When one is returned it is marked `continued`, so **each thread continues
  exactly once**. A critter gets a fresh “and then today…” for a while instead
  of repeating the same follow-up every time you walk past.

The gap is measured from the journal entry's own timestamp (`entry.at`), which
is stamped when the line is recorded, not when the conversation ends.

## Repeat advice

The owner's most-wanted fix was repeat advice: a critter that keeps handing out
the same tip on every visit. Two things address it.

`recentLines` on the conversation memory stores the hashes of the lines this
animal has recently said — newest first, capped at 24. `noteRecentLine` adds one,
and `isRecentLine` checks for one. `deprioritizeRecent` in
`conversationEngine.ts` then reorders a reply pool so that recently-used lines
land at the back:

```ts
function deprioritizeRecent(pool: string[], critterId: string, topicKey: string): string[] {
  // ... returns fresh lines first, then everything already said recently
}
```

It is applied to the generated pools — the `trait`, `self`, `tool`, and `next`
answers (see below). The `place` answers instead rotate by a stable seed so a
given page always agrees across saves and clients.

The important subtlety is *when* a line is marked as said. `deprioritizeRecent`
is deliberately **read-only**: it reorders a pool but records nothing. The line
is only written to `recentLines` in `resolveConversationChoice`, after the game
has actually picked and shown it. That means a pool the player never reaches
(a follow-up they do not open, a branch they skip) does not get poisoned, and
the “fresh” end of a list stays fresh until it is genuinely read.

## Generated answer families

Some everyday choices have no `replies` of their own. Their label is authored,
but the answer is generated from the world at the moment of asking. These are
declared with `replyPool`, and there are five:

- **`trait`** — lines for this animal's primary personality trait, from
  `everyday.traitReplies`.
- **`self`** — lines for this animal's species, from `everyday.selfReplies`.
- **`place`** — local knowledge of where you are standing: what can be gathered,
  what grows, what is nearby, and what makes the place special. See “Tell me
  about this place” above; it also opens the local-knowledge follow-ups.
- **`tool`** — tool-ladder advice for the player's actual situation.
- **`next`** — a nudge toward the next thing the knowledge tree offers.

The last two are the ones worth explaining, because they quote the game's own
catalog text rather than authored flavour.

**`tool`** (`buildToolReplies`) walks the four tool families in
`TOOL_FAMILY_ORDER`. For each, it finds the highest tool the player owns, then
names the next rung up and **quotes that tool's `limitation`** from the tool
catalog — the same sentence the Thing Maker uses. If the player owns nothing in
a family, it names the first rung and that tool's `limitation`. If they own the
top of the ladder, it says so. A retrofitted tool or a renamed rung renames
itself everywhere the critter speaks, so the advice cannot go stale.

**`next`** (`buildNextStepReplies`) walks `TECH_NODE_ORDER` and quotes the
Professor's own words for each node — `node.name`, its `summary` (lowercased),
and `formatLearningDuration(node.learningHours)`. A node only qualifies when it
is both `readiness: 'ready'` and `techNodeStatus(...) === 'available'` — that
is, its prerequisites are already met but it is not yet learned. That is
precisely “the next step”: nothing is promised that the tree does not already
offer. When nothing qualifies, the critter says to wander and ask instead.

## Quests inside a conversation

When you greet a critter, `beginCritterConversation` builds the scene through a
fixed order of precedence. The first stage that produces something wins:

1. **An in-flight quest** — hand it in if every objective is satisfied, else
   show progress. This outranks all small talk.
2. **A new offer** — a quest the critter could give, if this is the right visit
   for it (see “Offering” in `docs/trinkets-and-quests.md`).
3. **A continuation** — a thread left hanging from an earlier sitting.
4. **An authored storylet** — matched by the targeting tags, highest priority
   first, then least-seen.
5. **A milestone** — the next unearned friendship milestone.
6. **Everyday** — the fallback greeting and questions.

Two choice fields drive quest scenes:

- **`questAction`** — `"accept"`, `"decline"`, or `"turn-in"`. The engine
  applies the corresponding runtime call in `resolveConversationChoice`, after
  the reply is chosen. `questId` names the quest; omitting it defaults to the
  critter's active one. A `turn-in` also appends “(You tuck <label> into your
  pocket.)” to the reply, using the trinket's real name.
- **`journalKind`** — a topic kind (`materials`, `harvest`, `wayfinding`,
  `fun`, `self`, `trait`, `tool`, `next`) that records this reply as a thread
  the critter can continue later. Everyday generated choices default their
  `journalKind` to their `replyPool`.

One rule is load-bearing: **a stranger is never asked for anything.** Quest
selection refuses outright for `stranger` friendship, and even a befriended
critter only puts a favour to you on some visits. The first meeting always
stays general.
