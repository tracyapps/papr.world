# Writing Critter Conversations

All editable conversation wording lives in `src/content/conversations.json`. You do not need to edit TypeScript to revise a line or add a conversation. JSON is strict about punctuation, so run this from the project folder after editing:

```sh
npm run content:check
```

The checker reports duplicate IDs, missing lines, and misspelled animal, personality, friendship, or location-type tags. `npm run build` also runs this check automatically.

## Quick wording edits

The `everyday` section contains repeatable greetings and answers grouped by species or personality. Change text inside quotes without changing its surrounding key. A list may contain as many variations as you want; the game rotates through them as conversations are seen.

The available animal tags are `squirrel`, `butterfly`, `raccoon`, `bunny`, `bird`, and `cat`. Personality tags are `bold`, `curious`, `dramatic`, `gentle`, `mischievous`, `shy`, and `sleepy`. Friendship levels are `stranger`, `curious`, `friend`, `buddy`, and `pet`.

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
- `biomes`: location types: `clearing`, `forest`, `meadow`, `dunes`, or `scrapflats`.
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

## Choice effects

- `friendship`: adds relationship points from 0 to 100.
- `addFlags`: remembers one or more story facts for that individual animal.
- `endsScene`: shows “Keep chatting” and “See you soon” after the reply.
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
