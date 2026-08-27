# Smoke tests

These are not unit tests. They talk to a **real running server** over a real
WebSocket, because the things they check — a dropped socket, a held seat, a ban
landing at the wrong moment — only exist once there is a network involved.

Run a server first, in its own terminal:

```bash
# from the repo root
PORT=2599 PP_DATA_DIR=/tmp/pp-smoke \
  PAPR_OWNER_ACCOUNT=<a real passport id> \
  PP_MODERATION_TOKEN=modtoken \
  node --import tsx server/src/index.ts
```

Then:

```bash
node tools/smoke/reconnect.mjs    # a dropped visitor gets their seat back
node tools/smoke/ban-window.mjs   # a ban lands while somebody is disconnected
```

`reconnect.mjs` needs no owner. `ban-window.mjs` does: mint a passport with
`curl -X POST http://localhost:2599/account -H 'content-type: application/json'
-d '{"name":"tapps"}'`, start the server with that `accountId` as
`PAPR_OWNER_ACCOUNT`, and put the id and secret in `PP_OWNER_ID` and
`PP_OWNER_SECRET`.

Both take about 40 seconds. Most of that is deliberate waiting: the client SDK
refuses to auto-reconnect a room younger than 5 seconds, and then takes its own
exponential backoff to come home. Waiting it out is the point — a test that
skipped the wait would not be testing the thing that broke.
