import rawContent from '../content/conversations.json';
import { getPage } from '../world/pages';
import { getRegionName } from '../world/regions';
import { pageOfPosition, type Biome } from '../world/types';
import type { Critter } from './critterBehavior';
import {
  addConversationFlags,
  beginConversationVisit,
  getConversationMemory,
  markConversationSeen,
  type ConversationMemory,
} from './conversationMemory';
import { addFriendshipPoints, getFriendshipLevel, type FriendshipLevel } from './friendship';
import type { CritterSpecies, PersonalityTrait } from './critterVariation';

export type ConversationChoice = {
  id: string;
  label: string;
  replies: string[];
  /** Cycle is the default; random uses a stable shuffled pick per response. */
  replyMode?: 'cycle' | 'random';
  action?: 'pet';
  addFlags?: string[];
  friendship?: number;
  endsScene?: boolean;
};

export type ConversationScene = {
  id: string;
  opening: string;
  choices: ConversationChoice[];
  storyArc?: string;
};

type Storylet = {
  id: string;
  critterIds?: string[];
  species?: CritterSpecies[];
  personalities?: PersonalityTrait[];
  friendshipLevels?: FriendshipLevel[];
  minFriendship?: FriendshipLevel;
  maxFriendship?: FriendshipLevel;
  pageIds?: string[];
  biomes?: Biome[];
  regionNames?: string[];
  requiresFlags?: string[];
  excludesFlags?: string[];
  opening: string[];
  choices: ConversationChoice[];
  storyArc?: string;
  priority?: number;
  maxPlays?: number;
};

type EverydayChoice = Omit<ConversationChoice, 'replies'> & {
  replies?: string[];
  replyPool?: 'trait' | 'place' | 'self';
};

type Milestone = {
  level: FriendshipLevel;
  flag: string;
  opening: string;
  label: string;
  reply: string;
};

type DialogueContent = {
  version: number;
  everyday: {
    greetings: Record<CritterSpecies, string[]>;
    placeReplies: Record<CritterSpecies, string[]>;
    selfReplies: Record<CritterSpecies, string[]>;
    traitReplies: Record<PersonalityTrait, string[]>;
    choices: EverydayChoice[];
  };
  milestones: Milestone[];
  storylets: Storylet[];
};

export type ChoiceResult = {
  reply: string;
  endsScene: boolean;
  action?: 'pet';
};

type ConversationContext = {
  pageId: string;
  biome: Biome;
  biomeLabel: string;
  regionName: string;
};

const CONTENT = rawContent as unknown as DialogueContent;

const FRIENDSHIP_RANK: Record<FriendshipLevel, number> = {
  stranger: 0,
  curious: 1,
  friend: 2,
  buddy: 3,
  pet: 4,
};

const BIOME_LABELS: Record<Biome, string> = {
  clearing: 'home clearing',
  forest: 'forest',
  meadow: 'meadow',
  dunes: 'desert',
  scrapflats: 'scrap flats',
};

function hasAll(memory: ConversationMemory, flags: string[] | undefined) {
  return !flags || flags.every((flag) => memory.flags.includes(flag));
}

function hasNone(memory: ConversationMemory, flags: string[] | undefined) {
  return !flags || flags.every((flag) => !memory.flags.includes(flag));
}

function getContext(critter: Critter): ConversationContext {
  const { px, pz } = pageOfPosition(critter.rig.group.position.x, critter.rig.group.position.z);
  const page = getPage(px, pz);
  return {
    pageId: page.id,
    biome: page.biome,
    biomeLabel: BIOME_LABELS[page.biome],
    regionName: getRegionName(px, pz, page.biome),
  };
}

function fillTemplate(line: string, critter: Critter, context: ConversationContext) {
  const replacements: Record<string, string> = {
    name: critter.params.name,
    species: critter.species,
    region: context.regionName,
    biome: context.biomeLabel,
    pageId: context.pageId,
  };
  return line.replace(/\{\{(name|species|region|biome|pageId)\}\}/g, (_, key: string) => replacements[key]);
}

function fillChoice(choice: ConversationChoice, critter: Critter, context: ConversationContext): ConversationChoice {
  return {
    ...choice,
    label: fillTemplate(choice.label, critter, context),
    replies: choice.replies.map((line) => fillTemplate(line, critter, context)),
  };
}

function isEligible(
  storylet: Storylet,
  critter: Critter,
  memory: ConversationMemory,
  context: ConversationContext,
) {
  const level = getFriendshipLevel(critter.id);
  if (storylet.critterIds && !storylet.critterIds.includes(critter.id)) return false;
  if (storylet.species && !storylet.species.includes(critter.species)) return false;
  if (storylet.personalities && !storylet.personalities.some((trait) => critter.params.personality.includes(trait))) return false;
  if (storylet.friendshipLevels && !storylet.friendshipLevels.includes(level)) return false;
  if (storylet.minFriendship && FRIENDSHIP_RANK[level] < FRIENDSHIP_RANK[storylet.minFriendship]) return false;
  if (storylet.maxFriendship && FRIENDSHIP_RANK[level] > FRIENDSHIP_RANK[storylet.maxFriendship]) return false;
  if (storylet.pageIds && !storylet.pageIds.includes(context.pageId)) return false;
  if (storylet.biomes && !storylet.biomes.includes(context.biome)) return false;
  if (storylet.regionNames && !storylet.regionNames.includes(context.regionName)) return false;
  if (storylet.maxPlays !== undefined && (memory.seen[storylet.id] ?? 0) >= storylet.maxPlays) return false;
  return hasAll(memory, storylet.requiresFlags) && hasNone(memory, storylet.excludesFlags);
}

function pickLine(lines: string[], index: number) {
  return lines[index % lines.length];
}

/** Random-looking but reproducible selection. Including the seen count keeps
 * repeat interactions fresh while avoiding save/reload or multiplayer drift. */
export function pickConversationLine(
  lines: string[],
  index: number,
  mode: 'cycle' | 'random' = 'cycle',
  seed = '',
) {
  if (mode === 'cycle' || lines.length < 2) return pickLine(lines, index);
  let hash = 2166136261;
  const value = `${seed}:${index}`;
  for (let character = 0; character < value.length; character += 1) {
    hash ^= value.charCodeAt(character);
    hash = Math.imul(hash, 16777619);
  }
  return lines[(hash >>> 0) % lines.length];
}

function fromStorylet(
  storylet: Storylet,
  critter: Critter,
  memory: ConversationMemory,
  context: ConversationContext,
): ConversationScene {
  const seen = markConversationSeen(critter.id, storylet.id);
  return {
    id: storylet.id,
    opening: fillTemplate(pickLine(storylet.opening, memory.visits + seen), critter, context),
    choices: storylet.choices.map((choice) => fillChoice(choice, critter, context)),
    storyArc: storylet.storyArc,
  };
}

function relationshipMilestone(
  critter: Critter,
  memory: ConversationMemory,
  context: ConversationContext,
): ConversationScene | null {
  const level = getFriendshipLevel(critter.id);
  const milestone = CONTENT.milestones.find((candidate) => (
    FRIENDSHIP_RANK[level] >= FRIENDSHIP_RANK[candidate.level]
    && !memory.flags.includes(candidate.flag)
  ));
  if (!milestone) return null;

  return {
    id: milestone.flag,
    opening: fillTemplate(milestone.opening, critter, context),
    choices: [{
      id: 'acknowledge',
      label: fillTemplate(milestone.label, critter, context),
      replies: [fillTemplate(milestone.reply, critter, context)],
      addFlags: [milestone.flag],
      endsScene: true,
    }],
    storyArc: 'Growing closer',
  };
}

export function everydayConversation(critter: Critter): ConversationScene {
  const memory = getConversationMemory(critter.id);
  const context = getContext(critter);
  const primaryTrait = critter.params.personality[0];
  const seen = markConversationSeen(critter.id, 'everyday');
  const choices = CONTENT.everyday.choices.map((choice): ConversationChoice => {
    let replies = choice.replies;
    if (choice.replyPool === 'trait') replies = CONTENT.everyday.traitReplies[primaryTrait];
    if (choice.replyPool === 'place') replies = CONTENT.everyday.placeReplies[critter.species];
    if (choice.replyPool === 'self') replies = CONTENT.everyday.selfReplies[critter.species];
    return fillChoice({ ...choice, replies: replies ?? ['...'] }, critter, context);
  });
  return {
    id: 'everyday',
    opening: fillTemplate(pickLine(CONTENT.everyday.greetings[critter.species], memory.visits + seen), critter, context),
    choices,
  };
}

export function beginCritterConversation(critter: Critter): ConversationScene {
  const memory = beginConversationVisit(critter.id);
  const context = getContext(critter);
  const authored = CONTENT.storylets
    .filter((storylet) => isEligible(storylet, critter, memory, context))
    .sort((a, b) => (
      (b.priority ?? 0) - (a.priority ?? 0)
      || (memory.seen[a.id] ?? 0) - (memory.seen[b.id] ?? 0)
      || a.id.localeCompare(b.id)
    ))[0];
  if (authored) return fromStorylet(authored, critter, memory, context);
  return relationshipMilestone(critter, memory, context) ?? everydayConversation(critter);
}

export function resolveConversationChoice(
  critter: Critter,
  scene: ConversationScene,
  choice: ConversationChoice,
): ChoiceResult {
  const seen = markConversationSeen(critter.id, `${scene.id}:${choice.id}`);
  if (choice.addFlags) addConversationFlags(critter.id, choice.addFlags);
  if (choice.friendship) addFriendshipPoints(critter.id, choice.friendship);
  return {
    action: choice.action,
    endsScene: choice.endsScene ?? false,
    reply: pickConversationLine(
      choice.replies,
      seen,
      choice.replyMode,
      `${critter.id}:${scene.id}:${choice.id}`,
    ),
  };
}
