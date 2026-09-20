import rawContent from '../content/conversations.json';
import { RESOURCE_CORE_DEFS, type ResourceId } from '../sim/catalogs/resources';
import {
  SEED_DEFS,
  formatGrowthTime,
  plantHarvest,
  type SeedId,
} from '../sim/catalogs/seeds';
import {
  TOOL_DEFS,
  TOOL_FAMILIES,
  TOOL_FAMILY_ORDER,
  toolsInFamily,
  type ToolId,
} from '../sim/catalogs/tools';
import {
  TECH_DEFS,
  TECH_NODE_ORDER,
  techNodeStatus,
  formatLearningDuration,
  type TechNodeId,
} from '../sim/catalogs/techTree';
import { describeObjective, getQuestDef, type QuestDef } from '../sim/catalogs/quests';
import { SPECIES_FORM, SPECIES_NAMES } from '../sim/catalogs/trees';
import { getGameState } from '../sim/state';
import { createRng } from '../core/math';
import {
  acceptQuest,
  activeQuestDefFor,
  completeQuest,
  declineQuest,
  hasTurnInReady,
  noteMetCritter,
  questProgress,
  refreshQuest,
  selectQuestFor,
} from './quests';
import {
  noteRecentLine,
  isRecentLine,
  endConversationVisit,
  recordJournalEntry,
  takeContinuableThread,
  type ConversationJournalEntry,
} from './conversationMemory';
import {
  BIOME_SCATTER,
  biomesFor,
  isBiomeExclusive,
  obtainRoutesFor,
  SPECIES_BIOMES,
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
  recordDiaryEntry,
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
  /** `goodbye` closes the conversation after the reply is shown. */
  action?: 'pet' | 'goodbye' | 'open-mill';
  /**
   * The authored label, kept when a repeatable topic is relabelled "Tell me
   * more about that" after it has been asked once (see `continueScene`).
   */
  baseLabel?: string;
  addFlags?: string[];
  friendship?: number;
  endsScene?: boolean;
  /** Replace the current choices after answering, keeping the exchange open. */
  followUps?: ConversationChoice[];
  /** Return from a generated thread to the critter's everyday questions. */
  returnToEveryday?: boolean;
  /** Side effect a quest scene choice performs when chosen. */
  questAction?: 'accept' | 'decline' | 'turn-in';
  /** Which quest the action refers to; defaults to the critter's active one. */
  questId?: string;
  /**
   * Record this reply as a thread the critter can pick back up next visit.
   * `materials`, `harvest`, `wayfinding`, `fun`, `tool`, `next`, `self`, `trait`.
   */
  journalKind?: string;
  /** Record the exact rotating reply without using that memory to close a topic. */
  rememberReplyAs?: string;
  /**
   * Typed context for the diary entry `rememberReplyAs` produces.
   * Left unset outside place knowledge — `rememberReplyAs` still records the
   * conversation flag either way, but no diary entry is written without this.
   */
  rememberReplyContext?: { pageId: string; kind: string };
};

export type ConversationScene = {
  id: string;
  opening: string;
  choices: ConversationChoice[];
  storyArc?: string;
  /**
   * Where the scene happened. Carried on the scene so a resolved choice can
   * file its journal entry without asking the critter's rig for a position
   * again — which both avoids a duplicate terrain lookup and keeps the scene
   * testable without a live rig.
   */
  pageId?: string;
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
  /**
   * Generated answer families. `trait`/`place`/`self` are the original three;
   * `tool` is tool-ladder advice for where the player is standing, and `next`
   * is a gentle nudge toward the next thing the knowledge tree offers.
   */
  replyPool?: 'trait' | 'place' | 'self' | 'tool' | 'next';
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
  /**
   * Lines for picking a thread back up on a later visit, keyed by topic kind.
   * `place` is the fallback for any kind without its own list.
   */
  continuations?: Record<string, string[]>;
};

export type ChoiceResult = {
  reply: string;
  endsScene: boolean;
  action?: 'pet' | 'goodbye' | 'open-mill';
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
  tropical: 'tropics',
  swamp: 'swamp',
  wetland: 'wetlands',
  'rocky-highlands': 'rocky highlands',
  savanna: 'savanna',
  badlands: 'badlands',
  'bamboo-forest': 'bamboo forest',
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
  if (route.kind === 'scattered' || route.kind === 'dug' || route.kind === 'mined') return route.biomes.includes(biome);
  if (route.kind !== 'trimmed') return false;
  return SPECIES_BIOMES[route.species].includes(biome);
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
    const mined = localRoutes.find((route): route is Extract<ObtainRoute, { kind: 'mined' }> => (
      route.kind === 'mined'
    ));

    if (scattered) {
      replies.push(`“Keep an eye out for ${resource.label} around this ${BIOME_LABELS[biome]}. It lies loose, so walking across a bundle tucks it into your scrapbook.”`);
    } else if (trimmed) {
      const toolId = toolsInFamily('scissors')
        .find((candidate) => TOOL_DEFS[candidate].tier >= trimmed.minimumTier);
      const treeName = trimmed.species === 'redwood' ? 'a living redwood' : SPECIES_NAMES[trimmed.species].many;
      const hurtNoun = SPECIES_FORM[trimmed.species] === 'tree' ? 'the tree' : 'it one bit';
      replies.push(`“To gather ${resource.label} from ${treeName} here, use ${toolId ? TOOL_DEFS[toolId].name : 'scissors'}. It takes new growth without hurting ${hurtNoun}.”`);
    } else if (dug) {
      const toolId = toolsInFamily('shovel')
        .find((candidate) => TOOL_DEFS[candidate].tier >= dug.layer);
      replies.push(`“There is ${resource.label} under the ${BIOME_LABELS[biome]}. ${toolId ? TOOL_DEFS[toolId].name : `a tier-${dug.layer} shovel`} reaches that paper layer.”`);
    } else if (mined) {
      const toolId = toolsInFamily('pickaxe')
        .find((candidate) => TOOL_DEFS[candidate].tier >= mined.minimumTier);
      replies.push(`“The rock formations around this ${BIOME_LABELS[biome]} hold ${resource.label}. Work one with ${toolId ? TOOL_DEFS[toolId].name : 'a mining pick'} and it will slowly reform.”`);
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

/**
 * Push reply lines this critter has used recently to the back of the pool.
 *
 * Repeat advice is the thing the owner most wanted reduced. The pools are
 * already rotated by visit count, but rotation alone still walks straight into
 * a line said two minutes ago. Reordering by recency means a returning player
 * hears the fresh end of the pool first, and only circles back when there is
 * genuinely nothing new left to say. Read-only on purpose — nothing is marked
 * as "said" until the player actually reads it, in `resolveConversationChoice`.
 */
function deprioritizeRecent(pool: string[], critterId: string, topicKey: string): string[] {
  if (pool.length === 0) return pool;
  const fresh: string[] = [];
  const stale: string[] = [];
  for (const line of pool) {
    (isRecentLine(critterId, `${topicKey}:${stableHash(line).toString(36)}`) ? stale : fresh).push(line);
  }
  return [...fresh, ...stale];
}

/**
 * Tool-ladder advice for wherever the player actually stands.
 *
 * Reads the player's own tool roll and names the next rung in each family in
 * the game's own words (`limitation` from the tool catalog), so a critter
 * explains the ladder the same way the Thing Maker does. Grows itself as the
 * ladder grows.
 */
function buildToolReplies(biome: Biome): string[] {
  const state = getGameState();
  const replies: string[] = [];
  for (const family of TOOL_FAMILY_ORDER) {
    const ladder = toolsInFamily(family);
    const owned = [...ladder].reverse().find((toolId) => (state.player.tools[toolId] ?? 0) > 0) ?? null;
    if (!owned) {
      const first = ladder[0];
      replies.push(`“For ${TOOL_FAMILIES[family].label.toLowerCase()}, a ${TOOL_DEFS[first].name} is the honest place to begin. ${TOOL_DEFS[first].limitation}”`);
      continue;
    }
    const next = ladder.find((toolId) => TOOL_DEFS[toolId].tier > TOOL_DEFS[owned].tier);
    if (next) {
      replies.push(`“Your ${TOOL_DEFS[owned].name} is doing fine work here. When you are ready for more, a ${TOOL_DEFS[next].name} would open things up: ${TOOL_DEFS[next].limitation}”`);
    } else {
      replies.push(`“Your ${TOOL_DEFS[owned].name} is as far up that ladder as anyone has got. Nothing better exists yet, which I find restful.”`);
    }
  }
  const local = localMaterialReplies(biome);
  if (local.length > 0) replies.push(local[0]);
  return replies;
}

/**
 * A gentle "what next" built from the knowledge tree's own available nodes.
 *
 * "Available" here is `techNodeStatus` — prerequisites already met, not yet
 * learned — which is precisely the next step the owner wanted critters to
 * nudge. Nothing is promised that the tree does not already offer.
 */
function buildNextStepReplies(): string[] {
  const state = getGameState();
  const replies: string[] = [];
  for (const nodeId of TECH_NODE_ORDER) {
    if (replies.length >= 3) break;
    const node = TECH_DEFS[nodeId as TechNodeId];
    if (!node || node.readiness !== 'ready') continue;
    if (techNodeStatus(nodeId as TechNodeId, state) !== 'available') continue;
    replies.push(`“The Professor could walk you through ${node.name} — ${node.summary.toLowerCase()} It takes ${formatLearningDuration(node.learningHours)}, or less if you keep your hands busy while you wait.”`);
  }
  if (replies.length === 0) {
    replies.push('“You have learned everything close to hand. Wander a page or two and ask whoever lives there what they know — the tree grows outward, not just upward.”');
  }
  return replies;
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
        rememberReplyContext: { pageId: context.pageId, kind },
        journalKind: kind,
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
    pageId: context.pageId,
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
    pageId: context.pageId,
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
    if (choice.replyPool === 'trait') {
      replies = deprioritizeRecent(CONTENT.everyday.traitReplies[primaryTrait], critter.id, 'trait');
    }
    if (choice.replyPool === 'place') replies = placeKnowledgeReplies(context, primaryTrait);
    if (choice.replyPool === 'self') {
      replies = deprioritizeRecent(CONTENT.everyday.selfReplies[critter.species], critter.id, 'self');
    }
    if (choice.replyPool === 'tool') replies = deprioritizeRecent(buildToolReplies(context.biome), critter.id, 'tool');
    if (choice.replyPool === 'next') replies = deprioritizeRecent(buildNextStepReplies(), critter.id, 'next');
    const followUps = choice.replyPool === 'place'
      ? placeKnowledgeFollowUps(context, primaryTrait)
      : choice.followUps;
    const journalKind = choice.journalKind ?? choice.replyPool;
    return fillChoice({ ...choice, replies: replies ?? ['...'], followUps, journalKind }, critter, context);
  });
  return {
    id: 'everyday',
    pageId: context.pageId,
    opening: fillTemplate(pickLine(CONTENT.everyday.greetings[critter.species], memory.visits + seen), critter, context),
    choices: [...residentChoices(critter), ...choices, goodbyeChoice()],
  };
}

/** Chisel's authored id — he keeps the mill counter. */
const CHISEL_ID = '-2,0#woodchuck';

/** Things only a particular resident can offer, placed first in the menu. */
function residentChoices(critter: Critter): ConversationChoice[] {
  if (critter.id !== CHISEL_ID) return [];
  return [{
    id: 'mill-counter',
    label: 'Could you refine some materials for me?',
    replies: [
      '“Always. Let us see what you brought.”',
      '“Raw in, refined out. Step up to the counter.”',
      '“I was hoping you would ask. The cutter gets bored.”',
    ],
    replyMode: 'random',
    action: 'open-mill',
  }];
}

/**
 * A way to say goodbye from inside the conversation, not only the × button —
 * keyboard and screen-reader players should never have to hunt for the exit.
 */
function goodbyeChoice(): ConversationChoice {
  return {
    id: 'goodbye',
    label: 'See you later',
    replies: [
      '“See you soon!”',
      '“Come back anytime. I will probably be right about here.”',
      '“Bye for now! Mind the loose twigs.”',
      '“Until next time.”',
      '“Off you go, then. Say hello to the trees for me.”',
    ],
    replyMode: 'random',
    action: 'goodbye',
    endsScene: true,
  };
}

const SOMETHING_ELSE: ConversationChoice = {
  id: 'back',
  label: 'Let’s talk about something else',
  replies: ['“Of course. What else is on your mind?”', '“Sure! Ask me anything.”', '“Mm-hm. What next?”'],
  replyMode: 'random',
  returnToEveryday: true,
};

const TELL_ME_MORE = 'Tell me more about that';

/**
 * What to show after a choice that neither ends the scene nor leads into
 * written follow-ups.
 *
 * This used to be *nothing*: the same buttons stayed on screen, so asking a
 * question looked like it had not registered, and storylets whose questions
 * all stayed open had no way out except the × button. Now:
 * - a one-off question disappears once asked;
 * - a repeatable knowledge topic stays, relabelled "Tell me more about that",
 *   because asking again genuinely gives the next fact;
 * - every scene except the everyday menu gets a "something else" route back,
 *   and an everyday menu that runs out refreshes itself.
 */
function continueScene(
  critter: Critter,
  scene: ConversationScene,
  choice: ConversationChoice,
  reply: string,
): ConversationScene {
  // A favour being offered or handed in keeps its own tight set of answers.
  if (scene.id.startsWith('quest-offer:') || scene.id.startsWith('quest-turnin:')) {
    return { ...scene, opening: reply, choices: scene.choices.filter((candidate) => candidate.id !== choice.id) };
  }
  const repeatable = choice.replies.length > 1 && Boolean(choice.rememberReplyAs || choice.journalKind);
  const choices = scene.choices.flatMap((candidate): ConversationChoice[] => {
    const base = candidate.baseLabel ?? candidate.label;
    if (candidate.id !== choice.id) return [{ ...candidate, label: base, baseLabel: base }];
    return repeatable ? [{ ...candidate, label: TELL_ME_MORE, baseLabel: base }] : [];
  });
  const substantive = choices.filter((candidate) => !candidate.returnToEveryday && candidate.action !== 'goodbye');
  if (scene.id === 'everyday' && substantive.length === 0) {
    return { ...everydayConversation(critter), opening: reply };
  }
  if (scene.id !== 'everyday' && !choices.some((candidate) => candidate.returnToEveryday)) {
    choices.push(SOMETHING_ELSE);
  }
  return { ...scene, opening: reply, choices };
}

// --- Quest scenes ----------------------------------------------------------

function questObjectivesLine(quest: QuestDef): string {
  const parts = quest.objectives.map((objective) => describeObjective(objective));
  return parts.length === 1
    ? `“Just the one thing: ${parts[0]}.”`
    : `“${parts.join(', then ')}. That is the whole of it.”`;
}

function questOfferScene(
  critter: Critter,
  quest: QuestDef,
  memory: ConversationMemory,
  context: ConversationContext,
): ConversationScene {
  return {
    id: `quest-offer:${quest.id}`,
    pageId: context.pageId,
    storyArc: `A favour: ${quest.title}`,
    opening: fillTemplate(pickLine(quest.opening, memory.visits), critter, context),
    choices: [
      {
        id: 'accept',
        label: fillTemplate(quest.acceptLabel, critter, context),
        replies: quest.acceptReply.map((line) => fillTemplate(line, critter, context)),
        questAction: 'accept',
        questId: quest.id,
        friendship: 1,
        endsScene: true,
      },
      {
        id: 'details',
        label: 'What exactly do you need?',
        replies: [fillTemplate(questObjectivesLine(quest), critter, context)],
        endsScene: false,
      },
      {
        id: 'decline',
        label: fillTemplate(quest.declineLabel ?? 'Not right now', critter, context),
        replies: (quest.declineReply ?? ['“No rush at all.”']).map((line) => fillTemplate(line, critter, context)),
        questAction: 'decline',
        questId: quest.id,
        endsScene: true,
      },
    ],
  };
}

function questProgressScene(
  critter: Critter,
  quest: QuestDef,
  memory: ConversationMemory,
  context: ConversationContext,
): ConversationScene {
  const progress = questProgress(critter.id);
  const remaining = progress ? progress.lines.filter((line) => !line.done).map((line) => line.text) : [];
  const summary = remaining.length === 0
    ? '“You have done every part of it. Whenever you are ready.”'
    : `“What is still needed: ${remaining.join(', and ')}.”`;
  return {
    id: `quest-progress:${quest.id}`,
    pageId: context.pageId,
    storyArc: `A favour: ${quest.title}`,
    opening: fillTemplate(pickLine(quest.progressOpening, memory.visits), critter, context),
    choices: [
      { id: 'remind', label: 'Remind me what you needed?', replies: [summary], endsScene: false },
      { id: 'back', label: 'Let’s talk about something else', replies: ['“Of course.”'], returnToEveryday: true },
    ],
  };
}

function questTurnInScene(
  critter: Critter,
  quest: QuestDef,
  memory: ConversationMemory,
  context: ConversationContext,
): ConversationScene {
  return {
    id: `quest-turnin:${quest.id}`,
    pageId: context.pageId,
    storyArc: `A favour: ${quest.title}`,
    opening: fillTemplate(pickLine(quest.turnInOpening, memory.visits), critter, context),
    choices: [
      {
        id: 'turnin',
        label: quest.tier === 'odyssey' ? 'Here it is, as promised' : 'Here you go',
        replies: quest.turnInReply.map((line) => fillTemplate(line, critter, context)),
        questAction: 'turn-in',
        questId: quest.id,
        friendship: 2,
        endsScene: true,
      },
      { id: 'later', label: 'In a moment', replies: ['“Whenever you like.”'], returnToEveryday: true },
    ],
  };
}

const TOPIC_LABELS: Record<string, string> = {
  materials: 'the materials around here',
  harvest: 'what grows here',
  wayfinding: 'the places nearby',
  fun: 'why this place is special',
  tool: 'the tools you carry',
  next: 'what to learn next',
  self: 'myself',
  trait: 'how I am, generally',
  place: 'this place',
};

/**
 * A critter picking a thread back up on a later visit.
 *
 * This is the "if Scraps told me something yesterday, they have more to add
 * today" mechanic. The line comes from the content file's `continuations`
 * section (keyed by what the thread was about), and the follow-up questions
 * are the same local-knowledge threads used everywhere else — so returning to
 * a topic always leads somewhere useful rather than just repeating it.
 */
function continuationScene(
  critter: Critter,
  thread: ConversationJournalEntry,
  context: ConversationContext,
): ConversationScene {
  const lines = CONTENT.continuations?.[thread.kind] ?? CONTENT.continuations?.place ?? [];
  const opening = lines.length > 0
    ? fillTemplate(
      pickLine(lines, stableHash(thread.id)).replaceAll('{{lastTopic}}', TOPIC_LABELS[thread.kind] ?? 'this place'),
      critter,
      context,
    )
    : '“I kept thinking about what I told you. I noticed something new, if you have a moment.”';
  return {
    id: `continuation:${thread.id}`,
    pageId: context.pageId,
    storyArc: 'Something I meant to add',
    opening,
    choices: placeKnowledgeFollowUps(context, critter.params.personality[0]),
  };
}

/**
 * Whether to actually put a favour to the player this visit.
 *
 * Quests should feel like a moment, not a pop-up on every greeting. Visits are
 * seeded so the same visit replays the same way, and a player is never asked
 * before they have properly met the animal.
 */
function wantsToAsk(critterId: string, visits: number): boolean {
  if (visits < 3) return false;
  return (stableHash(`${critterId}:ask:${visits}`) % 100) < 60;
}

export function beginCritterConversation(critter: Critter): ConversationScene {
  const memory = beginConversationVisit(critter.id);
  const context = getContext(critter);
  noteMetCritter(critter.id, critter.params.name, critter.species);
  refreshQuest(critter.id);

  // 1. A favour already in flight outranks everything: hand it in, or be
  //    reminded of it, before any new small talk.
  const activeEntry = activeQuestDefFor(critter.id);
  if (activeEntry) {
    return hasTurnInReady(critter.id)
      ? questTurnInScene(critter, activeEntry.quest, memory, context)
      : questProgressScene(critter, activeEntry.quest, memory, context);
  }

  // 2. A critter with something to ask, if it is the right visit for it.
  const offered = selectQuestFor(critter, context.biome);
  if (offered && wantsToAsk(critter.id, memory.visits)) {
    return questOfferScene(critter, offered, memory, context);
  }

  // 3. A thread left hanging from an earlier sitting.
  const thread = takeContinuableThread(critter.id);
  if (thread) return continuationScene(critter, thread, context);

  // 4. A story arc in progress (multi-part chains, a named resident's
  //    plot) still takes precedence, highest priority first — those are
  //    sequences, and a sequence has to pick up where it left off.
  const eligible = CONTENT.storylets.filter((storylet) => isEligible(storylet, critter, memory, context));
  const arc = eligible
    .filter((storylet) => (storylet.priority ?? 0) >= ARC_PRIORITY)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id))[0];
  if (arc) return fromStorylet(arc, critter, memory, context);

  // 5. Growing closer outranks small talk.
  const milestone = relationshipMilestone(critter, memory, context);
  if (milestone) return milestone;

  // 6. Everything else is a weighted draw, not a leaderboard. Picking the
  //    single highest-priority storylet meant every stranger in a biome
  //    without its own knowledge scene opened on the same tool-ladder
  //    lecture (`ladder-hammer-build`, first alphabetically at priority 28).
  return pickOpening(critter, memory, context, eligible);
}

/** Storylets at or above this priority are sequential arcs, never drawn at random. */
const ARC_PRIORITY = 50;
/** Teaching scenes that make a poor first hello. */
const LESSON_PREFIXES = ['ladder-', 'maker-refining'];
/** How strongly the plain everyday chat (species greeting + menu) competes. */
const EVERYDAY_WEIGHT = 30;
const FIRST_MEETING_EVERYDAY_WEIGHT = 45;

function pickOpening(
  critter: Critter,
  memory: ConversationMemory,
  context: ConversationContext,
  eligible: Storylet[],
): ConversationScene {
  const firstMeeting = memory.visits <= 1;
  const options: Array<{ weight: number; scene: () => ConversationScene }> = [
    {
      weight: firstMeeting ? FIRST_MEETING_EVERYDAY_WEIGHT : EVERYDAY_WEIGHT,
      scene: () => everydayConversation(critter),
    },
  ];
  for (const storylet of eligible) {
    if (firstMeeting && LESSON_PREFIXES.some((prefix) => storylet.id.startsWith(prefix))) continue;
    // Priority still matters — it is now how *likely* a scene is, and a scene
    // already seen gets rarer each time, so a critter works through its
    // repertoire instead of repeating a favourite.
    const seen = memory.seen[storylet.id] ?? 0;
    const weight = Math.max(4, storylet.priority ?? 10) / (1 + seen * 2);
    options.push({ weight, scene: () => fromStorylet(storylet, critter, memory, context) });
  }
  const total = options.reduce((sum, option) => sum + option.weight, 0);
  // Seeded by critter and visit, like everything else in conversation: the
  // same visit replays the same way after a reload.
  let roll = (stableHash(`${critter.id}:opening:${memory.visits}`) % 10_000) / 10_000 * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option.scene();
  }
  return options[0].scene();
}

export function resolveConversationChoice(
  critter: Critter,
  scene: ConversationScene,
  choice: ConversationChoice,
): ChoiceResult {
  const seen = markConversationSeen(critter.id, `${scene.id}:${choice.id}`);
  if (choice.addFlags) addConversationFlags(critter.id, choice.addFlags);
  if (choice.friendship) addFriendshipPoints(critter.id, choice.friendship);
  let reply = pickConversationLine(
    choice.replies,
    seen,
    choice.replyMode,
    `${critter.id}:${scene.id}:${choice.id}`,
  );
  // Remember what was actually said, so the next visit can open on it and the
  // same line is not served twice in a row.
  noteRecentLine(critter.id, `${choice.journalKind ?? 'line'}:${stableHash(reply).toString(36)}`);
  if (choice.journalKind) {
    recordJournalEntry({
      id: `${critter.id}:${scene.id}:${choice.id}:${seen}`,
      critterId: critter.id,
      kind: choice.journalKind,
      text: reply,
      pageId: choice.rememberReplyContext?.pageId ?? scene.pageId ?? '',
    });
    endConversationVisit(critter.id);
  }
  if (choice.questAction) {
    const questId = choice.questId ?? activeQuestDefFor(critter.id)?.quest.id;
    if (questId) {
      if (choice.questAction === 'accept') acceptQuest(critter.id, questId);
      else if (choice.questAction === 'decline') declineQuest(critter.id, questId);
      else {
        const result = completeQuest(critter.id);
        if (result) reply = `${reply}  (You tuck ${result.trinketLabel} into your pocket.)`;
      }
    }
  }
  if (choice.rememberReplyAs) {
    const replyIndex = choice.replies.indexOf(reply);
    const flagKey = `${choice.rememberReplyAs}:${Math.max(0, replyIndex)}`;
    addConversationFlags(critter.id, [flagKey]);
    if (choice.rememberReplyContext) {
      recordDiaryEntry({
        id: flagKey,
        critterId: critter.id,
        speakerName: critter.params?.name,
        pageId: choice.rememberReplyContext.pageId,
        kind: choice.rememberReplyContext.kind,
        text: reply,
      });
    }
  }
  let nextScene: ConversationScene | undefined;
  if (choice.followUps?.length) {
    nextScene = {
      id: `${scene.id}:${choice.id}`,
      ...(scene.pageId ? { pageId: scene.pageId } : {}),
      opening: reply,
      choices: choice.followUps,
      storyArc: scene.storyArc,
    };
  } else if (choice.returnToEveryday) {
    nextScene = { ...everydayConversation(critter), opening: reply };
  } else if (!choice.endsScene) {
    nextScene = continueScene(critter, scene, choice, reply);
  }
  return {
    action: choice.action,
    endsScene: choice.endsScene ?? false,
    nextScene,
    reply,
  };
}
