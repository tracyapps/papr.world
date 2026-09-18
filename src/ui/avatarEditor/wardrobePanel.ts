// The wardrobe panel — Phase C1 of docs/avatar-and-identity.md §7.
//
// A settings-family overlay (a card over the world, not a fullscreen room
// like the studio): every saved look in one list, each wearable, renamable,
// duplicable, deletable, and shareable on the player card. It is also where
// a full wardrobe says so out loud — the studio hands its unsaved design in
// as `pendingSave`, and the player chooses a slot to replace rather than
// losing either the work or the save (the Phase B rough edge this panel
// exists partly to fix).
//
// Renderers are injected as callbacks (`onWear`, `onEdit`) so this module,
// like the rest of `avatarEditor/`, never imports from `game/` — wearing a
// design crosses the DOM/renderer boundary, and that crossing belongs to
// `avatarLook.ts` alone.

import { DESIGN_LIMITS, type AvatarDesign } from '../../../shared/src/index';
import { designToDataUrl } from './render';
import {
  deleteDesign,
  duplicateDesign,
  getWornId,
  listDesigns,
  renameDesign,
  saveDesign,
  onWardrobeChange,
  setSharedOnCard,
  setWornId,
} from './wardrobe';

export type WardrobePanelOptions = {
  /**
   * A finished design that did not fit: the studio keeps it worn and sends
   * it here so the player can replace a slot on purpose.
   */
  pendingSave?: AvatarDesign;
  /** Wear a design on the avatar plane; wired by the caller. */
  onWear?: (design: AvatarDesign) => void;
  /** Open the studio editing this design; wired by the caller. */
  onEdit?: (design: AvatarDesign) => void;
};

let panelOpen = false;

export function isWardrobePanelOpen(): boolean {
  return panelOpen;
}

export function openWardrobePanel(options: WardrobePanelOptions = {}): void {
  if (panelOpen) return;
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  panelOpen = true;
  let pendingSave = options.pendingSave ? structuredClone(options.pendingSave) : null;

  const overlay = document.createElement('div');
  overlay.className = 'hud-overlay avatar-wardrobe is-open';
  overlay.innerHTML = `
    <div class="hud-overlay-card avatar-wardrobe-card" role="dialog" aria-modal="true"
         aria-labelledby="avatar-wardrobe-title">
      <button class="hud-overlay-close" type="button" aria-label="Close the wardrobe">×</button>
      <p class="hud-overlay-kicker">Pencil and Paper</p>
      <h2 id="avatar-wardrobe-title">Your wardrobe</h2>
      <p class="avatar-wardrobe-status" role="status" aria-live="polite"></p>
      <div data-role="pending"></div>
      <p class="avatar-wardrobe-count"></p>
      <div data-role="list"></div>
    </div>`;

  const $ = <T extends HTMLElement>(selector: string): T => {
    const el = overlay.querySelector<T>(selector);
    if (!el) throw new Error(`wardrobe panel: missing ${selector}`);
    return el;
  };
  const status = $('.avatar-wardrobe-status');
  const announce = (text: string) => {
    status.textContent = text;
  };

  const close = () => {
    stopListening();
    document.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('keydown', swallowStrayKeys, true);
    window.removeEventListener('keyup', swallowStrayKeys, true);
    overlay.remove();
    panelOpen = false;
    opener?.focus();
  };

  /** Keep the pending design alive in the panel's own state, not the store's. */
  const settlePending = (design: AvatarDesign) => {
    saveDesign(design);
    setWornId(design.id);
    options.onWear?.(design);
    pendingSave = null;
  };

  const renderPending = () => {
    const host = $('[data-role="pending"]');
    if (!pendingSave) {
      host.replaceChildren();
      return;
    }
    const designs = listDesigns();
    const free = designs.length < DESIGN_LIMITS.wardrobeMax;
    const box = document.createElement('div');
    box.className = 'avatar-wardrobe-pending';
    const title = document.createElement('h3');
    title.textContent = 'Your wardrobe is full';
    const preview = document.createElement('img');
    preview.className = 'avatar-wardrobe-preview';
    preview.alt = '';
    preview.src = designToDataUrl(pendingSave, { shadow: true });
    const body = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = `“${pendingSave.name}” is being worn but not saved.`;
    const hint = document.createElement('small');
    hint.textContent = free
      ? 'A slot is free now.'
      : 'Make room by deleting a look below, or replace one with this new look.';
    const row = document.createElement('div');
    row.className = 'avatar-wardrobe-pending-actions';
    const saveNow = document.createElement('button');
    saveNow.type = 'button';
    saveNow.textContent = 'Save it into a free slot';
    saveNow.disabled = !free;
    saveNow.addEventListener('click', () => {
      if (!pendingSave) return;
      settlePending(pendingSave);
      announce(`Saved “${pendingSave.name}” to your wardrobe.`);
      render();
    });
    const keepWorn = document.createElement('button');
    keepWorn.type = 'button';
    keepWorn.textContent = 'Keep wearing it for now';
    keepWorn.addEventListener('click', () => {
      pendingSave = null;
      announce('Wearing it for this visit — it is not saved to your wardrobe.');
      render();
    });
    row.append(saveNow, keepWorn);
    body.append(name, hint, row);
    box.append(preview, body);
    host.replaceChildren(box);
  };

  const renderRow = (design: AvatarDesign, wornId: string | null) => {
    const row = document.createElement('div');
    row.className = 'avatar-wardrobe-row';

    const preview = document.createElement('img');
    preview.className = 'avatar-wardrobe-preview';
    preview.alt = '';
    preview.src = designToDataUrl(design, { shadow: true });

    const details = document.createElement('div');
    details.className = 'avatar-wardrobe-row-details';
    const name = document.createElement('strong');
    name.textContent = design.name;
    const meta = document.createElement('small');
    const badges: string[] = [];
    if (design.id === wornId) badges.push('wearing this');
    if (design.sharedOnCard) badges.push('shown on your player card');
    meta.textContent = badges.length > 0 ? badges.join(' · ') : 'yours alone';

    const share = document.createElement('label');
    share.className = 'avatar-wardrobe-share';
    const shareInput = document.createElement('input');
    shareInput.type = 'checkbox';
    shareInput.checked = design.sharedOnCard;
    shareInput.addEventListener('change', () => {
      setSharedOnCard(design.id, shareInput.checked);
      announce(
        shareInput.checked
          ? `“${design.name}” may appear on your player card.`
          : `“${design.name}” is private again.`,
      );
      render();
    });
    const shareText = document.createElement('span');
    shareText.textContent = 'Show on my player card';
    share.append(shareInput, shareText);

    details.append(name, meta, share);

    const actions = document.createElement('div');
    actions.className = 'avatar-wardrobe-row-actions';
    const act = (label: string, onClick: () => void) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', onClick);
      return button;
    };
    const wearButton = act(design.id === wornId ? 'Wearing' : 'Wear', () => {
      setWornId(design.id);
      options.onWear?.(design);
      announce(`Now wearing “${design.name}”.`);
      render();
    });
    if (design.id === wornId) wearButton.disabled = true;
    actions.append(
      wearButton,
      act('Rename', () => startRename(row, design)),
      act('Duplicate', () => {
        const copy = duplicateDesign(design.id);
        announce(copy
          ? `Saved a copy as “${copy.name}”. It starts private.`
          : 'Your wardrobe is stuffed — delete a look first.');
        render();
      }),
      act('Edit…', () => {
        if (!options.onEdit) return;
        close();
        options.onEdit(design);
      }),
      act('Delete', () => {
        if (!window.confirm(`Delete “${design.name}” from your wardrobe? This cannot be undone.`)) {
          return;
        }
        deleteDesign(design.id);
        announce(`Deleted “${design.name}”.`);
        render();
      }),
    );
    if (pendingSave) {
      actions.append(act('Replace with new look', () => {
        if (!pendingSave) return;
        if (!window.confirm(`Replace “${design.name}” with your new look? The old one is gone for good.`)) {
          return;
        }
        deleteDesign(design.id);
        const settled = pendingSave;
        settlePending(settled);
        announce(`Replaced “${design.name}” with “${settled.name}”.`);
        render();
      }));
    }
    details.append(actions);
    row.append(preview, details);
    return row;
  };

  /** Inline rename: the name becomes an input, Save/Cancel sit beside it. */
  const startRename = (row: HTMLElement, design: AvatarDesign) => {
    const details = row.querySelector<HTMLElement>('.avatar-wardrobe-row-details');
    const name = details?.querySelector<HTMLElement>('strong');
    if (!details || !name) return;
    const form = document.createElement('form');
    form.className = 'avatar-wardrobe-rename';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = design.name;
    input.maxLength = DESIGN_LIMITS.nameMaxLength;
    input.setAttribute('aria-label', `New name for ${design.name}`);
    const save = document.createElement('button');
    save.type = 'submit';
    save.textContent = 'Save name';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => render());
    form.append(input, save, cancel);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const updated = renameDesign(design.id, input.value);
      announce(updated ? `Renamed to “${updated.name}”.` : 'That look is no longer in your wardrobe.');
      render();
    });
    name.replaceWith(form);
    input.focus();
    input.select();
  };

  const render = () => {
    renderPending();
    const designs = listDesigns();
    const wornId = getWornId();
    const count = $('.avatar-wardrobe-count');
    count.textContent = designs.length === 0
      ? ''
      : `${designs.length} of ${DESIGN_LIMITS.wardrobeMax} looks saved`;

    const host = $('[data-role="list"]');
    if (designs.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'avatar-wardrobe-empty';
      empty.textContent = 'Nothing saved yet. Make a look in the studio — everything you save keeps a place here.';
      host.replaceChildren(empty);
      return;
    }
    const list = document.createElement('div');
    list.className = 'avatar-wardrobe-list';
    for (const design of designs) list.append(renderRow(design, wornId));
    host.replaceChildren(list);
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };

  /**
   * Keys aimed at nothing in particular must not reach the world's window
   * listener — same sealing as the studio (see editor.ts), minus the freeze:
   * this is a settings-family panel and the world may keep breathing.
   */
  const swallowStrayKeys = (event: KeyboardEvent) => {
    if (event.key === 'Escape') return;
    if (event.target instanceof Node && overlay.contains(event.target)) return;
    event.stopPropagation();
  };
  document.addEventListener('keydown', onKeydown, true);

  overlay.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).classList.contains('hud-overlay-close')) close();
  });
  for (const eventName of ['pointerdown', 'pointerup', 'wheel', 'click', 'contextmenu'] as const) {
    overlay.addEventListener(eventName, (event) => event.stopPropagation());
  }

  // The list is always the wardrobe as it is NOW: a save from the studio, an
  // autosave, or looks arriving from the account redraw it while it is open.
  // (Not mid-rename — redrawing would throw away what is being typed.)
  const stopListening = onWardrobeChange(() => {
    if (overlay.querySelector('.avatar-wardrobe-rename')) return;
    render();
  });

  document.body.appendChild(overlay);
  window.addEventListener('keydown', swallowStrayKeys, true);
  window.addEventListener('keyup', swallowStrayKeys, true);
  render();
}
