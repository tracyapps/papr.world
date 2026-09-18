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

import type { AvatarDesign, PlayerCardInfo } from '../../shared/src/index';
import { designToDataUrl } from './avatarEditor/render';
import { fetchDesignJson } from '../net/remoteAvatarVisuals';
import { countMakerPiecesOnPage } from '../net/sharedPieceVisuals';
import { getCurrentPageId } from '../world/streaming';
import { getTrinkets } from '../game/trinkets';
import { getTrinketDef, TRINKET_FAMILIES } from '../sim/catalogs/trinkets';
import type { TrinketInstance } from '../sim/state';

const PLACEHOLDER_AVATAR = '/assets/runtime/avatars/avatar_placeholder_flat_01.png';

export type PlayerCardTarget = {
  accountId: string;
  name: string;
  /** '' means still on the template fallback — no drawn look to fetch. */
  drawingKey: string;
};

let requestCardHandler: ((accountId: string) => void) | null = null;

/**
 * Injected by sharedSession.ts once, at module load. Kept as an injection
 * point rather than an import so this module never has to import the
 * networking layer that already imports it for `handlePlayerCardResponse` —
 * same shape as `setSharedMailClaimHandler`.
 */
export function setPlayerCardRequestHandler(handler: ((accountId: string) => void) | null): void {
  requestCardHandler = handler;
}

let close: (() => void) | null = null;
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
      <h2 id="player-card-name">You</h2>
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
      <h2 id="player-card-name"></h2>
      <p class="player-card-meta">…</p>
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

  // "Made N things" needs no round trip — the pieces list is already synced
  // to every client. Papering-since and shared looks are account-owned, so
  // they wait on the server's answer (see handlePlayerCardResponse).
  if (metaElement) metaElement.textContent = creationsLine(target.accountId);
  requestCardHandler?.(target.accountId);
}

/** Wired from sharedSession.ts as the room's `onPlayerCard` callback. */
export function handlePlayerCardResponse(info: PlayerCardInfo): void {
  if (info.accountId !== openAccountId || !metaElement) return;

  if (!info.found) {
    // Never a reason — "no such account", "a guest", and "they've blocked
    // you" all read the same, on purpose (avatar-and-identity.md §3).
    metaElement.textContent = 'Nothing to show here.';
    return;
  }

  const creations = openAccountId ? creationsLine(openAccountId) : '';
  const since = info.papersSince ? `Papering since ${monthYear(info.papersSince)}.` : '';
  metaElement.textContent = [creations, since].filter(Boolean).join(' ');

  if (sharedElement && info.sharedDesignIds?.length) {
    void renderSharedLooks(sharedElement, info.sharedDesignIds);
  }
}
