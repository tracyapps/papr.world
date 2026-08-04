# Game Design Plan

## Core Fantasy

You are a handmade paper character in a living paper world. You can draw yourself, wander through paper landscapes, collect paper materials, craft paper tools, build paper places, and leave odd, gentle marks in a shared neighborhood.

The game is about dopamine, creativity, connection, and low-pressure presence. It should feel like a craft table became a world.

## Tone

- Cozy, playful, tactile, and a little weird.
- Handmade instead of polished plastic.
- Social without forcing social pressure.
- Creative without requiring artistic confidence.
- Calm enough for solo wandering, expressive enough for group building.

## Primary Verbs

- Draw
- Walk
- Fold
- Cut
- Tape
- Glue
- Carry
- Place
- Decorate
- Chat
- Trade or gift
- Share
- Help
- Befriend
- Visit
- Save

## Player Experience Pillars

### Make Yourself

Players start by drawing their character. The game should accept messy, strange, charming drawings. The visible avatar can be wild, while the hidden gameplay body stays simple and predictable.

Examples:

- A monster on wheels
- A square with fancy boots
- A tiny notebook ghost
- A smiling scrap with four arms
- A paper doll made of taped parts

### Everything Is Paper

The world should obey the idea that every visible thing is made from paper or paper-adjacent craft material.

Examples:

- Forests made from brown and green construction paper
- Rivers made from shiny blue wrapping paper
- Fog made from tracing paper sheets
- Paths made from torn notebook paper
- Rocks made from crumpled gray paper
- Windows made from translucent paper
- Roofs made from folded cardstock

### Build Together

The communal world should focus on shared making, not domination. The default social contract is "come see what I made" rather than "beat me."

Early multiplayer should support:

- Seeing other players move
- Chat
- Shared placement of simple objects
- Sharing player-made items, decorations, and templates
- Basic ownership or permissions for placed objects
- Local/LAN hosting
- Hosted room joining

Helping should be treated as a first-class social verb. The game can reward players for helping others gather materials, finish builds, discover templates, care for critters, or decorate shared spaces.

### Wander Alone

Solo play matters. The player should be able to explore, gather, build, decorate, collect templates, and meet small paper critters without needing a server full of people.

### Keep a Scrapbook

The player inventory should feel like a scrapbook rather than a conventional backpack. It can hold materials, sketches, item templates, tool templates, decorations, critter notes, photos, house memories, and gifts from other players.

The scrapbook should become both a practical inventory and a record of the player's relationships with the world.

## First Vertical Slice

The first prototype is a tiny paper clearing.

Required features:

1. Character drawing screen
2. Third-person or angled top-down movement
3. One paper terrain patch
4. One gatherable resource: brown construction paper
5. One tool: paper scissors or a drawn harvesting tool
6. One building set: floor, wall, roof, door
7. Basic chat
8. Two-player synchronization
9. Local server mode

Nice-to-have features:

- Paper footsteps
- Crinkle sound when moving through paper grass
- A tiny paper critter wandering through the clearing
- A simple day/night lighting pass
- Export/import a character drawing
- First scrapbook page for materials and discoveries

## Progression

Progression should be about unlocking expressive materials and construction possibilities, not power.

Possible progression tracks:

- New paper types
- New folds
- New decorative stamps
- New tool behaviors
- New lighting styles
- New build piece templates
- New item and tool templates found through exploration
- New critter visitors
- Critter friendship and pet relationships
- New neighborhood themes
- Decorative bling for paper houses
- Helper rewards for generous multiplayer actions

Avoid early progression based on:

- Combat power
- Scarcity pressure
- Leaderboards
- Destructive grief loops
- Daily chores

The current tool-and-material direction is an access hierarchy: loose resources
make first tools; tools reveal shallow or trimmable materials; reinforced tools
reach compact resources; precision tools uncover deep, region-specific finds.
Tools do not permanently break, trees always regrow, and common materials remain
ingredients in advanced recipes. Full progression design lives in
`docs/tool-and-supply-progression.md`.

Digging is also a creative landscape verb. It can happen on almost any exposed
ground, with hills offering richer folded layers. Dug areas remain as shallow
paper depressions rather than healing on a timer. Ordinary seeds turn them into
garden beds; special groundcover seeds can gradually restore the original
terrain. Existing trees, buildings, machines, landmarks, water, and placed
objects protect their footprints from digging.

Terraforming is a progression track of its own. Early tools make single garden
beds; reinforced tools cut and fill terraces; precision tools can grade a larger
building footprint. Hills remain valuable rather than inconvenient: they contain
richer material layers and can support stepped foundations, stilts, hillside
rooms, or dramatic landscaping. Bigger houses therefore become self-authored
projects involving site choice, materials, tools, and terrain—not rewards handed
out by an abstract player level.

The game should maintain a “never-empty horizon” through parallel possibilities:
quick gathering or decorating moments, session-sized tool/shop/build projects,
and long-term homes, collections, friendships, and neighborhood works. These are
invitations without deadlines. The scrapbook may let players pin and name their
own projects instead of presenting an obligatory quest log.

## Discovery and Sharing

Exploration should uncover templates that expand what players can make. Templates can be found in tucked-away paper places, gifted by critters, earned by helping neighbors, discovered during events, or shared by other players.

Template examples:

- Tool shapes
- Furniture parts
- Window and door styles
- Roof folds
- Decorative stamps
- Paper critter toys
- Garden pieces
- Wall patterns

Sharing should support the "we're all in this together" feeling. Players should be able to give templates, materials, decorations, and possibly copied scrapbook pages to other players. Shared creations should credit the maker where appropriate, so generosity leaves a visible social trail.

## Helping Rewards

Helping other players should produce warm, expressive rewards rather than competitive advantage.

Possible rewards:

- Bling to hang in paper houses
- Special scrapbook stickers
- Thank-you stamps
- Decorative ribbons, medals, garlands, or wall charms
- Friend badges
- Shared project mementos
- Critter trust boosts

These rewards should make kindness visible without turning it into a leaderboard.

## Critters

Critters begin as delightful, friendly world life. They should make the world feel less empty even in solo play.

Early critter behavior:

- Wander around interesting paper places.
- React to players with simple curiosity.
- Accept small helpful interactions.
- Occasionally reveal or lead players toward tiny discoveries.

Longer-term critter behavior:

- Build friendship through repeated gentle interactions.
- Remember the player.
- Visit the player's house.
- Become pets or companions.
- Unlock scrapbook notes, decorations, or templates.

The collecting fantasy is emotional: the player should want to befriend every creature because they are charming, not because they are required.

## World Model

Start with rooms or neighborhoods instead of an MMO-scale infinite world, but make the local world feel expandable through connected paper pages.

Recommended shape:

- A neighborhood is a persistent shared space.
- A neighborhood is made of square "pages" rather than real-world yards/meters.
- Each page can hold terrain, paths, props, resources, discoveries, build permissions, and scenic/backdrop hints.
- Pages can be authored exactly, generated from a seed, or use authored structure with randomized details.
- Each neighborhood has a material theme and seed.
- Neighborhoods can later connect through paper paths, doors, trains, envelopes, maps, or portals.

This lets the game feel expandable without requiring MMO-scale infrastructure at the beginning.

Example page runs:

- 4 pages of forest and winding notebook-paper paths.
- 2 pages of sand dunes and grassy plains.
- 8 pages following a shiny paper river with smaller tree patches, hills, and discoveries.

Distance scenery should not be treated as regular objects placed at the edge of the current page. Far hills and mountains should live in a backdrop/parallax layer with haze so they feel far away.

## Social Safety

Because this is a creative multiplayer game, moderation and permissions should be planned early.

Early decisions:

- Players can own or co-own placed objects.
- Rooms can be private, friends-only, LAN-only, or public.
- Hosts can remove players from local or hosted rooms.
- Chat can be disabled per room.
- The game can support "parallel solo" play where other players are hidden.

## Open Design Questions

- Should the camera be third-person, angled top-down, or freely orbiting?
- Should tools be drawn freely, selected from templates, or both? Current direction: both, with templates discovered through exploration.
- Should player-drawn items be shareable between players? Current direction: yes, because sharing supports the communal fantasy.
- How permanent should public-world changes be?
- What is the right room size for a cozy neighborhood?
- Do players have inventories, scrapbooks, or both? Current direction: scrapbook as the inventory.
- Can players write on the world as a primary feature?
- Should paper critters be collectible, helpful, decorative, or just delightful? Current direction: delightful and friendly first, then helpful friends and pets over time.

## Prototype Milestones

### Milestone 1: Paper Feel

Goal: prove the visual language.

- Render a 3D paper clearing.
- Add layered paper materials.
- Add shadows and soft lighting.
- Add a flat paper avatar placeholder.
- Add basic movement.

### Milestone 2: Draw Yourself

Goal: prove the character fantasy.

- Add a drawing canvas.
- Convert drawing to avatar texture.
- Place avatar in the world.
- Save drawing locally.

### Milestone 3: Gather and Build

Goal: prove the creative loop.

- Add one resource.
- Add one tool.
- Add a first scrapbook inventory page.
- Place floor and wall pieces.

### Milestone 4: Expandable Paper Pages

Goal: prove the world can feel larger than one clearing.

- Convert the current clearing into page `0,0`.
- Add neighboring page data.
- Stream or show/hide nearby pages around the avatar.
- Support at least one authored multi-page route.
- Add seeded detail scatter within authored page rules.
- Move distant scenery into parallax/haze backdrop layers.
- Save local build state.

### Milestone 5: Shared Room

Goal: prove multiplayer.

- Add Colyseus room server.
- Sync player positions.
- Sync chat.
- Sync placed build pieces.
- Run locally for LAN.

### Milestone 6: First Cozy Loop

Goal: prove the game has a heartbeat.

- Add simple critter behavior.
- Add sound pass.
- Add material variation.
- Add room naming.
- Add build permissions.
- Add first helping reward or house bling.
