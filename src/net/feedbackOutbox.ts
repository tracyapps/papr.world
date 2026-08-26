import {
  ALPHA_FEEDBACK_VERSION,
  MAX_FEEDBACK_SCREENSHOT_BYTES,
  PROTOCOL_VERSION,
  sanitizeAlphaFeedback,
  type AlphaFeedback,
  type AlphaFeedbackCategory,
  type AlphaFeedbackReproducibility,
} from '../../shared/src/index';

const STORAGE_KEY = 'pp.alpha-feedback-outbox.v1';
const SCREENSHOT_STORAGE_KEY = 'pp.alpha-feedback-screenshots.v1';
const MAX_LOCAL_SCREENSHOTS = 5;

export type FeedbackContextInput = Omit<AlphaFeedback['context'], 'protocolVersion'>;

export type FeedbackDraftInput = {
  category: AlphaFeedbackCategory;
  summary: string;
  details: string;
  expected?: string;
  reproducibility?: AlphaFeedbackReproducibility;
  screenshotId?: string;
  context: FeedbackContextInput;
  now?: number;
  id?: string;
};

export type FeedbackOutboxEntry = {
  submission: AlphaFeedback;
  state: 'queued' | 'retry' | 'sent';
  receiptId?: string;
  lastError?: string;
  updatedAt: number;
};

type FetchLike = typeof fetch;

export function createFeedbackSubmission(input: FeedbackDraftInput): AlphaFeedback {
  const raw: AlphaFeedback = {
    version: ALPHA_FEEDBACK_VERSION,
    id: input.id ?? globalThis.crypto.randomUUID(),
    category: input.category,
    summary: input.summary,
    details: input.details,
    ...(input.expected ? { expected: input.expected } : {}),
    ...(input.reproducibility ? { reproducibility: input.reproducibility } : {}),
    ...(input.screenshotId ? { screenshotId: input.screenshotId } : {}),
    context: {
      ...input.context,
      x: Math.round(input.context.x * 1000) / 1000,
      z: Math.round(input.context.z * 1000) / 1000,
      protocolVersion: PROTOCOL_VERSION,
    },
    createdAt: input.now ?? Date.now(),
  };
  const sanitized = sanitizeAlphaFeedback(raw);
  if (!sanitized) throw new Error('Please add a short summary and a little more detail.');
  return sanitized;
}

/** Browser-local delivery queue. Sent receipts remain so a tester can copy one later. */
export class FeedbackOutbox {
  constructor(
    private storage: Storage = localStorage,
    private fetcher: FetchLike = fetch,
  ) {}

  list(): FeedbackOutboxEntry[] {
    try {
      const raw = JSON.parse(this.storage.getItem(STORAGE_KEY) ?? '[]') as unknown;
      if (!Array.isArray(raw)) return [];
      return raw.flatMap((item): FeedbackOutboxEntry[] => {
        if (!item || typeof item !== 'object') return [];
        const candidate = item as Partial<FeedbackOutboxEntry>;
        const submission = sanitizeAlphaFeedback(candidate.submission);
        if (!submission || !['queued', 'retry', 'sent'].includes(candidate.state ?? '')) return [];
        return [{
          submission,
          state: candidate.state as FeedbackOutboxEntry['state'],
          ...(typeof candidate.receiptId === 'string' ? { receiptId: candidate.receiptId } : {}),
          ...(typeof candidate.lastError === 'string' ? { lastError: candidate.lastError } : {}),
          updatedAt: Number.isFinite(candidate.updatedAt) ? Number(candidate.updatedAt) : submission.createdAt,
        }];
      }).sort((a, b) => b.submission.createdAt - a.submission.createdAt);
    } catch {
      return [];
    }
  }

  enqueue(submission: AlphaFeedback): FeedbackOutboxEntry {
    const entry: FeedbackOutboxEntry = {
      submission,
      state: 'queued',
      updatedAt: Date.now(),
    };
    this.write([entry, ...this.list().filter((item) => item.submission.id !== submission.id)]);
    return entry;
  }

  saveScreenshot(id: string, dataUrl: string): void {
    const parsed = parseScreenshotDataUrl(dataUrl);
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id) || !parsed) {
      throw new Error('That screenshot could not be saved.');
    }
    if (parsed.bytes > MAX_FEEDBACK_SCREENSHOT_BYTES) {
      throw new Error('That screenshot is too large. Please try again at a smaller window size.');
    }
    const screenshots = this.readScreenshots();
    delete screenshots[id];
    if (Object.keys(screenshots).length >= MAX_LOCAL_SCREENSHOTS) {
      throw new Error('Please retry an earlier screenshot note before attaching another.');
    }
    screenshots[id] = dataUrl;
    this.storage.setItem(SCREENSHOT_STORAGE_KEY, JSON.stringify(screenshots));
  }

  screenshotFor(id: string): string | null {
    return this.readScreenshots()[id] ?? null;
  }

  removeScreenshot(id: string): void {
    const screenshots = this.readScreenshots();
    if (!(id in screenshots)) return;
    delete screenshots[id];
    this.storage.setItem(SCREENSHOT_STORAGE_KEY, JSON.stringify(screenshots));
  }

  async send(id: string, endpoint: string): Promise<FeedbackOutboxEntry> {
    const current = this.list().find((entry) => entry.submission.id === id);
    if (!current) throw new Error('That feedback is no longer in the outbox.');
    try {
      // Native browser fetch must not be invoked as an object method (`this`
      // would become the outbox instance and Firefox rejects the invocation).
      const fetcher = this.fetcher;
      if (current.submission.screenshotId) {
        const screenshot = this.screenshotFor(current.submission.screenshotId);
        const parsed = screenshot && parseScreenshotDataUrl(screenshot);
        if (!parsed) throw new Error('the attached screenshot is missing');
        const screenshotResponse = await fetcher(
          `${endpoint.replace(/\/$/, '')}/feedback/screenshot/${encodeURIComponent(current.submission.screenshotId)}`,
          {
            method: 'POST',
            credentials: 'omit',
            headers: { 'content-type': parsed.mime },
            body: dataUrlToBlob(parsed),
          },
        );
        if (!screenshotResponse.ok) {
          throw new Error(`screenshot server returned ${screenshotResponse.status}`);
        }
      }
      const response = await fetcher(`${endpoint.replace(/\/$/, '')}/feedback`, {
        method: 'POST',
        credentials: 'omit',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(current.submission),
      });
      if (!response.ok) throw new Error(`server returned ${response.status}`);
      const data = await response.json() as { receiptId?: unknown };
      if (typeof data.receiptId !== 'string' || !data.receiptId) {
        throw new Error('server returned no receipt');
      }
      const sent = this.replace(id, {
        ...current,
        state: 'sent',
        receiptId: data.receiptId,
        lastError: undefined,
        updatedAt: Date.now(),
      });
      if (current.submission.screenshotId) {
        this.removeScreenshot(current.submission.screenshotId);
      }
      return sent;
    } catch (error) {
      return this.replace(id, {
        ...current,
        state: 'retry',
        receiptId: undefined,
        lastError: error instanceof Error ? error.message : 'delivery failed',
        updatedAt: Date.now(),
      });
    }
  }

  async retryPending(endpoint: string): Promise<FeedbackOutboxEntry[]> {
    const results: FeedbackOutboxEntry[] = [];
    for (const entry of this.list().filter((item) => item.state !== 'sent')) {
      results.push(await this.send(entry.submission.id, endpoint));
    }
    return results;
  }

  private replace(id: string, replacement: FeedbackOutboxEntry): FeedbackOutboxEntry {
    this.write(this.list().map((entry) => entry.submission.id === id ? replacement : entry));
    return replacement;
  }

  private write(entries: FeedbackOutboxEntry[]): void {
    // Bound local growth while keeping the most recent receipts useful.
    this.storage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 50)));
  }

  private readScreenshots(): Record<string, string> {
    try {
      const value = JSON.parse(this.storage.getItem(SCREENSHOT_STORAGE_KEY) ?? '{}') as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      return Object.fromEntries(Object.entries(value).filter(
        ([id, data]) => /^[a-zA-Z0-9_-]{1,128}$/.test(id) && typeof data === 'string',
      ));
    } catch {
      return {};
    }
  }
}

type ParsedScreenshot = { mime: 'image/webp' | 'image/png'; base64: string; bytes: number };

function parseScreenshotDataUrl(dataUrl: string): ParsedScreenshot | null {
  const match = /^data:(image\/(?:webp|png));base64,([a-zA-Z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return null;
  const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
  const bytes = Math.floor(match[2].length * 3 / 4) - padding;
  return { mime: match[1] as ParsedScreenshot['mime'], base64: match[2], bytes };
}

function dataUrlToBlob(screenshot: ParsedScreenshot): Blob {
  const binary = atob(screenshot.base64);
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index);
  return new Blob([data], { type: screenshot.mime });
}
