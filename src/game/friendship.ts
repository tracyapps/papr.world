// Friendship groundwork: per-critter relationship points, persisted
// locally for now. The server will own this in multiplayer (per player).
// Interactions that grant points arrive with the interaction verbs pass —
// see docs/critter-design.md for the planned progression.

export type FriendshipLevel = 'stranger' | 'curious' | 'friend' | 'buddy' | 'pet';

import { getGameState, updateGameState } from '../sim/state';

const LEVEL_THRESHOLDS: Array<{ level: FriendshipLevel; min: number }> = [
  { level: 'pet', min: 90 },
  { level: 'buddy', min: 60 },
  { level: 'friend', min: 30 },
  { level: 'curious', min: 10 },
  { level: 'stranger', min: 0 },
];

export function getFriendshipPoints(critterId: string): number {
  return getGameState().player.friendships[critterId] ?? 0;
}

export function addFriendshipPoints(critterId: string, amount: number) {
  updateGameState((state) => {
    const store = state.player.friendships;
    store[critterId] = Math.max(0, Math.min(100, (store[critterId] ?? 0) + amount));
  });
}

export function getFriendshipLevel(critterId: string): FriendshipLevel {
  const value = getFriendshipPoints(critterId);
  return LEVEL_THRESHOLDS.find((entry) => value >= entry.min)?.level ?? 'stranger';
}

/**
 * 0..1 boldness boost used at spawn: friendlier critters notice you from
 * farther away and are less shy about coming over.
 */
export function getBoldnessBoost(critterId: string): number {
  return getFriendshipPoints(critterId) / 100;
}
