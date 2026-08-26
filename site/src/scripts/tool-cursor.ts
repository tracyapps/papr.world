/**
 * A tool trails the pointer around the page, and T swaps which one you are
 * holding — the same six verbs the game has.
 *
 * TO CHANGE THE TOOLS: edit the TOOLS array. Files live in
 * site/public/assets/tools/ and site/public/assets/scenery/.
 *
 * This is pure decoration: it is aria-hidden, it never intercepts a click,
 * and it does not appear at all for touch-only visitors (there is no pointer
 * to trail) or for anyone who asked for less motion.
 */

const TOOLS = [
  { src: '/assets/scenery/cursor-hand.svg',    name: 'an empty hand' },
  { src: '/assets/tools/kids-scissors.svg',    name: "kids' scissors" },
  { src: '/assets/tools/standard-hammer.svg',  name: 'a hammer' },
  { src: '/assets/tools/garden-hoe-alt.svg',   name: 'a garden hoe' },
  { src: '/assets/tools/flimsy-shovel.svg',    name: 'a flimsy shovel' },
  { src: '/assets/scenery/cursor-garden.svg',  name: 'a watering can' },
];

const host = document.querySelector<HTMLElement>('[data-tool]');
const image = host?.querySelector<HTMLImageElement>('[data-tool-img]');
const fine = window.matchMedia?.('(pointer: fine)').matches ?? false;
const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

if (host && image && fine && !calm) {
  const target = { x: -200, y: -200 };
  const at = { x: -200, y: -200 };
  let held = 0;

  window.addEventListener(
    'pointermove',
    (event) => {
      target.x = event.clientX;
      target.y = event.clientY;
      host.style.opacity = '1';
    },
    { passive: true },
  );

  // Follow at about a seventh of the distance per frame, so the tool swings
  // a little behind the cursor the way something held would.
  const follow = () => {
    at.x += (target.x - at.x) * 0.14;
    at.y += (target.y - at.y) * 0.14;

    const lag = target.x - at.x;
    host.style.setProperty('--tool-x', `${at.x.toFixed(1)}px`);
    host.style.setProperty('--tool-y', `${at.y.toFixed(1)}px`);
    // Swing the tool into the direction of travel.
    host.style.setProperty('--tool-r', `${(-14 + lag * 0.5).toFixed(1)}deg`);

    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);

  window.addEventListener('keydown', (event) => {
    if (event.key !== 't' && event.key !== 'T') return;
    // Never steal the key from someone typing a note.
    const el = event.target as HTMLElement | null;
    if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    if (el?.isContentEditable) return;

    held = (held + 1) % TOOLS.length;
    image.src = TOOLS[held].src;
  });
}
