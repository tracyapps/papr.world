// Somebody is at your door. A small card, not a dialog: it never takes focus,
// never blocks the game, and lapses quietly after a few minutes if nobody
// answers. The same sentence is announced by the polite live toast
// (`guests.ts`), and the same two buttons are in the home panel, so nothing
// depends on noticing a card in the corner.

import { answerKnock, getKnocks, pruneKnocks, subscribeGuests } from './guests';
import { showPetToast } from './petting';

let host: HTMLElement | null = null;
let renderedKey = '';

function render() {
  if (!host) return;
  const knocks = getKnocks();
  const key = knocks.map((knock) => `${knock.visitor}:${knock.name}`).join('|');
  if (key === renderedKey) return;
  renderedKey = key;
  const focused = document.activeElement instanceof HTMLElement && host.contains(document.activeElement)
    ? { visitor: document.activeElement.dataset.knockVisitor, admit: document.activeElement.dataset.knockAdmit }
    : null;
  host.hidden = knocks.length === 0;
  host.replaceChildren(...knocks.map((knock) => {
    const card = document.createElement('div');
    card.className = 'knock-notice';
    const words = document.createElement('p');
    words.textContent = `${knock.name} is at your door.`;
    const actions = document.createElement('div');
    actions.className = 'knock-notice-actions';
    for (const admit of [true, false]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.knockVisitor = knock.visitor;
      button.dataset.knockAdmit = String(admit);
      button.textContent = admit ? 'Let in' : 'Not right now';
      if (!admit) button.classList.add('is-quiet');
      actions.append(button);
    }
    card.append(words, actions);
    return card;
  }));
  if (focused?.visitor) {
    host.querySelector<HTMLElement>(
      `[data-knock-visitor="${CSS.escape(focused.visitor)}"][data-knock-admit="${focused.admit}"]`,
    )?.focus();
  }
}

export function initializeKnockNotices() {
  host = document.createElement('section');
  host.className = 'knock-notices';
  host.setAttribute('aria-label', 'Knocks at your door');
  host.hidden = true;
  document.body.append(host);
  for (const eventName of ['pointerdown', 'pointerup', 'wheel'] as const) {
    host.addEventListener(eventName, (event) => event.stopPropagation());
  }
  host.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') event.stopPropagation();
  });
  host.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-knock-visitor]');
    if (!button?.dataset.knockVisitor) return;
    const admit = button.dataset.knockAdmit === 'true';
    const name = getKnocks().find((knock) => knock.visitor === button.dataset.knockVisitor)?.name ?? 'They';
    answerKnock(button.dataset.knockVisitor, admit);
    showPetToast(admit ? `You let ${name} in. They can come in whenever they like.` : `You told ${name} not right now.`);
  });
  subscribeGuests(render);
  window.setInterval(() => pruneKnocks(), 1000);
  render();
}
