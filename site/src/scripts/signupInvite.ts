const shell = document.querySelector<HTMLElement>('[data-signup-invite]');

if (shell) {
  const apiUrl = shell.dataset.apiUrl ?? '';
  const form = shell.querySelector<HTMLFormElement>('[data-signup-invite-form]');
  const result = shell.querySelector<HTMLElement>('[data-signup-invite-result]');
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  const token = new URLSearchParams(window.location.search).get('token') ?? '';

  if (token) window.history.replaceState(null, '', window.location.pathname);

  if (!token) {
    if (form) form.hidden = true;
    if (result) {
      result.textContent = 'This invitation is missing its private token. Ask your friend for a fresh link.';
      result.dataset.kind = 'error';
    }
  } else {
    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!result) return;
      submit?.setAttribute('disabled', '');
      result.textContent = 'Opening your invitation…';
      result.dataset.kind = 'info';
      try {
        const data = new FormData(form);
        const emailAddress = String(data.get('emailAddress') ?? '').trim().toLowerCase();
        const confirmation = String(data.get('confirmEmailAddress') ?? '').trim().toLowerCase();
        if (emailAddress !== confirmation) throw new Error('Those email addresses do not match.');
        const response = await fetch(`${apiUrl}/signup-invitations/redeem`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, emailAddress }),
        });
        const body = await response.json() as {
          error?: string;
          invitation?: { url?: string | null };
          fallback?: 'email' | null;
        };
        if (!response.ok) throw new Error(body.error || 'This invitation could not be opened.');
        if (body.invitation?.url) {
          window.location.assign(body.invitation.url);
          return;
        }
        form.hidden = true;
        result.textContent = 'Your invitation is ready. Check that email for the private signup button.';
      } catch (error) {
        result.textContent = error instanceof Error ? error.message : 'This invitation could not be opened.';
        result.dataset.kind = 'error';
        submit?.removeAttribute('disabled');
      }
    });
  }
}
