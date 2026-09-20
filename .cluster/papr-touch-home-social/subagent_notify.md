# Activity-log badge → configurable notification badge

## What changed, in one line
The bubble no longer counts everything ever recorded. It counts **new, unseen items in the
categories the player switched on**, defaults to *other people* (messages / mail / social),
and clears as the player looks at things.

## `src/ui/notifications.ts` — exported API (new, pure model + local store)
Pure counting/seen logic (no DOM, no game-state mutation) plus a small localStorage-backed store.

Types & constants
- `type NotifyCategory = 'messages' | 'mail' | 'social' | 'activity' | 'travel' | 'conversations'`
- `type NotifyCategoryDef = { id; label; blurb; noun: readonly [singular, plural] }`
- `NOTIFY_CATEGORIES: readonly NotifyCategoryDef[]` — the six, in canonical display/spoken order
- `NOTIFY_CATEGORY_IDS: readonly NotifyCategory[]`
- `DEFAULT_NOTIFY_CATEGORIES: readonly NotifyCategory[]`
- `type NotificationSources = { messages; social; mail: number[]; activity: number[]; travel: number[]; conversations: number[] }`
- `type NotificationSeen = { logsAt: number; mailAt: number; requests: string[] }`
- `EMPTY_SEEN: NotificationSeen`
- `type NotifyCounts = Record<NotifyCategory, number>`

Pure functions
- `sanitizeNotifyCategories(value: unknown): NotifyCategory[]`
- `newestOf(values: readonly number[]): number`
- `logsSeenAfter(sources): number` — newest of the three log streams
- `mailSeenAfter(sources): number` — newest arrived-mail stamp
- `countUnseenRequests(incoming, seen): number`
- `socialNew(incoming, knocks, seen): number`
- `countNew(category, sources, seen): number`
- `buildCounts(enabled, sources, seen): NotifyCounts` — zeroes anything switched off
- `totalNew(counts): number`
- `describeNotify(enabled, counts): string` — the accessible name, in words
- `collectNotificationSources(state, { messages, social, now? }): NotificationSources`

Store (local preference, persisted to `localStorage` key `pencil…s.notifications.v1`; never the save)
- `getNotificationSeen(): NotificationSeen`
- `subscribeNotifications(listener): () => void`
- `markLogsSeen(at)`, `markMailSeen(at)`, `markRequestsSeen(accountIds)` — forward-only, idempotent

## Exact default category set
`['messages', 'mail', 'social']` — things other people do. `activity`, `travel`, `conversations`
(your own logs) are **off** by default. Stored as `Settings.notifyCategories` via
`sanitizeNotifyCategories`: a non-array (older save / corrupt value) falls back to the defaults,
unknown ids are dropped, duplicates removed, and canonical order enforced. An honest empty array
("everything off") is preserved.

## How each category's "new" is computed and cleared
Reads are one-way; nothing in `sim/state.ts` or the protocol changed.

| Category | "new" is | Cleared by |
|---|---|---|
| `messages` | `sources.messages` — the count the chat panel already renders in `#chat-widget [data-role="unread"]` (`ui/sharedChat.ts`, `renderCollapsed`/`unreadCount`). `readChatUnread()` in `activityLog.ts` parses it, so the badge clears exactly where the chat panel zeroes it (when expanded). No second copy of that state. | Expanding the neighborhood chat |
| `mail` | `sources.mail.filter(at => at > seen.mailAt)`, where `mail` = `state.player.mailbox` items that have **arrived** (`mailHasArrived`, `sim/mail.ts`) stamped with arrival time (`mailArrivesAt` for mill parcels, else `mail.at`). No per-letter read flag exists, so "newest arrival seen" lives in the store. | Opening the Scrapbook's `mail` tab (`#scrapbook-dock.is-open` + `#scrapbook-tab-mail[aria-selected="true"]`) → `markMailSeen(mailSeenAfter(...))` |
| `social` | `socialNew(getFriends().incoming, getKnocks().length, seen)` — incoming friend requests not yet seen (`countUnseenRequests`) **plus** open knocks (`game/guests.ts`). | Requests: opening the friends list (`isFriendsPanelOpen()`, `game/friendsPanel.ts`) → `markRequestsSeen(incoming ids)`. Knocks: they leave `getKnocks()` the moment they are answered or lapse, so they clear themselves. |
| `activity` | `sources.activity.filter(at => at > seen.logsAt)` from `state.player.activityLog` | Opening the Logs drawer (`setActivityLogOpen(true)` → `refreshBadge` → `markLogsSeen(logsSeenAfter(...))`) |
| `travel` | `sources.travel.filter(at => at > seen.logsAt)` from `state.player.travelLog` | Same drawer mark (`logsAt` is shared by all three log streams) |
| `conversations` | `sources.conversations.filter(at => at > seen.logsAt)` from `state.player.diaryEntries` (`.recordedAt`) | Same drawer mark |

One mark covers the three log streams because the drawer shows all three at once. Marks are
newest-item based (not `Date.now()`), so re-marking while a panel is open is idempotent and cannot
feed a refresh loop.

## Settings UI added
In `src/ui/hudMenus.ts` → `buildSettingsOverlay()`, a new **Notifications** subhead between
**Friends** and **Leaving**, using the existing `.hud-setting` checkbox style (one `<label>` per
category, `<strong>` label + `<small>` one-liner) generated from `NOTIFY_CATEGORIES`, plus a closing
`.hud-overlay-note` that states the default plainly ("The Logs bubble shows what is new since you
last looked, not everything ever recorded. It starts with other people…"). Wiring: an
`enabled: Set<NotifyCategory>` seeded from `getSetting('notifyCategories')`; each change rewrites the
setting through `sanitizeNotifyCategories` so order stays canonical. The six labels/one-liners:
Messages from neighbors · Letters and parcels · People waiting on you · Your own activity · Places
you discover · Critter conversations.

## Files changed
- `src/ui/notifications.ts` (new) — model + store
- `src/ui/notifications.test.ts` (new) — 25 tests (pure counting/seen + store)
- `src/ui/activityLog.ts` — badge render replaced (was `renderToggleCount`/`totalLogCount`); added
  `refreshBadge` (reads settings, chat unread, guests, panel-open signals; marks seen; renders),
  1 s poll + `subscribeGuests`/`subscribeNotifications`/`onSettingsChanged` subscriptions
- `src/game/settings.ts` — `notifyCategories: NotifyCategory[]`, default `DEFAULT_NOTIFY_CATEGORIES`,
  validated on load through `sanitizeNotifyCategories`
- `src/ui/hudMenus.ts` — Notifications section + wiring
- `src/styles.css` — `@media (pointer: coarse) { .hud-log-button { min-height: 44px; min-width: 44px } }`
  (the HUD circle is 34px on desktop)

The concurrently-edited `src/world/**` and `src/game/{treeInteractions,rockInteractions,planting,plantInteractions,placement,toolActions}.ts` were left untouched.

## Accessibility
`aria-label` is now words, not a number: `Logs` when nothing is new or everything is off, else
`Logs, 4 new — 2 messages, 1 letter, 1 request`. `aria-expanded` behaviour and the visible
`99+`-capped number are unchanged. Button is a real `<button>` (keyboard reachable) and gets a ≥44px
touch target under `pointer: coarse`.

## Verify (real output)
`npx tsc --noEmit`
```
(no output)
```
`npx vitest run src/ui/notifications.test.ts`
```
 ✓ src/ui/notifications.test.ts (25 tests) 4ms
 Test Files  1 passed (1)
      Tests  25 passed (25)
```
`npx vitest run` (whole suite)
```
 Test Files  117 passed | 1 skipped (118)
      Tests  1265 passed | 1 skipped (1266)
```
`npm run styles:check`
```
Stylesheet looks good: 1058 rules, no shadowed declarations.
```
`npm run build` also completes (content:check + styles:check + tsc + vite build ✓ 1.61s).

## Judgement calls / unverified
1. **`messages` reading route.** `notifications.ts` is DOM-free as asked, but `sharedChat.ts` is
   outside my file list and does not export `unreadCount`/a change signal, so `activityLog.ts` reads
   the same state off the element the chat panel renders (`[data-role="unread"]`) rather than
   duplicating the counter. It is the same value the panel clears, so the two agree; a one-line
   export from `sharedChat.ts` would be cleaner but was out of bounds.
2. **Knock clearing.** The knock card (`game/knockNotices.ts`) is *always shown while a knock is
   pending* — there is no "opened" event to hook. So knocks count as new while pending and clear
   themselves when answered or lapsed; only friend requests use an explicit seen-set. If you want a
   knock to stop counting the instant the card is on screen, that needs a signal from `guests.ts`.
3. **Noun for mail** is "letter" in the spoken summary (spec example said "parcel"). Mail here is
   mostly letters/notes; mill orders are the parcels — say the word and I'll switch it.
4. **1 s poll.** Chat-unread and "a panel is open" have no event to subscribe to from this side, so
   the badge refreshes on a 1 s interval (matching the knock pruner's cadence). Cheap, and re-render
   is skipped unless the number/name actually changes.
5. Not exercised in a live browser (subagent context): actual DOM behaviour of the poll against a
   running game, and the visual fit of the new Settings block. Logic is unit-tested; types and build
   are clean.
