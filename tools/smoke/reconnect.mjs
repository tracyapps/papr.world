// Does a dropped visitor actually get back into the SAME seat?
//
// This simulates the real failure rather than a polite one: the socket dies
// with no close frame, which is what bad wifi, a closed laptop lid, or a proxy
// giving up all look like from the server's side. Everything asserted here is
// something a person would notice -- their avatar staying put, their chat
// catching up, and what they typed while offline still arriving.
//
// Needs a running server. See tools/smoke/README.md.

// Node has a global WebSocket, which the SDK prefers -- but it offers no way
// to kill a socket without a close frame. Hiding it makes the SDK fall back to
// the `ws` package, whose terminate() is exactly what a dead network looks
// like. Harness detail only; browsers reach code 1006 by themselves.
delete globalThis.WebSocket;
const { Client } = await import('@colyseus/sdk');

const PORT = process.env.PP_SMOKE_PORT ?? '2599';
const HTTP = `http://localhost:${PORT}`;
const WS = `ws://localhost:${PORT}`;
const CODE = 'WREN-42';
const PROTOCOL = 4;

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
  const seen = { chat: [], histories: [], blocks: [], dropped: [], reconnected: 0, left: null };
  room.onMessage('chat', (l) => seen.chat.push(l));
  room.onMessage('chat-history', (h) => seen.histories.push(h.lines));
  room.onMessage('blocks', (b) => seen.blocks.push(b.accountIds));
  room.onDrop((code) => seen.dropped.push(code));
  room.onReconnect(() => { seen.reconnected += 1; });
  room.onLeave((code) => { seen.left = code; });
  return { room, seen };
}

const wren = await mint('wren');
const fern = await mint('fern');

const a = await joinAs(wren, 'wren');
const b = await joinAs(fern, 'fern');
await wait(600);

const fernSeat = b.room.sessionId;
check('both are in the room', a.room.state.players.size, 2);

a.room.send('chat', { text: 'before the drop' });
await wait(400);
check('chat works before the drop', b.seen.chat.some((l) => l.text === 'before the drop'), true);

// The SDK refuses to auto-reconnect a room younger than minUptime (5s).
console.log('\n(waiting out the SDK minUptime before pulling the plug)');
await wait(5200);

// -- Pull the plug. terminate() = no close frame = a real network death. ----
b.room.connection.transport.ws.terminate();
await wait(600);
check('the dropped client noticed', b.seen.dropped.length > 0, true);
check('it was an abnormal close, not a goodbye', b.seen.dropped[0], 1006);
check('the visit is NOT over', b.seen.left, null);

// Anything typed while away should be queued, not lost.
b.room.send('chat', { text: 'typed while offline' });

// -- The seat is held: everyone else still sees them standing there. -------
await wait(1500);
check('the other player still sees them in the room', a.room.state.players.size, 2);
const stillThere = [...a.room.state.players.values()].some((p) => p.accountId === fern.id);
check('their paper self stayed put', stillThere, true);

// -- Wait for the SDK's own backoff to get them home. ----------------------
const deadline = Date.now() + 25_000;
while (b.seen.reconnected === 0 && b.seen.left === null && Date.now() < deadline) await wait(300);

check('they got back in', b.seen.reconnected, 1);
check('the visit never ended', b.seen.left, null);
check('SAME seat, not a new stranger', b.room.sessionId, fernSeat);
check('the room did not gain a ghost', a.room.state.players.size, 2);

await wait(800);
// Everything in room state survived on its own; the backlog and the block
// list are messages, so onReconnect has to send them again.
check('they were re-briefed with the backlog', b.seen.histories.length, 2);
check('the backlog still has what was said',
  (b.seen.histories.at(-1) ?? []).some((l) => l.text === 'before the drop'), true);
check('their block list came back too', b.seen.blocks.length, 2);

check('what they typed while offline still arrived',
  a.seen.chat.some((l) => l.text === 'typed while offline'), true);

// -- And normal life resumes. ----------------------------------------------
a.room.send('chat', { text: 'after the drop' });
await wait(600);
check('chat reaches them again', b.seen.chat.some((l) => l.text === 'after the drop'), true);

await a.room.leave();
await b.room.leave();
await wait(400);

console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
