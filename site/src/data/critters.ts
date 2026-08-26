/**
 * The hidden critters, and the single source of truth for how many there are.
 *
 * The footer used to promise five and hide two, because the promise was typed
 * into the markup by hand. Now the footer counts this array, so the sentence
 * cannot be wrong: add one here and the footer says six on its own.
 *
 * `where` is only documentation for you — it is the page each one is placed
 * on. Placing one is a single <Critter id="…" /> in that page's markup.
 */
export type Critter = {
  id: string;
  /** Read out to a screen reader before it has been found. */
  hint: string;
  /** Read out once it has. */
  found: string;
  where: string;
};

export const CRITTERS: Critter[] = [
  {
    id: 'pond-snail',
    hint: 'Something small is moving near the grass. Say hello?',
    found: 'The pond snail is your friend now.',
    where: 'home — the hero',
  },
  {
    id: 'footer-moth',
    hint: 'Something flickered at the bottom of the page. Say hello?',
    found: 'The paper moth is your friend now.',
    where: 'the footer, so it is on every page',
  },
  {
    id: 'stock-mouse',
    hint: 'Something is behind the stack of paper. Say hello?',
    found: 'The mouse in the paper stock is your friend now.',
    where: '/world — the materials row',
  },
  {
    id: 'thread-spider',
    hint: 'Something is holding onto a loose thread. Say hello?',
    found: 'The thread spider is your friend now.',
    where: '/together — beside the chat card',
  },
  {
    id: 'trail-beetle',
    hint: 'Something is walking along the dotted trail. Say hello?',
    found: 'The trail beetle is your friend now.',
    where: '/roadmap — on the path',
  },
];

/** Five, until the day it isn't. */
export const CRITTER_COUNT = CRITTERS.length;

/** "five" reads better than "5" in a sentence. */
export const spellOut = (n: number): string =>
  ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] ??
  String(n);
