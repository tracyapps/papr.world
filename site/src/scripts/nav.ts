/**
 * Marks the page as scrolled, so the fixed navigation can lay a soft paper
 * scrim behind itself.
 *
 * The bar floats over the scenery at the top of every page, which is the
 * point of it — but once you scroll into the body text, paragraphs slide
 * underneath the nav slabs and become hard to read exactly where they meet.
 * The scrim fades that collision out.
 *
 * Without this script there is simply no scrim, which is where the site
 * started. Nothing depends on it.
 */

const MARK_AFTER = 40;

let marked = false;

function check() {
  const scrolled = window.scrollY > MARK_AFTER;
  if (scrolled === marked) return;
  marked = scrolled;
  document.body.toggleAttribute('data-scrolled', scrolled);
}

check();
window.addEventListener('scroll', check, { passive: true });
