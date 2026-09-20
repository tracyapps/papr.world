import type { CommandResult } from './commands';
import type { GameState } from './state';
import { HOME_FALLBACK_PLACE, isNearHome } from '../world/homeSite';
import { HOME_INTERIOR_SCENE, SURFACE_SCENE } from '../world/scenes';

/**
 * Going through a door, as a command like any other (design in
 * `docs/scenes-and-interiors.md`), so it can be tested and, later, authorized
 * by a server. The sim only decides *whether* you may cross and records *which
 * scene you are in*; the renderer and the avatar follow the saved scene.
 */
export type SceneCommand =
  /** Step through the home's door. `from` is where the player stands outside. */
  | { type: 'enterScene'; scene: string; from: { x: number; z: number } }
  /** Step back out. Always allowed from inside: getting out is never a puzzle. */
  | { type: 'leaveScene' };

/** The saved Home place, or where it starts. */
export function homePlaceOf(state: GameState): { x: number; z: number } {
  const saved = state.player.places.find((place) => place.id === 'home');
  return saved ? { x: saved.x, z: saved.z } : { x: HOME_FALLBACK_PLACE.x, z: HOME_FALLBACK_PLACE.z };
}

export function applySceneCommand(state: GameState, command: SceneCommand): CommandResult {
  if (command.type === 'leaveScene') {
    if (state.player.scene === SURFACE_SCENE) return { ok: false, reason: 'You are already outside.' };
    state.player.scene = SURFACE_SCENE;
    return { ok: true, message: 'You step back outside.' };
  }

  if (command.scene !== HOME_INTERIOR_SCENE) return { ok: false, reason: 'There is no door to that place.' };
  if (state.player.scene !== SURFACE_SCENE) return { ok: false, reason: 'You are already inside.' };
  if (!isNearHome(command.from, homePlaceOf(state))) {
    return { ok: false, reason: 'Walk up to your home to go inside.' };
  }
  state.player.scene = HOME_INTERIOR_SCENE;
  return { ok: true, message: 'You step inside.' };
}

