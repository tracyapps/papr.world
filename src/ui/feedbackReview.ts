import {
  ALPHA_FEEDBACK_STATUSES,
  type AlphaFeedbackReviewRecord,
  type AlphaFeedbackStatus,
} from '../../shared/src/index';
import { feedbackEndpointForPage } from '../net/feedbackEndpoint';

const TOKEN_KEY = 'pp.feedback-review-token.v1';
let root: HTMLElement | null = null;
let screenshotUrls: string[] = [];

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  })[character] ?? character);
}

function apiBase(): string {
  return feedbackEndpointForPage(new URL(window.location.href)).replace(/\/$/, '');
}

function token(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? '';
}

async function reviewFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${apiBase()}${path}`, {
    ...init,
    credentials: 'omit',
    headers: {
      ...init.headers,
      authorization: `Bearer ${token()}`,
    },
  });
}

function setStatus(message: string, isError = false): void {
  const status = root?.querySelector<HTMLElement>('[data-review-status]');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function filters(): URLSearchParams {
  const form = root?.querySelector<HTMLFormElement>('[data-review-filters]');
  const params = new URLSearchParams();
  if (!form) return params;
  const data = new FormData(form);
  for (const key of ['category', 'status', 'build', 'id']) {
    const value = String(data.get(key) ?? '').trim();
    if (value) params.set(key, value);
  }
  return params;
}

function renderRecord(record: AlphaFeedbackReviewRecord): string {
  const item = record.submission;
  const notes = record.auditNotes.length
    ? `<ol class="feedback-review-notes">${record.auditNotes.map((note) => `
        <li><time>${escapeHtml(new Date(note.at).toLocaleString())}</time>${escapeHtml(note.note)}</li>`).join('')}</ol>`
    : '<p class="feedback-review-muted">No reviewer notes yet.</p>';
  const screenshot = item.screenshotId
    ? `<figure class="feedback-review-image"><img data-review-screenshot="${escapeHtml(item.screenshotId)}" alt="Player-attached world screenshot"><figcaption>Player-triggered world screenshot</figcaption></figure>`
    : '';
  return `
    <article class="feedback-review-record" data-feedback-id="${escapeHtml(item.id)}">
      <header>
        <div><span class="feedback-review-category">${escapeHtml(item.category)}</span><h2>${escapeHtml(item.summary)}</h2></div>
        <code>${escapeHtml(item.id)}</code>
      </header>
      <div class="feedback-review-meta">
        <span>${escapeHtml(new Date(item.createdAt).toLocaleString())}</span>
        <span>${escapeHtml(item.context.clientBuild)}</span>
        <span>${escapeHtml(item.context.mode)}</span>
        <span>${escapeHtml(item.context.biome)} · ${escapeHtml(item.context.pageId)}</span>
        <span>x ${item.context.x.toFixed(2)}, z ${item.context.z.toFixed(2)}</span>
        ${item.context.accountId ? `<span>passport ${escapeHtml(item.context.accountId)}</span>` : ''}
      </div>
      <div class="feedback-review-copy">
        <section><h3>Details</h3><p>${escapeHtml(item.details)}</p></section>
        ${item.expected ? `<section><h3>Expected</h3><p>${escapeHtml(item.expected)}</p></section>` : ''}
        ${item.reproducibility ? `<section><h3>Reproducibility</h3><p>${escapeHtml(item.reproducibility)}</p></section>` : ''}
      </div>
      ${screenshot}
      <section class="feedback-review-audit"><h3>Review trail</h3>${notes}</section>
      <form class="feedback-review-update">
        <label>Status<select name="status">${ALPHA_FEEDBACK_STATUSES.map((status) =>
          `<option value="${status}"${status === record.status ? ' selected' : ''}>${status}</option>`).join('')}</select></label>
        <label>Private reviewer note<textarea name="note" maxlength="500" rows="2" placeholder="Optional note for the review team"></textarea></label>
        <button type="submit">Save review</button>
      </form>
    </article>`;
}

async function loadScreenshots(): Promise<void> {
  for (const url of screenshotUrls) URL.revokeObjectURL(url);
  screenshotUrls = [];
  const images = root?.querySelectorAll<HTMLImageElement>('[data-review-screenshot]') ?? [];
  await Promise.all([...images].map(async (image) => {
    const id = image.dataset.reviewScreenshot;
    if (!id) return;
    try {
      const response = await reviewFetch(`/review/feedback/screenshot/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      screenshotUrls.push(url);
      image.src = url;
    } catch {
      image.replaceWith(Object.assign(document.createElement('p'), {
        className: 'feedback-review-muted',
        textContent: 'Screenshot unavailable.',
      }));
    }
  }));
}

async function loadRecords(): Promise<void> {
  const list = root?.querySelector<HTMLElement>('[data-review-list]');
  if (!list || !token()) return;
  setStatus('Loading feedback…');
  try {
    const query = filters().toString();
    const response = await reviewFetch(`/review/feedback${query ? `?${query}` : ''}`);
    if (!response.ok) throw new Error(response.status === 401
      ? 'That reviewer token was not accepted.'
      : `The review server returned ${response.status}.`);
    const data = await response.json() as { records?: AlphaFeedbackReviewRecord[] };
    const records = Array.isArray(data.records) ? data.records : [];
    list.innerHTML = records.length
      ? records.map(renderRecord).join('')
      : '<p class="feedback-review-empty">No feedback matches these filters.</p>';
    setStatus(`${records.length} feedback ${records.length === 1 ? 'note' : 'notes'}`);
    await loadScreenshots();
  } catch (error) {
    list.innerHTML = '';
    setStatus(error instanceof Error ? error.message : 'Feedback could not be loaded.', true);
  }
}

async function saveReview(form: HTMLFormElement): Promise<void> {
  const card = form.closest<HTMLElement>('[data-feedback-id]');
  const id = card?.dataset.feedbackId;
  if (!id) return;
  const data = new FormData(form);
  const status = String(data.get('status') ?? '') as AlphaFeedbackStatus;
  const note = String(data.get('note') ?? '').trim();
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;
  setStatus('Saving review…');
  try {
    const response = await reviewFetch(`/review/feedback/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, ...(note ? { note } : {}) }),
    });
    if (!response.ok) throw new Error(`The review server returned ${response.status}.`);
    await loadRecords();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'The review could not be saved.', true);
    if (button) button.disabled = false;
  }
}

async function exportFeedback(): Promise<void> {
  setStatus('Preparing redacted export…');
  try {
    const response = await reviewFetch('/review/feedback/export');
    if (!response.ok) throw new Error(`The review server returned ${response.status}.`);
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `pencil-and-paper-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Redacted export downloaded. Passport ids and reviewer notes were removed.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'The export could not be prepared.', true);
  }
}

function buildReviewRoot(): HTMLElement {
  const element = document.createElement('main');
  element.className = 'feedback-review';
  element.innerHTML = `
    <header class="feedback-review-heading">
      <div><p>Invited alpha</p><h1>Feedback review desk</h1></div>
      <button type="button" data-review-export>Export redacted JSON</button>
    </header>
    <form class="feedback-review-login" data-review-login>
      <label>Reviewer token<input name="token" type="password" autocomplete="current-password" required></label>
      <button type="submit">Unlock review desk</button>
      <small>Kept only for this browser tab. It is never placed in the URL or a feedback report.</small>
    </form>
    <form class="feedback-review-filters" data-review-filters>
      <label>Kind<select name="category"><option value="">All kinds</option><option value="bug">Bug</option><option value="improvement">Improvement</option><option value="idea">Idea</option><option value="other">Other</option></select></label>
      <label>Status<select name="status"><option value="">All statuses</option>${ALPHA_FEEDBACK_STATUSES.map((status) => `<option value="${status}">${status}</option>`).join('')}</select></label>
      <label>Build<input name="build" maxlength="80" placeholder="0.1.0-alpha"></label>
      <label>Receipt / id<input name="id" maxlength="128" placeholder="Search id"></label>
      <button type="submit">Apply filters</button>
    </form>
    <p class="feedback-review-status" data-review-status role="status" aria-live="polite"></p>
    <section class="feedback-review-list" data-review-list aria-label="Feedback reports"></section>`;
  element.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    if (form.matches('[data-review-login]')) {
      const supplied = String(new FormData(form).get('token') ?? '').trim();
      if (supplied) sessionStorage.setItem(TOKEN_KEY, supplied);
      void loadRecords();
    } else if (form.matches('[data-review-filters]')) {
      void loadRecords();
    } else if (form.matches('.feedback-review-update')) {
      void saveReview(form);
    }
  });
  element.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('[data-review-export]')) void exportFeedback();
  });
  return element;
}

/** Activates only for the private `?review=1` route. */
export function initializeFeedbackReview(): boolean {
  if (new URL(window.location.href).searchParams.get('review') !== '1') return false;
  root = buildReviewRoot();
  document.body.append(root);
  document.body.classList.add('is-feedback-reviewing');
  for (const sibling of [...document.body.children]) {
    if (sibling === root) continue;
    sibling.setAttribute('inert', '');
    sibling.setAttribute('aria-hidden', 'true');
  }
  if (token()) {
    const input = root.querySelector<HTMLInputElement>('[name="token"]');
    if (input) input.value = token();
    void loadRecords();
  } else {
    setStatus('Enter the private reviewer token to load feedback.');
  }
  return true;
}
