/**
 * The alpha door.
 *
 * While papr.world is invite-only, /play is not served to anyone who has not
 * shown a valid code. This file is the shared half of that: the code list, the
 * cookie format, and the signing. `api/enter.ts` uses it to let people in;
 * `middleware.ts` uses it to keep everyone else out.
 *
 * ── Why it works this way ────────────────────────────────────────────────
 * A gate that lives in the browser is not a gate — anyone can open the
 * devtools and delete it. So the check happens at the edge, before Vercel
 * serves a single byte of the game, and the pass it hands out is a cookie
 * signed with a secret the browser never sees. Someone can forge a cookie
 * only if they can forge an HMAC, which they cannot.
 *
 * ── The two environment variables ────────────────────────────────────────
 * Set both in the Vercel project settings, for Production and Preview:
 *
 *   PAPR_ALPHA_CODES   The codes that work, comma separated.
 *                      e.g.  WREN-42,FERN-73,PAPR-22
 *                      Same shape the game already uses: four letters
 *                      (no I or O), a dash, two digits 2–9.
 *
 *   PAPR_ALPHA_SECRET  A long random string. Signs the pass cookie.
 *                      Generate one with:  openssl rand -base64 48
 *                      Change it and every existing pass stops working,
 *                      which is exactly how you end an alpha.
 *
 * If PAPR_ALPHA_CODES is empty or unset the door is OPEN — nothing is gated.
 * That is deliberate, so a local `vercel dev` or a fresh fork is not bricked
 * by a missing variable. It also means: to actually gate the alpha, you must
 * set the variable. It does not gate itself by accident.
 */

/** The pass is good for a month. Long enough not to nag, short enough to expire. */
const PASS_DAYS = 30;

export const COOKIE_NAME = 'papr_pass';

/** Same shape the game's own sanitizeInviteCode accepts. */
const CODE_SHAPE = /^[A-HJ-NP-Z]{4}[2-9]{2}$/;

/**
 * Normalise anything a person might type or paste into `WREN-42` form.
 * Lower case, missing dash, stray spaces — all fine. Returns null if it could
 * not possibly be a code, so the caller never has to guess.
 */
export function tidyCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const compact = raw.toUpperCase().replace(/[\s-]+/g, '');
  if (!CODE_SHAPE.test(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

/** The codes currently accepted. Empty means the door is not locked at all. */
export function acceptedCodes(env: Record<string, string | undefined>): string[] {
  return (env.PAPR_ALPHA_CODES ?? '')
    .split(',')
    .map((code) => tidyCode(code))
    .filter((code): code is string => code !== null);
}

export function gateIsOpen(env: Record<string, string | undefined>): boolean {
  return acceptedCodes(env).length === 0;
}

// ── Signing ───────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sign(payload: string, secret: string): Promise<string> {
  return toBase64Url(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload)));
}

/**
 * Mint a pass. The payload is the expiry and the code that opened the door —
 * the code is carried so the game can pick the right neighbourhood without
 * asking again, and so a revoked code's passes can be recognised later.
 */
export async function mintPass(code: string, secret: string): Promise<string> {
  const expires = Date.now() + PASS_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${code}.${expires}`;
  return `${payload}.${await sign(payload, secret)}`;
}

export type Pass = { code: string; expires: number };

/** Read a pass, or null if it is missing, malformed, expired, or forged. */
export async function readPass(
  cookie: string | undefined,
  secret: string,
): Promise<Pass | null> {
  if (!cookie) return null;

  const parts = cookie.split('.');
  if (parts.length !== 3) return null;

  const [code, expiresRaw, signature] = parts;
  const payload = `${code}.${expiresRaw}`;

  // Compare in constant time. A fast reject on the first wrong character
  // leaks how much of a guess was right; this does not.
  const expected = await sign(payload, secret);
  if (expected.length !== signature.length) return null;
  let difference = 0;
  for (let i = 0; i < expected.length; i += 1) {
    difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (difference !== 0) return null;

  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;

  return { code, expires };
}

/** The Set-Cookie header for a freshly minted pass. */
export function passCookie(pass: string): string {
  return [
    `${COOKIE_NAME}=${pass}`,
    'Path=/',
    `Max-Age=${PASS_DAYS * 24 * 60 * 60}`,
    'HttpOnly',       // JavaScript on the page can never read or forge it
    'Secure',
    'SameSite=Lax',
  ].join('; ');
}

/** Read one cookie out of a Cookie header. */
export function cookieFromHeader(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return undefined;
}
