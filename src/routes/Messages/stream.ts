import type { Readable } from 'node:stream';
import { HttpError, INVALID_SESSION_MESSAGE, asCaller, upstreamError, upstreamStatus } from '@mairie360/bffs-lib';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import messageClient from '../../clients/messageClient';
import { errorResponses, registry } from '../../openapi-registry';

/**
 * Real-time stream of the caller's conversations (MAIR-525): the BFF relays Message API's SSE channel
 * (`GET /api/v1/stream`) so the front stops reloading every 2 seconds. Message API only signals the members of a chat
 * (other than the author) and closes the stream when the session expires or is revoked: the BFF keeps that filtering,
 * translates each signal to the front's ids (`conversation-<id>`) and drops anything else.
 */
const router = Router();

/** One event of the stream: something happened in the conversation, which the front reloads. */
export const MessageStreamEventSchema = registry.register('MessageStreamEvent', z.object({
  type: z.string().openapi({ description: 'What happened, as Message API names it (`NEW_MSG`...)', example: 'NEW_MSG' }),
  conversationId: z.string().openapi({ description: 'Conversation to reload', example: 'conversation-5' }),
}));

/** Longest life of one stream, in ms (`MESSAGE_STREAM_MAX_MS`, 5 minutes by default): the client reconnects then. */
export function streamMaxMs(): number {
  const value = Number(process.env.MESSAGE_STREAM_MAX_MS);
  return Number.isInteger(value) && value > 0 ? value : 300_000;
}

/** Delay before the browser reconnects after the stream ends, in ms (SSE `retry:` field). */
export const RECONNECT_DELAY_MS = 3_000;

const UpstreamSignal = z.object({ type: z.string(), chat_id: z.number().int().nonnegative() });

/**
 * One SSE event block of Message API turned into the BFF's, or `null` to drop it. Comments (`: ping`) are kept, so
 * proxies keep the connection open; an `id:` is relayed, so a reconnection can send it back as `Last-Event-ID`.
 */
export function translateEvent(block: string): string | null {
  const lines = block.split(/\r?\n/);
  if (lines.every((line) => line.startsWith(':'))) return `${lines.join('\n')}\n\n`;

  const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
  const id = lines.find((line) => line.startsWith('id:'))?.slice(3).trim();
  let signal: z.infer<typeof UpstreamSignal>;
  try {
    signal = UpstreamSignal.parse(JSON.parse(data));
  } catch {
    return null;
  }
  const event = MessageStreamEventSchema.parse({ type: signal.type, conversationId: `conversation-${signal.chat_id}` });
  return `${id && !/[\r\n]/.test(id) ? `id: ${id}\n` : ''}data: ${JSON.stringify(event)}\n\n`;
}

registry.registerPath({
  method: 'get',
  path: '/stream',
  tags: ['Conversations'],
  summary: 'Real-time stream of the caller\'s conversations',
  description: 'An **SSE** channel (`text/event-stream`) relaying Message API\'s: each `data:` line holds a '
    + '`MessageStreamEvent` saying that something happened in a conversation, which the client then reloads. Only the '
    + 'conversations the caller is a member of are signalled. A `: ping` comment comes every 15 seconds. The stream ends '
    + 'when the session expires or is revoked, and after `MESSAGE_STREAM_MAX_MS` (5 minutes by default): the client '
    + 'reconnects (`retry: 3000`), sending back the last `id:` as `Last-Event-ID`, relayed to Message API.',
  responses: {
    200: {
      description: 'Stream established; the body documented is the payload of **one** event',
      content: { 'text/event-stream': { schema: MessageStreamEventSchema } },
    },
    ...errorResponses({
      401: 'Missing or invalid session, or session refused by Message API',
      502: 'Message API is unavailable or failed',
      503: 'Message API is not configured on the BFF',
    }),
  },
});

/** Opens Message API's stream for the caller; refusals and failures become the BFF's errors. */
async function openUpstream(req: Request, signal: AbortSignal): Promise<Readable> {
  // No timeout: the stream stays open; the abort signal closes it when the client leaves or the max life ends.
  const options = asCaller('MESSAGE_API', req, 0);
  const lastEventId = req.get('Last-Event-ID');
  try {
    const response = await messageClient.sseStreamRoute({
      ...options,
      headers: { ...options.headers, Accept: 'text/event-stream', ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}) },
      responseType: 'stream',
      signal,
    });
    return response.data as unknown as Readable;
  } catch (error) {
    const status = error instanceof HttpError ? undefined : upstreamStatus(error);
    if (status === 401) throw new HttpError(401, INVALID_SESSION_MESSAGE, { cause: error });
    throw upstreamError('MESSAGE_API', error);
  }
}

function relay(upstream: Readable, res: Response, close: () => void): void {
  let buffer = '';
  upstream.setEncoding('utf8');
  upstream.on('data', (chunk: string) => {
    buffer += chunk;
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const event = block.trim() ? translateEvent(block) : null;
      if (event) res.write(event);
    }
  });
  upstream.on('end', close);
  upstream.on('error', close);
}

router.get('/', async (req: Request, res: Response) => {
  const controller = new AbortController();
  // `close` on the response: the client left (or the stream ended): the upstream stream is closed too.
  res.on('close', () => controller.abort());
  const upstream = await openUpstream(req, controller.signal);

  let ended = false;
  const close = () => {
    if (ended) return;
    ended = true;
    clearTimeout(maxLife);
    controller.abort();
    upstream.destroy();
    res.end();
  };
  const maxLife = setTimeout(close, streamMaxMs());
  res.on('close', close);

  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    // Proxies (nginx) must not buffer the events.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(`retry: ${RECONNECT_DELAY_MS}\n\n`);
  relay(upstream, res, close);
});

export default router;
