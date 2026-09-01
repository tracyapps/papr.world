import {
  MAKER_UPGRADE_INGREDIENTS,
  RECIPE_DEFS,
  getCraftDuration,
  isRecipeAvailable,
  previousTierTool,
  type IngredientRequirement,
  type PlanSource,
  type RecipeId,
} from './catalogs/recipes';
import type { ToolId } from './catalogs/tools';
import { getGameState, updateGameState, type GameState } from './state';
import { RESOURCE_CORE_DEFS, type ResourceId } from './catalogs/resources';
import { TOOL_DEFS } from './catalogs/tools';
import { TERRAIN_CELL_RADIUS, type TerrainCellAddress } from './terrainCells';
import type { DigDiscovery } from './catalogs/geology';
import {
  SEED_DEFS,
  availableSeedSelection,
  bloomSeconds,
  plantHarvest,
  plantProduce,
  plantStageAt,
  type SeedId,
} from './catalogs/seeds';
import {
  SEED_STORE,
  SEED_STORE_BARTER,
  seedStoreBuyPrice,
  seedStoreSellPrice,
  type ShopId,
} from './catalogs/shops';
import {
  TRIM_STAGE_RESPONSES,
  describeTrimYield,
  resolveTrimYield,
  treeGrowthAt,
  treeStageFor,
  trimProfileForTier,
  type TreeAddress,
} from './catalogs/trees';
import { BUILD_PIECE_DEFS, buildPieceDef, buildPiecesConflict, planterBoxAt, type BuildPieceKey } from '../world/buildPieces';
import { buildAssemblyDef, nextBuildStep, resolveBuildMaterial } from './catalogs/building';
import { LOCAL_MAKER_ID } from './state';
import { reconcileTechLearningState } from './learning';

export type ResourceAllocation = Partial<Record<ResourceId, number>>;

export type GameCommand =
  | { type: 'buySeed'; shopId: ShopId; seedId: SeedId; payment: 'chips' | 'barter'; quantity?: number }
  | { type: 'collectResource'; resource: ResourceId; amount: number }
  | { type: 'collectPlantSeed'; target: TerrainCellAddress; now: number }
  | { type: 'collectOutput'; index: number }
  | { type: 'completeCraft'; now: number }
  | { type: 'completeMending'; target: TerrainCellAddress; now: number }
  | { type: 'completeBuildStep'; templateKey: string; stepId: string; x: number; z: number; rotY: number; pageId: string; now: number; material?: string }
  | { type: 'digTerrain'; target: TerrainCellAddress; discovery: DigDiscovery; now: number }
  | { type: 'equipTool'; toolId: ToolId | null }
  | { type: 'liftPlant'; target: TerrainCellAddress; now: number }
  | { type: 'observePlantGrowth'; target: TerrainCellAddress; now: number }
  | { type: 'placePiece'; templateKey: string; x: number; z: number; rotY: number; pageId: string; now: number; material?: string }
  | { type: 'plantTerrain'; target: TerrainCellAddress; seedId: SeedId; now: number }
  | { type: 'refillTerrain'; target: TerrainCellAddress; now: number }
  | { type: 'selectSeed'; seedId: SeedId | null }
  | { type: 'sellResource'; shopId: ShopId; resource: ResourceId; quantity: number }
  | { type: 'startCraft'; recipeId: RecipeId; now: number }
  | { type: 'tendPlant'; target: TerrainCellAddress; now: number }
  | { type: 'trimTree'; target: TreeAddress; now: number }
  | { type: 'updatePlacedPiece'; id: string; x: number; z: number; rotY: number; material?: string; pageId: string }
  | { type: 'updatePlantSeedDrop'; target: TerrainCellAddress; now: number }
  | { type: 'upgradeThingMaker' };

export type CommandResult =
  | { ok: true; allocation?: ResourceAllocation; grants?: ResourceAllocation; message: string }
  | { ok: false; reason: string };

function resourceIds() {
  return Object.keys(RESOURCE_CORE_DEFS) as ResourceId[];
}

/** Resolve exact ingredients first, then spend the most plentiful matching
 * family varieties. The returned allocation is suitable for a future UI where
 * the player overrides which varieties to use before dispatching the command. */
export function resolveIngredientAllocation(
  inventory: Readonly<Partial<Record<ResourceId, number>>>,
  requirements: readonly IngredientRequirement[],
): ResourceAllocation | null {
  const remaining: Partial<Record<ResourceId, number>> = { ...inventory };
  const allocation: ResourceAllocation = {};

  for (const requirement of requirements) {
    if (requirement.kind !== 'exact') continue;
    const available = remaining[requirement.resource] ?? 0;
    if (available < requirement.quantity) return null;
    remaining[requirement.resource] = available - requirement.quantity;
    allocation[requirement.resource] = (allocation[requirement.resource] ?? 0) + requirement.quantity;
  }

  for (const requirement of requirements) {
    if (requirement.kind !== 'family') continue;
    let needed = requirement.quantity;
    const candidates = resourceIds()
      .filter((resource) => RESOURCE_CORE_DEFS[resource].category === requirement.family)
      .sort((a, b) => (remaining[b] ?? 0) - (remaining[a] ?? 0) || a.localeCompare(b));
    for (const resource of candidates) {
      const spend = Math.min(needed, remaining[resource] ?? 0);
      if (spend <= 0) continue;
      remaining[resource] = (remaining[resource] ?? 0) - spend;
      allocation[resource] = (allocation[resource] ?? 0) + spend;
      needed -= spend;
      if (needed === 0) break;
    }
    if (needed > 0) return null;
  }
  return allocation;
}

function spendAllocation(state: GameState, allocation: ResourceAllocation) {
  for (const [resource, quantity] of Object.entries(allocation) as Array<[ResourceId, number]>) {
    state.player.inventory[resource] = Math.max(0, (state.player.inventory[resource] ?? 0) - quantity);
  }
}

const TEND_COOLDOWN_MS = 12_000;
const TEND_SEED_BONUS_MS = 20_000;

/** Stable pseudo-random drop timing: saves and future multiplayer clients agree. */
function nextSeedDropAt(
  target: TerrainCellAddress,
  seedId: SeedId,
  geologySeed: number,
  dropIndex: number,
  now: number,
) {
  let hash = 2166136261;
  const value = `${target.pageId}:${target.cellKey}:${geologySeed}:${dropIndex}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const repeatSeconds = plantHarvest(seedId)?.repeatSeconds ?? bloomSeconds(seedId);
  const spread = Math.max(1, Math.round(repeatSeconds * 0.12));
  const seconds = repeatSeconds - spread + (hash >>> 0) % (spread * 2 + 1);
  return now + seconds * 1000;
}

const ACTIVITY_LOG_LIMIT = 80;

function emptyPageState() {
  return {
    terrainEdits: {}, treeGrowth: {}, plantedCells: {}, placedEntities: {}, placedPieces: {}, buildSites: {},
  };
}

function piecePlacementBlocker(
  state: GameState,
  candidate: { templateKey: string; x: number; z: number; rotY: number },
  ignoreBuildSiteId?: string,
  ignorePieceId?: string,
) {
  for (const page of Object.values(state.world.pages)) {
    for (const piece of Object.values(page.placedPieces)) {
      if (piece.id === ignorePieceId) continue;
      if (buildPiecesConflict(candidate, piece)) return true;
    }
    for (const site of Object.values(page.buildSites)) {
      if (site.id === ignoreBuildSiteId) continue;
      if (buildPiecesConflict(candidate, site)) return true;
    }
  }
  return false;
}

function appendActivity(
  state: GameState,
  entry: GameState['player']['activityLog'][number],
): boolean {
  if (state.player.activityLog.some((existing) => existing.id === entry.id)) return false;
  state.player.activityLog.unshift(entry);
  if (state.player.activityLog.length > ACTIVITY_LOG_LIMIT) {
    state.player.activityLog.length = ACTIVITY_LOG_LIMIT;
  }
  return true;
}

/**
 * Depth at or below which a hole rakes closed for nothing.
 *
 * A tier-1 scoop is a scuff you can push back with the side of a hoe. Deeper
 * excavations are a real hole and need real fill, which is what gives dug
 * soil a sink and makes terracing a project rather than a free action.
 */
export const FREE_REFILL_DEPTH = 0.14;

/** Soil-family resources, most plentiful first — what refilling spends. */
function soilOnHand(state: GameState): ResourceId[] {
  return resourceIds()
    .filter((resource) => RESOURCE_CORE_DEFS[resource].category === 'soil')
    .filter((resource) => (state.player.inventory[resource] ?? 0) > 0)
    .sort((a, b) => (state.player.inventory[b] ?? 0) - (state.player.inventory[a] ?? 0) || a.localeCompare(b));
}

/** How much fill a hole of this depth needs. Shallow scoops are free. */
export function refillCost(depth: number): number {
  return depth <= FREE_REFILL_DEPTH ? 0 : Math.ceil((depth - FREE_REFILL_DEPTH) / 0.13);
}

/**
 * The nearest already-planted cell whose personal space overlaps a new
 * planting, or null when there is room.
 *
 * Spacing is checked against the larger of the two plants' requirements, so a
 * sprawling plant keeps its distance from tidy ones as well as its own kind.
 * This is what lets groundcover be sown edge to edge while flowers that need
 * room stay properly spaced, instead of every plant snapping to one grid.
 *
 * Returns the required distance too, so the UI can explain the refusal in
 * concrete terms rather than just saying no.
 */
export function findCrowdingPlant(
  state: GameState,
  target: TerrainCellAddress,
  seedId: SeedId,
): { seedId: SeedId; distance: number; required: number } | null {
  const spacing = SEED_DEFS[seedId].spacing;
  let closest: { seedId: SeedId; distance: number; required: number } | null = null;

  for (const page of Object.values(state.world.pages)) {
    for (const [cellKey, edit] of Object.entries(page.terrainEdits)) {
      if (cellKey === target.cellKey) continue;
      if (edit.state === 'dug' || !edit.plantedSeedId) continue;
      // A cell that is mid-mend is on its way out; it should not block a
      // player who is re-planting the patch they just decided to keep.
      if (edit.state === 'mending') continue;

      const required = Math.max(spacing, SEED_DEFS[edit.plantedSeedId].spacing);
      const distance = Math.hypot(target.x - edit.x, target.z - edit.z);
      if (distance >= required) continue;
      if (!closest || distance < closest.distance) {
        closest = { seedId: edit.plantedSeedId, distance, required };
      }
    }
  }
  return closest;
}

function gardenEdit(state: GameState, target: TerrainCellAddress) {
  const edit = state.world.pages[target.pageId]?.terrainEdits[target.cellKey];
  // Any seed that has taken root can be tended and can leave a drop, not just
  // the Buttonbloom — the drop loop is the same for every garden plant, only
  // what it leaves on the ground changes.
  return edit?.state === 'planted' && edit.plantedSeedId ? edit : null;
}

/** The short plant name, e.g. "Raspberry Bush" from "Raspberry Bush Seeds". */
function gardenPlantName(seedId: SeedId): string {
  return SEED_DEFS[seedId].name.replace(/ Seeds$/, '');
}

export function applyGameCommand(state: GameState, command: GameCommand): CommandResult {
  switch (command.type) {
    case 'buySeed': {
      if (command.shopId !== SEED_STORE.id || !SEED_STORE.sells.includes(command.seedId)) {
        return { ok: false, reason: 'Pip does not have that seed packet on the shelf.' };
      }
      const quantity = command.quantity ?? 1;
      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        return { ok: false, reason: 'Choose a whole number of seed packets.' };
      }
      if (command.payment === 'chips') {
        const price = seedStoreSellPrice(command.seedId);
        const total = price * quantity;
        if (state.player.chips < total) {
          return { ok: false, reason: `${quantity} packets cost ₡${total}. Pip is happy to barter, too.` };
        }
        state.player.chips -= total;
      } else {
        const { resource, quantity: fiberPerPacket } = SEED_STORE_BARTER;
        const total = fiberPerPacket * quantity;
        if ((state.player.inventory[resource] ?? 0) < total) {
          return { ok: false, reason: `Pip needs ${total} paper fibers for ${quantity} packets.` };
        }
        state.player.inventory[resource] = (state.player.inventory[resource] ?? 0) - total;
      }
      state.player.inventory[command.seedId] = (state.player.inventory[command.seedId] ?? 0) + quantity;
      // A packet bought to plant should be ready in hand. The toolbar and
      // garden overlay already react to this single shared field.
      state.player.selectedSeed = command.seedId;
      return {
        ok: true,
        message: `${quantity} ${SEED_DEFS[command.seedId].name} tucked into your seed pouch — ready to plant.`,
      };
    }

    case 'sellResource': {
      if (command.shopId !== SEED_STORE.id || !SEED_STORE.buys.includes(command.resource)) {
        return { ok: false, reason: 'Pip is not taking that today.' };
      }
      if (!Number.isSafeInteger(command.quantity) || command.quantity <= 0) {
        return { ok: false, reason: 'Choose something from your basket to sell.' };
      }
      const quantity = command.quantity;
      if ((state.player.inventory[command.resource] ?? 0) < quantity) {
        return { ok: false, reason: `You do not have that many ${RESOURCE_CORE_DEFS[command.resource].shortLabel}.` };
      }
      const payment = seedStoreBuyPrice(command.resource) * quantity;
      state.player.inventory[command.resource] = (state.player.inventory[command.resource] ?? 0) - quantity;
      state.player.chips += payment;
      if (command.resource === state.player.selectedSeed && (state.player.inventory[command.resource] ?? 0) <= 0) {
        state.player.selectedSeed = availableSeedSelection(state.player.selectedSeed, state.player.inventory);
      }
      return {
        ok: true,
        message: `Pip adds ₡${payment} to your pouch for ${quantity} ${RESOURCE_CORE_DEFS[command.resource].shortLabel}.`,
      };
    }

    case 'collectResource': {
      if (!Number.isFinite(command.amount) || command.amount <= 0 || !(command.resource in RESOURCE_CORE_DEFS)) {
        return { ok: false, reason: 'Invalid resource collection.' };
      }
      const amount = Math.floor(command.amount);
      state.player.inventory[command.resource] = (state.player.inventory[command.resource] ?? 0) + amount;
      return { ok: true, message: `Collected ${amount} ${RESOURCE_CORE_DEFS[command.resource].shortLabel}.` };
    }

    case 'startCraft': {
      const recipe = RECIPE_DEFS[command.recipeId];
      if (!recipe) return { ok: false, reason: 'That plan is unknown.' };
      // The command re-checks rather than trusting the UI, but through the
      // same resolver the UI used — so a refusal here can never surprise a
      // player who was looking at an enabled button.
      const blocked = craftBlockers(state, command.recipeId)[0];
      if (blocked) return { ok: false, reason: describeCraftBlocker(blocked) };
      const allocation = resolveIngredientAllocation(state.player.inventory, recipe.ingredients);
      if (!allocation) return { ok: false, reason: 'Not enough suitable materials.' };
      spendAllocation(state, allocation);
      const durationMs = getCraftDuration(recipe, state.world.thingMaker.level) * 1000;
      state.world.thingMaker.activeCraft = {
        recipeId: command.recipeId,
        startedAt: command.now,
        completesAt: command.now + durationMs,
      };
      return { ok: true, allocation, message: `Started ${recipe.name}.` };
    }

    case 'completeCraft': {
      const active = state.world.thingMaker.activeCraft;
      if (!active) return { ok: false, reason: 'Nothing is being made.' };
      if (command.now < active.completesAt) return { ok: false, reason: 'The rollers are still working.' };
      const recipe = RECIPE_DEFS[active.recipeId];
      // Finishing puts the thing on the tray; it is not yours until you pick
      // it up. The machine makes objects in the world, and a tool appearing
      // in your hands from across the clearing skips the moment where you
      // see what you made.
      state.world.thingMaker.trayOutputs.push(active.recipeId);
      state.world.thingMaker.completedOutputs.push(active.recipeId);
      state.world.thingMaker.activeCraft = null;
      return { ok: true, message: `Finished ${recipe.output.label}. It is waiting on the tray.` };
    }

    case 'collectOutput': {
      const tray = state.world.thingMaker.trayOutputs;
      const recipeId = tray[command.index];
      if (!recipeId || !(recipeId in RECIPE_DEFS)) {
        return { ok: false, reason: 'There is nothing there to pick up.' };
      }
      const recipe = RECIPE_DEFS[recipeId as RecipeId];
      tray.splice(command.index, 1);

      if (recipe.output.kind === 'tool') {
        state.player.tools[recipe.output.toolId] = (state.player.tools[recipe.output.toolId] ?? 0) + 1;
        // Picking a tool up is the natural moment to start holding it.
        state.player.equippedTool = recipe.output.toolId;
        return { ok: true, message: `Picked up the ${recipe.output.label}. It is in your hands.` };
      }

      state.player.items[recipe.output.itemId] = (state.player.items[recipe.output.itemId] ?? 0) + 1;
      return { ok: true, message: `Picked up the ${recipe.output.label}.` };
    }

    case 'digTerrain': {
      const equippedTool = state.player.equippedTool;
      const tool = equippedTool ? TOOL_DEFS[equippedTool] : null;
      if (!tool || tool.verb !== 'dig' || (state.player.tools[equippedTool!] ?? 0) <= 0) {
        return { ok: false, reason: 'Equip a shovel before shaping the ground.' };
      }
      const { target } = command;
      if (!target.pageId || !target.cellKey || !Number.isFinite(target.x) || !Number.isFinite(target.z)) {
        return { ok: false, reason: 'That patch of ground could not be found.' };
      }
      const discovery = command.discovery;
      if (
        !(discovery.resource in RESOURCE_CORE_DEFS)
        || discovery.layer !== tool.tier
        || !Number.isFinite(discovery.geologySeed)
        || !Number.isFinite(discovery.quantity)
        || discovery.quantity < 1
        || discovery.quantity > 8
      ) {
        return { ok: false, reason: 'That underground find did not match the terrain layer.' };
      }
      const page = state.world.pages[target.pageId] ??= emptyPageState();
      const existing = page.terrainEdits[target.cellKey];
      if (existing && existing.toolTier >= tool.tier) {
        return { ok: false, reason: 'This little patch is already as deep as that shovel can manage.' };
      }
      page.terrainEdits[target.cellKey] = {
        kind: 'dug',
        state: 'dug',
        x: target.x,
        z: target.z,
        // Shallower than before to match the smaller radius: a 0.18-deep pit
        // in a 0.31-radius hole reads as a post hole, not a shovel scoop.
        depth: 0.13 * tool.tier,
        radius: TERRAIN_CELL_RADIUS,
        toolTier: tool.tier,
        geologySeed: discovery.geologySeed,
        revealedLayers: [...(existing?.revealedLayers ?? []), discovery],
        changedAt: command.now,
      };
      state.player.inventory[discovery.resource] = (state.player.inventory[discovery.resource] ?? 0) + discovery.quantity;
      return {
        ok: true,
        grants: { [discovery.resource]: discovery.quantity },
        message: `Found ${discovery.quantity} ${RESOURCE_CORE_DEFS[discovery.resource].shortLabel}. The shallow bed is ready for planting.`,
      };
    }

    case 'placePiece': {
      if (!(command.templateKey in BUILD_PIECE_DEFS)) {
        return { ok: false, reason: 'That piece is not in the scrapbook yet.' };
      }
      if (
        !Number.isFinite(command.x) || !Number.isFinite(command.z)
        || !Number.isFinite(command.rotY) || !command.pageId
      ) {
        return { ok: false, reason: 'That spot could not be measured.' };
      }
      const def = buildPieceDef(command.templateKey);
      // The command re-checks physical overlap, room-wide rather than only on
      // the page the overlay happened to look at — the same resolver-agrees-
      // with-command arrangement the garden uses, so a click that looked fine
      // can never be silently refused.
      if (piecePlacementBlocker(state, command)) {
        return { ok: false, reason: 'That is too close to something you have already placed.' };
      }
      const page = state.world.pages[command.pageId] ??= emptyPageState();
      const id = `piece-${command.now.toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
      page.placedPieces[id] = {
        id,
        templateKey: command.templateKey,
        x: command.x,
        z: command.z,
        rotY: command.rotY || 0,
        material: resolveBuildMaterial(command.templateKey as BuildPieceKey, command.material),
        makerId: LOCAL_MAKER_ID,
        page: command.pageId,
      };
      return { ok: true, message: `Placed the ${def.label}.` };
    }

    case 'completeBuildStep': {
      const definition = buildAssemblyDef(command.templateKey);
      if (!definition || !(command.templateKey in BUILD_PIECE_DEFS)) {
        return { ok: false, reason: 'That piece is not in the scrapbook yet.' };
      }
      if (
        !command.stepId || !command.pageId
        || !Number.isFinite(command.x) || !Number.isFinite(command.z) || !Number.isFinite(command.rotY)
      ) {
        return { ok: false, reason: 'That build step could not be measured.' };
      }
      const equipped = state.player.equippedTool;
      const tool = equipped ? TOOL_DEFS[equipped] : null;
      if (!tool || tool.verb !== 'build' || (state.player.tools[equipped!] ?? 0) <= 0) {
        return { ok: false, reason: 'Hold a hammer to build that.' };
      }
      if (tool.tier < definition.minimumToolTier) {
        return { ok: false, reason: `That plan needs a level ${definition.minimumToolTier} hammer.` };
      }

      const page = state.world.pages[command.pageId] ??= emptyPageState();
      const site = Object.values(page.buildSites).find((candidate) => (
        candidate.templateKey === command.templateKey
        && Math.hypot(candidate.x - command.x, candidate.z - command.z) < 0.2
      ));
      const completedStepIds = site?.completedStepIds ?? [];
      const step = nextBuildStep(definition, completedStepIds);
      if (!step || step.id !== command.stepId) {
        return { ok: false, reason: 'That is not the next step in this build.' };
      }
      if (piecePlacementBlocker(state, command, site?.id)) {
        return { ok: false, reason: 'That is too close to something you have already placed.' };
      }
      const allocation = resolveIngredientAllocation(state.player.inventory, step.materials);
      if (!allocation) return { ok: false, reason: `More materials are needed for ${step.label.toLowerCase()}.` };
      spendAllocation(state, allocation);

      const activeSite = site ?? {
        id: `build-${command.now.toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`,
        templateKey: command.templateKey,
        x: command.x,
        z: command.z,
        rotY: command.rotY || 0,
        makerId: LOCAL_MAKER_ID,
        page: command.pageId,
        completedStepIds: [],
        startedAt: command.now,
        changedAt: command.now,
      };
      activeSite.completedStepIds.push(step.id);
      activeSite.changedAt = command.now;
      page.buildSites[activeSite.id] = activeSite;

      const next = nextBuildStep(definition, activeSite.completedStepIds);
      if (next) {
        return {
          ok: true,
          allocation,
          message: `${step.label} complete. ${definition.steps.length - activeSite.completedStepIds.length} step${definition.steps.length - activeSite.completedStepIds.length === 1 ? '' : 's'} left.`,
        };
      }

      const def = buildPieceDef(command.templateKey);
      page.placedPieces[activeSite.id.replace(/^build-/, 'piece-')] = {
        id: activeSite.id.replace(/^build-/, 'piece-'),
        templateKey: command.templateKey,
        x: activeSite.x,
        z: activeSite.z,
        rotY: activeSite.rotY,
        material: resolveBuildMaterial(command.templateKey as BuildPieceKey, command.material),
        makerId: activeSite.makerId,
        page: activeSite.page,
      };
      delete page.buildSites[activeSite.id];
      return { ok: true, allocation, message: `Built the ${def.label}.` };
    }

    case 'updatePlacedPiece': {
      // Moving/rotating an already-built piece, or restyling it, is one
      // command either way — the caller decides whether a rebuild timer ran
      // first. No tool or materials are spent: you already paid for this
      // piece once, at its original build.
      const page = state.world.pages[command.pageId];
      const piece = page?.placedPieces[command.id];
      if (!piece) return { ok: false, reason: 'That piece is no longer there.' };
      if (piece.makerId !== LOCAL_MAKER_ID) {
        return { ok: false, reason: 'Only its maker can change that.' };
      }
      if (!Number.isFinite(command.x) || !Number.isFinite(command.z) || !Number.isFinite(command.rotY)) {
        return { ok: false, reason: 'That spot could not be measured.' };
      }
      const rotY = command.rotY || 0;
      const candidate = { templateKey: piece.templateKey, x: command.x, z: command.z, rotY };
      // Same resolver-agrees-with-command arrangement as a fresh placement,
      // just excluding the piece's own old footprint from the conflict check.
      if (piecePlacementBlocker(state, candidate, undefined, piece.id)) {
        return { ok: false, reason: 'That is too close to something you have already placed.' };
      }
      const def = buildPieceDef(piece.templateKey);
      const material = resolveBuildMaterial(piece.templateKey as BuildPieceKey, command.material ?? piece.material);
      const restyled = material !== piece.material;
      piece.x = command.x;
      piece.z = command.z;
      piece.rotY = rotY;
      piece.material = material;
      return { ok: true, message: restyled ? `Restyled the ${def.label}.` : `Moved the ${def.label}.` };
    }

    case 'selectSeed': {
      if (command.seedId && (state.player.inventory[command.seedId] ?? 0) <= 0) {
        return { ok: false, reason: 'That seed packet is empty.' };
      }
      state.player.selectedSeed = command.seedId;
      return { ok: true, message: command.seedId ? `${SEED_DEFS[command.seedId].name} selected.` : 'Seeds put away.' };
    }

    case 'plantTerrain': {
      const seed = SEED_DEFS[command.seedId];
      if (!seed || (state.player.inventory[command.seedId] ?? 0) <= 0) {
        return { ok: false, reason: 'That seed packet is empty.' };
      }
      const page = state.world.pages[command.target.pageId] ??= emptyPageState();
      let edit = page.terrainEdits[command.target.cellKey];
      if (!edit && planterBoxAt(page.placedPieces, command.target.x, command.target.z)) {
        // A placed planter box is a raised bed the instant it exists — no
        // shovel dig needed first. Its ground behaves exactly like a
        // shallow, freshly-dug bed from here on (lifting, mending, the
        // free refill once it is empty again).
        edit = page.terrainEdits[command.target.cellKey] = {
          kind: 'dug',
          state: 'dug',
          x: command.target.x,
          z: command.target.z,
          depth: 0,
          radius: TERRAIN_CELL_RADIUS,
          toolTier: 0,
          geologySeed: 0,
          revealedLayers: [],
          changedAt: command.now,
        };
      }
      if (!edit || edit.state !== 'dug') {
        return { ok: false, reason: 'Seeds need an empty dug paper-soil bed.' };
      }
      const crowding = findCrowdingPlant(state, command.target, command.seedId);
      if (crowding) {
        return {
          ok: false,
          reason: `${SEED_DEFS[crowding.seedId].name.replace(/ Seeds$/, '')} is growing too close — ${seed.name.replace(/ Seeds$/, '')} needs a little more room.`,
        };
      }
      state.player.inventory[command.seedId] = (state.player.inventory[command.seedId] ?? 0) - 1;
      state.player.selectedSeed = availableSeedSelection(command.seedId, state.player.inventory);
      edit.state = seed.effect === 'mending' ? 'mending' : 'planted';
      edit.plantedSeedId = command.seedId;
      edit.plantedAt = command.now;
      edit.mendsAt = seed.effect === 'mending' ? command.now + bloomSeconds(command.seedId) * 1000 : undefined;
      edit.lastTendedAt = undefined;
      edit.tendCount = 0;
      edit.seedDropReady = false;
      edit.seedDrops = 0;
      edit.observedStage = 'seeded';
      edit.nextSeedDropAt = seed.effect === 'garden'
        ? command.now + bloomSeconds(command.seedId) * 1000
        : undefined;
      edit.changedAt = command.now;
      return {
        ok: true,
        message: seed.effect === 'mending'
          ? 'The Mend-me seed begins stitching the paper ground together.'
          : `A ${gardenPlantName(command.seedId)} settles into its new garden bed.`,
      };
    }

    case 'refillTerrain': {
      const equippedTool = state.player.equippedTool;
      const tool = equippedTool ? TOOL_DEFS[equippedTool] : null;
      if (!tool || tool.verb !== 'plant' || (state.player.tools[equippedTool!] ?? 0) <= 0) {
        return { ok: false, reason: 'Hold a hoe to rake soil back into a hole.' };
      }
      const page = state.world.pages[command.target.pageId];
      const edit = page?.terrainEdits[command.target.cellKey];
      if (!page || !edit) return { ok: false, reason: 'There is no open hole here.' };
      if (edit.state !== 'dug') {
        return { ok: false, reason: 'Lift what is growing here before filling the bed in.' };
      }

      const cost = refillCost(edit.depth);
      if (cost > 0) {
        // Spend from the most plentiful soil first, so a player is not
        // silently drained of a rare regional clay to close an ordinary hole.
        const available = soilOnHand(state);
        const total = available.reduce((sum, resource) => sum + (state.player.inventory[resource] ?? 0), 0);
        if (total < cost) {
          return {
            ok: false,
            reason: `That hole needs ${cost} scoop${cost === 1 ? '' : 's'} of paper soil to fill. Dig some up first.`,
          };
        }
        let remaining = cost;
        const spent: ResourceAllocation = {};
        for (const resource of available) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, state.player.inventory[resource] ?? 0);
          state.player.inventory[resource] = (state.player.inventory[resource] ?? 0) - take;
          spent[resource] = (spent[resource] ?? 0) + take;
          remaining -= take;
        }
        delete page.terrainEdits[command.target.cellKey];
        return { ok: true, allocation: spent, message: 'You rake the soil back and press it flat.' };
      }

      delete page.terrainEdits[command.target.cellKey];
      return { ok: true, message: 'You nudge the loose soil back into the scuff.' };
    }

    case 'liftPlant': {
      const equippedTool = state.player.equippedTool;
      const tool = equippedTool ? TOOL_DEFS[equippedTool] : null;
      if (!tool || tool.verb !== 'plant' || (state.player.tools[equippedTool!] ?? 0) <= 0) {
        return { ok: false, reason: 'Hold a hoe to lift a plant out of its bed.' };
      }
      const edit = state.world.pages[command.target.pageId]?.terrainEdits[command.target.cellKey];
      if (!edit || edit.state === 'dug' || !edit.plantedSeedId) {
        return { ok: false, reason: 'Nothing is growing here to lift.' };
      }

      const seedId = edit.plantedSeedId;
      const stage = plantStageAt(seedId, edit.plantedAt ?? edit.changedAt, command.now);
      // Early on the seed is still recoverable; once it has put down roots
      // you get the plant instead. Mis-clicks stay cheap, patience pays.
      const returnsSeed = stage === 'seeded' || stage === 'sprout';
      const grants: ResourceAllocation = {};

      if (returnsSeed) {
        state.player.inventory[seedId] = (state.player.inventory[seedId] ?? 0) + 1;
        grants[seedId] = 1;
      } else {
        const itemId = `plant:${seedId}`;
        state.player.items[itemId] = (state.player.items[itemId] ?? 0) + 1;
      }
      // A loose drop beside the plant is not lost just because the plant was
      // lifted — the player already earned it. What comes along is whatever
      // the plant produces: a Buttonbloom returns its seed, a food plant its
      // fruit.
      if (edit.seedDropReady) {
        const harvest = plantHarvest(seedId);
        const reward = harvest?.resource ?? seedId;
        const quantity = harvest?.quantity ?? 1;
        state.player.inventory[reward] = (state.player.inventory[reward] ?? 0) + quantity;
        grants[reward] = (grants[reward] ?? 0) + quantity;
      }

      // The bed itself stays: lifting a plant leaves ready soil, not a scar.
      edit.state = 'dug';
      edit.plantedSeedId = undefined;
      edit.plantedAt = undefined;
      edit.mendsAt = undefined;
      edit.lastTendedAt = undefined;
      edit.tendCount = 0;
      edit.seedDropReady = false;
      edit.nextSeedDropAt = undefined;
      edit.seedDrops = 0;
      edit.observedStage = undefined;
      edit.changedAt = command.now;

      const name = gardenPlantName(seedId);
      return {
        ok: true,
        grants,
        message: returnsSeed
          ? `You lift the ${name} seed back out. The bed is ready again.`
          : `You lift the ${name} out whole, roots and all.`,
      };
    }

    case 'tendPlant': {
      const edit = gardenEdit(state, command.target);
      if (!edit) return { ok: false, reason: 'Only a growing garden plant can be tended.' };
      if (edit.lastTendedAt && command.now - edit.lastTendedAt < TEND_COOLDOWN_MS) {
        return { ok: true, message: `The ${gardenPlantName(edit.plantedSeedId!)} is still perky from your recent attention.` };
      }
      edit.lastTendedAt = command.now;
      edit.tendCount = (edit.tendCount ?? 0) + 1;
      const scheduled = edit.nextSeedDropAt
        ?? nextSeedDropAt(command.target, edit.plantedSeedId!, edit.geologySeed, edit.seedDrops ?? 0, command.now);
      edit.nextSeedDropAt = Math.max(command.now + 8_000, scheduled - TEND_SEED_BONUS_MS);
      edit.changedAt = command.now;
      return { ok: true, message: `You smooth the leaves and fluff the paper soil. The ${gardenPlantName(edit.plantedSeedId!)} perks up.` };
    }

    case 'trimTree': {
      const equippedTool = state.player.equippedTool;
      const tool = equippedTool ? TOOL_DEFS[equippedTool] : null;
      if (!tool || tool.verb !== 'trim' || (state.player.tools[equippedTool!] ?? 0) <= 0) {
        return { ok: false, reason: 'Hold a pair of scissors to trim a tree.' };
      }
      const { target } = command;
      if (!target.pageId || !target.treeKey) {
        return { ok: false, reason: 'That tree could not be found.' };
      }
      const profile = trimProfileForTier(tool.tier);
      if (target.species === 'redwood' && !profile.handlesRedwood) {
        return {
          ok: false,
          reason: `${tool.name} will not get through redwood bark — this one wants heavier shears.`,
        };
      }

      const page = state.world.pages[target.pageId] ??= emptyPageState();
      const record = page.treeGrowth[target.treeKey];
      const stage = treeStageFor(treeGrowthAt(record, command.now));
      if (stage === 'resting') {
        return { ok: false, reason: TRIM_STAGE_RESPONSES.resting };
      }

      const trims = (record?.trims ?? 0) + 1;
      const yields = resolveTrimYield({
        treeKey: target.treeKey,
        species: target.species,
        tier: tool.tier,
        stage,
        trims,
      });

      // The cut is capped at what is actually there: a full-strength snip at
      // a nearly bare tree takes it to rest rather than into debt. Growth is
      // a quantity of tree, not a health bar to drive negative.
      const remaining = Math.max(0, treeGrowthAt(record, command.now) - profile.cost);
      page.treeGrowth[target.treeKey] = { growth: remaining, trimmedAt: command.now, trims };

      const grants: ResourceAllocation = {};
      for (const entry of yields) {
        state.player.inventory[entry.resource] = (state.player.inventory[entry.resource] ?? 0) + entry.quantity;
        grants[entry.resource] = (grants[entry.resource] ?? 0) + entry.quantity;
      }

      return {
        ok: true,
        grants,
        message: `${describeTrimYield(yields)}. ${TRIM_STAGE_RESPONSES[treeStageFor(remaining)]}`,
      };
    }

    case 'observePlantGrowth': {
      const edit = gardenEdit(state, command.target);
      if (!edit?.plantedSeedId) return { ok: false, reason: 'Nothing is growing there.' };
      const stage = plantStageAt(edit.plantedSeedId, edit.plantedAt ?? edit.changedAt, command.now);
      if (edit.observedStage === stage) return { ok: false, reason: 'That growth stage is already recorded.' };
      edit.observedStage = stage;
      edit.changedAt = command.now;
      if (stage === 'bloom') {
        const name = gardenPlantName(edit.plantedSeedId);
        appendActivity(state, {
          id: `plant-ready:${command.target.pageId}:${command.target.cellKey}:${edit.plantedAt ?? 0}:${edit.seedDrops ?? 0}`,
          kind: 'garden',
          message: `${name} is ready to harvest.`,
          at: command.now,
        });
      }
      return { ok: true, message: `${gardenPlantName(edit.plantedSeedId)} reached its ${stage} stage.` };
    }

    case 'updatePlantSeedDrop': {
      const edit = gardenEdit(state, command.target);
      if (!edit) return { ok: false, reason: 'Nothing growing here can leave a drop.' };
      // Only a plant in full bloom sets a drop. Previously a freshly sown bed
      // could drop one, which skipped the growth it was meant to reward.
      if (!edit.plantedSeedId) return { ok: false, reason: 'Nothing growing here can leave a drop.' };
      if (plantStageAt(edit.plantedSeedId, edit.plantedAt ?? edit.changedAt, command.now) !== 'bloom') {
        return { ok: false, reason: 'It is still growing.' };
      }
      if (edit.seedDropReady) return { ok: true, message: 'A drop is already waiting beside the plant.' };
      if (!edit.nextSeedDropAt) {
        edit.nextSeedDropAt = nextSeedDropAt(
          command.target,
          edit.plantedSeedId,
          edit.geologySeed,
          edit.seedDrops ?? 0,
          command.now,
        );
        return { ok: true, message: `The ${gardenPlantName(edit.plantedSeedId)} begins preparing its next drop.` };
      }
      if (command.now < edit.nextSeedDropAt) return { ok: false, reason: 'The drop is still forming.' };
      edit.seedDropReady = true;
      edit.nextSeedDropAt = undefined;
      edit.changedAt = command.now;
      const produced = plantProduce(edit.plantedSeedId);
      appendActivity(state, {
        id: `plant-ready:${command.target.pageId}:${command.target.cellKey}:${edit.plantedAt ?? 0}:${edit.seedDrops ?? 0}`,
        kind: 'garden',
        message: `${gardenPlantName(edit.plantedSeedId)} is ready to harvest.`,
        at: command.now,
      });
      return {
        ok: true,
        message: produced
          ? produced === edit.plantedSeedId
            ? `A ${gardenPlantName(edit.plantedSeedId)} seed has fluttered onto the ground.`
            : `${RESOURCE_CORE_DEFS[produced].label} have ripened beside the ${gardenPlantName(edit.plantedSeedId)}.`
          : `A ${gardenPlantName(edit.plantedSeedId)} drop is waiting beside the plant.`,
      };
    }

    case 'collectPlantSeed': {
      const edit = gardenEdit(state, command.target);
      if (!edit?.seedDropReady) return { ok: false, reason: 'There is nothing loose here to pick up.' };
      const produced = edit.plantedSeedId ? plantProduce(edit.plantedSeedId) : null;
      const harvest = edit.plantedSeedId ? plantHarvest(edit.plantedSeedId) : null;
      if (!produced || !harvest) return { ok: false, reason: 'There is nothing here to pick up.' };
      const seedId = edit.plantedSeedId!;
      edit.seedDropReady = false;
      edit.seedDrops = (edit.seedDrops ?? 0) + 1;
      edit.changedAt = command.now;
      state.player.inventory[produced] = (state.player.inventory[produced] ?? 0) + harvest.quantity;
      if (harvest.mode === 'repeat') {
        edit.nextSeedDropAt = nextSeedDropAt(command.target, seedId, edit.geologySeed, edit.seedDrops, command.now);
      } else {
        edit.state = 'dug';
        edit.plantedSeedId = undefined;
        edit.plantedAt = undefined;
        edit.nextSeedDropAt = undefined;
        edit.lastTendedAt = undefined;
        edit.tendCount = 0;
        edit.observedStage = undefined;
      }
      appendActivity(state, {
        id: `harvest:${command.target.pageId}:${command.target.cellKey}:${command.now}`,
        kind: 'harvest',
        message: `Harvested ${harvest.quantity} ${RESOURCE_CORE_DEFS[produced].shortLabel}.`,
        at: command.now,
      });
      return {
        ok: true,
        grants: { [produced]: harvest.quantity },
        message: `Harvested ${harvest.quantity} ${RESOURCE_CORE_DEFS[produced].shortLabel}.`,
      };
    }

    case 'completeMending': {
      const page = state.world.pages[command.target.pageId];
      const edit = page?.terrainEdits[command.target.cellKey];
      if (!page || !edit || edit.state !== 'mending' || !edit.mendsAt) {
        return { ok: false, reason: 'That ground is not mending.' };
      }
      if (command.now < edit.mendsAt) return { ok: false, reason: 'The paper roots are still stitching.' };
      appendActivity(state, {
        id: `mended:${command.target.pageId}:${command.target.cellKey}:${edit.mendsAt}`,
        kind: 'garden',
        message: 'A patch of paper ground finished mending.',
        at: command.now,
      });
      delete page.terrainEdits[command.target.cellKey];
      return { ok: true, message: 'The paper sheet has mended smooth again.' };
    }

    case 'equipTool': {
      if (command.toolId && (state.player.tools[command.toolId] ?? 0) <= 0) {
        return { ok: false, reason: 'That tool is not in the scrapbook.' };
      }
      state.player.equippedTool = command.toolId;
      return { ok: true, message: command.toolId ? 'Tool equipped.' : 'Tool put away.' };
    }

    case 'upgradeThingMaker': {
      const maker = state.world.thingMaker;
      if (maker.activeCraft) return { ok: false, reason: 'Wait for the current thing to finish.' };
      if (maker.level >= 3) return { ok: false, reason: 'The current Thing Maker is fully upgraded.' };
      const nextLevel = maker.level + 1;
      const requirements = MAKER_UPGRADE_INGREDIENTS[nextLevel];
      const allocation = resolveIngredientAllocation(state.player.inventory, requirements);
      if (!allocation) return { ok: false, reason: 'More suitable materials are needed for that upgrade.' };
      spendAllocation(state, allocation);
      maker.level = nextLevel;
      return { ok: true, allocation, message: `Thing Maker upgraded to level ${nextLevel}.` };
    }
  }
}

export function dispatchGameCommand(command: GameCommand): CommandResult {
  let result: CommandResult = { ok: false, reason: 'Command did not run.' };
  updateGameState((state) => {
    result = applyGameCommand(state, command);
    if (result.ok) {
      const now = 'now' in command ? command.now : Date.now();
      reconcileTechLearningState(state, now);
    }
  });
  return result;
}

/**
 * Everything standing between the player and this craft.
 *
 * A list rather than a boolean, and shared by the command and the UI, so the
 * Thing Maker can say *which* thing is missing instead of greying a button
 * out silently. The same arrangement as `assessDigTarget` and the garden
 * overlay: one resolver, so what the panel shows can never disagree with
 * what the click does.
 */
export type CraftBlocker =
  | { kind: 'unimplemented' }
  | { kind: 'no-plan'; source: PlanSource }
  | { kind: 'maker-level'; required: number }
  | { kind: 'previous-tier'; toolId: ToolId }
  | { kind: 'materials' }
  | { kind: 'busy' };

export function craftBlockers(state: GameState, recipeId: RecipeId): CraftBlocker[] {
  const recipe = RECIPE_DEFS[recipeId];
  if (!recipe) return [{ kind: 'unimplemented' }];
  const blockers: CraftBlocker[] = [];

  if (!isRecipeAvailable(recipeId)) blockers.push({ kind: 'unimplemented' });
  if (!state.player.plans.includes(recipeId)) blockers.push({ kind: 'no-plan', source: recipe.planSource });
  if (state.world.thingMaker.level < recipe.minimumMakerLevel) {
    blockers.push({ kind: 'maker-level', required: recipe.minimumMakerLevel });
  }
  if (recipe.output.kind === 'tool') {
    const previous = previousTierTool(recipe.output.toolId);
    // One rung at a time. Owning the rung below is the gate, not having ever
    // made it — a tool you gave away should not permanently bar the ladder.
    if (previous && (state.player.tools[previous] ?? 0) <= 0) {
      blockers.push({ kind: 'previous-tier', toolId: previous });
    }
  }
  if (!resolveIngredientAllocation(state.player.inventory, recipe.ingredients)) {
    blockers.push({ kind: 'materials' });
  }
  if (state.world.thingMaker.activeCraft) blockers.push({ kind: 'busy' });
  return blockers;
}

export function craftBlockersFor(recipeId: RecipeId): CraftBlocker[] {
  return craftBlockers(getGameState(), recipeId);
}

/** One short line naming the missing thing, for a button title or a refusal. */
export function describeCraftBlocker(blocker: CraftBlocker): string {
  switch (blocker.kind) {
    case 'unimplemented': return 'That one is not finished yet.';
    case 'no-plan':
      if (blocker.source === 'knowledge-tree') return 'Learn this plan with the Professor.';
      if (blocker.source === 'starter') return 'This starter plan belongs in your scrapbook.';
      return 'You have not found this plan yet.';
    case 'maker-level': return `Needs a level ${blocker.required} Thing Maker.`;
    case 'previous-tier': return `Make a ${TOOL_DEFS[blocker.toolId].name} first.`;
    case 'materials': return 'Not enough suitable materials.';
    case 'busy': return 'The Thing Maker is already working.';
  }
}

export function canStartRecipe(recipeId: RecipeId) {
  return craftBlockersFor(recipeId).length === 0;
}
