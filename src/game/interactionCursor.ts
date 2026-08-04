import { canvas } from '../render/context';
import { getActionMode } from './actionMode';
import { getScreenInteractionAt } from './interactionRouter';
import { getDigTargetStatusAtScreen } from './toolActions';
import { gardenActionAtScreen } from './planting';

/**
 * One cursor per *verb*, not per action.
 *
 * `build` is reserved for structural building when that arrives — the hoe's
 * three jobs (sow, lift, rake) are all gardening and share `garden`. Which of
 * them is about to happen is already shown by the ground overlay and the
 * status chip; the cursor's job is the coarser question of what kind of work
 * you are doing.
 */
type CursorKind = 'attach' | 'build' | 'chop' | 'default' | 'dig' | 'garden' | 'hand';

const CURSOR_ART: Record<CursorKind, string> = {
  attach: new URL('../../designs/cursor-attach.svg', import.meta.url).href,
  build: new URL('../../designs/cursor-build.svg', import.meta.url).href,
  chop: new URL('../../designs/cursor-chop.svg', import.meta.url).href,
  default: new URL('../../designs/cursor-default.svg', import.meta.url).href,
  dig: new URL('../../designs/cursor-dig.svg', import.meta.url).href,
  garden: new URL('../../designs/cursor-garden.svg', import.meta.url).href,
  hand: new URL('../../designs/cursor-hand.svg', import.meta.url).href,
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

  if (interaction && interaction.id !== 'equipped-tool' && interaction.id !== 'planting') {
    setCursor('hand');
    return;
  }

  if (getActionMode() === 'dig') {
    setCursor('dig', getDigTargetStatusAtScreen(hoverX, hoverY) === 'valid');
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

  setCursor(interaction ? 'hand' : 'default');
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

  canvas.addEventListener('pointerenter', () => cursorElement?.classList.add('is-visible'));
  canvas.addEventListener('pointermove', (event) => {
    hoverX = event.clientX;
    hoverY = event.clientY;
    cursorElement?.style.setProperty('--cursor-x', `${hoverX}px`);
    cursorElement?.style.setProperty('--cursor-y', `${hoverY}px`);
    cursorElement?.classList.add('is-visible');
    if (hoverFrame === null) hoverFrame = window.requestAnimationFrame(refreshCursor);
  });

  canvas.addEventListener('pointerleave', () => {
    if (hoverFrame !== null) window.cancelAnimationFrame(hoverFrame);
    hoverFrame = null;
    canvas.classList.remove('is-interactable');
    cursorElement?.classList.remove('is-visible');
  });
}
