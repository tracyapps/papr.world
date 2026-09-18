import type { GameState } from '../state';
import type { Biome } from './biomes';
import { obtainRoutesFor, toolRequiredFor } from './obtaining';
import { RECIPE_DEFS, isRecipeAvailable, recipeForTool, type RecipeId } from './recipes';
import { RESOURCE_CORE_DEFS, type ResourceId } from './resources';
import { SEED_DEFS, type SeedId } from './seeds';
import { TOOL_DEFS, toolsInFamily, type ToolFamilyId, type ToolId } from './tools';
import { techNodeGrantingRecipe, techNodeStatus, type TechNodeId } from './techTree';
import { SPECIES_YIELD, type TreeSpecies } from './trees';
import type { TrinketFamilyId, TrinketShapeId } from './trinkets';
import { QUEST_EXPANSION_DEFS } from './questCatalog.expansion';
import type { BuildPieceKey } from '../../world/buildPieces';
import type { CritterSpecies, PersonalityTrait } from '../../game/critterVariation';
import type { FriendshipLevel } from '../../game/friendship';

/**
 * Critter side-quests.
 *
 * A quest is a small errand a critter asks for once it trusts you. The whole
 * design rests on one rule the owner stated plainly:
 *
 *   **A quest is never out of reach. It is the next step.**
 *
 * That is enforced mechanically, not by taste. Every objective is graded by
 * `objectiveReach` against the *live* game state — inventory, tools, plans,
 * maker level, the knowledge tree, visited biomes, planted beds, trimmed trees
 * — and `questReachable` refuses to offer a quest while any objective is still
 * `'far'`. So a critter can safely say "bring me three ribbonwood" only when
 * the player can actually get ribbonwood, or is exactly one craftable tool
 * away from it.
 *
 * The three tiers are the owner's own ladder:
 *  - `favor`   — a small, single-step errand. Common, low friendship.
 *  - `errand`  — two-to-three steps; nudges the next biome or a new plant.
 *  - `odyssey` — rare, high friendship, multi-step: carry a thing or a message
 *                to a critter in another biome, or build a tool you do not own.
 *
 * Adding a quest is data. Adding a *kind* of quest is one new objective variant
 * plus its two switches (`objectiveReach` and `objectiveMeasure` in
 * `game/quests.ts`). Nothing else learns about it.
 */

export type QuestTier = 'favor' | 'errand' | 'odyssey';

export type QuestObjective =
  | { kind: 'collect'; resource: ResourceId; quantity: number }
  | { kind: 'craft'; recipeId: RecipeId }
  | { kind: 'craftTool'; family: ToolFamilyId; tier?: 1 | 2 | 3 }
  | { kind: 'learnTech'; nodeId: TechNodeId }
  | { kind: 'plant'; seedId: SeedId }
  | { kind: 'harvest'; resource: ResourceId; quantity: number }
  | { kind: 'visitBiome'; biome: Biome }
  | { kind: 'visitPage'; pageId: string }
  | { kind: 'dig'; layer: 1 | 2 | 3 }
  | { kind: 'trim'; species: TreeSpecies }
  | { kind: 'talk'; critterId: string }
  | { kind: 'place'; templateKey: BuildPieceKey }
  | { kind: 'deliver'; itemId: string };

export type QuestReward = {
  trinketFamily: TrinketFamilyId;
  trinketShapes?: TrinketShapeId[];
  trinketTag?: string;
  friendship: number;
};

export type QuestDef = {
  id: string;
  title: string;
  /** One line a critter might paraphrase as "here is what I need". */
  summary: string;
  tier: QuestTier;
  giverSpecies?: CritterSpecies[];
  giverPersonalities?: PersonalityTrait[];
  giverCritterIds?: string[];
  minFriendship: FriendshipLevel;
  biomes?: Biome[];
  requiresQuests?: string[];
  objectives: QuestObjective[];
  reward: QuestReward;
  opening: string[];
  acceptLabel: string;
  acceptReply: string[];
  declineLabel?: string;
  declineReply?: string[];
  progressOpening: string[];
  turnInOpening: string[];
  turnInReply: string[];
  weight?: number;
  /** At most one active quest from an exclusivity group at a time. */
  exclusivityGroup?: string;
};

const AUTHORED_QUESTS: QuestDef[] = [
  {
    id: 'favor-first-shiny',
    title: 'Something Shiny',
    summary: 'Bring a few confetti stones to a critter who collects them.',
    tier: 'favor',
    giverSpecies: ['raccoon', 'bird', 'fox', 'meerkat'],
    minFriendship: 'curious',
    objectives: [{ kind: 'collect', resource: 'confetti-stones', quantity: 3 }],
    reward: { trinketFamily: 'found', friendship: 6 },
    opening: [
      '{{name}} looks at you, then at your pockets, then back at you. “So. Hypothetically. If you happened to find three confetti stones, I would be extremely normal about it.”',
    ],
    acceptLabel: 'I’ll find some',
    acceptReply: ['“Excellent. No rush. I will simply be here, being normal.”'],
    declineLabel: 'Maybe later',
    declineReply: ['“Understood. I will be normal about that too.”'],
    progressOpening: ['“Confetti stones. Three of them. I am being so normal right now.”'],
    turnInOpening: ['{{name}} turns the stones over and over, delighted. “These are perfect. Here — I have been saving this for someone who deserved it.”'],
    turnInReply: ['{{name}} tucks a small something into your hand. “A collector should collect.”'],
  },
  {
    id: 'favor-loose-twigs',
    title: 'A Bundle of Twigs',
    summary: 'Gather kraft twigs for a critter patching a nest.',
    tier: 'favor',
    giverSpecies: ['squirrel', 'bird', 'bunny', 'woodchuck'],
    minFriendship: 'curious',
    objectives: [{ kind: 'collect', resource: 'kraft-twigs', quantity: 4 }],
    reward: { trinketFamily: 'natural', friendship: 6 },
    opening: [
      '“My nest has a corner that sighs when the wind goes by,” {{name}} admits. “Four good kraft twigs would fix it right up.”',
    ],
    acceptLabel: 'I can gather those',
    acceptReply: ['“You are a hero and I will say so to everyone.”'],
    declineLabel: 'Not right now',
    declineReply: ['“That is fair. The corner will keep sighing.”'],
    progressOpening: ['“Any twigs yet? The corner is sighing as we speak.”'],
    turnInOpening: ['{{name}} presses the twigs into the nest corner. “Oh, that is so much better. Here, take this. I have had it forever and it deserves a better shelf than mine.”'],
    turnInReply: ['{{name}} hands over a keepsake, looking pleased.'],
  },
  {
    id: 'favor-first-flower',
    title: 'A First Bloom',
    summary: 'Plant and grow a Buttonbloom, then bring back what it makes.',
    tier: 'favor',
    giverSpecies: ['bunny', 'butterfly'],
    giverPersonalities: ['gentle', 'curious'],
    minFriendship: 'curious',
    biomes: ['clearing', 'meadow', 'forest'],
    objectives: [{ kind: 'plant', seedId: 'buttonbloom-seeds' }],
    reward: { trinketFamily: 'natural', trinketTag: 'plant', friendship: 7 },
    opening: [
      '“Have you put anything in the ground yet?” {{name}} asks, entirely without judgement. “Even one Buttonbloom changes how a clearing feels.”',
    ],
    acceptLabel: 'I’ll plant one',
    acceptReply: ['“Find a soft spot, dig a little, and give it time. I believe in you and in it.”'],
    declineLabel: 'Not today',
    declineReply: ['“Whenever you like. The soil is patient.”'],
    progressOpening: ['“Is your Buttonbloom in the ground? I have been thinking about it.”'],
    turnInOpening: ['“You did it!” {{name}} hops in a small, genuine circle. “I found this on the ground this morning and thought of you immediately.”'],
    turnInReply: ['{{name}} presents a little found thing with great ceremony.'],
  },
  {
    id: 'errand-second-scissors',
    title: 'Sharper Shears',
    summary: 'Make a pair of Sturdy Scissors so you can gather bark curls.',
    tier: 'errand',
    giverSpecies: ['woodchuck', 'squirrel', 'raccoon'],
    minFriendship: 'friend',
    biomes: ['forest'],
    objectives: [{ kind: 'craftTool', family: 'scissors', tier: 2 }],
    reward: { trinketFamily: 'handmade', trinketTag: 'craft', friendship: 9 },
    opening: [
      '{{name}} sizes up your hands. “Kids’ scissors are lovely. They are also full of opinions about redwood. Make yourself something with a proper hinge and the forest opens up.”',
    ],
    acceptLabel: 'I’ll make better scissors',
    acceptReply: ['“That’s the spirit. The plan is in the tree, if you haven’t met it. Mind your fingers.”'],
    declineLabel: 'Another time',
    declineReply: ['“The redwoods will still be there. Rude, but there.”'],
    progressOpening: ['“How are the shears coming along? A fold here, a stone there.”'],
    turnInOpening: ['“Now THAT is a hinge,” {{name}} says. “Try the redwoods. They give up their curls to shears like those.”'],
    turnInReply: ['{{name}} gives you something small and beautifully made.'],
  },
  {
    id: 'errand-desert-walk',
    title: 'The Far Sand',
    summary: 'Walk out to the dunes and see what lives there.',
    tier: 'errand',
    giverSpecies: ['fox', 'meerkat', 'bird', 'cat'],
    minFriendship: 'friend',
    objectives: [{ kind: 'visitBiome', biome: 'dunes' }],
    reward: { trinketFamily: 'seasonal', trinketTag: 'biome:dunes', friendship: 8 },
    opening: [
      '“You have the walk of someone who has not seen the dunes yet,” {{name}} says. “One page of sand, and every dune keeps its own little sentry.”',
    ],
    acceptLabel: 'I’ll go see',
    acceptReply: ['“Follow the paper east until it turns to sand. Say hello to whoever is standing tallest.”'],
    declineLabel: 'Not yet',
    declineReply: ['“It is a long walk. It will wait.”'],
    progressOpening: ['“Sand yet? You will know it when your feet stop making that nice sound.”'],
    turnInOpening: ['“You went! Look at you, all sandy.” {{name}} digs in a pocket. “I keep this for travellers who make it back.”'],
    turnInReply: ['{{name}} hands over a small warm keepsake.'],
  },
  {
    id: 'errand-new-row',
    title: 'Something You Have Never Grown',
    summary: 'Plant a seed you have not grown before.',
    tier: 'errand',
    giverSpecies: ['bunny', 'squirrel', 'butterfly'],
    giverPersonalities: ['curious', 'gentle', 'dramatic'],
    minFriendship: 'friend',
    objectives: [{ kind: 'plant', seedId: 'crinkle-carrot-seeds' }],
    reward: { trinketFamily: 'natural', trinketTag: 'plant', friendship: 8 },
    opening: [
      '“A garden that only grows one thing is really just a very loyal garden,” {{name}} says. “Try a crinkle carrot. They are absurd and wonderful.”',
    ],
    acceptLabel: 'I’ll try carrots',
    acceptReply: ['“Dig a bed, tuck them in, and wait. The tops are the best part, arguably.”'],
    declineLabel: 'Maybe later',
    declineReply: ['“The packets keep. Seeds are patient like that.”'],
    progressOpening: ['“Are the carrots in yet? I want to hear about the tops.”'],
    turnInOpening: ['“Carrots!” {{name}} is beside themselves. “You are a proper gardener now. Here is a badge. Well — here is a thing. It is badge-shaped if you squint.”'],
    turnInReply: ['{{name}} presses a small gardening keepsake into your hand.'],
  },
  {
    id: 'errand-second-shovel',
    title: 'Down One Layer',
    summary: 'Reach the compact layer under a bed you already dug.',
    tier: 'errand',
    giverSpecies: ['woodchuck', 'raccoon', 'fox'],
    minFriendship: 'friend',
    objectives: [{ kind: 'dig', layer: 2 }],
    reward: { trinketFamily: 'curious', trinketTag: 'metal', friendship: 9 },
    opening: [
      '“The first scoop only gets you the easy layer,” {{name}} says, tapping the ground with one foot. “There is a better one underneath, and it wants a braver shovel.”',
    ],
    acceptLabel: 'I’ll dig deeper',
    acceptReply: ['“Make the next shovel up, then put it to work. The good stuff sits lower.”'],
    declineLabel: 'Not now',
    declineReply: ['“It has waited a long time. It can wait a bit more.”'],
    progressOpening: ['“Been down past the first layer yet? That is where the interesting smells are.”'],
    turnInOpening: ['“I can smell the deeper layer on you,” {{name}} says approvingly. “Take this. It came up from somewhere, once.”'],
    turnInReply: ['{{name}} hands over a curious little object.'],
  },
  {
    id: 'errand-trim-redwood',
    title: 'Curls from a Living Redwood',
    summary: 'Trim a redwood and bring back the bark curls.',
    tier: 'errand',
    giverSpecies: ['squirrel', 'woodchuck', 'bird'],
    minFriendship: 'friend',
    biomes: ['forest'],
    objectives: [{ kind: 'collect', resource: 'redwood-bark-curls', quantity: 2 }],
    reward: { trinketFamily: 'handmade', trinketTag: 'craft', friendship: 10 },
    opening: [
      '“A redwood will not hand over its curls to just anyone,” {{name}} says. “You need the sturdy shears and a steady hand. Bring me two curls and I will show you what they are for.”',
    ],
    acceptLabel: 'I’ll trim a redwood',
    acceptReply: ['“Careful, and gentle. It takes new growth without minding, done right.”'],
    declineLabel: 'Another time',
    declineReply: ['“The redwoods are not going anywhere. Trees are like that.”'],
    progressOpening: ['“Two curls, when you can. The good pinkish ones.”'],
    turnInOpening: ['“Beautiful.” {{name}} turns the curls to the light. “These bind together into proper lumber. Keep them — and take this besides.”'],
    turnInReply: ['{{name}} gives you a trinket made of something older than the forest.'],
  },
  {
    id: 'errand-mend-the-ground',
    title: 'Mend a Patch of Ground',
    summary: 'Plant a Mend-me seed in a bed you have dug out.',
    tier: 'errand',
    giverSpecies: ['bunny', 'butterfly'],
    giverPersonalities: ['gentle', 'curious'],
    minFriendship: 'friend',
    objectives: [{ kind: 'plant', seedId: 'mend-me-seeds' }],
    reward: { trinketFamily: 'story', trinketTag: 'plant', friendship: 10 },
    opening: [
      '“Some critters can’t make their own beds,” {{name}} says, quieter than usual. “If you dig a hole you are done with, tuck a Mend-me seed in it. The paper will stitch itself shut.”',
    ],
    acceptLabel: 'I’ll mend one',
    acceptReply: ['“Thank you. You have to dig the bed first, then sow it. It is the giving-back kind of seed.”'],
    declineLabel: 'Not today',
    declineReply: ['“I understand. It is the kind of thing that should be a choice.”'],
    progressOpening: ['“Did you find a patch to mend? There is no hurry on it.”'],
    turnInOpening: ['“You healed a bit of the world,” {{name}} says, as if that were just a normal thing a person does. “Here. You should keep this.”'],
    turnInReply: ['{{name}} gives you something they have clearly kept for a long time.'],
  },
  {
    id: 'odyssey-word-to-the-sentry',
    title: 'A Word for the Sentry',
    summary: 'Carry a message from a friend to a meerkat out in the dunes.',
    tier: 'odyssey',
    giverSpecies: ['squirrel', 'raccoon', 'bird', 'bunny', 'cat'],
    minFriendship: 'buddy',
    // Deliberately NOT gated on `errand-desert-walk`: a player who wandered to
    // the dunes on their own would satisfy that errand's only objective before
    // ever being offered it, so the gate could lock this whole arc out.
    objectives: [
      { kind: 'talk', critterId: 'meerkat' },
    ],
    reward: { trinketFamily: 'story', friendship: 14 },
    opening: [
      '{{name}} has been turning something over in their paws. “There is a sentry out past the dunes I have not seen in a long while. If you are going that way… would you tell them I remember the standing-up trick?”',
      '“It is a small message. It only matters to the two of us.”',
    ],
    acceptLabel: 'I’ll carry the message',
    acceptReply: ['“Thank you. Find a meerkat out in the sand and pass it along. They will know.”'],
    declineLabel: 'I can’t right now',
    declineReply: ['“No matter. It has kept this long.”'],
    progressOpening: ['“Have you seen a meerkat yet? Tallish. Extremely serious posture.”'],
    turnInOpening: ['“You told them.” {{name}} goes very still for a moment. “They remembered. Good. Here — this goes to whoever carries word between places.”'],
    turnInReply: ['{{name}} gives you a trinket that clearly means something to them.'],
  },
  {
    id: 'odyssey-lumber-run',
    title: 'Lumber for a Neighbor',
    summary: 'Refine bound lumber and set a paper bench down in the world.',
    tier: 'odyssey',
    giverSpecies: ['woodchuck', 'raccoon', 'fox'],
    minFriendship: 'buddy',
    objectives: [
      { kind: 'craft', recipeId: 'bound-lumber' },
      { kind: 'place', templateKey: 'paper-bench' },
    ],
    reward: { trinketFamily: 'handmade', trinketTag: 'craft', friendship: 14 },
    opening: [
      '“A neighbor with nowhere to sit is a sad thing,” {{name}} declares. “Bind some twigs and bark into lumber, then build a bench and put it somewhere. Anywhere. It just has to exist.”',
    ],
    acceptLabel: 'Consider it built',
    acceptReply: ['“You will need the maker and a hammer. Bound lumber is twigs and curls, pressed flat.”'],
    declineLabel: 'Later',
    declineReply: ['“Benches are for later, sometimes. I respect that.”'],
    progressOpening: ['“Lumber made? Bench down? I have been picturing it.”'],
    turnInOpening: ['“There it is! A bench. In the world. Thank you.” {{name}} slips you something in return. “Made it myself, which will be obvious.”'],
    turnInReply: ['{{name}} hands over a trinket with obvious pride.'],
  },
  {
    id: 'odyssey-palm-and-shell',
    title: 'Palm, Shell, and a Long Walk',
    summary: 'Gather palm fiber and a shell, then plant something new in the sand.',
    tier: 'odyssey',
    giverSpecies: ['meerkat', 'fox', 'raccoon'],
    minFriendship: 'buddy',
    biomes: ['dunes'],
    objectives: [
      { kind: 'collect', resource: 'palm-fiber', quantity: 2 },
      { kind: 'plant', seedId: 'paper-tomato-seeds' },
    ],
    reward: { trinketFamily: 'seasonal', trinketTag: 'biome:dunes', friendship: 15 },
    opening: [
      '“Nothing grows easy out here,” {{name}} says, scanning the horizon out of habit. “But someone grew tomatoes in the sand once. Palm fiber in one pocket, and a tomato bed in the other — that is a life I could believe in.”',
    ],
    acceptLabel: 'I’ll try the sand',
    acceptReply: ['“Palm clippings come off the palms with scissors. The seeds turn up in dunes and meadows both. Good luck.”'],
    declineLabel: 'Too far for me',
    declineReply: ['“Fair. The sand is not everyone’s paper.”'],
    progressOpening: ['“Fiber? Tomato bed? Even one of the two is a start.”'],
    turnInOpening: ['“You actually did it.” For once, {{name}} does not look at the horizon. “Take this. It has been waiting for someone who would.”'],
    turnInReply: ['{{name}} gives you a shell-smooth keepsake.'],
  },
  {
    id: 'odyssey-scrap-for-the-mill',
    title: 'Scrap for the Mill',
    summary: 'Bring sunbaked cardboard and a cardstone to a woodchuck’s project.',
    tier: 'odyssey',
    giverSpecies: ['woodchuck', 'raccoon'],
    minFriendship: 'buddy',
    objectives: [
      { kind: 'collect', resource: 'sunbaked-cardboard', quantity: 4 },
      { kind: 'collect', resource: 'graphite-cardstone', quantity: 2 },
    ],
    reward: { trinketFamily: 'found', trinketTag: 'metal', friendship: 13 },
    opening: [
      '“The mill is dreaming again,” {{name}} says. “Four sheets of sunbaked card and a couple of cardstones, and I could make the dream into a thing with corners.”',
    ],
    acceptLabel: 'I’ll fetch it',
    acceptReply: ['“Card cardboard turns up in the dunes and the flats. Cardstone hides in the forest and the scrap. Bring a shovel.”'],
    declineLabel: 'Another day',
    declineReply: ['“Dreams of the mill are extremely patient.”'],
    progressOpening: ['“Card, cardstone. Two piles, one dream.”'],
    turnInOpening: ['“Corners! I made corners!” {{name}} is radiant. “You are the reason. Take this — it fell out of the mill years ago and I never knew what to do with it.”'],
    turnInReply: ['{{name}} hands over an odd little found thing.'],
  },
  {
    id: 'odyssey-three-biomes',
    title: 'Three Kinds of Ground',
    summary: 'Stand in three different biomes: the clearing, the forest, and the dunes.',
    tier: 'odyssey',
    giverSpecies: ['bird', 'fox', 'cat', 'butterfly'],
    minFriendship: 'buddy',
    objectives: [
      { kind: 'visitBiome', biome: 'forest' },
      { kind: 'visitBiome', biome: 'dunes' },
      { kind: 'visitBiome', biome: 'meadow' },
    ],
    reward: { trinketFamily: 'curious', friendship: 16 },
    opening: [
      '“Home is one page,” {{name}} says, “but the world is several. Forest, meadow, dunes — walk all three and come back. I want to know what the paper smells like in each.”',
    ],
    acceptLabel: 'I’ll walk it',
    acceptReply: ['“Follow the seams. Each one changes all at once, like a page turning. Which, of course, it is.”'],
    declineLabel: 'Maybe someday',
    declineReply: ['“Walking is never a waste. Do it when you want to.”'],
    progressOpening: ['“Which grounds have you stood on so far? Forest? Meadow? Sand?”'],
    turnInOpening: ['“All three.” {{name}} listens to your description with eyes closed. “Good. You brought the whole world back with you. Here is something for a traveller’s shelf.”'],
    turnInReply: ['{{name}} gives you a well-travelled trinket.'],
  },
  {
    id: 'favor-stone-for-a-sling',
    title: 'Terracotta Pebbles',
    summary: 'Bring terracotta pebbles back from the dunes.',
    tier: 'favor',
    giverSpecies: ['meerkat', 'fox', 'raccoon'],
    minFriendship: 'curious',
    biomes: ['dunes', 'scrapflats', 'forest', 'meadow', 'clearing'],
    objectives: [{ kind: 'collect', resource: 'terracotta-pebbles', quantity: 3 }],
    reward: { trinketFamily: 'natural', friendship: 6 },
    opening: [
      '“The warm orange pebbles — terracotta, they call them — only turn up out in the sand,” {{name}} says. “Three would make a very satisfying little pile.”',
    ],
    acceptLabel: 'I’ll look in the sand',
    acceptReply: ['“Mind the sun. And the meerkats. They are friendly, just extremely tall about it.”'],
    declineLabel: 'Not now',
    declineReply: ['“No hurry. Pebbles hold.”'],
    progressOpening: ['“Any orange pebbles yet? They stack so nicely.”'],
    turnInOpening: ['“Yes! These are the right ones.” {{name}} stacks them once, admires them, and hands you a small reward.'],
    turnInReply: ['{{name}} gives you a keepsake in thanks.'],
  },
  {
    id: 'errand-sawdust-and-rosin',
    title: 'Mill Supplies',
    summary: 'Bring ribbonwood sticks to the woodchuck at the mill.',
    tier: 'favor',
    giverSpecies: ['woodchuck', 'squirrel'],
    giverCritterIds: ['-2,0#woodchuck'],
    minFriendship: 'curious',
    objectives: [{ kind: 'collect', resource: 'ribbonwood-sticks', quantity: 3 }],
    reward: { trinketFamily: 'story', trinketTag: 'story', friendship: 7 },
    opening: [
      '“Ribbonwood! The pinkish ones. They sand up beautiful,” {{name}} says, already reaching for a plane. “Three sticks and I will show you what the mill can really do.”',
    ],
    acceptLabel: 'I’ll bring ribbonwood',
    acceptReply: ['“Look under the trees. The forest floor is generous with them.”'],
    declineLabel: 'Later',
    declineReply: ['“The mill runs on patience as much as ribbonwood.”'],
    progressOpening: ['“Sticks? The pinkish ones?”'],
    turnInOpening: ['“Perfect grain.” {{name}} runs a thumb along one. “Here — a mill scrap that turned out too nice to melt down.”'],
    turnInReply: ['{{name}} gives you a piece of mill-craft.'],
  },
];

function mergeQuests(): QuestDef[] {
  const seen = new Set<string>();
  const merged: QuestDef[] = [];
  for (const quest of [...AUTHORED_QUESTS, ...QUEST_EXPANSION_DEFS]) {
    if (seen.has(quest.id)) continue;
    seen.add(quest.id);
    merged.push(quest);
  }
  return merged;
}

let questCache: QuestDef[] | null = null;
let questByIdCache: Map<string, QuestDef> | null = null;

export function allQuestDefs(): QuestDef[] {
  questCache ??= mergeQuests();
  return questCache;
}

export function questById(): Map<string, QuestDef> {
  questByIdCache ??= new Map(allQuestDefs().map((quest) => [quest.id, quest]));
  return questByIdCache;
}

export function getQuestDef(id: string): QuestDef | null {
  return questById().get(id) ?? null;
}

export const TIER_ORDER: QuestTier[] = ['favor', 'errand', 'odyssey'];

// --- Reachability ---------------------------------------------------------
//
// The single most important idea in this file. A quest is graded against the
// live state, never against a designer's idea of "where the player should be".

export type ObjectiveReach = 'done' | 'ready' | 'next-step' | 'far';

function ownsFamilyTool(state: GameState, family: ToolFamilyId, tier?: 1 | 2 | 3): boolean {
  return toolsInFamily(family).some((toolId) => (
    (state.player.tools[toolId] ?? 0) > 0
    && (tier === undefined || TOOL_DEFS[toolId].tier >= tier)
  ));
}

/** How reachable a *recipe* is: own it, can make it, or one step from it. */
function recipeReach(state: GameState, recipeId: RecipeId): ObjectiveReach {
  const recipe = RECIPE_DEFS[recipeId];
  if (!recipe) return 'far';
  if (!isRecipeAvailable(recipeId)) return 'far';
  const output = recipe.output;
  if (output.kind === 'tool' && (state.player.tools[output.toolId] ?? 0) > 0) return 'done';
  if (output.kind === 'resource' && (state.player.inventory[output.resource] ?? 0) > 0) return 'done';
  if (output.kind === 'item' && (state.player.items[output.itemId] ?? 0) > 0) return 'done';

  // The plan is the only "hard" gate; materials and a busy maker are ordinary
  // chores the player can always resolve, so they do not count as "far".
  if (!state.player.plans.includes(recipeId)) {
    if (recipe.planSource === 'starter') return 'ready';
    const nodeId = techNodeGrantingRecipe(recipeId);
    if (!nodeId) return 'far';
    const status = techNodeStatus(nodeId, state);
    if (status === 'available') return 'next-step';
    if (status === 'owned') return 'ready';
    return 'far';
  }
  if (state.world.thingMaker.level < recipe.minimumMakerLevel) return 'next-step';
  return 'ready';
}

function resourceReach(state: GameState, resource: ResourceId, quantity: number): ObjectiveReach {
  if ((state.player.inventory[resource] ?? 0) >= quantity) return 'done';
  const routes = obtainRoutesFor(resource);
  if (routes.length === 0) return 'far';
  const tool = toolRequiredFor(resource);
  if (!tool) return 'ready';
  if ((state.player.tools[tool] ?? 0) > 0) return 'ready';
  // Not holding it — can the player make it? If its plan is learnable now, this
  // is exactly the "next step in the tech tree" we want a quest to nudge.
  const family = TOOL_DEFS[tool].family;
  if (ownsFamilyTool(state, family)) return 'ready';
  const recipeId = recipeForTool(tool);
  if (recipeId) return recipeReach(state, recipeId) === 'far' ? 'far' : 'next-step';
  return 'next-step';
}

function seedReach(state: GameState, seedId: SeedId): ObjectiveReach {
  if ((state.player.inventory[seedId] ?? 0) > 0) return 'ready';
  const routes = obtainRoutesFor(seedId);
  if (routes.length === 0) return 'far';
  return 'next-step';
}

export function objectiveReach(obj: QuestObjective, state: GameState): ObjectiveReach {
  switch (obj.kind) {
    case 'collect':
      return resourceReach(state, obj.resource, obj.quantity);
    case 'harvest':
      // The player must hold the produce; growing it is the chore.
      return resourceReach(state, obj.resource, obj.quantity);
    case 'craft':
      return recipeReach(state, obj.recipeId);
    case 'craftTool': {
      const ladder = toolsInFamily(obj.family);
      const target = obj.tier
        ? ladder.find((toolId) => TOOL_DEFS[toolId].tier >= obj.tier!)
        : ladder[0];
      if (!target) return 'far';
      if ((state.player.tools[target] ?? 0) > 0) return 'done';
      const recipeId = recipeForTool(target);
      if (!recipeId) return 'far';
      return recipeReach(state, recipeId);
    }
    case 'learnTech': {
      const status = techNodeStatus(obj.nodeId, state);
      if (status === 'owned') return 'done';
      if (status === 'available') return 'ready';
      return 'far';
    }
    case 'plant':
      return seedReach(state, obj.seedId);
    case 'visitBiome':
      return state.player.visitedBiomes.includes(obj.biome) ? 'done' : 'ready';
    case 'visitPage':
      return state.player.visitedPages.includes(obj.pageId) ? 'done' : 'ready';
    case 'dig': {
      if (ownsFamilyTool(state, 'shovel', obj.layer)) return 'ready';
      const ladder = toolsInFamily('shovel');
      const target = ladder.find((toolId) => TOOL_DEFS[toolId].tier >= obj.layer);
      if (!target) return 'far';
      // Routed through the same recipe ladder check as everything else, so a
      // layer whose shovel is still behind a locked tree node reads as `far`
      // rather than promising a "next step" that does not exist yet.
      const recipeId = recipeForTool(target);
      return recipeId && recipeReach(state, recipeId) !== 'far' ? 'next-step' : 'far';
    }
    case 'trim': {
      const minimumTier = obj.species === 'redwood' ? 2 : 1;
      if (ownsFamilyTool(state, 'scissors', minimumTier)) return 'ready';
      const target = toolsInFamily('scissors').find((toolId) => TOOL_DEFS[toolId].tier >= minimumTier);
      if (!target) return 'far';
      const recipeId = recipeForTool(target);
      return recipeId && recipeReach(state, recipeId) !== 'far' ? 'next-step' : 'far';
    }
    case 'talk': {
      // `critterId` may name one specific animal or a whole species — "tell a
      // meerkat out in the dunes" is the natural phrasing, and a player cannot
      // be expected to hunt down one particular individual. Species matches are
      // resolved against who has actually been met, never assumed.
      const met = state.player.metCritters.includes(obj.critterId)
        || Object.values(state.player.metCritterSpecies ?? {}).includes(obj.critterId);
      return met ? 'done' : 'ready';
    }
    case 'place':
      return 'ready';
    case 'deliver':
      return (state.player.items[obj.itemId] ?? 0) > 0 ? 'done' : 'next-step';
  }
}

/**
 * Whether a critter may offer this quest right now.
 *
 * "Not out of reach" is enforced here: every objective must be achievable with
 * what the player owns or is one craftable step away from.
 */
export function questReachable(quest: QuestDef, state: GameState): boolean {
  return quest.objectives.every((objective) => objectiveReach(objective, state) !== 'far');
}

/** True when at least one objective is still outstanding. */
export function questHasWork(quest: QuestDef, state: GameState): boolean {
  return quest.objectives.some((objective) => objectiveReach(objective, state) !== 'done');
}

/** Human-facing description of one objective, for the dialogue checklist. */
export function describeObjective(objective: QuestObjective): string {
  switch (objective.kind) {
    case 'collect':
      return `${objective.quantity}× ${RESOURCE_CORE_DEFS[objective.resource].shortLabel}`;
    case 'harvest':
      return `bring ${objective.quantity}× ${RESOURCE_CORE_DEFS[objective.resource].shortLabel}`;
    case 'craft':
      return `make a ${RECIPE_DEFS[objective.recipeId]?.name ?? objective.recipeId}`;
    case 'craftTool':
      return objective.tier
        ? `make a tier-${objective.tier} ${objective.family}`
        : `make a ${objective.family}`;
    case 'learnTech':
      return 'learn something new at the Professor';
    case 'plant':
      return `plant ${SEED_DEFS[objective.seedId]?.name ?? objective.seedId}`;
    case 'visitBiome':
      return `visit the ${objective.biome}`;
    case 'visitPage':
      return `visit page ${objective.pageId}`;
    case 'dig':
      return `dig to layer ${objective.layer}`;
    case 'trim':
      return `trim a ${objective.species} tree`;
    case 'talk':
      return 'pass a message to another critter';
    case 'place':
      return `set down a ${objective.templateKey.replace(/-/g, ' ')}`;
    case 'deliver':
      return `bring the ${objective.itemId}`;
  }
}

/** The tree species a material comes off, for trim-flavoured objectives. */
export function treeSpeciesFor(resource: ResourceId): TreeSpecies | null {
  for (const species of Object.keys(SPECIES_YIELD) as TreeSpecies[]) {
    const table = SPECIES_YIELD[species];
    if (table.primary === resource || table.secondary === resource || table.variety === resource) return species;
  }
  return null;
}

/** Kept for the expansion catalog's validator and future UI. */
export type { ToolId };
