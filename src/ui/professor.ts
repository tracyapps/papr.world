import * as THREE from 'three';
import { isHudWidgetCollapsed, registerCollapsibleWidget, toggleHudWidgetCollapsed } from './hudLayout';
import { openTechTreeView } from './techTreeView';
import { buildProfessorRig } from '../game/professorRig';
import { TECH_DEFS } from '../sim/catalogs/techTree';
import {
  describeLearningRemaining,
  getLearningProgress,
} from '../sim/learning';
import { getGameState, onGameStateChanged } from '../sim/state';
import { getSetting, onSettingsChanged } from '../game/settings';

// The Professor: a movable, collapsible HUD paperclip that opens the
// knowledge tree. Designed in docs/knowledge-tree.md.
//
// Positioning and drag/keyboard-nudge come free from hud.ts's existing
// widget system (see the 'professor' entry in hudWidgetConfigs there) — this
// module only owns the Professor's own state and behaviour: which face he
// shows, his accessible name, and opening the tree.
//
// Never named Clippy anywhere, per the design doc — the paper-cutout style,
// glasses, and cap do the work instead.
//
// The face itself is a small, self-contained Three.js scene (professorRig.ts)
// rendered into its own canvas — a second, tiny WebGL context alongside the
// game's main one, not part of the game world. It owns its own render loop
// so it keeps blinking regardless of what the main scene is doing, and that
// loop is the only thing that pauses while the widget is collapsed.

const WIDGET_ID = 'professor';

const widget = document.querySelector<HTMLElement>('#professor-widget');
const openButton = document.querySelector<HTMLButtonElement>('#professor-open');
const collapseButton = document.querySelector<HTMLButtonElement>('#professor-collapse');
const faceCanvas = document.querySelector<HTMLCanvasElement>('#professor-canvas');
const learningStatus = document.querySelector<HTMLElement>('#professor-learning-status');

/**
 * Idle vs. reading, per knowledge-tree.md: "a kettle that is visibly on is
 * not nagging you." The active lesson is the single source for both the
 * visual state and accessible name; the optional time note is only a coarse
 * companion and can be hidden without hiding the reading state itself.
 */
function professorLearningProgress() {
  return getLearningProgress(getGameState(), Date.now());
}

function professorIsReading(): boolean {
  return professorLearningProgress() !== null;
}

function accessibleName(): string {
  // The doc is explicit that this state must have a text equivalent, not
  // live only in the artwork: "his accessible name says which he is doing."
  const progress = professorLearningProgress();
  if (!progress) {
    return 'The Professor. Nothing learning right now. Press to open the knowledge tree.';
  }
  return `The Professor. Reading ${TECH_DEFS[progress.nodeId].name} — ${describeLearningRemaining(progress.remainingMs)}. Press to open the knowledge tree.`;
}

let faceRig: ReturnType<typeof buildProfessorRig> | null = null;
let faceRenderer: THREE.WebGLRenderer | null = null;
let faceScene: THREE.Scene | null = null;
let faceCamera: THREE.PerspectiveCamera | null = null;
let faceStartMs = 0;
let lastFaceCanvasSize = 0;

function initializeFace() {
  if (!faceCanvas) return;

  faceRenderer = new THREE.WebGLRenderer({ canvas: faceCanvas, alpha: true, antialias: true });
  faceRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  // `alpha: true` only allows transparency — the renderer still clears to
  // opaque black by default unless told the clear alpha is 0, which is what
  // actually lets the widget's round paper background show through.
  faceRenderer.setClearColor(0x000000, 0);

  faceScene = new THREE.Scene();
  faceCamera = new THREE.PerspectiveCamera(32, 1, 0.1, 10);
  faceCamera.position.set(0, 0.15, 3.1);
  faceCamera.lookAt(0, 0.1, 0);

  faceScene.add(new THREE.AmbientLight('#ffffff', 0.75));
  const key = new THREE.DirectionalLight('#fff7e6', 0.85);
  key.position.set(2, 3, 4);
  faceScene.add(key);

  faceRig = buildProfessorRig();
  faceScene.add(faceRig.group);

  faceStartMs = performance.now();
  requestAnimationFrame(tickFace);
}

/**
 * `.professor-face-button` goes `display: none` while collapsed (see
 * styles.css), so the canvas reads a zero size until it's shown again —
 * re-measure right before every render rather than once at startup.
 */
function resizeFaceIfNeeded() {
  if (!faceCanvas || !faceRenderer || !faceCamera) return;
  const size = faceCanvas.clientWidth || 56;
  if (size === lastFaceCanvasSize) return;
  lastFaceCanvasSize = size;
  faceRenderer.setSize(size, size, false);
  faceCamera.aspect = 1;
  faceCamera.updateProjectionMatrix();
}

/**
 * Its own animation loop, deliberately separate from the game's main
 * `requestAnimationFrame` in main.ts — the Professor is a HUD widget with
 * his own tiny WebGL context, not a citizen of the game world, and he
 * should keep blinking whether or not the world scene is doing anything.
 * The one thing that pauses is the actual render call, while collapsed.
 */
function tickFace() {
  requestAnimationFrame(tickFace);
  if (!faceRig || !faceRenderer || !faceScene || !faceCamera) return;
  if (isHudWidgetCollapsed(WIDGET_ID)) return;

  resizeFaceIfNeeded();
  const elapsedSeconds = (performance.now() - faceStartMs) / 1000;
  faceRig.update(elapsedSeconds);
  faceRenderer.render(faceScene, faceCamera);
}

function render() {
  if (!widget || !openButton) return;
  const progress = professorLearningProgress();
  widget.classList.toggle('is-reading', progress !== null);
  openButton.setAttribute('aria-label', accessibleName());
  if (learningStatus) {
    const showTimer = progress !== null && getSetting('showLearningTimer');
    learningStatus.hidden = !showTimer;
    learningStatus.textContent = showTimer
      ? `Reading ${TECH_DEFS[progress.nodeId].name} · ${describeLearningRemaining(progress.remainingMs)}`
      : '';
  }

  const collapsed = isHudWidgetCollapsed(WIDGET_ID);
  widget.classList.toggle('is-hud-collapsed', collapsed);
  if (collapseButton) {
    collapseButton.setAttribute('aria-pressed', String(collapsed));
    collapseButton.setAttribute('aria-label', collapsed ? 'Show the Professor' : 'Hide the Professor');
  }
}

export function initializeProfessor() {
  if (!widget || !openButton) return;

  registerCollapsibleWidget(WIDGET_ID, widget, 'The Professor');

  openButton.addEventListener('click', () => openTechTreeView());
  collapseButton?.addEventListener('click', () => {
    toggleHudWidgetCollapsed(WIDGET_ID);
    render();
  });

  initializeFace();
  onGameStateChanged(render);
  onSettingsChanged(render);
  render();
}

/** Re-read state for settings changes and direct UI refreshes. */
export function refreshProfessor() {
  render();
}
