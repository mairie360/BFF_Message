import request from 'supertest';
import express from 'express';
import businessReferencesRouter from '../src/routes/Messages/business_references';
import { MessagingBootstrapResponse } from '../src/openapi-registry';

const app = express();
app.use('/business-references', businessReferencesRouter);

test('bootstrap schema includes the contacts returned to the frontend', () => {
  const bootstrap = { currentUser: { id: 42, name: 'Alice' }, conversations: [], contacts: [{ id: 7, name: 'Paul' }], messages: [] };
  expect(MessagingBootstrapResponse.parse(bootstrap)).toEqual(bootstrap);
});
test('business references require the caller session', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  try {
    const result = await request(app).get('/business-references');
    expect(result.status).toBe(401); expect(fetchMock).not.toHaveBeenCalled();
  } finally { fetchMock.mockRestore(); }
});
test('business references preserve source identifiers and session authorization', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-session');
    const url = String(input);
    const body = url.includes('/projects-page') ? { projects: [{ id: '42', title: 'Budget' }] }
      : url.includes('/calendar/bootstrap') ? { events: [{ id: 9, title: 'Conseil', date: '2026-09-08' }] }
      : { taskItems: [{ id: '7', title: 'Validation' }] };
    return Response.json(body);
  });
  try {
    const result = await request(app).get('/business-references').set('Authorization', 'Bearer fixture-session');
    expect(result.status).toBe(200);
    expect(result.body.references.map((reference: { id: string }) => reference.id)).toEqual(['project:42', 'task:7', 'event:9']);
    expect(result.body.sources).toEqual({ projects: 'available', calendar: 'available' });
  } finally { fetchMock.mockRestore(); }
});
