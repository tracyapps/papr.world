// "Which way is the jungle?" on the compass.
//
// Small coloured ticks sit around the compass rose, one per nearby biome you
// are not standing in, pointing the way. Because the rose already turns with
// the camera, a tick placed at its bearing inside the rose stays pointing at
// the right place in the world as you look around — no extra maths per frame.
//
// Recomputed only when you step onto a new page, and then off the frame (a
// fresh search can sample a few thousand pages the first time; after that
// the answers are cached). Screen readers get the same thing as a sentence.

import {
  BIOME_MAP_NAMES,
  compassPoint,
  distanceWords,
  nearestBiomes,
  pageBiome,
  type BiomeDirection,
} from '../world/biomeCompass';
import { getGroundMapColor } from '../world/pageRuntime';
import { PAGE_SIZE } from '../world/types';

/** How many ticks the rose shows — enough to orient, few enough to read. */
const MAX_TICKS = 4;

let lastPageKey = '';
let pending: ReturnType<typeof setTimeout> | null = null;
let hints: BiomeDirection[] = [];
const listeners = new Set<(hints: BiomeDirection[]) => void>();

/** Nearest other biomes from the last page you stood on, nearest first. */
export function getDirectionHints(): readonly BiomeDirection[] {
  return hints;
}

export function onDirectionHintsChanged(listener: (hints: BiomeDirection[]) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function describeHint(hint: BiomeDirection): string {
  return `${BIOME_MAP_NAMES[hint.biome]}: ${compassPoint(hint.bearing)}, ${distanceWords(hint.distance)}`;
}

function ensureElements() {
  const rose = document.querySelector<HTMLElement>('#compass-rose');
  let ticks = rose?.querySelector<HTMLElement>('.compass-biome-ticks') ?? null;
  if (rose && !ticks) {
    ticks = document.createElement('span');
    ticks.className = 'compass-biome-ticks';
    ticks.setAttribute('aria-hidden', 'true');
    rose.append(ticks);
  }
  const widget = document.querySelector<HTMLElement>('#mini-map-widget');
  let spoken = widget?.querySelector<HTMLElement>('#direction-hints-text') ?? null;
  if (widget && !spoken) {
    spoken = document.createElement('p');
    spoken.id = 'direction-hints-text';
    spoken.className = 'sr-only';
    widget.append(spoken);
  }
  return { ticks, spoken };
}

function render(x: number, z: number) {
  const here = pageBiome(Math.round(x / PAGE_SIZE), Math.round(z / PAGE_SIZE));
  hints = nearestBiomes(x, z).filter((hint) => hint.biome !== here);
  const { ticks, spoken } = ensureElements();
  if (ticks) {
    ticks.replaceChildren(...hints.slice(0, MAX_TICKS).map((hint, index) => {
      const tick = document.createElement('span');
      tick.className = 'compass-biome-tick';
      tick.dataset.biome = hint.biome;
      tick.style.setProperty('--bearing', `${hint.bearing.toFixed(1)}deg`);
      tick.style.setProperty('--tick-color', getGroundMapColor(hint.biome));
      // The nearest reads a little bolder; far ones fade a touch.
      tick.style.setProperty('--tick-strength', index === 0 ? '1' : hint.distance > 1000 ? '0.6' : '0.85');
      tick.title = describeHint(hint);
      return tick;
    }));
  }
  if (spoken) {
    spoken.textContent = hints.length > 0
      ? `Nearby lands — ${hints.slice(0, MAX_TICKS).map(describeHint).join('; ')}.`
      : '';
  }
  for (const listener of listeners) listener(hints);
}

/** Call every frame; it only does work when you step onto a new page. */
export function updateDirectionHints(x: number, z: number): void {
  const key = `${Math.round(x / PAGE_SIZE)},${Math.round(z / PAGE_SIZE)}`;
  if (key === lastPageKey) return;
  lastPageKey = key;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    render(x, z);
  }, 0);
}
