import { SEED_DEFS, plantStageAt, type SeedId } from '../sim/catalogs/seeds';
import { TOOL_DEFS } from '../sim/catalogs/tools';
import { findCrowdingPlant, refillCost } from '../sim/commands';
import { getGameState, type GameState, type TerrainEditCellState } from '../sim/state';
import type { TerrainCellAddress } from '../sim/terrainCells';
import { RESOURCE_CORE_DEFS, type ResourceId } from '../sim/catalogs/resources';

// What the hoe would do at a given cell, and why it can or cannot.
//
// This is a *pure query*, separate from performing the action, because three
// different consumers need the same answer and must never disagree:
//
//   - the 3D preview overlay (ghost plant, valid/invalid tint)
//   - the cursor hit-test
//   - the click handler, and the card explaining a refusal
//
// Previously the cursor and the command each decided validity in their own
// way, which is how you end up with a cursor that says yes and a click that
// says no. One resolver, three readers.

export type GardenActionKind = 'plant' | 'lift' | 'refill' | 'none';

/** Shared reach for input and the always-visible hoe overlay. */
export const GARDEN_REACH = 3.1;

export type GardenBlocker =
  | { kind: 'no-tool' }
  | { kind: 'out-of-reach' }
  | { kind: 'no-bed' }
  | { kind: 'crowded'; by: SeedId; distance: number; required: number }
  | { kind: 'no-seed' }
  | { kind: 'needs-fill'; required: number; available: number }
  | { kind: 'occupied'; by: SeedId };

export type GardenAction = {
  kind: GardenActionKind;
  ok: boolean;
  /** Present when `ok` is false. */
  blocker?: GardenBlocker;
  /** The plant already in this cell, if any. */
  existing?: { seedId: SeedId; stage: ReturnType<typeof plantStageAt> };
  /** Fill cost for a refill action. */
  cost?: number;
};

export function holdsHoe(state: GameState = getGameState()): boolean {
  const toolId = state.player.equippedTool;
  if (!toolId || (state.player.tools[toolId] ?? 0) <= 0) return false;
  return TOOL_DEFS[toolId].verb === 'plant';
}

export function selectedSeed(state: GameState = getGameState()): SeedId | null {
  const seedId = state.player.selectedSeed;
  return seedId && (state.player.inventory[seedId] ?? 0) > 0 ? seedId : null;
}

function soilOnHand(state: GameState): number {
  return (Object.keys(RESOURCE_CORE_DEFS) as ResourceId[])
    .filter((resource) => RESOURCE_CORE_DEFS[resource].category === 'soil')
    .reduce((total, resource) => total + (state.player.inventory[resource] ?? 0), 0);
}

function editAt(state: GameState, target: TerrainCellAddress): TerrainEditCellState | undefined {
  return state.world.pages[target.pageId]?.terrainEdits[target.cellKey];
}

/**
 * Resolve the hoe's action at a cell.
 *
 * The rule is "the hoe does what your hands are holding": with a seed
 * selected it sows, without one it rakes the hole closed. A cell that already
 * has something growing is always a lift, regardless of what you are holding,
 * because that is the only way to clear it.
 */
export function resolveGardenAction(
  target: TerrainCellAddress | null,
  options: { inReach: boolean; state?: GameState } = { inReach: true },
): GardenAction {
  const state = options.state ?? getGameState();

  if (!holdsHoe(state)) return { kind: 'none', ok: false, blocker: { kind: 'no-tool' } };
  if (!target) return { kind: 'none', ok: false, blocker: { kind: 'no-bed' } };
  if (!options.inReach) return { kind: 'none', ok: false, blocker: { kind: 'out-of-reach' } };

  const edit = editAt(state, target);
  if (!edit) return { kind: 'none', ok: false, blocker: { kind: 'no-bed' } };

  // Something is growing here: the only thing the hoe can do is lift it.
  if (edit.state !== 'dug' && edit.plantedSeedId) {
    return {
      kind: 'lift',
      ok: true,
      existing: {
        seedId: edit.plantedSeedId,
        stage: plantStageAt(edit.plantedSeedId, edit.plantedAt ?? edit.changedAt, Date.now()),
      },
    };
  }

  const seedId = selectedSeed(state);
  if (!seedId) {
    // Empty hands over an empty bed: rake it closed.
    const cost = refillCost(edit.depth);
    const available = soilOnHand(state);
    if (cost > available) {
      return { kind: 'refill', ok: false, cost, blocker: { kind: 'needs-fill', required: cost, available } };
    }
    return { kind: 'refill', ok: true, cost };
  }

  const crowding = findCrowdingPlant(state, target, seedId);
  if (crowding) {
    return {
      kind: 'plant',
      ok: false,
      blocker: {
        kind: 'crowded',
        by: crowding.seedId,
        distance: crowding.distance,
        required: crowding.required,
      },
    };
  }
  return { kind: 'plant', ok: true };
}

/** Short plant name without the trailing "Seeds". */
export function plantName(seedId: SeedId): string {
  return SEED_DEFS[seedId].name.replace(/ Seeds$/, '');
}
