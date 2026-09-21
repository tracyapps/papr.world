# Desk redesign — DOM contract

Frozen before implementation so the markup (owned by the parent) and the
renderers (owned by the render agent) cannot drift.

## Page order (new)

1. `desk__head` — unchanged hooks: `[data-account-user-button]`
2. `[data-account-message]` notice — unchanged
3. `[data-account-signin]` / `[data-account-signin-target]` — unchanged
4. `[data-account-claim]` / `[data-claim-description]` / `[data-claim-button]` — unchanged
5. `[data-account-claimed]` wrapper, containing:
   - **a. Doors** — `[data-world-list]` (unchanged hook), promoted to the top
   - **b. Glance row** — two columns, unequal width:
     - left: `[data-card-preview]` — the bio card as others see it, plus a
       `[data-open-profile]` button (switches to the Profile tab)
     - right: `[data-glance-learning]`, `[data-glance-letters]`, `[data-glance-looks]`
   - **c. Account strip** — `[data-account-name]`, `[data-account-id]` (small),
     and a `[data-open-account]` button
   - **d. Tabs** — `[data-desk-tab="<id>"]` buttons, `[data-desk-panel="<id>"]` panels,
     ids: `scrapbook | letters | looks | profile | account`
     - scrapbook: `[data-inventory-summary]`, `[data-tech]` / `[data-tech-summary]`
     - letters: `[data-mailbox-summary]`, `[data-mailbox-note]`
     - looks: `[data-wardrobe-summary]`, `[data-open-studio]`, `[data-open-studio-note]`
     - profile: `[data-profile-status]` + the existing `[data-profile-form]` (unchanged)
     - account: `[data-migration]` + `[data-wardrobe-import]` blocks

Every existing `data-*` hook `account.ts` queries at load is preserved, so no
business logic, route or flow changes.

## Render contract

| Hook | Renders |
| --- | --- |
| `[data-inventory-summary]` | `<details class="stack" data-stack="<id>">` per bucket. `<summary>` = bucket name + roll-up (`4 kinds · 612`). Inside, `<ul class="stack__list">` of `<li><span>label</span><strong>count</strong></li>`. Largest bucket open, rest closed. Empty → one soft sentence. |
| `[data-tech-summary]` | Unchanged content (learned technique chips). |
| `[data-card-preview]` | The player card as others see it: name, bio (or a soft empty line), links as chips, and a quiet line naming who can see what. |
| `[data-glance-learning]` | `Learning <label> — <time> left`, else `Learning <label> — <n> of <m> steps done`, else `Not learning anything right now.` |
| `[data-glance-letters]` | `N letters waiting` / `No letters yet.` |
| `[data-glance-looks]` | `N saved looks` / `No looks saved yet.` |
| `[data-mailbox-summary]` | Existing list + collect buttons, plus a real empty state. |
| `[data-wardrobe-summary]` | A grid of look cards (name, shared chip, colour swatch when known), not a plain list. |
| `[data-migration]`, `[data-wardrobe-import]` | **Hide the button when a receipt exists** (it currently still shows after import — a bug), and explain in plain words that this is a one-time bridge for progress made before accounts existed. |

## Sources

- Learning label: `site/src/data/tech.json` (generated in parallel by another
  agent: `{ generatedAt, nodes: [{ id, label, durationMs }] }`).
- Learning state: the local solo save already read by `readLocalSoloSave()`;
  add `activeLearning { nodeId, startedAt, completedTaskIndexes, taskBaselineCounts }`.
- Everything else: the existing `/account/*` responses the desk already fetches.
