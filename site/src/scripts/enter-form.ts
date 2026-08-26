/**
 * The code box on /enter.
 *
 * Two jobs, both small:
 *   1. Tidy what is typed into WREN-42 shape as it is typed, and stamp
 *      APPROVED once it is the right shape. That is a shape check only — it
 *      says nothing about whether the code works, because only the server
 *      knows that, and pretending otherwise here would be a lie.
 *   2. Submit without leaving the page, so a wrong code does not cost a
 *      full reload.
 *
 * With JavaScript off, the form posts normally and api/enter.ts redirects
 * back with the reason. Nothing here is load-bearing.
 */

const form = document.querySelector<HTMLFormElement>('[data-enter-form]');
const input = document.querySelector<HTMLInputElement>('[data-code]');
const stamp = document.querySelector<HTMLElement>('[data-stamp]');
const status = document.querySelector<HTMLElement>('[data-enter-status]');

/** Same shape the game and lib/gate.ts accept: no I, no O, digits 2 to 9. */
const SHAPE = /^[A-HJ-NP-Z]{4}[2-9]{2}$/;

if (input) {
  // Focus it on arrival — this page exists to have a code typed into it.
  // preventScroll, so the page does not jump on a small screen.
  input.focus({ preventScroll: true });

  input.addEventListener('input', () => {
    const compact = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    input.value = compact.length > 4 ? `${compact.slice(0, 4)}-${compact.slice(4)}` : compact;

    const looksRight = SHAPE.test(compact);
    input.dataset.shape = looksRight ? 'ok' : 'no';
    if (stamp) stamp.hidden = !looksRight;
  });
}

if (form && status) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;

    status.dataset.state = 'trying';
    status.textContent = 'Checking…';

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: new FormData(form),
      });

      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        go?: string;
      };

      if (result.ok && result.go) {
        status.dataset.state = 'ok';
        status.textContent = 'Approved. Opening the door…';
        window.location.assign(result.go);
        return;
      }

      status.dataset.state = 'failed';
      status.textContent = result.message ?? 'That did not work. Try again?';
      if (button) button.disabled = false;
      input?.focus();
      input?.select();
    } catch {
      status.dataset.state = 'failed';
      status.textContent = 'Could not reach the door. Check your connection and try again.';
      if (button) button.disabled = false;
    }
  });
}
