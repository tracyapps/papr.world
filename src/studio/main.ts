// The avatar studio, on its own page — reachable from My desk without
// entering any world.
//
// Same studio, same wardrobe, same autosave as in the game; the only
// difference is that there is no avatar plane to wear things on, so "wear"
// here just marks which look you will arrive in next time. Signed in, every
// look also syncs to the account (src/net/accountWardrobe.ts), which is what
// lets a look made here show up in any world, on any computer.

import '../styles.css';
import { openAvatarEditor } from '../ui/avatarEditor/editor';
import { designToDataUrl } from '../ui/avatarEditor/render';
import { openWardrobePanel } from '../ui/avatarEditor/wardrobePanel';
import {
  getWornId,
  listDesigns,
  onWardrobeChange,
  saveDesign,
  setWornId,
} from '../ui/avatarEditor/wardrobe';
import {
  flushWardrobeSync,
  startAccountWardrobeSync,
  subscribeWardrobeSync,
} from '../net/accountWardrobe';
import type { AvatarDesign } from '../../shared/src/index';

const root = document.getElementById('studio-page');
if (!root) throw new Error('studio page: missing #studio-page');

const $ = <T extends HTMLElement>(selector: string): T => {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`studio page: missing ${selector}`);
  return el;
};

const syncNote = $('[data-role="sync"]');
const looks = $<HTMLUListElement>('[data-role="looks"]');

subscribeWardrobeSync((status) => {
  syncNote.textContent = status.message;
  syncNote.dataset.state = status.state;
});

const wear = (design: AvatarDesign) => {
  setWornId(design.id);
  render();
  syncNote.textContent = `You will arrive as “${design.name}” next time you enter a world.`;
};

const edit = (design?: AvatarDesign) => {
  openAvatarEditor({
    initial: design,
    onSave: ({ design: saved }) => {
      if (!saveDesign(saved)) {
        openWardrobePanel({ pendingSave: saved, onWear: wear });
      } else {
        wear(saved);
      }
      flushWardrobeSync();
    },
    onCancel: () => {
      render();
      flushWardrobeSync();
    },
  });
};

function render(): void {
  const designs = listDesigns();
  const wornId = getWornId();
  looks.replaceChildren();
  if (designs.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'studio-page-empty';
    empty.textContent = 'No looks yet. Make your first one!';
    looks.append(empty);
    return;
  }
  for (const design of designs) {
    const item = document.createElement('li');
    item.className = 'studio-page-look';
    const preview = document.createElement('img');
    preview.alt = '';
    preview.src = designToDataUrl(design, { shadow: true });
    const name = document.createElement('p');
    name.className = 'studio-page-look-name';
    name.textContent = design.name;
    const row = document.createElement('div');
    row.className = 'studio-page-look-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Edit';
    editButton.setAttribute('aria-label', `Edit ${design.name}`);
    editButton.addEventListener('click', () => edit(design));
    row.append(editButton);
    if (design.id === wornId) {
      const badge = document.createElement('span');
      badge.className = 'studio-page-wearing';
      badge.textContent = 'Wearing';
      row.append(badge);
    } else {
      const wearButton = document.createElement('button');
      wearButton.type = 'button';
      wearButton.textContent = 'Wear';
      wearButton.setAttribute('aria-label', `Wear ${design.name}`);
      wearButton.addEventListener('click', () => wear(design));
      row.append(wearButton);
    }
    item.append(preview, name, row);
    looks.append(item);
  }
}

$('[data-action="new"]').addEventListener('click', () => edit());
$('[data-action="wardrobe"]').addEventListener('click', () => {
  openWardrobePanel({ onWear: wear, onEdit: (design) => edit(design) });
});

// Anything that changes the wardrobe — the studio's autosave, the wardrobe
// panel, or a pull from the account — redraws the list.
onWardrobeChange(() => render());
render();
void startAccountWardrobeSync({ onPulled: render }).then(render);
