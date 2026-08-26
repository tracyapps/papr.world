/**
 * POST /api/enter - check a code and, if it is good, open the door.
 *
 * Works with or without JavaScript. Without it the form posts here normally
 * and this replies with a redirect; with it, enter-form.ts asks for JSON so
 * the page can stamp APPROVED without navigating away.
 *
 * The codes and the signing secret are documented in lib/gate.ts.
 */
import { acceptedCodes, gateIsOpen, mintPass, passCookie, tidyCode } from '../lib/gate';

export const config = { runtime: 'edge' };

/** Where a valid code sends you. */
function destination(code: string, alone: boolean, name: string | null): string {
  // A plain /play/ URL is solo and never opens a socket - the game enforces
  // that too, which is why this is the correct "wander alone" destination.
  if (alone) return '/play/';

  const query = new URLSearchParams({ shared: '1', invite: code, intent: 'join' });
  if (name) query.set('name', name);
  return `/play/?${query.toString()}`;
}

/**
 * A display name is optional and is never stored - it only rides along in the
 * URL so the game knows what to call you.
 *
 * Control characters are dropped by code point rather than by a character
 * class, because a regex containing literal control characters is a thing
 * nobody can read or safely edit later.
 */
function tidyName(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== 'string') return null;

  let out = '';
  for (const character of raw) {
    const point = character.codePointAt(0) ?? 0;
    if (point < 0x20 || point === 0x7f) continue;
    out += character;
  }

  const cleaned = out.replace(/\s+/g, ' ').trim().slice(0, 24);
  return cleaned || null;
}

/** Send them on their way, carrying the pass. */
function letIn(go: string, cookie: string | null, json: boolean): Response {
  const headers = new Headers();
  if (cookie) headers.set('set-cookie', cookie);

  if (json) {
    headers.set('content-type', 'application/json');
    return new Response(JSON.stringify({ ok: true, message: 'Approved.', go }), {
      status: 200,
      headers,
    });
  }

  headers.set('location', go);
  return new Response(null, { status: 303, headers });
}

/** Turn them away, with a reason they can act on. */
function turnAway(request: Request, status: number, message: string, json: boolean): Response {
  if (json) {
    return new Response(JSON.stringify({ ok: false, message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Without JavaScript, come back to the page with the reason in the URL so
  // /enter can explain rather than appearing to do nothing at all.
  const back = new URL('/enter/', request.url);
  back.searchParams.set('problem', message);
  return new Response(null, { status: 303, headers: { location: back.toString() } });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Post a code here.', { status: 405, headers: { allow: 'POST' } });
  }

  const env = process.env as Record<string, string | undefined>;
  const json = (request.headers.get('accept') ?? '').includes('application/json');
  const form = await request.formData();

  const alone = form.get('alone') === 'on';
  const name = tidyName(form.get('name'));

  // Nothing is configured, so nothing is gated.
  if (gateIsOpen(env)) return letIn('/play/', null, json);

  const code = tidyCode(form.get('code'));
  if (!code) {
    return turnAway(request, 400, 'That does not look like a code. They read like WREN-42.', json);
  }

  if (!acceptedCodes(env).includes(code)) {
    // Deliberately the same wording as a malformed code, so this endpoint
    // cannot be used to probe which codes happen to exist.
    return turnAway(request, 403, 'That code will not open this door. Worth checking the letters?', json);
  }

  const secret = env.PAPR_ALPHA_SECRET;
  if (!secret) {
    return turnAway(request, 500, 'The door is misconfigured - PAPR_ALPHA_SECRET is missing.', json);
  }

  return letIn(destination(code, alone, name), passCookie(await mintPass(code, secret)), json);
}
