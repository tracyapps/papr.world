import { flushWardrobeSync } from '../net/accountWardrobe';
import { accountDeskUrl } from '../net/accountDesk';
import { disconnectSharedSession } from '../net/sharedSession';
import { getGameState, onGameStateChanged } from '../sim/state';
import { BIOME_MAP_NAMES, compassArrow, compassPoint, distanceWords } from '../world/biomeCompass';
import { getGroundMapColor } from '../world/pageRuntime';
import { buildActivityFeed, type LogFilter } from './activityFeed';
import { getDirectionHints, onDirectionHintsChanged } from './directionHints';
import { openTreasureMap } from './treasureMap';

const FILTERS: Array<{ id: LogFilter; label: string }> = [
  { id: 'activity', label: 'Activity' },
  { id: 'travel', label: 'Map & travel' },
  { id: 'conversations', label: 'Conversations' },
];

let drawer: HTMLElement | null = null;
let listElement: HTMLOListElement | null = null;
let filterElement: HTMLElement | null = null;
let mapElement: HTMLElement | null = null;
let toggleButton: HTMLButtonElement | null = null;
let countElement: HTMLElement | null = null;
let open = false;
let query = '';
const activeFilters = new Set<LogFilter>(FILTERS.map((filter) => filter.id));

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

export function relativeActivityTime(at: number, now = Date.now()): string {
  const elapsedSeconds = Math.max(0, Math.floor((now - at) / 1000));
  if (elapsedSeconds < 60) return 'just now';
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function totalLogCount() {
  const player = getGameState().player;
  return player.activityLog.length + player.travelLog.length + player.diaryEntries.length;
}

function renderToggleCount() {
  const count = totalLogCount();
  if (countElement) {
    countElement.textContent = count > 99 ? '99+' : String(count);
    countElement.hidden = count === 0;
  }
  toggleButton?.setAttribute('aria-label', count > 0 ? `Logs, ${count} entries` : 'Logs');
}

function renderFilters() {
  if (!filterElement) return;
  filterElement.innerHTML = FILTERS.map((filter) => {
    const selected = activeFilters.has(filter.id);
    return `
      <button type="button" class="activity-log-filter${selected ? ' is-selected' : ''}"
        data-log-filter="${filter.id}" aria-pressed="${selected}">${filter.label}</button>`;
  }).join('');
}

function renderMapTools() {
  if (!mapElement) return;
  mapElement.hidden = !activeFilters.has('travel');
  if (mapElement.hidden) return;
  const hints = getDirectionHints();
  mapElement.innerHTML = `
    <button type="button" class="activity-log-map-button" data-open-log-map>Unfold the map <span aria-hidden="true">(N)</span></button>
    ${hints.length === 0
    ? '<p>Walk a little farther and nearby lands will appear here.</p>'
    : `<ul>${hints.map((hint) => `
        <li><span class="treasure-map-swatch" style="--swatch:${getGroundMapColor(hint.biome)}" aria-hidden="true"></span>
          ${escapeHtml(BIOME_MAP_NAMES[hint.biome])} · ${compassPoint(hint.bearing)} ${compassArrow(hint.bearing)}, ${distanceWords(hint.distance)}</li>`).join('')}</ul>`}`;
}

function renderList() {
  if (!listElement) return;
  const entries = buildActivityFeed(getGameState(), activeFilters, query);
  if (activeFilters.size === 0) {
    listElement.innerHTML = '<li class="activity-log-empty">Choose one or more filters to build this log.</li>';
    return;
  }
  if (entries.length === 0) {
    listElement.innerHTML = query.trim()
      ? `<li class="activity-log-empty">Nothing matches “${escapeHtml(query.trim())}”.</li>`
      : '<li class="activity-log-empty">Nothing has been recorded in these logs yet.</li>';
    return;
  }
  listElement.innerHTML = entries.map((entry) => `
    <li class="activity-log-entry" data-log-kind="${entry.filter}" data-entry-kind="${escapeHtml(entry.kind)}">
      <span class="activity-log-entry-mark" aria-hidden="true"></span>
      <article>
        <header><strong>${escapeHtml(entry.title)}</strong><time datetime="${new Date(entry.at).toISOString()}">${relativeActivityTime(entry.at)}</time></header>
        <p>${escapeHtml(entry.message)}</p>
        <small>${escapeHtml(entry.detail)}</small>
      </article>
    </li>`).join('');
}

function render() {
  renderToggleCount();
  if (!open) return;
  renderFilters();
  renderMapTools();
  renderList();
}

export function isActivityLogOpen() {
  return open;
}

export function setActivityLogOpen(value: boolean) {
  if (open === value) return;
  open = value;
  drawer?.classList.toggle('is-open', open);
  drawer?.setAttribute('aria-hidden', String(!open));
  if (drawer) drawer.inert = !open;
  toggleButton?.setAttribute('aria-expanded', String(open));
  if (open) render();
}

export function toggleActivityLog() {
  setActivityLogOpen(!open);
}

export function initializeActivityLog() {
  toggleButton = document.createElement('button');
  toggleButton.id = 'hud-activity-log';
  toggleButton.className = 'hud-icon-button hud-log-button';
  toggleButton.type = 'button';
  toggleButton.setAttribute('aria-label', 'Logs');
  toggleButton.setAttribute('aria-expanded', 'false');
  toggleButton.innerHTML = '<span aria-hidden="true">&#8801;</span><span class="activity-log-count" hidden></span>';
  countElement = toggleButton.querySelector('.activity-log-count');
  toggleButton.addEventListener('click', toggleActivityLog);
  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    toggleButton.addEventListener(eventName, (event) => event.stopPropagation());
  }
  const settingsButton = document.querySelector('#hud-settings');
  const hudActions = document.querySelector('#hud-actions');
  if (settingsButton && hudActions) hudActions.insertBefore(toggleButton, settingsButton);
  else hudActions?.append(toggleButton);

  drawer = document.createElement('aside');
  drawer.id = 'activity-log-drawer';
  drawer.className = 'activity-log-drawer';
  drawer.setAttribute('aria-label', 'Logs');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.inert = true;
  drawer.innerHTML = `
    <header class="activity-log-header">
      <h2>Logs</h2>
      <button type="button" class="hud-overlay-close" data-close-activity-log aria-label="Close logs">×</button>
    </header>
    <p class="activity-log-note">Mix activity, travel, and remembered conversations into one timeline.</p>
    <div class="activity-log-filters" role="group" aria-label="Show log portions"></div>
    <label class="activity-log-search" for="activity-log-search">Search
      <input id="activity-log-search" type="search" placeholder="A place, neighbor, or event…" autocomplete="off">
    </label>
    <section class="activity-log-map" aria-label="Map and nearby lands"></section>
    <ol class="activity-log-list"></ol>
    <div class="hud-setting hud-setting-action activity-log-leave">
      <button class="hud-setting-button" type="button" id="activity-log-return-to-desk">Return to your desk</button>
      <small>Leaves this world cleanly and takes you back to your account.</small>
    </div>`;
  document.body.append(drawer);
  listElement = drawer.querySelector('.activity-log-list');
  filterElement = drawer.querySelector('.activity-log-filters');
  mapElement = drawer.querySelector('.activity-log-map');

  drawer.querySelector('[data-close-activity-log]')?.addEventListener('click', () => setActivityLogOpen(false));
  drawer.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const filter = target.closest<HTMLButtonElement>('[data-log-filter]')?.dataset.logFilter as LogFilter | undefined;
    if (filter) {
      if (activeFilters.has(filter)) activeFilters.delete(filter);
      else activeFilters.add(filter);
      render();
      return;
    }
    if (target.closest('[data-open-log-map]')) openTreasureMap();
  });
  drawer.querySelector<HTMLInputElement>('#activity-log-search')?.addEventListener('input', (event) => {
    query = (event.target as HTMLInputElement).value;
    renderList();
  });
  drawer.querySelector<HTMLButtonElement>('#activity-log-return-to-desk')?.addEventListener('click', () => {
    disconnectSharedSession();
    void flushWardrobeSync().then(() => window.location.assign(accountDeskUrl()));
  });
  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    drawer.addEventListener(eventName, (event) => event.stopPropagation());
  }

  onGameStateChanged(render);
  onDirectionHintsChanged(() => {
    if (open && activeFilters.has('travel')) renderMapTools();
  });
  window.setInterval(() => {
    if (open) renderList();
  }, 30_000);
  renderToggleCount();
}
