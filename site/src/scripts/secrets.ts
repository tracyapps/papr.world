/**
 * The old cheat code. Up up down down left right left right B A.
 *
 * It reveals the development neighbourhood's join code and turns the lights
 * out, because of course it does.
 */
import { applyTheme } from './theme';

const SEQUENCE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
];

const note = document.querySelector<HTMLElement>('[data-secret]');
let progress = 0;

if (note) {
  window.addEventListener('keydown', (event) => {
    const el = event.target as HTMLElement | null;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;

    const wanted = SEQUENCE[progress];
    const pressed = wanted.length === 1 ? event.key.toLowerCase() : event.key;

    if (pressed === wanted) {
      progress += 1;
      if (progress === SEQUENCE.length) {
        progress = 0;
        note.hidden = false;
        applyTheme('dark');
        // Move focus to it so it is not a secret only sighted people can find.
        note.setAttribute('tabindex', '-1');
        note.focus();
      }
      return;
    }

    // A wrong key restarts — unless it is the first key of the sequence again.
    progress = pressed === SEQUENCE[0] ? 1 : 0;
  });
}
