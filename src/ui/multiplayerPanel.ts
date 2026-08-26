import { sanitizeInviteCode, sanitizeName } from '../../shared/src/index';
import {
  disconnectSharedSession,
  getSharedSessionStatus,
  subscribeSharedSessionStatus,
  type SharedSessionStatus,
} from '../net/sharedSession';
import {
  buildSharedPlayUrl,
  buildSoloUrl,
  generateInviteCode,
} from '../net/sharedConfig';
import { revealMultiplayerPanel } from './multiplayerPanelState';

let overlay: HTMLElement | null = null;
let statusButton: HTMLButtonElement | null = null;
let lastFocused: HTMLElement | null = null;
let initialized = false;

function buildOverlay(): HTMLElement {
  const element = document.createElement('div');
  element.className = 'hud-overlay multiplayer-overlay';
  element.hidden = true;
  element.innerHTML = `
    <div class="hud-overlay-card multiplayer-card" role="dialog" aria-modal="true" aria-labelledby="multiplayer-title">
      <button class="hud-overlay-close" type="button" aria-label="Close play with friends">×</button>
      <p class="hud-overlay-kicker">Invite-only alpha</p>
      <h2 id="multiplayer-title">Play with friends</h2>
      <p class="multiplayer-intro">Open a small neighborhood or enter a friend's code. Your ordinary world stays solo unless you choose to connect.</p>
      <section class="multiplayer-state" aria-labelledby="multiplayer-state-title">
        <h3 id="multiplayer-state-title">Connection</h3>
        <p data-multiplayer-state role="status" aria-live="polite">Playing in your solo world.</p>
      </section>
      <form class="multiplayer-connect" data-multiplayer-connect>
        <label>
          <span>Your name here</span>
          <input name="name" maxlength="24" autocomplete="nickname" required>
        </label>
        <div class="multiplayer-create-row">
          <button type="submit" name="action" value="create">Open a new neighborhood</button>
          <small>We will make a short code you can send to friends.</small>
        </div>
        <div class="multiplayer-divider"><span>or</span></div>
        <label>
          <span>Friend's invite code</span>
          <input name="invite" maxlength="7" inputmode="text" autocapitalize="characters" autocomplete="off" placeholder="ABCD-23">
        </label>
        <button type="submit" name="action" value="join">Join that neighborhood</button>
        <p class="multiplayer-form-error" data-multiplayer-error role="alert"></p>
      </form>
      <section class="multiplayer-visit" data-multiplayer-visit hidden>
        <p class="multiplayer-code-label">Neighborhood code</p>
        <strong class="multiplayer-code" data-multiplayer-code></strong>
        <p class="multiplayer-code-hint">Only people with this code can find this neighborhood.</p>
        <div class="multiplayer-visit-actions">
          <button type="button" data-copy-invite>Copy invitation link</button>
          <button type="button" data-retry-shared hidden>Try connecting again</button>
          <button class="multiplayer-solo-button" type="button" data-return-solo>Return to solo play</button>
        </div>
        <p class="multiplayer-copy-status" data-copy-status role="status" aria-live="polite"></p>
      </section>
      <p class="multiplayer-alpha-note">Alpha note: resets may still be necessary. Host removal and personal mute/block are the next safety controls before outside invitations.</p>
    </div>`;

  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    element.addEventListener(eventName, (event) => event.stopPropagation());
  }
  element.addEventListener('keydown', (event) => event.stopPropagation());
  element.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target === element || target.closest('.hud-overlay-close')) {
      closeMultiplayerPanel();
      return;
    }
    if (target.closest('[data-return-solo]')) {
      disconnectSharedSession();
      window.location.assign(buildSoloUrl(new URL(window.location.href)));
      return;
    }
    if (target.closest('[data-retry-shared]')) {
      window.location.reload();
      return;
    }
    if (target.closest('[data-copy-invite]')) void copyInviteLink(element);
  });

  const form = element.querySelector<HTMLFormElement>('[data-multiplayer-connect]');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = submitter?.value === 'join' ? 'join' : 'create';
    startSharedPlay(form, element, action);
  });
  return element;
}

function startSharedPlay(
  form: HTMLFormElement,
  element: HTMLElement,
  intent: 'create' | 'join',
): void {
  const data = new FormData(form);
  const name = sanitizeName(data.get('name'));
  const error = element.querySelector<HTMLElement>('[data-multiplayer-error]');
  const inviteCode = intent === 'create'
    ? generateInviteCode()
    : sanitizeInviteCode(data.get('invite'));
  if (!inviteCode) {
    if (error) error.textContent = 'Enter the six-character code your friend sent, such as ABCD-23.';
    form.querySelector<HTMLInputElement>('[name="invite"]')?.focus();
    return;
  }
  if (error) error.textContent = '';
  sessionStorage.setItem('pp.shared-name.v1', name);
  const next = buildSharedPlayUrl(new URL(window.location.href), { inviteCode, intent, name });
  window.location.assign(next);
}

async function copyInviteLink(element: HTMLElement): Promise<void> {
  const status = getSharedSessionStatus();
  const output = element.querySelector<HTMLElement>('[data-copy-status]');
  if (!status.inviteCode) return;
  const link = buildSharedPlayUrl(new URL(window.location.href), {
    inviteCode: status.inviteCode,
    intent: 'join',
  }).toString();
  try {
    await navigator.clipboard.writeText(link);
    if (output) output.textContent = 'Invitation link copied.';
  } catch {
    if (output) output.textContent = `Copy this link: ${link}`;
  }
}

function reflectStatus(next: SharedSessionStatus): void {
  statusButton?.setAttribute(
    'aria-label',
    next.phase === 'solo' ? 'Play with friends — currently solo' : `Play with friends — ${next.message}`,
  );
  if (statusButton) statusButton.dataset.phase = next.phase;
  if (!overlay) return;
  const state = overlay.querySelector<HTMLElement>('[data-multiplayer-state]');
  const connect = overlay.querySelector<HTMLElement>('[data-multiplayer-connect]');
  const visit = overlay.querySelector<HTMLElement>('[data-multiplayer-visit]');
  const code = overlay.querySelector<HTMLElement>('[data-multiplayer-code]');
  const retry = overlay.querySelector<HTMLElement>('[data-retry-shared]');
  if (state) {
    state.textContent = next.message;
    state.dataset.phase = next.phase;
  }
  const hasInvite = Boolean(next.inviteCode);
  if (connect) connect.hidden = hasInvite;
  if (visit) visit.hidden = !hasInvite;
  if (code) code.textContent = next.inviteCode ?? '';
  if (retry) retry.hidden = next.phase !== 'offline' && next.phase !== 'setup-error';
  if ((next.phase === 'offline' || next.phase === 'setup-error')
    && !overlay.classList.contains('is-open')) {
    openMultiplayerPanel();
  }
}

export function openMultiplayerPanel(): void {
  if (!overlay) return;
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  // Offline/setup-error status intentionally opens this panel. Reveal first so
  // reflecting that status cannot recursively request another open.
  revealMultiplayerPanel(overlay, () => reflectStatus(getSharedSessionStatus()));
  const name = overlay.querySelector<HTMLInputElement>('[name="name"]');
  if (name && !name.value) name.value = sessionStorage.getItem('pp.shared-name.v1') ?? 'Paper Friend';
  (getSharedSessionStatus().inviteCode
    ? overlay.querySelector<HTMLElement>('[data-copy-invite]')
    : name)?.focus();
}

export function closeMultiplayerPanel(): boolean {
  if (!overlay?.classList.contains('is-open')) return false;
  overlay.classList.remove('is-open');
  overlay.hidden = true;
  lastFocused?.focus();
  lastFocused = null;
  return true;
}

export function initializeMultiplayerPanel(): void {
  if (initialized) return;
  initialized = true;
  overlay = buildOverlay();
  document.body.append(overlay);
  statusButton = document.createElement('button');
  statusButton.className = 'hud-icon-button multiplayer-status-button';
  statusButton.type = 'button';
  statusButton.innerHTML = '<span class="multiplayer-status-icon" aria-hidden="true"></span>';
  statusButton.addEventListener('click', openMultiplayerPanel);
  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    statusButton.addEventListener(eventName, (event) => event.stopPropagation());
  }
  document.querySelector('#hud-actions')?.prepend(statusButton);
  subscribeSharedSessionStatus(reflectStatus);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && closeMultiplayerPanel()) event.stopImmediatePropagation();
  }, true);
}
