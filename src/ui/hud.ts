import * as THREE from 'three';
import { clamp } from '../core/math';
import { resizeMiniMapCanvas } from './minimap';

// Draggable/resizable HUD widgets (the minimap — with the compass now
// attached to its corner rather than floating separately — the Professor,
// and, once a shared session connects, the neighborhood chat) with
// localStorage persistence, plus the compass rose readout.
//
// Repositioning here was pointer-drag-only until the Professor needed a
// keyboard path too (knowledge-tree.md: "Repositioning needs a keyboard
// path, not drag-only"). The nudge below is generic across every widget in
// `hudWidgetConfigs`, so every widget gets it for free rather than the
// Professor quietly being the one accessible widget among the rest.
//
// Widgets present from page load are wired in `initializeHudWidgets()`; one
// that only exists once something else happens (the chat, once a shared
// session connects) joins the same system late through
// `registerDraggableHudWidget()` instead.

type HudWidgetId = 'miniMap' | 'professor' | 'chat';

type HudWidgetState = {
  scale: number;
  x: number;
  y: number;
};

export type HudWidgetConfig = {
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
const compassRoseElement = document.querySelector<HTMLElement>('#compass-rose');
const compassHeadingElement = document.querySelector<HTMLElement>('#compass-heading');
const professorWidget = document.querySelector<HTMLElement>('#professor-widget');

/** Screen-edge margin used by every widget's default position. */
const HUD_WIDGET_MARGIN = 16;
/** Pointer-drag / keyboard-nudge step, in CSS pixels. */
const HUD_NUDGE_STEP = 24;
/** Finer step for Alt+Shift+Arrow, for pixel-level adjustment. */
const HUD_NUDGE_STEP_FINE = 4;

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
    id: 'professor',
    element: professorWidget,
    // A small icon button, not a content panel — nothing to resize.
    minScale: 1,
    maxScale: 1,
    defaultScale: 1,
    // "Top centre by default" per knowledge-tree.md. Centred rather than
    // edge-anchored, and clear of the region banner band the top-centre
    // strip already reserves (see hudLayout.ts's zone diagram).
    defaultPosition: () => ({
      x: (window.innerWidth - (professorWidget?.offsetWidth ?? 56)) / 2,
      y: HUD_WIDGET_MARGIN,
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

function wireHudWidget(config: HudWidgetConfig) {
  const element = config.element;
  if (!element) return;

  const state = loadHudWidgetState(config);
  applyHudWidgetState(config, state);

  element.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    // An ordinary interactive control inside the widget (the Professor's
    // open/collapse buttons; the chat's message input, send button, and
    // scrollable log) wants its own click or drag, not a widget drag. Only
    // the resize handle is a button that should still begin an interaction —
    // everything else falls through to native behaviour, and dragging stays
    // reachable via the grip. `[data-hud-widget-interactive]` is the escape
    // hatch for anything else a widget adds that isn't a native control —
    // the chat log, so it can be scrolled or its text selected.
    const interactiveTarget = target.closest(
      'button:not([data-hud-resize]), input, textarea, select, a[href], [data-hud-widget-interactive]',
    );
    if (interactiveTarget) return;

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

  // Keyboard reposition: Alt+Arrow nudges, Alt+Shift+Arrow nudges finer.
  // Plain arrow keys are left alone, since inside an open widget (the
  // Professor's tree view, a future minimap detail) they belong to that
  // content, not to moving the widget's own frame around the screen.
  element.addEventListener('keydown', (event) => {
    if (!event.altKey) return;
    const delta: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    const direction = delta[event.key];
    if (!direction) return;

    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? HUD_NUDGE_STEP_FINE : HUD_NUDGE_STEP;
    const current = hudWidgetStates.get(config.id) ?? getDefaultHudWidgetState(config);
    applyHudWidgetState(config, {
      scale: current.scale,
      x: current.x + direction[0] * step,
      y: current.y + direction[1] * step,
    });
    saveHudWidgetState(config.id);
  });
}

/**
 * Add a widget to the same drag/resize/keyboard-nudge system after startup.
 *
 * The neighborhood chat only exists once a shared session actually connects
 * (solo play never builds its DOM at all), long after
 * `initializeHudWidgets()` has already wired up the widgets that exist from
 * page load. This lets it join the same system late rather than needing a
 * second, smaller copy of the drag/resize logic.
 */
export function registerDraggableHudWidget(config: HudWidgetConfig) {
  if (getHudWidgetConfig(config.id)) return;
  hudWidgetConfigs.push(config);
  wireHudWidget(config);
}

export function initializeHudWidgets() {
  for (const config of hudWidgetConfigs) wireHudWidget(config);

  window.addEventListener('pointermove', handleHudWidgetPointerMove);
  window.addEventListener('pointerup', finishHudWidgetInteraction);
  window.addEventListener('pointercancel', finishHudWidgetInteraction);

  /**
   * Last resort: the browser dropped the capture without a pointerup we
   * matched.
   *
   * `isHudWidgetInteractionActive` gates pointer input for the whole game, so a
   * stranded `hudWidgetInteraction` does not just leave a widget stuck — it
   * silently swallows camera drags and clicks everywhere, with nothing on
   * screen to explain why. Cheap insurance against an expensive-to-diagnose
   * state.
   */
  window.addEventListener('lostpointercapture', (event) => {
    if (!hudWidgetInteraction) return;
    if (event.pointerId !== hudWidgetInteraction.pointerId) return;
    const config = getHudWidgetConfig(hudWidgetInteraction.id);
    config?.element?.classList.remove('is-dragging', 'is-resizing');
    saveHudWidgetState(hudWidgetInteraction.id);
    hudWidgetInteraction = null;
  });
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
