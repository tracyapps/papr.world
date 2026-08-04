import { dispatchGameCommand } from '../sim/commands';
import { getGameState, onGameStateChanged } from '../sim/state';
import type { ResourceId } from '../world/types';

// Compatibility-facing inventory API for harvesting and the scrapbook. The
// authoritative data now lives in the unified, versioned game state.

export function getResourceCount(resource: ResourceId) {
  return getGameState().player.inventory[resource] ?? 0;
}

export function getResourceInventory() {
  return { ...getGameState().player.inventory };
}

export function addResource(resource: ResourceId, amount: number) {
  dispatchGameCommand({ type: 'collectResource', resource, amount });
}

export function onResourceInventoryChanged(listener: () => void) {
  return onGameStateChanged(listener);
}
