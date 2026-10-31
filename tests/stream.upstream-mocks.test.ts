import http from 'node:http';
import { INVALID_SESSION_MESSAGE } from '@mairie360/bffs-lib';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { ContractMockServer, unreachableUrl } from './support/contract-mock-server';
import { OpenApiContract } from './support/openapi-contract';
import { loadOrvalContract } from './support/orval-contract';
import { authorizationFor, messageApiUrls, users } from './support/upstream-fixtures';
import { RECONNECT_DELAY_MS, STREAM_ERROR_EVENT, translateEvent } from '../src/routes/Messages/stream';

// MAIR-525: GET /stream relays Message API's SSE channel so the front stops polling. Message API is served by a local
// HTTP server checked against its published contract; a hand-written server stands in for a stream that never ends.

const { agent } = users;
const messageApi = new ContractMockServer('MESSAGE_API', loadOrvalContract('@mairie360/message-api-openapi'));
const STREAM = '/api/v1/stream';
const bffContract = OpenApiContract.load(path.join(__dirname, '..', 'contracts', 'openapi.json'));
const sse = (body: string) => ({ raw: body, contentType: 'text/event-stream' });
/** What every stream starts with, before Message API answers (MAIR-561). */
const OPENING = `retry: ${RECONNECT_DELAY_MS}\n\n: connected\n\n`;
const streamError = (code: string, message: string) =>
  `event: ${STREAM_ERROR_EVENT}\ndata: ${JSON.stringify({ error: { code, message, details: [] } })}\n\n`;

let app: Express;

beforeAll(async () => {
  await messageApi.start();
  ({ app } = await import('../src/app'));
});
afterAll(async () => { await messageApi.stop(); });
beforeEach(() => {
  messageApi.reset();
  process.env.MESSAGE_API_URL = messageApi.url;
  delete process.env.MESSAGE_STREAM_MAX_MS;
});
afterEach(() => {
  jest.restoreAllMocks();
  expect(messageApi.violations).toEqual([]);
});

/** GET /stream, its body read as text until the stream ends. */
function openStream(authorization: string | null = authorizationFor(agent.id), headers: Record<string, string> = {}) {
  let call = request(app).get('/stream').buffer(true).parse((res, done) => {
    let text = '';
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => { text += chunk; });
    res.on('end', () => done(null, text));
  });
  if (authorization !== null) call = call.set('Authorization', authorization);
  for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
  return call;
}

function expectBffContract(response: request.Response) {
  const match = bffContract.match('get', '/stream');
  expect(match?.template).toBe('/stream');
  expect(bffContract.responseSchema(match!, response.status).documented).toBe(true);
}

describe('GET /stream (MAIR-525)', () => {
  test('relays Message API signals with the front ids, keeps the pings and drops the rest', async () => {
    messageApi.on('get', STREAM, sse([
      ': ping',
      'data: {"type":"NEW_MSG","chat_id":5}',
      'id: 41\ndata: {"type":"NEW_MSG","chat_id":7}',
      'data: not json',
      'data: {"type":"NEW_MSG","chat_id":"x"}',
      'event: other\ndata: {"unexpected":true}',
    ].join('\n\n') + '\n\n'));

    const response = await openStream(authorizationFor(agent.id), { 'Last-Event-ID': '40' });

    expect(response.status).toBe(200);
    expectBffContract(response);
    expect(response.headers['content-type']).toMatch(/^text\/event-stream/);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toBe(OPENING + [
      ': ping',
      'data: {"type":"NEW_MSG","conversationId":"conversation-5"}',
      'id: 41\ndata: {"type":"NEW_MSG","conversationId":"conversation-7"}',
    ].join('\n\n') + '\n\n');
    const [call] = messageApi.calls(STREAM, 'get');
    expect(call.url.pathname).toBe(messageApiUrls.getSseStreamRouteUrl());
    expect(call.headers.authorization).toBe(authorizationFor(agent.id));
    expect(call.headers.accept).toBe('text/event-stream');
    // Forwarded so that Message API can resume once it keeps a cursor (MAIR-524).
    expect(call.headers['last-event-id']).toBe('40');
  });

  test('answers 401 without any upstream call when the session is missing', async () => {
    const response = await request(app).get('/stream');

    expect(response.status).toBe(401);
    expectBffContract(response);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(messageApi.requests).toHaveLength(0);
  });

  // MAIR-561: the head is already sent when Message API answers, so its refusal ends the stream with an event.
  test('relays a session Message API refuses as an UNAUTHORIZED stream_error event, without its body', async () => {
    messageApi.on('get', STREAM, { status: 401, raw: 'Jeton expiré', contentType: 'text/plain', outOfContract: true });

    const response = await openStream();

    expect(response.status).toBe(200);
    expectBffContract(response);
    expect(response.body).toBe(OPENING + streamError('UNAUTHORIZED', INVALID_SESSION_MESSAGE));
    expect(response.body).not.toContain('Jeton');
  });

  test.each([
    ['a server error', () => messageApi.on('get', STREAM, { status: 500, raw: 'boom', contentType: 'text/plain', outOfContract: true }), 'Upstream service error'],
    ['an unreachable Message API', async () => { process.env.MESSAGE_API_URL = await unreachableUrl(); }, 'The MESSAGE_API service is unavailable.'],
  ])('ends the stream with a BAD_GATEWAY stream_error event on %s', async (_label, breakIt, message) => {
    await breakIt();

    const response = await openStream();

    expect(response.status).toBe(200);
    expectBffContract(response);
    expect(response.body).toBe(OPENING + streamError('BAD_GATEWAY', message));
  });

  test('answers 503 when Message API is not configured', async () => {
    delete process.env.MESSAGE_API_URL;

    const response = await request(app).get('/stream').set('Authorization', authorizationFor(agent.id));

    expect(response.status).toBe(503);
    expectBffContract(response);
  });

  // MAIR-561: the front's proxy gave up after 15 s of silence, while Message API sent nothing before its first ping.
  test('sends its text/event-stream head and first comment before Message API answers', async () => {
    let answerUpstream: () => void = () => undefined;
    let upstreamCalled: () => void = () => undefined;
    const called = new Promise<void>((resolve) => { upstreamCalled = resolve; });
    const slow = http.createServer((req, res) => {
      upstreamCalled();
      answerUpstream = () => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end('data: {"type":"NEW_MSG","chat_id":4}\n\n');
      };
    });
    await new Promise<void>((resolve) => slow.listen(0, '127.0.0.1', resolve));
    process.env.MESSAGE_API_URL = `http://127.0.0.1:${(slow.address() as AddressInfo).port}`;
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const { headers, first, rest } = await new Promise<{ headers: http.IncomingHttpHeaders; first: string; rest: Promise<string> }>(
        (resolve, reject) => {
          // Fails (instead of hanging on the open sockets) when the head waits for Message API.
          setTimeout(() => reject(new Error('no head within 2 s')), 2_000).unref();
          http.get(`${url}/stream`, { headers: { Authorization: authorizationFor(agent.id) } }, (res) => {
            res.setEncoding('utf8');
            let text = '';
            const rest = new Promise<string>((done) => res.on('end', () => done(text)));
            res.once('data', (chunk: string) => {
              text += chunk;
              res.on('data', (more: string) => { text += more; });
              resolve({ headers: res.headers, first: chunk, rest });
            });
          }).on('error', reject);
        },
      );
      await called;

      // Message API has not answered yet.
      expect(headers['content-type']).toMatch(/^text\/event-stream/);
      expect(OPENING.startsWith(first)).toBe(true);

      answerUpstream();
      expect(await rest).toBe(`${OPENING}data: {"type":"NEW_MSG","conversationId":"conversation-4"}\n\n`);
    } finally {
      server.closeAllConnections();
      slow.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await new Promise((resolve) => slow.close(resolve));
    }
  });

  describe('with a Message API stream that never ends', () => {
    let endless: http.Server;
    let upstreamClosed: Promise<void>;

    beforeEach(async () => {
      let markClosed: () => void = () => undefined;
      upstreamClosed = new Promise((resolve) => { markClosed = resolve; });
      endless = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('data: {"type":"NEW_MSG","chat_id":3}\n\n');
        req.on('close', markClosed);
      });
      await new Promise<void>((resolve) => endless.listen(0, '127.0.0.1', resolve));
      process.env.MESSAGE_API_URL = `http://127.0.0.1:${(endless.address() as AddressInfo).port}`;
    });
    afterEach(async () => {
      endless.closeAllConnections();
      await new Promise((resolve) => endless.close(resolve));
    });

    test('ends the stream after MESSAGE_STREAM_MAX_MS and closes the upstream one', async () => {
      process.env.MESSAGE_STREAM_MAX_MS = '300';

      const started = Date.now();
      const response = await openStream();

      expect(response.status).toBe(200);
      expect(Date.now() - started).toBeGreaterThanOrEqual(250);
      expect(response.body).toContain('data: {"type":"NEW_MSG","conversationId":"conversation-3"}');
      await upstreamClosed;
    });

    test('closes the upstream stream as soon as the client leaves', async () => {
      process.env.MESSAGE_STREAM_MAX_MS = '60000';
      const server = app.listen(0, '127.0.0.1');
      await new Promise((resolve) => server.once('listening', resolve));
      try {
        const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        await new Promise<void>((resolve, reject) => {
          const req = http.get(`${url}/stream`, { headers: { Authorization: authorizationFor(agent.id) } }, (res) => {
            res.once('data', () => { req.destroy(); resolve(); });
          });
          req.on('error', (error) => (error.message === 'socket hang up' ? resolve() : reject(error)));
        });

        // Well before the 60 s max life: the BFF closed Message API's stream because the client left.
        await upstreamClosed;
      } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    });
  });
});

describe('translateEvent (MAIR-525)', () => {
  test.each([
    ['a ping comment', ': ping', ': ping\n\n'],
    ['a signal', 'data: {"type":"NEW_MSG","chat_id":0}', 'data: {"type":"NEW_MSG","conversationId":"conversation-0"}\n\n'],
    ['a signal split on two data lines', 'data: {"type":"NEW_MSG",\ndata: "chat_id":9}', 'data: {"type":"NEW_MSG","conversationId":"conversation-9"}\n\n'],
    ['a negative chat id', 'data: {"type":"NEW_MSG","chat_id":-1}', null],
    ['no data', 'event: ping', null],
  ])('translates %s', (_label, block, expected) => {
    expect(translateEvent(block)).toBe(expected);
  });
});
