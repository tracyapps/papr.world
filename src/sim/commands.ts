import {
  MAKER_UPGRADE_INGREDIENTS,
  RECIPE_DEFS,
  getCraftDuration,
  isRecipeAvailable,
  previousTierTool,
  type IngredientRequirement,
  type RecipeId,
} from './catalogs/recipes';
import type { ToolId } from './catalogs/tools';
import { getGameState, updateGameState, type GameState } from './state';
import { RESOURCE_CORE_DEFS, type ResourceId } from './catalogs/resources';
import { TOOL_DEFS } from './catalogs/tools';
import { TERRAIN_CELL_RADIUS, type TerrainCellAddress } from './terrainCells';
import type { DigDiscovery } from './catalogs/geology';
import { SEED_DEFS, bloomSeconds, plantStageAt, type SeedId } from './catalogs/seeds';
import {
  TRIM_STAGE_RESPONSES,
  describeTrimYield,
  resolveTrimYield,
  treeGrowthAt,
  treeStageFor,
  trimProfileForTier,
  type TreeAddress,
} from './catalogs/trees';

export type ResourceAllocation = Partial<Record<ResourceId, number>>;

export type GameCommand =
  | { type: 'collectResource'; resource: ResourceId; amount: number }
  | { type: 'collectPlantSeed'; target: TerrainCellAddress; now: number }
  | { type: 'collectOutput'; index: number }
  | { type: 'completeCraft'; now: number }
  | { type: 'completeMending'; target: TerrainCellAddress; now: number }
  | { type: 'digTerrain'; target: TerrainCellAddress; discovery: DigDiscovery; now: number }
  | { type: 'equipTool'; toolId: ToolId | null }
  | { type: 'liftPlant'; target: TerrainCellAddress; now: number }
  | { type: 'plantTerrain'; target: TerrainCellAddress; seedId: SeedId; now: number }
  | { type: 'refillTerrain'; target: TerrainCellAddress; now: number }
  | { type: 'selectSeed'; seedId: SeedId | null }
  | { type: 'startCraft'; recipeId: RecipeId; now: number }
  | { type: 'tendPlant'; target: TerrainCellAddress; now: number }
  | { type: 'trimTree'; target: TreeAddress; now: number }
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
function nextSeedDropAt(target: TerrainCellAddress, geologySeed: number, dropIndex: number, now: number) {
  let hash = 2166136261;
  const value = `${target.pageId}:${target.cellKey}:${geologySeed}:${dropIndex}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const seconds = 45 + (hash >>> 0) % 46;
  return now + seconds * 1000;
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
  return edit?.state === 'planted' && edit.plantedSeedId === 'buttonbloom-seeds' ? edit : null;
}

export function applyGameCommand(state: GameState, command: GameCommand): CommandResult {
  switch (command.type) {
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
      const page = state.world.pages[target.pageId] ??= {
        terrainEdits: {}, treeGrowth: {}, plantedCells: {}, placedEntities: {},
      };
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
      const edit = state.world.pages[command.target.pageId]?.terrainEdits[command.target.cellKey];
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
      if ((state.player.inventory[command.seedId] ?? 0) <= 0) state.player.selectedSeed = null;
      edit.state = seed.effect === 'mending' ? 'mending' : 'planted';
      edit.plantedSeedId = command.seedId;
      edit.plantedAt = command.now;
      edit.mendsAt = seed.effect === 'mending' ? command.now + bloomSeconds(command.seedId) * 1000 : undefined;
      edit.lastTendedAt = undefined;
      edit.tendCount = 0;
      edit.seedDropReady = false;
      edit.seedDrops = 0;
      edit.nextSeedDropAt = seed.effect === 'garden'
        ? nextSeedDropAt(command.target, edit.geologySeed, 0, command.now)
        : undefined;
      edit.changedAt = command.now;
      return {
        ok: true,
        message: seed.effect === 'mending'
          ? 'The Mend-me seed begins stitching the paper ground together.'
          : 'A Buttonbloom settles into its new garden bed.',
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
      // A loose seed lying beside the plant is not lost just because the
      // plant was lifted — the player already earned it.
      if (edit.seedDropReady) {
        state.player.inventory[seedId] = (state.player.inventory[seedId] ?? 0) + 1;
        grants[seedId] = (grants[seedId] ?? 0) + 1;
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
      edit.changedAt = command.now;

      const name = SEED_DEFS[seedId].name.replace(/ Seeds$/, '');
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
      if (!edit) return { ok: false, reason: 'Only a growing garden flower can be tended.' };
      if (edit.lastTendedAt && command.now - edit.lastTendedAt < TEND_COOLDOWN_MS) {
        return { ok: true, message: 'The Buttonbloom is still perky from your recent attention.' };
      }
      edit.lastTendedAt = command.now;
      edit.tendCount = (edit.tendCount ?? 0) + 1;
      const scheduled = edit.nextSeedDropAt
        ?? nextSeedDropAt(command.target, edit.geologySeed, edit.seedDrops ?? 0, command.now);
      edit.nextSeedDropAt = Math.max(command.now + 8_000, scheduled - TEND_SEED_BONUS_MS);
      edit.changedAt = command.now;
      return { ok: true, message: 'You smooth the leaves and fluff the paper soil. The Buttonbloom perks up.' };
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

      const page = state.world.pages[target.pageId] ??= {
        terrainEdits: {}, treeGrowth: {}, plantedCells: {}, placedEntities: {},
      };
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

    case 'updatePlantSeedDrop': {
      const edit = gardenEdit(state, command.target);
      if (!edit) return { ok: false, reason: 'That flower cannot make seeds.' };
      // Only a plant in full bloom sets seed. Previously a freshly sown bed
      // could drop one, which skipped the growth it was meant to reward.
      if (!edit.plantedSeedId) return { ok: false, reason: 'That flower cannot make seeds.' };
      if (plantStageAt(edit.plantedSeedId, edit.plantedAt ?? edit.changedAt, command.now) !== 'bloom') {
        return { ok: false, reason: 'It is still growing.' };
      }
      if (edit.seedDropReady) return { ok: true, message: 'A seed is already waiting beside the flower.' };
      if (!edit.nextSeedDropAt) {
        edit.nextSeedDropAt = nextSeedDropAt(command.target, edit.geologySeed, edit.seedDrops ?? 0, command.now);
        return { ok: true, message: 'The Buttonbloom begins preparing its next seed.' };
      }
      if (command.now < edit.nextSeedDropAt) return { ok: false, reason: 'The seed is still forming.' };
      edit.seedDropReady = true;
      edit.nextSeedDropAt = undefined;
      edit.changedAt = command.now;
      return { ok: true, message: 'A Buttonbloom seed has fluttered onto the ground.' };
    }

    case 'collectPlantSeed': {
      const edit = gardenEdit(state, command.target);
      if (!edit?.seedDropReady) return { ok: false, reason: 'There is no loose seed here.' };
      edit.seedDropReady = false;
      edit.seedDrops = (edit.seedDrops ?? 0) + 1;
      edit.nextSeedDropAt = nextSeedDropAt(command.target, edit.geologySeed, edit.seedDrops, command.now);
      edit.changedAt = command.now;
      state.player.inventory['buttonbloom-seeds'] = (state.player.inventory['buttonbloom-seeds'] ?? 0) + 1;
      return { ok: true, grants: { 'buttonbloom-seeds': 1 }, message: 'Collected 1 Buttonbloom seed.' };
    }

    case 'completeMending': {
      const page = state.world.pages[command.target.pageId];
      const edit = page?.terrainEdits[command.target.cellKey];
      if (!page || !edit || edit.state !== 'mending' || !edit.mendsAt) {
        return { ok: false, reason: 'That ground is not mending.' };
      }
      if (command.now < edit.mendsAt) return { ok: false, reason: 'The paper roots are still stitching.' };
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
  | { kind: 'no-plan' }
  | { kind: 'maker-level'; required: number }
  | { kind: 'previous-tier'; toolId: ToolId }
  | { kind: 'materials' }
  | { kind: 'busy' };

export function craftBlockers(state: GameState, recipeId: RecipeId): CraftBlocker[] {
  const recipe = RECIPE_DEFS[recipeId];
  if (!recipe) return [{ kind: 'unimplemented' }];
  const blockers: CraftBlocker[] = [];

  if (!isRecipeAvailable(recipeId)) blockers.push({ kind: 'unimplemented' });
  if (!state.player.plans.includes(recipeId)) blockers.push({ kind: 'no-plan' });
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
    case 'no-plan': return 'You have not found this plan yet.';
    case 'maker-level': return `Needs a level ${blocker.required} Thing Maker.`;
    case 'previous-tier': return `Make a ${TOOL_DEFS[blocker.toolId].name} first.`;
    case 'materials': return 'Not enough suitable materials.';
    case 'busy': return 'The Thing Maker is already working.';
  }
}

export function canStartRecipe(recipeId: RecipeId) {
  return craftBlockersFor(recipeId).length === 0;
}
