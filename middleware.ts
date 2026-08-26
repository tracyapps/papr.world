/**
 * Edge middleware. Runs before Vercel serves anything under /play.
 *
 * This is the actual alpha gate. Someone without a valid pass never receives
 * the game — not a hidden copy of it, not a redirect after it has loaded.
 * They are sent to /enter and that is the end of the request.
 *
 * Everything else on the site — the homepage, the roadmap, the reference —
 * is public and never touches this file.
 */
import { COOKIE_NAME, cookieFromHeader, gateIsOpen, readPass } from './lib/gate';

export const config = {
  // Only /play. Listing it explicitly means a mistake here cannot
  // accidentally take the public site offline.
  matcher: ['/play', '/play/:path*'],
};

export default async function middleware(request: Request): Promise<Response | undefined> {
  const env = process.env as Record<string, string | undefined>;

  // No code list configured means the alpha is not gated. Let everyone
  // through rather than locking a door with no key cut.
  if (gateIsOpen(env)) return undefined;

  const secret = env.PAPR_ALPHA_SECRET;
  if (!secret) {
    // Codes are configured but there is nothing to sign passes with, so no
    // pass could ever be valid. Failing closed is right — but say why, since
    // a silent redirect loop here would be miserable to debug.
    return new Response(
      'The alpha door is misconfigured: PAPR_ALPHA_CODES is set but ' +
        'PAPR_ALPHA_SECRET is not. See lib/gate.ts.',
      { status: 500, headers: { 'content-type': 'text/plain' } },
    );
  }

  const pass = await readPass(
    cookieFromHeader(request.headers.get('cookie'), COOKIE_NAME),
    secret,
  );
  if (pass) return undefined;

  // Remember where they were headed so /enter can send them back there.
  const url = new URL(request.url);
  const enter = new URL('/enter/', url.origin);
  enter.searchParams.set('next', url.pathname + url.search);

  return Response.redirect(enter.toString(), 302);
}
