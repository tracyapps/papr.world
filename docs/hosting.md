# Hosting Pencil and Paper

Last checked 2026-08-25. This is the short answer to “where do I sign up?”

## Recommended alpha setup

Use **Vercel for the game client** and **Railway for the authoritative game
server**.

- Sign up at [Vercel](https://vercel.com/signup) with the GitHub account that
  owns the game repository. The existing `vercel.json` already targets the
  static Vite client. Vercel Hobby is free for personal, non-commercial work;
  move to Pro if the project becomes commercial or needs paid-team features.
- Sign up at [Railway](https://railway.com/login) with GitHub. Railway's Hobby
  plan is currently a $5/month minimum commitment and that $5 counts toward
  actual usage. It supports the long-running Node process, public WebSockets,
  and a persistent volume the current JSON world/account/feedback stores need.

Do **not** try to run the Colyseus server as a Vercel Function. The client is
static, but multiplayer holds long-lived WebSocket connections and must run as
an always-on Node service.

## Railway settings when MP.3 deploys

The deployment files still need to be added and smoke-tested as part of MP.3;
creating the accounts now does not deploy anything.

1. Create a Railway project from the GitHub repository.
2. Deploy one server replica initially. The current JSON store is intentionally
   single-writer and should not be horizontally scaled.
3. Attach a small persistent volume at `/data` and set `PP_DATA_DIR=/data`.
4. Set `PP_CORS_ORIGIN` to the exact Vercel game origin, such as
   `https://pencil-and-paper.vercel.app`.
5. Generate a long random reviewer secret and set it as `PP_REVIEWER_TOKEN`.
   Never put this value in Vercel, a URL, source control, or a tester invite.
   Reviewers enter it at the client URL with `?review=1`; the browser keeps it
   only in that tab's session storage.
6. Let Railway provide `PORT`; the server already reads it and exposes
   `/health` for the health check.
7. In the Vercel project, set `VITE_FEEDBACK_HTTP_ENDPOINT` to the Railway
   HTTPS origin and `VITE_SHARED_WS_ENDPOINT` to its `wss://` origin, then
   redeploy so Vite bakes those public endpoints into the client. A temporary
   `server=wss://…` URL override is also supported and is preserved when a
   player returns to solo, without opening a socket until they opt in again.
8. Turn on volume backups before inviting testers. Download a copy before any
   schema or protocol migration.

## Good alternatives

- **Colyseus Cloud** is the managed, game-specific option (currently starting
  at $15/month). It becomes attractive when avoiding server operations matters
  more than the extra cost. The current bootstrap would first need to adopt
  Colyseus Cloud's `defineServer()` project shape.
- **Render** supports WebSockets well, but the free service spins down and
  cannot attach the persistent disk this prototype needs. Use a paid instance
  plus disk if Render's dashboard is preferable.

For the first 3–5 invited testers, Vercel + Railway is the smallest practical
setup. Revisit managed Colyseus hosting or a database after the playtest proves
what actually needs scaling.
