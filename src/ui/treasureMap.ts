// The treasure map — a rough, hand-inked map of the paper world.
//
// Deliberately NOT the real map (roadmap Phase 5 waits on that design). It is
// a sketch: north up, no panning, no search. Where you have walked is inked
// and hatched; everywhere else is a soft watercolour wash of what the land is
// rumoured to be, with the nearest of each land written in as a guess. Home is
// the red X. Everything it shows is also written out beside it as text.
//
// Opened with N, the "Map" button by the minimap, or the scrapbook's Map tab.

import { getYaw } from '../game/camera';
import { avatar } from '../game/avatar';
import {
  BIOME_MAP_NAMES,
  compassArrow,
  compassPoint,
  distanceWords,
  bearingBetween,
  type BiomeDirection,
} from '../world/biomeCompass';
import { getPlaces } from '../world/places';
import { describeHint } from './directionHints';
import { WASH, drawTreasureMap } from './treasureMapDraw';
import {
  buildTreasureMapModel,
  describeTreasureMap,
  type MapScale,
  type TreasureMapModel,
} from './treasureMapModel';

// ---- The overlay -------------------------------------------------------------

let overlay: HTMLElement | null = null;
let scale: MapScale = 'near';
let opener: HTMLElement | null = null;
let onResize: (() => void) | null = null;
let swallowKeys: ((event: KeyboardEvent) => void) | null = null;

export function isTreasureMapOpen(): boolean {
  return overlay !== null;
}

function headingDegrees(): number {
  // Same convention as the HUD compass: heading = -yaw.
  const degrees = (-getYaw() * 180) / Math.PI;
  return ((degrees % 360) + 360) % 360;
}

function redraw(): void {
  if (!overlay) return;
  const canvas = overlay.querySelector<HTMLCanvasElement>('.treasure-map-canvas');
  const notes = overlay.querySelector<HTMLElement>('[data-role="notes"]');
  if (!canvas) return;
  const model = buildTreasureMapModel(avatar.position.x, avatar.position.z, scale, getPlaces());
  const size = Math.max(240, Math.round(canvas.clientWidth || 560));
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(size * ratio);
  canvas.height = Math.round(size * ratio);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawTreasureMap(ctx, size, model, headingDegrees());
  }
  const summary = describeTreasureMap(model, describeHint);
  canvas.setAttribute('aria-label', `Treasure map, north at the top. ${summary}`);
  if (notes) renderNotes(notes, model);
}

function renderNotes(host: HTMLElement, model: TreasureMapModel): void {
  const list = document.createElement('ul');
  list.className = 'treasure-map-list';
  const item = (text: string, swatch?: string) => {
    const li = document.createElement('li');
    if (swatch) {
      const dot = document.createElement('span');
      dot.className = 'treasure-map-swatch';
      dot.style.setProperty('--swatch', swatch);
      dot.setAttribute('aria-hidden', 'true');
      li.append(dot);
    }
    li.append(document.createTextNode(text));
    list.append(li);
  };
  const toward = (x: number, z: number) => {
    const bearing = bearingBetween(model.centerX, model.centerZ, x, z);
    const distance = Math.hypot(x - model.centerX, z - model.centerZ);
    return `${compassPoint(bearing)} ${compassArrow(bearing)}, ${distanceWords(distance)}`;
  };
  for (const hint of model.rumours as BiomeDirection[]) {
    const name = BIOME_MAP_NAMES[hint.biome];
    item(`The ${name} — ${toward(hint.x, hint.z)}`, WASH[hint.biome]);
  }
  for (const place of model.places.filter((p) => p.kind !== 'place').slice(0, 4)) {
    item(`${place.name} — ${toward(place.x, place.z)}`);
  }
  const heading = document.createElement('h3');
  heading.id = 'treasure-map-notes-title';
  heading.textContent = 'From where you stand';
  const explored = document.createElement('p');
  explored.className = 'treasure-map-explored';
  explored.textContent = model.exploredPages === 1
    ? 'You have inked 1 page of this map so far.'
    : `You have inked ${model.exploredPages} pages of this map so far.`;
  host.replaceChildren(heading, list, explored);
}

export function closeTreasureMap(): boolean {
  if (!overlay) return false;
  overlay.remove();
  overlay = null;
  if (onResize) window.removeEventListener('resize', onResize);
  if (swallowKeys) {
    window.removeEventListener('keydown', swallowKeys, true);
    window.removeEventListener('keyup', swallowKeys, true);
  }
  onResize = null;
  swallowKeys = null;
  opener?.focus();
  opener = null;
  return true;
}

export function openTreasureMap(): void {
  if (overlay) return;
  opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const element = document.createElement('div');
  element.className = 'hud-overlay treasure-map is-open';
  element.innerHTML = `
    <div class="hud-overlay-card treasure-map-card" role="dialog" aria-modal="true"
         aria-labelledby="treasure-map-title">
      <button class="hud-overlay-close" type="button" aria-label="Fold the map away">×</button>
      <p class="hud-overlay-kicker">Pencil and Paper</p>
      <h2 id="treasure-map-title">Your treasure map</h2>
      <p class="treasure-map-lead">Inked where you have been. Everything else is rumour — washed in
        from what the land lets slip. The red X is home.</p>
      <div class="treasure-map-scale" role="group" aria-label="How much of the map to show">
        <button type="button" data-scale="near">Nearby</button>
        <button type="button" data-scale="far">Far and wide</button>
      </div>
      <div class="treasure-map-body">
        <canvas class="treasure-map-canvas" role="img"></canvas>
        <section class="treasure-map-notes" data-role="notes" aria-labelledby="treasure-map-notes-title"></section>
      </div>
    </div>`;
  overlay = element;

  const syncScaleButtons = () => {
    for (const button of element.querySelectorAll<HTMLButtonElement>('[data-scale]')) {
      button.setAttribute('aria-pressed', String(button.dataset.scale === scale));
    }
  };
  element.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.classList.contains('hud-overlay-close') || target === element) {
      closeTreasureMap();
      return;
    }
    const button = target.closest<HTMLButtonElement>('[data-scale]');
    if (button) {
      scale = button.dataset.scale === 'far' ? 'far' : 'near';
      syncScaleButtons();
      redraw();
    }
  });
  // The world listens on the window; keep map clicks and scrolls here.
  for (const eventName of ['pointerdown', 'pointerup', 'wheel', 'click', 'contextmenu'] as const) {
    element.addEventListener(eventName, (event) => event.stopPropagation());
  }
  swallowKeys = (event: KeyboardEvent) => {
    if (event.type === 'keydown' && (event.key === 'Escape' || event.code === 'KeyM')) {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
      if (event.key === 'Escape' || !typing) {
        event.preventDefault();
        event.stopPropagation();
        closeTreasureMap();
        return;
      }
    }
    if (event.target instanceof Node && element.contains(event.target)) return;
    event.stopPropagation();
  };
  window.addEventListener('keydown', swallowKeys, true);
  window.addEventListener('keyup', swallowKeys, true);
  onResize = () => redraw();
  window.addEventListener('resize', onResize);

  document.body.append(element);
  syncScaleButtons();
  redraw();
  element.querySelector<HTMLButtonElement>(`[data-scale="${scale}"]`)?.focus();
}

export function toggleTreasureMap(): void {
  if (overlay) closeTreasureMap();
  else openTreasureMap();
}

/** A "Map (M)" button beside the minimap's place controls. */
export function installTreasureMapButton(): void {
  const row = document.querySelector<HTMLElement>('#mini-map-goto .places-buttons');
  if (!row || row.querySelector('[data-open-treasure-map]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'places-button';
  button.dataset.openTreasureMap = '';
  button.textContent = 'Map (M)';
  button.addEventListener('click', () => openTreasureMap());
  row.prepend(button);
}
