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
  tech?: AccountTech;
  mailbox?: MailItem[];
  claimedMailIds?: string[];
  soloMigration?: SoloMigrationReceipt | null;
  error?: string;
};

type AccountInventory = {
  revision: number;
  chips: number;
  resources: Record<string, number>;
  tools: Record<string, number>;
  items: Record<string, number>;
};

/** The server-owned record of plan ids this account has learned. */
type AccountTech = {
  revision: number;
  plans: string[];
};

/** What this browser reports finding in the game's own local solo save. */
type SoloSaveSnapshot = {
  chips: number;
  resources: Record<string, number>;
  tools: Record<string, number>;
  items: Record<string, number>;
  plans: string[];
};

/** The durable, one-time record `/account/import-solo-save` returns once granted. */
type SoloMigrationReceipt = SoloSaveSnapshot & { at: number };

type ImportSoloSaveResponse = {
  ok?: boolean;
  receipt?: SoloMigrationReceipt;
  inventory?: AccountInventory;
  tech?: AccountTech;
  alreadyMigrated?: boolean;
  error?: string;
};

type MailItem = {
  id: string;
  fromName: string;
  kind: string;
  payload: Record<string, string | number>;
  at: number;
};

type ClaimMailResponse = {
  ok?: boolean;
  inventory?: AccountInventory;
  claimedMailIds?: string[];
  error?: string;
};

type MintedPassport = {
  accountId?: string;
  secret?: string;
  error?: string;
};

/** One saved avatar look on the account (the fields the desk list needs). */
type AccountDesign = {
  id: string;
  name: string;
  sharedOnCard: boolean;
  updatedAt: number;
};

type WardrobeImportReceipt = { at: number; imported: number; skipped: number };

type WardrobeResponse = {
  designs?: AccountDesign[];
  import?: WardrobeImportReceipt | null;
  ok?: boolean;
  receipt?: WardrobeImportReceipt;
  alreadyImported?: boolean;
  error?: string;
};

// The game's local wardrobe key. Same hand-synced-by-hand rule as the solo
// save key above: the game and this desk share an origin in production.
const WARDROBE_STORAGE_KEY = 'pp.wardrobe.v1';

// The game (`/play/`) and this desk (`/account/`) are the same origin in
// production (see hosting.md), so localStorage set by the game is directly
// readable here — no bridge needed. This key and shape must be kept in sync
// with `SAVE_STORAGE_KEY`/`GameState` in `src/sim/state.ts` by hand, since
// this Astro site does not build against that package (see account.ts's
// existing duplicated `AccountInventory`/`MailItem` types above).
const SOLO_SAVE_STORAGE_KEY = 'pencil-and-paper.game-save.v1';

function nonEmptyCounts(value: unknown): Record<string, number> {
  const result: Record<string, number> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) result[key] = Math.floor(raw);
  }
  return result;
}

/**
 * Read whatever solo save this browser has, defensively — a parse failure
 * or an unexpected shape just means "nothing to offer," never a thrown
 * error on desk load. Returns null when there is no save at all, which is
 * what keeps the migration card hidden for a player who has never touched
 * solo play on this device.
 */
function readLocalSoloSave(): SoloSaveSnapshot | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(SOLO_SAVE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      player?: { chips?: unknown; inventory?: unknown; tools?: unknown; items?: unknown; plans?: unknown };
    };
    const player = parsed.player ?? {};
    const plans = Array.isArray(player.plans)
      ? [...new Set(player.plans.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : [];
    const chips = typeof player.chips === 'number' && Number.isFinite(player.chips)
      ? Math.max(0, Math.floor(player.chips))
      : 0;
    return {
      chips,
      resources: nonEmptyCounts(player.inventory),
      tools: nonEmptyCounts(player.tools),
      items: nonEmptyCounts(player.items),
      plans,
    };
  } catch {
    return null;
  }
}

/** One warm sentence for the review card — never a raw JSON dump. */
function describeSnapshot(snapshot: SoloSaveSnapshot): string {
  const stackTotal = [snapshot.resources, snapshot.tools, snapshot.items]
    .flatMap((bag) => Object.values(bag))
    .reduce((sum, count) => sum + count, 0);
  const parts: string[] = [];
  if (snapshot.chips > 0) parts.push(`${snapshot.chips} shiny chip${snapshot.chips === 1 ? '' : 's'}`);
  if (stackTotal > 0) parts.push(`${stackTotal} item${stackTotal === 1 ? '' : 's'} across your bag`);
  if (snapshot.plans.length > 0) {
    parts.push(`${snapshot.plans.length} learned technique${snapshot.plans.length === 1 ? '' : 's'}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'nothing worth bringing over yet';
}

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
  const techSection = shell.querySelector<HTMLElement>('[data-tech]');
  const techSummary = shell.querySelector<HTMLElement>('[data-tech-summary]');
  const mailboxSummary = shell.querySelector<HTMLElement>('[data-mailbox-summary]');
  const mailboxNote = shell.querySelector<HTMLElement>('[data-mailbox-note]');
  const wardrobeSummary = shell.querySelector<HTMLElement>('[data-wardrobe-summary]');
  const wardrobeImport = shell.querySelector<HTMLElement>('[data-wardrobe-import]');
  const wardrobeImportDescription = shell.querySelector<HTMLElement>('[data-wardrobe-import-description]');
  const wardrobeImportButton = shell.querySelector<HTMLButtonElement>('[data-wardrobe-import-button]');
  const wardrobeImportNote = shell.querySelector<HTMLElement>('[data-wardrobe-import-note]');
  const openStudioButton = shell.querySelector<HTMLButtonElement>('[data-open-studio]');
  const openStudioNote = shell.querySelector<HTMLElement>('[data-open-studio-note]');
  const migration = shell.querySelector<HTMLElement>('[data-migration]');
  const migrationDescription = shell.querySelector<HTMLElement>('[data-migration-description]');
  const migrationButton = shell.querySelector<HTMLButtonElement>('[data-migration-button]');
  const migrationNote = shell.querySelector<HTMLElement>('[data-migration-note]');

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

  /**
   * The account-owned view of learned techniques — the tech half of the
   * scrapbook, granted by a solo-save import today and by shared-world
   * learning later. Plan ids render as friendly names the same way pouch
   * ids do; this desk never needed the game's recipe catalog for that.
   */
  const renderTech = (tech?: AccountTech) => {
    if (!techSection || !techSummary) return;
    if (!tech) {
      techSection.hidden = true;
      return;
    }
    techSection.hidden = false;
    if (tech.plans.length === 0) {
      techSummary.textContent = 'Nothing learned yet — the Professor has lessons waiting in-world.';
      return;
    }
    const list = document.createElement('ul');
    list.className = 'tech-list';
    for (const planId of tech.plans) {
      const item = document.createElement('li');
      item.textContent = planId.replaceAll(/[-_.]+/g, ' ');
      list.append(item);
    }
    techSummary.replaceChildren(list);
  };

  /**
   * A parcel's contents in one warm line, or null for plain letters. The
   * desk has no recipe or resource catalogs (see the type-duplication note
   * above), so ids render as friendly names the same way the pouch does.
   */
  const parcelLabel = (letter: MailItem): string | null => {
    const quantity = letter.payload.quantity;
    const kind = letter.payload.attachmentKind;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 1) return null;
    const friendly = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
    if (kind === 'chips') return `${quantity} shiny chip${quantity === 1 ? '' : 's'}`;
    if (kind === 'resource' && friendly(letter.payload.resource)) {
      return `${quantity} ${letter.payload.resource.replaceAll(/[-_.]+/g, ' ')}`;
    }
    if (kind === 'tool' && friendly(letter.payload.toolId)) {
      return `${quantity} ${letter.payload.toolId.replaceAll(/[-_.]+/g, ' ')}`;
    }
    if (kind === 'item' && friendly(letter.payload.itemId)) {
      const label = typeof letter.payload.label === 'string' && letter.payload.label.trim()
        ? letter.payload.label
        : letter.payload.itemId.replaceAll(/[-_.]+/g, ' ');
      return `${quantity} ${label}`;
    }
    return null;
  };

  /**
   * The real inbox: waiting parcels first (each collectable into the pouch
   * right here, through the same exactly-once claim the in-world scrapbook
   * uses), then the chronological record of letters and collected parcels.
   */
  const renderMailbox = (
    mailbox: MailItem[] = [],
    claimedIds: string[] = [],
    getToken: () => Promise<string | null> = () => Promise.resolve(null),
  ) => {
    if (!mailboxSummary) return;
    if (mailbox.length === 0) {
      mailboxSummary.textContent = 'No letters yet. The mailbox is listening.';
      return;
    }
    const claimed = new Set(claimedIds);
    const collect = async (letter: MailItem, button: HTMLButtonElement) => {
      button.disabled = true;
      button.textContent = 'Collecting…';
      try {
        const token = await getToken();
        if (!token) throw new Error('Your sign-in session could not be refreshed.');
        const response = await fetch(`${apiUrl}/account/claim-mail`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ mailId: letter.id }),
        });
        const result = await response.json() as ClaimMailResponse;
        if (!response.ok || !result.ok || !result.inventory) {
          throw new Error(result.error || 'That parcel could not be collected.');
        }
        renderInventory(result.inventory);
        renderMailbox(mailbox, result.claimedMailIds ?? [...claimedIds], getToken);
        if (mailboxNote) mailboxNote.textContent = 'Collected into your neighborhood pouch.';
      } catch (error) {
        if (mailboxNote) {
          mailboxNote.textContent = error instanceof Error ? error.message : 'That parcel could not be collected.';
        }
        button.disabled = false;
        button.textContent = 'Collect into pouch';
      }
    };

    const container = document.createElement('div');
    const waiting = mailbox.filter((letter) => parcelLabel(letter) !== null && !claimed.has(letter.id));
    if (waiting.length > 0) {
      const heading = document.createElement('h3');
      heading.className = 'mailbox__heading';
      heading.textContent = `Parcels waiting (${waiting.length})`;
      const waitingList = document.createElement('ul');
      waitingList.className = 'desk-list';
      for (const letter of waiting) {
        const item = document.createElement('li');
        const subject = document.createElement('strong');
        subject.textContent = typeof letter.payload.subject === 'string' && letter.payload.subject.trim()
          ? letter.payload.subject
          : `A parcel from ${letter.fromName}`;
        const detail = document.createElement('span');
        const label = parcelLabel(letter);
        detail.textContent = `${label ?? 'Something tucked in'} · from ${letter.fromName}`;
        const button = document.createElement('button');
        button.className = 'btn btn--quiet';
        button.type = 'button';
        button.textContent = 'Collect into pouch';
        button.addEventListener('click', () => void collect(letter, button));
        item.append(subject, detail, button);
        waitingList.append(item);
      }
      container.append(heading, waitingList);
    }

    const rest = mailbox.filter((letter) => !waiting.includes(letter));
    const shown = rest.slice(0, 20);
    if (shown.length > 0) {
      const heading = document.createElement('h3');
      heading.className = 'mailbox__heading';
      heading.textContent = waiting.length > 0 ? 'Letters and collected parcels' : 'Recent letters';
      const list = document.createElement('ul');
      list.className = 'desk-list';
      for (const letter of shown) {
        const item = document.createElement('li');
        const subject = document.createElement('strong');
        subject.textContent = typeof letter.payload.subject === 'string' && letter.payload.subject.trim()
          ? letter.payload.subject
          : `A ${letter.kind} from ${letter.fromName}`;
        const detail = document.createElement('span');
        const label = parcelLabel(letter);
        const text = typeof letter.payload.text === 'string' ? letter.payload.text.trim() : '';
        detail.textContent = label
          ? `${label}${text ? ` — ${text}` : ''}`
          : text;
        const meta = document.createElement('small');
        const parcelState = label ? (claimed.has(letter.id) ? ' · parcel collected' : ' · parcel waiting above') : '';
        meta.textContent = `From ${letter.fromName} · ${new Date(letter.at).toLocaleDateString()}${parcelState}`;
        item.append(subject, detail, meta);
        list.append(item);
      }
      container.append(heading, list);
      if (rest.length > shown.length) {
        const more = document.createElement('p');
        more.className = 'soft';
        more.textContent = `…and ${rest.length - shown.length} more, older still.`;
        container.append(more);
      }
    }
    mailboxSummary.replaceChildren(container);
  };

  /**
   * The account wardrobe — avatar Phase D's library, read-only here for now
   * (names and sharing state; drawing previews and the desk editor are later
   * slices). Below it, the one-time device → account import, the same
   * explicit review-then-confirm shape as the solo-save migration.
   */
  const readLocalWardrobe = (): unknown[] => {
    try {
      const raw = localStorage.getItem(WARDROBE_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as { designs?: unknown };
      return Array.isArray(parsed.designs) ? parsed.designs : [];
    } catch {
      return [];
    }
  };

  const renderWardrobe = (designs: AccountDesign[] = []) => {
    if (!wardrobeSummary) return;
    if (designs.length === 0) {
      wardrobeSummary.textContent = 'No looks in your account wardrobe yet.';
      return;
    }
    const intro = document.createElement('p');
    intro.className = 'soft';
    intro.textContent = `${designs.length} saved look${designs.length === 1 ? '' : 's'} travel with your account.`;
    const list = document.createElement('ul');
    list.className = 'tech-list';
    for (const design of designs) {
      const item = document.createElement('li');
      item.textContent = design.sharedOnCard
        ? `${design.name} · shared`
        : design.name;
      list.append(item);
    }
    wardrobeSummary.replaceChildren(intro, list);
  };

  const renderWardrobeImport = (
    receipt: WardrobeImportReceipt | null | undefined,
    getToken: () => Promise<string | null>,
  ) => {
    if (!wardrobeImport) return;
    if (receipt) {
      wardrobeImport.hidden = false;
      if (wardrobeImportDescription) {
        wardrobeImportDescription.textContent =
          `Wardrobe brought home on ${new Date(receipt.at).toLocaleDateString()}: `
          + `${receipt.imported} look${receipt.imported === 1 ? '' : 's'} imported.`;
      }
      if (wardrobeImportButton) wardrobeImportButton.hidden = true;
      return;
    }
    const local = readLocalWardrobe();
    if (local.length === 0) {
      wardrobeImport.hidden = true;
      return;
    }
    wardrobeImport.hidden = false;
    if (wardrobeImportDescription) {
      wardrobeImportDescription.textContent =
        `This browser has ${local.length} saved look${local.length === 1 ? '' : 's'}. `
        + 'Bring them into your account? Wearing one in a shared world then shows your actual drawing. '
        + 'This can only be done once.';
    }
    if (wardrobeImportNote) wardrobeImportNote.textContent = '';
    if (!wardrobeImportButton) return;
    wardrobeImportButton.hidden = false;
    wardrobeImportButton.disabled = false;
    wardrobeImportButton.textContent = 'Bring it into your account';
    wardrobeImportButton.onclick = async () => {
      wardrobeImportButton.disabled = true;
      wardrobeImportButton.textContent = 'Bringing it in…';
      if (wardrobeImportNote) wardrobeImportNote.textContent = '';
      try {
        const token = await getToken();
        if (!token) throw new Error('Your sign-in session could not be refreshed.');
        const response = await fetch(`${apiUrl}/account/import-wardrobe`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ designs: readLocalWardrobe() }),
        });
        const result = await response.json() as WardrobeResponse;
        if (!response.ok || !result.ok || !result.receipt) {
          throw new Error(result.error || 'That wardrobe could not be brought in.');
        }
        renderWardrobe(result.designs);
        renderWardrobeImport(result.receipt, getToken);
        if (wardrobeImportNote) {
          wardrobeImportNote.textContent = result.alreadyImported
            ? 'This account already had a wardrobe on file, so nothing was imported twice.'
            : 'Brought in — your looks travel with your account from here on.';
        }
      } catch (error) {
        if (wardrobeImportNote) {
          wardrobeImportNote.textContent = error instanceof Error ? error.message : 'That wardrobe could not be brought in.';
        }
        wardrobeImportButton.disabled = false;
        wardrobeImportButton.textContent = 'Bring it into your account';
      }
    };
  };

  /**
   * The avatar studio lives with the game under /play/, behind the alpha
   * door. The same account-entry service that opens a world lets a claimed
   * account through for the studio (no world needed); the studio page then
   * signs in on its own, so no token is handed across.
   */
  const wireStudioButton = (getToken: () => Promise<string | null>) => {
    if (!openStudioButton) return;
    openStudioButton.onclick = async () => {
      openStudioButton.disabled = true;
      openStudioButton.textContent = 'Opening…';
      if (openStudioNote) openStudioNote.textContent = '';
      try {
        const token = await getToken();
        if (!token) throw new Error('Your sign-in session could not be refreshed.');
        const response = await fetch('/api/account-entry/', {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ purpose: 'studio' }),
        });
        const result = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
        if (!response.ok || !result.ok) throw new Error(result.error || 'The studio could not be opened.');
        window.location.assign('/play/studio/');
      } catch (error) {
        if (openStudioNote) {
          openStudioNote.textContent = error instanceof Error ? error.message : 'The studio could not be opened.';
        }
        openStudioButton.disabled = false;
        openStudioButton.textContent = 'Open the avatar studio';
      }
    };
  };

  let wardrobeRefreshWired = false;
  const loadWardrobe = async (getToken: () => Promise<string | null>) => {
    wireStudioButton(getToken);
    // Coming back from the studio or a world (a new tab, the back button, or
    // switching tabs) re-reads the list, so a look saved moments ago shows up
    // without a manual reload.
    if (!wardrobeRefreshWired) {
      wardrobeRefreshWired = true;
      window.addEventListener('pageshow', (event) => {
        if (event.persisted) void loadWardrobe(getToken);
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void loadWardrobe(getToken);
      });
    }
    try {
      const token = await getToken();
      if (!token) return;
      const response = await fetch(`${apiUrl}/account/designs`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const body = await response.json() as WardrobeResponse;
      renderWardrobe(body.designs ?? []);
      renderWardrobeImport(body.import ?? null, getToken);
    } catch {
      // A quiet failure: the card keeps its "Opening your wardrobe…" state
      // rather than blocking the rest of the desk.
    }
  };

  /**
   * Renders the "Bring your solo save home" card. Three states: already
   * migrated (show the receipt, no button — this account will never accept
   * a second one), a local save this browser can offer (review text + a
   * confirm button), or nothing to offer (hidden entirely — most players on
   * a browser that never played solo, or on a second device).
   *
   * Called every time the desk loads, not just right after claiming: a
   * player who closes the tab before deciding, or claims on one day and
   * opens the desk again later, should still see this until they act on it
   * or it is already done.
   */
  const renderMigration = (
    receipt: SoloMigrationReceipt | null | undefined,
    getToken: () => Promise<string | null>,
  ) => {
    if (!migration) return;
    if (receipt) {
      migration.hidden = false;
      if (migrationDescription) {
        migrationDescription.textContent =
          `Solo save brought in on ${new Date(receipt.at).toLocaleDateString()}: ${describeSnapshot(receipt)}.`;
      }
      if (migrationButton) migrationButton.hidden = true;
      return;
    }
    const snapshot = readLocalSoloSave();
    if (!snapshot) {
      migration.hidden = true;
      return;
    }
    migration.hidden = false;
    if (migrationDescription) {
      migrationDescription.textContent =
        `This browser has a solo save: ${describeSnapshot(snapshot)}. Bring it into your account? `
        + 'This can only be done once, so check it looks right first.';
    }
    if (migrationNote) migrationNote.textContent = '';
    if (!migrationButton) return;
    migrationButton.hidden = false;
    migrationButton.disabled = false;
    migrationButton.textContent = 'Bring it into your account';
    migrationButton.onclick = async () => {
      migrationButton.disabled = true;
      migrationButton.textContent = 'Bringing it in…';
      if (migrationNote) migrationNote.textContent = '';
      try {
        const token = await getToken();
        if (!token) throw new Error('Your sign-in session could not be refreshed.');
        const response = await fetch(`${apiUrl}/account/import-solo-save`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify(snapshot),
        });
        const result = await response.json() as ImportSoloSaveResponse;
        if (!response.ok || !result.ok || !result.receipt) {
          throw new Error(result.error || 'That solo save could not be brought in.');
        }
        renderInventory(result.inventory);
        renderTech(result.tech);
        renderMigration(result.receipt, getToken);
        if (migrationNote) {
          migrationNote.textContent = result.alreadyMigrated
            ? 'This account already had a solo save on file, so nothing was imported twice.'
            : 'Brought in — it travels with your account from here on.';
        }
      } catch (error) {
        if (migrationNote) {
          migrationNote.textContent = error instanceof Error ? error.message : 'That solo save could not be brought in.';
        }
        migrationButton.disabled = false;
        migrationButton.textContent = 'Bring it into your account';
      }
    };
  };

  const showAccount = (
    account: Account,
    worlds: World[] = [],
    getToken: () => Promise<string | null>,
    carry?: Pick<AccountResponse, 'inventory' | 'tech' | 'mailbox' | 'claimedMailIds' | 'soloMigration'>,
  ) => {
    if (claim) claim.hidden = true;
    if (displayName) displayName.textContent = account.displayName;
    if (accountId) accountId.textContent = account.id;
    renderWorlds(worlds, account, getToken);
    renderInventory(carry?.inventory);
    renderTech(carry?.tech);
    renderMailbox(carry?.mailbox, carry?.claimedMailIds, getToken);
    renderMigration(carry?.soloMigration, getToken);
    void loadWardrobe(getToken);
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
