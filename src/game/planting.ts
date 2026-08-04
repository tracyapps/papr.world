import { SEED_DEFS, plantStageAt } from '../sim/catalogs/seeds';
import { dispatchGameCommand } from '../sim/commands';
import { getGameState } from '../sim/state';
import { terrainCellAt, type TerrainCellAddress } from '../sim/terrainCells';
import { refreshBuiltTerrainNear } from '../world/streaming';
import { pageId, pageOfPosition } from '../world/types';
import { avatar } from './avatar';
import { playCozySound } from './cozyAudio';
import { showPetToast } from './petting';
import { pickTerrainAtScreen } from './toolActions';
import { getActionMode } from './actionMode';
import { resolveGardenAction, selectedSeed, type GardenAction } from './gardenActions';
import { showGardenRefusal } from '../ui/gardenHint';

export const PLANT_REACH = 3.1;
let nextMendingRefresh = 0;

function pageIdAt(x: number, z: number) {
  const page = pageOfPosition(x, z);
  return pageId(page.px, page.pz);
}

/** The cell under a screen point, plus whether the avatar can reach it. */
export function gardenTargetAtScreen(clientX: number, clientY: number): {
  target: TerrainCellAddress | null;
  inReach: boolean;
} {
  const point = pickTerrainAtScreen(clientX, clientY);
  if (!point) return { target: null, inReach: false };
  const inReach = Math.hypot(point.x - avatar.position.x, point.z - avatar.position.z) <= PLANT_REACH;
  return { target: terrainCellAt(point.x, point.z, pageIdAt), inReach };
}

/** Resolve what the hoe would do under the cursor. Shared by cursor + click. */
export function gardenActionAtScreen(clientX: number, clientY: number): {
  action: GardenAction;
  target: TerrainCellAddress | null;
} {
  const { target, inReach } = gardenTargetAtScreen(clientX, clientY);
  return { action: resolveGardenAction(target, { inReach }), target };
}

export function hasPlantActionAt(clientX: number, clientY: number) {
  if (getActionMode() !== 'plant') return false;
  // Any resolvable hoe action counts as a target, including a refusal — the
  // click must be consumed so the player gets an explanation rather than the
  // silent nothing of a click that falls through to the world.
  const { action } = gardenActionAtScreen(clientX, clientY);
  return action.kind !== 'none';
}

export function tryPlantAt(clientX: number, clientY: number) {
  if (getActionMode() !== 'plant') return false;
  const { action, target } = gardenActionAtScreen(clientX, clientY);
  if (!target || action.kind === 'none') return false;

  if (!action.ok) {
    showGardenRefusal(action);
    return true;
  }

  switch (action.kind) {
    case 'plant': {
      const seedId = selectedSeed();
      if (!seedId) return false;
      const result = dispatchGameCommand({ type: 'plantTerrain', target, seedId, now: Date.now() });
      if (!result.ok) {
        showPetToast(result.reason);
        return true;
      }
      refreshBuiltTerrainNear(target.x, target.z);
      playCozySound(SEED_DEFS[seedId].effect === 'mending' ? 'rustle' : 'chime');
      showPetToast(result.message);
      return true;
    }

    case 'lift': {
      const result = dispatchGameCommand({ type: 'liftPlant', target, now: Date.now() });
      if (!result.ok) {
        showPetToast(result.reason);
        return true;
      }
      refreshBuiltTerrainNear(target.x, target.z);
      playCozySound('rustle');
      showPetToast(result.message);
      return true;
    }

    case 'refill': {
      const result = dispatchGameCommand({ type: 'refillTerrain', target, now: Date.now() });
      if (!result.ok) {
        showPetToast(result.reason);
        return true;
      }
      refreshBuiltTerrainNear(target.x, target.z);
      playCozySound('plop');
      showPetToast(result.message);
      return true;
    }

    default:
      return false;
  }
}

/**
 * Last stage each plant was *built* at.
 *
 * Plant meshes are constructed once when a page streams in. Because stage is
 * derived from elapsed time rather than stored, nothing would otherwise
 * notice a plant crossing into its next stage — it would keep its sprout mesh
 * until something unrelated forced a rebuild. This tracks what is on screen so
 * a growth step can trigger exactly one rebuild.
 */
const builtStages = new Map<string, string>();

/** Mending uses wall-clock timestamps, so it finishes correctly after a page
 * unload or a game restart. Visible ground eases upward once per second. */
export function updatePlanting() {
  const now = Date.now();
  if (now < nextMendingRefresh) return;
  nextMendingRefresh = now + 1000;
  const pages = getGameState().world.pages;

  for (const [pageIdValue, page] of Object.entries(pages)) {
    for (const [cellKey, edit] of Object.entries(page.terrainEdits)) {
      const target: TerrainCellAddress = { pageId: pageIdValue, cellKey, x: edit.x, z: edit.z };
      const id = `${pageIdValue}:${cellKey}`;

      if (edit.state === 'mending' && edit.mendsAt) {
        if (now >= edit.mendsAt) {
          const result = dispatchGameCommand({ type: 'completeMending', target, now });
          if (result.ok) showPetToast(result.message);
          builtStages.delete(id);
        }
        refreshBuiltTerrainNear(edit.x, edit.z);
        continue;
      }

      if (edit.state !== 'planted' || !edit.plantedSeedId) {
        builtStages.delete(id);
        continue;
      }

      const stage = plantStageAt(edit.plantedSeedId, edit.plantedAt ?? edit.changedAt, now);
      if (builtStages.get(id) === stage) continue;
      const previous = builtStages.get(id);
      builtStages.set(id, stage);
      refreshBuiltTerrainNear(edit.x, edit.z);
      // Announce real growth, but not the initial build — a plant that was
      // already grown when its page streamed in has not just grown.
      if (previous && previous !== stage) {
        playCozySound('chime');
        showPetToast(stage === 'bloom'
          ? `The ${SEED_DEFS[edit.plantedSeedId].name.replace(/ Seeds$/, '')} has opened.`
          : 'Something in the garden has grown a little.');
      }
    }
  }
}
