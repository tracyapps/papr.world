/**
 * POST /api/note - the "slip a note under the door" form.
 *
 * Takes what somebody wrote on the homepage and emails it to you. No
 * database, no newsletter platform, no third party holding your signups.
 *
 * ── Environment variables (Vercel project settings) ──────────────────────
 *   RESEND_API_KEY   From resend.com. The free tier is 3,000 emails a month,
 *                    which is a great many notes.
 *   NOTE_TO          Where notes land.        e.g. hello@papr.world
 *   NOTE_FROM        A verified sender on a domain you own in Resend.
 *                    e.g. notes@papr.world
 *
 * With RESEND_API_KEY unset the endpoint still accepts and validates the
 * note, logs it, and answers politely - so the form is never broken on a
 * preview deploy or a fresh fork. It just is not delivered anywhere.
 */

export const config = { runtime: 'edge' };

/** Nobody needs to write more than this, and a bot would like to. */
const LIMITS = { name: 60, email: 200, note: 4000, reasons: 8 };

/** Strip control characters by code point and clamp the length. */
function tidy(raw: FormDataEntryValue | null, max: number): string {
  if (typeof raw !== 'string') return '';

  let out = '';
  for (const character of raw) {
    const point = character.codePointAt(0) ?? 0;
    // Tab, newline and carriage return are allowed through; nothing else below space is.
    if (point < 0x20 && point !== 0x09 && point !== 0x0a && point !== 0x0d) continue;
    if (point === 0x7f) continue;
    out += character;
  }

  return out.trim().slice(0, max);
}

function looksLikeEmail(value: string): boolean {
  // Deliberately loose. The only real test of an address is sending to it,
  // and a strict pattern here would reject somebody's perfectly good address.
  return value === '' || /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value);
}

function reply(ok: boolean, status: number, message: string, json: boolean, request: Request): Response {
  if (json) {
    return new Response(JSON.stringify({ ok, message }), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  // No JavaScript: land back on the homepage with the outcome in the URL, so
  // the page can say what happened instead of showing a blank JSON body.
  const back = new URL('/', request.url);
  back.searchParams.set(ok ? 'posted' : 'problem', message);
  back.hash = 'note';
  return new Response(null, { status: 303, headers: { location: back.toString() } });
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response('Post a note here.', { status: 405, headers: { allow: 'POST' } });
  }

  const json = (request.headers.get('accept') ?? '').includes('application/json');
  const form = await request.formData();

  // The honeypot. A real visitor never sees this field, so anything in it is
  // a robot. Answer as though it worked - telling a bot it failed only
  // teaches whoever wrote it to try again differently.
  if (tidy(form.get('fold'), 20) !== '') {
    return reply(true, 200, 'Folded and posted.', json, request);
  }

  const name = tidy(form.get('name'), LIMITS.name);
  const email = tidy(form.get('email'), LIMITS.email);
  const note = tidy(form.get('note'), LIMITS.note);
  const reasons = form
    .getAll('reason')
    .map((value) => tidy(value, 80))
    .filter(Boolean)
    .slice(0, LIMITS.reasons);

  if (!note && reasons.length === 0) {
    return reply(false, 400, 'Tick something or write something, and it will go.', json, request);
  }

  if (!looksLikeEmail(email)) {
    return reply(false, 400, 'That email address has a typo in it, I think.', json, request);
  }

  const env = process.env as Record<string, string | undefined>;
  const apiKey = env.RESEND_API_KEY;
  const to = env.NOTE_TO;
  const from = env.NOTE_FROM;

  const body = [
    reasons.length ? `Reasons: ${reasons.join(', ')}` : 'Reasons: (none ticked)',
    `Name: ${name || '(not given)'}`,
    `Email: ${email || '(not given)'}`,
    '',
    note || '(no note written)',
  ].join('\n');

  if (!apiKey || !to || !from) {
    // Not configured. Accept it rather than losing it silently or showing a
    // stranger an error that is really about our own settings.
    console.log('[note] delivery not configured, note not sent:\n' + body);
    return reply(true, 200, 'Folded and posted.', json, request);
  }

  try {
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `papr.world note${name ? ` from ${name}` : ''}`,
        text: body,
        // So hitting reply in your mail client goes to them, not to yourself.
        ...(email ? { reply_to: email } : {}),
      }),
    });

    if (!sent.ok) {
      console.error('[note] resend refused it:', sent.status, await sent.text());
      return reply(false, 502, 'The postbox is jammed. Try again in a minute?', json, request);
    }
  } catch (error) {
    console.error('[note] could not reach resend:', error);
    return reply(false, 502, 'The postbox is jammed. Try again in a minute?', json, request);
  }

  return reply(true, 200, 'Folded and posted.', json, request);
}
