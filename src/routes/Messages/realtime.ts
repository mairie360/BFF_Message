import { STATUS_CODES, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import {
  HttpError, INVALID_SESSION_MESSAGE, authorization, baseUrl, describeError, httpErrorBody, requireSession,
} from '@mairie360/bffs-lib';
import { Router, type Request } from 'express';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { z } from 'zod';
import { logger } from '../../logger';
import { errorResponses, registry } from '../../openapi-registry';

/**
 * Real-time WebSocket of the caller's conversations (MAIR-658, epic MAIR-655): the BFF relays Message API's
 * `GET /api/v1/ws` as `GET /ws`, following the contract frozen by MAIR-656 (Message_API
 * `docs/en/realtime-websocket.md`). The session is verified before any upstream call, the client is upgraded only once
 * Message API accepted its own handshake, each frame is translated to the front's ids and anything else is dropped.
 * `GET /stream` (SSE) stays until MAIR-662.
 *
 * Express cannot upgrade a connection: `attachRealtime(server)` handles the `upgrade` event of the HTTP server, and
 * the router below only answers the plain `GET /ws` that is not a handshake.
 */

/** Path of the WebSocket on the BFF. */
export const WS_PATH = '/ws';
/** Path of Message API's WebSocket. */
export const UPSTREAM_WS_PATH = '/api/v1/ws';
/** Largest frame accepted from either side, in bytes (`1009` beyond). */
export const MAX_FRAME_SIZE = 4 * 1024;
/** Close codes of the contract. */
export const CLOSE = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  UPSTREAM_UNAVAILABLE: 1013,
  SESSION_ENDED: 4001,
  EVICTED: 4008,
} as const;
/** Upstream close codes relayed as is to the client; any other upstream end becomes `1013`. */
const RELAYED_UPSTREAM_CODES: ReadonlySet<number> = new Set([
  CLOSE.NORMAL, CLOSE.GOING_AWAY, CLOSE.SESSION_ENDED, CLOSE.EVICTED,
]);

/** Intervals of the relay. Production uses {@link DEFAULT_TIMINGS} (lifetime from the environment); tests shorten them. */
export interface RealtimeTimings {
  /** A ping is sent to the client this often. */
  pingIntervalMs: number;
  /** A client that answered no ping for this long is closed with `1001`. */
  pongTimeoutMs: number;
  /** Message API must accept the handshake within this delay, `502` otherwise. */
  handshakeTimeoutMs: number;
  /** Longest life of one connection before the jitter, read on every connection when `undefined`. */
  maxLifetimeMs?: number;
}

export const DEFAULT_TIMINGS: RealtimeTimings = {
  pingIntervalMs: 15_000,
  pongTimeoutMs: 45_000,
  handshakeTimeoutMs: 10_000,
};

/** Longest life of one WebSocket, in ms (`MESSAGE_WS_MAX_MS`, 30 minutes by default), before the jitter. */
export function wsMaxMs(): number {
  const value = Number(process.env.MESSAGE_WS_MAX_MS);
  return Number.isInteger(value) && value > 0 ? value : 1_800_000;
}

/** `maxMs` ± 10 %, so the clients of a replica do not all reconnect at once. */
export function jitteredLifetime(maxMs: number, random: () => number = Math.random): number {
  return Math.round(maxMs * (0.9 + 0.2 * random()));
}

/** One frame of the WebSocket: something happened in a conversation. */
export const MessageRealtimeEventSchema = registry.register('MessageRealtimeEvent', z.object({
  type: z.enum(['NEW_MSG', 'MSG_EDITED', 'MSG_DELETED', 'CHAT_READ']).openapi({
    description: 'What happened: a message posted, edited or deleted by someone else, or the caller acknowledged the '
      + 'conversation (on another tab or device). Ignore an unknown type: new ones may be added.',
    example: 'NEW_MSG',
  }),
  conversationId: z.string().openapi({ description: 'Conversation concerned', example: 'conversation-5' }),
  messageId: z.string().optional().openapi({
    description: 'Message concerned (for `CHAT_READ`, the last message read); absent from a signal of an older Message '
      + 'API replica',
    example: 'message-118',
  }),
  unreadCount: z.number().int().nonnegative().optional().openapi({
    description: 'Unread messages left in the conversation, on `CHAT_READ` only',
    example: 0,
  }),
}));

export type MessageRealtimeEvent = z.infer<typeof MessageRealtimeEventSchema>;

const UpstreamSignal = z.object({
  type: z.enum(['NEW_MSG', 'MSG_EDITED', 'MSG_DELETED', 'CHAT_READ']),
  chat_id: z.number().int().nonnegative(),
  message_id: z.number().int().nonnegative().optional(),
  unread_count: z.number().int().nonnegative().optional(),
});

/**
 * One text frame of Message API (`ChatSignal`) turned into the BFF's (`MessageRealtimeEvent`), or `null` to drop it:
 * only the four types of the contract are relayed, anything unparsable or unknown is dropped.
 */
export function translateFrame(frame: string): string | null {
  let signal: z.infer<typeof UpstreamSignal>;
  try {
    signal = UpstreamSignal.parse(JSON.parse(frame));
  } catch {
    return null;
  }
  const event: MessageRealtimeEvent = { type: signal.type, conversationId: `conversation-${signal.chat_id}` };
  if (signal.message_id !== undefined) event.messageId = `message-${signal.message_id}`;
  if (signal.type === 'CHAT_READ' && signal.unread_count !== undefined) event.unreadCount = signal.unread_count;
  return JSON.stringify(event);
}

/** Close code sent to the client when Message API's connection ends with `code`. */
export function clientCodeForUpstreamClose(code: number): number {
  return RELAYED_UPSTREAM_CODES.has(code) ? code : CLOSE.UPSTREAM_UNAVAILABLE;
}

/** Close code sent to Message API when the client's connection ends with `code`: a code one may send, `1000` otherwise. */
export function upstreamCodeForClientClose(code: number): number {
  return code === CLOSE.NORMAL || code === CLOSE.GOING_AWAY || (code >= 4000 && code <= 4999) ? code : CLOSE.NORMAL;
}

/** Short reason of the close frames the BFF sends itself (logs only: clients act on the code). */
function defaultReason(code: number): string {
  switch (code) {
    case CLOSE.SESSION_ENDED: return 'session expired';
    case CLOSE.EVICTED: return 'evicted';
    case CLOSE.UPSTREAM_UNAVAILABLE: return 'upstream unavailable';
    case CLOSE.GOING_AWAY: return 'going away';
    default: return '';
  }
}

registry.registerPath({
  method: 'get',
  path: WS_PATH,
  tags: ['Conversations'],
  summary: 'Real-time WebSocket of the caller\'s conversations',
  description: 'Upgrades the connection to a **WebSocket** relaying Message API\'s (MAIR-658): one UTF-8 text frame per '
    + '`MessageRealtimeEvent`, for the conversations the caller is a member of. It replaces `GET /stream`, kept until '
    + 'MAIR-662. The full contract (frames, close codes, limits, client behaviour) is Message_API '
    + '`docs/en/realtime-websocket.md`.\n\n'
    + 'Send a `GET` with `Upgrade: websocket` and `Authorization: Bearer <JWT>`; nothing goes in the URL. The session is '
    + 'checked before Message API is called, and the connection is upgraded only once Message API accepted it: a '
    + 'refusal is a real status (`401`, `502`, `503`) with the `ErrorResponse` body. A `GET` without `Upgrade` answers '
    + '`400`.\n\n'
    + 'The client sends no data: a data frame is dropped, a frame larger than 4 KiB closes with `1009`. The BFF pings '
    + 'every 15 seconds and closes with `1001` a client that answered none for 45 seconds, and after '
    + '`MESSAGE_WS_MAX_MS` (30 minutes ± 10 % by default). Message API\'s `4001` (session ended: renew it before '
    + 'reconnecting), `4008` (evicted by a 6th connection: do not reconnect automatically) and `1001` are relayed; any '
    + 'other end of Message API\'s connection closes with `1013` (reconnect with backoff).',
  responses: {
    101: {
      description: 'Switched to the WebSocket protocol; the body documented is the payload of **one** text frame',
      content: { 'application/json': { schema: MessageRealtimeEventSchema } },
    },
    ...errorResponses({
      400: 'Not a WebSocket handshake (no `Upgrade: websocket`, or an invalid `Sec-WebSocket-Key` / version)',
      401: 'Missing or invalid session, or Message API refused it',
      502: 'Message API refused the handshake otherwise or did not answer within 10 seconds',
      503: 'Message API is not configured on the BFF',
    }),
  },
});

/** The plain `GET /ws` (no `Upgrade`, so not routed to the `upgrade` event): the session is checked, then `400`. */
const router = Router();
router.get('/', () => {
  throw new HttpError(400, 'Not a WebSocket handshake: send Upgrade: websocket.');
});
export default router;

/** Whether the headers make a valid WebSocket handshake (RFC 6455 §4.2.1), checked before any upstream call. */
export function isWebSocketHandshake(req: IncomingMessage): boolean {
  const key = req.headers['sec-websocket-key'];
  return req.method === 'GET'
    && req.headers.upgrade?.toLowerCase() === 'websocket'
    && req.headers['sec-websocket-version'] === '13'
    && typeof key === 'string' && /^[+/0-9A-Za-z]{22}==$/.test(key);
}

/** Answers a refused handshake on the raw socket with a real status and the `ErrorResponse` body, then closes it. */
function refuse(socket: Duplex, error: HttpError): void {
  if (socket.destroyed) return;
  const body = JSON.stringify(httpErrorBody(error));
  socket.end([
    `HTTP/1.1 ${error.status} ${STATUS_CODES[error.status] ?? ''}`,
    'Connection: close',
    'Content-Type: application/json; charset=utf-8',
    'Cache-Control: no-store',
    `Content-Length: ${Buffer.byteLength(body)}`,
    '',
    body,
  ].join('\r\n'));
}

/** Runs the lib's `requireSession` on the handshake: the token is verified with Core's key like on every route. */
function checkSession(req: IncomingMessage): HttpError | undefined {
  let failure: unknown;
  requireSession(req as Request, undefined as never, (error?: unknown) => { failure = error; });
  if (failure === undefined) return undefined;
  return failure instanceof HttpError ? failure : new HttpError(401, INVALID_SESSION_MESSAGE);
}

/** Message API's WebSocket URL, from `MESSAGE_API_URL` read now (`503` when it is not configured). */
function upstreamUrl(): string {
  return `${baseUrl('MESSAGE_API').replace(/^http/i, 'ws')}${UPSTREAM_WS_PATH}`;
}

/** What `attachRealtime` returns: the open connections can be closed on shutdown. */
export interface Realtime {
  /** Number of client connections relayed now. */
  readonly size: number;
  /** Closes every relayed connection (`1001` by default), e.g. on SIGTERM so the drain does not wait for them. */
  closeAll(code?: number, reason?: string): void;
  /** Stops handling the `upgrade` event and closes every connection. */
  detach(): void;
}

/**
 * Handles the WebSocket handshakes of `server` on {@link WS_PATH}. Any other upgrade is refused with a `404`.
 */
export function attachRealtime(server: Server, timings: Partial<RealtimeTimings> = {}): Realtime {
  const options: RealtimeTimings = { ...DEFAULT_TIMINGS, ...timings };
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME_SIZE, perMessageDeflate: false });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on('error', () => socket.destroy());
    const path = new URL(req.url ?? '/', 'http://bff').pathname.replace(/\/+$/, '');
    if (path !== WS_PATH) {
      refuse(socket, new HttpError(404));
      return;
    }
    // Same order as the routes: the session first (401 before any upstream call), then the handshake itself.
    const sessionFailure = checkSession(req);
    if (sessionFailure) {
      refuse(socket, sessionFailure);
      return;
    }
    if (!isWebSocketHandshake(req)) {
      refuse(socket, new HttpError(400, 'Not a WebSocket handshake.'));
      return;
    }
    let url: string;
    try {
      url = upstreamUrl();
    } catch (error) {
      refuse(socket, error instanceof HttpError ? error : new HttpError(503));
      return;
    }
    openUpstream(req, socket, head, url);
  };

  const openUpstream = (req: IncomingMessage, socket: Duplex, head: Buffer, url: string) => {
    const upstream = new WebSocket(url, {
      headers: { Authorization: authorization(req as Request) },
      handshakeTimeout: options.handshakeTimeoutMs,
      maxPayload: MAX_FRAME_SIZE,
      perMessageDeflate: false,
    });
    let settled = false;
    // The client left while Message API was answering: nothing to relay.
    const onClientGone = () => {
      if (!settled) {
        settled = true;
        upstream.terminate();
      }
    };
    socket.once('close', onClientGone);

    upstream.once('unexpected-response', (_request, response) => {
      if (settled) return;
      settled = true;
      const status = response.statusCode ?? 0;
      response.resume();
      upstream.terminate();
      // Message API answers 401 for a refused token and 404 for an unknown or archived account: both mean the session
      // is no longer valid for the client. Anything else is a failure of Message API.
      const sessionRefused = status === 401 || status === 404;
      if (!sessionRefused) logger.warn('websocket upstream refused', { status });
      refuse(socket, sessionRefused ? new HttpError(401, INVALID_SESSION_MESSAGE) : new HttpError(502));
    });
    upstream.once('error', (error) => {
      if (settled) return;
      settled = true;
      upstream.terminate();
      logger.warn('websocket upstream unreachable', { error: describeError(error) });
      refuse(socket, new HttpError(502));
    });
    upstream.once('open', () => {
      if (settled) {
        upstream.terminate();
        return;
      }
      settled = true;
      socket.off('close', onClientGone);
      wss.handleUpgrade(req, socket, head, (client) => bridge(client, upstream));
    });
  };

  const bridge = (client: WebSocket, upstream: WebSocket) => {
    let ended = false;
    let lastPong = Date.now();
    const end = () => {
      if (ended) return false;
      ended = true;
      clearInterval(ping);
      clearTimeout(maxLife);
      return true;
    };

    upstream.on('message', (data: RawData, isBinary: boolean) => {
      if (isBinary || client.readyState !== WebSocket.OPEN) return;
      const event = translateFrame(data.toString());
      if (event) client.send(event);
    });
    // The channel is server → client: a data frame of the client is never forwarded.
    client.on('message', () => undefined);
    client.on('pong', () => { lastPong = Date.now(); });

    upstream.on('close', (code: number, reason: Buffer) => {
      if (!end()) return;
      const relayed = clientCodeForUpstreamClose(code);
      const text = relayed === code ? reason.toString() || defaultReason(relayed) : defaultReason(relayed);
      if (client.readyState === WebSocket.OPEN) client.close(relayed, text);
    });
    upstream.on('error', () => {
      // `close` (1006) follows and closes the client with 1013.
      upstream.terminate();
    });
    client.on('close', (code: number) => {
      if (!end()) return;
      if (upstream.readyState === WebSocket.OPEN) upstream.close(upstreamCodeForClientClose(code));
      else upstream.terminate();
    });
    client.on('error', () => client.terminate());

    const closeClient = (code: number, reason: string) => {
      if (client.readyState === WebSocket.OPEN) client.close(code, reason);
    };
    const ping = setInterval(() => {
      if (Date.now() - lastPong >= options.pongTimeoutMs) {
        closeClient(CLOSE.GOING_AWAY, 'pong timeout');
        return;
      }
      client.ping();
    }, options.pingIntervalMs);
    const maxLife = setTimeout(
      () => closeClient(CLOSE.GOING_AWAY, 'max lifetime'),
      jitteredLifetime(options.maxLifetimeMs ?? wsMaxMs()),
    );
  };

  server.on('upgrade', onUpgrade);
  const closeAll = (code: number = CLOSE.GOING_AWAY, reason = 'server shutdown') => {
    for (const client of wss.clients) client.close(code, reason);
  };
  return {
    get size() { return wss.clients.size; },
    closeAll,
    detach() {
      server.off('upgrade', onUpgrade);
      closeAll();
      wss.close();
    },
  };
}
