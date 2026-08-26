import rawContent from '../content/conversations.json';
import { RESOURCE_CORE_DEFS, type ResourceId } from '../sim/catalogs/resources';
import {
  SEED_DEFS,
  formatGrowthTime,
  plantHarvest,
  type SeedId,
} from '../sim/catalogs/seeds';
import { TOOL_DEFS, toolsInFamily, type ToolId } from '../sim/catalogs/tools';
import {
  BIOME_SCATTER,
  biomesFor,
  isBiomeExclusive,
  obtainRoutesFor,
  toolRequiredFor,
  type ObtainRoute,
} from '../sim/catalogs/obtaining';
import { formatPageDistance } from '../world/distance';
import { getPage } from '../world/pages';
import { BUILTIN_NAVIGATION_PLACES } from '../world/places';
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
  /** Replace the current choices after answering, keeping the exchange open. */
  followUps?: ConversationChoice[];
  /** Return from a generated thread to the critter's everyday questions. */
  returnToEveryday?: boolean;
  /** Record the exact rotating reply without using that memory to close a topic. */
  rememberReplyAs?: string;
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
    placeFacts: Record<Biome, string[]>;
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
  nextScene?: ConversationScene;
};

export type ConversationContext = {
  pageId: string;
  biome: Biome;
  biomeLabel: string;
  regionName: string;
  x: number;
  z: number;
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
  const x = critter.rig.group.position.x;
  const z = critter.rig.group.position.z;
  const { px, pz } = pageOfPosition(x, z);
  const page = getPage(px, pz);
  return {
    pageId: page.id,
    biome: page.biome,
    biomeLabel: BIOME_LABELS[page.biome],
    regionName: getRegionName(px, pz, page.biome),
    x,
    z,
  };
}

type PlaceKnowledgeKind = 'materials' | 'harvest' | 'wayfinding' | 'fun';

const PLACE_KNOWLEDGE_ORDER: PlaceKnowledgeKind[] = [
  'materials', 'harvest', 'wayfinding', 'fun',
];

const PLACE_LEAD_BY_TRAIT: Record<PersonalityTrait, PlaceKnowledgeKind> = {
  bold: 'wayfinding',
  curious: 'materials',
  dramatic: 'fun',
  gentle: 'harvest',
  mischievous: 'fun',
  shy: 'materials',
  sleepy: 'harvest',
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Stable variety: revisiting the same page agrees across saves and clients. */
function rotateBySeed(lines: string[], seed: string): string[] {
  if (lines.length < 2) return [...lines];
  const offset = stableHash(seed) % lines.length;
  return [...lines.slice(offset), ...lines.slice(0, offset)];
}

function routeAppliesHere(route: ObtainRoute, biome: Biome): boolean {
  if (route.kind === 'scattered' || route.kind === 'dug') return route.biomes.includes(biome);
  if (route.kind !== 'trimmed') return false;
  return route.species === 'redwood'
    ? biome === 'forest'
    : biome === 'clearing' || biome === 'forest' || biome === 'meadow';
}

function localMaterialReplies(biome: Biome): string[] {
  const replies: string[] = [];
  for (const resourceId of Object.keys(RESOURCE_CORE_DEFS) as ResourceId[]) {
    const resource = RESOURCE_CORE_DEFS[resourceId];
    if (resource.category === 'seeds' || resource.category === 'food') continue;
    const localRoutes = obtainRoutesFor(resourceId).filter((route) => routeAppliesHere(route, biome));
    if (localRoutes.length === 0) continue;

    const trimmed = localRoutes.find((route): route is Extract<ObtainRoute, { kind: 'trimmed' }> => (
      route.kind === 'trimmed'
    ));
    const scattered = localRoutes.find((route) => route.kind === 'scattered');
    const dug = localRoutes.find((route): route is Extract<ObtainRoute, { kind: 'dug' }> => (
      route.kind === 'dug'
    ));

    if (scattered) {
      replies.push(`“Keep an eye out for ${resource.label} around this ${BIOME_LABELS[biome]}. It lies loose, so walking across a bundle tucks it into your scrapbook.”`);
    } else if (trimmed) {
      const toolId = toolsInFamily('scissors')
        .find((candidate) => TOOL_DEFS[candidate].tier >= trimmed.minimumTier);
      const treeName = trimmed.species === 'redwood' ? 'a living redwood' : `${trimmed.species} trees`;
      replies.push(`“To gather ${resource.label} from ${treeName} here, use ${toolId ? TOOL_DEFS[toolId].name : 'scissors'}. It takes new growth without hurting the tree.”`);
    } else if (dug) {
      const toolId = toolsInFamily('shovel')
        .find((candidate) => TOOL_DEFS[candidate].tier >= dug.layer);
      replies.push(`“There is ${resource.label} under the ${BIOME_LABELS[biome]}. ${toolId ? TOOL_DEFS[toolId].name : `a tier-${dug.layer} shovel`} reaches that paper layer.”`);
    }
  }
  return replies;
}

function localHarvestReplies(biome: Biome): string[] {
  return BIOME_SCATTER[biome].flatMap((resourceId): string[] => {
    if (!(resourceId in SEED_DEFS)) return [];
    const seedId = resourceId as SeedId;
    const harvest = plantHarvest(seedId);
    if (!harvest) return [];
    const seed = SEED_DEFS[seedId];
    const produce = RESOURCE_CORE_DEFS[harvest.resource];
    const after = harvest.mode === 'repeat'
      ? ` It keeps growing, and another crop takes about ${Math.round((harvest.repeatSeconds ?? 0) / 60)} minutes.`
      : ' Lifting that harvest leaves the bed ready to plant again.';
    return [`“${seed.name} turn up around here. They reach full bloom in ${formatGrowthTime(seedId)} and give ${harvest.quantity} ${produce.shortLabel}.${after}”`];
  });
}

function compassDirection(dx: number, dz: number): string {
  const horizontal = dx > 0 ? 'east' : 'west';
  const vertical = dz > 0 ? 'south' : 'north';
  if (Math.abs(dx) > Math.abs(dz) * 2) return horizontal;
  if (Math.abs(dz) > Math.abs(dx) * 2) return vertical;
  return `${vertical}-${horizontal}`;
}

function nearbyPlaceReplies(x: number, z: number): string[] {
  const nearby = BUILTIN_NAVIGATION_PLACES
    .map((place) => ({
      ...place,
      distance: Math.hypot(place.x - x, place.z - z),
      direction: compassDirection(place.x - x, place.z - z),
    }))
    .filter((place) => place.distance >= 8 && place.distance <= 125)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
  if (nearby.length === 0) {
    return ['“No named landmark is close enough for a short walk from here. Save this place in your scrapbook before you wander farther.”'];
  }
  return nearby.map((place) => (
    `“${place.name} is ${place.direction} from here, about ${formatPageDistance(place.distance)} away. Your saved-places arrow can lead you there.”`
  ));
}

function adjacentBiomeReplies(context: ConversationContext): string[] {
  const { px, pz } = pageOfPosition(context.x, context.z);
  const directions = [
    { dx: 0, dz: -1, label: 'north' },
    { dx: 1, dz: 0, label: 'east' },
    { dx: 0, dz: 1, label: 'south' },
    { dx: -1, dz: 0, label: 'west' },
  ] as const;
  const mentioned = new Set<Biome>();
  return directions.flatMap(({ dx, dz, label }): string[] => {
    const neighbor = getPage(px + dx, pz + dz);
    if (neighbor.biome === context.biome || mentioned.has(neighbor.biome)) return [];
    mentioned.add(neighbor.biome);
    return [`“One paper page ${label}, this ${context.biomeLabel} gives way to ${BIOME_LABELS[neighbor.biome]}. That is near enough to wander over and ask a local critter what grows there.”`];
  });
}

function interleavePlaceKnowledge(
  pools: Record<PlaceKnowledgeKind, string[]>,
  order: PlaceKnowledgeKind[],
): string[] {
  const replies: string[] = [];
  const longest = Math.max(...order.map((kind) => pools[kind].length));
  for (let index = 0; index < longest; index += 1) {
    for (const kind of order) {
      const reply = pools[kind][index];
      if (reply) replies.push(reply);
    }
  }
  return replies;
}

function placeKnowledgePools(
  context: ConversationContext,
  primaryTrait: PersonalityTrait,
): Record<PlaceKnowledgeKind, string[]> {
  const pools: Record<PlaceKnowledgeKind, string[]> = {
    materials: localMaterialReplies(context.biome),
    harvest: localHarvestReplies(context.biome),
    wayfinding: [
      ...nearbyPlaceReplies(context.x, context.z),
      ...adjacentBiomeReplies(context),
    ],
    fun: CONTENT.everyday.placeFacts[context.biome].map((line) => (
      line
        .replaceAll('{{region}}', context.regionName)
        .replaceAll('{{biome}}', context.biomeLabel)
    )),
  };
  for (const kind of PLACE_KNOWLEDGE_ORDER) {
    pools[kind] = rotateBySeed(pools[kind], `${context.pageId}:${primaryTrait}:${kind}`);
  }
  return pools;
}

/** The reusable second level behind “Tell me about this place”. */
export function placeKnowledgeFollowUps(
  context: ConversationContext,
  primaryTrait: PersonalityTrait,
): ConversationChoice[] {
  const pools = placeKnowledgePools(context, primaryTrait);
  const choices: Array<[PlaceKnowledgeKind, string]> = [
    ['materials', 'What can I gather nearby?'],
    ['harvest', 'What grows well here?'],
    ['wayfinding', 'Where could I visit nearby?'],
    ['fun', 'What makes this place special?'],
  ];
  return [
    ...choices.flatMap(([kind, label]): ConversationChoice[] => (
      pools[kind].length === 0 ? [] : [{
        id: kind,
        label,
        replies: pools[kind],
        rememberReplyAs: `place:${context.pageId}:${kind}`,
      }]
    )),
    {
      id: 'back',
      label: 'Let’s talk about something else',
      replies: ['“Of course. What else is on your mind?”'],
      returnToEveryday: true,
    },
  ];
}

/**
 * Every repeat of “Tell me about this place” advances through useful local
 * knowledge. Personality changes the leading kind, never which facts exist.
 */
export function placeKnowledgeReplies(
  context: ConversationContext,
  primaryTrait: PersonalityTrait,
): string[] {
  const lead = PLACE_LEAD_BY_TRAIT[primaryTrait];
  const order = [lead, ...PLACE_KNOWLEDGE_ORDER.filter((kind) => kind !== lead)];
  const pools = placeKnowledgePools(context, primaryTrait);
  return interleavePlaceKnowledge(pools, order);
}

/**
 * Placeholders that read the game's own catalogs.
 *
 * `{{material:redwood-bark-curls}}` and `{{tool-for:redwood-bark-curls}}`
 * mean a critter's instructions are quoting the same tables the simulation
 * plays by. A hand-written line saying "you'll need the sturdy scissors for
 * that" is a fact copied outside the system that owns it, and it goes stale
 * silently the first time a tier is retuned — the squirrel keeps saying it,
 * confidently, forever. These cannot: rename a tool, and every line that
 * names it renames itself.
 *
 * Wording stays authored. Only the facts inside it are looked up.
 */
const CATALOG_PLACEHOLDERS: Record<string, (argument: string) => string> = {
  /** A material's full name. */
  material: (id) => RESOURCE_CORE_DEFS[id as ResourceId]?.label ?? id,
  /** Its short name, for lines that already have a lot going on. */
  'material-short': (id) => RESOURCE_CORE_DEFS[id as ResourceId]?.shortLabel ?? id,
  /** A tool's name. */
  tool: (id) => TOOL_DEFS[id as ToolId]?.name ?? id,
  /** The tool a material needs, or plain hands. */
  'tool-for': (id) => {
    const toolId = toolRequiredFor(id as ResourceId);
    return toolId ? TOOL_DEFS[toolId].name : 'nothing but your hands';
  },
  /** Where a material can be found, as a readable list. */
  'found-in': (id) => {
    const biomes = biomesFor(id as ResourceId);
    if (biomes.length === 0) return 'nowhere anyone has found yet';
    if (biomes.length === 1) return biomes[0];
    return `${biomes.slice(0, -1).join(', ')} and ${biomes.at(-1)}`;
  },
  /**
   * Whether a material is biome-exclusive, as a clause that can be dropped
   * into a sentence. Computed, so a critter never claims exclusivity for
   * something that has quietly become available somewhere else.
   */
  'only-here': (id) => (isBiomeExclusive(id as ResourceId)
    ? "and it's the only place you'll find it"
    : 'though it turns up elsewhere too'),
};

function fillTemplate(line: string, critter: Critter, context: ConversationContext) {
  const replacements: Record<string, string> = {
    name: critter.params.name,
    species: critter.species,
    region: context.regionName,
    biome: context.biomeLabel,
    pageId: context.pageId,
  };
  return line.replace(/\{\{([a-z-]+)(?::([a-z0-9-]+))?\}\}/gi, (whole, key: string, argument?: string) => {
    if (argument !== undefined) return CATALOG_PLACEHOLDERS[key]?.(argument) ?? whole;
    return replacements[key] ?? whole;
  });
}

function fillChoice(choice: ConversationChoice, critter: Critter, context: ConversationContext): ConversationChoice {
  return {
    ...choice,
    label: fillTemplate(choice.label, critter, context),
    replies: choice.replies.map((line) => fillTemplate(line, critter, context)),
    followUps: choice.followUps?.map((followUp) => fillChoice(followUp, critter, context)),
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
    if (choice.replyPool === 'place') replies = placeKnowledgeReplies(context, primaryTrait);
    if (choice.replyPool === 'self') replies = CONTENT.everyday.selfReplies[critter.species];
    const followUps = choice.replyPool === 'place'
      ? placeKnowledgeFollowUps(context, primaryTrait)
      : choice.followUps;
    return fillChoice({ ...choice, replies: replies ?? ['...'], followUps }, critter, context);
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
  const reply = pickConversationLine(
    choice.replies,
    seen,
    choice.replyMode,
    `${critter.id}:${scene.id}:${choice.id}`,
  );
  if (choice.rememberReplyAs) {
    const replyIndex = choice.replies.indexOf(reply);
    addConversationFlags(critter.id, [`${choice.rememberReplyAs}:${Math.max(0, replyIndex)}`]);
  }
  let nextScene: ConversationScene | undefined;
  if (choice.followUps?.length) {
    nextScene = {
      id: `${scene.id}:${choice.id}`,
      opening: reply,
      choices: choice.followUps,
      storyArc: scene.storyArc,
    };
  } else if (choice.returnToEveryday) {
    nextScene = everydayConversation(critter);
  }
  return {
    action: choice.action,
    endsScene: choice.endsScene ?? false,
    nextScene,
    reply,
  };
}
