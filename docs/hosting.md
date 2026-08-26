# Hosting papr.world

Two halves, two hosts, and they only meet over `https://` and `wss://`.

| | Where | What it is |
| --- | --- | --- |
| **Site + game** | Vercel | Static. The marketing site, `/play`, `/reference`, and two edge functions (the alpha door and the contact form). |
| **Neighborhood server** | Railway | A long-lived Node process holding WebSocket connections and the authoritative world. |

The server **cannot** be a Vercel function. It holds open sockets and owns
state; serverless has neither. That split is the whole reason there are two
hosts, and it is not going to change.

---

## Do this in order

The order matters. Two steps depend on something that does not exist until an
earlier step has run, and doing them out of order is the most likely way to
end up staring at a working server that refuses to let you in.

### 1. Deploy the server to Railway

Point a Railway service at this repository. `railway.json` and `Dockerfile`
are committed, so it should need no dashboard configuration to build — it will
find the Dockerfile, build from the repository root, and health-check
`/health`.

**Attach a volume mounted at `/data` before you deploy a second time.**
Everything durable lives there: neighborhood saves, paper passports, the
feedback queue, the moderation queue, block lists. Without a volume, every
redeploy is an amnesia event and your testers lose the things they built. The
`Dockerfile` already sets `PP_DATA_DIR=/data`, so mounting the volume there is
the only step.

Leave `PAPR_OWNER_ACCOUNT` unset for now. You cannot fill it in yet.

### 2. Give the server its settings

In the Railway service, set:

| Variable | Value | Why |
| --- | --- | --- |
| `PP_CORS_ORIGIN` | `https://papr.world` | The exact site origin, no trailing slash. Leaving it unset means "any origin", which is fine locally and wrong in public. |
| `PP_REVIEWER_TOKEN` | `openssl rand -base64 32` | Opens the **feedback** desk at `?review=1`. |
| `PP_MODERATION_TOKEN` | a *different* `openssl rand -base64 32` | Opens the **safety report** queue. Deliberately not the same token — see "Two tokens" below. |

`PORT` is injected by Railway; don't set it.

Redeploy. Then read the deploy log — the server states its own safety posture
on every boot, and one of those lines should still be a warning:

```
removal: DISABLED — PAPR_OWNER_ACCOUNT is unset, nobody can remove anyone, guests allowed
safety reports: queued, /review/reports needs PP_MODERATION_TOKEN
CORS: pinned to https://papr.world
```

### 3. Point the site at the server

Copy the Railway public domain. In the **Vercel** project, for Production
**and** Preview:

| Variable | Value |
| --- | --- |
| `VITE_SHARED_WS_ENDPOINT` | `wss://your-service.up.railway.app` |
| `VITE_FEEDBACK_HTTP_ENDPOINT` | `https://your-service.up.railway.app` |

These are **build-time** variables. Vite bakes them into the bundle, so
setting them does nothing until you **redeploy**. That is the single most
common way to end up with a game that stubbornly talks to `localhost:2567`
in production.

### 4. Set the alpha door

Still on Vercel:

| Variable | Value |
| --- | --- |
| `PAPR_ALPHA_CODES` | `WREN-42,FERN-73` — the codes that work, comma separated |
| `PAPR_ALPHA_SECRET` | `openssl rand -base64 48` |

Codes are four letters and two digits, and the alphabet deliberately excludes
**I**, **O**, **0** and **1** so a code read aloud has one spelling. A code
containing any of them is silently not a code — `FERN-19` will never work.

**An empty or unset `PAPR_ALPHA_CODES` means the door is open.** That default
keeps a fresh clone and `vercel dev` working, and it means the gate never
switches itself on by accident. It also means the alpha is not invite-only
until you set it.

### 5. Mint your owner passport — from your own browser

The owner is identified by a **paper passport**, and the one that matters is
the passport in the browser you will actually play in.

**This step depends on step 3 having worked.** The passport is minted by the
game on first shared play, against the server address baked in at build time.
If step 3 is wrong or was not redeployed, no passport is ever created — and
the symptom is a console error saying `undefined is not valid JSON`, because
there is nothing in storage to read.

1. Open `https://papr.world/enter/`, put in one of your codes, and go in.
2. Look at the devtools console. On success the game prints it for you:

   ```
   papr.world paper passport: b7ffe9c4-9c86-4d37-9102-735e24fc9852
   ```

   Or read it yourself:

   ```js
   JSON.parse(localStorage['pp.passport.v1']).id
   ```

3. Put that id in Railway as `PAPR_OWNER_ACCOUNT` and redeploy.

**If no passport appears**, the game will now tell you why in the chat panel
and the console — it names the address it tried and what went wrong. See
"When the neighborhood will not open" below.

Never copy the `secret` anywhere. It is that browser's credential, it is not
recoverable, and the server only ever stores a hash of it.

The deploy log should now read:

```
removal: enabled — owner account b7ffe9c4…, guests refused
```

"Guests refused" is deliberate and arrives with the owner setting. A guest's
identity is `guest:<sessionId>`, new on every connection — so a guest cannot
be meaningfully removed, banned or blocked. Allowing them would make all three
controls a lie. The real client always carries a passport, so nobody notices.

### 6. Send the notes somewhere (optional, but the form is on the homepage)

On Vercel: `RESEND_API_KEY`, `NOTE_TO`, `NOTE_FROM`. Unset means the contact
form still accepts and validates notes and logs them — it just does not
deliver them. See `site/README.md`.

---

## The hosted smoke test

Do all of this against the **real** deployment, in two different browsers (or
one plus a private window — two tabs of the same browser share a passport and
will look like one person).

- [ ] `https://your-service.up.railway.app/health` returns `ok`
- [ ] `papr.world/play` **redirects to `/enter`** in a browser that has never
      been through the door. If it serves the game, the gate is not on.
- [ ] A valid code gets you in; a wrong code says so and does not.
- [ ] Two browsers with the **same** code see each other move and chat.
- [ ] Two browsers with **different** codes cannot see each other at all.
- [ ] Place something, then **restart the Railway service**. It is still there.
      (This is the one that proves the volume is mounted.)
- [ ] Block someone from the ⋯ menu on one of their messages. They keep
      talking; you stop seeing it. Reload — still blocked.
- [ ] Report a message. `GET /review/reports` with your moderation token shows
      it, with the exact message text attached.
- [ ] From the owner browser, remove the other person. They are told why and
      disconnected. With "refuse this code", the same code will not let them
      back in — even after the room empties and reopens.
- [ ] Send feedback from the in-game Settings menu; check `?review=1`.

---

## When the neighborhood will not open

The message names the server it tried. Match it to one of these.

**"does not know where the neighborhood server is … falling back to
ws://localhost:2567"** — `VITE_SHARED_WS_ENDPOINT` is missing from the build.
Either it is not set, or it was set *after* the last deploy. It is a
**build-time** variable: Vite bakes it into the bundle, so saving it in the
Vercel dashboard changes nothing until you redeploy. This is the most common
one by a wide margin.

**"cannot open an insecure ws:// connection"** — the address is `ws://` but
the page is `https://`. Browsers refuse that. Use `wss://`.

**"must start with ws:// or wss://"** — an `https://` address was pasted into
`VITE_SHARED_WS_ENDPOINT`. That variable wants the WebSocket scheme;
`VITE_FEEDBACK_HTTP_ENDPOINT` is the one that wants `https://`.

**"Could not reach the paper-passport service at …"** — the address is
well-formed but nothing answered. Either the Railway service is down (check
`/health`) or the browser blocked the request, which is nearly always CORS:
`PP_CORS_ORIGIN` on Railway must exactly match the site origin, with no
trailing slash.

**"answered 403"** on joining — the code is not in `PAPR_ALPHA_CODES`, or that
account is banned from that neighbourhood.

You can also test a server without redeploying anything by appending
`&server=wss://your-service.up.railway.app` to the `/play` URL. That override
beats the baked-in value and is the quickest way to tell a bad build variable
apart from a bad server.

### The shortcut, if you just need to get past step 5

If Railway is up but the site build is still pointing somewhere wrong, you can
mint the passport directly and plant it in the browser:

```bash
curl -X POST https://your-service.up.railway.app/account \
  -H 'content-type: application/json' -d '{"name":"tapps"}'
```

Then in the devtools console **on papr.world**:

```js
localStorage['pp.passport.v1'] = JSON.stringify({
  id: 'THE_accountId_FROM_ABOVE',
  secret: 'THE_secret_FROM_ABOVE',
  createdAt: Date.now(),
});
```

That is the same shape the game writes. Use the `id` for
`PAPR_OWNER_ACCOUNT`. It unblocks the owner setup, but it does not fix the
build variable — the game still will not connect until step 3 is right.

---

## Things that will bite

**Two tokens, on purpose.** `PP_REVIEWER_TOKEN` opens product feedback;
`PP_MODERATION_TOKEN` opens safety reports. They are separate so you can hand
somebody bug triage without also handing them "who reported whom". Neither
queue ever appears in the other's export.

**The volume, again.** It is worth checking twice. A Railway service without a
mounted volume looks completely healthy and quietly discards the world on
every deploy.

**One replica.** The JSON stores are single-writer by design. Scaling to two
instances will corrupt saves. If you outgrow one process, that is a real
piece of work, not a slider.

**Back up before a protocol change.** `PROTOCOL_VERSION` is 4. Bumping it
refuses older clients on purpose — but download `/data` first if a save-shape
change is involved.

**Secrets stay on Railway.** `PP_MODERATION_TOKEN` and `PP_REVIEWER_TOKEN`
never go in Vercel, in a URL, in the repository, or in a tester invitation.
Reviewers paste them at the client URL with `?review=1`; the browser keeps
them in that tab's session storage only.

---

## Costs, as of writing

- **Vercel Hobby** — free for personal, non-commercial use. Move to Pro if
  this becomes commercial.
- **Railway Hobby** — $5/month minimum, and the $5 counts toward usage. It
  buys the always-on process, public WebSockets, and the persistent volume.

**Colyseus Cloud** (from about $15/month) is the managed alternative and
becomes attractive when avoiding server operations is worth more than the
difference. It would want this bootstrap adopting its `defineServer()` shape
first. **Render** handles WebSockets well but its free tier spins down and
cannot attach the disk this needs.

---

## Running it locally

```bash
npm --prefix server install
npm --prefix server run dev     # ws://localhost:2567
npm run dev                     # the game, on :5173
```

Then open the game with `?shared=1&invite=PAPR-22&intent=create`. With no
`PAPR_OWNER_ACCOUNT` set, nobody is owner and guests are welcome — which is
what you want for a quick two-tab dogfood and exactly what you do not want in
public.

To exercise removal locally, set `PAPR_OWNER_ACCOUNT` to the passport id from
your own browser, the same way step 5 does.
