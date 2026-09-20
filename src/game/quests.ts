import { createRng } from '../core/math';
import {
  getGameState,
  setActiveQuestValidator,
  updateGameState,
  type ActiveQuestState,
  type GameState,
  type QuestLogState,
} from '../sim/state';
import { isTechNodeOwned } from '../sim/catalogs/techTree';
import {
  allQuestDefs,
  describeObjective,
  getQuestDef,
  objectiveReach,
  questHasWork,
  questReachable,
  type QuestDef,
  type QuestObjective,
  type QuestTier,
} from '../sim/catalogs/quests';
import { TOOL_DEFS, toolsInFamily, type ToolId } from '../sim/catalogs/tools';
import { getTrinketDef } from '../sim/catalogs/trinkets';
import { addFriendshipPoints, getFriendshipLevel, type FriendshipLevel } from './friendship';
import { grantTrinket } from './trinkets';
import type { Critter } from './critterBehavior';
import type { Biome } from '../world/types';

/**
 * The critter side-quest runtime.
 *
 * The catalog (`sim/catalogs/quests.ts`) owns *what a quest is*; this module
 * owns *the state of the ones in flight*: when a critter may offer one, how a
 * player's progress is measured, and what happens when it is turned in.
 *
 * Progress is measured, not hooked. Every objective has a `measure` derived
 * from the live save, and satisfaction is `satisfied[i] || measure >= baseline
 * + target`, with `satisfied` latching true. That means a quest cannot be
 * broken by the player spending a material or moving a bench after the fact,
 * and it means no command has to remember to tell the quest system anything —
 * talking to the giver is always enough to see how it is going.
 */

const FRIENDSHIP_RANK: Record<FriendshipLevel, number> = {
  stranger: 0, curious: 1, friend: 2, buddy: 3, pet: 4,
};

/** Odyssey quests need a player who has actually been playing. */
const ODYSSEY_COMPLETED_REQUESTS = 5;
/** A critter will not immediately re-offer after a decline or a turn-in. */
const OFFER_COOLDOWN_MS = 3 * 60 * 1000;

function emptyLog(): QuestLogState {
  return { active: {}, completed: [], completedByCritter: {}, offered: {}, cooldownUntil: {} };
}

export function getQuestLog(): QuestLogState {
  return getGameState().player.quests ?? emptyLog();
}

function mutateLog(mutator: (log: QuestLogState) => void) {
  updateGameState((state) => {
    state.player.quests ??= emptyLog();
    mutator(state.player.quests);
  });
}

// --- Objective measurement -------------------------------------------------

/** The tool a `craftTool` objective is really asking for. */
export function craftToolTarget(objective: Extract<QuestObjective, { kind: 'craftTool' }>): ToolId | null {
  const ladder = toolsInFamily(objective.family);
  const tier = objective.tier;
  if (tier !== undefined) return ladder.find((toolId) => TOOL_DEFS[toolId].tier >= tier) ?? null;
  return ladder[0] ?? null;
}

/** How many of a thing the player has, in whatever units the objective counts. */
export function objectiveMeasure(objective: QuestObjective, state: GameState): number {
  switch (objective.kind) {
    case 'collect':
    case 'harvest':
      return state.player.inventory[objective.resource] ?? 0;
    case 'craft':
      return state.world.thingMaker.completedOutputs.filter((id) => id === objective.recipeId).length;
    case 'refine':
      return state.player.refinedCounts[objective.resource] ?? 0;
    case 'craftTool': {
      const target = craftToolTarget(objective);
      return target && (state.player.tools[target] ?? 0) > 0 ? 1 : 0;
    }
    case 'learnTech':
      return isTechNodeOwned(objective.nodeId, state) ? 1 : 0;
    case 'plant': {
      let count = 0;
      for (const page of Object.values(state.world.pages)) {
        for (const edit of Object.values(page.terrainEdits)) {
          if (edit.plantedSeedId === objective.seedId) count += 1;
        }
      }
      return count;
    }
    case 'visitBiome':
      return state.player.visitedBiomes.includes(objective.biome) ? 1 : 0;
    case 'visitPage':
      return state.player.visitedPages.includes(objective.pageId) ? 1 : 0;
    case 'dig': {
      let layers = 0;
      for (const page of Object.values(state.world.pages)) {
        for (const edit of Object.values(page.terrainEdits)) {
          layers += edit.revealedLayers.filter((layer) => layer.layer === objective.layer).length;
        }
      }
      return layers;
    }
    case 'trim': {
      // Only trims of the *asked-for* species count. Tree records made before
      // the species field existed carry none, so they cannot be claimed for a
      // specific species — which is the truthful reading of an old save.
      let trims = 0;
      for (const page of Object.values(state.world.pages)) {
        for (const record of Object.values(page.treeGrowth)) {
          if (record.species === objective.species) trims += record.trims ?? 0;
        }
      }
      return trims;
    }
    case 'talk': {
      const met = state.player.metCritters.includes(objective.critterId)
        || Object.values(state.player.metCritterSpecies ?? {}).includes(objective.critterId);
      return met ? 1 : 0;
    }
    case 'place': {
      let count = 0;
      for (const page of Object.values(state.world.pages)) {
        for (const piece of Object.values(page.placedPieces)) {
          if (piece.templateKey === objective.templateKey) count += 1;
        }
      }
      return count;
    }
    case 'deliver':
      return state.player.items[objective.itemId] ?? 0;
  }
}

/** How many more the objective needs beyond its baseline. */
function objectiveTarget(objective: QuestObjective): number {
  switch (objective.kind) {
    case 'collect':
    case 'harvest':
      return objective.quantity;
    default:
      return 1;
  }
}

// --- In-flight quests ------------------------------------------------------

export function getActiveQuestFor(critterId: string): ActiveQuestState | null {
  return getQuestLog().active[critterId] ?? null;
}

export function activeQuestDefFor(critterId: string): { active: ActiveQuestState; quest: QuestDef } | null {
  const active = getActiveQuestFor(critterId);
  if (!active) return null;
  const quest = getQuestDef(active.questId);
  return quest ? { active, quest } : null;
}

/**
 * Re-check every objective of a quest against the current save and latch any
 * newly-satisfied ones. Cheap and idempotent; safe to call on every visit.
 */
export function refreshQuest(critterId: string): void {
  const state = getGameState();
  const active = state.player.quests?.active?.[critterId];
  const quest = active ? getQuestDef(active.questId) : null;
  if (!active || !quest) return;

  // A quest whose objective list changed shape since it was accepted (a
  // content update, not a player action) has baselines that no longer line up
  // with its goals. Re-baseline rather than satisfy the wrong things: treat
  // whatever is already true as done, and start counting the rest from now.
  const shapeChanged = active.baselines.length !== quest.objectives.length
    || active.satisfied.length !== quest.objectives.length;
  if (shapeChanged) {
    const fresh = baselinesFor(quest, state);
    mutateLog((log) => {
      const record = log.active[critterId];
      if (!record) return;
      record.baselines = fresh.baselines;
      record.satisfied = fresh.satisfied;
    });
    return;
  }

  const nextSatisfied = quest.objectives.map((objective, index) => {
    if (active.satisfied[index]) return true;
    const baseline = active.baselines[index] ?? 0;
    return objectiveMeasure(objective, state) >= baseline + objectiveTarget(objective);
  });
  if (nextSatisfied.every((value, index) => value === Boolean(active.satisfied[index]))) return;
  mutateLog((log) => {
    const record = log.active[critterId];
    if (record) record.satisfied = nextSatisfied;
  });
}

export function refreshAllQuests(): void {
  for (const critterId of Object.keys(getQuestLog().active)) refreshQuest(critterId);
}

export function isQuestComplete(critterId: string): boolean {
  const entry = activeQuestDefFor(critterId);
  if (!entry) return false;
  return entry.quest.objectives.every((_, index) => Boolean(entry.active.satisfied[index]));
}

export function questProgress(critterId: string): {
  done: number;
  total: number;
  lines: Array<{ text: string; done: boolean }>;
} | null {
  const entry = activeQuestDefFor(critterId);
  if (!entry) return null;
  const lines = entry.quest.objectives.map((objective, index) => ({
    text: describeObjective(objective),
    done: Boolean(entry.active.satisfied[index]),
  }));
  return { done: lines.filter((line) => line.done).length, total: lines.length, lines };
}

function baselinesFor(quest: QuestDef, state: GameState): { baselines: number[]; satisfied: boolean[] } {
  return {
    baselines: quest.objectives.map((objective) => objectiveMeasure(objective, state)),
    satisfied: quest.objectives.map((objective) => objectiveReach(objective, state) === 'done'),
  };
}

export function acceptQuest(critterId: string, questId: string, now = Date.now()): boolean {
  const quest = getQuestDef(questId);
  if (!quest) return false;
  if (getQuestLog().active[critterId]) return false;
  const state = getGameState();
  const { baselines, satisfied } = baselinesFor(quest, state);
  mutateLog((log) => {
    log.active[critterId] = { questId, giverId: critterId, acceptedAt: now, baselines, satisfied, step: 0 };
    log.offered[questId] = log.offered[questId] ?? 0;
  });
  return true;
}

export function declineQuest(critterId: string, questId: string, now = Date.now()): void {
  mutateLog((log) => {
    log.offered[questId] = (log.offered[questId] ?? 0) + 1;
    log.cooldownUntil[critterId] = now + OFFER_COOLDOWN_MS;
  });
}

/**
 * Turn in a finished quest: mark it done, grant friendship and a trinket.
 *
 * The trinket is chosen against the player's *current* bag, so the reward is
 * always something they do not already have. See `trinkets.ts`.
 */
export function completeQuest(critterId: string, now = Date.now()): { quest: QuestDef; trinketLabel: string } | null {
  const entry = activeQuestDefFor(critterId);
  if (!entry) return null;
  const { quest } = entry;
  if (!quest.objectives.every((_, index) => Boolean(entry.active.satisfied[index]))) return null;

  const state = getGameState();
  const speakerName = state.player.metCritterNames[critterId];
  const trinket = grantTrinket({
    family: quest.reward.trinketFamily,
    ...(quest.reward.trinketShapes ? { shapes: quest.reward.trinketShapes } : {}),
    ...(quest.reward.trinketTag ? { tag: quest.reward.trinketTag } : {}),
    seed: Math.floor(now / 1000) ^ quest.id.length,
    source: `quest:${quest.id}`,
    ...(speakerName ? { fromName: speakerName } : {}),
  });

  addFriendshipPoints(critterId, quest.reward.friendship);
  mutateLog((log) => {
    delete log.active[critterId];
    if (!log.completed.includes(quest.id)) log.completed.push(quest.id);
    const byCritter = log.completedByCritter[critterId] ??= [];
    if (!byCritter.includes(quest.id)) byCritter.push(quest.id);
    log.offered[quest.id] = (log.offered[quest.id] ?? 0) + 1;
    log.cooldownUntil[critterId] = now + OFFER_COOLDOWN_MS;
  });
  const label = trinket ? getTrinketDef(trinket.defId)?.label ?? 'a trinket' : 'a trinket';
  return { quest, trinketLabel: label };
}

// --- World knowledge -------------------------------------------------------

/**
 * Record that the player has stood on a page. Called from the streaming loop,
 * so "visit the forest" quests resolve the moment the page arrives underfoot.
 */
export function noteVisitedPage(pageId: string, biome: Biome): void {
  const state = getGameState();
  const knowPage = state.player.visitedPages.includes(pageId);
  const knowBiome = state.player.visitedBiomes.includes(biome);
  if (knowPage && knowBiome) return;
  updateGameState((draft) => {
    if (!draft.player.visitedPages.includes(pageId)) {
      draft.player.visitedPages.push(pageId);
      draft.player.travelLog.unshift({
        id: `travel:${pageId}`,
        pageId,
        biome,
        at: Date.now(),
      });
      if (draft.player.travelLog.length > 400) draft.player.travelLog.length = 400;
    }
    if (!draft.player.visitedBiomes.includes(biome)) draft.player.visitedBiomes.push(biome);
  });
}

/** Remember a critter the player has spoken with, for delivery quests. */
export function noteMetCritter(critterId: string, name: string, species: string): void {
  const state = getGameState();
  if (
    state.player.metCritters.includes(critterId)
    && state.player.metCritterNames[critterId] === name
    && state.player.metCritterSpecies[critterId] === species
  ) return;
  updateGameState((draft) => {
    if (!draft.player.metCritters.includes(critterId)) draft.player.metCritters.push(critterId);
    draft.player.metCritterNames[critterId] = name;
    draft.player.metCritterSpecies[critterId] = species;
  });
}

// --- Offering --------------------------------------------------------------

const TIER_WEIGHT: Record<QuestTier, number> = { favor: 4, errand: 3, odyssey: 1 };

/**
 * The one quest this critter would ask for right now, or null.
 *
 * Deliberately conservative: `stranger` never offers (the first meeting stays
 * general, as the owner asked), a critter holds one quest at a time, recent
 * declines cool off, and odysseys wait until the player has finished a fistful
 * of smaller errands.
 */
export function selectQuestFor(critter: Critter, biome: Biome, now = Date.now()): QuestDef | null {
  const state = getGameState();
  const log = getQuestLog();
  const level = getFriendshipLevel(critter.id);
  if (level === 'stranger') return null;
  if (log.active[critter.id]) return null;
  if ((log.cooldownUntil[critter.id] ?? 0) > now) return null;

  const completedByCritter = log.completedByCritter[critter.id] ?? [];
  const completedCount = log.completed.length;

  const candidates = allQuestDefs().filter((quest) => {
    if (log.completed.includes(quest.id)) return false;
    if (completedByCritter.includes(quest.id)) return false;
    if (FRIENDSHIP_RANK[level] < FRIENDSHIP_RANK[quest.minFriendship]) return false;
    if (quest.giverSpecies && !quest.giverSpecies.includes(critter.species)) return false;
    if (quest.giverPersonalities
      && !quest.giverPersonalities.some((trait) => critter.params.personality.includes(trait))) return false;
    if (quest.giverCritterIds && !quest.giverCritterIds.includes(critter.id)) return false;
    if (quest.biomes && !quest.biomes.includes(biome)) return false;
    if (quest.requiresQuests && !quest.requiresQuests.every((id) => log.completed.includes(id))) return false;
    if (quest.tier === 'odyssey' && completedCount < ODYSSEY_COMPLETED_REQUESTS) return false;
    if (quest.exclusivityGroup
      && Object.values(log.active).some((active) => getQuestDef(active.questId)?.exclusivityGroup === quest.exclusivityGroup)) {
      return false;
    }
    if (!questReachable(quest, state)) return false;
    if (!questHasWork(quest, state)) return false;
    return true;
  });
  if (candidates.length === 0) return null;

  // Deterministic-but-varied pick: random enough that two players see different
  // offers, stable enough that re-opening the same conversation is not a
  // different quest every frame.
  const rng = createRng(stableHash(`${critter.id}:${log.completed.length}:${completedByCritter.length}:${now >> 16}`));
  const total = candidates.reduce((sum, quest) => sum + (quest.weight ?? TIER_WEIGHT[quest.tier]), 0);
  let roll = rng() * total;
  for (const quest of candidates) {
    roll -= (quest.weight ?? TIER_WEIGHT[quest.tier]);
    if (roll <= 0) return quest;
  }
  return candidates[candidates.length - 1];
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** True when the critter is mid-quest and it is ready to be handed in. */
export function hasTurnInReady(critterId: string): boolean {
  const entry = activeQuestDefFor(critterId);
  if (!entry) return false;
  return entry.quest.objectives.every((_, index) => Boolean(entry.active.satisfied[index]));
}

// Teach the save normalizer which quest ids are real, so a save holding a
// quest that has since been renamed or retired drops it instead of leaving the
// giver permanently unable to offer anything again. Registered here (not
// imported from `sim/state`) to avoid a runtime import cycle.
setActiveQuestValidator((questId) => getQuestDef(questId) !== null);
