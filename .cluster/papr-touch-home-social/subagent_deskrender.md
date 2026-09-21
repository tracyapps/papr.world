# Desk renderers — `site/src/scripts/account.ts`

Owner: render agent. Scope: `site/src/scripts/account.ts` only.
Contract read first: `.cluster/papr-touch-home-social/desk-contract.md`. No hook name changed.

---

## 1. What each hook now renders

| Hook | What `account.ts` now puts there |
| --- | --- |
| `[data-inventory-summary]` | One `<details class="stack" data-stack="<id>">` per **filled** pouch bag. `<summary>` = `<span class="stack__name">Bag</span><span class="stack__roll">4 kinds · 612</span>`. Inside, `<ul class="stack__list">` of `<li><span>label</span><strong>count</strong></li>` (label formatting unchanged: `-_.` → spaces). **Largest bag has `open`; the rest are closed.** Nothing at all → one soft sentence (`Your server-owned neighborhood pouch is empty.`). |
| `[data-tech-summary]` | Unchanged (learned-technique chips). |
| `[data-card-preview]` | `.card-preview__sheet` with `.card-preview__name`, then `.card-preview__bio` (or `.card-preview__empty` = “Nothing written here yet.”), then `.card-preview__links` chips, then one quiet `.card-preview__who` line. |
| `[data-glance-learning]` | `Learning Digging 2 — about 5 hours left` / `Learning <label> — 2 of 3 steps done` / `Not learning anything right now.` |
| `[data-glance-letters]` | `N letters waiting` / `No letters yet.` |
| `[data-glance-looks]` | `N saved looks` / `No looks saved yet.` |
| `[data-mailbox-summary]` | Existing waiting/collected list + collect buttons, unchanged; **empty state rewritten** (below). |
| `[data-wardrobe-summary]` | `<ul class="looks">` of `<li class="look">` cards: optional `.look__swatch`, `.look__name`, and a `.look__chip` (“Shared on card”) when set. |
| `[data-migration]`, `[data-wardrobe-import]` | Receipt sentence kept; **button now actually goes away once a receipt exists** (see §4); description rewritten as a one-time bridge from before accounts. |

**Buckets used** (all pre-existing on the desk — none invented): `chips` (“Shiny chips”), `resources`, `tools`, `items`. `data-stack` ids are exactly those four. `[data-inventory-summary]` survives `collect-mail` re-renders (the mailbox calls it again).

### Learning line — how it resolves
1. `readLocalSoloSave()` now also extracts `activeLearning` (`nodeId`, `startedAt`, `completedTaskIndexes`, `taskBaselineCounts`), sanitised to the same bounds as `src/sim/state.ts` (`ActiveLearningState`, 16 baselines/indexes, whole counts ≥ 0) — a bad shape is `null`, never a throw.
2. Label + `durationMs` come from `site/src/data/tech.json`, imported the same way `roadmap.json` is (`import techData from '../data/tech.json'`), then indexed into a `Map` defensively (non-array `nodes`, non-string id/label and non-finite `durationMs` are skipped).
3. `remaining = startedAt + durationMs − now`; `> 0` → `Learning <label> — about <time> left` (desk voice: “under a minute”, “about 5 hours”, “about 3 days”). Otherwise, if step counts are known → `Learning <label> — <n> of <m> steps done`, else just `Learning <label>`.
4. No save, no `activeLearning`, or an id the catalog does not know → `Not learning anything right now.`

## 2. New class names the parent must style

**None.** I emit only names already in the contract/`account.astro`.

## 3. ⚠️ Blocking style issue — runtime classes need `:global()`

The new `.stack*`, `.looks`/`.look*` and `.card-preview__*` rules in `account.astro` are **scoped** (not `:global`), so they will not match the elements `account.ts` builds. Verified in the built CSS:

```
.stack[data-astro-cid-o7lwksye]{margin-top:12px}
.stack[data-astro-cid-o7lwksye]>summary[data-astro-cid-o7lwksye]{…}
.looks[data-astro-cid-o7lwksye]{…}
.look[data-astro-cid-o7lwksye]{…}
.card-preview__sheet[data-astro-cid-o7lwksye]{…}
```

The `[data-card-preview]` **container** carries the cid (it is template markup), but every element *inside* it — and every `<details>`/`<li>`/`<span>` I create — is built at runtime and has no cid, so those rules match nothing. The file is otherwise disciplined about this (`:global(.world-card)`, `:global(.desk-list)`, `:global(.tech-list)`, `:global(.profile-link)`), so this looks like an oversight rather than intent.

**Please wrap these in `:global(...)`** (a scoped descendant such as `[data-inventory-summary] :global(.stack)` keeps them local if you prefer):

`.stack`, `.stack > summary` (+ `::-webkit-details-marker`, `::after`, `[open]`, `:hover`), `.stack__name`, `.stack__roll`, `.stack__list`, `.stack__list li`, `.stack__list strong`, `.looks`, `.look`, `.look__swatch`, `.look__name`, `.look__chip`, `.card-preview__sheet`, `.card-preview__name`, `.card-preview__bio`, `.card-preview__empty`, `.card-preview__links`, `.card-preview__links li`, `.card-preview__who`, `.mailbox__heading` (the last one is a pre-existing runtime element — those mailbox headings have never been styled).

I did not touch `account.astro`, so nothing is fixed from my side. Structure and content are correct today; only the paint is missing.

## 4. The receipt/button bug — root cause and fix

The button was never actually hidden. **`hidden` cannot hide a `.btn`**: `site.scss` has `.btn { @include chunky; }` and `chunky()` sets `display: inline-flex`. An author `display` rule beats the user agent's `[hidden] { display: none }`, so `migrationButton.hidden = true` left the button on screen — exactly the screenshot: receipt above, button still below.

Fix, inside my file only:

```ts
const setButtonGone = (button, gone) => {
  button.hidden = gone;                        // semantics / a11y
  button.style.display = gone ? 'none' : '';   // the property that actually wins
};
```

Both `[data-migration-button]` and `[data-wardrobe-import-button]` now go through it, on every path (receipt → gone; nothing to offer → card hidden; ready → shown). The receipt sentence is unchanged (`Solo save brought in on <date>: …` / `Wardrobe brought home on <date>: N looks imported.`).

Copy rewritten to say plainly that this is a bridge for progress made before accounts existed and is not needed otherwise, e.g.:

> This browser is still holding a solo save from before you had an account: 7 shiny chips, 10 items across your bag. Copying it in is a one-time bridge — your account takes it over, and it will never ask twice. If you started playing after accounts existed, there is nothing to do here.

Also: the buttons’ **labels now come from the page** (`migrationButton.textContent` captured at load), so the parent’s new wording (“Copy my solo save in” / “Copy my looks in”) is never clobbered by this file; only the busy state (“Copying it in…”) is written.

Letters empty state (`[data-mailbox-summary]`):
> No letters yet. Letters and parcels wait here for you, whether or not you were around when they arrived.

(The glance line keeps the contract’s short `No letters yet.`)

## 5. Card preview — source of truth

The card is a **desk-side echo of `src/ui/playerCard.ts`**, not a second definition. I mirror its shape and its words (`LINK_KIND_LABELS` → `CARD_LINK_LABELS`: Website / Instagram / X / YouTube / Twitch / Discord / **A link**; http(s)-only links; bio omitted when empty) and add only the one line the game does not need — who may read it, built from `profile.visibility` (`our bio and links are visible to <audience>`; a per-field split sentence when bio and links differ; `Nobody sees more than your settings allow.` before the profile loads or if it cannot). `playerCard.ts` remains the authority for what a card shows.

The card renders once from the account name on load, then again from the same `GET /account/profile` read the editor uses, so the editor and the preview can never disagree.

## 6. Wardrobe swatch — no invented data

`/account/designs` returns the full `AvatarDesign`, so I read one real hex: the first stroke colour, else the first stamp colour. `paper.color` is a catalog **key** (`construction-red`), not a colour, so it is deliberately ignored. No hex → **no swatch element at all**, just the name (and the shared chip). `looks` renders name-only for that case in the smoke test.

## 7. Verify — real output

```
$ cd site && npx astro build
19:28:46 [@astrojs/sitemap] `sitemap-index.xml` created at `dist`
19:28:46 [build] 9 page(s) built in 835ms
19:28:46 [build] Complete!
```

`account.astro` compiles against the new hooks, and the account script bundles (`account.astro_astro_type_script_index_1_lang.*.js`, 38.09 kB).

```
$ cd site && npx astro check 2>&1 | tail -30
src/scripts/friend.ts:29:7  - error ts(2451): Cannot redeclare block-scoped variable 'calm'.
src/scripts/friend.ts:11:7  - error ts(2451): Cannot redeclare block-scoped variable 'CRAYONS'.
src/scripts/note-form.ts:10:7 - error ts(2451): Cannot redeclare block-scoped variable 'form'.
src/scripts/sky.ts:28:7    - error ts(2451): Cannot redeclare block-scoped variable 'calm'.
src/scripts/tool-cursor.ts:25:7 - error ts(2451): Cannot redeclare block-scoped variable 'calm'.

Result (44 files):
- 16 errors
- 0 warnings
- 11 hints
```

**`src/scripts/account.ts` reports ZERO diagnostics.** The 16 errors are the repo's pre-existing ones, unchanged by me:

| file | errors |
| --- | --- |
| `src/scripts/enter-form.ts` | 10 |
| `src/scripts/friend.ts` | 2 |
| `src/scripts/crayon.ts` | 1 |
| `src/scripts/note-form.ts` | 1 |
| `src/scripts/sky.ts` | 1 |
| `src/scripts/tool-cursor.ts` | 1 |

(Baseline before my change was **17** errors; the one that disappeared — `src/pages/account.astro:3` “Cannot find module `../components/DeskArt.astro`” — was the parent adding `DeskArt.astro`, not me.)

### Runtime smoke test (not just types)

Because “nothing may throw” is stronger than “it compiles”, I bundled `account.ts` with esbuild (stubbing only `./clerk` and `./passportBridge`), ran it against a small hand-rolled DOM + fake `fetch`/`localStorage`, and asserted the built tree. Harness lives in `/tmp/desk-smoke/` (nothing added to the repo). Four scenarios, real output:

```
=== A. a full desk ===
  ok   one <details class="stack"> per filled pouch bag        [chips, resources, tools, items]
  ok   summary carries the bucket name and a kinds · total roll-up   ["Resources", "3 kinds · 10"]
  ok   only the largest bag is open                            [false, true, false, false]
  ok   items keep the label + count formatting                 ["jam jar 1", "apples 4"]
  ok   learning names the node and the time left               "Learning Digging 2 — about 5 hours left"
  ok   letters counts the mailbox                              "2 letters waiting"
  ok   looks counts the wardrobe                               "2 saved looks"
  ok   card shows name, bio, link chips and the who-can-see line
  ok   looks render as cards: swatch, shared chip, names       (#2f6fa8 swatch; name-only when no colour)
  ok   solo-save bridge says it is a bridge from before accounts
  ok   solo-save button is still visible before it is used
  ok   wardrobe bridge keeps the receipt and hides its button  (hidden=true, display='none')
  ok   the old "Bring it into your account" wording is never written back
=== B. an empty desk, with the profile route failing (404) ===
  ok   scrapbook says the pouch is empty, once
  ok   letters empty state is warm and says things wait here
  ok   looks empty state
  ok   glance lines fall back quietly
  ok   the wardrobe bridge stays hidden with nothing to bring in
  ok   a failed profile route still leaves a whole card
=== C. a save part-way through an unknown node ===
  ok   an unknown node id reads as not learning anything
  ok   an empty bio gets the soft empty line, not an error
=== D. a signed-out desk ===
  ok   a signed-out desk says so and does not throw

ALL CHECKS PASSED
```

## 8. Unverified / notes for the parent

- **Nothing is visually verified.** I could not render the page (Clerk/CDN), so the smoke test asserts structure and copy, not pixels. Once §3 is fixed, the stacks/looks/card should also be painted. `.desk-panels`, tabs, `.bridge-intro` copy and `DeskArt` are the parent’s; I did not touch them.
- **`.mailbox__heading` is in §3** for the same reason but is pre-existing — flagging it, not asking you to change its look.
- **A *deleted* `tech.json` still breaks the build**, by design — it is a static import like `roadmap.json` (the parent already wired `tech:build` into `site:build`). The defensive part is the *lookup*: malformed `nodes`, or an id not in it, degrades to `Not learning anything right now.` rather than throwing.
- `activeLearning` now rides along in the `/account/import-solo-save` body. The server’s `sanitizeSoloMigrationSnapshot` reads only the fields it knows, so it is ignored — noted in case you would rather strip it before the POST.
- The two bridge buttons’ labels are now captured from the markup; if you re-label them, this file follows. The busy state is `Copying it in…` — say the word if you want different wording.
- Bucket names I emit are the desk’s own (“Shiny chips”, “Resources”, “Tools”, “Items”); the roll-up is `N kinds · total`. Chips is a one-kind bag by nature — change the labels freely, `data-stack` ids are the stable part.
