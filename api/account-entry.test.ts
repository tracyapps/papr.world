import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { readPass } from '../lib/gate';
import accountEntryFunction, {
  handleAccountEntry,
  handleNodeAccountEntry,
} from './account-entry';

const worldId = '25e7894b-3808-489c-9b80-e9ef90cb03c2';
const token = 'a-clerk-session-token-long-enough';
const secret = 'a-long-random-secret-for-testing-only';
const env = {
  PAPR_ALPHA_CODES: 'WREN-42',
  PAPR_ALPHA_SECRET: secret,
  PUBLIC_PAPR_API_URL: 'https://rooms.test/',
};

function request(id: unknown = worldId, bearer = token): Request {
  return new Request('https://papr.world/api/account-entry', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ worldId: id }),
  });
}

function backend(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })) as unknown as typeof fetch;
}

describe('account entry through the alpha door', () => {
  it('keeps local imports resolvable after Vercel compiles the Node function', () => {
    const source = readFileSync(new URL('./account-entry.ts', import.meta.url), 'utf8');
    expect(source).toContain("from '../lib/gate.js'");
    expect(source).not.toContain("from '../lib/gate';");
  });

  it('mints an HttpOnly pass only after Railway confirms world entry', async () => {
    const fetcher = backend({
      claimed: true,
      worlds: [{ id: worldId, capabilities: ['enter', 'build'] }],
    });
    const response = await handleAccountEntry(request(), env, fetcher);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith('https://rooms.test/account/me', {
      headers: { authorization: `Bearer ${token}` },
    });
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    const value = cookie.match(/^papr_pass=([^;]+)/)?.[1];
    expect((await readPass(value, secret))?.code).toBe('ACCOUNT');
  });

  it('does not mint a pass for an unclaimed account or another world', async () => {
    const response = await handleAccountEntry(
      request(),
      env,
      backend({ claimed: true, worlds: [{ id: crypto.randomUUID(), capabilities: ['enter'] }] }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.has('set-cookie')).toBe(false);
  });

  it('rejects malformed requests before contacting Railway', async () => {
    const fetcher = backend({});
    expect((await handleAccountEntry(request('not-a-world'), env, fetcher)).status).toBe(400);
    expect((await handleAccountEntry(request(worldId, 'short'), env, fetcher)).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('still verifies membership when the legacy code gate is open', async () => {
    const response = await handleAccountEntry(
      request(),
      { PUBLIC_PAPR_API_URL: 'https://rooms.test' },
      backend({ claimed: true, worlds: [{ id: worldId, capabilities: ['enter'] }] }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.has('set-cookie')).toBe(false);
  });

  it('uses Vercel\'s callable Node handler and adapts its parsed JSON body', async () => {
    expect(accountEntryFunction).toBe(handleNodeAccountEntry);
    const headers = new Map<string, string>();
    let responseBody = '';
    const response = {
      statusCode: 0,
      setHeader: (name: string, value: string) => headers.set(name, value),
      end: (body?: Uint8Array | string) => {
        responseBody = typeof body === 'string' ? body : new TextDecoder().decode(body);
      },
    };
    await handleNodeAccountEntry({
      method: 'POST',
      url: '/api/account-entry/',
      headers: { host: 'papr.world', authorization: `Bearer ${token}` },
      body: { worldId },
    }, response, env, backend({
      claimed: true,
      worlds: [{ id: worldId, capabilities: ['enter'] }],
    }));

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(responseBody)).toEqual({ ok: true });
    expect(headers.get('set-cookie')).toContain('HttpOnly');
  });
});
