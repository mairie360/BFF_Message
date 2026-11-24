// WebSocket journey of the integration stack, run by integration_test.sh once the newman
// collection passed: newman cannot open a WebSocket, so the frames of GET /ws (relayed from Message
// API's GET /api/v1/ws) are checked here, on the same stack, with Node's own WebSocket and fetch (no
// dependency).
//
// Users (init-test.sql, tokens signed by integration_test.sh): A = Admin (1), B = user 2, C = user 3.
// 1. A, B and C connect: each handshake is upgraded.
// 2. A creates a group with B, C stays outside. A posts: B receives NEW_MSG with the BFF's
//    conversation and message ids, A (the author) and C (not a member) receive nothing.
// 3. A posts a message mentioning B: B receives NEW_MSG then MENTIONED with the same ids, once each,
//    A (the author) and C (not a member) receive nothing. A edits it without a new mention: no MENTIONED.
// 4. B opens 5 more connections: Message API evicts the oldest one and the BFF relays its 4008. A
//    posts again: the 5 live connections of B all receive NEW_MSG.
// 5. A and B leave the group (deleted with its last member) and every socket is closed.
//
// Exit code 0 when every check passed, 1 otherwise.

const BASE_URL = process.env.BASE_URL ?? 'http://bff-message:4003';
const WS_URL = `${BASE_URL.replace(/^http/, 'ws')}/ws`;
const USERS = {
  A: { id: 1, token: process.env.JWT_ADMIN },
  B: { id: 2, token: process.env.JWT_AGENT },
  C: { id: 3, token: process.env.JWT_THIRD },
};
// Delivery budget of a signal: the epic asks for less than a second, CI runners get some slack.
const DELIVERY_MS = Number(process.env.WS_DELIVERY_MS ?? 3000);
// How long a connection that must stay silent is watched.
const SILENCE_MS = Number(process.env.WS_SILENCE_MS ?? 1500);
const MAX_CONNECTIONS = 5;
const EVICTED = 4008;

let failures = 0;
const sockets = [];

function check(name, ok, detail = '') {
  console.log(`${ok ? '  ✔' : '  ✘'} ${name}${ok || !detail ? '' : ` (${detail})`}`);
  if (!ok) failures += 1;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Whether `conn` is still upgraded: open, and never closed by the server. */
const isOpen = (conn) => conn.ws.readyState === WebSocket.OPEN && conn.closeCode === null;

/** Opens GET /ws as `user`; resolves once upgraded, rejects if the handshake fails. */
function connect(user, label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, { headers: { Authorization: `Bearer ${user.token}` } });
    const conn = { label, ws, frames: [], closeCode: null, waiters: [] };
    ws.addEventListener('open', () => resolve(conn), { once: true });
    ws.addEventListener('message', (event) => {
      let frame;
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        frame = { unparsable: String(event.data) };
      }
      conn.frames.push(frame);
      conn.waiters.splice(0).forEach((wake) => wake());
    });
    ws.addEventListener('close', (event) => {
      conn.closeCode = event.code;
      conn.waiters.splice(0).forEach((wake) => wake());
      reject(new Error(`${label}: closed before the upgrade (${event.code})`));
    });
    sockets.push(conn);
  });
}

/** Waits until `predicate(conn)` holds or `ms` elapsed; returns whether it holds. */
async function waitFor(conn, predicate, ms) {
  const deadline = Date.now() + ms;
  while (!predicate(conn)) {
    const left = deadline - Date.now();
    if (left <= 0) return false;
    await new Promise((wake) => {
      conn.waiters.push(wake);
      setTimeout(wake, left);
    });
  }
  return true;
}

async function api(user, method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} answered ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const newMsg = (conversationId, messageId) => (frame) =>
  frame.type === 'NEW_MSG' && frame.conversationId === conversationId && frame.messageId === messageId;
const mentioned = (conversationId, messageId) => (frame) =>
  frame.type === 'MENTIONED' && frame.conversationId === conversationId && frame.messageId === messageId;
const editedMsg = (conversationId, messageId) => (frame) =>
  frame.type === 'MSG_EDITED' && frame.conversationId === conversationId && frame.messageId === messageId;

async function main() {
  for (const [name, user] of Object.entries(USERS)) {
    if (!user.token) throw new Error(`the token of ${name} is missing (JWT_ADMIN, JWT_AGENT, JWT_THIRD)`);
  }

  console.log('MAIR-661 WebSocket handshake is upgraded for a valid session');
  const a = await connect(USERS.A, 'A');
  const b = await connect(USERS.B, 'B#1');
  const c = await connect(USERS.C, 'C');
  check('A, B and C are connected', [a, b, c].every((conn) => conn.ws.readyState === WebSocket.OPEN));

  console.log('MAIR-661 Only the other members receive the message signal');
  const { conversation: chat } = await api(USERS.A, 'POST', '/groups', {
    name: 'Temps réel (MAIR-661)',
    description: 'WebSocket journey of the integration tests',
    memberIds: [`user-${USERS.B.id}`],
  });
  // Whatever the creation itself signals is not part of this check.
  await sleep(300);
  [a, b, c].forEach((conn) => conn.frames.splice(0));

  const started = Date.now();
  const { message } = await api(USERS.A, 'POST', `/conversations/${chat.id}/messages`, { content: 'Bonjour B' });
  const delivered = await waitFor(b, (conn) => conn.frames.some(newMsg(chat.id, message.id)), DELIVERY_MS);
  check(`B receives NEW_MSG {conversationId, messageId} within ${DELIVERY_MS} ms`, delivered, JSON.stringify(b.frames));
  if (delivered) console.log(`    delivered in ${Date.now() - started} ms`);
  await sleep(SILENCE_MS);
  check('A, the author, receives nothing', a.frames.length === 0, JSON.stringify(a.frames));
  check('C, not a member, receives nothing', c.frames.length === 0, JSON.stringify(c.frames));
  check('B receives the signal once', b.frames.filter(newMsg(chat.id, message.id)).length === 1, JSON.stringify(b.frames));
  // A silent socket only proves the filtering while it is still open.
  check('A and C are still connected', [a, c].every(isOpen), `close codes ${a.closeCode} ${c.closeCode}`);

  console.log('MAIR-1182 The mentioned member receives MENTIONED once, besides NEW_MSG');
  [a, b, c].forEach((conn) => conn.frames.splice(0));
  const { message: mention } = await api(USERS.A, 'POST', `/conversations/${chat.id}/messages`, {
    content: 'Bonjour @B', mentionIds: [`user-${USERS.B.id}`],
  });
  const alerted = await waitFor(
    b,
    (conn) => conn.frames.some(newMsg(chat.id, mention.id)) && conn.frames.some(mentioned(chat.id, mention.id)),
    DELIVERY_MS,
  );
  check('B receives NEW_MSG and MENTIONED {conversationId, messageId} of the message', alerted, JSON.stringify(b.frames));
  const mentionFrame = b.frames.find(mentioned(chat.id, mention.id));
  check(
    'MENTIONED carries only type, conversationId and messageId',
    mentionFrame !== undefined && Object.keys(mentionFrame).sort().join(',') === 'conversationId,messageId,type',
    JSON.stringify(mentionFrame),
  );
  await sleep(SILENCE_MS);
  check('B receives MENTIONED once', b.frames.filter(mentioned(chat.id, mention.id)).length === 1, JSON.stringify(b.frames));
  check('A, the author, receives no MENTIONED', !a.frames.some((frame) => frame.type === 'MENTIONED'), JSON.stringify(a.frames));
  check('C, not a member, receives nothing', c.frames.length === 0, JSON.stringify(c.frames));

  console.log('MAIR-1182 An edit that keeps the same mention signals no new MENTIONED');
  b.frames.splice(0);
  await api(USERS.A, 'PATCH', `/conversations/${chat.id}/messages/${mention.id}`, { content: 'Bonjour encore @B' });
  const edited = await waitFor(b, (conn) => conn.frames.some(editedMsg(chat.id, mention.id)), DELIVERY_MS);
  check('B receives MSG_EDITED of the message', edited, JSON.stringify(b.frames));
  await sleep(SILENCE_MS);
  check('B receives no new MENTIONED for the edit', !b.frames.some((frame) => frame.type === 'MENTIONED'), JSON.stringify(b.frames));

  console.log(`MAIR-661 A ${MAX_CONNECTIONS + 1}th connection evicts the oldest with ${EVICTED}`);
  const others = [];
  for (let i = 2; i <= MAX_CONNECTIONS + 1; i += 1) {
    others.push(await connect(USERS.B, `B#${i}`));
  }
  const evicted = await waitFor(b, (conn) => conn.closeCode !== null, DELIVERY_MS);
  check(`the oldest connection of B is closed with ${EVICTED}`, evicted && b.closeCode === EVICTED, `close code ${b.closeCode}`);
  check(`the ${MAX_CONNECTIONS} newer connections stay open`, others.every((conn) => conn.ws.readyState === WebSocket.OPEN));

  const { message: second } = await api(USERS.A, 'POST', `/conversations/${chat.id}/messages`, { content: 'Encore là ?' });
  const all = await Promise.all(
    others.map((conn) => waitFor(conn, (x) => x.frames.some(newMsg(chat.id, second.id)), DELIVERY_MS)),
  );
  check(`the ${MAX_CONNECTIONS} live connections of B receive NEW_MSG`, all.every(Boolean), all.join(','));
  // The frames of B may arrive before a late one of C: give C the same time as after the first post.
  await sleep(SILENCE_MS);
  check('C still receives nothing', c.frames.length === 0, JSON.stringify(c.frames));
  check('C is still connected', isOpen(c), `close code ${c.closeCode}`);

  await api(USERS.A, 'DELETE', `/conversations/${chat.id}`);
  await api(USERS.B, 'DELETE', `/conversations/${chat.id}`);
}

try {
  await main();
} catch (error) {
  check('the journey ran to its end', false, error.message);
} finally {
  sockets.forEach((conn) => {
    if (conn.ws.readyState === WebSocket.OPEN) conn.ws.close(1000);
  });
}
console.log(failures === 0 ? 'WebSocket journey passed' : `WebSocket journey failed: ${failures} check(s)`);
process.exit(failures === 0 ? 0 : 1);
