// The safety-critical corner of reconnection: a ban that lands WHILE the
// person is disconnected.
//
// onAuth does not run again on a reconnection -- the seat was authorised when
// they first joined -- so without an explicit check in onReconnect, a banned
// account would walk straight back into the room it was just thrown out of.
// That is the whole reason this file exists.
//
// Needs a running server with PAPR_OWNER_ACCOUNT set, plus PP_OWNER_ID and
// PP_OWNER_SECRET in the environment. See tools/smoke/README.md.

delete globalThis.WebSocket;
const { Client } = await import('@colyseus/sdk');

const PORT = process.env.PP_SMOKE_PORT ?? '2599';
const HTTP = `http://localhost:${PORT}`;
const WS = `ws://localhost:${PORT}`;
const CODE = 'FERN-73';
const PROTOCOL = 4;

const owner = {
  id: process.env.PP_OWNER_ID ?? '',
  secret: process.env.PP_OWNER_SECRET ?? '',
};
if (!owner.id || !owner.secret) {
  console.error('Set PP_OWNER_ID and PP_OWNER_SECRET to the passport the server '
    + 'was started with. See tools/smoke/README.md.');
  process.exit(2);
}

let failures = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${ok ? '' : `  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function mint(name) {
  const res = await fetch(`${HTTP}/account`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const { accountId, secret } = await res.json();
  return { id: accountId, secret };
}

async function joinAs(account, name) {
  const client = new Client(WS);
  const room = await client.joinOrCreate('neighborhood', {
    protocol: PROTOCOL,
    name,
    avatar: { preset: 'medium', drawingKey: '', edgeColor: '#3a3226' },
    inviteCode: CODE,
    account,
  });
  const seen = { removed: null, left: null, dropped: [], reconnected: 0 };
  room.onMessage('removed', (r) => { seen.removed = r; });
  room.onMessage('chat-history', () => {});
  room.onMessage('blocks', () => {});
  room.onDrop((c) => seen.dropped.push(c));
  room.onReconnect(() => { seen.reconnected += 1; });
  room.onLeave((c) => { seen.left = c; });
  return { room, seen };
}

const nuisance = await mint('nuisance');

const host = await joinAs(owner, 'tapps');
const guest = await joinAs(nuisance, 'nuisance');
await wait(600);
check('the owner is flagged as owner',
  host.room.state.players.get(host.room.sessionId)?.isOwner, true);
check('both are present', host.room.state.players.size, 2);

console.log('\n(waiting out the SDK minUptime before pulling the plug)');
await wait(5200);

// -- They drop out, and the seat is held. ----------------------------------
guest.room.connection.transport.ws.terminate();
await wait(800);
check('the guest is in the reconnection window', guest.seen.dropped[0], 1006);
check('their paper self is still standing there', host.room.state.players.size, 2);

// -- The owner bans them WHILE they are away. ------------------------------
host.room.send('remove', { accountId: nuisance.id, ban: true });
await wait(800);
check('the owner sees them cleared out immediately', host.room.state.players.size, 1);

// -- The browser keeps knocking. It must not be let back in. ---------------
const deadline = Date.now() + 25_000;
while (guest.seen.left === null && guest.seen.reconnected === 0 && Date.now() < deadline) {
  await wait(300);
}

check('the banned account did NOT get its seat back', guest.seen.left !== null, true);
// They are owed an explanation, not a mystery disconnection.
check('they were told it was a ban', guest.seen.removed?.reason, 'banned');
check('the room is still just the owner', host.room.state.players.size, 1);

// -- And a fresh entry is refused at the door. -----------------------------
let freshRefused = false;
try { await joinAs(nuisance, 'nuisance'); } catch { freshRefused = true; }
check('a fresh join is refused too', freshRefused, true);

await host.room.leave();
await wait(400);

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
