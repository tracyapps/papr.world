import { registerMapFeature, removeMapFeature } from './mapFeatures';
import { getGameState, updateGameState, type SavedPlaceState } from '../sim/state';

// Saved places: like starred locations on a map. Home is created at the
// spawn point automatically and can be renamed but never removed.
// Persisted in localStorage; renderer-independent.

export type Place = SavedPlaceState;

export const HOME_PLACE_ID = 'home';
export const WOOD_MILL_PLACE_ID = 'wood-mill';

/** Stable navigation targets used by signs, the map, and the places panel.
 * Future shops only need another entry here plus an authored sign board. */
export const BUILTIN_NAVIGATION_PLACES: readonly Place[] = [
  { id: HOME_PLACE_ID, name: 'Home', x: -1.5, z: -2.2, builtin: true },
  { id: 'ribbonbark-forest', name: 'Ribbonbark Forest', x: -50, z: 0, builtin: true },
  { id: 'cardboard-desert', name: 'Cardboard Desert', x: 0, z: 50, builtin: true },
  { id: 'offcut-flats', name: 'Offcut Flats', x: 50, z: 0, builtin: true },
  { id: WOOD_MILL_PLACE_ID, name: 'Wood Mill', x: -94, z: 0, builtin: true },
];

export function getBuiltinNavigationPlace(id: string) {
  return BUILTIN_NAVIGATION_PLACES.find((place) => place.id === id) ?? null;
}

const listeners: Array<() => void> = [];

function notify() {
  for (const listener of listeners) listener();
}

/** Panels re-render when the place list changes. */
export function onPlacesChanged(listener: () => void) {
  listeners.push(listener);
}

function registerPlaceMarker(place: Place) {
  registerMapFeature({
    color: place.builtin ? '#d8a03c' : '#c9642f',
    id: `place:${place.id}`,
    kind: 'landmark',
    radiusX: 0.34,
    radiusZ: 0.34,
    shape: 'circle',
    x: place.x,
    z: place.z,
  });
}

/** Call once at startup with the spawn position; guarantees Home exists. */
export function initializePlaces(homeX: number, homeZ: number) {
  let home = getGameState().player.places.find((place) => place.id === HOME_PLACE_ID);
  if (!home) {
    home = { id: HOME_PLACE_ID, name: 'Home', x: homeX, z: homeZ, builtin: true };
    updateGameState((state) => state.player.places.unshift(home as Place));
  }

  updateGameState((state) => {
    for (const definition of BUILTIN_NAVIGATION_PLACES) {
      if (definition.id === HOME_PLACE_ID) continue;
      const existing = state.player.places.find((place) => place.id === definition.id);
      if (existing) {
        existing.x = definition.x;
        existing.z = definition.z;
        existing.builtin = true;
      } else {
        state.player.places.push({ ...definition });
      }
    }
  });

  for (const place of getGameState().player.places) registerPlaceMarker(place);
  notify();
}

export function getPlaces(): readonly Place[] {
  return getGameState().player.places;
}

export function getPlace(id: string): Place | null {
  return getGameState().player.places.find((place) => place.id === id) ?? null;
}

export function suggestedPlaceName() {
  return `Place ${getGameState().player.nextPlaceNumber}`;
}

export function addPlace(name: string, x: number, z: number): Place {
  const trimmed = name.trim() || suggestedPlaceName();
  const place: Place = {
    id: `place-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    name: trimmed,
    x,
    z,
    builtin: false,
  };
  updateGameState((state) => {
    state.player.places.push(place);
    state.player.nextPlaceNumber += 1;
  });
  registerPlaceMarker(place);
  notify();
  return place;
}

export function renamePlace(id: string, name: string): boolean {
  const place = getPlace(id);
  const trimmed = name.trim();
  if (!place || !trimmed) return false;
  updateGameState((state) => {
    const stored = state.player.places.find((entry) => entry.id === id);
    if (stored) stored.name = trimmed;
  });
  notify();
  return true;
}

export function removePlace(id: string): boolean {
  const place = getPlace(id);
  if (!place || place.builtin) return false;
  updateGameState((state) => {
    const index = state.player.places.findIndex((entry) => entry.id === id);
    if (index >= 0) state.player.places.splice(index, 1);
  });
  removeMapFeature(`place:${id}`);
  notify();
  return true;
}
