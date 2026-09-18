# Alpha invitations, consent, and the tester one-pager

2026-09-02, refreshed 2026-09-18 for the account/desk flow · **DRAFT — owner review before first send.** Fills item A0 of the 2026-09-02 roadmap plan. Pairs with [two-worlds-memo.md](two-worlds-memo.md), [alpha-testing.md](alpha-testing.md), and [hosting.md](hosting.md). Nothing here goes out before the hosted `https/wss` smoke passes (A1).

## 1. The invitation message

Copy, personalize the `[bracketed]` bits, send one per tester (personal, not a blast):

> Subject: helping me test papr.world
>
> Hey [name] —
>
> I've been building a small cozy game called papr.world: a 3D world made entirely of paper. You draw yourself into it, then wander, gather, garden, craft, and build things alongside a few other people. There's no competition, nothing scarce, nothing to grind — it's deliberately the opposite of stressful.
>
> I'm inviting a handful of people into the first alpha and I'd love your eyes on it. The ask: **one 30–45 minute session** in the next week or two, playing however you like, then telling me what felt good and what didn't. There's a feedback button built right into the game.
>
> Here's your private invitation link: **[INVITE LINK]** (made at papr.world/admin — it works once, and you choose the email when you open it). It works in a regular browser, nothing to install. A couple of rough edges are known and expected (I'll list them so you don't chase ghosts): [link/summary of the one-pager's "known rough edges"].
>
> What I do with feedback: it goes into a private queue only I can read. Details and data-retention notes are in the one-pager — short version: voluntary, deletable on request, never shared or sold.
>
> Thank you — this genuinely shapes what gets built next.
> — tapps

## 2. Consent + data-retention blurb

Keep this visible at opt-in (alpha-testing.md requires it "at that moment"). Include verbatim in the one-pager.

- **Voluntary.** You're playing an unreleased game; you can stop or withdraw anytime, no explanation needed.
- **What feedback collects.** When you send an in-game report: the text you write; a screenshot **only if you explicitly attach one** (capped ~350 KB); and technical context attached automatically to orient me — build id, game mode (solo or shared neighborhood), current page, biome, position, and browser.
- **Identity.** Reports carry your paper-passport account id by default; the form lets you **remove it** before sending.
- **Where it lives.** A private feedback queue on the alpha game server, readable only by me through a token-protected review desk. Exports I generate are redacted (no passport ids, no private audit notes).
- **Retention.** For the duration of the alpha plus a reasonable feedback window after. Want it deleted? Say the word — [contact form on papr.world] — and it's gone.
- **Resets.** Early in the alpha a save reset is possible if something breaks badly, always with notice. After Day 30 of the alpha: **no resets without tester consent + 48h notice + a reminder to export your save first** — in the game, **Settings → Your save → Download a backup** (built 2026-09-18; **Restore from a backup…** puts it back).
- **No marketing.** Your contact info is used for nothing but this alpha. Never shared, never sold.
- **Who can join.** People I invited personally — 18+, or with a parent/guardian's okay.

## 3. The tester one-pager — "what a tester should know"

**What papr.world is.** A cozy shared world made of paper. Draw yourself in, wander, gather paper materials, craft at the Thing Maker, buy seeds at Pip's, trade raw stock for refined materials with Chisel at the Wood Mill (or by mail), garden, and talk to the critters — they know things about the places they live. Nothing here is scarce and nothing punishes you for leaving and coming back.

**Getting in.** Open your private invitation link, enter your email, and sign up. You land at **your desk**, which holds your doors: your own solo world and the Shared World. You can always get back to the desk from inside the game (Settings, or the Activity drawer).

**A good 30–45 minute path (do it in any order):**
1. Draw yourself — messy is charming; the game accepts strange drawings on purpose.
2. Wander. Pick up loose sticks and fiber. Pet a critter.
3. Craft the Flimsy Shovel at the Thing Maker, dig a bed, visit Pip's Seed & Garden (east meadow — you can barter two paper fibers if you'd rather not spend chips).
4. Plant something. Ask any critter "Tell me about this place" — then follow up.
5. Click the paperclip Professor: the whole knowledge tree is visible; start a node learning (real time — closing the game is playing).
6. Build something at the build bench and, if you're in a shared neighborhood, place a piece while connected so it's stamped with your name.
7. If you have a friend in: join their code from the Friends panel, chat, build next to each other.

**The two questions this alpha is answering** (keep them in mind, no notes required):
- Could you learn what to do next without being told?
- Did another person make the world feel warmer, or merely busier?

**How to give feedback.** The in-game sheet: the **?** Help menu or Settings → **Send feedback…** → **Bug / Improvement / New idea / Other**. Attach a screenshot only if it helps. Small things welcome — "the pond ripple sounds wrong" is a real report.

**Keep a backup.** Settings → **Your save → Download a backup** every so often. If a reset ever happens, that file is how your progress comes back.

**Known rough edges (expected — don't chase these):**
- Harvest piles and critters are per-player; two people can harvest the same pile or meet different critters.
- Gardens are private for now — your friend can't see yours yet.
- Builds made while offline stay yours until you re-place them while connected.
- Other players appear as a colored paper cutout + name until drawn designs arrive.
- Parts of your progress live in your browser: download a backup now and then (Settings → Your save).
- Critters up in the jungle trees (sloths, monkeys, toucans) are brand new — tell me if one gets stuck somewhere odd.

**Ground rules.** Be kind; this is a small, gentle place. Blocks, reports, and host removal all exist and work.

## 4. Owner sending checklist

- **Stage 1 (the day the hosted smoke passes):** invite **1–2 plumbing testers** — people who tolerate rough edges — and have them exercise the second-client items: same-code co-presence, cross-code isolation, block surviving reload.
- **Stage 2 (≈ Day 14, after the warmth quad + save export):** invite the full **3–5 cohort**. At most **2 research questions per build**.
- **Weekly from first invite:** triage both the `?review=1` feedback desk **and** the moderation report queue (`PP_MODERATION_TOKEN`), with a stated response-time expectation for reports.
- Keep `PAPR_ALPHA_CODES` / `PAPR_ALPHA_SECRET` / `PAPR_OWNER_ACCOUNT` set — unset codes means the alpha door is open.
