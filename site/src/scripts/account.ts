import { displayNameForClerkUser, loadClerk } from './clerk';
import {
  loadDevicePassport,
  saveDevicePassport,
  type DevicePassport,
} from './passportBridge';
// The generated technique catalog, written beside the roadmap by
// `tools/build-tech.mjs`. Imported exactly the way the site's pages import
// `roadmap.json`: a build-time JSON file, not a runtime fetch. It is what
// turns a learned node id into a name and a length for the glance line.
import techData from '../data/tech.json';

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

/**
 * The lesson a solo save was part-way through. Hand-synced with
 * `ActiveLearningState` in `src/sim/state.ts` (and the sanitiser beside it),
 * the same way the rest of the save shapes in this file are kept in step by
 * hand: this Astro site does not build against the game package.
 */
type ActiveLearningSnapshot = {
  nodeId: string;
  startedAt: number;
  completedTaskIndexes: number[];
  taskBaselineCounts: number[];
};

/** What this browser reports finding in the game's own local solo save. */
type SoloSaveSnapshot = {
  chips: number;
  resources: Record<string, number>;
  tools: Record<string, number>;
  items: Record<string, number>;
  plans: string[];
  /**
   * The lesson the save is part-way through, when there is one. The server's
   * snapshot sanitiser reads only the fields it knows, so this rides along
   * harmlessly with an import and exists here for the desk's glance line.
   */
  activeLearning?: ActiveLearningSnapshot | null;
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
  /**
   * The whole design arrives on the wire; only these two are read, and only
   * for a look's colour swatch. Anything unexpected is simply ignored.
   */
  strokes?: { color?: unknown }[];
  stamps?: { color?: unknown }[];
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

// ── Your profile ───────────────────────────────────────────────────────────
// These mirror `shared/src/protocol/profile.ts` and the `LIMITS` in
// `shared/src/protocol/constants.ts` by hand, the same way the inventory and
// mailbox shapes above are kept in sync: this Astro site does not build
// against the shared package (see the type-duplication note above).
type ProfileVisibility = 'everyone' | 'friends' | 'friends-of-friends';
type ProfileField = 'bio' | 'links';
type SocialLinkKind =
  | 'website'
  | 'instagram'
  | 'x'
  | 'youtube'
  | 'twitch'
  | 'discord'
  | 'other';
type ProfileSocialLink = { kind: SocialLinkKind; url: string };
type PlayerProfile = {
  bio: string;
  links: ProfileSocialLink[];
  visibility: Record<ProfileField, ProfileVisibility>;
};

/** A partial profile update — the `POST /account/profile` body. */
type ProfileUpdatePayload = {
  bio?: string;
  links?: ProfileSocialLink[];
  visibility?: Partial<Record<ProfileField, ProfileVisibility>>;
};

type ProfileResponse = {
  profile?: PlayerProfile;
  ok?: boolean;
  error?: string;
};

/** The allow-list order the picker offers, matching `SOCIAL_LINK_KINDS`. */
const SOCIAL_LINK_KINDS: readonly SocialLinkKind[] = [
  'website',
  'instagram',
  'x',
  'youtube',
  'twitch',
  'discord',
  'other',
];

const SOCIAL_LINK_LABELS: Record<SocialLinkKind, string> = {
  website: 'Website',
  instagram: 'Instagram',
  x: 'X',
  youtube: 'YouTube',
  twitch: 'Twitch',
  discord: 'Discord',
  other: 'Something else',
};

const PROFILE_VISIBILITY_LEVELS: readonly ProfileVisibility[] = [
  'everyone',
  'friends',
  'friends-of-friends',
];

/**
 * The card's own words for a link, kept in step with the in-game player card
 * (`src/ui/playerCard.ts` → `LINK_KIND_LABELS`), which is the source of truth
 * for what a card shows. `SOCIAL_LINK_LABELS` above is the editor's picker
 * voice ("Something else"); these are what a visitor reads on the card.
 */
const CARD_LINK_LABELS: Record<SocialLinkKind, string> = {
  website: 'Website',
  instagram: 'Instagram',
  x: 'X',
  youtube: 'YouTube',
  twitch: 'Twitch',
  discord: 'Discord',
  other: 'A link',
};

/** How the card's quiet audience line names each visibility level. */
const AUDIENCE_WORDS: Record<ProfileVisibility, string> = {
  everyone: 'anyone who finds you',
  friends: 'friends you have both agreed with',
  'friends-of-friends': 'your friends and their friends',
};

/** Hand-synced with `LIMITS` in `shared/src/protocol/constants.ts`. */
const PROFILE_LIMITS = { bioMax: 280, socialLinksMax: 6, socialUrlMax: 200 } as const;

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
 * The save's lesson-in-progress, read the way `state.ts` sanitizes it: a shape
 * the desk does not recognise is simply "not learning anything", never a
 * thrown error. The bounds match the sanitiser's (sixteen baselines and
 * indexes, whole non-negative counts).
 */
function readActiveLearning(raw: unknown): ActiveLearningSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const learning = raw as {
    nodeId?: unknown;
    startedAt?: unknown;
    completedTaskIndexes?: unknown;
    taskBaselineCounts?: unknown;
  };
  if (
    typeof learning.nodeId !== 'string'
    || learning.nodeId.length === 0
    || typeof learning.startedAt !== 'number'
    || !Number.isFinite(learning.startedAt)
    || learning.startedAt < 0
  ) {
    return null;
  }
  const baselines = Array.isArray(learning.taskBaselineCounts)
    ? learning.taskBaselineCounts.slice(0, 16).map((value) => (
      typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
    ))
    : [];
  const completed = Array.isArray(learning.completedTaskIndexes)
    ? [...new Set(learning.completedTaskIndexes.flatMap((value) => (
      typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 16
        ? [Math.floor(value)]
        : []
    )))]
    : [];
  return {
    nodeId: learning.nodeId,
    startedAt: learning.startedAt,
    taskBaselineCounts: baselines,
    completedTaskIndexes: completed,
  };
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
      player?: {
        chips?: unknown;
        inventory?: unknown;
        tools?: unknown;
        items?: unknown;
        plans?: unknown;
        activeLearning?: unknown;
      };
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
      activeLearning: readActiveLearning(player.activeLearning),
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

/**
 * The generated technique catalog, keyed by node id. Read defensively rather
 * than trusted: a missing or malformed file simply means no label for a node,
 * which the glance line reads as "not learning anything" instead of throwing.
 */
type TechNode = { id: string; label: string; durationMs: number };

const TECH_NODES_BY_ID = (() => {
  const byId = new Map<string, TechNode>();
  const nodes: unknown = techData.nodes;
  if (!Array.isArray(nodes)) return byId;
  for (const raw of nodes) {
    if (!raw || typeof raw !== 'object') continue;
    const node = raw as { id?: unknown; label?: unknown; durationMs?: unknown };
    if (typeof node.id !== 'string' || typeof node.label !== 'string') continue;
    const durationMs = typeof node.durationMs === 'number' && Number.isFinite(node.durationMs)
      ? Math.max(0, node.durationMs)
      : 0;
    byId.set(node.id, { id: node.id, label: node.label, durationMs });
  }
  return byId;
})();

/** The desk's own words for a stretch of time — plain, never a stopwatch. */
function describeTimeLeft(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  if (minutes < 90) return `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `about ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `about ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * The learning glance: what the local solo save is part-way through, in one
 * sentence. The save carries only the node id, so the name and how long the
 * lesson runs come from the generated catalog; no save, no lesson, or a node
 * the catalog does not know all read the same quiet way.
 */
function learningLine(now: number): string {
  const learning = readLocalSoloSave()?.activeLearning ?? null;
  if (!learning) return 'Not learning anything right now.';
  const node = TECH_NODES_BY_ID.get(learning.nodeId);
  if (!node) return 'Not learning anything right now.';
  const stepsDone = learning.completedTaskIndexes.length;
  const steps = Math.max(learning.taskBaselineCounts.length, stepsDone);
  const remainingMs = Math.max(0, learning.startedAt + node.durationMs - now);
  if (node.durationMs > 0 && remainingMs > 0) {
    return `Learning ${node.label} — ${describeTimeLeft(remainingMs)} left`;
  }
  if (steps > 0) {
    return `Learning ${node.label} — ${stepsDone} of ${steps} steps done`;
  }
  return `Learning ${node.label}`;
}

/** One bag of the pouch, ready to render as a stack. */
type InventoryBucket = { id: string; name: string; counts: [string, number][] };

const bucketTotal = (bucket: InventoryBucket): number => (
  bucket.counts.reduce((sum, [, quantity]) => sum + quantity, 0)
);

/** One `<details class="stack">` for a bucket: name + roll-up over its rows. */
function buildStack(bucket: InventoryBucket, open: boolean): HTMLDetailsElement {
  const details = document.createElement('details');
  details.className = 'stack';
  details.dataset.stack = bucket.id;
  details.open = open;

  const summary = document.createElement('summary');
  const name = document.createElement('span');
  name.className = 'stack__name';
  name.textContent = bucket.name;
  const roll = document.createElement('span');
  roll.className = 'stack__roll';
  roll.textContent = `${bucket.counts.length} kind${bucket.counts.length === 1 ? '' : 's'} · ${bucketTotal(bucket)}`;
  summary.append(name, roll);

  const list = document.createElement('ul');
  list.className = 'stack__list';
  for (const [rawLabel, quantity] of bucket.counts) {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = String(rawLabel).replaceAll(/[-_.]+/g, ' ');
    const count = document.createElement('strong');
    count.textContent = String(quantity);
    item.append(label, count);
    list.append(item);
  }

  details.append(summary, list);
  return details;
}

/**
 * The one colour a look really carries as a hex: the ink of its first stroke,
 * or failing that its first stamp. Its paper stock is a catalog key rather
 * than a colour, so it is left alone rather than guessed at.
 */
function edgeColourOf(design: AccountDesign): string | null {
  const hex = (value: unknown): string | null => (
    typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : null
  );
  for (const stroke of Array.isArray(design.strokes) ? design.strokes : []) {
    const colour = hex(stroke?.color);
    if (colour) return colour;
  }
  for (const stamp of Array.isArray(design.stamps) ? design.stamps : []) {
    const colour = hex(stamp?.color);
    if (colour) return colour;
  }
  return null;
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
  const profileStatus = shell.querySelector<HTMLElement>('[data-profile-status]');
  const profileForm = shell.querySelector<HTMLFormElement>('[data-profile-form]');
  const profileBio = shell.querySelector<HTMLTextAreaElement>('[data-profile-bio]');
  const profileBioCount = shell.querySelector<HTMLElement>('[data-profile-bio-count]');
  const profileLinks = shell.querySelector<HTMLElement>('[data-profile-links]');
  const profileAddLink = shell.querySelector<HTMLButtonElement>('[data-profile-add-link]');
  const profileSave = shell.querySelector<HTMLButtonElement>('[data-profile-save]');
  const profileNote = shell.querySelector<HTMLElement>('[data-profile-note]');
  const cardPreview = shell.querySelector<HTMLElement>('[data-card-preview]');
  const glanceLearning = shell.querySelector<HTMLElement>('[data-glance-learning]');
  const glanceLetters = shell.querySelector<HTMLElement>('[data-glance-letters]');
  const glanceLooks = shell.querySelector<HTMLElement>('[data-glance-looks]');
  // The one-time-bridge buttons keep whatever label the page gives them, so
  // the copy lives in the markup and this file only swaps it while working.
  const migrationButtonLabel = migrationButton?.textContent?.trim() || 'Copy my solo save in';
  const wardrobeImportButtonLabel = wardrobeImportButton?.textContent?.trim() || 'Copy my looks in';
  let cardName = '';
  let cardProfile: PlayerProfile | null = null;

  const tell = (text: string, kind: 'info' | 'error' = 'info') => {
    if (!message) return;
    message.textContent = text;
    message.dataset.kind = kind;
  };

  /**
   * `hidden` alone does not hide a `.btn`: the site's chunky button rule sets
   * `display: inline-flex`, and an author `display` outbids the user agent's
   * `[hidden] { display: none }`. That is exactly how both one-time-bridge
   * buttons stayed on screen after the bridge had been walked (the owner's
   * screenshot). Setting the attribute and the property is what puts it away
   * for real.
   */
  const setButtonGone = (button: HTMLButtonElement | null, gone: boolean) => {
    if (!button) return;
    button.hidden = gone;
    button.style.display = gone ? 'none' : '';
  };

  /** The desk's own words for who may read the card they are looking at. */
  const audienceWord = (value: ProfileVisibility | undefined): string => (
    value && AUDIENCE_WORDS[value] ? AUDIENCE_WORDS[value] : 'friends you have both agreed with'
  );

  const cardVisibilityLine = (): string => {
    const visibility = cardProfile?.visibility;
    if (!visibility) return 'Nobody sees more than your settings allow.';
    if (visibility.bio === visibility.links) {
      return `Your bio and links are visible to ${audienceWord(visibility.bio)}.`;
    }
    return `Your bio is visible to ${audienceWord(visibility.bio)}, your links to ${audienceWord(visibility.links)}.`;
  };

  /**
   * The desk's echo of the in-game player card (`src/ui/playerCard.ts`) — the
   * same name, the same bio, the same words on each link. That file stays the
   * source of truth for what a card shows; this mirrors it so an owner can see
   * their own card the way a visitor does, and adds only the one line the game
   * does not need to say: who is allowed to read it.
   */
  const renderCardPreview = () => {
    if (!cardPreview) return;
    const sheet = document.createElement('div');
    sheet.className = 'card-preview__sheet';

    const name = document.createElement('p');
    name.className = 'card-preview__name';
    name.textContent = cardName || 'A paper friend';

    const bio = (cardProfile?.bio ?? '').trim();
    const bioLine = document.createElement('p');
    bioLine.className = bio ? 'card-preview__bio' : 'card-preview__empty';
    bioLine.textContent = bio || 'Nothing written here yet.';

    sheet.append(name, bioLine);

    const links = (cardProfile?.links ?? []).filter((link) => /^https?:\/\//i.test(link.url));
    if (links.length > 0) {
      const list = document.createElement('ul');
      list.className = 'card-preview__links';
      for (const link of links) {
        const item = document.createElement('li');
        item.textContent = CARD_LINK_LABELS[link.kind] ?? 'A link';
        list.append(item);
      }
      sheet.append(list);
    }

    const who = document.createElement('p');
    who.className = 'card-preview__who';
    who.textContent = cardVisibilityLine();
    sheet.append(who);

    cardPreview.replaceChildren(sheet);
  };

  const renderGlanceLearning = () => {
    if (!glanceLearning) return;
    glanceLearning.textContent = learningLine(Date.now());
  };

  const renderGlanceLetters = (count: number) => {
    if (!glanceLetters) return;
    glanceLetters.textContent = count > 0
      ? `${count} letter${count === 1 ? '' : 's'} waiting`
      : 'No letters yet.';
  };

  const renderGlanceLooks = (count: number) => {
    if (!glanceLooks) return;
    glanceLooks.textContent = count > 0
      ? `${count} saved look${count === 1 ? '' : 's'}`
      : 'No looks saved yet.';
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
    // One stack per bag the desk already keeps — chips, resources, tools,
    // items — each with a roll-up of how many kinds it holds and how many
    // things that is. Nothing new is invented here; these are the four the
    // flat list used to run together.
    const buckets: InventoryBucket[] = inventory
      ? [
          {
            id: 'chips',
            name: 'Shiny chips',
            counts: inventory.chips > 0 ? [['Shiny chips', inventory.chips] as [string, number]] : [],
          },
          { id: 'resources', name: 'Resources', counts: Object.entries(inventory.resources) },
          { id: 'tools', name: 'Tools', counts: Object.entries(inventory.tools) },
          { id: 'items', name: 'Items', counts: Object.entries(inventory.items) },
        ].map((bucket) => ({
          ...bucket,
          counts: bucket.counts.filter(([, quantity]) => Number(quantity) > 0),
        }))
      : [];
    const filled = buckets.filter((bucket) => bucket.counts.length > 0);
    if (filled.length === 0) {
      inventorySummary.textContent = 'Your server-owned neighborhood pouch is empty.';
      return;
    }
    // The biggest bag opens, so the one thing you came for is never a click
    // away; the rest wait as quiet headings rather than twenty-six rows.
    const biggest = filled.reduce((largest, bucket) => (
      bucketTotal(bucket) > bucketTotal(largest) ? bucket : largest
    ));
    const fragment = document.createDocumentFragment();
    for (const bucket of filled) {
      fragment.append(buildStack(bucket, bucket === biggest));
    }
    inventorySummary.replaceChildren(fragment);
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
    renderGlanceLetters(mailbox.length);
    if (!mailboxSummary) return;
    if (mailbox.length === 0) {
      mailboxSummary.textContent =
        'No letters yet. Letters and parcels wait here for you, whether or not you were around when they arrived.';
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
    renderGlanceLooks(designs.length);
    if (!wardrobeSummary) return;
    if (designs.length === 0) {
      wardrobeSummary.textContent = 'No looks in your account wardrobe yet.';
      return;
    }
    const list = document.createElement('ul');
    list.className = 'looks';
    for (const design of designs) {
      const item = document.createElement('li');
      item.className = 'look';
      // A swatch only when the look really carries a colour; otherwise the
      // name stands alone rather than showing a colour we made up.
      const colour = edgeColourOf(design);
      if (colour) {
        const swatch = document.createElement('span');
        swatch.className = 'look__swatch';
        swatch.style.background = colour;
        swatch.setAttribute('aria-hidden', 'true');
        item.append(swatch);
      }
      const name = document.createElement('span');
      name.className = 'look__name';
      name.textContent = design.name || 'An unnamed look';
      item.append(name);
      if (design.sharedOnCard) {
        const chip = document.createElement('span');
        chip.className = 'look__chip';
        chip.textContent = 'Shared on card';
        item.append(chip);
      }
      list.append(item);
    }
    wardrobeSummary.replaceChildren(list);
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
      // One-time bridge, already walked: the button goes away for real, and
      // the receipt above it is all that is left to say.
      setButtonGone(wardrobeImportButton, true);
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
        `This browser is still holding ${local.length} saved look${local.length === 1 ? '' : 's'} `
        + 'from before you had an account. Copying them in is a one-time bridge — the looks then '
        + 'travel with your account, and wearing one in a shared world shows your actual drawing. '
        + 'If you started drawing after accounts existed, there is nothing to do here.';
    }
    if (wardrobeImportNote) wardrobeImportNote.textContent = '';
    if (!wardrobeImportButton) return;
    setButtonGone(wardrobeImportButton, false);
    wardrobeImportButton.disabled = false;
    wardrobeImportButton.textContent = wardrobeImportButtonLabel;
    wardrobeImportButton.onclick = async () => {
      wardrobeImportButton.disabled = true;
      wardrobeImportButton.textContent = 'Copying it in…';
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
        wardrobeImportButton.textContent = wardrobeImportButtonLabel;
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

  /**
   * The profile editor. Everything below reads and writes the DOM the page
   * already carries, so a reload or a failed save never leaves a half-built
   * form on screen; the two routes are the desk's usual Clerk-authenticated
   * pair (`GET` to read, `POST` a partial update to write). A bearer token is
   * pulled fresh from the live Clerk session for each request and never kept
   * anywhere — not in the URL, not in storage.
   */
  let profileWired = false;

  const setProfileNote = (text: string, kind: 'info' | 'error' = 'info') => {
    if (!profileNote) return;
    profileNote.textContent = text;
    profileNote.dataset.kind = kind;
  };

  const updateBioCount = () => {
    if (!profileBioCount || !profileBio) return;
    profileBioCount.textContent = String(profileBio.value.length);
  };

  const setVisibilityChoice = (name: string, value: ProfileVisibility) => {
    for (const input of profileForm?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`) ?? []) {
      input.checked = input.value === value;
    }
  };

  const readVisibility = (name: string): ProfileVisibility => {
    const checked = profileForm?.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
    const value = checked?.value;
    return value && (PROFILE_VISIBILITY_LEVELS as readonly string[]).includes(value)
      ? (value as ProfileVisibility)
      : 'friends';
  };

  const refreshAddLink = () => {
    if (!profileAddLink || !profileLinks) return;
    const full = profileLinks.children.length >= PROFILE_LIMITS.socialLinksMax;
    profileAddLink.disabled = full;
    profileAddLink.textContent = full ? `All ${PROFILE_LIMITS.socialLinksMax} links added` : 'Add a link';
  };

  /** One kind-select + URL-input + remove row, labelled for a screen reader. */
  const appendLinkRow = (kind: SocialLinkKind, url: string) => {
    if (!profileLinks) return;
    const index = profileLinks.children.length;
    const row = document.createElement('div');
    row.className = 'profile-link';

    const kindId = `profile-link-kind-${index}`;
    const kindLabel = document.createElement('label');
    kindLabel.className = 'visually-hidden';
    kindLabel.htmlFor = kindId;
    kindLabel.textContent = 'Kind of link';

    const select = document.createElement('select');
    select.className = 'field';
    select.id = kindId;
    select.dataset.linkKind = '';
    for (const option of SOCIAL_LINK_KINDS) {
      const item = document.createElement('option');
      item.value = option;
      item.textContent = SOCIAL_LINK_LABELS[option];
      select.append(item);
    }
    select.value = (SOCIAL_LINK_KINDS as readonly string[]).includes(kind) ? kind : 'website';

    const urlId = `profile-link-url-${index}`;
    const urlLabel = document.createElement('label');
    urlLabel.className = 'visually-hidden';
    urlLabel.htmlFor = urlId;
    urlLabel.textContent = 'Link address';

    const input = document.createElement('input');
    input.className = 'field';
    input.type = 'url';
    input.id = urlId;
    input.dataset.linkUrl = '';
    input.maxLength = PROFILE_LIMITS.socialUrlMax;
    input.placeholder = 'https://…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = url;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn--quiet';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', 'Remove this link');
    remove.addEventListener('click', () => {
      row.remove();
      refreshAddLink();
    });

    row.append(kindLabel, select, urlLabel, input, remove);
    profileLinks.append(row);
    refreshAddLink();
  };

  const renderProfileLinks = (links: ProfileSocialLink[]) => {
    if (!profileLinks) return;
    profileLinks.replaceChildren();
    for (const link of links.slice(0, PROFILE_LIMITS.socialLinksMax)) {
      appendLinkRow(link.kind, link.url);
    }
    refreshAddLink();
  };

  const renderProfile = (profile: PlayerProfile) => {
    // The card preview is drawn from the same read as the editor, so the two
    // can never disagree about what is written on your card.
    cardProfile = profile;
    renderCardPreview();
    if (!profileForm || !profileBio) return;
    profileBio.value = profile.bio ?? '';
    updateBioCount();
    const visibility = profile.visibility ?? { bio: 'friends', links: 'friends' };
    setVisibilityChoice('profile-visibility-bio', visibility.bio);
    setVisibilityChoice('profile-visibility-links', visibility.links);
    renderProfileLinks(Array.isArray(profile.links) ? profile.links : []);
  };

  /** The links as the player has them on screen, refusing a non-http address. */
  const collectLinks = (): ProfileSocialLink[] => {
    const links: ProfileSocialLink[] = [];
    for (const row of Array.from(profileLinks?.querySelectorAll<HTMLElement>('.profile-link') ?? [])) {
      const select = row.querySelector<HTMLSelectElement>('[data-link-kind]');
      const input = row.querySelector<HTMLInputElement>('[data-link-url]');
      if (!select || !input) continue;
      const url = input.value.trim();
      if (!url) continue;
      if (!/^https?:\/\/\S+$/i.test(url)) {
        throw new Error('Every link needs to start with http:// or https://.');
      }
      const kind = (SOCIAL_LINK_KINDS as readonly string[]).includes(select.value)
        ? (select.value as SocialLinkKind)
        : 'other';
      links.push({ kind, url });
    }
    return links;
  };

  const saveProfile = async (getToken: () => Promise<string | null>) => {
    if (!profileSave) return;
    profileSave.disabled = true;
    profileSave.textContent = 'Saving…';
    setProfileNote('');
    try {
      const body: ProfileUpdatePayload = {
        bio: profileBio?.value ?? '',
        links: collectLinks(),
        visibility: {
          bio: readVisibility('profile-visibility-bio'),
          links: readVisibility('profile-visibility-links'),
        },
      };
      const token = await getToken();
      if (!token) throw new Error('Your sign-in session could not be refreshed.');
      const response = await fetch(`${apiUrl}/account/profile`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({})) as ProfileResponse;
      if (!response.ok || !result.profile) {
        throw new Error(result.error || 'Your profile could not be saved.');
      }
      renderProfile(result.profile);
      setProfileNote('Saved — this travels with your account from here on.');
      profileSave.textContent = 'Saved';
      window.setTimeout(() => {
        if (!profileSave) return;
        profileSave.disabled = false;
        profileSave.textContent = 'Save profile';
      }, 1600);
    } catch (error) {
      setProfileNote(
        error instanceof Error ? error.message : 'Your profile could not be saved.',
        'error',
      );
      profileSave.disabled = false;
      profileSave.textContent = 'Save profile';
    }
  };

  const wireProfile = (getToken: () => Promise<string | null>) => {
    if (profileWired) return;
    profileWired = true;
    if (profileBio) {
      profileBio.maxLength = PROFILE_LIMITS.bioMax;
      profileBio.addEventListener('input', updateBioCount);
    }
    if (profileAddLink) {
      profileAddLink.addEventListener('click', () => {
        if (!profileLinks || profileLinks.children.length >= PROFILE_LIMITS.socialLinksMax) return;
        appendLinkRow('website', '');
        profileLinks.querySelector<HTMLInputElement>('.profile-link:last-child [data-link-url]')?.focus();
      });
    }
    if (profileSave) {
      profileSave.addEventListener('click', () => void saveProfile(getToken));
    }
  };

  /**
   * Reads the profile and either fills the form in or, when the route cannot
   * answer (not signed in, not configured), says so in the desk's own voice
   * rather than leaving a form that would fail on save.
   */
  const loadProfile = async (getToken: () => Promise<string | null>) => {
    if (!profileForm || !profileStatus) return;
    profileForm.hidden = true;
    profileStatus.hidden = false;
    profileStatus.textContent = 'Opening your profile…';
    try {
      const token = await getToken();
      if (!token) throw new Error('Your sign-in session could not be refreshed.');
      const response = await fetch(`${apiUrl}/account/profile`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const body = await response.json().catch(() => ({})) as ProfileResponse;
      if (!response.ok || !body.profile) {
        throw new Error(body.error || 'Your profile could not be opened just now.');
      }
      renderProfile(body.profile);
      profileStatus.hidden = true;
      profileForm.hidden = false;
    } catch (error) {
      profileStatus.hidden = false;
      profileStatus.textContent = error instanceof Error
        ? error.message
        : 'Your profile could not be opened just now.';
    }
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
      // One-time bridge, already walked: the button goes away for real, and
      // the receipt above it is all that is left to say.
      setButtonGone(migrationButton, true);
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
        `This browser is still holding a solo save from before you had an account: ${describeSnapshot(snapshot)}. `
        + 'Copying it in is a one-time bridge — your account takes it over, and it will never ask twice. '
        + 'If you started playing after accounts existed, there is nothing to do here.';
    }
    if (migrationNote) migrationNote.textContent = '';
    if (!migrationButton) return;
    setButtonGone(migrationButton, false);
    migrationButton.disabled = false;
    migrationButton.textContent = migrationButtonLabel;
    migrationButton.onclick = async () => {
      migrationButton.disabled = true;
      migrationButton.textContent = 'Copying it in…';
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
        migrationButton.textContent = migrationButtonLabel;
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
    // The glance lines and the card fill from what the desk already holds:
    // the local save for learning, the mailbox for letters, the wardrobe for
    // looks (both of those fill themselves as their counts arrive).
    renderGlanceLearning();
    cardName = account.displayName;
    cardProfile = null;
    renderCardPreview();
    wireProfile(getToken);
    void loadProfile(getToken);
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
