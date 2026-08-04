import { SEED_DEFS } from '../sim/catalogs/seeds';
import { plantName, selectedSeed, type GardenAction } from '../game/gardenActions';
import { getToastStack } from './hudLayout';

// The card that explains why a garden action was refused.
//
// A one-line toast ("needs more room") tells a player they were wrong without
// telling them what right looks like. These refusals are all *numeric* — a
// required distance versus an actual one, a fill cost versus soil on hand —
// so the card states the requirement and the current value side by side. The
// player can then work out the fix themselves instead of guessing.

let card: HTMLElement | null = null;
let hideTimer: number | undefined;

type CardContent = {
  title: string;
  body: string;
  /** Optional requirement/actual pairs rendered as a small table. */
  facts?: Array<[string, string]>;
};

function describe(action: GardenAction): CardContent | null {
  const blocker = action.blocker;
  if (!blocker) return null;

  switch (blocker.kind) {
    case 'crowded': {
      const seedId = selectedSeed();
      const name = seedId ? plantName(seedId) : 'This plant';
      return {
        title: `${name} needs more room`,
        body: `A ${plantName(blocker.by)} is already growing nearby. Move further out, or lift the neighbour first.`,
        facts: [
          ['Space needed', `${blocker.required.toFixed(2)} paces`],
          ['Space here', `${blocker.distance.toFixed(2)} paces`],
        ],
      };
    }

    case 'needs-fill':
      return {
        title: 'Not enough soil to fill this in',
        body: 'Deeper holes need paper soil to fill. Dig somewhere else to gather more, then come back.',
        facts: [
          ['Soil needed', `${blocker.required}`],
          ['Soil on hand', `${blocker.available}`],
        ],
      };

    case 'no-bed':
      return {
        title: 'Nothing to work here',
        body: 'The hoe sows, lifts, and rakes — but it needs a bed the shovel has already opened.',
      };

    case 'out-of-reach':
      return {
        title: 'Too far to reach',
        body: 'Step a little closer to work this patch.',
      };

    case 'no-tool':
      return {
        title: 'You need a hoe for that',
        body: 'Make a Creased Hoe at the Thing Maker to sow, lift, and fill.',
      };

    case 'no-seed':
      return {
        title: 'No seeds chosen',
        body: 'Pick a seed in the scrapbook to sow, or leave your hands empty to rake the hole closed.',
      };

    case 'occupied':
      return {
        title: `A ${plantName(blocker.by)} is already here`,
        body: 'Lift it out first if you want to use this bed for something else.',
      };

    default:
      return null;
  }
}

function ensureCard(): HTMLElement {
  if (card) return card;
  card = document.createElement('div');
  card.className = 'garden-hint';
  // assertive, not polite: this is direct feedback on an action the player
  // just took, and a polite region would queue behind ambient world chatter.
  card.setAttribute('role', 'alert');
  getToastStack().append(card);
  return card;
}

export function showGardenRefusal(action: GardenAction) {
  const content = describe(action);
  if (!content) return;

  const element = ensureCard();
  element.innerHTML = `
    <strong class="garden-hint-title">${content.title}</strong>
    <span class="garden-hint-body">${content.body}</span>
    ${content.facts ? `
      <dl class="garden-hint-facts">
        ${content.facts.map(([label, value]) => `
          <div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}
      </dl>` : ''}`;
  element.classList.add('is-visible');
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => element.classList.remove('is-visible'), 5200);
}

export function hideGardenHint() {
  window.clearTimeout(hideTimer);
  card?.classList.remove('is-visible');
}

/** Spacing requirement of the held seed, for the preview ring. */
export function heldSeedSpacing(): number | null {
  const seedId = selectedSeed();
  return seedId ? SEED_DEFS[seedId].spacing : null;
}
