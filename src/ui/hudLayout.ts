// HUD layout layer.
//
// Before this module, every overlay picked its own `top:`/`right:` pixel
// value. That worked until two of them picked the same one — the saved-places
// panel and the harvest toast both landed on right:16/top:190, so harvest
// feedback fired *behind* the panel and was never seen.
//
// The fix is to stop hand-placing panels. Screen space is described once,
// here, as a small set of named zones published as CSS custom properties.
// Panels then register into a zone and are stacked from their *measured*
// heights, so adding a fourth panel can never require retuning the third.
//
// Zones:
//
//   ┌──────────────────────────────────────────────────┐
//   │ [rail] [status chip]      ‹region banner›  [? ⚙] │
//   │ [    ]                               [minimap  ] │
//   │ [    ]                               [compass  ] │
//   │ [    ]                               [right    ] │
//   │ [    ]                               [ rail    ] │
//   │ [    ]           ‹toast stack›                   │
//   │ [    ]           ‹critter dialogue›              │
//   │ [═════════ scrapbook strip ════════════════════] │
//   └──────────────────────────────────────────────────┘
//
// The left tool rail width is the single source of truth for how far the
// top-left status block and the scrapbook cover are inset. Change
// RAIL_WIDTH_CSS and everything downstream follows.
//
// The right rail currently has no registered panels — saved places moved
// into the scrapbook's Map tab and settings moved behind the cog. The rail
// stays because it is the correct home for any future persistent panel, and
// re-deriving it later would just recreate the collisions above.
//
// Widget collapse (knowledge-tree.md → "Collapsing the HUD") lives here too:
// every persistent widget should be able to get out of the way, for players
// who want the world without the furniture, and the whole HUD should be able
// to go at once. `settings.ts` only remembers *which* ids are collapsed —
// this module is what makes that mean something.

import { getSetting, setSetting } from '../game/settings';

/** Screen margin shared by every edge-anchored element. */
const EDGE = 16;
/** Vertical gap between stacked panels in a rail. */
const RAIL_GAP = 12;
/**
 * Bottom band owned by the scrapbook dock.
 *
 * Closed, only the peeking cover is on screen. Open, the strip is up and the
 * cover rides on top of it, so the band roughly doubles. The tool rail scales
 * against whichever applies, which is why opening the scrapbook nudges the
 * rail rather than being covered by it.
 */
const DOCK_RESERVE_CLOSED = 148;
const DOCK_RESERVE_OPEN = 296;

function dockReserve() {
  const open = document.querySelector('#scrapbook-dock')?.classList.contains('is-open');
  return open ? DOCK_RESERVE_OPEN : DOCK_RESERVE_CLOSED;
}
/**
 * Never shrink the tool rail past the point where the art reads clearly.
 *
 * Low enough to fit five slots above the closed dock on the smallest tested
 * viewport (1024×680 needs ~0.56) — the rail's whole purpose is to clear the
 * dock rather than be covered by it. Any lower and a 140px slot becomes
 * unclickable; below ~0.55 the remaining cramped states are the open dock on
 * short screens, which is a "close the scrapbook" instruction, not a layout
 * bug.
 */
const MIN_RAIL_SCALE = 0.55;

/**
 * Left tool-rail width. Mirrored into `--hud-rail-width` so CSS and TS can
 * never disagree about how much of the left edge is spoken for.
 */
const RAIL_WIDTH_CSS = 'clamp(142px, 11vw, 160px)';
/** Same value at the small-viewport breakpoint (see styles.css). */
const RAIL_WIDTH_SMALL_CSS = '70px';
const SMALL_VIEWPORT_QUERY = '(max-height: 650px), (max-width: 700px)';

export type HudRailId = 'right';

type RailPanel = {
  id: string;
  element: HTMLElement;
  /** Lower numbers sit closer to the top of the rail. */
  order: number;
};

const railPanels = new Map<HudRailId, RailPanel[]>([['right', []]]);

let toastStack: HTMLElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let layoutFrame = 0;

function smallViewport() {
  return window.matchMedia(SMALL_VIEWPORT_QUERY).matches;
}

/**
 * Publish the layout constants as CSS variables. Anything positional in
 * styles.css reads these rather than repeating a magic number.
 */
function applyHudMetrics() {
  const root = document.documentElement.style;
  root.setProperty('--hud-edge', `${EDGE}px`);
  root.setProperty('--hud-top', `${EDGE}px`);
  root.setProperty('--hud-rail-gap', `${RAIL_GAP}px`);
  root.setProperty('--hud-dock-reserve', `${dockReserve()}px`);
  root.setProperty('--hud-rail-width', smallViewport() ? RAIL_WIDTH_SMALL_CSS : RAIL_WIDTH_CSS);
  root.setProperty('--hud-rail-scale', String(measureRailScale()));
}

/**
 * Fit the tool slot column into the space above the scrapbook dock.
 *
 * The slots are scaled rather than re-laid-out because the artwork inside
 * each slot is hand-positioned against the slot box; a proportional scale
 * preserves that composition exactly, where a breakpoint with new metrics
 * would require re-tuning every offset by hand.
 *
 * Transforms do not affect `offsetHeight`, so this reads the column's
 * natural (unscaled) height even while a scale is already applied.
 */
function measureRailScale(): number {
  const slots = document.querySelector<HTMLElement>('.tool-toolbar-slots');
  if (!slots) return 1;

  const naturalHeight = slots.offsetHeight;
  if (naturalHeight <= 0) return 1;

  const top = slots.offsetTop;
  const available = window.innerHeight - top - dockReserve();
  if (available >= naturalHeight) return 1;

  return Math.max(MIN_RAIL_SCALE, Number((available / naturalHeight).toFixed(4)));
}

/**
 * The top of the right-hand panel rail: below the minimap and compass, which
 * are user-draggable and therefore not part of the automatic stack. Their
 * *defaults* live in this band, so the rail starts underneath them.
 */
function railTop(): number {
  return smallViewport() ? 168 : 268;
}

/**
 * Is the element actually rendered?
 *
 * Note: `offsetParent === null` is the usual shorthand for this and is wrong
 * here — it is *always* null for `position: fixed` elements, which is exactly
 * what rail panels are. `getClientRects()` is empty only when the element is
 * genuinely not rendered, so it handles `display: none`, `hidden`, and
 * detached nodes without the false positive.
 */
function isRendered(element: HTMLElement) {
  return !element.hidden && element.getClientRects().length > 0;
}

/**
 * Stack a rail's panels from measured heights. Hidden panels contribute
 * nothing, so toggling one closed collapses the gap it left behind instead
 * of stranding a hole in the rail.
 */
function layoutRail(rail: HudRailId) {
  const panels = railPanels.get(rail) ?? [];
  let offset = railTop();

  for (const panel of [...panels].sort((a, b) => a.order - b.order)) {
    const { element } = panel;
    if (!isRendered(element)) continue;
    element.style.top = `${offset}px`;
    offset += element.offsetHeight + RAIL_GAP;
  }
}

/** Coalesce repeated layout requests into one pass per frame. */
export function requestHudLayout() {
  if (layoutFrame) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    applyHudMetrics();
    for (const rail of railPanels.keys()) layoutRail(rail);
  });
}

/**
 * Add a panel to an auto-stacking rail. The caller styles the panel however
 * it likes but must not set `top` — that belongs to the layout pass.
 */
export function registerRailPanel(options: {
  id: string;
  element: HTMLElement;
  order: number;
  rail?: HudRailId;
}) {
  const rail = options.rail ?? 'right';
  const panels = railPanels.get(rail);
  if (!panels || panels.some((panel) => panel.id === options.id)) return;

  options.element.dataset.hudRail = rail;
  options.element.style.position = 'fixed';
  options.element.style.right = 'var(--hud-edge)';
  panels.push({ id: options.id, element: options.element, order: options.order });

  // Panels grow and shrink (the places panel's live status line adds a row
  // when a guide is active). Re-stack whenever one changes size.
  resizeObserver?.observe(options.element);
  requestHudLayout();
}

/**
 * The shared bottom-centre toast stack. Transient feedback — harvest gains,
 * cozy-object replies, tool refusals — all flows through one column so two
 * toasts can never land on top of each other. Newest sits closest to the
 * bottom, nearest the action that caused it.
 */
export function getToastStack(): HTMLElement {
  if (toastStack) return toastStack;
  toastStack = document.createElement('div');
  toastStack.className = 'hud-toast-stack';
  toastStack.id = 'hud-toast-stack';
  // Individual toasts own their own aria-live regions; the container is
  // purely positional and must not announce anything itself.
  toastStack.setAttribute('role', 'presentation');
  document.body.append(toastStack);
  return toastStack;
}

/**
 * Raise the toast stack clear of the critter dialogue while it is open, so a
 * harvest toast never lands on top of a conversation card.
 */
export function setToastStackRaised(raised: boolean, clearancePx = 0) {
  const stack = getToastStack();
  stack.classList.toggle('is-raised', raised);
  if (raised) stack.style.setProperty('--hud-dialogue-clearance', `${Math.max(0, clearancePx)}px`);
  else stack.style.removeProperty('--hud-dialogue-clearance');
}

// --- Widget collapse ---------------------------------------------------

type CollapsibleWidget = {
  id: string;
  element: HTMLElement;
  /** Human-readable name, for a future "show all HUD widgets" summary. */
  label: string;
};

const collapsibleWidgets: CollapsibleWidget[] = [];

function applyCollapsedState(widget: CollapsibleWidget) {
  const collapsed = isHudWidgetCollapsed(widget.id);
  // Collapsed widgets keep a small on-screen affordance to bring them back —
  // see .is-hud-collapsed in styles.css — so this is a class toggle, never
  // `hidden`. A widget that hides its own way back is a dead end, not a
  // preference.
  widget.element.classList.toggle('is-hud-collapsed', collapsed);
}

/**
 * Register a widget as collapsible. Safe to call once per widget id; a
 * second registration is a no-op rather than a duplicate entry, the same
 * defensiveness `registerRailPanel` uses.
 */
export function registerCollapsibleWidget(id: string, element: HTMLElement, label: string) {
  if (collapsibleWidgets.some((widget) => widget.id === id)) return;
  const widget = { id, element, label };
  collapsibleWidgets.push(widget);
  applyCollapsedState(widget);
}

export function isHudWidgetCollapsed(id: string): boolean {
  return getSetting('collapsedHudWidgets').includes(id);
}

/**
 * Persists the choice and reapplies it. Never called from anywhere that
 * fires automatically — a widget that springs back open because "something
 * happened" is a notification wearing a layout costume, which is exactly
 * what knowledge-tree.md rules out.
 */
export function setHudWidgetCollapsed(id: string, collapsed: boolean) {
  const current = getSetting('collapsedHudWidgets');
  const alreadyCollapsed = current.includes(id);
  if (collapsed === alreadyCollapsed) return;
  setSetting('collapsedHudWidgets', collapsed
    ? [...current, id]
    : current.filter((existing) => existing !== id));

  const widget = collapsibleWidgets.find((entry) => entry.id === id);
  if (widget) applyCollapsedState(widget);
  requestHudLayout();
}

export function toggleHudWidgetCollapsed(id: string) {
  setHudWidgetCollapsed(id, !isHudWidgetCollapsed(id));
}

/** True only once every registered widget is collapsed, and there is at least one. */
export function areAllHudWidgetsCollapsed(): boolean {
  return collapsibleWidgets.length > 0 && collapsibleWidgets.every((widget) => isHudWidgetCollapsed(widget.id));
}

/** The "world without the furniture" gesture: every widget at once. */
export function toggleAllHudWidgets() {
  const collapseAll = !areAllHudWidgetsCollapsed();
  for (const widget of collapsibleWidgets) setHudWidgetCollapsed(widget.id, collapseAll);
}

export function initializeHudLayout() {
  applyHudMetrics();
  getToastStack();

  resizeObserver = new ResizeObserver(() => requestHudLayout());
  for (const panels of railPanels.values()) {
    for (const panel of panels) resizeObserver.observe(panel.element);
  }

  window.addEventListener('resize', requestHudLayout);
  window.matchMedia(SMALL_VIEWPORT_QUERY).addEventListener('change', requestHudLayout);
  requestHudLayout();
}
