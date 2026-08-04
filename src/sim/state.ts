import { RECIPE_DEFS, STARTER_PLAN_IDS, type RecipeId } from './catalogs/recipes';
import { TOOL_DEFS, type ToolId } from './catalogs/tools';
import { RESOURCE_CORE_DEFS, type ResourceId } from './catalogs/resources';
import type { DigDiscovery } from './catalogs/geology';
import { SEED_DEFS, type SeedId } from './catalogs/seeds';

export const SAVE_SCHEMA_VERSION = 1;
export const SAVE_STORAGE_KEY = 'pencil-and-paper.game-save.v1';

export type ConversationMemoryState = {
  flags: string[];
  seen: Record<string, number>;
  visits: number;
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

export type PageModificationState = {
  terrainEdits: Record<string, TerrainEditCellState>;
  treeGrowth: Record<string, unknown>;
  plantedCells: Record<string, unknown>;
  placedEntities: Record<string, unknown>;
};

export type TerrainEditCellState = {
  kind: 'dug';
  state: 'dug' | 'planted' | 'mending';
  x: number;
  z: number;
  depth: number;
  radius: number;
  toolTier: number;
  geologySeed: number;
  revealedLayers: DigDiscovery[];
  plantedSeedId?: SeedId;
  plantedAt?: number;
  mendsAt?: number;
  lastTendedAt?: number;
  tendCount?: number;
  nextSeedDropAt?: number;
  seedDropReady?: boolean;
  seedDrops?: number;
  changedAt: number;
};

export type GameState = {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  player: {
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

export function createDefaultGameState(): GameState {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    player: {
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
    result[cellKey] = {
      kind: 'dug',
      state: cell.state === 'planted' || cell.state === 'mending' ? cell.state : 'dug',
      x: cell.x,
      z: cell.z,
      depth: Math.max(0, Math.min(1.5, cell.depth)),
      radius: Math.max(0.2, Math.min(2.5, cell.radius)),
      toolTier: typeof cell.toolTier === 'number' ? Math.max(1, Math.min(3, Math.floor(cell.toolTier))) : 1,
      geologySeed: typeof cell.geologySeed === 'number' && Number.isFinite(cell.geologySeed) ? cell.geologySeed : 0,
      revealedLayers,
      plantedSeedId: typeof cell.plantedSeedId === 'string' && cell.plantedSeedId in SEED_DEFS
        ? cell.plantedSeedId as SeedId : undefined,
      plantedAt: typeof cell.plantedAt === 'number' && Number.isFinite(cell.plantedAt) ? cell.plantedAt : undefined,
      mendsAt: typeof cell.mendsAt === 'number' && Number.isFinite(cell.mendsAt) ? cell.mendsAt : undefined,
      lastTendedAt: typeof cell.lastTendedAt === 'number' && Number.isFinite(cell.lastTendedAt) ? cell.lastTendedAt : undefined,
      tendCount: typeof cell.tendCount === 'number' && Number.isFinite(cell.tendCount)
        ? Math.max(0, Math.floor(cell.tendCount)) : 0,
      nextSeedDropAt: typeof cell.nextSeedDropAt === 'number' && Number.isFinite(cell.nextSeedDropAt)
        ? cell.nextSeedDropAt : undefined,
      seedDropReady: Boolean(cell.seedDropReady),
      seedDrops: typeof cell.seedDrops === 'number' && Number.isFinite(cell.seedDrops)
        ? Math.max(0, Math.floor(cell.seedDrops)) : 0,
      changedAt: typeof cell.changedAt === 'number' && Number.isFinite(cell.changedAt) ? cell.changedAt : 0,
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
      treeGrowth: safeObject(page.treeGrowth),
      plantedCells: safeObject(page.plantedCells),
      placedEntities: safeObject(page.placedEntities),
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
  state.player.conversations = safeObject(player.conversations) as Record<string, ConversationMemoryState>;
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
