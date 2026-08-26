# Alpha Testing and In-Game Feedback

Written 2026-08-25. This is the operational companion to the roadmap's
multiplayer parallel lane. It answers two questions: *when is this useful to
outside testers?* and *how can they tell us what happened without leaving the
game?*

## Locked decisions

- The first alpha is **small, invite-only, and feedback-focused**. It is not a
  public launch and not gated on finishing every biome.
- The in-game feedback path ships **before invitations**, works in solo and
  shared play, and is never replaced by asking testers to find a separate form.
- Product feedback and safety reports are different systems. A bug or idea is
  about the build; reporting a player, message, or shared drawing is contextual
  moderation evidence with stricter access and retention.
- Automatic context is minimal and inspectable. Passport secrets, full saves,
  private chat, and player drawings are never silently included.

## Readiness gates

### Gate 0 — internal two-client dogfood

✅ Reached 2026-08-25. Two local browser sessions joined one development room,
saw named fallback cutouts and movement, exchanged accessible DOM chat, and saw
one server-owned piece survive a full restart. The developer console was used
only to place the smoke-test piece; real completed builds use the same publish
path. The purpose is to break the network seam cheaply.

### Gate 1 — 3–5 invited alpha testers

The five acceptance criteria live in `roadmap.md` under **Alpha gate 1**. The
important framing is a coherent 30–45 minute loop, not biome count. The first
test can use fallback remote cutouts and unfinished scenery; it cannot risk
silent save loss, trap critters/players in water, or strand progression.

Each build should ask at most two research questions, for example:

1. Could you learn what to do next without being told?
2. Did another person make the world feel warmer or merely busier?

## Player-facing feedback flow

Entry points: **Send feedback** in the always-reachable game/settings menu and
in the scrapbook. Both open the same accessible DOM panel and preserve what was
typed if it closes accidentally.

1. Choose **Bug**, **Improvement**, **New idea**, or **Other**.
2. Write what happened or what would make the experience better.
3. For a bug, optional structured prompts ask: *What were you doing? What did
   you expect? What happened instead? Can it happen again?*
4. Review the automatically attached context and remove optional fields.
5. Optionally attach a fresh game screenshot. Never capture the screen before
   the player explicitly presses the screenshot control.
6. Send. Show a durable receipt id and keep failed submissions in a local
   outbox with an explicit Retry action.

No required email. A tester may opt into follow-up using their paper passport
identity or a separately supplied contact address; the consent and retention
text must be visible at that moment.

## Versioned submission shape

The renderer and server should share a dependency-free type. IDs are strings so
the storage backend can change without migrating UI code.

```ts
type AlphaFeedback = {
  version: 1;
  id: string;
  category: 'bug' | 'improvement' | 'idea' | 'other';
  summary: string;
  details: string;
  expected?: string;
  reproducibility?: 'once' | 'sometimes' | 'always' | 'unknown';
  screenshotId?: string;
  context: {
    clientBuild: string;
    protocolVersion: number;
    mode: 'solo' | 'shared';
    roomId?: string;
    accountId?: string;
    pageId: string;
    biome: string;
    x: number;
    z: number;
    browser: string;
    platform: string;
    recentGameEvents: string[];
  };
  createdAt: number;
};
```

`recentGameEvents` means a short allow-listed ring such as *opened tree*,
*started conversation*, *placed bridge*, or *connection dropped*. It is not a
console dump, chat log, keystroke log, or serialized save.

## Intake and triage

The first implementation may mirror the existing room store: append versioned
JSON records atomically behind a `FeedbackStore` interface, with screenshots in
a size-capped sibling directory. The HTTP endpoint validates lengths, MIME
type, build/protocol versions, and a modest account/IP rate limit.

Minimum reviewer surface:

- filter by category, build, status, and duplicate id;
- read the safe context and optional screenshot;
- mark **new / reviewing / needs-info / resolved / duplicate**;
- export redacted JSON for analysis;
- retain an audit note without editing the tester's original text.

The player-facing outbox only needs **queued / sent / needs retry** plus the
receipt id. It must not expose other reporters or internal moderation notes.

## Safety-report boundary

Once chat exists, a message menu can report that exact message and account id.
Once shared drawings exist, a card can report that exact design revision and
immediately hide it for the reporter. These records go to the moderation queue,
not the product-feedback queue. Invite-only reduces reach; it does not remove
the need for mute, block, host removal, or evidence-preserving reports.

Public discovery remains blocked on `communal-multiplayer.md` Phase G and the
stronger UGC rules in `avatar-and-identity.md`.

## Implementation status — ✅ MP.2 complete locally (2026-08-25)

The complete feedback path is built and browser-proved: dependency-free shared
validation; Settings and Scrapbook entry points; accessible category/bug form;
inspectable safe context and removable passport identity; explicit fresh-world
screenshot capture, preview, removal, compression, and size-capped upload; a
bounded local outbox with Retry; durable receipts; rate-limited intake; and an
atomic versioned JSON queue.

The private `?review=1` desk uses a server-side `PP_REVIEWER_TOKEN`, kept only
in the reviewer's tab session. It filters by category/status/build/id, shows
protected screenshots, changes status, appends private audit notes without
editing tester text, and downloads an export with passport ids and audit notes
removed. The public API can upload a screenshot but cannot read one.

A real Firefox pass proved a normal screenshot report, a screenshot report
queued while the server was stopped and delivered by Retry, review updates,
redacted export, and report/screenshot recovery after a server restart. The
hosted `https://`/`wss://` proof remains part of MP.3's deployment gate, not
unfinished MP.2 implementation.
