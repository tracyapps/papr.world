/**
 * Submits the "slip a note under the door" form without losing the page.
 *
 * This is an ENHANCEMENT, not the mechanism. The form has a real method and
 * action, so with JavaScript switched off it posts normally and the server
 * sends back a thank-you page. All this does is intercept that, post the same
 * data in the background, and write the outcome into the receipt line.
 */

const form = document.querySelector<HTMLFormElement>('[data-note-form]');
const receipt = document.querySelector<HTMLElement>('[data-note-receipt]');

if (form && receipt) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;

    receipt.dataset.state = 'sending';
    receipt.textContent = 'Folding…';

    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: new FormData(form),
      });

      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; message?: string };

      if (!response.ok || !result.ok) throw new Error(result.message ?? 'That did not go through.');

      const picked = [...form.querySelectorAll<HTMLInputElement>('input[name="reason"]:checked')]
        .map((input) => input.value.toLowerCase());

      receipt.dataset.state = 'sent';
      receipt.textContent = picked.length
        ? `Folded and posted. We wrote down: ${picked.join(', ')}.`
        : 'Folded and posted. You told us nothing, which is also a kind of note.';

      form.reset();
    } catch (error) {
      // Never swallow it silently — the visitor needs to know their note did
      // not arrive, and needs a way to still reach a person.
      receipt.dataset.state = 'failed';
      receipt.textContent =
        `${error instanceof Error ? error.message : 'Something tore.'} ` +
        'Nothing was sent — try again, or write to hello@papr.world.';
      if (button) button.disabled = false;
    }
  });
}
