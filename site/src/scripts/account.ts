import { loadClerk } from './clerk';
import { loadDevicePassport } from './passportBridge';

type Account = {
  id: string;
  displayName: string;
  createdAt: number;
  lastSeenAt: number;
};

type World = {
  id: string;
  slug: string;
  name: string;
  kind: 'solo' | 'shared' | 'custom';
  role: 'owner' | 'admin' | 'member' | 'visitor' | 'viewer';
  capabilities: string[];
};

type AccountResponse = {
  claimed: boolean;
  account: Account | null;
  worlds?: World[];
  error?: string;
};

const shell = document.querySelector<HTMLElement>('[data-account-shell]');

if (shell) {
  const publishableKey = shell.dataset.clerkPublishableKey ?? '';
  const apiUrl = (shell.dataset.apiUrl ?? '').replace(/\/$/, '');
  const message = shell.querySelector<HTMLElement>('[data-account-message]');
  const signIn = shell.querySelector<HTMLElement>('[data-account-signin]');
  const signInTarget = shell.querySelector<HTMLDivElement>('[data-account-signin-target]');
  const userButton = shell.querySelector<HTMLDivElement>('[data-account-user-button]');
  const claim = shell.querySelector<HTMLElement>('[data-account-claim]');
  const claimDescription = shell.querySelector<HTMLElement>('[data-claim-description]');
  const claimButton = shell.querySelector<HTMLButtonElement>('[data-claim-button]');
  const claimed = shell.querySelector<HTMLElement>('[data-account-claimed]');
  const displayName = shell.querySelector<HTMLElement>('[data-account-name]');
  const accountId = shell.querySelector<HTMLElement>('[data-account-id]');
  const worldList = shell.querySelector<HTMLElement>('[data-world-list]');

  const tell = (text: string, kind: 'info' | 'error' = 'info') => {
    if (!message) return;
    message.textContent = text;
    message.dataset.kind = kind;
  };

  const renderWorlds = (worlds: World[]) => {
    if (!worldList) return;
    worldList.replaceChildren();
    for (const world of worlds) {
      const card = document.createElement('article');
      card.className = 'world-card';
      const kind = document.createElement('p');
      kind.className = 'label';
      kind.textContent = `${world.kind} world · ${world.role}`;
      const name = document.createElement('h3');
      name.textContent = world.name;
      const access = document.createElement('p');
      access.textContent = world.capabilities.length > 0
        ? `Access: ${world.capabilities.join(', ').replaceAll('_', ' ')}`
        : 'No active capabilities';
      const next = document.createElement('span');
      next.className = 'coming';
      next.textContent = world.kind === 'solo'
        ? 'Private world provisioned · game entry bridge next'
        : 'Membership active · game authorization bridge next';
      card.append(kind, name, access, next);
      worldList.append(card);
    }
  };

  const showAccount = (account: Account, worlds: World[] = []) => {
    if (claim) claim.hidden = true;
    if (displayName) displayName.textContent = account.displayName;
    if (accountId) accountId.textContent = account.id;
    renderWorlds(worlds);
    if (claimed) claimed.hidden = false;
    tell(`Your account is connected. ${worlds.length} world${worlds.length === 1 ? '' : 's'} available.`);
  };

  if (!publishableKey || !apiUrl) {
    tell('The account desk is not configured yet.', 'error');
  } else {
    try {
      const clerk = await loadClerk(publishableKey);
      if (!clerk.user) {
        tell('Sign in to open your desk.');
        if (signIn && signInTarget) {
          signIn.hidden = false;
          clerk.mountSignIn(signInTarget, { fallbackRedirectUrl: '/account/' });
        }
      } else {
        if (userButton) clerk.mountUserButton(userButton);
        const sessionToken = await clerk.session?.getToken();
        if (!sessionToken) throw new Error('Your sign-in session could not be read.');

        const response = await fetch(`${apiUrl}/account/me`, {
          headers: { authorization: `Bearer ${sessionToken}` },
        });
        const body = await response.json() as AccountResponse;
        if (!response.ok) throw new Error(body.error || 'The account desk could not be opened.');

        if (body.claimed && body.account) {
          showAccount(body.account, body.worlds ?? []);
        } else {
          const passport = loadDevicePassport(localStorage);
          if (claim) claim.hidden = false;
          if (passport) {
            if (claimDescription) {
              claimDescription.textContent = `This browser has paper passport ${passport.id.slice(0, 8)}…. Claim it to keep its mail, pouch, and maker credits with this sign-in.`;
            }
            claimButton?.removeAttribute('disabled');
            claimButton?.addEventListener('click', async () => {
              claimButton.disabled = true;
              tell('Connecting your paper passport…');
              try {
                const claimResponse = await fetch(`${apiUrl}/account/claim`, {
                  method: 'POST',
                  headers: {
                    authorization: `Bearer ${sessionToken}`,
                    'content-type': 'application/json',
                  },
                  body: JSON.stringify(passport),
                });
                const result = await claimResponse.json() as AccountResponse;
                if (!claimResponse.ok || !result.account) {
                  throw new Error(result.error || 'The passport could not be claimed.');
                }
                showAccount(result.account, result.worlds ?? []);
              } catch (error) {
                tell(error instanceof Error ? error.message : 'The passport could not be claimed.', 'error');
                claimButton.disabled = false;
              }
            });
          } else {
            if (claimDescription) {
              claimDescription.textContent = 'There is no paper passport on this browser yet. Enter a shared neighborhood once to make one, then return here.';
            }
            tell('Signed in. A paper passport is needed before this account can carry game progress.');
          }
        }
      }
    } catch (error) {
      tell(error instanceof Error ? error.message : 'The account desk could not be opened.', 'error');
    }
  }
}
