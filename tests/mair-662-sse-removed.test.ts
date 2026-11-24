import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import axios from 'axios';
import request from 'supertest';
import { app } from '../src/app';
import { sessionToken } from './support/upstream-fixtures';

// MAIR-662: the SSE stream is removed; real time is the /ws WebSocket only. A signed-in caller asking for the old
// stream gets the shared 404 envelope, never an event stream, and Message API is not called.

const contract = JSON.parse(readFileSync(join(__dirname, '..', 'contracts', 'openapi.json'), 'utf8')) as {
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown> };
};

afterEach(() => jest.restoreAllMocks());

test('MAIR-662 GET /stream answers the 404 envelope with a valid session, without calling Message API', async () => {
  const upstream = jest.spyOn(axios.Axios.prototype, 'request');
  const result = await request(app)
    .get('/stream')
    .set('Authorization', `Bearer ${sessionToken(1)}`)
    .set('Accept', 'text/event-stream');

  expect(result.status).toBe(404);
  expect(result.headers['content-type']).toMatch(/^application\/json/);
  expect(result.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found', details: [] } });
  expect(upstream).not.toHaveBeenCalled();
});

test('MAIR-662 the contract has neither /stream nor MessageStreamEvent, and keeps /ws', () => {
  expect(contract.paths['/stream']).toBeUndefined();
  expect(contract.components.schemas.MessageStreamEvent).toBeUndefined();
  expect(contract.paths['/ws']).toBeDefined();
  expect(contract.components.schemas.MessageRealtimeEvent).toBeDefined();
});
