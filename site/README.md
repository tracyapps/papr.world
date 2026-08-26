# papr.world — the public site

The marketing site, the roadmap pages, and the door into the game. It lives
next to the game in the same repository and deploys to the same domain.

```
papr.world/            this site
papr.world/play/       the game (src/, gated — see "The alpha door")
papr.world/reference/  the generated catalog (tools/build-reference.mjs)
```

---

## I want to change something. Where do I go?

| If you want to change… | Open |
| --- | --- |
| **Any colour, anywhere** | `src/styles/_tokens.scss` |
| The light-mode values specifically | `src/styles/_theme.scss` |
| The card / tape / button / heading recipes | `src/styles/_paper.scss` |
| Base type, prose, spacing, the crayon marks | `src/styles/site.scss` |
| **Homepage words** | `src/pages/index.astro` |
| Words on /world, /together, /how-it-works | that page's file in `src/pages/` |
| **Roadmap wording** | `docs/roadmap.md` — see below |
| The nav menu | the `links` array at the top of `src/components/SiteNav.astro` |
| The footer | `src/components/SiteFooter.astro` |
| The reasons on the contact form | the `reasons` array in `src/components/NoteForm.astro` |
| The tools in the "press T" cursor | the `TOOLS` array in `src/scripts/tool-cursor.ts` |
| What the little friend says | the `SAYINGS` array in `src/scripts/friend.ts` |
| The hidden critters | `src/data/critters.ts` |
| The share image people see on Slack | `tools/og-card.html`, then `npm run og:build` |
| Where contact-form notes are emailed | `api/note.ts` |
| What's on /reference | nothing here — it's generated from the game's catalogs by `tools/build-reference.mjs` |
| Who can get into the alpha | the `PAPR_ALPHA_CODES` variable — see below |

### The short version

Every `.astro` file is **HTML with a fenced block of imports at the top**.
Below that fence it is ordinary markup, and at the bottom is an ordinary
`<style lang="scss">` block that only applies to that file. If you want to
change a word, find the word and change it. There is no build step to think
about and no JavaScript standing between you and the text.

Every `.scss` block already has the tokens and the paper mixins available —
you never need an `@use` line. Just write `var(--paper)` or `@include card()`.

---

## Running it

```bash
npm run site:install     # once
npm run site:dev         # http://localhost:4321, reloads as you save
```

To build the whole domain — site, game and reference — the way Vercel does:

```bash
npm run build:web        # writes web/
npm run web:preview      # serves it
```

---

## /reference is generated too

`/reference` is not a page in `src/pages`. It is built by
`tools/build-reference.mjs` from the game's own `sim/catalogs` — every
material, tool, recipe, biome and rule, with search and filters. Same
principle as the roadmap: the site renders the game rather than describing it.

`tools/stage-reference.mjs` copies it into `site/public/reference/`, which
both `site:dev` and `build:web` do for you. That folder is generated and
gitignored — never edit it by hand.

It carries its own small stylesheet and does **not** share the site's design
system or navigation, only a "← papr.world" link back. That is a deliberate
seam, not an oversight: it is a reference table, and it predates this site.
Bringing it into the site's look would mean either teaching the generator
about the site's CSS or turning it into a real Astro route — worth doing if it
starts feeling like part of the site rather than an appendix to the game.

## The roadmap syncs itself

`/roadmap` and the trail on the homepage are both generated from
`docs/roadmap.md`. Nothing about the plan is typed twice, so the site cannot
quietly disagree with the plan. Move an item to ✅ and both pages change on
the next deploy.

`tools/build-roadmap.mjs` reads the headings and their status markers
(✅ done, 🚧 underway, ◐ partly built, nothing = planned) plus the size marks
(**S** / **M** / **L** / **XL**).

Your planning doc is allowed to be blunt in a way the public page shouldn't
be, so you can steer what a stranger sees with a comment placed under any
heading:

```markdown
### 3.5 Mailbox and PWMS — **L**

<!-- site: summary: Every player gets a mailbox. Things arrive in it. -->
<!-- site: title: The mailbox -->
<!-- site: hide -->
```

- `summary:` replaces the public blurb (otherwise it uses the first paragraph)
- `title:` replaces the public name (the roadmap keeps its own heading)
- `hide` keeps the item off the site entirely

None of them are required. The parking-lot table and the "if you only do one
thing" section are picked up automatically; "How to use this" and "Decisions
still owed" are treated as private and never published.

---

## The alpha door

While papr.world is invite-only, **nobody reaches `/play` without a code.**
This is enforced at the edge by `middleware.ts` before Vercel serves a single
byte of the game, not by anything in the browser.

One code does both jobs: it opens the door, and it names the neighbourhood you
land in. Codes use the same shape the game already uses — four letters (no I,
no O), a dash, two digits 2–9. `WREN-42`.

Set two environment variables in the Vercel project, for Production **and**
Preview:

| Variable | What it is |
| --- | --- |
| `PAPR_ALPHA_CODES` | The codes that work, comma separated: `WREN-42,FERN-73` |
| `PAPR_ALPHA_SECRET` | A long random string that signs the pass cookie. `openssl rand -base64 48` |

**If `PAPR_ALPHA_CODES` is empty or unset, the door is open and nothing is
gated.** That is deliberate, so a fresh clone or a local `vercel dev` is not
bricked by a missing variable — but it does mean you have to set it to
actually gate the alpha. It will not gate itself by accident.

To end the alpha, clear `PAPR_ALPHA_CODES`. To revoke everyone's existing
pass immediately, change `PAPR_ALPHA_SECRET`.

The full reasoning is in `lib/gate.ts`, which both the middleware and
`api/enter.ts` share.

---

## The contact form

`api/note.ts` emails whatever somebody writes, through
[Resend](https://resend.com) (free tier is 3,000 emails a month). Three
variables:

| Variable | What it is |
| --- | --- |
| `RESEND_API_KEY` | From the Resend dashboard |
| `NOTE_TO` | Where notes land, e.g. `hello@papr.world` |
| `NOTE_FROM` | A verified sender on a domain you own in Resend |

With `RESEND_API_KEY` unset the form still accepts and validates notes and
logs them — it just doesn't deliver them. So preview deploys are never broken,
but do check the variables are set before you tell anybody the form works.

---

## Things worth knowing before you edit

**Crayon marks go behind the words, not over them.** Each band has its own
`<div class="band__marks" data-marks>` pinned at z-index 0 with the content at
z-index 1. If you add a section and want it to take marks, add that div as its
first child. `src/scripts/crayon.ts` explains why this matters.

**The hills use `preserveAspectRatio="none"`.** Not a mistake — the long note
at the top of `src/components/Hills.astro` explains what cropped the peaks off
before and why `slice` was the wrong tool for a band six times wider than it
is tall. If a shape looks squashed, change the band's height where it is used;
don't reach for `slice`.

**The notebook rule is drawn in CSS, not the material SVG.** The real
`paper_notebook_blue_lined_01.svg` carries a heavy `feTurbulence` grain that
reads as television static at web scale and fights any text over it. The site
uses `@include ruled()` instead. The real material SVGs are still used where
showing the actual asset is the point — the swatch row and the paper drawer.

**Big headings have a metric-matched fallback font.** Dokdo sits very small on
the em, so a plain fallback overflows its own line box and lands on the
paragraph below. `site.scss` declares a `"Dokdo fallback"` face with adjusted
metrics so the substitute takes up the same room. Keep it in the stack.

**`--ink-faint` is real text.** It is set exactly where it still clears 4.5:1
against every paper in its theme. If you make it prettier, check it against
`--paper-3` first.

**Nothing moves for someone who asked it not to.** Every animation is behind
`prefers-reduced-motion`, and the parallax detaches itself entirely rather
than freezing mid-drift.

---

## What's in here

```
site/
├── public/
│   ├── assets/          artwork — materials, props, tools, scenery, avatars
│   ├── favicon.svg
│   ├── og.png           the share card (regenerate: npm run og:build)
│   └── robots.txt
└── src/
    ├── components/      the pieces pages are built from
    ├── data/
    │   ├── critters.ts  the hidden critters, and how many there are
    │   └── roadmap.json GENERATED — do not edit, edit docs/roadmap.md
    ├── layouts/
    │   └── Base.astro   <head>, nav, footer, the script list
    ├── pages/           one file per URL
    ├── scripts/         one file per playful behaviour
    └── styles/          tokens → theme → paper → site
```

Outside this folder, but part of the site:

```
api/enter.ts             checks a code, opens the door
api/note.ts              the contact form
lib/gate.ts              code list, cookie format, signing
middleware.ts            keeps /play shut
tools/build-roadmap.mjs  docs/roadmap.md  → src/data/roadmap.json
tools/build-web.mjs      assembles web/ for deploy
tools/build-og.mjs       renders the share card
tools/og-card.html       …from this page
```
