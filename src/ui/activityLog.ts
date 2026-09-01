import { getGameState, onGameStateChanged } from '../sim/state';

// The activity log used to be a scrapbook tab, pressed into a strip that
// only had room for a line and a half and never scrolled — quiet updates
// that were supposed to stay out of the way instead needed the whole
// scrapbook opened to be read at all. It is a side drawer instead now, the
// same shape as checking notifications on a desktop: tucked off the right
// edge until asked for, tall enough to actually scroll, and out of the way
// of everything else the moment it closes.

let drawer: HTMLElement | null = null;
let listElement: HTMLOListElement | null = null;
let toggleButton: HTMLButtonElement | null = null;
let open = false;

function relativeActivityTime(at: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - at) / 1000));
  if (elapsedSeconds < 60) return 'just now';
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function render() {
  if (!listElement) return;
  const entries = getGameState().player.activityLog;
  listElement.innerHTML = entries.length === 0
    ? '<li class="scrapbook-empty">Quiet garden and harvest updates will show up here.</li>'
    : entries.map((entry) => `
      <li class="scrapbook-activity-entry" data-activity-kind="${entry.kind}">
        <span class="scrapbook-activity-mark" aria-hidden="true"></span>
        <span>${entry.message}</span>
        <time datetime="${new Date(entry.at).toISOString()}">${relativeActivityTime(entry.at)}</time>
      </li>`).join('');
}

export function isActivityLogOpen() {
  return open;
}

export function setActivityLogOpen(value: boolean) {
  if (open === value) return;
  open = value;
  drawer?.classList.toggle('is-open', open);
  drawer?.setAttribute('aria-hidden', String(!open));
  toggleButton?.setAttribute('aria-expanded', String(open));
  if (open) render();
}

export function toggleActivityLog() {
  setActivityLogOpen(!open);
}

export function initializeActivityLog() {
  toggleButton = document.createElement('button');
  toggleButton.id = 'hud-activity-log';
  toggleButton.className = 'hud-icon-button';
  toggleButton.type = 'button';
  toggleButton.setAttribute('aria-label', 'Activity log');
  toggleButton.setAttribute('aria-expanded', 'false');
  toggleButton.innerHTML = '<span aria-hidden="true">&#8801;</span>';
  toggleButton.addEventListener('click', toggleActivityLog);
  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    toggleButton.addEventListener(eventName, (event) => event.stopPropagation());
  }
  // "A button by the settings" — sits immediately before the cog rather than
  // appended at the end, so the two feel grouped.
  const settingsButton = document.querySelector('#hud-settings');
  const hudActions = document.querySelector('#hud-actions');
  if (settingsButton && hudActions) hudActions.insertBefore(toggleButton, settingsButton);
  else hudActions?.append(toggleButton);

  drawer = document.createElement('aside');
  drawer.id = 'activity-log-drawer';
  drawer.className = 'activity-log-drawer';
  drawer.setAttribute('aria-label', 'Activity log');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.innerHTML = `
    <header class="activity-log-header">
      <h2>Activity</h2>
      <button type="button" class="hud-overlay-close" data-close-activity-log aria-label="Close activity log">×</button>
    </header>
    <p class="activity-log-note">Things that happened without needing to interrupt you.</p>
    <ol class="activity-log-list scrapbook-activity-list"></ol>
  `;
  document.body.append(drawer);
  listElement = drawer.querySelector('.activity-log-list');

  drawer.querySelector('[data-close-activity-log]')?.addEventListener('click', () => setActivityLogOpen(false));
  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    drawer.addEventListener(eventName, (event) => event.stopPropagation());
  }

  onGameStateChanged(() => {
    if (open) render();
  });
}
