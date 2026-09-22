// The HUD half of the auto-walk lock (game/input.ts owns the state and the
// keyboard shortcut). Two ways in — the button here, or Caps Lock — both
// drive the exact same `game/input.ts` state, so they can never disagree.
import { getToastStack } from './hudLayout';
import { isAutoWalkLocked, toggleAutoWalkLocked } from '../game/input';

let button: HTMLButtonElement | null = null;
let toast: HTMLDivElement | null = null;
let toastTimer: number | undefined;

export function initializeAutoWalkIndicator() {
  button = document.querySelector<HTMLButtonElement>('#auto-walk-toggle');
  button?.addEventListener('click', () => toggleAutoWalkLocked());

  // Reuses `.harvest-toast`'s look rather than inventing a second style for
  // what is visually the same thing: a small paper card in the shared toast
  // stack. `aria-live` lives on this element, same pattern as every other
  // toast — the stack itself is `role="presentation"`.
  toast = document.createElement('div');
  toast.className = 'harvest-toast';
  toast.setAttribute('aria-live', 'polite');
  getToastStack().append(toast);

  // Silent sync on load — always false at this point, but written this way
  // (rather than assuming) so a future change to load-time defaults doesn't
  // leave the button lying about the state.
  applyAutoWalkVisualState(isAutoWalkLocked());
}

function applyAutoWalkVisualState(locked: boolean) {
  if (!button) return;
  button.setAttribute('aria-pressed', String(locked));
  button.classList.toggle('is-active', locked);
}

/**
 * Call whenever `game/input.ts` reports the lock changed — wired from
 * `initializeInput`'s `onAutoWalkToggled` callback in main.ts. Covers all
 * three ways it can flip: Caps Lock, this button, or the window-blur safety
 * clear, with one announcement path for all of them.
 */
export function handleAutoWalkChanged(locked: boolean) {
  applyAutoWalkVisualState(locked);
  if (!toast) return;
  toast.innerHTML = locked
    ? '<strong>Auto-walk on</strong><span>Drag to steer &middot; Caps Lock or the button turns it off</span>'
    : '<strong>Auto-walk off</strong>';
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast?.classList.remove('is-visible'), 2600);
}
