import * as THREE from 'three';
import { clamp } from '../core/math';
import { resizeMiniMapCanvas } from './minimap';

// Draggable/resizable HUD widgets (minimap, compass) with localStorage
// persistence, plus the compass rose readout.

type HudWidgetId = 'compass' | 'miniMap';

type HudWidgetState = {
  scale: number;
  x: number;
  y: number;
};

type HudWidgetConfig = {
  id: HudWidgetId;
  element: HTMLElement | null;
  minScale: number;
  maxScale: number;
  defaultScale: number;
  defaultPosition: () => Pick<HudWidgetState, 'x' | 'y'>;
  afterApply?: () => void;
};

type HudWidgetInteraction = {
  id: HudWidgetId;
  kind: 'drag' | 'resize';
  originScale: number;
  originX: number;
  originY: number;
  pointerId: number;
  startX: number;
  startY: number;
};

const miniMapWidget = document.querySelector<HTMLElement>('#mini-map-widget');
const compassWidget = document.querySelector<HTMLElement>('#compass-widget');
const compassRoseElement = document.querySelector<HTMLElement>('#compass-rose');
const compassHeadingElement = document.querySelector<HTMLElement>('#compass-heading');

const hudWidgetStoragePrefix = 'paper-clearing.hud-widget.v1';
const hudWidgetStates = new Map<HudWidgetId, HudWidgetState>();
let hudWidgetInteraction: HudWidgetInteraction | null = null;

const hudWidgetConfigs: HudWidgetConfig[] = [
  {
    id: 'miniMap',
    element: miniMapWidget,
    minScale: 0.9,
    maxScale: 2.35,
    defaultScale: 1,
    defaultPosition: () => ({
      x: window.innerWidth - ((miniMapWidget?.offsetWidth ?? 156) + 16),
      y: 16,
    }),
    afterApply: resizeMiniMapCanvas,
  },
  {
    id: 'compass',
    element: compassWidget,
    minScale: 0.9,
    maxScale: 2.6,
    defaultScale: 1,
    // Defaults into the right-hand column, directly beneath the minimap.
    // It previously defaulted to dead centre at y:76, which is exactly where
    // the region banner and the pet toast also lived — three overlays in one
    // strip, with the compass (z:8) losing to both. Top-centre is now
    // reserved for the region banner alone.
    // This is a default, not a constraint: the widget stays draggable, and a
    // player who has already moved it keeps their saved position.
    defaultPosition: () => ({
      x: window.innerWidth - ((compassWidget?.offsetWidth ?? 76) + 16),
      y: 16 + (miniMapWidget?.offsetHeight ?? 156) + 12,
    }),
  },
];

function getHudWidgetConfig(id: HudWidgetId) {
  return hudWidgetConfigs.find((config) => config.id === id) ?? null;
}

function getHudWidgetStorageKey(id: HudWidgetId) {
  return `${hudWidgetStoragePrefix}.${id}`;
}

function getDefaultHudWidgetState(config: HudWidgetConfig): HudWidgetState {
  return {
    ...config.defaultPosition(),
    scale: config.defaultScale,
  };
}

function loadHudWidgetState(config: HudWidgetConfig): HudWidgetState {
  const fallback = getDefaultHudWidgetState(config);

  try {
    const stored = localStorage.getItem(getHudWidgetStorageKey(config.id));
    if (!stored) return fallback;

    const parsed = JSON.parse(stored) as Partial<HudWidgetState>;
    const parsedX = parsed.x;
    const parsedY = parsed.y;
    const parsedScale = parsed.scale;
    if (
      typeof parsedX !== 'number'
      || typeof parsedY !== 'number'
      || typeof parsedScale !== 'number'
      || !Number.isFinite(parsedX)
      || !Number.isFinite(parsedY)
      || !Number.isFinite(parsedScale)
    ) {
      return fallback;
    }

    return {
      x: parsedX,
      y: parsedY,
      scale: clamp(parsedScale, config.minScale, config.maxScale),
    };
  } catch {
    return fallback;
  }
}

function saveHudWidgetState(id: HudWidgetId) {
  const state = hudWidgetStates.get(id);
  if (!state) return;

  try {
    localStorage.setItem(getHudWidgetStorageKey(id), JSON.stringify(state));
  } catch {
    // If storage is unavailable, the HUD still works for the current session.
  }
}

function clampHudWidgetState(config: HudWidgetConfig, state: HudWidgetState): HudWidgetState {
  const element = config.element;
  const baseWidth = element?.offsetWidth ?? 1;
  const baseHeight = element?.offsetHeight ?? 1;
  const scale = clamp(state.scale, config.minScale, config.maxScale);
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - baseWidth * scale - margin);
  const maxY = Math.max(margin, window.innerHeight - baseHeight * scale - margin);

  return {
    scale,
    x: clamp(state.x, margin, maxX),
    y: clamp(state.y, margin, maxY),
  };
}

function applyHudWidgetState(config: HudWidgetConfig, state: HudWidgetState) {
  if (!config.element) return;

  const clampedState = clampHudWidgetState(config, state);
  hudWidgetStates.set(config.id, clampedState);
  config.element.style.left = `${clampedState.x}px`;
  config.element.style.top = `${clampedState.y}px`;
  config.element.style.setProperty('--hud-scale', String(clampedState.scale));
  config.afterApply?.();
}

export function refreshHudWidgets() {
  for (const config of hudWidgetConfigs) {
    const state = hudWidgetStates.get(config.id) ?? getDefaultHudWidgetState(config);
    applyHudWidgetState(config, state);
  }
}

export function isHudWidgetInteractionActive() {
  return hudWidgetInteraction !== null;
}

function handleHudWidgetPointerMove(event: PointerEvent) {
  if (!hudWidgetInteraction) return;

  const config = getHudWidgetConfig(hudWidgetInteraction.id);
  if (!config?.element) return;

  event.preventDefault();
  const deltaX = event.clientX - hudWidgetInteraction.startX;
  const deltaY = event.clientY - hudWidgetInteraction.startY;

  if (hudWidgetInteraction.kind === 'drag') {
    applyHudWidgetState(config, {
      scale: hudWidgetInteraction.originScale,
      x: hudWidgetInteraction.originX + deltaX,
      y: hudWidgetInteraction.originY + deltaY,
    });
    return;
  }

  const baseWidth = config.element.offsetWidth || 1;
  const baseHeight = config.element.offsetHeight || 1;
  const scaleDelta = Math.max(deltaX / baseWidth, deltaY / baseHeight);
  applyHudWidgetState(config, {
    scale: hudWidgetInteraction.originScale + scaleDelta,
    x: hudWidgetInteraction.originX,
    y: hudWidgetInteraction.originY,
  });
}

function finishHudWidgetInteraction(event: PointerEvent) {
  if (!hudWidgetInteraction) return;
  if (event.pointerId !== hudWidgetInteraction.pointerId) return;

  const config = getHudWidgetConfig(hudWidgetInteraction.id);
  if (config?.element?.hasPointerCapture(hudWidgetInteraction.pointerId)) {
    config.element.releasePointerCapture(hudWidgetInteraction.pointerId);
  }
  config?.element?.classList.remove('is-dragging', 'is-resizing');
  saveHudWidgetState(hudWidgetInteraction.id);
  hudWidgetInteraction = null;
  event.stopPropagation();
}

export function initializeHudWidgets() {
  for (const config of hudWidgetConfigs) {
    const element = config.element;
    if (!element) continue;

    const state = loadHudWidgetState(config);
    applyHudWidgetState(config, state);

    element.addEventListener('pointerdown', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      event.stopPropagation();
      event.preventDefault();

      const isResize = target.closest('[data-hud-resize]');
      const currentState = hudWidgetStates.get(config.id) ?? getDefaultHudWidgetState(config);
      hudWidgetInteraction = {
        id: config.id,
        kind: isResize ? 'resize' : 'drag',
        originScale: currentState.scale,
        originX: currentState.x,
        originY: currentState.y,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
      element.setPointerCapture(event.pointerId);
      element.classList.toggle('is-dragging', !isResize);
      element.classList.toggle('is-resizing', Boolean(isResize));
    });

    element.addEventListener('wheel', (event) => {
      event.stopPropagation();
    });
  }

  window.addEventListener('pointermove', handleHudWidgetPointerMove);
  window.addEventListener('pointerup', finishHudWidgetInteraction);
  window.addEventListener('pointercancel', finishHudWidgetInteraction);
}

function normalizeDegrees(degrees: number) {
  return ((degrees % 360) + 360) % 360;
}

function formatCompassHeading(degrees: number) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return directions[Math.round(normalizeDegrees(degrees) / 45) % directions.length];
}

export function updateCompass(yaw: number) {
  const yawDegrees = THREE.MathUtils.radToDeg(yaw);
  compassRoseElement?.style.setProperty('--compass-spin', `${yawDegrees}deg`);
  if (compassHeadingElement) {
    compassHeadingElement.textContent = formatCompassHeading(-yawDegrees);
  }
}
