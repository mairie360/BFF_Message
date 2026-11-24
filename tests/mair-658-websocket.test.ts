import { randomBytes } from 'node:crypto';
import http, { type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { OpenApiContract } from './support/openapi-contract';
import { foreignKeyPair, eddsaToken } from './support/session-keys';
import { authorizationFor, users } from './support/upstream-fixtures';
import {
  CLOSE, MAX_FRAME_SIZE, attachRealtime, clientCodeForUpstreamClose, isWebSocketHandshake, jitteredLifetime,
  translateFrame, upstreamCodeForClientClose, wsMaxMs, type Realtime,
} from '../src/routes/Messages/realtime';

// MAIR-658: GET /ws relays Message API's WebSocket (MAIR-657) following the contract of MAIR-656 (Message_API
// docs/en/realtime-websocket.md). A local `ws` server stands in for Message API: the published Message API contract
// cannot describe frames, so its handshake and frames are the ones of the contract document.

const { agent, sophie } = users;
/** A fresh `Sec-WebSocket-Key` (16 random bytes, base64) for the hand-written handshakes. */
const handshakeKey = (): string => randomBytes(16).toString('base64');
const bffContract = OpenApiContract.load(path.join(__dirname, '..', 'contracts', 'openapi.json'));
/** Short intervals, so liveness and lifetime are tested in milliseconds. */
const FAST = { pingIntervalMs: 100, pongTimeoutMs: 350, handshakeTimeoutMs: 500, maxLifetimeMs: 60_000 };

// ----- Message API stand-in -----

interface FakeMessageApi {
  url: string;
  /** Status answered to the next handshakes instead of upgrading (`undefined`: upgrade). */
  refuseWith?: number;
  /** Handshakes received, with their `Authorization` header. */
  handshakes: { authorization?: string; path?: string }[];
  /** Connections Message API accepted, in order. */
  connections: WebSocket[];
  /** Data frames the BFF sent to Message API. */
  received: string[];
  /** Close codes the BFF sent to Message API. */
  closes: number[];
  next(): Promise<WebSocket>;
  stop(): Promise<void>;
}

async function startMessageApi(): Promise<FakeMessageApi> {
  const wss = new WebSocketServer({ noServer: true });
  const server = http.createServer((_req, res) => { res.statusCode = 404; res.end(); });
  const waiting: ((ws: WebSocket) => void)[] = [];
  const api: FakeMessageApi = {
    url: '',
    handshakes: [],
    connections: [],
    received: [],
    closes: [],
    next: () => new Promise((resolve) => {
      const ready = api.connections[api.connections.length - 1];
      if (ready && !(ready as WebSocket & { taken?: boolean }).taken) {
        (ready as WebSocket & { taken?: boolean }).taken = true;
        resolve(ready);
      } else {
        waiting.push(resolve);
      }
    }),
    stop: async () => {
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    api.handshakes.push({ authorization: req.headers.authorization, path: req.url });
    if (api.refuseWith !== undefined) {
      socket.end(`HTTP/1.1 ${api.refuseWith} Refused\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('message', (data) => api.received.push(data.toString()));
      ws.on('close', (code) => api.closes.push(code));
      api.connections.push(ws);
      const resolve = waiting.shift();
      if (resolve) {
        (ws as WebSocket & { taken?: boolean }).taken = true;
        resolve(ws);
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  api.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return api;
}

// ----- BFF under test -----

let messageApi: FakeMessageApi;
let bff: http.Server;
let realtime: Realtime;
let bffUrl: string;
const opened: WebSocket[] = [];

async function startBff(timings = FAST) {
  const { app } = await import('../src/app');
  bff = http.createServer(app);
  realtime = attachRealtime(bff, timings);
  bff.listen(0, '127.0.0.1');
  await once(bff, 'listening');
  bffUrl = `ws://127.0.0.1:${(bff.address() as AddressInfo).port}`;
}

async function stopBff() {
  realtime.detach();
  bff.closeAllConnections();
  await new Promise((resolve) => bff.close(resolve));
}

beforeEach(async () => {
  messageApi = await startMessageApi();
  process.env.MESSAGE_API_URL = messageApi.url;
  await startBff();
});
afterEach(async () => {
  for (const ws of opened.splice(0)) ws.terminate();
  await stopBff();
  await messageApi.stop();
  delete process.env.MESSAGE_WS_MAX_MS;
});

type Handshake =
  | { upgraded: true; ws: WebSocket }
  | { upgraded: false; status: number; body: unknown };

/** Opens `GET /ws` on the BFF: the socket once upgraded, or the status and body of the refusal. */
function connect(authorization: string | null = authorizationFor(agent.id), options: { autoPong?: boolean; path?: string } = {}) {
  return new Promise<Handshake>((resolve, reject) => {
    const ws = new WebSocket(`${bffUrl}${options.path ?? '/ws'}`, {
      headers: authorization === null ? {} : { Authorization: authorization },
      autoPong: options.autoPong ?? true,
    });
    opened.push(ws);
    ws.once('open', () => resolve({ upgraded: true, ws }));
    ws.once('unexpected-response', (_req, res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { text += chunk; });
      res.on('end', () => {
        let body: unknown = text;
        try { body = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ upgraded: false, status: res.statusCode ?? 0, body });
      });
    });
    ws.once('error', (error) => {
      // `unexpected-response` already settled the promise; any other error before `open` is a failure of the test.
      if (ws.readyState !== WebSocket.CLOSED) reject(error);
    });
  });
}

async function connected(authorization?: string | null, options?: { autoPong?: boolean }) {
  const handshake = await connect(authorization, options);
  if (!handshake.upgraded) throw new Error(`refused with ${handshake.status}: ${JSON.stringify(handshake.body)}`);
  return { client: handshake.ws, upstream: await messageApi.next() };
}

/** The next text frame the client receives, parsed. */
async function nextEvent(ws: WebSocket, timeoutMs = 2_000): Promise<unknown> {
  const [data] = await withTimeout(once(ws, 'message'), timeoutMs, 'a frame');
  return JSON.parse(String(data));
}

/** Whether no frame reaches `ws` within `ms`. */
async function silent(ws: WebSocket, ms = 300): Promise<boolean> {
  let received = false;
  const onMessage = () => { received = true; };
  ws.on('message', onMessage);
  await new Promise((resolve) => setTimeout(resolve, ms));
  ws.off('message', onMessage);
  return !received;
}

/** The close code and reason `ws` receives. */
async function closeOf(ws: WebSocket, timeoutMs = 3_000): Promise<{ code: number; reason: string }> {
  if (ws.readyState === WebSocket.CLOSED) throw new Error('already closed');
  const [code, reason] = await withTimeout(once(ws, 'close'), timeoutMs, 'the close');
  return { code: code as number, reason: String(reason) };
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(`no ${what} within ${ms} ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

const errorBody = (code: string) => expect.objectContaining({
  error: expect.objectContaining({ code, message: expect.any(String), details: expect.any(Array) }),
});

// ----- Pure helpers (TU) -----

describe('MAIR-658 frame translation', () => {
  test('translates the four signals of the contract to the front ids', () => {
    expect(JSON.parse(translateFrame('{"type":"NEW_MSG","chat_id":5,"message_id":118}')!))
      .toEqual({ type: 'NEW_MSG', conversationId: 'conversation-5', messageId: 'message-118' });
    expect(JSON.parse(translateFrame('{"type":"MSG_EDITED","chat_id":5,"message_id":118}')!))
      .toEqual({ type: 'MSG_EDITED', conversationId: 'conversation-5', messageId: 'message-118' });
    expect(JSON.parse(translateFrame('{"type":"MSG_DELETED","chat_id":5,"message_id":118}')!))
      .toEqual({ type: 'MSG_DELETED', conversationId: 'conversation-5', messageId: 'message-118' });
    expect(JSON.parse(translateFrame('{"type":"CHAT_READ","chat_id":5,"message_id":118,"unread_count":0}')!))
      .toEqual({ type: 'CHAT_READ', conversationId: 'conversation-5', messageId: 'message-118', unreadCount: 0 });
  });

  test('omits messageId for a signal of an API replica older than MAIR-524', () => {
    expect(JSON.parse(translateFrame('{"type":"NEW_MSG","chat_id":7}')!))
      .toEqual({ type: 'NEW_MSG', conversationId: 'conversation-7' });
  });

  test('drops unknown types and invalid frames, keeps no extra field', () => {
    for (const frame of [
      '{"type":"TYPING","chat_id":5}', 'not json', '{"type":"NEW_MSG","chat_id":"5"}', '{"type":"NEW_MSG"}',
      '{"type":"NEW_MSG","chat_id":-1}', '[]', 'null',
    ]) {
      expect(translateFrame(frame)).toBeNull();
    }
    expect(JSON.parse(translateFrame('{"type":"NEW_MSG","chat_id":5,"secret":"x","unread_count":3}')!))
      .toEqual({ type: 'NEW_MSG', conversationId: 'conversation-5' });
  });
});

describe('MAIR-658 close codes and lifetime', () => {
  test('relays 1000, 1001, 4001 and 4008 from Message API, anything else becomes 1013', () => {
    for (const code of [1000, 1001, 4001, 4008]) expect(clientCodeForUpstreamClose(code)).toBe(code);
    for (const code of [1002, 1003, 1006, 1009, 1011, 1013, 4000]) expect(clientCodeForUpstreamClose(code)).toBe(1013);
  });

  test('forwards to Message API the client codes one may send, 1000 otherwise', () => {
    for (const code of [1000, 1001, 4000, 4999]) expect(upstreamCodeForClientClose(code)).toBe(code);
    for (const code of [1005, 1006, 1009, 1015]) expect(upstreamCodeForClientClose(code)).toBe(1000);
  });

  test('MESSAGE_WS_MAX_MS defaults to 30 minutes and the lifetime is jittered by ± 10 %', () => {
    expect(wsMaxMs()).toBe(1_800_000);
    process.env.MESSAGE_WS_MAX_MS = '1000';
    expect(wsMaxMs()).toBe(1000);
    process.env.MESSAGE_WS_MAX_MS = 'soon';
    expect(wsMaxMs()).toBe(1_800_000);
    expect(jitteredLifetime(1000, () => 0)).toBe(900);
    expect(jitteredLifetime(1000, () => 0.5)).toBe(1000);
    expect(jitteredLifetime(1000, () => 0.999_999)).toBe(1100);
  });

  test('isWebSocketHandshake requires GET, Upgrade, version 13 and a well-formed key', () => {
    const headers = {
      upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': handshakeKey(),
    };
    const req = (overrides: Record<string, string | undefined>, method = 'GET') =>
      ({ method, headers: { ...headers, ...overrides } }) as unknown as IncomingMessage;
    expect(isWebSocketHandshake(req({}))).toBe(true);
    expect(isWebSocketHandshake(req({ upgrade: 'WebSocket' }))).toBe(true);
    expect(isWebSocketHandshake(req({}, 'POST'))).toBe(false);
    expect(isWebSocketHandshake(req({ upgrade: 'h2c' }))).toBe(false);
    expect(isWebSocketHandshake(req({ 'sec-websocket-version': '8' }))).toBe(false);
    expect(isWebSocketHandshake(req({ 'sec-websocket-key': 'short' }))).toBe(false);
  });
});

// ----- Handshake (TI technical, against the stand-in) -----

describe('MAIR-658 GET /ws handshake', () => {
  test('is declared in the BFF contract with its refusals', () => {
    const match = bffContract.match('get', '/ws');
    expect(match?.template).toBe('/ws');
    for (const status of [101, 400, 401, 502, 503]) {
      expect(bffContract.responseSchema(match!, status).documented).toBe(true);
    }
  });

  test('refuses a handshake without a session with 401, before any upstream call', async () => {
    const handshake = await connect(null);
    expect(handshake).toEqual({ upgraded: false, status: 401, body: errorBody('UNAUTHORIZED') });
    expect(messageApi.handshakes).toEqual([]);
  });

  test('refuses a forged or expired token with 401, before any upstream call', async () => {
    for (const token of [
      eddsaToken(agent.id, { privateKey: foreignKeyPair.privateKey }),
      eddsaToken(agent.id, { expiresIn: -60 }),
      'not-a-jwt',
    ]) {
      expect(await connect(`Bearer ${token}`)).toEqual({ upgraded: false, status: 401, body: errorBody('UNAUTHORIZED') });
    }
    expect(messageApi.handshakes).toEqual([]);
  });

  test('answers 503 when Message API is not configured', async () => {
    delete process.env.MESSAGE_API_URL;
    expect(await connect()).toEqual({ upgraded: false, status: 503, body: errorBody('SERVICE_UNAVAILABLE') });
  });

  test('a plain GET /ws is not upgraded: 401 without a session, 400 with one', async () => {
    const plain = (authorization?: string) => fetch(`${bffUrl.replace('ws', 'http')}/ws`, {
      headers: authorization ? { Authorization: authorization } : {},
    });
    const anonymous = await plain();
    expect(anonymous.status).toBe(401);
    const response = await plain(authorizationFor(agent.id));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(errorBody('BAD_REQUEST'));
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(messageApi.handshakes).toEqual([]);
  });

  test('refuses a handshake with an invalid version with 400, before any upstream call', async () => {
    const port = (bff.address() as AddressInfo).port;
    const raw = await new Promise<string>((resolve) => {
      const req = http.request({
        port,
        host: '127.0.0.1',
        path: '/ws',
        headers: {
          Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '8',
          'Sec-WebSocket-Key': handshakeKey(), Authorization: authorizationFor(agent.id),
        },
      });
      req.on('response', (res) => resolve(String(res.statusCode)));
      req.on('upgrade', () => resolve('upgraded'));
      req.end();
    });
    expect(raw).toBe('400');
    expect(messageApi.handshakes).toEqual([]);
  });

  test('refuses an upgrade on another path with 404', async () => {
    expect(await connect(authorizationFor(agent.id), { path: '/stream' }))
      .toEqual({ upgraded: false, status: 404, body: errorBody('NOT_FOUND') });
    expect(messageApi.handshakes).toEqual([]);
  });

  test('forwards the caller\'s token to Message API /api/v1/ws, nothing in the URL', async () => {
    const authorization = authorizationFor(agent.id);
    await connected(authorization);
    expect(messageApi.handshakes).toEqual([{ authorization, path: '/api/v1/ws' }]);
  });

  test.each([401, 404])('answers 401 when Message API refuses the session with %i', async (status) => {
    messageApi.refuseWith = status;
    expect(await connect()).toEqual({ upgraded: false, status: 401, body: errorBody('UNAUTHORIZED') });
  });

  test.each([400, 429, 500, 503])('answers 502 when Message API answers %i', async (status) => {
    messageApi.refuseWith = status;
    expect(await connect()).toEqual({ upgraded: false, status: 502, body: errorBody('BAD_GATEWAY') });
  });

  test('answers 502 when Message API is unreachable', async () => {
    await messageApi.stop();
    expect(await connect()).toEqual({ upgraded: false, status: 502, body: errorBody('BAD_GATEWAY') });
  });
});

// ----- Relay -----

describe('MAIR-658 relay', () => {
  /** Business journey through the BFF ids: B is told about A's message, its edit and deletion, then reads it. */
  test('relays the signals of a conversation with the front ids, in order', async () => {
    const { client, upstream } = await connected(authorizationFor(agent.id));
    const events: unknown[] = [];
    client.on('message', (data) => events.push(JSON.parse(String(data))));

    upstream.send('{"type":"NEW_MSG","chat_id":101,"message_id":9001}');
    upstream.send('{"type":"TYPING","chat_id":101}');
    upstream.send('not json');
    upstream.send(Buffer.from('{"type":"NEW_MSG","chat_id":101}'), { binary: true });
    upstream.send('{"type":"MSG_EDITED","chat_id":101,"message_id":9001}');
    upstream.send('{"type":"MSG_DELETED","chat_id":101,"message_id":9001}');
    upstream.send('{"type":"CHAT_READ","chat_id":101,"message_id":9001,"unread_count":0}');

    await withTimeout((async () => { while (events.length < 4) await once(client, 'message'); })(), 2_000, '4 frames');
    expect(events).toEqual([
      { type: 'NEW_MSG', conversationId: 'conversation-101', messageId: 'message-9001' },
      { type: 'MSG_EDITED', conversationId: 'conversation-101', messageId: 'message-9001' },
      { type: 'MSG_DELETED', conversationId: 'conversation-101', messageId: 'message-9001' },
      { type: 'CHAT_READ', conversationId: 'conversation-101', messageId: 'message-9001', unreadCount: 0 },
    ]);
    expect(await silent(client)).toBe(true);
  });

  test('each client gets its own upstream connection and only its signals', async () => {
    const a = await connected(authorizationFor(agent.id));
    const b = await connected(authorizationFor(sophie.id));
    a.upstream.send('{"type":"NEW_MSG","chat_id":1,"message_id":2}');
    expect(await nextEvent(a.client)).toEqual({ type: 'NEW_MSG', conversationId: 'conversation-1', messageId: 'message-2' });
    expect(await silent(b.client)).toBe(true);
    expect(realtime.size).toBe(2);
  });

  test('never forwards a data frame of the client to Message API', async () => {
    const { client, upstream } = await connected();
    client.send('{"type":"NEW_MSG","chat_id":1}');
    client.send(Buffer.from([1, 2, 3]));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(messageApi.received).toEqual([]);
    expect(upstream.readyState).toBe(WebSocket.OPEN);
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  test('closes with 1009 a client frame larger than 4 KiB, and Message API\'s connection too', async () => {
    const { client, upstream } = await connected();
    const upstreamClosed = once(upstream, 'close');
    client.send('x'.repeat(MAX_FRAME_SIZE + 1));
    expect((await closeOf(client)).code).toBe(1009);
    await withTimeout(upstreamClosed, 2_000, 'the upstream close');
  });
});

// ----- Mentions -----

describe('MAIR-1182 mention signal', () => {
  test('MAIR-1182 translates MENTIONED with the front ids', () => {
    expect(JSON.parse(translateFrame('{"type":"MENTIONED","chat_id":5,"message_id":118}')!))
      .toEqual({ type: 'MENTIONED', conversationId: 'conversation-5', messageId: 'message-118' });
  });

  test('MAIR-1182 drops a MENTIONED without message id and keeps no unread count', () => {
    expect(translateFrame('{"type":"MENTIONED","chat_id":5}')).toBeNull();
    expect(JSON.parse(translateFrame('{"type":"MENTIONED","chat_id":5,"message_id":118,"unread_count":2}')!))
      .toEqual({ type: 'MENTIONED', conversationId: 'conversation-5', messageId: 'message-118' });
  });

  test('MAIR-1182 the published contract lists MENTIONED among the event types', () => {
    const schemas = (bffContract as unknown as { document: { components: { schemas: Record<string, {
      properties: { type: { enum: string[] } };
    }> } } }).document.components.schemas;
    expect(schemas.MessageRealtimeEvent.properties.type.enum)
      .toEqual(['NEW_MSG', 'MSG_EDITED', 'MSG_DELETED', 'CHAT_READ', 'MENTIONED']);
  });

  /** Business journey: B is mentioned in A's message, so it gets the message signal then the mention, once each. */
  test('MAIR-1182 relays NEW_MSG then MENTIONED of the same message to the mentioned member', async () => {
    const { client, upstream } = await connected(authorizationFor(agent.id));
    const events: unknown[] = [];
    client.on('message', (data) => events.push(JSON.parse(String(data))));

    upstream.send('{"type":"NEW_MSG","chat_id":101,"message_id":9002}');
    upstream.send('{"type":"MENTIONED","chat_id":101}');
    upstream.send('{"type":"MENTIONED","chat_id":101,"message_id":9002}');

    await withTimeout((async () => { while (events.length < 2) await once(client, 'message'); })(), 2_000, '2 frames');
    expect(events).toEqual([
      { type: 'NEW_MSG', conversationId: 'conversation-101', messageId: 'message-9002' },
      { type: 'MENTIONED', conversationId: 'conversation-101', messageId: 'message-9002' },
    ]);
    expect(await silent(client)).toBe(true);
  });
});

// ----- Closure -----

describe('MAIR-658 closure', () => {
  test.each([
    [4001, 'session expired'],
    [4008, 'evicted'],
    [1001, 'pong timeout'],
  ])('relays Message API\'s %i with its reason', async (code, reason) => {
    const { client, upstream } = await connected();
    upstream.close(code, reason);
    expect(await closeOf(client)).toEqual({ code, reason });
    // The BFF forgets the client once the closing handshake is over, right after the client saw the close frame.
    await withTimeout((async () => { while (realtime.size > 0) await new Promise((r) => setTimeout(r, 10)); })(), 1_000, 'the removal');
  });

  test('closes with 1013 when Message API\'s connection drops abnormally', async () => {
    const { client, upstream } = await connected();
    upstream.terminate();
    expect(await closeOf(client)).toEqual({ code: CLOSE.UPSTREAM_UNAVAILABLE, reason: 'upstream unavailable' });
  });

  test('closes with 1013 when Message API closes with a code the client must not act on', async () => {
    const { client, upstream } = await connected();
    upstream.close(1011, 'internal');
    expect((await closeOf(client)).code).toBe(1013);
  });

  test('a client close closes Message API\'s connection with the same code when one may send it', async () => {
    const first = await connected();
    first.client.close(1000);
    await withTimeout(once(first.upstream, 'close'), 2_000, 'the upstream close');
    const second = await connected();
    second.client.close(4100, 'bye');
    await withTimeout(once(second.upstream, 'close'), 2_000, 'the upstream close');
    expect(messageApi.closes).toEqual([1000, 4100]);
  });

  test('a client that drops without a close frame closes Message API\'s connection with 1000', async () => {
    const { client, upstream } = await connected();
    const closed = once(upstream, 'close');
    client.terminate();
    const [code] = await withTimeout(closed, 2_000, 'the upstream close');
    expect(code).toBe(1000);
  });

  test('a client answering the pings stays open', async () => {
    const { client } = await connected();
    expect(await silent(client, FAST.pongTimeoutMs * 3)).toBe(true);
    expect(client.readyState).toBe(WebSocket.OPEN);
  });

  test('a client answering no ping is closed with 1001, and Message API\'s connection with it', async () => {
    const { client, upstream } = await connected(authorizationFor(agent.id), { autoPong: false });
    let pinged = false;
    client.on('ping', () => { pinged = true; });
    const upstreamClosed = once(upstream, 'close');
    expect(await closeOf(client, FAST.pongTimeoutMs * 4)).toEqual({ code: 1001, reason: 'pong timeout' });
    expect(pinged).toBe(true);
    await withTimeout(upstreamClosed, 2_000, 'the upstream close');
  });

  test('closes with 1001 after the maximum lifetime', async () => {
    await stopBff();
    await startBff({ ...FAST, maxLifetimeMs: 300 });
    const { client, upstream } = await connected();
    const upstreamClosed = once(upstream, 'close');
    const started = Date.now();
    expect(await closeOf(client)).toEqual({ code: 1001, reason: 'max lifetime' });
    expect(Date.now() - started).toBeGreaterThanOrEqual(250);
    const [code] = await withTimeout(upstreamClosed, 2_000, 'the upstream close');
    expect(code).toBe(1001);
  });

  test('closeAll closes every client with 1001 (shutdown)', async () => {
    const a = await connected();
    const b = await connected(authorizationFor(sophie.id));
    const closes = Promise.all([closeOf(a.client), closeOf(b.client)]);
    realtime.closeAll();
    expect((await closes).map((close) => close.code)).toEqual([1001, 1001]);
  });
});

describe('MAIR-658 shutdown of the real entry point', () => {
  test('serve() relays /ws and the SIGTERM drain closes the open sockets with 1001 instead of waiting for them', async () => {
    const { serve } = await import('../src/index');
    const saved = { ...process.env };
    for (const service of ['CORE_API', 'PROJECT_API', 'CALENDAR_API']) process.env[`${service}_URL`] = 'http://127.0.0.1:1';
    const { server, shutdown } = serve(0);
    try {
      if (!server.listening) await once(server, 'listening');
      const client = new WebSocket(`ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`, {
        headers: { Authorization: authorizationFor(agent.id) },
      });
      opened.push(client);
      await withTimeout(once(client, 'open'), 2_000, 'the upgrade');
      const closed = closeOf(client);
      await expect(shutdown.shutdown('test')).resolves.toBe(0);
      expect(await closed).toEqual({ code: 1001, reason: 'server shutdown' });
    } finally {
      shutdown.dispose();
      process.env = saved;
    }
  });
});
