// The player card (avatar-and-identity.md §3) — "the one place another
// player learns about you." Reached, for now, by clicking a live avatar
// in-world; maker/dwelling credit and a chat-name entry point are later
// slices of the same phase (see docs/next-session.md).
//
// Built fresh on each open and torn down on close, same shape as the
// wardrobe panel: this is a settings-family overlay over the world, not
// persistent HUD chrome.
//
// What renders immediately, from data the client already has (a live avatar
// already announces a neighbor's name and current look to everyone nearby):
// the avatar, the display name, and "made N things on this page" (counted
// locally from the already-synced pieces list — see countMakerPiecesOnPage).
// What waits on the server: the papering-since date and any wardrobe designs
// shared for display, both account-owned facts a live avatar can't carry.
// A `found: false` answer — no such account, a guest, or a block in either
// direction — collapses that second part to one quiet line, never a reason,
// so opening a card can never be used to test who has blocked whom.

import {
  isGuestAccount,
  LIMITS,
  type AvatarDesign,
  type PlayerCardInfo,
  type ProfileRelationship,
  type SocialLinkKind,
} from '../../shared/src/index';
import { designToDataUrl } from './avatarEditor/render';
import { fetchDesignJson } from '../net/remoteAvatarVisuals';
import { countMakerPiecesOnPage } from '../net/sharedPieceVisuals';
import { getCurrentPageId } from '../world/streaming';
import { getTrinkets } from '../game/trinkets';
import {
  answerFriend,
  friendStateOf,
  getSelfAccount,
  guestsAvailable,
  requestFriend,
  selfIsGuest,
  subscribeGuests,
} from '../game/guests';
import { getTrinketDef, TRINKET_FAMILIES } from '../sim/catalogs/trinkets';
import type { TrinketInstance } from '../sim/state';

const PLACEHOLDER_AVATAR = '/assets/runtime/avatars/avatar_placeholder_flat_01.png';

/**
 * THE DISCLOSURE. Required reading at the moment somebody asks to be friends.
 *
 * It is true because of the owner rule in `profileForViewer`
 * (shared/src/protocol/profile.ts): when the profile's owner has an
 * outstanding friend request addressed to the viewer, `hasSentRequest` makes
 * the basic fields (bio, links) visible whatever their per-field visibility
 * is. The name always rides along with the request itself
 * (`FriendRequestRecord.name`). So the person you ask sees your name and
 * whatever you have written to share — your privacy settings do not hide it
 * from them. An empty bio or no links simply means there is nothing to show.
 */
export const FRIEND_REQUEST_DISCLOSURE =
  "Asking someone to be friends shows them who's asking — your name, and "
  + "whatever you've written to share (your bio and links). Your privacy "
  + "settings won't hide it from the person you've asked.";

/** The quiet, human name for each kind of social link. */
const LINK_KIND_LABELS: Record<SocialLinkKind, string> = {
  website: 'Website',
  instagram: 'Instagram',
  x: 'X',
  youtube: 'YouTube',
  twitch: 'Twitch',
  discord: 'Discord',
  other: 'A link',
};

/** The quiet line for a relationship the server already chose to tell us. */
const RELATIONSHIP_LINES: Partial<Record<ProfileRelationship, string>> = {
  self: 'This is you.',
  friend: "You're friends.",
  'friend-of-friend': 'You have a friend in common.',
};

export type PlayerCardTarget = {
  accountId: string;
  name: string;
  /** '' means still on the template fallback — no drawn look to fetch. */
  drawingKey: string;
};

let requestCardHandler: ((accountId: string) => void) | null = null;

/**
 * Injected by sharedSession.ts once, at module load. Kept as an injection
 * point rather than reading the connection directly so the card does not have
 * to hold a reference to the socket: sharedSession owns the session and calls
 * this with its own `requestPlayerCard`, and it calls `handlePlayerCardResponse`
 * when an answer arrives the other way — same shape as `setSharedMailClaimHandler`.
 */
export function setPlayerCardRequestHandler(handler: ((accountId: string) => void) | null): void {
  requestCardHandler = handler;
}

export type PlayerCardSafetyHandlers = {
  block: (accountId: string) => void;
  report: (accountId: string, details?: string) => void;
};

let safetyHandlers: PlayerCardSafetyHandlers | null = null;

/**
 * Block and report, injected by sharedSession.ts exactly like the request
 * handler above — and, since 2026-09-20, for a second reason beyond symmetry.
 *
 * These used to be a direct `import { blockAccount, reportAccount } from
 * '../net/sharedSession'`. That closed an import cycle: sharedSession already
 * imports THIS module for `handlePlayerCardResponse` and `setPlayerCardRequestHandler`,
 * and it assigns `requestCardHandler` here at module-evaluation time. Whichever
 * module the bundler evaluates first wins, and if this one went first the
 * assignment hit a not-yet-initialised `let` —
 * "Cannot access 'requestCardHandler' before initialization", at boot. The game
 * survived only because `main.ts` happened to reach sharedSession first through
 * an unrelated import, so reordering two lines of `main.ts` could kill it.
 *
 * Injecting the handlers removes the edge instead of pinning the order that hid
 * it — the same posture as `setPlayerCardRequestHandler` and
 * `setSharedMailClaimHandler`, and it keeps this module free of any reference to
 * the socket.
 */
export function setPlayerCardSafetyHandlers(next: PlayerCardSafetyHandlers | null): void {
  safetyHandlers = next;
}

let close: (() => void) | null = null;
let stopFriendUpdates: (() => void) | null = null;
let openAccountId: string | null = null;
let metaElement: HTMLElement | null = null;
let sharedElement: HTMLElement | null = null;

function monthYear(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function creationsLine(accountId: string): string {
  const count = countMakerPiecesOnPage(accountId, getCurrentPageId());
  if (count === 0) return "Hasn't made anything on this page yet.";
  return `Made ${count} thing${count === 1 ? '' : 's'} on this page.`;
}

async function renderAvatarPreview(image: HTMLImageElement, drawingKey: string): Promise<void> {
  if (!drawingKey) return; // Placeholder is already the src — the floor, not an error.
  const design = await fetchDesignJson(drawingKey);
  if (!design || image.dataset.drawingKey !== drawingKey) return;
  image.src = designToDataUrl(design, { shadow: true });
}

async function renderSharedLooks(host: HTMLElement, designIds: string[]): Promise<void> {
  if (designIds.length === 0) return;
  const section = document.createElement('div');
  section.className = 'player-card-shared';
  section.innerHTML = '<h3 class="hud-overlay-subhead">Shared looks</h3><div class="player-card-shared-list"></div>';
  host.append(section);
  const list = section.querySelector<HTMLElement>('.player-card-shared-list');
  const designs = await Promise.all(designIds.map((id) => fetchDesignJson(id)));
  if (!list || list !== section.querySelector('.player-card-shared-list')) return;
  const found = designs.filter((design): design is AvatarDesign => design !== null);
  if (found.length === 0) {
    section.remove();
    return;
  }
  for (const design of found) {
    const img = document.createElement('img');
    img.className = 'avatar-wardrobe-preview';
    img.alt = '';
    img.src = designToDataUrl(design, { shadow: true });
    list.append(img);
  }
}

/**
 * The trinket shelf.
 *
 * Drawn as coloured paper medallions rather than rendered 3D: the card is a
 * DOM overlay, and spinning up a second WebGL context per card to show twelve
 * tiny objects would cost far more than it is worth. The colour and the name
 * carry the identity; the world placement is where the real model lives.
 *
 * `mine` is true for the player's own card — the one place trinkets are shown
 * today, since trinket ownership is not yet synced to the server. When it is,
 * `renderTrinketShelf` takes the other player's list the same way.
 */
function renderTrinketShelf(host: HTMLElement, trinkets: readonly TrinketInstance[], mine: boolean): void {
  const section = document.createElement('div');
  section.className = 'player-card-trinkets';
  const heading = mine ? 'Your trinket shelf' : 'Trinket shelf';
  section.innerHTML = `<h3 class="hud-overlay-subhead">${heading}</h3><div class="player-card-trinket-list"></div>`;
  host.append(section);
  const list = section.querySelector<HTMLElement>('.player-card-trinket-list');
  if (!list) return;
  if (trinkets.length === 0) {
    list.innerHTML = '<p class="player-card-trinket-empty">No trinkets yet. Critters hand them out for favours done.</p>';
    return;
  }
  for (const trinket of trinkets) {
    const def = getTrinketDef(trinket.defId);
    const chip = document.createElement('span');
    chip.className = 'player-card-trinket';
    const color = def?.palette.base ?? '#cdc4b4';
    const accent = def?.palette.accent ?? '#9a8f7c';
    chip.style.setProperty('--trinket-base', color);
    chip.style.setProperty('--trinket-accent', accent);
    chip.title = def ? `${def.label} — ${TRINKET_FAMILIES[def.family].label}` : trinket.defId;
    chip.innerHTML = `<span class="player-card-trinket-medal" aria-hidden="true"></span><span class="player-card-trinket-label">${def?.label ?? trinket.defId}</span>`;
    list.append(chip);
  }
}

/**
 * The player's own bio card, so they can see their shelf the way a visitor to
 * their lot eventually will. Built on the same overlay as a neighbour's card.
 */
export function openMyPlayerCard(): void {
  if (close) close();
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const overlay = document.createElement('div');
  overlay.className = 'hud-overlay player-card is-open';
  overlay.innerHTML = `
    <div class="hud-overlay-card player-card-sheet" role="dialog" aria-modal="true" aria-labelledby="player-card-name">
      <button class="hud-overlay-close" type="button" aria-label="Close player card">×</button>
      <p class="hud-overlay-kicker">Pencil and Paper</p>
      <img class="player-card-avatar" alt="" src="${PLACEHOLDER_AVATAR}">
      <h2 id="player-card-name" tabindex="-1">You</h2>
      <p class="player-card-meta">${creationsLine('local-player')}</p>
    </div>`;

  const sheet = overlay.querySelector<HTMLElement>('.player-card-sheet');
  if (sheet) renderTrinketShelf(sheet, getTrinkets().filter((trinket) => trinket.placed === null), true);

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closePlayerCard();
    }
  };
  const swallowStrayKeys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') return;
    if (event.target instanceof Node && overlay.contains(event.target)) return;
    event.stopPropagation();
  };
  close = () => {
    document.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('keydown', swallowStrayKeys, true);
    window.removeEventListener('keyup', swallowStrayKeys, true);
    stopFriendUpdates?.();
    stopFriendUpdates = null;
    overlay.remove();
    close = null;
    openAccountId = null;
    metaElement = null;
    sharedElement = null;
    opener?.focus();
  };
  overlay.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).classList.contains('hud-overlay-close')) closePlayerCard();
  });
  for (const eventName of ['pointerdown', 'pointerup', 'wheel', 'click', 'contextmenu'] as const) {
    overlay.addEventListener(eventName, (event) => event.stopPropagation());
  }
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('keydown', swallowStrayKeys, true);
  window.addEventListener('keyup', swallowStrayKeys, true);
  document.body.appendChild(overlay);

  const heading = overlay.querySelector<HTMLElement>('#player-card-name');
  if (heading && !overlay.contains(document.activeElement)) heading.focus();
}

/** True if a card was open and this closed it — mirrors closeCritterDialogue. */
export function closePlayerCard(): boolean {
  if (!close) return false;
  close();
  return true;
}

export function isPlayerCardOpen(): boolean {
  return close !== null;
}

/**
 * The optional short note that rides along with a friend request, plus the
 * disclosure that must be read at the moment of asking. Built once per ask
 * surface (the card, a neighbor's door, the friends list) so the sentence and
 * the bounds (`LIMITS.friendRequestMessageMax`) live in exactly one place.
 *
 * The note is optional and never required: an empty field simply sends no
 * message, and the server sanitizes whatever does travel.
 */
export function buildFriendRequestNote(scope: string): {
  element: HTMLElement;
  input: HTMLInputElement;
  value: () => string | undefined;
} {
  const wrap = document.createElement('div');
  wrap.className = 'friend-request-note';

  const head = document.createElement('div');
  head.className = 'friend-request-note-head';
  const id = `${scope}-friend-note`;
  const label = document.createElement('label');
  label.className = 'friend-request-note-label';
  label.htmlFor = id;
  label.textContent = 'Add a short note (optional)';
  const count = document.createElement('span');
  count.className = 'friend-request-note-count';
  count.setAttribute('aria-hidden', 'true');
  head.append(label, count);

  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.className = 'friend-request-note-input';
  input.maxLength = LIMITS.friendRequestMessageMax;
  input.autocomplete = 'off';
  input.placeholder = 'Say hello, if you like…';
  const refresh = () => {
    count.textContent = `${input.value.length}/${LIMITS.friendRequestMessageMax}`;
  };
  input.addEventListener('input', refresh);
  refresh();

  const disclosure = document.createElement('p');
  disclosure.className = 'friend-request-disclosure';
  disclosure.textContent = FRIEND_REQUEST_DISCLOSURE;

  wrap.append(head, input, disclosure);
  return {
    element: wrap,
    input,
    value: () => input.value.trim().slice(0, LIMITS.friendRequestMessageMax) || undefined,
  };
}

/**
 * One confirm, then silence. Blocking is account-scoped and lasting (it also
 * closes the blocked player's door for them), and the person blocked is never
 * told — so the copy says both things plainly, to the person doing it.
 */
export function confirmBlock(name: string): boolean {
  return window.confirm(
    `Stop seeing ${name}'s messages and close your door to them? They will not be told.`,
  );
}

/**
 * "Add friend" on a neighbor's card. Friends are the tier a home's door can
 * let walk straight in (docs/house-and-home.md), so this is where a friendship
 * starts. Quiet for guests, for yourself, and in solo play.
 */
function renderFriendActions(host: HTMLElement, target: PlayerCardTarget): void {
  const eligible = guestsAvailable() && !selfIsGuest()
    && !isGuestAccount(target.accountId) && target.accountId !== getSelfAccount();
  const state = eligible ? friendStateOf(target.accountId) : 'none';
  const active = document.activeElement instanceof HTMLElement && host.contains(document.activeElement)
    ? document.activeElement
    : null;
  const focusedAct = active?.dataset.cardFriend ?? null;
  const noteWasFocused = active?.classList.contains('friend-request-note-input') ?? false;
  const draft = host.querySelector<HTMLInputElement>('.friend-request-note-input')?.value ?? '';
  host.replaceChildren();
  host.hidden = !eligible;
  if (!eligible) return;
  const say = (text: string) => {
    const line = document.createElement('p');
    line.className = 'player-card-meta';
    line.textContent = text;
    host.append(line);
  };
  const make = (act: string, label: string, quiet = false) => {
    const control = document.createElement('button');
    control.type = 'button';
    control.dataset.cardFriend = act;
    control.textContent = label;
    if (quiet) control.classList.add('is-quiet');
    host.append(control);
  };
  if (state === 'friends') say(`You and ${target.name} are friends.`);
  else if (state === 'outgoing') say(`You asked ${target.name} to be friends. They will see it when they are next around.`);
  else if (state === 'incoming') {
    say(`${target.name} asked to be friends.`);
    make('accept', 'Accept');
    make('decline', 'Not now', true);
  } else {
    const note = buildFriendRequestNote(`card-${target.accountId}`);
    if (draft) {
      note.input.value = draft;
      note.input.dispatchEvent(new Event('input'));
    }
    host.append(note.element);
    make('add', 'Add friend');
    if (noteWasFocused) note.input.focus();
  }
  if (focusedAct) host.querySelector<HTMLElement>(`[data-card-friend="${focusedAct}"]`)?.focus();
}

/**
 * The profile a neighbor chose to show: a quiet relationship line, their bio,
 * and their links. Every piece is optional and omitted when empty, so an
 * empty answer leaves the card exactly as it was.
 *
 * The server has already filtered this through `profileForViewer` — we render
 * only what it sent, and we never ask it why something is missing.
 */
function renderProfile(host: HTMLElement, info: PlayerCardInfo): void {
  host.replaceChildren();
  const line = info.relationship ? RELATIONSHIP_LINES[info.relationship] ?? '' : '';
  const bio = (info.bio ?? '').trim();
  const links = (info.links ?? []).filter((link) => /^https?:\/\//i.test(link.url));
  if (!line && !bio && links.length === 0) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  if (line) {
    const relation = document.createElement('p');
    relation.className = 'player-card-relationship';
    relation.textContent = line;
    host.append(relation);
  }
  if (bio) {
    const paragraph = document.createElement('p');
    paragraph.className = 'player-card-bio';
    paragraph.textContent = bio;
    host.append(paragraph);
  }
  if (links.length > 0) {
    const heading = document.createElement('h3');
    heading.className = 'hud-overlay-subhead';
    heading.textContent = 'Elsewhere';
    host.append(heading);
    const list = document.createElement('ul');
    list.className = 'player-card-links';
    for (const link of links) {
      const label = LINK_KIND_LABELS[link.kind] ?? 'Link';
      const item = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.className = 'player-card-link';
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer nofollow';
      anchor.textContent = label;
      anchor.setAttribute('aria-label', `${label} (opens in a new tab)`);
      item.append(anchor);
      list.append(item);
    }
    host.append(list);
  }
}

/**
 * Block and report, kept silent and cheap. Both funnel into the same shared
 * session calls the chat menu uses; neither tells the other player anything.
 * Report offers an optional note and never requires one.
 */
function renderSafetyActions(host: HTMLElement, target: PlayerCardTarget): void {
  const eligible = guestsAvailable() && !selfIsGuest()
    && !isGuestAccount(target.accountId) && target.accountId !== getSelfAccount();
  host.replaceChildren();
  host.hidden = !eligible;
  if (!eligible) return;

  const row = document.createElement('div');
  row.className = 'player-card-safety-row';
  const blockButton = document.createElement('button');
  blockButton.type = 'button';
  blockButton.dataset.cardSafety = 'block';
  blockButton.className = 'is-quiet';
  blockButton.textContent = 'Block';
  blockButton.setAttribute('aria-label', `Block ${target.name}`);
  const reportButton = document.createElement('button');
  reportButton.type = 'button';
  reportButton.dataset.cardSafety = 'report';
  reportButton.className = 'is-quiet';
  reportButton.textContent = 'Report';
  reportButton.setAttribute('aria-label', `Report ${target.name}`);
  reportButton.setAttribute('aria-expanded', 'false');
  row.append(blockButton, reportButton);

  const details = document.createElement('div');
  details.className = 'player-card-report';
  details.hidden = true;
  const hint = document.createElement('p');
  hint.className = 'player-card-report-hint';
  hint.textContent = 'The people running the alpha will see who this is about. Say as '
    + 'much or as little as you like — you do not have to explain yourself.';
  const label = document.createElement('label');
  label.className = 'sr-only';
  const fieldId = `card-report-details-${target.accountId}`;
  label.htmlFor = fieldId;
  label.textContent = 'Anything you want to add';
  const textarea = document.createElement('textarea');
  textarea.id = fieldId;
  textarea.className = 'player-card-report-details';
  textarea.rows = 3;
  textarea.maxLength = LIMITS.reportDetailsMax;
  textarea.placeholder = 'Anything you want to add (optional)';
  const send = document.createElement('button');
  send.type = 'button';
  send.dataset.cardSafety = 'report-send';
  send.textContent = 'Send the report';
  details.append(hint, label, textarea, send);

  const note = document.createElement('p');
  note.className = 'player-card-safety-note';
  note.setAttribute('role', 'status');
  note.setAttribute('aria-live', 'polite');

  host.append(row, details, note);

  row.addEventListener('click', (event) => {
    const act = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-card-safety]')?.dataset.cardSafety;
    if (act === 'block') {
      if (!confirmBlock(target.name)) return;
      safetyHandlers?.block(target.accountId);
      blockButton.hidden = true;
      note.textContent = 'You will not see their messages any more.';
    } else if (act === 'report') {
      details.hidden = !details.hidden;
      reportButton.setAttribute('aria-expanded', String(!details.hidden));
      if (!details.hidden) textarea.focus();
    }
  });
  details.addEventListener('click', (event) => {
    const act = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-card-safety]')?.dataset.cardSafety;
    if (act !== 'report-send') return;
    safetyHandlers?.report(target.accountId, textarea.value.trim() || undefined);
    details.hidden = true;
    reportButton.setAttribute('aria-expanded', 'false');
    note.textContent = 'Report sent. Thank you for telling us.';
  });
}

export function openPlayerCardFor(target: PlayerCardTarget): void {
  if (close) close();
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  openAccountId = target.accountId;

  const overlay = document.createElement('div');
  overlay.className = 'hud-overlay player-card is-open';
  overlay.innerHTML = `
    <div class="hud-overlay-card player-card-sheet" role="dialog" aria-modal="true"
         aria-labelledby="player-card-name">
      <button class="hud-overlay-close" type="button" aria-label="Close player card">×</button>
      <p class="hud-overlay-kicker">Pencil and Paper</p>
      <img class="player-card-avatar" alt="" src="${PLACEHOLDER_AVATAR}">
      <h2 id="player-card-name" tabindex="-1"></h2>
      <p class="player-card-meta">…</p>
      <div class="player-card-profile" data-card-profile hidden></div>
      <div class="player-card-friend" data-card-friend-host hidden></div>
      <div class="player-card-safety" data-card-safety-host hidden></div>
    </div>`;

  const nameHeading = overlay.querySelector<HTMLElement>('#player-card-name')!;
  nameHeading.textContent = target.name;
  const avatarImage = overlay.querySelector<HTMLImageElement>('.player-card-avatar')!;
  avatarImage.dataset.drawingKey = target.drawingKey;
  void renderAvatarPreview(avatarImage, target.drawingKey);
  metaElement = overlay.querySelector('.player-card-meta');
  sharedElement = overlay.querySelector('.player-card-sheet');

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closePlayerCard();
    }
  };
  const swallowStrayKeys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') return;
    if (event.target instanceof Node && overlay.contains(event.target)) return;
    event.stopPropagation();
  };

  close = () => {
    document.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('keydown', swallowStrayKeys, true);
    window.removeEventListener('keyup', swallowStrayKeys, true);
    stopFriendUpdates?.();
    stopFriendUpdates = null;
    overlay.remove();
    close = null;
    openAccountId = null;
    metaElement = null;
    sharedElement = null;
    opener?.focus();
  };

  overlay.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).classList.contains('hud-overlay-close')) closePlayerCard();
  });
  for (const eventName of ['pointerdown', 'pointerup', 'wheel', 'click', 'contextmenu'] as const) {
    overlay.addEventListener(eventName, (event) => event.stopPropagation());
  }
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('keydown', swallowStrayKeys, true);
  window.addEventListener('keyup', swallowStrayKeys, true);

  document.body.appendChild(overlay);

  const friendHost = overlay.querySelector<HTMLElement>('[data-card-friend-host]');
  if (friendHost) {
    friendHost.addEventListener('click', (event) => {
      const act = (event.target as HTMLElement).closest<HTMLElement>('[data-card-friend]')?.dataset.cardFriend;
      if (act === 'add') {
        const note = friendHost.querySelector<HTMLInputElement>('.friend-request-note-input')?.value.trim();
        requestFriend(target.accountId, note || undefined);
      } else if (act === 'accept') answerFriend(target.accountId, true);
      else if (act === 'decline') answerFriend(target.accountId, false);
    });
    renderFriendActions(friendHost, target);
    stopFriendUpdates = subscribeGuests(() => renderFriendActions(friendHost, target));
  }

  const safetyHost = overlay.querySelector<HTMLElement>('[data-card-safety-host]');
  if (safetyHost) renderSafetyActions(safetyHost, target);

  // The dialog opens on its heading, standard for a modal; a control the
  // friend actions deliberately refocused is left where it is.
  if (!overlay.contains(document.activeElement)) nameHeading.focus();

  // "Made N things" needs no round trip — the pieces list is already synced
  // to every client. Papering-since and shared looks are account-owned, so
  // they wait on the server's answer (see handlePlayerCardResponse).
  if (metaElement) metaElement.textContent = creationsLine(target.accountId);
  requestCardHandler?.(target.accountId);
}

/** Wired from sharedSession.ts as the room's `onPlayerCard` callback. */
export function handlePlayerCardResponse(info: PlayerCardInfo): void {
  if (info.accountId !== openAccountId || !metaElement) return;
  const profileHost = sharedElement?.querySelector<HTMLElement>('[data-card-profile]') ?? null;

  if (!info.found) {
    // Never a reason — "no such account", "a guest", and "they've blocked
    // you" all read the same, on purpose (avatar-and-identity.md §3).
    metaElement.textContent = 'Nothing to show here.';
    if (profileHost) {
      profileHost.replaceChildren();
      profileHost.hidden = true;
    }
    return;
  }

  const creations = openAccountId ? creationsLine(openAccountId) : '';
  const since = info.papersSince ? `Papering since ${monthYear(info.papersSince)}.` : '';
  metaElement.textContent = [creations, since].filter(Boolean).join(' ');

  if (profileHost) renderProfile(profileHost, info);

  if (sharedElement && info.sharedDesignIds?.length) {
    void renderSharedLooks(sharedElement, info.sharedDesignIds);
  }
}
