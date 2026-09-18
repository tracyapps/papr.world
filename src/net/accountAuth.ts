// The player's sign-in, as seen from inside the game.
//
// WHY THE GAME LOADS CLERK ITSELF: My desk used to hand the game a single
// Clerk session token through sessionStorage and erase it on first read.
// Clerk tokens live about a minute, so that one token was good for exactly one
// join. A reload, a rejoin after the server restarted, or a laptop waking up
// all found the pass gone and read as "logged out" — and nothing could save
// a look to the account, because nothing held a way to ask for a new token.
//
// Loading Clerk (headless — no sign-in UI in the game) means the game can ask
// for a FRESH short-lived token whenever it needs one, exactly like the desk
// does. Tokens stay in memory: never in a URL, a log, or persistent storage.
// Clerk's own session cookie is what makes this work, and that is Clerk's to
// manage.
//
// Everything here fails soft. No key, a blocked script, a signed-out browser:
// the answer is simply "no token", and solo play carries on untouched.

type ClerkLike = {
  session?: { getToken: () => Promise<string | null> } | null;
  user?: unknown;
  load: (options?: Record<string, unknown>) => Promise<void>;
};

type ClerkWindow = Window & { Clerk?: ClerkLike; __internal_ClerkUICtor?: unknown };

/** Public by design (it is in every page that signs in); see vite.config.ts. */
function publishableKey(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return (env.PUBLIC_CLERK_PUBLISHABLE_KEY ?? env.VITE_CLERK_PUBLISHABLE_KEY ?? '').trim();
}

/** The Clerk frontend host encoded in a publishable key, or null if malformed. */
export function clerkHostFromKey(key: string): string | null {
  const encoded = key.split('_')[2];
  if (!encoded) return null;
  try {
    const decoded = atob(encoded);
    if (!decoded.endsWith('$')) return null;
    const host = decoded.slice(0, -1);
    return /^[a-z0-9.-]+$/i.test(host) ? host : null;
  } catch {
    return null;
  }
}

const LOAD_TIMEOUT_MS = 10_000;
let clerkLoad: Promise<ClerkLike | null> | null = null;
/** Tests can supply their own token source. */
let tokenOverride: (() => Promise<string | null>) | null = null;

function loadScript(src: string, key?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    if (key) script.dataset.clerkPublishableKey = key;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('sign-in could not load')), { once: true });
    document.head.appendChild(script);
  });
}

async function loadClerkHeadless(): Promise<ClerkLike | null> {
  const key = publishableKey();
  const host = key ? clerkHostFromKey(key) : null;
  if (!host) return null;
  const clerkWindow = window as ClerkWindow;
  try {
    // Loaded exactly the way My desk loads it (site/src/scripts/clerk.ts):
    // the UI bundle first, then clerk-js, then load() with the UI handed in.
    // The game never shows Clerk's UI, but a clerk-js v6 that was loaded
    // differently from the page that signed you in is not worth the risk of
    // "signed out in the game, signed in at the desk".
    if (!clerkWindow.__internal_ClerkUICtor) {
      await loadScript(`https://${host}/npm/@clerk/ui@1/dist/ui.browser.js`);
    }
    if (!clerkWindow.Clerk) {
      await loadScript(`https://${host}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`, key);
    }
    const clerk = clerkWindow.Clerk;
    if (!clerk) return null;
    await clerk.load(clerkWindow.__internal_ClerkUICtor ? { ui: { ClerkUI: clerkWindow.__internal_ClerkUICtor } } : {});
    if (!clerk.session) console.info('[account] sign-in loaded, but this browser has no active session.');
    return clerk;
  } catch (error) {
    console.info('[account] sign-in is unavailable here:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Start loading sign-in (once). Safe to call from anywhere, any number of times. */
export function loadAccountSession(): Promise<ClerkLike | null> {
  // A sign-in service that never answers must not hold anything else up:
  // after LOAD_TIMEOUT_MS the answer is "not signed in", same as a failure.
  clerkLoad ??= Promise.race([
    loadClerkHeadless(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), LOAD_TIMEOUT_MS)),
  ]);
  return clerkLoad;
}

/** True once sign-in has loaded AND someone is signed in. */
export async function isSignedIn(): Promise<boolean> {
  if (tokenOverride) return true;
  const clerk = await loadAccountSession();
  return Boolean(clerk?.user && clerk.session);
}

/**
 * A fresh, short-lived session token, or null when signed out / unavailable.
 * Callers use it immediately for one request and then drop it.
 */
export async function getAccountToken(): Promise<string | null> {
  if (tokenOverride) return tokenOverride();
  const clerk = await loadAccountSession();
  if (!clerk?.session) return null;
  try {
    return await clerk.session.getToken();
  } catch {
    return null;
  }
}

export function setAccountTokenProviderForTests(provider: (() => Promise<string | null>) | null): void {
  tokenOverride = provider;
}
