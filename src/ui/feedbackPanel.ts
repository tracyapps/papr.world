import type {
  AlphaFeedbackCategory,
  AlphaFeedbackReproducibility,
} from '../../shared/src/index';
import { MAX_FEEDBACK_SCREENSHOT_BYTES } from '../../shared/src/index';
import { avatar } from '../game/avatar';
import { feedbackEndpointForPage } from '../net/feedbackEndpoint';
import {
  createFeedbackSubmission,
  FeedbackOutbox,
  type FeedbackContextInput,
} from '../net/feedbackOutbox';
import { loadPassport } from '../net/passport';
import { LEGACY_INVITE_CODE, sanitizeInviteCode } from '../../shared/src/index';
import { getPage } from '../world/pages';
import { getCurrentPageId } from '../world/streaming';
import { pageOfPosition } from '../world/types';

let overlay: HTMLElement | null = null;
let lastFocused: HTMLElement | null = null;
const outbox = new FeedbackOutbox();
let capturedScreenshot: string | null = null;

function describeBrowser(): string {
  const ua = navigator.userAgent;
  if (/Firefox\//.test(ua)) return `Firefox ${ua.match(/Firefox\/(\d+)/)?.[1] ?? ''}`.trim();
  if (/Edg\//.test(ua)) return `Edge ${ua.match(/Edg\/(\d+)/)?.[1] ?? ''}`.trim();
  if (/Chrome\//.test(ua)) return `Chrome ${ua.match(/Chrome\/(\d+)/)?.[1] ?? ''}`.trim();
  if (/Safari\//.test(ua)) return 'Safari';
  return 'Other browser';
}

function describePlatform(): string {
  const ua = navigator.userAgent;
  if (/Mac/.test(ua)) return 'macOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad/.test(ua)) return 'iOS/iPadOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Other platform';
}

function contextFor(includeIdentity: boolean): FeedbackContextInput {
  const url = new URL(window.location.href);
  const position = avatar.position;
  const coord = pageOfPosition(position.x, position.z);
  const shared = url.searchParams.get('shared') === '1';
  const neighborhoodCode = sanitizeInviteCode(url.searchParams.get('invite')) ?? LEGACY_INVITE_CODE;
  const accountId = includeIdentity ? loadPassport()?.id : undefined;
  return {
    clientBuild: import.meta.env.VITE_BUILD_ID || `0.1.0-${import.meta.env.MODE}`,
    mode: shared ? 'shared' : 'solo',
    ...(shared ? { roomId: neighborhoodCode } : {}),
    ...(accountId ? { accountId } : {}),
    pageId: getCurrentPageId(),
    biome: getPage(coord.px, coord.pz).biome,
    x: position.x,
    z: position.z,
    browser: describeBrowser(),
    platform: describePlatform(),
    recentGameEvents: [],
  };
}

function buildOverlay(): HTMLElement {
  const element = document.createElement('div');
  element.className = 'hud-overlay feedback-overlay';
  element.hidden = true;
  element.innerHTML = `
    <div class="hud-overlay-card feedback-card" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
      <button class="hud-overlay-close" type="button" aria-label="Close feedback">×</button>
      <p class="hud-overlay-kicker">Invited alpha notebook</p>
      <h2 id="feedback-title">Send feedback</h2>
      <p class="feedback-intro">A bug, a better way, or a brand-new thought — it all helps shape this paper world.</p>
      <form class="feedback-form">
        <label>
          <span>What kind of note is this?</span>
          <select name="category">
            <option value="bug">Bug</option>
            <option value="improvement">Improvement</option>
            <option value="idea">New idea</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          <span>Short summary</span>
          <input name="summary" maxlength="120" required placeholder="The bridge felt…">
        </label>
        <label>
          <span>Tell me a little more</span>
          <textarea name="details" maxlength="4000" required rows="4" placeholder="What happened, or what would make it better?"></textarea>
        </label>
        <div class="feedback-bug-fields">
          <label>
            <span>What did you expect?</span>
            <textarea name="expected" maxlength="1500" rows="2"></textarea>
          </label>
          <label>
            <span>Can it happen again?</span>
            <select name="reproducibility">
              <option value="unknown">Not sure</option>
              <option value="once">Only once so far</option>
              <option value="sometimes">Sometimes</option>
              <option value="always">Every time</option>
            </select>
          </label>
        </div>
        <fieldset class="feedback-context">
          <legend>Attached context</legend>
          <p class="feedback-context-summary"></p>
          <label class="feedback-identity">
            <input type="checkbox" name="includeIdentity" checked>
            <span>Include my paper passport id so you can connect this note to my shared-world visit</span>
          </label>
          <small>No passport secret, save file, chat, drawing, keystrokes, or console log is attached.</small>
        </fieldset>
        <fieldset class="feedback-screenshot">
          <legend>Optional screenshot</legend>
          <p>Nothing is captured until you press the button. The image contains the 3D world canvas, not chat or other menus.</p>
          <div class="feedback-screenshot-actions">
            <button type="button" data-capture-feedback>Capture the world now</button>
            <span class="feedback-screenshot-status" role="status" aria-live="polite"></span>
          </div>
          <figure class="feedback-screenshot-preview" hidden>
            <img alt="Fresh game screenshot attached to this feedback note">
            <figcaption>
              <span>Fresh screenshot attached</span>
              <button type="button" data-remove-feedback-screenshot>Remove</button>
            </figcaption>
          </figure>
        </fieldset>
        <p class="feedback-status" role="status" aria-live="polite"></p>
        <button class="feedback-submit" type="submit">Tuck this note into the outbox</button>
      </form>
      <section class="feedback-outbox" aria-labelledby="feedback-outbox-title">
        <h3 id="feedback-outbox-title">Your feedback outbox</h3>
        <div class="feedback-outbox-list"></div>
      </section>
    </div>`;

  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    element.addEventListener(eventName, (event) => event.stopPropagation());
  }
  element.addEventListener('keydown', (event) => event.stopPropagation());
  element.addEventListener('click', (event) => {
    if (event.target === element || (event.target as HTMLElement).closest('.hud-overlay-close')) {
      closeFeedbackPanel();
      return;
    }
    const retry = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-retry-feedback]');
    if (retry) void sendAndRender(retry.dataset.retryFeedback ?? '');
    const capture = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-capture-feedback]');
    if (capture) void captureScreenshot(element, capture);
    if ((event.target as HTMLElement).closest('[data-remove-feedback-screenshot]')) {
      clearCapturedScreenshot(element);
    }
  });

  const form = element.querySelector<HTMLFormElement>('.feedback-form');
  const category = form?.elements.namedItem('category') as HTMLSelectElement | null;
  category?.addEventListener('change', () => reflectCategory(element));
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    void submitForm(form, element);
  });
  reflectCategory(element);
  return element;
}

function reflectCategory(element: HTMLElement): void {
  const form = element.querySelector<HTMLFormElement>('.feedback-form');
  const category = form?.elements.namedItem('category') as HTMLSelectElement | null;
  element.classList.toggle('is-bug', category?.value === 'bug');
}

async function submitForm(form: HTMLFormElement, element: HTMLElement): Promise<void> {
  const status = element.querySelector<HTMLElement>('.feedback-status');
  const value = (name: string) => (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
  const includeIdentity = (form.elements.namedItem('includeIdentity') as HTMLInputElement).checked;
  try {
    const category = value('category') as AlphaFeedbackCategory;
    const id = globalThis.crypto.randomUUID();
    const submission = createFeedbackSubmission({
      id,
      category,
      summary: value('summary'),
      details: value('details'),
      ...(category === 'bug' && value('expected') ? { expected: value('expected') } : {}),
      ...(category === 'bug'
        ? { reproducibility: value('reproducibility') as AlphaFeedbackReproducibility }
        : {}),
      ...(capturedScreenshot ? { screenshotId: id } : {}),
      context: contextFor(includeIdentity),
    });
    if (capturedScreenshot) outbox.saveScreenshot(id, capturedScreenshot);
    outbox.enqueue(submission);
    clearCapturedScreenshot(element);
    if (status) status.textContent = 'Saved safely in this device’s outbox. Sending…';
    renderOutbox(element);
    const result = await sendAndRender(submission.id);
    if (status) status.textContent = result?.state === 'sent'
      ? `Sent — receipt ${result.receiptId}.`
      : 'Saved for retry. You can keep playing even while the server is away.';
    if (result?.state === 'sent') {
      (form.elements.namedItem('summary') as HTMLInputElement).value = '';
      (form.elements.namedItem('details') as HTMLTextAreaElement).value = '';
      (form.elements.namedItem('expected') as HTMLTextAreaElement).value = '';
    }
  } catch (error) {
    if (status) status.textContent = error instanceof Error ? error.message : 'That note could not be saved.';
  }
}

async function captureScreenshot(element: HTMLElement, button: HTMLButtonElement): Promise<void> {
  const status = element.querySelector<HTMLElement>('.feedback-screenshot-status');
  button.disabled = true;
  if (status) status.textContent = 'Capturing a fresh frame…';
  try {
    const gameCanvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!gameCanvas) throw new Error('The world canvas is not ready yet.');
    // Wait for the active render loop to finish a fresh world frame. The
    // feedback DOM is not part of this canvas and is therefore never captured.
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    capturedScreenshot = await compressGameCanvas(gameCanvas);
    const preview = element.querySelector<HTMLElement>('.feedback-screenshot-preview');
    const image = preview?.querySelector<HTMLImageElement>('img');
    if (image) image.src = capturedScreenshot;
    if (preview) preview.hidden = false;
    const bytes = screenshotBytes(capturedScreenshot);
    if (status) status.textContent = `Attached (${Math.ceil(bytes / 1024)} KB).`;
  } catch (error) {
    capturedScreenshot = null;
    if (status) status.textContent = error instanceof Error
      ? error.message
      : 'The screenshot could not be captured.';
  } finally {
    button.disabled = false;
  }
}

function clearCapturedScreenshot(element: HTMLElement): void {
  capturedScreenshot = null;
  const preview = element.querySelector<HTMLElement>('.feedback-screenshot-preview');
  const image = preview?.querySelector<HTMLImageElement>('img');
  if (image) image.removeAttribute('src');
  if (preview) preview.hidden = true;
  const status = element.querySelector<HTMLElement>('.feedback-screenshot-status');
  if (status) status.textContent = '';
}

async function compressGameCanvas(source: HTMLCanvasElement): Promise<string> {
  const scale = Math.min(1, 1280 / Math.max(1, source.width), 720 / Math.max(1, source.height));
  let width = Math.max(1, Math.round(source.width * scale));
  let height = Math.max(1, Math.round(source.height * scale));
  const qualities = [0.72, 0.56, 0.42, 0.36];
  for (const quality of qualities) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The screenshot canvas is unavailable.');
    context.drawImage(source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality));
    if (blob && ['image/webp', 'image/png'].includes(blob.type) &&
      blob.size <= MAX_FEEDBACK_SCREENSHOT_BYTES) {
      return blobToDataUrl(blob);
    }
    width = Math.max(1, Math.round(width * 0.78));
    height = Math.max(1, Math.round(height * 0.78));
  }
  throw new Error('The screenshot stayed too large. Try a smaller browser window.');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(new Error('The screenshot could not be read.')));
    reader.readAsDataURL(blob);
  });
}

function screenshotBytes(dataUrl: string): number {
  const base64 = dataUrl.split(',', 2)[1] ?? '';
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor(base64.length * 3 / 4) - padding;
}

async function sendAndRender(id: string) {
  if (!id) return null;
  let result;
  try {
    result = await outbox.send(id, feedbackEndpointForPage(new URL(window.location.href)));
  } catch {
    result = null;
  }
  if (overlay) renderOutbox(overlay);
  return result;
}

function renderOutbox(element: HTMLElement): void {
  const list = element.querySelector<HTMLElement>('.feedback-outbox-list');
  const context = element.querySelector<HTMLElement>('.feedback-context-summary');
  if (context) {
    const safe = contextFor(false);
    context.textContent = `${safe.mode} · ${safe.biome} · page ${safe.pageId} · ${safe.browser} on ${safe.platform}`;
  }
  if (!list) return;
  const entries = outbox.list();
  if (entries.length === 0) {
    list.innerHTML = '<p class="feedback-outbox-empty">No notes yet.</p>';
    return;
  }
  list.innerHTML = entries.map((entry) => `
    <article class="feedback-outbox-entry" data-state="${entry.state}">
      <span><strong>${escapeHtml(entry.submission.summary)}</strong><small>${entry.submission.category}</small></span>
      ${entry.submission.screenshotId ? '<span class="feedback-outbox-attachment">screenshot</span>' : ''}
      ${entry.state === 'sent'
    ? `<code title="Receipt id">${escapeHtml(entry.receiptId ?? entry.submission.id)}</code>`
    : `<button type="button" data-retry-feedback="${escapeHtml(entry.submission.id)}">Retry</button>`}
      <em>${entry.state === 'sent' ? 'sent' : 'needs retry'}</em>
    </article>`).join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}

export function openFeedbackPanel(): void {
  if (!overlay) {
    overlay = buildOverlay();
    document.body.append(overlay);
  }
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  renderOutbox(overlay);
  overlay.hidden = false;
  overlay.classList.add('is-open');
  overlay.querySelector<HTMLElement>('[name="summary"]')?.focus();
}

export function closeFeedbackPanel(): boolean {
  if (!overlay?.classList.contains('is-open')) return false;
  overlay.classList.remove('is-open');
  overlay.hidden = true;
  lastFocused?.focus();
  lastFocused = null;
  return true;
}

export function initializeFeedbackPanel(): void {
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && closeFeedbackPanel()) event.stopImmediatePropagation();
  }, true);
  window.addEventListener('online', () => {
    try {
      void outbox.retryPending(feedbackEndpointForPage(new URL(window.location.href)))
        .then(() => overlay && renderOutbox(overlay));
    } catch {
      // Invalid deployment configuration stays visible when the panel opens.
    }
  });
}
