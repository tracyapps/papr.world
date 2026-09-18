/**
 * POST /api/account-entry — let a claimed account through the alpha door.
 *
 * Clerk verification and world authorization stay on Railway. This Vercel
 * function forwards the short-lived bearer token, confirms the requested
 * world has `enter`, then mints the same HttpOnly pass used by alpha codes.
 */
import { gateIsOpen, mintPass, passCookie } from '../lib/gate.js';

type AccountHome = {
  claimed?: boolean;
  worlds?: Array<{ id?: unknown; capabilities?: unknown }>;
};

const WORLD_ID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function json(status: number, body: Record<string, unknown>, cookie?: string): Response {
  const headers = new Headers({
    'content-type': 'application/json',
    'cache-control': 'private, no-store',
  });
  if (cookie) headers.set('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function handleAccountEntry(
  request: Request,
  env: Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Post a world here.', { status: 405, headers: { allow: 'POST' } });
  }

  const authorization = request.headers.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ') || authorization.slice(7).trim().length < 20) {
    return json(401, { error: 'sign in is required' });
  }

  let worldId = '';
  // The avatar studio (/play/studio/) sits behind the same door as the game
  // but needs no world: any claimed account may make looks.
  let forStudio = false;
  try {
    const input = await request.json() as { worldId?: unknown; purpose?: unknown };
    forStudio = input.purpose === 'studio';
    worldId = typeof input.worldId === 'string' ? input.worldId.trim().toLowerCase() : '';
  } catch {
    return json(400, { error: 'choose a valid world' });
  }
  if (!forStudio && !WORLD_ID_SHAPE.test(worldId)) return json(400, { error: 'choose a valid world' });

  const apiUrl = (env.PAPR_API_URL ?? env.PUBLIC_PAPR_API_URL ?? '').replace(/\/$/, '');
  if (!apiUrl) return json(503, { error: 'account entry is not configured' });

  let response: Response;
  try {
    response = await fetcher(`${apiUrl}/account/me`, {
      headers: { authorization },
    });
  } catch (error) {
    console.error(
      '[account-entry] Railway lookup failed:',
      error instanceof Error ? error.name : 'unknown error',
    );
    return json(502, { error: 'account access could not be checked' });
  }
  if (response.status === 401) return json(401, { error: 'your sign-in session expired' });
  if (!response.ok) {
    console.error('[account-entry] Railway lookup returned:', response.status);
    return json(502, { error: 'account access could not be checked' });
  }

  let home: AccountHome;
  try {
    home = await response.json() as AccountHome;
  } catch {
    return json(502, { error: 'account access could not be checked' });
  }
  const mayEnter = home.claimed === true && (forStudio || home.worlds?.some((world) =>
    world.id === worldId
    && Array.isArray(world.capabilities)
    && world.capabilities.includes('enter')));
  if (!mayEnter) {
    return json(403, {
      error: forStudio ? 'claim your paper passport first' : 'this account cannot enter that world',
    });
  }

  if (gateIsOpen(env)) return json(200, { ok: true });
  const secret = env.PAPR_ALPHA_SECRET;
  if (!secret) return json(500, { error: 'the alpha door is misconfigured' });

  const pass = await mintPass('ACCOUNT', secret);
  return json(200, { ok: true }, passCookie(pass));
}

/**
 * Use Vercel's default Node.js runtime for this one outbound service call.
 * The alpha-door functions that do no I/O remain at the edge.
 */
type NodeRequest = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

type NodeResponse = {
  statusCode: number;
  setHeader: (name: string, value: string) => void;
  end: (body?: Uint8Array | string) => void;
};

export async function handleNodeAccountEntry(
  request: NodeRequest,
  response: NodeResponse,
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(', '));
  }
  const host = typeof request.headers.host === 'string' ? request.headers.host : 'papr.world';
  const method = request.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD'
    ? undefined
    : typeof request.body === 'string'
      ? request.body
      : JSON.stringify(request.body ?? {});
  const webRequest = new Request(
    new URL(request.url ?? '/api/account-entry/', `https://${host}`),
    { method, headers, body },
  );
  const result = await handleAccountEntry(webRequest, env, fetcher);
  response.statusCode = result.status;
  result.headers.forEach((value, name) => response.setHeader(name, value));
  response.end(new Uint8Array(await result.arrayBuffer()));
}

export default handleNodeAccountEntry;
