# Subagent C4 — profile editor on the account desk

Round 2. Owned files only:
- `site/src/pages/account.astro` (markup + page styles)
- `site/src/scripts/account.ts` (behaviour)
- `site/src/styles/*` — **not touched**; the page already carries its own scoped
  `lang="scss"` block and the new controls live there, so no global stylesheet
  rule was needed.

`git status --short` restricted to `site/src` shows exactly those two files
modified (`444 insertions(+), 0 deletions`). Nothing in `shared/**`, `server/**`
or `src/**` was read-for-edit or changed.

---

## 1. What was added, and where

A new full-width **"Your profile"** paper card on the signed-in desk, placed
between the `identity-card` ("Welcome back…") and the `desk-grid`, inside the
existing `[data-account-claimed]` block. Same `paper-card` / `label` / `h2`
shell as its neighbours, so it reads as one more sheet on the desk.

Card structure (in `account.astro`):

- `<section class="paper-card profile-card">` — label "How you are seen",
  heading "Your profile".
- `<p data-profile-status role="status" aria-live="polite">` — the load/fallback
  line (starts "Opening your profile…").
- `<form data-profile-form hidden>` — the editor itself:
  - **Bio** — `<label for="profile-bio">A little about you</label>`, a
    `<textarea id="profile-bio" maxlength="280" data-profile-bio>`, a live count
    `<span data-profile-bio-count>` in `N / 280 characters`, help text wired via
    `aria-describedby="profile-bio-help profile-bio-count"`.
  - **Bio audience** — `<fieldset class="profile__audience"><legend>Who can see
    your bio</legend>` with three radios (`name="profile-visibility-bio"`),
    each an `Everyone` / `Friends` / `Friends of friends` choice carrying its own
    one-sentence note.
  - **Links** — `<h3>Links</h3>`, `<div data-profile-links>`, and an
    `<button data-profile-add-link>`.
  - **Links audience** — same fieldset shape, radios
    `name="profile-visibility-links"`.
  - **Disclosure** — `<p class="profile__disclosure">`.
  - **Save** — `<button data-profile-save>` + `<p data-profile-note role="status"
    aria-live="polite">`.
- Each link row is built at runtime (`appendLinkRow`): a visually-hidden
  `<label>` + `<select data-link-kind>` (the seven `SOCIAL_LINK_KINDS`), a
  visually-hidden `<label>` + `<input type="url" data-link-url maxlength="200">`,
  and a `Remove` button (`aria-label="Remove this link"`). Rows are appended up
  to `socialLinksMax`; the add button disables and re-labels itself at the cap
  ("All 6 links added").

Every control is keyboard reachable and natively labelled; the two JS-built
controls use `<label class="visually-hidden">` bound by `for`/`id`. Focus uses
the site's existing global `:focus-visible` ring. Live regions reuse the desk's
`role="status" aria-live="polite"` convention.

---

## 2. Copy (verbatim)

Card intro:

> A short introduction that travels with your account — what other players may
> read about you when they look.

Bio label + help + count:

> **A little about you**
> Write a line or two. Other players may see this, depending on who you set it for below.
> `N / 280 characters`

Audience sentences — used for both the bio fieldset ("Who can see your bio") and
the links fieldset ("Who can see your links"):

- **Everyone** — "Anyone who finds you can see it, even someone you have never met."
- **Friends** — "Only people you have both agreed to be friends with can see it."
- **Friends of friends** — "Your friends can see it, and so can their friends."

Links block:

> **Links**
> Up to six places a player can find you. Other players may see these, depending
> on who you set them for below.

Add-link button: "Add a link" (at the cap: "All 6 links added").

**Disclosure paragraph (the owner rule, verbatim):**

> **One thing worth saying plainly:** if you ask somebody to be friends, they can
> read your bio and your links — whatever you have set above. Asking to be friends
> should never be a blind request; the person you are asking gets to see who is
> asking. Nobody else sees more than your settings allow.

Save button / note states:

- idle: "Save profile"
- saving: "Saving…" (button disabled)
- saved: note "Saved — this travels with your account from here on."; button reads
  "Saved" for 1.6 s, then returns to "Save profile"
- error: note shows the server message (or "Your profile could not be saved."),
  button returns to "Save profile". Client-side refusal: "Every link needs to
  start with http:// or https://."

---

## 3. How the two routes are called

Added `loadProfile(getToken)` / `saveProfile(getToken)`, both wired inside
`showAccount` (which already threads the live `getToken` from Clerk) — the same
pattern as `loadWardrobe`.

- **Read:** `GET ${apiUrl}/account/profile` with
  `headers: { authorization: \`Bearer ${token}\` }`, exactly like the existing
  `${apiUrl}/account/designs` call. `apiUrl` comes from `shell.dataset.apiUrl`
  (the page's `data-api-url`).
- **Write:** `POST ${apiUrl}/account/profile` with
  `authorization: Bearer <token>` + `content-type: application/json`, body
  `{ bio, links, visibility: { bio, links } }` — a partial `PlayerProfile`
  update (all three fields named; the route is partial, so this is a full
  save of the editor's state). Response `{ profile }` is fed straight back
  into `renderProfile`, so what the server accepted is what stays on screen.
- Token is fetched fresh per request from `clerk.session?.getToken()` and only
  ever rides in the `Authorization` header — never a URL, never storage.
- **Failure handling:** `loadProfile` hides the form and leaves the status line
  in the desk's own voice — the server's `error` when present, else "Your profile
  could not be opened just now." So a signed-out / unconfigured / unreachable
  profile route shows a plain sentence, never a dead form.

Hand-synced constants (the site doesn't build against `shared/`): `PROFILE_LIMITS
= { bioMax: 280, socialLinksMax: 6, socialUrlMax: 200 }`, the seven
`SOCIAL_LINK_KINDS`, and the three `PROFILE_VISIBILITY_LEVELS`, each noted as
mirroring `shared/src/protocol/profile.ts` / `constants.ts`.

---

## 4. Files changed

| File | Change |
| --- | --- |
| `site/src/pages/account.astro` | +138 lines: the `profile-card` markup and its scoped styles (JS-built rows styled via `:global(...)`, matching the page's existing `:global(.world-card)` convention). |
| `site/src/scripts/account.ts` | +306 lines: mirrored types + limits, element refs, `wireProfile` / `loadProfile` / `saveProfile` / `renderProfile` / link-row building, and two calls added to `showAccount`. |
| `site/src/styles/*` | unchanged. |

---

## 5. Verify — real output

`@astrojs/check` was **already present** in `site/node_modules/@astrojs/check`
— no install, `site/package.json` and the lockfile untouched.

### `cd site && npx astro build`

```
17:21:11 [vite] ✓ 20 modules transformed.
dist/_astro/account.astro_astro_type_script_index_0_lang.sdCwpQ9s.js  20.88 kB │ gzip: 6.35 kB
17:21:11   └─ /account/index.html (+3ms)
...
[build] 9 page(s) built in 811ms
[build] Complete!
```

### `cd site && npx astro check 2>&1 | tail -30`

```
Result (43 files):
- 16 errors
- 0 warnings
- 11 hints
```

**Zero of those diagnostics are in my files.** The full set of files producing
diagnostics:

```
src/components/NoteForm.astro
src/scripts/admin.ts
src/scripts/crayon.ts
src/scripts/enter-form.ts
src/scripts/friend.ts
src/scripts/note-form.ts
src/scripts/sky.ts
src/scripts/tool-cursor.ts
```

No `account.astro` and no `account.ts`. The 16 errors are the repo's
pre-existing ones (chiefly `ts(2451) Cannot redeclare block-scoped variable`
from several script modules sharing the global script scope — `calm`,
`CRAYONS`, `form`), all in unrelated files.

Rendered check (from `dist/account/index.html`): the card ships with its scoped
attribute, e.g.

```
<section class="paper-card profile-card" data-astro-cid-o7lwksye>
  <p class="label" …>How you are seen</p>
  <h2 …>Your profile</h2>
  <p class="soft" …>A short introduction that travels with your account — …
```

---

## 6. Unverified / open

- **No live browser run.** The profile GET/POST routes are being added by a
  parallel agent; this build only proves the page compiles, type-checks clean and
  renders the markup. The request/response round-trip, the saved/idle transitions
  and the failure fallback have not been clicked against a running server.
- **Server contract assumed as stated:** `GET` → `{ profile }`, `POST` partial →
  `{ profile }`. If the real route wraps or nests differently, `loadProfile` /
  `saveProfile` are the two spots to adjust.
- The GET-failure path is covered in code (form hidden, status set) but its exact
  wording for a "not configured" desk was not exercised — a fully unconfigured
  desk never reaches `showAccount` at all (the top-level guard reports "The
  account desk is not configured yet."), so that branch is the route returning an
  error while the desk itself is configured.
