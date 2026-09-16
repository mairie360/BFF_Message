import axios from 'axios';
import request from 'supertest';
import express from 'express';
import businessReferencesRouter from '../src/routes/Messages/business_references';
import { MessagingBootstrapResponse } from '../src/openapi-registry';

// Les appels amont passent par les clients générés : leur comportement est vérifié contre de vrais
// serveurs HTTP pilotés par les contrats (messages.upstream-mocks.test.ts).
const app = express();
app.use('/business-references', businessReferencesRouter);
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
  expect(requestSpy).not.toHaveBeenCalled();
});
