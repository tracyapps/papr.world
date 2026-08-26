import { describe, expect, it, vi } from 'vitest';
import {
  createFeedbackSubmission,
  FeedbackOutbox,
  type FeedbackContextInput,
} from './feedbackOutbox';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const context: FeedbackContextInput = {
  clientBuild: 'test-build',
  mode: 'solo',
  pageId: '0,0',
  biome: 'clearing',
  x: 1.23456,
  z: -2.34567,
  browser: 'Firefox',
  platform: 'macOS',
  recentGameEvents: [],
};

describe('feedback outbox', () => {
  it('creates a bounded, versioned submission without secret or save fields', () => {
    const submission = createFeedbackSubmission({
      category: 'bug',
      summary: '  Bridge wobble  ',
      details: 'The bridge moved while I crossed it.',
      expected: 'Stay on the deck.',
      reproducibility: 'always',
      context,
      now: 123,
      id: 'feedback-1',
    });

    expect(submission).toMatchObject({
      version: 1,
      id: 'feedback-1',
      summary: 'Bridge wobble',
      createdAt: 123,
      context: { x: 1.235, z: -2.346 },
    });
    expect(JSON.stringify(submission)).not.toMatch(/secret|save|chat/i);
  });

  it('keeps failed sends queued and turns a later retry into a durable receipt', async () => {
    const storage = new MemoryStorage();
    const submission = createFeedbackSubmission({
      category: 'idea', summary: 'More frogs', details: 'Tiny paper frogs near springs.',
      context, now: 456, id: 'feedback-2',
    });
    const offlineFetch = vi.fn().mockRejectedValue(new TypeError('offline'));
    const outbox = new FeedbackOutbox(storage, offlineFetch);

    outbox.enqueue(submission);
    await expect(outbox.send('feedback-2', 'http://feedback.test')).resolves.toMatchObject({
      state: 'retry',
    });
    expect(new FeedbackOutbox(storage, offlineFetch).list()[0]).toMatchObject({
      submission: { id: 'feedback-2' }, state: 'retry',
    });

    const onlineFetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ receiptId: 'feedback-2' }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    ));
    const retried = new FeedbackOutbox(storage, onlineFetch);
    await expect(retried.send('feedback-2', 'http://feedback.test')).resolves.toMatchObject({
      state: 'sent', receiptId: 'feedback-2',
    });
    expect(retried.list()[0].state).toBe('sent');
  });

  it('uploads an attached screenshot before the report and removes the local copy after receipt', async () => {
    const storage = new MemoryStorage();
    const screenshot = 'data:image/webp;base64,AQIDBA==';
    const submission = createFeedbackSubmission({
      category: 'bug', summary: 'Visual seam', details: 'A white seam crossed the river.',
      screenshotId: 'feedback-with-image', context, now: 789, id: 'feedback-with-image',
    });
    const calls: Array<{ url: string; type: string | null; body: BodyInit | null | undefined }> = [];
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(url),
        type: new Headers(init?.headers).get('content-type'),
        body: init?.body,
      });
      return String(url).includes('/screenshot/')
        ? new Response(null, { status: 201 })
        : new Response(JSON.stringify({ receiptId: 'feedback-with-image' }), {
          status: 201, headers: { 'content-type': 'application/json' },
        });
    }) as typeof fetch;
    const outbox = new FeedbackOutbox(storage, fetcher);

    outbox.saveScreenshot('feedback-with-image', screenshot);
    outbox.enqueue(submission);
    await expect(outbox.send('feedback-with-image', 'https://feedback.test')).resolves
      .toMatchObject({ state: 'sent' });

    expect(calls.map((call) => call.url)).toEqual([
      'https://feedback.test/feedback/screenshot/feedback-with-image',
      'https://feedback.test/feedback',
    ]);
    expect(calls[0].type).toBe('image/webp');
    expect(calls[0].body).toBeInstanceOf(Blob);
    expect(outbox.screenshotFor('feedback-with-image')).toBeNull();
  });

  it('refuses a sixth pending screenshot instead of silently orphaning an older report', () => {
    const outbox = new FeedbackOutbox(new MemoryStorage(), vi.fn() as unknown as typeof fetch);
    for (let index = 0; index < 5; index += 1) {
      outbox.saveScreenshot(`feedback-${index}`, 'data:image/webp;base64,AQIDBA==');
    }
    expect(() => outbox.saveScreenshot('feedback-5', 'data:image/webp;base64,AQIDBA=='))
      .toThrow('Please retry an earlier screenshot note');
    expect(outbox.screenshotFor('feedback-0')).not.toBeNull();
  });
});
