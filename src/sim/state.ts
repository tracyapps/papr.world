import { RECIPE_DEFS, STARTER_PLAN_IDS, type RecipeId } from './catalogs/recipes';
import { TOOL_DEFS, type ToolId } from './catalogs/tools';
import { RESOURCE_CORE_DEFS, type ResourceId } from './catalogs/resources';
import type { DigDiscovery } from './catalogs/geology';
import { PLANT_STAGE_ORDER, SEED_DEFS, type PlantStage, type SeedId } from './catalogs/seeds';
import { MAX_TREE_GROWTH, type TreeGrowthState, type TreeSpecies } from './catalogs/trees';
import { LIMITS, type MailItem, type PlacedPiece } from '../../shared/src/index';
import type { Biome } from './catalogs/biomes';
import { buildAssemblyDef } from './catalogs/building';
import { createWelcomeMail } from './mail';

export const SAVE_SCHEMA_VERSION = 1;
export const SAVE_STORAGE_KEY = 'pencil-and-paper.game-save.v1';

/**
 * Soft cap on stored diary entries.
 *
 * Shared between the write path (`recordDiaryEntry`) and save normalization,
 * so a save trimmed on load and a save trimmed as it's written agree on the
 * same number.
 */
export const DIARY_ENTRY_LIMIT = 400;

/**
 * Maker account id for pieces placed in solo play.
 *
 * The server assigns durable account ids to networked makers; a solo save has
 * no account, so pieces carry this stable stand-in. It is also a convenient
 * sentinel: anything that is not this string came from another player.
 */
export const LOCAL_MAKER_ID = 'local-player';

export type ConversationMemoryState = {
  flags: string[];
  seen: Record<string, number>;
  visits: number;
  /** Epoch ms of the last conversation — lets a critter say "yesterday". */
  lastChatAt?: number;
  /** Newest first; what this critter has told the player, for continuations. */
  journal?: Array<{ id: string; kind: string; text: string; pageId: string; at: number; continued?: boolean }>;
  /** Recently-used reply line ids, so a critter stops repeating itself. */
  recentLines?: string[];
};

export type SavedPlaceState = {
  id: string;
  name: string;
  x: number;
  z: number;
  builtin: boolean;
};

export type ActiveCraftState = {
  recipeId: RecipeId;
  startedAt: number;
  completesAt: number;
};

/**
 * The one lesson currently moving forward in real-world time.
 *
 * Node ids stay strings at the save boundary so this foundational state
 * module does not import the tech catalog that already depends on GameState.
 * The learning system validates the id against TECH_DEFS before using it.
 */
export type ActiveLearningState = {
  nodeId: string;
  startedAt: number;
  /** Completed-output counts at start, aligned with the node's task list. */
  taskBaselineCounts: number[];
  /** Once earned, a task stays earned even if the player gives its tool away. */
  completedTaskIndexes: number[];
};

export type PageModificationState = {
  terrainEdits: Record<string, TerrainEditCellState>;
  /** One-time material piles made by digging or trimming, waiting in-world. */
  resourceDrops?: Record<string, ResourceDropState>;
  /**
   * Only trees that have actually been cut appear here. An absent key means
   * an untouched, flourishing tree, so a forest page costs nothing to store
   * until someone works it.
   */
  treeGrowth: Record<string, TreeGrowthState>;
  plantedCells: Record<string, unknown>;
  placedEntities: Record<string, unknown>;
  /** Build pieces standing on this page, keyed by piece id. */
  placedPieces: Record<string, PlacedPiece>;
  /** Incomplete multi-step builds, kept so a player can leave and resume. */
  buildSites: Record<string, BuildSiteState>;
};

export type ResourceDropState = {
  id: string;
  resource: ResourceId;
  amount: number;
  x: number;
  z: number;
  createdAt: number;
};

export type BuildSiteState = {
  id: string;
  templateKey: string;
  x: number;
  z: number;
  rotY: number;
  makerId: string;
  page: string;
  completedStepIds: string[];
  startedAt: number;
  changedAt: number;
};

export type TerrainEditCellState = {
  kind: 'dug';
  state: 'dug' | 'planted' | 'mending' | 'filled' | 'raised';
  x: number;
  z: number;
  depth: number;
  /** Persistent height above the original sheet for a landscaped mound. */
  height?: number;
  radius: number;
  toolTier: number;
  geologySeed: number;
  revealedLayers: DigDiscovery[];
  plantedSeedId?: SeedId;
  plantedAt?: number;
  mendsAt?: number;
  /** Fresh fill stays visibly earthy until this time, then reveals biome ground. */
  surfaceRestoresAt?: number;
  lastTendedAt?: number;
  tendCount?: number;
  nextSeedDropAt?: number;
  seedDropReady?: boolean;
  seedDrops?: number;
  /** Last growth stage settled into the quiet activity log. */
  observedStage?: PlantStage;
  changedAt: number;
};

export type ActivityEntry = {
  id: string;
  kind: 'garden' | 'harvest';
  message: string;
  at: number;
};

/**
 * One trinket a player holds.
 *
 * A trinket is a *collectible*, not a resource: it is never sold, never spent,
 * and never stacks. `defId` points at the catalog entry that decides what it
 * looks like (see `sim/catalogs/trinkets.ts`); `seed` is folded in so two
 * trinkets of the same definition still differ slightly. `placed` is the whole
 * of its world presence — null means it is kept on the bio card shelf, set
 * means it is sitting out in the world as decoration.
 */
export type TrinketInstance = {
  id: string;
  defId: string;
  seed: number;
  acquiredAt: number;
  /** Where it came from, e.g. 'quest:favor-first-shiny' or 'critter:0,0#raccoon'. */
  source: string;
  fromName?: string;
  placed: { pageId: string; x: number; z: number; rotY: number } | null;
};

/**
 * One accepted critter quest, in flight.
 *
 * `baselines` and `satisfied` are parallel to the quest's objective list.
 * Baselines snapshot the measuring count at accept time so "collect 3 twigs"
 * means *three more from now*, and `satisfied` latches each objective true so
 * a player who gathers the twigs and then spends them is not asked again.
 */
export type ActiveQuestState = {
  questId: string;
  giverId: string;
  acceptedAt: number;
  baselines: number[];
  satisfied: boolean[];
  step: number;
};

export type QuestLogState = {
  /** Keyed by giver critter id — a critter can hold only one quest at a time. */
  active: Record<string, ActiveQuestState>;
  /** Quest ids ever finished, so a storyline never repeats by accident. */
  completed: string[];
  completedByCritter: Record<string, string[]>;
  /** Times a quest has been offered, for taming the offer rate. */
  offered: Record<string, number>;
  /** Critter id -> epoch ms before which it will not ask again. */
  cooldownUntil: Record<string, number>;
};

/**
 * One thing a critter has told the player, written down like something kept
 * rather than generated.
 *
 * `id` mirrors the conversation-flag key it comes from, so recording is
 * naturally deduplicated the same way `activityLog` entries are. `kind` and
 * `pageId` are carried alongside the flag rather than parsed back out of it,
 * since the flag format is an internal detail of the conversation engine.
 *
 * `note` is a deliberately unused seam for later player-authored annotation
 * (roadmap Phase 2.4) — the game never writes it, and its presence now means
 * that feature will not need a save migration when it lands.
 */
export type DiaryEntry = {
  id: string;
  critterId: string;
  /** Display name at the time of the conversation; absent on older saves. */
  speakerName?: string;
  pageId: string;
  kind: string;
  text: string;
  recordedAt: number;
  note?: string;
};

export type GameState = {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  player: {
    /** Quiet trade currency. It is never treated as a score. */
    chips: number;
    inventory: Partial<Record<ResourceId, number>>;
    tools: Partial<Record<ToolId, number>>;
    items: Record<string, number>;
    plans: RecipeId[];
    equippedTool: ToolId | null;
    selectedSeed: SeedId | null;
    friendships: Record<string, number>;
    conversations: Record<string, ConversationMemoryState>;
    places: SavedPlaceState[];
    nextPlaceNumber: number;
    activeLearning: ActiveLearningState | null;
    /** Newest first; quiet world updates the player can inspect when ready. */
    activityLog: ActivityEntry[];
    /** Newest first; everything a critter has told the player so far. */
    diaryEntries: DiaryEntry[];
    /** Newest first; letters remain after an attachment is collected. */
    mailbox: MailItem[];
    /** Stable mail ids whose attachment has already been taken. */
    claimedMailIds: string[];
    /** Everything the player has been given by a critter, kept or set down. */
    trinkets: TrinketInstance[];
    /** Side quests in flight and finished. See `game/quests.ts`. */
    quests: QuestLogState;
    /** Biomes the player has stood in — drives "explore the next biome" quests. */
    visitedBiomes: Biome[];
    /** Pages the player has walked on, by id. */
    visitedPages: string[];
    /** Critter ids the player has spoken with at least once. */
    metCritters: string[];
    /** Display names of met critters, for message-carrying quests. */
    metCritterNames: Record<string, string>;
    /**
     * Species of every met critter, keyed by critter id.
     *
     * A message-carrying quest may name *a* meerkat rather than one particular
     * animal — "tell a meerkat out in the dunes" is a more natural request
     * than "tell Skrit", and a player cannot be expected to find one specific
     * individual. This is the table that makes "any of that species" possible.
     */
    metCritterSpecies: Record<string, string>;
  };
  world: {
    harvestRespawns: Record<string, number>;
    pages: Record<string, PageModificationState>;
    thingMaker: {
      level: number;
      activeCraft: ActiveCraftState | null;
      /** Every recipe ever finished here. History; drives the Plans page. */
      completedOutputs: string[];
      /**
       * Finished things still sitting on the output tray, waiting to be
       * picked up. Separate from `completedOutputs` because one is a record
       * of what you have made and the other is a pile of objects in the
       * world — collecting clears the pile without erasing the history.
       */
      trayOutputs: string[];
    };
  };
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const listeners = new Set<() => void>();
let cachedState: GameState | null = null;

/**
 * Validation hook for quest ids on load.
 *
 * Registered by `game/quests.ts` at module load rather than imported here, so
 * the foundational state module never has to depend on the quest catalog (and
 * the catalogs it pulls in) — which would be a runtime import cycle. With no
 * validator registered, every quest id is kept, which is the safe default for
 * tests that never load the quest system.
 */
let activeQuestValidator: ((questId: string) => boolean) | null = null;

export function setActiveQuestValidator(validator: ((questId: string) => boolean) | null) {
  activeQuestValidator = validator;
}

function questExists(questId: string): boolean {
  return activeQuestValidator ? activeQuestValidator(questId) : true;
}

export function createDefaultGameState(): GameState {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    player: {
      chips: 0,
      inventory: { 'buttonbloom-seeds': 2, 'mend-me-seeds': 1 },
      tools: {},
      items: {},
      plans: [...STARTER_PLAN_IDS],
      equippedTool: null,
      selectedSeed: null,
      friendships: {},
      conversations: {},
      places: [],
      nextPlaceNumber: 2,
      activeLearning: null,
      activityLog: [],
      diaryEntries: [],
      mailbox: [createWelcomeMail()],
      claimedMailIds: [],
      trinkets: [],
      quests: { active: {}, completed: [], completedByCritter: {}, offered: {}, cooldownUntil: {} },
      visitedBiomes: ['clearing'],
      visitedPages: ['0,0'],
      metCritters: [],
      metCritterNames: {},
      metCritterSpecies: {},
    },
    world: {
      harvestRespawns: {},
      pages: {},
      thingMaker: { level: 1, activeCraft: null, completedOutputs: [], trayOutputs: [] },
    },
  };
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteCounts(value: unknown, maximum = Number.MAX_SAFE_INTEGER) {
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(safeObject(value))) {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
    result[key] = Math.max(0, Math.min(maximum, Math.floor(raw)));
  }
  return result;
}

function normalizeTerrainEdits(value: unknown): Record<string, TerrainEditCellState> {
  const result: Record<string, TerrainEditCellState> = {};
  for (const [cellKey, rawCell] of Object.entries(safeObject(value))) {
    const cell = safeObject(rawCell);
    if (cell.kind !== 'dug') continue;
    if (typeof cell.x !== 'number' || !Number.isFinite(cell.x)) continue;
    if (typeof cell.z !== 'number' || !Number.isFinite(cell.z)) continue;
    if (typeof cell.depth !== 'number' || !Number.isFinite(cell.depth)) continue;
    if (typeof cell.radius !== 'number' || !Number.isFinite(cell.radius)) continue;
    const revealedLayers = Array.isArray(cell.revealedLayers)
      ? cell.revealedLayers.flatMap((rawLayer) => {
        const layer = safeObject(rawLayer);
        if (typeof layer.resource !== 'string' || !(layer.resource in RESOURCE_CORE_DEFS)) return [];
        if (typeof layer.layer !== 'number' || layer.layer < 1 || layer.layer > 3) return [];
        if (typeof layer.quantity !== 'number' || !Number.isFinite(layer.quantity)) return [];
        return [{
          geologySeed: typeof layer.geologySeed === 'number' ? layer.geologySeed : 0,
          layer: Math.floor(layer.layer) as 1 | 2 | 3,
          resource: layer.resource as ResourceId,
          quantity: Math.max(1, Math.floor(layer.quantity)),
        }];
      })
      : [];
    const state = cell.state === 'planted' || cell.state === 'mending'
      || cell.state === 'filled' || cell.state === 'raised' ? cell.state : 'dug';
    result[cellKey] = {
      kind: 'dug',
      state,
      x: cell.x,
      z: cell.z,
      depth: Math.max(0, Math.min(1.5, cell.depth)),
      height: typeof cell.height === 'number' && Number.isFinite(cell.height)
        ? Math.max(0, Math.min(1.5, cell.height)) : undefined,
      radius: Math.max(0.2, Math.min(2.5, cell.radius)),
      toolTier: typeof cell.toolTier === 'number' ? Math.max(1, Math.min(3, Math.floor(cell.toolTier))) : 1,
      geologySeed: typeof cell.geologySeed === 'number' && Number.isFinite(cell.geologySeed) ? cell.geologySeed : 0,
      revealedLayers,
      plantedSeedId: typeof cell.plantedSeedId === 'string' && cell.plantedSeedId in SEED_DEFS
        ? cell.plantedSeedId as SeedId : undefined,
      plantedAt: typeof cell.plantedAt === 'number' && Number.isFinite(cell.plantedAt) ? cell.plantedAt : undefined,
      mendsAt: typeof cell.mendsAt === 'number' && Number.isFinite(cell.mendsAt) ? cell.mendsAt : undefined,
      surfaceRestoresAt: typeof cell.surfaceRestoresAt === 'number' && Number.isFinite(cell.surfaceRestoresAt)
        ? cell.surfaceRestoresAt : undefined,
      lastTendedAt: typeof cell.lastTendedAt === 'number' && Number.isFinite(cell.lastTendedAt) ? cell.lastTendedAt : undefined,
      tendCount: typeof cell.tendCount === 'number' && Number.isFinite(cell.tendCount)
        ? Math.max(0, Math.floor(cell.tendCount)) : 0,
      nextSeedDropAt: typeof cell.nextSeedDropAt === 'number' && Number.isFinite(cell.nextSeedDropAt)
        ? cell.nextSeedDropAt : undefined,
      seedDropReady: Boolean(cell.seedDropReady),
      seedDrops: typeof cell.seedDrops === 'number' && Number.isFinite(cell.seedDrops)
        ? Math.max(0, Math.floor(cell.seedDrops)) : 0,
      observedStage: typeof cell.observedStage === 'string' && PLANT_STAGE_ORDER.includes(cell.observedStage as PlantStage)
        ? cell.observedStage as PlantStage : undefined,
      changedAt: typeof cell.changedAt === 'number' && Number.isFinite(cell.changedAt) ? cell.changedAt : 0,
    };
  }
  return result;
}

function normalizeResourceDrops(value: unknown): Record<string, ResourceDropState> {
  const result: Record<string, ResourceDropState> = {};
  for (const [id, rawDrop] of Object.entries(safeObject(value))) {
    const drop = safeObject(rawDrop);
    if (typeof drop.resource !== 'string' || !(drop.resource in RESOURCE_CORE_DEFS)) continue;
    if (typeof drop.amount !== 'number' || !Number.isFinite(drop.amount) || drop.amount < 1) continue;
    if (typeof drop.x !== 'number' || !Number.isFinite(drop.x)) continue;
    if (typeof drop.z !== 'number' || !Number.isFinite(drop.z)) continue;
    result[id] = {
      id,
      resource: drop.resource as ResourceId,
      amount: Math.max(1, Math.min(999, Math.floor(drop.amount))),
      x: drop.x,
      z: drop.z,
      createdAt: typeof drop.createdAt === 'number' && Number.isFinite(drop.createdAt) ? drop.createdAt : 0,
    };
  }
  return result;
}

/**
 * Tree records are dropped rather than repaired when malformed. A tree with
 * no record reads as flourishing, which is the safe direction to fail: a
 * corrupt save gives the player a whole forest back, never a permanently
 * bald one they cannot fix.
 */
function normalizeTreeGrowth(value: unknown): Record<string, TreeGrowthState> {
  const result: Record<string, TreeGrowthState> = {};
  for (const [treeKey, rawTree] of Object.entries(safeObject(value))) {
    const tree = safeObject(rawTree);
    if (typeof tree.growth !== 'number' || !Number.isFinite(tree.growth)) continue;
    if (typeof tree.trimmedAt !== 'number' || !Number.isFinite(tree.trimmedAt)) continue;
    result[treeKey] = {
      growth: Math.max(0, Math.min(MAX_TREE_GROWTH, tree.growth)),
      trimmedAt: tree.trimmedAt,
      trims: typeof tree.trims === 'number' && Number.isFinite(tree.trims)
        ? Math.max(0, Math.floor(tree.trims)) : 0,
      ...(typeof tree.species === 'string' ? { species: tree.species as TreeSpecies } : {}),
    };
  }
  return result;
}

/**
 * Placed pieces are dropped when malformed, the same way tree records are:
 * a corrupt record is invisible until the player places over its spot, which
 * is the safe direction to fail (a ghost obstruction can never be fixed).
 */
function normalizePlacedPieces(value: unknown): Record<string, PlacedPiece> {
  const result: Record<string, PlacedPiece> = {};
  for (const [id, rawPiece] of Object.entries(safeObject(value))) {
    const piece = safeObject(rawPiece);
    if (typeof piece.templateKey !== 'string' || piece.templateKey.length === 0) continue;
    if (typeof piece.x !== 'number' || !Number.isFinite(piece.x)) continue;
    if (typeof piece.z !== 'number' || !Number.isFinite(piece.z)) continue;
    result[id] = {
      id,
      templateKey: piece.templateKey.slice(0, 64),
      x: piece.x,
      z: piece.z,
      rotY: typeof piece.rotY === 'number' && Number.isFinite(piece.rotY) ? piece.rotY : 0,
      // Absent on saves written before this field existed. An empty string
      // resolves to that piece type's original look — see
      // resolveBuildMaterial in sim/catalogs/building.ts.
      material: typeof piece.material === 'string' ? piece.material.slice(0, 64) : '',
      // ownerId was the pre-protocol-v2 name. Read it once for old solo saves,
      // then every subsequent save writes the durable makerId shape.
      makerId: typeof piece.makerId === 'string'
        ? piece.makerId
        : typeof piece.ownerId === 'string' ? piece.ownerId : LOCAL_MAKER_ID,
      page: typeof piece.page === 'string' ? piece.page : '',
    };
  }
  return result;
}

function normalizeBuildSites(value: unknown): Record<string, BuildSiteState> {
  const result: Record<string, BuildSiteState> = {};
  for (const [id, rawSite] of Object.entries(safeObject(value))) {
    const site = safeObject(rawSite);
    if (typeof site.templateKey !== 'string' || !buildAssemblyDef(site.templateKey)) continue;
    if (typeof site.x !== 'number' || !Number.isFinite(site.x)) continue;
    if (typeof site.z !== 'number' || !Number.isFinite(site.z)) continue;
    const definition = buildAssemblyDef(site.templateKey)!;
    const savedSteps = new Set(Array.isArray(site.completedStepIds)
      ? site.completedStepIds.filter((step): step is string => typeof step === 'string')
      : []);
    // Only a completed prefix is trustworthy. Keeping a later id while an
    // earlier part is missing would let a malformed save jump assembly order.
    const completedStepIds: string[] = [];
    for (const step of definition.steps) {
      if (!savedSteps.has(step.id)) break;
      completedStepIds.push(step.id);
    }
    result[id] = {
      id,
      templateKey: site.templateKey,
      x: site.x,
      z: site.z,
      rotY: typeof site.rotY === 'number' && Number.isFinite(site.rotY) ? site.rotY : 0,
      makerId: typeof site.makerId === 'string'
        ? site.makerId
        : typeof site.ownerId === 'string' ? site.ownerId : LOCAL_MAKER_ID,
      page: typeof site.page === 'string' ? site.page : '',
      completedStepIds,
      startedAt: typeof site.startedAt === 'number' && Number.isFinite(site.startedAt) ? site.startedAt : 0,
      changedAt: typeof site.changedAt === 'number' && Number.isFinite(site.changedAt) ? site.changedAt : 0,
    };
  }
  return result;
}

function normalizePageModifications(value: unknown): Record<string, PageModificationState> {
  const result: Record<string, PageModificationState> = {};
  for (const [pageId, rawPage] of Object.entries(safeObject(value))) {
    const page = safeObject(rawPage);
    result[pageId] = {
      terrainEdits: normalizeTerrainEdits(page.terrainEdits),
      resourceDrops: normalizeResourceDrops(page.resourceDrops),
      treeGrowth: normalizeTreeGrowth(page.treeGrowth),
      plantedCells: safeObject(page.plantedCells),
      placedEntities: safeObject(page.placedEntities),
      placedPieces: normalizePlacedPieces(page.placedPieces),
      buildSites: normalizeBuildSites(page.buildSites),
    };
  }
  return result;
}

function parseJson(storage: StorageLike, key: string): unknown {
  try {
    const value = storage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function normalizeState(value: unknown): GameState | null {
  const raw = safeObject(value);
  if (raw.schemaVersion !== SAVE_SCHEMA_VERSION) return null;
  const player = safeObject(raw.player);
  const world = safeObject(raw.world);
  const maker = safeObject(world.thingMaker);
  const state = createDefaultGameState();

  state.player.chips = typeof player.chips === 'number' && Number.isFinite(player.chips)
    ? Math.max(0, Math.floor(player.chips))
    : 0;

  const inventory = finiteCounts(player.inventory);
  for (const resource of Object.keys(RESOURCE_CORE_DEFS) as ResourceId[]) {
    if (inventory[resource] !== undefined) state.player.inventory[resource] = inventory[resource];
  }
  const tools = finiteCounts(player.tools);
  for (const toolId of Object.keys(TOOL_DEFS) as ToolId[]) {
    if (tools[toolId] !== undefined) state.player.tools[toolId] = tools[toolId];
  }
  state.player.items = finiteCounts(player.items);
  if (Array.isArray(player.plans)) {
    const known = new Set(Object.keys(RECIPE_DEFS) as RecipeId[]);
    state.player.plans = player.plans.filter((id): id is RecipeId => known.has(id as RecipeId));
    for (const starter of STARTER_PLAN_IDS) if (!state.player.plans.includes(starter)) state.player.plans.push(starter);
  }
  state.player.equippedTool = typeof player.equippedTool === 'string'
    && player.equippedTool in TOOL_DEFS
    && (state.player.tools[player.equippedTool as ToolId] ?? 0) > 0
    ? player.equippedTool as ToolId
    : null;
  state.player.selectedSeed = typeof player.selectedSeed === 'string'
    && player.selectedSeed in SEED_DEFS
    && (state.player.inventory[player.selectedSeed as SeedId] ?? 0) > 0
    ? player.selectedSeed as SeedId
    : null;
  state.player.friendships = finiteCounts(player.friendships, 100);
  // Conversation memory is normalized per critter rather than trusted wholesale:
  // a hand-edited or half-written save with `journal: 5` used to crash the
  // continuation lookup the moment the player spoke to that animal.
  state.player.conversations = Object.fromEntries(
    Object.entries(safeObject(player.conversations)).flatMap(([critterId, rawMemory]) => {
      const memory = safeObject(rawMemory);
      const flags = Array.isArray(memory.flags)
        ? memory.flags.filter((flag): flag is string => typeof flag === 'string').slice(0, 400) : [];
      const seen: Record<string, number> = {};
      for (const [key, value] of Object.entries(safeObject(memory.seen))) {
        if (typeof value === 'number' && Number.isFinite(value)) seen[key.slice(0, 160)] = Math.max(0, Math.floor(value));
      }
      const journal = Array.isArray(memory.journal)
        ? memory.journal.flatMap((rawEntry) => {
          const entry = safeObject(rawEntry);
          if (typeof entry.id !== 'string' || typeof entry.kind !== 'string') return [];
          if (typeof entry.text !== 'string' || typeof entry.pageId !== 'string') return [];
          if (typeof entry.at !== 'number' || !Number.isFinite(entry.at)) return [];
          return [{
            id: entry.id.slice(0, 160),
            kind: entry.kind.slice(0, 40),
            text: entry.text.slice(0, 400),
            pageId: entry.pageId.slice(0, 40),
            at: Math.max(0, entry.at),
            ...(entry.continued === true ? { continued: true } : {}),
          }];
        }).slice(0, 12) : [];
      const recentLines = Array.isArray(memory.recentLines)
        ? memory.recentLines.filter((line): line is string => typeof line === 'string').slice(0, 24) : undefined;
      const normalized: ConversationMemoryState = {
        flags,
        seen,
        visits: typeof memory.visits === 'number' && Number.isFinite(memory.visits)
          ? Math.max(0, Math.floor(memory.visits)) : 0,
        ...(typeof memory.lastChatAt === 'number' && Number.isFinite(memory.lastChatAt)
          ? { lastChatAt: Math.max(0, memory.lastChatAt) } : {}),
        ...(journal.length > 0 ? { journal } : {}),
        ...(recentLines && recentLines.length > 0 ? { recentLines } : {}),
      };
      return [[critterId.slice(0, 120), normalized] as [string, ConversationMemoryState]];
    }),
  );
  state.player.places = Array.isArray(player.places)
    ? player.places.filter((place): place is SavedPlaceState => {
      const item = safeObject(place);
      return typeof item.id === 'string' && typeof item.name === 'string'
        && typeof item.x === 'number' && Number.isFinite(item.x)
        && typeof item.z === 'number' && Number.isFinite(item.z);
    }).map((place) => ({ ...place, builtin: Boolean(place.builtin) }))
    : [];
  state.player.nextPlaceNumber = typeof player.nextPlaceNumber === 'number'
    ? Math.max(2, Math.floor(player.nextPlaceNumber)) : 2;
  state.player.activityLog = Array.isArray(player.activityLog)
    ? player.activityLog.flatMap((rawEntry) => {
      const entry = safeObject(rawEntry);
      if (typeof entry.id !== 'string' || typeof entry.message !== 'string') return [];
      if (entry.kind !== 'garden' && entry.kind !== 'harvest') return [];
      if (typeof entry.at !== 'number' || !Number.isFinite(entry.at)) return [];
      return [{
        id: entry.id,
        kind: entry.kind as ActivityEntry['kind'],
        message: entry.message.slice(0, 240),
        at: Math.max(0, entry.at),
      }];
    }).slice(0, 80)
    : [];
  state.player.diaryEntries = Array.isArray(player.diaryEntries)
    ? player.diaryEntries.flatMap((rawEntry) => {
      const entry = safeObject(rawEntry);
      if (typeof entry.id !== 'string' || typeof entry.critterId !== 'string') return [];
      if (typeof entry.pageId !== 'string' || typeof entry.kind !== 'string') return [];
      if (typeof entry.text !== 'string') return [];
      if (typeof entry.recordedAt !== 'number' || !Number.isFinite(entry.recordedAt)) return [];
      const note = typeof entry.note === 'string' ? entry.note.slice(0, 500) : undefined;
      const speakerName = typeof entry.speakerName === 'string'
        ? entry.speakerName.slice(0, 80) : undefined;
      return [{
        id: entry.id,
        critterId: entry.critterId,
        ...(speakerName !== undefined ? { speakerName } : {}),
        pageId: entry.pageId,
        kind: entry.kind,
        text: entry.text.slice(0, 500),
        recordedAt: Math.max(0, entry.recordedAt),
        ...(note !== undefined ? { note } : {}),
      }];
    }).slice(0, DIARY_ENTRY_LIMIT)
    : [];
  state.player.trinkets = Array.isArray(player.trinkets)
    ? player.trinkets.flatMap((rawTrinket) => {
      const trinket = safeObject(rawTrinket);
      if (typeof trinket.id !== 'string' || typeof trinket.defId !== 'string') return [];
      const placed = safeObject(trinket.placed);
      const hasPlacement = typeof placed.pageId === 'string'
        && typeof placed.x === 'number' && Number.isFinite(placed.x)
        && typeof placed.z === 'number' && Number.isFinite(placed.z);
      return [{
        id: trinket.id.slice(0, 80),
        defId: trinket.defId.slice(0, 80),
        seed: typeof trinket.seed === 'number' && Number.isFinite(trinket.seed) ? Math.floor(trinket.seed) : 0,
        acquiredAt: typeof trinket.acquiredAt === 'number' && Number.isFinite(trinket.acquiredAt) ? trinket.acquiredAt : 0,
        source: typeof trinket.source === 'string' ? trinket.source.slice(0, 80) : '',
        ...(typeof trinket.fromName === 'string' ? { fromName: trinket.fromName.slice(0, 80) } : {}),
        placed: hasPlacement
          ? {
            pageId: String(placed.pageId),
            x: placed.x as number,
            z: placed.z as number,
            rotY: typeof placed.rotY === 'number' && Number.isFinite(placed.rotY) ? placed.rotY : 0,
          }
          : null,
      }];
    }).slice(0, 400)
    : [];
  const quests = safeObject(player.quests);
  const activeQuests: Record<string, ActiveQuestState> = {};
  for (const [critterId, rawActive] of Object.entries(safeObject(quests.active))) {
    const active = safeObject(rawActive);
    if (typeof active.questId !== 'string') continue;
    // A quest that no longer exists (renamed, retired) must not stay attached to
    // a critter: it could never be satisfied, and would block that animal from
    // ever offering anything again. Dropping it hands the critter back.
    if (!questExists(active.questId)) continue;
    activeQuests[critterId] = {
      questId: active.questId.slice(0, 80),
      giverId: typeof active.giverId === 'string' ? active.giverId.slice(0, 80) : critterId,
      acceptedAt: typeof active.acceptedAt === 'number' && Number.isFinite(active.acceptedAt) ? active.acceptedAt : 0,
      baselines: Array.isArray(active.baselines)
        ? active.baselines.slice(0, 12).map((value) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0))
        : [],
      satisfied: Array.isArray(active.satisfied) ? active.satisfied.slice(0, 12).map(Boolean) : [],
      step: typeof active.step === 'number' && Number.isFinite(active.step) ? Math.max(0, Math.floor(active.step)) : 0,
    };
  }
  state.player.quests = {
    active: activeQuests,
    completed: Array.isArray(quests.completed)
      ? quests.completed.filter((id): id is string => typeof id === 'string').slice(0, 400) : [],
    completedByCritter: Object.fromEntries(
      Object.entries(safeObject(quests.completedByCritter)).map(([critterId, ids]) => [
        critterId,
        Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string').slice(0, 200) : [],
      ]),
    ),
    offered: finiteCounts(quests.offered),
    cooldownUntil: finiteCounts(quests.cooldownUntil),
  };
  const validBiomes: Biome[] = ['clearing', 'forest', 'meadow', 'dunes', 'scrapflats'];
  state.player.visitedBiomes = Array.isArray(player.visitedBiomes)
    ? [...new Set(player.visitedBiomes.filter((biome): biome is Biome => typeof biome === 'string' && validBiomes.includes(biome as Biome)))]
    : ['clearing'];
  state.player.visitedPages = Array.isArray(player.visitedPages)
    ? player.visitedPages.filter((id): id is string => typeof id === 'string').slice(0, 2000)
    : ['0,0'];
  state.player.metCritters = Array.isArray(player.metCritters)
    ? player.metCritters.filter((id): id is string => typeof id === 'string').slice(0, 500)
    : [];
  state.player.metCritterNames = Object.fromEntries(
    Object.entries(safeObject(player.metCritterNames))
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([id, name]) => [id, name.slice(0, 80)]),
  );
  state.player.metCritterSpecies = Object.fromEntries(
    Object.entries(safeObject(player.metCritterSpecies))
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([id, species]) => [id, species.slice(0, 40)]),
  );
  state.player.mailbox = Array.isArray(player.mailbox)
    ? player.mailbox.flatMap((rawMail) => {
      const mail = safeObject(rawMail);
      const payload = safeObject(mail.payload);
      if (typeof mail.id !== 'string' || typeof mail.fromAccountId !== 'string') return [];
      if (typeof mail.fromName !== 'string' || typeof mail.kind !== 'string') return [];
      if (typeof mail.at !== 'number' || !Number.isFinite(mail.at)) return [];
      const safePayload = Object.fromEntries(Object.entries(payload).flatMap(([key, value]) => (
        (typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)))
          ? [[key.slice(0, 64), typeof value === 'string' ? value.slice(0, 500) : value]]
          : []
      )));
      return [{
        id: mail.id.slice(0, 160),
        fromAccountId: mail.fromAccountId.slice(0, 160),
        fromName: mail.fromName.slice(0, 80),
        kind: mail.kind.slice(0, 40),
        payload: safePayload,
        at: Math.max(0, mail.at),
      }];
    }).slice(0, LIMITS.mailboxMax)
    : [createWelcomeMail()];
  const mailboxIds = new Set(state.player.mailbox.map((mail) => mail.id));
  state.player.claimedMailIds = Array.isArray(player.claimedMailIds)
    ? player.claimedMailIds
      .filter((id): id is string => typeof id === 'string' && mailboxIds.has(id))
      .slice(0, LIMITS.mailboxMax)
    : [];
  const learning = safeObject(player.activeLearning);
  if (
    typeof learning.nodeId === 'string'
    && typeof learning.startedAt === 'number'
    && Number.isFinite(learning.startedAt)
    && learning.startedAt >= 0
  ) {
    const baselines = Array.isArray(learning.taskBaselineCounts)
      ? learning.taskBaselineCounts.slice(0, 16).map((value) => (
        typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
      ))
      : [];
    const completed = Array.isArray(learning.completedTaskIndexes)
      ? learning.completedTaskIndexes.flatMap((value) => (
        typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 16
          ? [Math.floor(value)] : []
      ))
      : [];
    state.player.activeLearning = {
      nodeId: learning.nodeId,
      startedAt: learning.startedAt,
      taskBaselineCounts: baselines,
      completedTaskIndexes: [...new Set(completed)],
    };
  }

  state.world.harvestRespawns = finiteCounts(world.harvestRespawns);
  state.world.pages = normalizePageModifications(world.pages);
  state.world.thingMaker.level = typeof maker.level === 'number'
    ? Math.max(1, Math.min(4, Math.floor(maker.level))) : 1;
  state.world.thingMaker.completedOutputs = Array.isArray(maker.completedOutputs)
    ? maker.completedOutputs.filter((entry): entry is string => typeof entry === 'string') : [];
  state.world.thingMaker.trayOutputs = Array.isArray(maker.trayOutputs)
    ? maker.trayOutputs.filter((entry): entry is string => typeof entry === 'string' && entry in RECIPE_DEFS)
    : [];
  const active = safeObject(maker.activeCraft);
  if (
    typeof active.recipeId === 'string'
    && active.recipeId in RECIPE_DEFS
    && typeof active.startedAt === 'number'
    && typeof active.completesAt === 'number'
  ) {
    state.world.thingMaker.activeCraft = {
      recipeId: active.recipeId as RecipeId,
      startedAt: active.startedAt,
      completesAt: active.completesAt,
    };
  }
  return state;
}

export function migrateLegacyState(storage: StorageLike): GameState {
  const state = createDefaultGameState();
  const inventory = finiteCounts(parseJson(storage, 'pencil-and-paper.resource-inventory.v1'));
  for (const resource of Object.keys(RESOURCE_CORE_DEFS) as ResourceId[]) {
    if (inventory[resource] !== undefined) state.player.inventory[resource] = inventory[resource];
  }
  state.player.friendships = finiteCounts(parseJson(storage, 'pencil-and-paper.friendship.v1'), 100);
  state.player.conversations = safeObject(parseJson(storage, 'pencil-and-paper.conversations.v1')) as Record<string, ConversationMemoryState>;
  state.world.harvestRespawns = finiteCounts(parseJson(storage, 'pencil-and-paper.harvest-state.v1'));

  const legacyPlaces = safeObject(parseJson(storage, 'pencil-and-paper.places.v1'));
  if (Array.isArray(legacyPlaces.places)) {
    state.player.places = legacyPlaces.places.filter((place): place is SavedPlaceState => {
      const item = safeObject(place);
      return typeof item.id === 'string' && typeof item.name === 'string'
        && typeof item.x === 'number' && Number.isFinite(item.x)
        && typeof item.z === 'number' && Number.isFinite(item.z);
    }).map((place) => ({ ...place, builtin: Boolean(place.builtin) }));
  }
  if (typeof legacyPlaces.nextPlaceNumber === 'number') {
    state.player.nextPlaceNumber = Math.max(2, Math.floor(legacyPlaces.nextPlaceNumber));
  }
  return state;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function initializeGameState(storage = browserStorage()): GameState {
  if (cachedState) return cachedState;
  if (!storage) {
    cachedState = createDefaultGameState();
    return cachedState;
  }
  cachedState = normalizeState(parseJson(storage, SAVE_STORAGE_KEY)) ?? migrateLegacyState(storage);
  storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(cachedState));
  return cachedState;
}

export function getGameState(): Readonly<GameState> {
  return initializeGameState();
}

export function updateGameState(mutator: (state: GameState) => void) {
  const state = initializeGameState();
  mutator(state);
  const storage = browserStorage();
  if (storage) storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(state));
  for (const listener of listeners) listener();
}

export function onGameStateChanged(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only seam: normal game code should never replace the whole state. */
export function setGameStateForTests(state: GameState | null) {
  cachedState = state;
}
