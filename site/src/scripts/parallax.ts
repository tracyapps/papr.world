/**
 * The gentle depth effect: scenery that drifts with the pointer and rises as
 * you scroll, so the layers feel like separate sheets of paper.
 *
 * ── How to use it from markup ────────────────────────────────────────────
 * Put these on any element:
 *   data-px="-30"   how far it slides sideways with the pointer (px at the
 *                   edge of the window). Negative moves against you, which
 *                   reads as "further away".
 *   data-py="52"    how far it rises as it passes through the viewport.
 *
 * Then in that element's CSS:
 *   transform: translate3d(var(--tx, 0px), var(--ty, 0px), 0);
 *
 * That is the whole contract. This file never touches anything else.
 */

const REDUCED = window.matchMedia?.('(prefers-reduced-motion: reduce)');

type Layer = { el: HTMLElement; fx: number; fy: number };

let layers: Layer[] = [];
let frame = 0;

// Where the pointer is, as -1 … 1 from the middle of the window.
const pointer = { x: 0, y: 0 };
// The value actually used, easing toward the pointer so nothing snaps.
const eased = { x: 0, y: 0 };

function collect() {
  layers = [...document.querySelectorAll<HTMLElement>('[data-px], [data-py]')].map((el) => ({
    el,
    fx: Number.parseFloat(el.dataset.px ?? '0') || 0,
    fy: Number.parseFloat(el.dataset.py ?? '0') || 0,
  }));
}

function tick() {
  const vh = window.innerHeight;

  // A sixteenth of the remaining distance each frame. Low enough that a fast
  // mouse flick becomes a slow drift rather than a lurch.
  eased.x += (pointer.x - eased.x) * 0.06;
  eased.y += (pointer.y - eased.y) * 0.06;

  for (const layer of layers) {
    if (layer.fy) {
      const box = layer.el.getBoundingClientRect();
      // -1 when the element is below the fold, +1 when it is above it.
      const through = (vh / 2 - (box.top + box.height / 2)) / vh;
      layer.el.style.setProperty('--ty', `${(through * layer.fy).toFixed(2)}px`);
    }
    if (layer.fx) {
      layer.el.style.setProperty('--tx', `${(eased.x * layer.fx).toFixed(2)}px`);
    }
  }

  frame = requestAnimationFrame(tick);
}

function start() {
  collect();
  if (layers.length === 0) return;

  window.addEventListener('resize', collect, { passive: true });
  window.addEventListener(
    'pointermove',
    (event) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (event.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true },
  );

  frame = requestAnimationFrame(tick);
}

function stop() {
  cancelAnimationFrame(frame);
  // Put every layer back where it belongs, or they freeze mid-drift.
  for (const layer of layers) {
    layer.el.style.removeProperty('--tx');
    layer.el.style.removeProperty('--ty');
  }
}

if (!REDUCED?.matches) start();

// Someone can change their mind about motion while the page is open.
REDUCED?.addEventListener('change', (event) => (event.matches ? stop() : start()));
