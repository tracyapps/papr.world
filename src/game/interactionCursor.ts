import { canvas } from '../render/context';
import { getActionMode } from './actionMode';
import { getScreenInteractionAt } from './interactionRouter';
import { getDigTargetStatusAtScreen } from './toolActions';
import { gardenActionAtScreen } from './planting';
import { assessTrimTarget } from './treeInteractions';
import { placeTargetStatusAtScreen } from './placement';

/**
 * One cursor per *verb*, not per action.
 *
 * `build` is the verb for placing build pieces — the hoe's three jobs (sow,
 * lift, rake) are all gardening and share `garden`. Which of them is about to
 * happen is already shown by the ground overlay and the status chip; the
 * cursor's job is the coarser question of what kind of work you are doing.
 */
type CursorKind = 'attach' | 'build' | 'chop' | 'default' | 'dig' | 'garden' | 'hand';

const CURSOR_ART: Record<CursorKind, string> = {
  attach: new URL('../../assets/ui-art/cursor-attach.svg', import.meta.url).href,
  build: new URL('../../assets/ui-art/cursor-build.svg', import.meta.url).href,
  chop: new URL('../../assets/ui-art/cursor-chop.svg', import.meta.url).href,
  default: new URL('../../assets/ui-art/cursor-default.svg', import.meta.url).href,
  dig: new URL('../../assets/ui-art/cursor-dig.svg', import.meta.url).href,
  garden: new URL('../../assets/ui-art/cursor-garden.svg', import.meta.url).href,
  hand: new URL('../../assets/ui-art/cursor-hand.svg', import.meta.url).href,
};

// Hover picking is capped at one check per animation frame. Pointer events can
// arrive much faster than rendering, especially on a high-refresh trackpad.
let hoverFrame: number | null = null;
let hoverX = 0;
let hoverY = 0;
let cursorElement: HTMLElement | null = null;
let cursorImage: HTMLImageElement | null = null;
let cursorKind: CursorKind | null = null;

function setCursor(kind: CursorKind, valid = true) {
  if (!cursorElement || !cursorImage) return;
  if (cursorKind !== kind) {
    cursorKind = kind;
    cursorImage.src = CURSOR_ART[kind];
    cursorElement.dataset.cursor = kind;
  }
  cursorElement.classList.toggle('is-valid-target', valid);
  cursorElement.classList.toggle('is-invalid-target', !valid);
}

function refreshCursor() {
  hoverFrame = null;
  const interaction = getScreenInteractionAt(hoverX, hoverY);
  canvas.classList.toggle('is-interactable', Boolean(interaction));

  if (
    interaction
    && interaction.id !== 'equipped-tool'
    && interaction.id !== 'planting'
    && interaction.id !== 'tree-trim'
    && interaction.id !== 'build-placement'
  ) {
    setCursor('hand');
    return;
  }

  if (getActionMode() === 'dig') {
    setCursor('dig', getDigTargetStatusAtScreen(hoverX, hoverY) === 'valid');
    return;
  }

  // Build mode: the cursor agrees with the ground overlay because both read
  // the same resolver, so it can never say yes to a click that will be
  // refused. `build` is the verb's reserved cursor, first used here.
  if (getActionMode() === 'place') {
    setCursor('build', placeTargetStatusAtScreen(hoverX, hoverY) === 'valid');
    return;
  }

  // Plant mode: the cursor agrees with the ground overlay because both read
  // the same resolver, so it can never say yes to a click that will be
  // refused.
  if (getActionMode() === 'plant') {
    const { action } = gardenActionAtScreen(hoverX, hoverY);
    setCursor('garden', action.ok);
    return;
  }

  // Trim mode reads the same resolver the click does, so a valid-looking
  // cursor can never precede a refusal. Aiming at nothing keeps the chop
  // cursor rather than falling back to the arrow: you are still holding
  // scissors, and swapping art on empty ground reads as a bug.
  if (getActionMode() === 'trim') {
    setCursor('chop', assessTrimTarget(hoverX, hoverY).status === 'valid');
    return;
  }

  setCursor(interaction ? 'hand' : 'default');
}

/**
 * Move the cursor art to a position, always — even while hidden.
 *
 * Position and visibility are updated together and never independently. An
 * earlier version showed the cursor on `pointerenter` without moving it, so it
 * reappeared wherever it had last been told about — which read as the cursor
 * teleporting to the last place you clicked.
 */
function placeCursor(x: number, y: number) {
  hoverX = x;
  hoverY = y;
  cursorElement?.style.setProperty('--cursor-x', `${x}px`);
  cursorElement?.style.setProperty('--cursor-y', `${y}px`);
}

function hideCursor() {
  if (hoverFrame !== null) window.cancelAnimationFrame(hoverFrame);
  hoverFrame = null;
  canvas.classList.remove('is-interactable');
  cursorElement?.classList.remove('is-visible');
}

export function initializeInteractionCursor() {
  cursorElement = document.createElement('div');
  cursorElement.className = 'game-cursor';
  cursorElement.setAttribute('aria-hidden', 'true');
  cursorImage = document.createElement('img');
  cursorImage.alt = '';
  cursorElement.appendChild(cursorImage);
  document.body.appendChild(cursorElement);
  setCursor('default');

  /**
   * Tracked on `window`, deliberately — not on the canvas.
   *
   * **`setPointerCapture` makes canvas boundary events lie.** Dragging a HUD
   * widget captures the pointer to that widget, which fires `pointerleave` on
   * the canvas even though the pointer never went anywhere, and then withholds
   * every `pointermove` until the drag ends. Listening on the canvas therefore
   * produced four symptoms with one cause: the custom cursor vanished mid-drag,
   * the system cursor took over, `hoverX/hoverY` froze at the pre-drag
   * position, and the art popped back at those stale coordinates afterwards.
   *
   * A window listener sees every move regardless of capture, so position is
   * never stale. Visibility is then decided from `event.target`: over the
   * canvas the game cursor shows, over any HUD chrome it does not. That is a
   * property of where the pointer *is*, re-evaluated on every move — not a
   * latch set by boundary events that capture can desynchronise.
   */
  window.addEventListener('pointermove', (event) => {
    placeCursor(event.clientX, event.clientY);

    if (event.target !== canvas) {
      hideCursor();
      return;
    }

    cursorElement?.classList.add('is-visible');
    if (hoverFrame === null) hoverFrame = window.requestAnimationFrame(refreshCursor);
  }, { passive: true });

  // Leaving the document entirely — the only case where "the pointer is gone"
  // is actually true. `relatedTarget` is null when it crosses the window edge.
  document.addEventListener('pointerout', (event) => {
    if (event.relatedTarget === null) hideCursor();
  });

  /**
   * Re-sync the moment a capture ends.
   *
   * Without this the cursor stays hidden after releasing a HUD widget until
   * the pointer happens to move over the canvas again — which is the "takes a
   * few seconds to come back" part of the bug. The hover target may have
   * changed under a stationary pointer during the drag, so re-pick rather than
   * only re-showing.
   */
  window.addEventListener('lostpointercapture', () => {
    // One layout read, and only when a capture ends — not per move.
    if (document.elementFromPoint(hoverX, hoverY) !== canvas) return;
    cursorElement?.classList.add('is-visible');
    if (hoverFrame === null) hoverFrame = window.requestAnimationFrame(refreshCursor);
  });
}
