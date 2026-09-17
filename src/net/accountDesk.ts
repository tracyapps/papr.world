// Where "Return to desk" sends the player.
//
// In production the game and the site are one Vercel deploy under
// papr.world (see hosting.md) — `/account/` is the same origin the game is
// already running on. Locally the game runs alone under `vite --host`; the
// desk lives on the site's own `astro dev` server instead, on the port
// `CLERK_AUTHORIZED_PARTIES` already assumes for local testing in
// hosting.md. There is no unified local origin for the two, so this is a
// known dev-only seam, not something to route around with a fetch or proxy.

const LOCAL_SITE_ORIGIN = 'http://localhost:4321';

export function accountDeskUrl(
  origin: string = window.location.origin,
  dev: boolean = import.meta.env.DEV,
): URL {
  return new URL('/account/', dev ? LOCAL_SITE_ORIGIN : origin);
}
