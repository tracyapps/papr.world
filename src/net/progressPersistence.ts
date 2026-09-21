import type { SharedSessionPhase } from './sharedSession';

export type ProgressPersistenceCopy = {
  label: string;
  summary: string;
  server: string;
  local: string;
};

/**
 * The save boundary in plain language.
 *
 * A green neighborhood connection proves that shared records can reach the
 * server. It does not turn the browser's solo/game save into an account save,
 * and the UI must never let those two facts blur together.
 */
export function progressPersistenceCopy(phase: SharedSessionPhase): ProgressPersistenceCopy {
  const online = phase === 'online';
  return {
    label: online ? 'Partly server-saved' : 'Saved on this browser',
    summary: online
      ? 'The neighborhood is connected, but your full game progress is not synced between browsers yet.'
      : 'Your full game progress is saved in this browser, not to your account.',
    server: online
      ? 'Server-kept: home locations, shared placed builds, mail, friends, saved looks, and the Neighborhood Pouch.'
      : 'Connect to a shared world for its home locations, placed builds, mail, friends, saved looks, and Neighborhood Pouch.',
    local: 'This browser only: tech tree, crafted tools, gathered resources, quests, gardens, and house upgrades.',
  };
}
