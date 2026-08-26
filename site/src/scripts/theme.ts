/**
 * The day / night toggle.
 *
 * This script is deliberately small, because it is NOT what makes dark mode
 * work. The stylesheet already follows the visitor's system setting on its
 * own (see src/styles/_theme.scss). All this does is let someone override it
 * for this site, and remember that they did.
 *
 * If this file never loads, the site still respects the system theme.
 */

const STORAGE_KEY = 'papr-theme';

/** What the page is showing right now, whether chosen or inherited. */
function currentTheme(): 'light' | 'dark' {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'dark' || chosen === 'light') return chosen;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function apply(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private browsing, or storage switched off. The choice still holds for
    // this page; it just will not be remembered. That is an acceptable
    // outcome, not an error worth shouting about.
  }
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]')) {
  button.addEventListener('click', () => {
    apply(currentTheme() === 'dark' ? 'light' : 'dark');
  });
}

// Used by the konami easter egg, which turns the lights out when it fires.
export { apply as applyTheme };
