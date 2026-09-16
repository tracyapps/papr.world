export type ClerkSession = { getToken: () => Promise<string | null> };

export type ClerkUser = {
  fullName?: string | null;
  firstName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress?: string | null } | null;
};

export type ClerkInstance = {
  session?: ClerkSession | null;
  user?: ClerkUser | null;
  load: (options: { ui: { ClerkUI: unknown } }) => Promise<void>;
  mountSignIn: (target: HTMLDivElement, options: { fallbackRedirectUrl: string }) => void;
  mountUserButton: (target: HTMLDivElement) => void;
};

export function displayNameForClerkUser(user: ClerkUser | null | undefined): string {
  const emailName = user?.primaryEmailAddress?.emailAddress?.split('@')[0];
  return user?.fullName?.trim()
    || user?.firstName?.trim()
    || user?.username?.trim()
    || emailName?.trim()
    || 'paper friend';
}

type ClerkWindow = Window & {
  Clerk?: ClerkInstance;
  __internal_ClerkUICtor?: unknown;
};

async function loadScript(src: string, publishableKey?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    if (publishableKey) script.dataset.clerkPublishableKey = publishableKey;
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Clerk sign-in could not load.')), { once: true });
    document.head.appendChild(script);
  });
}

export async function loadClerk(publishableKey: string): Promise<ClerkInstance> {
  const encodedDomain = publishableKey.split('_')[2];
  if (!encodedDomain) throw new Error('The Clerk publishable key is malformed.');
  const domain = atob(encodedDomain).slice(0, -1);
  const clerkWindow = window as ClerkWindow;

  if (!clerkWindow.__internal_ClerkUICtor) {
    await loadScript(`https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`);
  }
  if (!clerkWindow.Clerk) {
    await loadScript(
      `https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`,
      publishableKey,
    );
  }
  if (!clerkWindow.__internal_ClerkUICtor || !clerkWindow.Clerk) {
    throw new Error('Clerk sign-in loaded without its UI components.');
  }
  const clerk = clerkWindow.Clerk;
  await clerk.load({ ui: { ClerkUI: clerkWindow.__internal_ClerkUICtor } });
  return clerk;
}
