/**
 * Click a bare bit of paper and it keeps the crayon mark.
 *
 * ── The fix that matters ─────────────────────────────────────────────────
 * The first version of this put every mark into ONE layer stretched across
 * the whole page, sitting ABOVE the content. Scribble in the wrong spot and
 * you covered a paragraph with an opaque crayon line and could not read it
 * any more. A toy that can break the page is not a toy, it is a bug.
 *
 * Now each section owns a <div data-marks> pinned behind its own content
 * (z-index 0, with the text at z-index 1). A mark is added to whichever
 * section was clicked, so it lands ON the paper and UNDER the words — which
 * is what drawing on paper does. The marks are also drawn at partial opacity
 * with a multiply blend, so even directly behind text they read as a mark on
 * the sheet rather than a stripe through the letters.
 *
 * To let a new section take marks: add <div class="band__marks" data-marks>
 * as its first child. Nothing else.
 */

const CRAYONS = ['#b8402f', '#2f6fa8', '#3f8f45', '#c98a1b', '#8a5aa8', '#2f251d'];

/** Beyond this, the oldest mark is rubbed out to keep the page light. */
const MAX_MARKS = 44;

/** Clicking any of these is doing something else, not drawing. */
const INTERACTIVE = 'a, button, input, textarea, select, label, summary, form, nav, [role="button"]';

const marks: HTMLElement[] = [];
let next = 0;

document.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;

  const target = event.target as HTMLElement | null;
  if (!target || target.closest(INTERACTIVE)) return;

  // Which section was clicked? If it has no marks layer, this is not a
  // surface you can draw on, and nothing happens.
  const section = target.closest<HTMLElement>('section, footer, .hero');
  const host = section?.querySelector<HTMLElement>(':scope > [data-marks]');
  if (!host) return;

  // Place the mark where the click landed, relative to the layer itself, so
  // it stays put on the paper as the page scrolls.
  const box = host.getBoundingClientRect();
  const x = event.clientX - box.left;
  const y = event.clientY - box.top;

  const colour = CRAYONS[next % CRAYONS.length];
  next += 1;

  const mark = document.createElement('div');
  mark.className = 'crayon-mark';
  mark.style.left = `${x - 26}px`;
  mark.style.top = `${y - 20}px`;
  mark.style.setProperty('--turn', `${(Math.random() * 40 - 20).toFixed(1)}deg`);
  mark.innerHTML =
    '<svg width="52" height="40" viewBox="0 0 52 40" aria-hidden="true">' +
    `<path d="M4 30 C 12 8, 20 34, 28 12 S 42 30, 48 14" fill="none" stroke="${colour}" ` +
    'stroke-width="4.5" stroke-linecap="round" /></svg>';

  host.append(mark);
  marks.push(mark);

  if (marks.length > MAX_MARKS) marks.shift()?.remove();
});
