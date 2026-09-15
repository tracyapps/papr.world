type ClerkSession = { getToken: () => Promise<string | null> };
type ClerkInstance = {
  session?: ClerkSession | null;
  user?: unknown;
  load: (options: { ui: { ClerkUI: unknown } }) => Promise<void>;
  mountSignIn: (target: HTMLDivElement, options: { fallbackRedirectUrl: string }) => void;
  mountUserButton: (target: HTMLDivElement) => void;
};
type ClerkConstructor = new (publishableKey: string) => ClerkInstance;
type ClerkWindow = Window & {
  Clerk?: ClerkConstructor;
  __internal_ClerkUICtor?: unknown;
};

type ServiceStatus = { state: string; detail: string };
type AdminStatus = {
  serverTime: string;
  services: Record<string, ServiceStatus>;
  counts: { paperPassports: number };
};

const shell = document.querySelector<HTMLElement>('[data-admin-shell]');

async function loadScript(src: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('Clerk sign-in could not load.')), { once: true });
    document.head.appendChild(script);
  });
}

async function loadClerk(publishableKey: string): Promise<ClerkInstance> {
  const encodedDomain = publishableKey.split('_')[2];
  if (!encodedDomain) throw new Error('The Clerk publishable key is malformed.');
  const domain = atob(encodedDomain).slice(0, -1);
  const clerkWindow = window as ClerkWindow;

  if (!clerkWindow.__internal_ClerkUICtor) {
    await loadScript(`https://${domain}/npm/@clerk/ui@1/dist/ui.browser.js`);
  }
  if (!clerkWindow.Clerk) {
    await loadScript(`https://${domain}/npm/@clerk/clerk-js@6/dist/clerk.browser.js`);
  }

  if (!clerkWindow.__internal_ClerkUICtor || !clerkWindow.Clerk) {
    throw new Error('Clerk sign-in loaded without its UI components.');
  }
  const clerk = new clerkWindow.Clerk(publishableKey);
  await clerk.load({ ui: { ClerkUI: clerkWindow.__internal_ClerkUICtor } });
  return clerk;
}

if (shell) {
  const publishableKey = shell.dataset.clerkPublishableKey ?? '';
  const apiUrl = shell.dataset.apiUrl ?? '';
  const message = shell.querySelector<HTMLElement>('[data-admin-message]');
  const signIn = shell.querySelector<HTMLElement>('[data-signin]');
  const signInTarget = shell.querySelector<HTMLDivElement>('[data-signin-target]');
  const content = shell.querySelector<HTMLElement>('[data-admin-content]');
  const services = shell.querySelector<HTMLElement>('[data-services]');
  const userButton = shell.querySelector<HTMLDivElement>('[data-user-button]');
  const refreshButton = shell.querySelector<HTMLButtonElement>('[data-refresh]');
  const inviteForm = shell.querySelector<HTMLFormElement>('[data-invite-form]');
  const inviteResult = shell.querySelector<HTMLElement>('[data-invite-result]');

  const tell = (text: string, kind: 'info' | 'error' = 'info') => {
    if (!message) return;
    message.textContent = text;
    message.dataset.kind = kind;
  };

  const renderServices = (status: AdminStatus) => {
    if (!services) return;
    services.replaceChildren();
    for (const [name, service] of Object.entries(status.services)) {
      const card = document.createElement('section');
      card.className = 'control-card';
      const label = document.createElement('p');
      label.className = 'label';
      label.textContent = service.state;
      const heading = document.createElement('h2');
      heading.textContent = name.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
      const detail = document.createElement('p');
      detail.textContent = service.detail;
      card.append(label, heading, detail);
      services.append(card);
    }
    const passportCard = document.createElement('section');
    passportCard.className = 'control-card';
    passportCard.innerHTML = '<p class="label">Legacy bridge</p><h2></h2><p>Device passports awaiting account migration</p>';
    const count = passportCard.querySelector('h2');
    if (count) count.textContent = String(status.counts.paperPassports);
    services.append(passportCard);
  };

  if (!publishableKey) {
    tell('Clerk is ready in code, but PUBLIC_CLERK_PUBLISHABLE_KEY still needs to be added to the papr.world build environment.', 'error');
  } else if (!apiUrl) {
    tell('The control center needs PUBLIC_PAPR_API_URL before it can reach the game server.', 'error');
  } else {
    try {
      const clerk = await loadClerk(publishableKey);

      const token = async () => clerk.session?.getToken() ?? null;

      const refresh = async () => {
      const sessionToken = await token();
      if (!sessionToken) return;
      refreshButton?.setAttribute('disabled', '');
      try {
        const response = await fetch(`${apiUrl}/admin/status`, {
          headers: { authorization: `Bearer ${sessionToken}` },
        });
        const body = await response.json() as AdminStatus & { error?: string };
        if (!response.ok) throw new Error(body.error || 'The game server refused the request.');
        renderServices(body);
        if (content) content.hidden = false;
        tell(`Connected. Last checked ${new Date(body.serverTime).toLocaleTimeString()}.`);
      } catch (error) {
        if (content) content.hidden = true;
        tell(error instanceof Error ? error.message : 'Could not reach the control center.', 'error');
      } finally {
        refreshButton?.removeAttribute('disabled');
      }
      };

      if (!clerk.user) {
        tell('Sign in with the papr.world administrator account.');
        if (signIn && signInTarget) {
          signIn.hidden = false;
          clerk.mountSignIn(signInTarget, { fallbackRedirectUrl: '/admin/' });
        }
      } else {
        if (userButton) clerk.mountUserButton(userButton);
        await refresh();
      }

      refreshButton?.addEventListener('click', () => void refresh());
      inviteForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const sessionToken = await token();
      if (!sessionToken || !inviteResult) return;
      const submit = inviteForm.querySelector<HTMLButtonElement>('button[type="submit"]');
      const form = new FormData(inviteForm);
      submit?.setAttribute('disabled', '');
      inviteResult.textContent = 'Sending…';
      try {
        const response = await fetch(`${apiUrl}/admin/invitations`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${sessionToken}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ emailAddress: form.get('emailAddress') }),
        });
        const body = await response.json() as { error?: string };
        if (!response.ok) throw new Error(body.error || 'Invitation failed.');
        inviteResult.textContent = 'Invitation sent.';
        inviteForm.reset();
      } catch (error) {
        inviteResult.textContent = error instanceof Error ? error.message : 'Invitation failed.';
      } finally {
        submit?.removeAttribute('disabled');
      }
      });
    } catch (error) {
      tell(error instanceof Error ? error.message : 'Clerk sign-in could not load.', 'error');
    }
  }
}
