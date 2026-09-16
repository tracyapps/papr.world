import { displayNameForClerkUser, loadClerk } from './clerk';
import {
  loadDevicePassport,
  saveDevicePassport,
  type DevicePassport,
} from './passportBridge';

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
  inventory?: AccountInventory;
  mailbox?: MailItem[];
  claimedMailIds?: string[];
  error?: string;
};

type AccountInventory = {
  revision: number;
  chips: number;
  resources: Record<string, number>;
  tools: Record<string, number>;
  items: Record<string, number>;
};

type MailItem = {
  id: string;
  fromName: string;
  kind: string;
  payload: Record<string, string | number>;
  at: number;
};

type MintedPassport = {
  accountId?: string;
  secret?: string;
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
  const inventorySummary = shell.querySelector<HTMLElement>('[data-inventory-summary]');
  const mailboxSummary = shell.querySelector<HTMLElement>('[data-mailbox-summary]');

  const tell = (text: string, kind: 'info' | 'error' = 'info') => {
    if (!message) return;
    message.textContent = text;
    message.dataset.kind = kind;
  };

  const renderWorlds = (
    worlds: World[],
    account: Account,
    getToken: () => Promise<string | null>,
  ) => {
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
      const enter = document.createElement('button');
      enter.className = 'btn world-card__enter';
      enter.type = 'button';
      enter.textContent = world.kind === 'solo' ? 'Enter my world' : 'Enter world';
      enter.disabled = !world.capabilities.includes('enter');
      enter.addEventListener('click', async () => {
        enter.disabled = true;
        enter.textContent = 'Opening…';
        try {
          const token = await getToken();
          if (!token) throw new Error('Your sign-in session could not be refreshed.');
          const entryResponse = await fetch('/api/account-entry/', {
            method: 'POST',
            headers: {
              authorization: `Bearer ${token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ worldId: world.id }),
          });
          let entryResult: { ok?: boolean; error?: string };
          try {
            entryResult = await entryResponse.json() as { ok?: boolean; error?: string };
          } catch {
            throw new Error('The world door service failed before it could answer. Please try again shortly.');
          }
          if (!entryResponse.ok || !entryResult.ok) {
            throw new Error(entryResult.error || 'That world could not be opened.');
          }
          sessionStorage.setItem('pp.managed-world-entry.v1', JSON.stringify({
            accountId: account.id,
            worldId: world.id,
            worldName: world.name,
            playerName: account.displayName,
            sessionToken: token,
            expiresAt: Date.now() + 45_000,
          }));
          window.location.assign(`/play/?world=${encodeURIComponent(world.id)}`);
        } catch (error) {
          tell(error instanceof Error ? error.message : 'That world could not be opened.', 'error');
          enter.disabled = false;
          enter.textContent = world.kind === 'solo' ? 'Enter my world' : 'Enter world';
        }
      });
      card.append(kind, name, access, enter);
      worldList.append(card);
    }
  };

  const renderInventory = (inventory?: AccountInventory) => {
    if (!inventorySummary) return;
    const rows = inventory
      ? [
          ['Shiny chips', inventory.chips],
          ...Object.entries(inventory.resources),
          ...Object.entries(inventory.tools),
          ...Object.entries(inventory.items),
        ].filter(([, quantity]) => Number(quantity) > 0)
      : [];
    if (rows.length === 0) {
      inventorySummary.textContent = 'Your server-owned neighborhood pouch is empty.';
      return;
    }
    const list = document.createElement('ul');
    list.className = 'desk-list';
    for (const [rawLabel, quantity] of rows) {
      const item = document.createElement('li');
      const label = String(rawLabel).replaceAll(/[-_.]+/g, ' ');
      item.textContent = `${label} · ${quantity}`;
      list.append(item);
    }
    inventorySummary.replaceChildren(list);
  };

  const renderMailbox = (mailbox: MailItem[] = [], claimedIds: string[] = []) => {
    if (!mailboxSummary) return;
    if (mailbox.length === 0) {
      mailboxSummary.textContent = 'No letters yet. The mailbox is listening.';
      return;
    }
    const claimed = new Set(claimedIds);
    const list = document.createElement('ul');
    list.className = 'desk-list';
    for (const letter of mailbox.slice(0, 5)) {
      const item = document.createElement('li');
      const subject = document.createElement('strong');
      subject.textContent = typeof letter.payload.subject === 'string'
        ? letter.payload.subject
        : `A ${letter.kind} from ${letter.fromName}`;
      const detail = document.createElement('span');
      detail.textContent = typeof letter.payload.text === 'string' ? letter.payload.text : '';
      const meta = document.createElement('small');
      const claimedLabel = claimed.has(letter.id)
        ? ' · parcel collected'
        : letter.kind === 'gift' ? ' · parcel waiting in-world' : '';
      meta.textContent = `${new Date(letter.at).toLocaleDateString()}${claimedLabel}`;
      item.append(subject, detail, meta);
      list.append(item);
    }
    mailboxSummary.replaceChildren(list);
  };

  const showAccount = (
    account: Account,
    worlds: World[] = [],
    getToken: () => Promise<string | null>,
    carry?: Pick<AccountResponse, 'inventory' | 'mailbox' | 'claimedMailIds'>,
  ) => {
    if (claim) claim.hidden = true;
    if (displayName) displayName.textContent = account.displayName;
    if (accountId) accountId.textContent = account.id;
    renderWorlds(worlds, account, getToken);
    renderInventory(carry?.inventory);
    renderMailbox(carry?.mailbox, carry?.claimedMailIds);
    if (claimed) claimed.hidden = false;
    tell(`Your account is connected. ${worlds.length} world${worlds.length === 1 ? '' : 's'} available.`);
  };

  const claimPassport = async (
    passport: DevicePassport,
    getToken: () => Promise<string | null>,
  ): Promise<AccountResponse & { account: Account }> => {
    const token = await getToken();
    if (!token) throw new Error('Your sign-in session could not be refreshed.');
    const claimResponse = await fetch(`${apiUrl}/account/claim`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(passport),
    });
    const result = await claimResponse.json() as AccountResponse;
    if (!claimResponse.ok || !result.account) {
      throw new Error(result.error || 'The passport could not be claimed.');
    }
    return result as AccountResponse & { account: Account };
  };

  const mintPassport = async (name: string): Promise<DevicePassport> => {
    const response = await fetch(`${apiUrl}/account`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const result = await response.json() as MintedPassport;
    if (!response.ok || typeof result.accountId !== 'string' || typeof result.secret !== 'string') {
      throw new Error(result.error || 'A new paper passport could not be made.');
    }
    const passport = { id: result.accountId, secret: result.secret };
    if (!saveDevicePassport(localStorage, passport)) {
      throw new Error('This browser blocked the new paper passport from being saved. Allow site storage and try again.');
    }
    return passport;
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
          showAccount(
            body.account,
            body.worlds ?? [],
            () => clerk.session?.getToken() ?? Promise.resolve(null),
            body,
          );
        } else {
          const passport = loadDevicePassport(localStorage);
          const getToken = () => clerk.session?.getToken() ?? Promise.resolve(null);
          if (passport) {
            if (claim) claim.hidden = false;
            if (claimDescription) {
              claimDescription.textContent = `This browser has paper passport ${passport.id.slice(0, 8)}…. Claim it to keep its mail, pouch, and maker credits with this sign-in.`;
            }
            claimButton?.removeAttribute('disabled');
            claimButton?.addEventListener('click', async () => {
              claimButton.disabled = true;
              tell('Connecting your paper passport…');
              try {
                const result = await claimPassport(passport, getToken);
                showAccount(
                  result.account,
                  result.worlds ?? [],
                  getToken,
                  result,
                );
              } catch (error) {
                tell(error instanceof Error ? error.message : 'The passport could not be claimed.', 'error');
                claimButton.disabled = false;
              }
            });
          } else {
            tell('Making your paper passport and opening your first two worlds…');
            try {
              const freshPassport = await mintPassport(displayNameForClerkUser(clerk.user));
              const result = await claimPassport(freshPassport, getToken);
              showAccount(
                result.account,
                result.worlds ?? [],
                getToken,
                result,
              );
            } catch (error) {
              const savedPassport = loadDevicePassport(localStorage);
              if (claim) claim.hidden = false;
              if (claimDescription) {
                claimDescription.textContent = savedPassport
                  ? 'Your new paper passport was saved, but its account setup did not finish. Try connecting it again.'
                  : 'Your new paper passport could not be saved. Check that this browser allows site storage, then reload this page.';
              }
              if (savedPassport && claimButton) {
                claimButton.disabled = false;
                claimButton.textContent = 'Finish account setup';
                claimButton.addEventListener('click', async () => {
                  claimButton.disabled = true;
                  tell('Finishing your account setup…');
                  try {
                    const result = await claimPassport(savedPassport, getToken);
                    showAccount(result.account, result.worlds ?? [], getToken, result);
                  } catch (retryError) {
                    tell(retryError instanceof Error ? retryError.message : 'Account setup could not finish.', 'error');
                    claimButton.disabled = false;
                  }
                });
              }
              tell(error instanceof Error ? error.message : 'Your account setup could not finish.', 'error');
            }
          }
        }
      }
    } catch (error) {
      tell(error instanceof Error ? error.message : 'The account desk could not be opened.', 'error');
    }
  }
}
