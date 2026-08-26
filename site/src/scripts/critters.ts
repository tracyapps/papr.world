/**
 * Befriending the hidden critters, and the footer tally that counts them.
 *
 * The count is remembered across pages, because the critters are hidden on
 * different pages — a tally that reset every time you navigated would make
 * the hunt impossible to finish.
 *
 * The total comes from src/data/critters.ts via the footer markup, so it can
 * never claim five and hide two the way the first draft did.
 */

const STORAGE_KEY = 'papr-friends';

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function save(friends: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...friends]));
  } catch {
    /* Not being remembered is a small loss; not crashing matters more. */
  }
}

const friends = load();

function updateTally() {
  const words = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
  const n = friends.size;
  const text = n === 0 ? 'None befriended yet' : `${words[n] ?? n} befriended`;
  for (const el of document.querySelectorAll('[data-critter-tally]')) el.textContent = text;
}

function befriend(button: HTMLButtonElement) {
  const id = button.dataset.critter;
  if (!id || friends.has(id)) return;

  friends.add(id);
  save(friends);

  button.setAttribute('aria-pressed', 'true');

  // Replace the "say hello?" prompt with the "this one is yours now" text, so
  // a screen reader user gets the same payoff a sighted one does.
  const name = button.querySelector('.critter__name');
  if (name && button.dataset.foundLabel) name.textContent = button.dataset.foundLabel;

  // A little heart, purely visual.
  const heart = document.createElement('span');
  heart.className = 'critter__heart';
  heart.textContent = '♥';
  heart.setAttribute('aria-hidden', 'true');
  button.append(heart);

  updateTally();
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-critter]')) {
  // Restore the ones already found on a previous visit.
  const id = button.dataset.critter;
  if (id && friends.has(id)) {
    button.setAttribute('aria-pressed', 'true');
    const name = button.querySelector('.critter__name');
    if (name && button.dataset.foundLabel) name.textContent = button.dataset.foundLabel;
  }

  button.addEventListener('click', () => befriend(button));
}

updateTally();
