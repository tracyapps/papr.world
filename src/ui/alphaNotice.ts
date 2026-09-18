import { getSetting, setSetting } from '../game/settings';
import { openFeedbackPanel } from './feedbackPanel';

/**
 * The first-run "early alpha" card.
 *
 * Alpha gate 1, criterion 4: the build has to say plainly that it is an
 * alpha and that resets may still be necessary — in the game, not only on the
 * website, because a tester who arrives by a shared link never sees the site.
 * Shown once per browser; the Help menu keeps the feedback button for later.
 *
 * Built on the shared `.hud-overlay` classes so it looks like Help and
 * Settings, and behaves like a real dialog: focus moves in, Escape (via the
 * main Escape chain) or either button closes it, and focus goes back to
 * wherever it was.
 */

let overlay: HTMLElement | null = null;
let returnFocus: HTMLElement | null = null;

function close(markSeen = true) {
  if (!overlay) return false;
  if (markSeen) setSetting('alphaNoticeSeen', true);
  overlay.classList.remove('is-open');
  overlay.hidden = true;
  returnFocus?.focus?.();
  returnFocus = null;
  return true;
}

export function closeAlphaNotice(): boolean {
  if (!overlay || overlay.hidden) return false;
  return close();
}

export function initializeAlphaNotice() {
  if (getSetting('alphaNoticeSeen')) return;
  overlay = document.createElement('div');
  overlay.className = 'hud-overlay alpha-notice';
  overlay.innerHTML = `
    <div class="hud-overlay-card" role="dialog" aria-modal="true" aria-labelledby="alpha-notice-title" aria-describedby="alpha-notice-body">
      <p class="hud-overlay-kicker">papr.world · early alpha</p>
      <h2 id="alpha-notice-title">Welcome — you’re one of the first</h2>
      <div id="alpha-notice-body">
        <p>This is an early alpha. Things will break, some corners are unfinished, and now and then a world or your progress may need to be reset.</p>
        <p>If something feels off — or delightful — <strong>Send feedback</strong> in the Help menu (the <kbd>?</kbd> button) comes straight to the person making this.</p>
      </div>
      <div class="alpha-notice-actions">
        <button type="button" class="hud-setting-button" data-alpha-ok>Got it — let’s play</button>
        <button type="button" class="hud-setting-button alpha-notice-secondary" data-alpha-feedback>Send feedback now…</button>
      </div>
    </div>`;
  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    overlay.addEventListener(eventName, (event) => event.stopPropagation());
  }
  overlay.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') event.stopPropagation();
  });
  overlay.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-alpha-ok]')) close();
    if (target.closest('[data-alpha-feedback]')) {
      close();
      openFeedbackPanel();
    }
  });
  document.body.append(overlay);
  returnFocus = document.activeElement as HTMLElement | null;
  requestAnimationFrame(() => {
    overlay?.classList.add('is-open');
    overlay?.querySelector<HTMLButtonElement>('[data-alpha-ok]')?.focus();
  });
}
