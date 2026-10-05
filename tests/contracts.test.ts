import axios from 'axios';
import request from 'supertest';
import express from 'express';
import { errorHandler, notFoundHandler } from '@mairie360/bffs-lib';
import businessReferencesRouter from '../src/routes/Messages/business_references';
import { app as bff } from '../src/app';
import { MessagingBootstrapResponse } from '../src/openapi-registry';

// Les appels amont passent par les clients générés : leur comportement est vérifié contre de vrais
// serveurs HTTP pilotés par les contrats (messages.upstream-mocks.test.ts).
const app = express();
app.use('/business-references', businessReferencesRouter);
app.use(errorHandler());
const requestSpy = jest.spyOn(axios.Axios.prototype, 'request');
beforeEach(() => { requestSpy.mockClear(); });
afterAll(() => { requestSpy.mockRestore(); });

test('bootstrap schema includes the contacts returned to the frontend', () => {
  const bootstrap = { currentUser: { id: 42, name: 'Alice' }, conversations: [], contacts: [{ id: 7, name: 'Paul' }], messages: [] };
  expect(MessagingBootstrapResponse.parse(bootstrap)).toEqual(bootstrap);
});

test('business references require the caller session', async () => {
  const result = await request(app).get('/business-references');

  expect(result.status).toBe(401);
  expect(result.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Invalid session.', details: [] } });
  expect(requestSpy).not.toHaveBeenCalled();
});

const envelope = (code: string, message: string) => ({ error: { code, message, details: [] } });

test('unknown routes answer a JSON 404 in the shared error envelope', async () => {
  const result = await request(bff).get('/unknown');

  expect(result.status).toBe(404);
  expect(result.body).toEqual(envelope('NOT_FOUND', 'Route not found'));
});

test('an unparsable JSON body answers 400 in the shared error envelope', async () => {
  const result = await request(bff).post('/groups').set('Content-Type', 'application/json').send('{"broken"');

  expect(result.status).toBe(400);
  expect(result.body).toEqual(envelope('BAD_REQUEST', 'Invalid request'));
  expect(requestSpy).not.toHaveBeenCalled();
});

test('an unexpected error answers a generic 500 without leaking its message', async () => {
  const failing = express();
  failing.get('/boom', () => { throw new Error('connection string postgres://secret'); });
  failing.use(notFoundHandler);
  failing.use(errorHandler({ onError: () => undefined }));

  const result = await request(failing).get('/boom');

  expect(result.status).toBe(500);
  expect(result.body).toEqual(envelope('INTERNAL_ERROR', 'Internal server error'));
});
