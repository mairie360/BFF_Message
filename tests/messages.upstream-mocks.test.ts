import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';

// La table PostgreSQL `users` (contacts) n'a pas de contrat OpenAPI : le repository reste simulé par
// jest.mock. Les services HTTP (Message API, BFF Project, BFF Calendar) sont servis par de vrais
// serveurs locaux pilotés par les contrats reconstruits depuis leurs paquets @mairie360/*-openapi installés
// (tests/support/orval-contract.ts) : chaque requête du BFF (chemin, paramètres, corps JSON) et chaque
// réponse de succès simulée est validée contre ces contrats.
jest.mock('../src/repositories/contactsRepository', () => ({
  getContactUser: jest.fn(),
  listContacts: jest.fn(),
}));

import * as contactsRepository from '../src/repositories/contactsRepository';
import { ContractMockServer } from './support/contract-mock-server';
import { OpenApiContract } from './support/openapi-contract';
import { loadOrvalContract } from './support/orval-contract';
import {
  authorizationFor, calendarBootstrapResponse, calendarEvent, chatResult, chatUsers, chatView, chatsResult, messageView,
  projectDetailsResponse, projectListItem, projectsPageResponse, taskItem, tokenFor, users, type ProjectItem, type TaskItem,
} from './support/upstream-fixtures';

const { agent, sophie, thomas } = users;

const messageApi = new ContractMockServer('MESSAGE_API', loadOrvalContract('@mairie360/message-api-openapi'), { basePath: '/api', rootPaths: ['/health'] });
const projectBff = new ContractMockServer('PROJECT_BFF', loadOrvalContract('@mairie360/bff-project-openapi'));
const calendarBff = new ContractMockServer('CALENDAR_BFF', loadOrvalContract('@mairie360/bff-calendar-openapi'));
const mocks = [messageApi, projectBff, calendarBff];
const bffContract = OpenApiContract.load(path.join(__dirname, '..', 'contracts', 'openapi.json'));

let app: Express;

beforeAll(async () => {
  await Promise.all(mocks.map((mock) => mock.start()));
  // messageClient et check_apis lisent leurs URL amont au chargement : l'application est importée après.
  delete process.env.DEFAULT_JWT_TOKEN;
  process.env.MESSAGE_API_BASE_PATH = `${messageApi.url}/api`;
  const messageApiUrl = new URL(messageApi.url);
  process.env.MESSAGE_API_URL = messageApiUrl.hostname;
  process.env.MESSAGE_API_PORT = messageApiUrl.port;
  process.env.PROJECT_BFF_URL = projectBff.url;
  process.env.CALENDAR_BFF_URL = calendarBff.url;
  ({ app } = await import('../src/index'));
});
afterAll(async () => { await Promise.all(mocks.map((mock) => mock.stop())); });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  for (const mock of mocks) mock.reset();
  const directory = [agent, sophie, thomas];
  jest.mocked(contactsRepository.getContactUser).mockImplementation(async (id) => directory.find((user) => user.id === id));
  jest.mocked(contactsRepository.listContacts).mockImplementation(async (_search, _limit, excludedUserId) => directory.filter((user) => user.id !== excludedUserId));
});

afterEach(() => {
  jest.restoreAllMocks();
  expect(mocks.flatMap((mock) => mock.violations)).toEqual([]);
});

type MessageApiScenario = {
  chats?: Array<ReturnType<typeof chatView>>;
  messages?: Record<number, Array<ReturnType<typeof messageView>>>;
  members?: Record<number, number[]>;
  createdChatId?: number;
  postedMessageId?: number;
};

function mockMessageApi({ chats = [], messages = {}, members = {}, createdChatId = 12, postedMessageId = 31 }: MessageApiScenario = {}) {
  messageApi.on('get', '/v1/', { body: chatsResult(chats) });
  messageApi.on('post', '/v1/', { body: { id: createdChatId } });
  messageApi.on('get', '/v1/{chatId}/', ({ pathParams }) => {
    const found = messages[Number(pathParams.chatId)];
    // 404 renvoyé par l'API réelle pour un salon inconnu ; les erreurs ne sont pas typées par orval.
    return found ? { body: chatResult(found) } : { status: 404, raw: 'Chat not found', contentType: 'text/plain', outOfContract: true };
  });
  messageApi.on('delete', '/v1/{chatId}/', { status: 200 });
  messageApi.on('post', '/v1/{chatId}/messages/', { body: { id: postedMessageId } });
  messageApi.on('get', '/v1/{chatId}/users/', ({ pathParams }) => ({ body: chatUsers(members[Number(pathParams.chatId)] ?? []) }));
}

/** Réponse documentée par le contrat du BFF (statut + schéma). */
function expectBffContract(method: string, pathname: string, response: request.Response) {
  const match = bffContract.match(method, pathname);
  expect(match?.template).toBeDefined();
  const { documented, schema } = bffContract.responseSchema(match!, response.status);
  expect({ status: response.status, documented }).toEqual({ status: response.status, documented: true });
  if (schema) expect(bffContract.validate(schema, response.body)).toEqual([]);
}

/** Erreur au format ApiErrorResponse du BFF (tous les statuts d'erreur ne sont pas encore documentés par route). */
function expectApiError(response: request.Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(bffContract.validate(bffContract.schema('ApiErrorResponse'), response.body)).toEqual([]);
  expect(response.body.code).toBe(code);
}

const upstreamSequence = (mock: ContractMockServer) => mock.requests.map((call) => `${call.method} ${call.path}`);

describe('Message BFF with contract-driven Message API, BFF Project and BFF Calendar mocks', () => {
  describe('conversations', () => {
    test('GET /conversations maps Message API chats with the other participants and forwards the session', async () => {
      mockMessageApi({
        chats: [chatView(4, 'Équipe communication', 3), chatView(5, 'Conseil municipal')],
        members: { 4: [agent.id, sophie.id, thomas.id], 5: [agent.id] },
      });

      const response = await request(app).get('/conversations').set('Authorization', authorizationFor(agent.id));

      expect(response.status).toBe(200);
      expectBffContract('get', '/conversations', response);
      expect(response.body).toEqual({ conversations: [
        { id: 'conversation-4', name: 'Équipe communication', department: 'Avec Sophie Leroy, Thomas Bernard', kind: 'group', initials: 'ÉC', unreadCount: 3 },
        { id: 'conversation-5', name: 'Conseil municipal', kind: 'group', initials: 'CM', unreadCount: 0 },
      ] });
      expect(upstreamSequence(messageApi).sort()).toEqual(['GET /v1/', 'GET /v1/4/users/', 'GET /v1/5/users/']);
      expect(messageApi.requests.every((call) => call.headers.authorization === authorizationFor(agent.id))).toBe(true);
      expect(contactsRepository.getContactUser).not.toHaveBeenCalledWith(agent.id);
    });

    test('GET /conversations filters by search and applies limit before loading participants', async () => {
      mockMessageApi({ chats: [chatView(1, 'Voirie'), chatView(2, 'Équipe voirie nord'), chatView(3, 'Voirie sud'), chatView(4, 'Écoles')] });

      const response = await request(app).get('/conversations?search=VOIRIE&limit=2').set('Authorization', authorizationFor(agent.id));

      expect(response.status).toBe(200);
      expectBffContract('get', '/conversations', response);
      expect(response.body.conversations.map((conversation: { id: string }) => conversation.id)).toEqual(['conversation-1', 'conversation-2']);
      expect(messageApi.calls('/v1/{chatId}/users/').map((call) => call.pathParams.chatId).sort()).toEqual(['1', '2']);
    });

    test('promotes the accessToken cookie to the Authorization header sent to Message API', async () => {
      mockMessageApi();

      const response = await request(app).get('/conversations').set('Cookie', `theme=dark; accessToken=${encodeURIComponent(tokenFor(sophie.id))}`);

      expect(response.status).toBe(200);
      expect(messageApi.calls('/v1/')[0].headers.authorization).toBe(authorizationFor(sophie.id));
    });

    test('degrades to conversations without participants when Message API fails on chat users', async () => {
      mockMessageApi({ chats: [chatView(4, 'Équipe communication')] });
      messageApi.on('get', '/v1/{chatId}/users/', { status: 500, raw: 'Database error', contentType: 'text/plain', outOfContract: true });

      const response = await request(app).get('/conversations').set('Authorization', authorizationFor(agent.id));

      expect(response.status).toBe(200);
      expectBffContract('get', '/conversations', response);
      expect(response.body.conversations[0]).not.toHaveProperty('department');
    });

    test('rejects a non-numeric limit with 400 before calling Message API', async () => {
      mockMessageApi();

      const response = await request(app).get('/conversations?limit=beaucoup').set('Authorization', authorizationFor(agent.id));

      expectApiError(response, 400, 'BAD_REQUEST');
      expect(messageApi.requests).toHaveLength(0);
    });

    test('DELETE /conversations/:id deletes the Message API chat by its numeric id', async () => {
      mockMessageApi();

      const response = await request(app).delete('/conversations/conversation-4').set('Authorization', authorizationFor(agent.id));

      expect(response.status).toBe(200);
      expectBffContract('delete', '/conversations/conversation-4', response);
      expect(response.body).toEqual({ deleted: true, conversationId: 'conversation-4' });
      expect(upstreamSequence(messageApi)).toEqual(['DELETE /v1/4/']);
    });

    test('DELETE /conversations/:id rejects an id without digits before calling Message API', async () => {
      mockMessageApi();

      const response = await request(app).delete('/conversations/general').set('Authorization', authorizationFor(agent.id));

      expectApiError(response, 400, 'BAD_REQUEST');
      expect(messageApi.requests).toHaveLength(0);
    });

    test('POST /conversations/:id/read answers without calling Message API (non persistent)', async () => {
      mockMessageApi();

      const response = await request(app).post('/conversations/conversation-4/read').set('Authorization', authorizationFor(agent.id)).send({ readUntilMessageId: 'message-42' });

      expect(response.status).toBe(200);
      expectBffContract('post', '/conversations/conversation-4/read', response);
      expect(response.body).toEqual({ conversationId: 'conversation-4', unreadCount: 0 });
      expect(messageApi.requests).toHaveLength(0);
    });

    test('POST /groups creates a Message API chat with the numeric member ids', async () => {
      mockMessageApi({ createdChatId: 18 });

      const response = await request(app).post('/groups').set('Authorization', authorizationFor(agent.id))
        .send({ name: 'Équipe voirie', memberIds: ['user-8', 9, 'inconnu'] });

      expect(response.status).toBe(201);
      expectBffContract('post', '/groups', response);
      expect(response.body).toEqual({ conversation: { id: 'conversation-18', name: 'Équipe voirie', kind: 'group', initials: 'ÉV', unreadCount: 0 } });
      expect(messageApi.calls('/v1/', 'POST')[0].body).toEqual({ name: 'Équipe voirie', members: [sophie.id, thomas.id] });
    });
  });

  describe('messages', () => {
    test('GET /conversations/:id/messages maps Message API messages, direction and the chat summary', async () => {
      mockMessageApi({
        chats: [chatView(4, 'Équipe communication', 1)],
        messages: { 4: [
          messageView(40, sophie.id, { content: 'Ancien', created_at: '2026-09-15T08:00:00Z' }),
          messageView(41, agent.id, { content: 'Mon message', created_at: '2026-09-15T09:00:00Z' }),
          messageView(42, sophie.id, { content: 'Réponse reçue', created_at: '2026-09-15T09:01:00Z', sitation: 41 }),
        ] },
        members: { 4: [agent.id, sophie.id] },
      });

      const response = await request(app).get('/conversations/conversation-4/messages?limit=2').set('Authorization', authorizationFor(agent.id));

      expect(response.status).toBe(200);
      expectBffContract('get', '/conversations/conversation-4/messages', response);
      expect(upstreamSequence(messageApi).sort()).toEqual(['GET /v1/', 'GET /v1/4/', 'GET /v1/4/users/']);
      expect(response.body.conversation).toEqual({
        id: 'conversation-4', name: 'Équipe communication', department: 'Avec Sophie Leroy', kind: 'group', initials: 'ÉC',
        lastMessage: 'Réponse reçue', lastMessageAt: '2026-09-15T09:01:00Z', unreadCount: 1,
      });
      expect(response.body.messages).toEqual([
        { id: 'message-41', conversationId: 'conversation-4', content: 'Mon message', sentAt: '2026-09-15T09:00:00Z', authorId: 'user-7', authorName: 'Utilisateur 7', direction: 'outgoing', attachments: [], mentions: [] },
        { id: 'message-42', conversationId: 'conversation-4', content: 'Réponse reçue', sentAt: '2026-09-15T09:01:00Z', authorId: 'user-8', authorName: 'Utilisateur 8', direction: 'incoming', attachments: [], mentions: [] },
      ]);
    });

    test('GET /conversations/:id/messages names the conversation after its id when Message API does not list it', async () => {
      mockMessageApi({ messages: { 9: [] } });

      const response = await request(app).get('/conversations/9/messages').set('Authorization', authorizationFor(agent.id));

      expect(response.status).toBe(200);
      expectBffContract('get', '/conversations/9/messages', response);
      expect(response.body).toEqual({ conversation: expect.objectContaining({ id: 'conversation-9', name: 'Conversation 9', unreadCount: 0 }), messages: [] });
    });

    test('POST /conversations/:id/messages sends a contract-valid body and returns the outgoing message', async () => {
      mockMessageApi({ chats: [chatView(4, 'Équipe communication')], members: { 4: [agent.id, sophie.id] }, postedMessageId: 31 });

      const response = await request(app).post('/conversations/conversation-4/messages').set('Authorization', authorizationFor(agent.id))
        .send({ content: 'Bonjour à tous', attachmentIds: [], mentionIds: [] });

      expect(response.status).toBe(201);
      expectBffContract('post', '/conversations/conversation-4/messages', response);
      expect(messageApi.calls('/v1/{chatId}/messages/', 'POST').map((call) => [call.pathParams.chatId, call.body])).toEqual([['4', { content: 'Bonjour à tous' }]]);
      expect(response.body.message).toEqual({
        id: 'message-31', conversationId: 'conversation-4', content: 'Bonjour à tous', sentAt: expect.any(String),
        authorId: 'user-7', authorName: 'Utilisateur 7', direction: 'outgoing', attachments: [], mentions: [],
      });
      expect(response.body.conversation).toMatchObject({ id: 'conversation-4', name: 'Équipe communication', department: 'Avec Sophie Leroy' });
    });

    test('POST /conversations/:id/messages refuses a session without user id before calling Message API', async () => {
      mockMessageApi();

      const response = await request(app).post('/conversations/conversation-4/messages').send({ content: 'Anonyme' });

      expectApiError(response, 401, 'UNAUTHORIZED');
      expect(messageApi.requests).toHaveLength(0);
    });

    test('POST /conversations/:id/messages rejects a body without content before calling Message API', async () => {
      mockMessageApi();

      const response = await request(app).post('/conversations/conversation-4/messages').set('Authorization', authorizationFor(agent.id)).send({ text: 'Mauvais champ' });

      expectApiError(response, 400, 'BAD_REQUEST');
      expect(messageApi.requests).toHaveLength(0);
    });

    test('POST /direct-messages creates a chat with the recipient then posts the first message in it', async () => {
      mockMessageApi({ createdChatId: 21, postedMessageId: 50, members: { 21: [agent.id, sophie.id] } });

      const response = await request(app).post('/direct-messages').set('Authorization', authorizationFor(agent.id))
        .send({ recipientId: 'user-8', message: 'Bonjour Sophie' });

      expect(response.status).toBe(201);
      expectBffContract('post', '/direct-messages', response);
      expect(messageApi.calls('/v1/', 'POST')[0].body).toEqual({ name: 'Direct 8', members: [sophie.id] });
      expect(messageApi.calls('/v1/{chatId}/messages/', 'POST').map((call) => [call.pathParams.chatId, call.body])).toEqual([['21', { content: 'Bonjour Sophie' }]]);
      expect(response.body).toEqual({
        conversation: expect.objectContaining({ id: 'conversation-21', name: 'Conversation 21', department: 'Avec Sophie Leroy' }),
        message: expect.objectContaining({ id: 'message-50', conversationId: 21, direction: 'outgoing' }),
      });
    });
  });

  describe('current user, contacts and bootstrap', () => {
    test('GET /me resolves the token subject in the users table', async () => {
      const response = await request(app).get('/me').set('Authorization', authorizationFor(sophie.id));

      expect(response.status).toBe(200);
      expectBffContract('get', '/me', response);
      expect(response.body.currentUser).toMatchObject({ id: 'user-8', name: 'Sophie Leroy', email: 'sophie.leroy@mairie360.fr' });
      expect(contactsRepository.getContactUser).toHaveBeenCalledWith(sophie.id);
    });

    test('GET /me answers 401 for a user absent from the users table', async () => {
      const response = await request(app).get('/me').set('Authorization', authorizationFor(404));

      expectApiError(response, 401, 'UNAUTHORIZED');
      expectBffContract('get', '/me', response);
    });

    test('GET /contacts lists the users table without the current user', async () => {
      const response = await request(app).get('/contacts?search=le&limit=5').set('Authorization', authorizationFor(agent.id));

      expect(response.status).toBe(200);
      expectBffContract('get', '/contacts', response);
      expect(contactsRepository.listContacts).toHaveBeenCalledWith('le', 5, agent.id);
      expect(response.body.contacts).toEqual([
        { id: 'user-8', name: 'Sophie Leroy', initials: 'SL', presence: 'offline', email: 'sophie.leroy@mairie360.fr' },
        { id: 'user-9', name: 'Thomas Bernard', initials: 'TB', presence: 'offline' },
      ]);
    });

    test('GET /contacts requires a session', async () => {
      const response = await request(app).get('/contacts');

      expectApiError(response, 401, 'UNAUTHORIZED');
      expectBffContract('get', '/contacts', response);
      expect(contactsRepository.listContacts).not.toHaveBeenCalled();
    });

    test('GET /messaging/bootstrap aggregates user, conversations, contacts and the first conversation messages', async () => {
      mockMessageApi({
        chats: [chatView(4, 'Équipe communication', 2), chatView(5, 'Conseil municipal')],
        messages: { 4: [messageView(41, sophie.id, { content: 'Bienvenue' })] },
        members: { 4: [agent.id, sophie.id], 5: [agent.id, thomas.id] },
      });

      const response = await request(app).get('/messaging/bootstrap').set('Authorization', authorizationFor(agent.id));

      expect(response.status).toBe(200);
      expectBffContract('get', '/messaging/bootstrap', response);
      expect(upstreamSequence(messageApi).sort()).toEqual(['GET /v1/', 'GET /v1/', 'GET /v1/4/', 'GET /v1/4/users/', 'GET /v1/4/users/', 'GET /v1/5/users/']);
      expect(response.body).toMatchObject({
        currentUser: { id: 'user-7', name: 'Agent Test' },
        activeConversationId: 'conversation-4',
        conversations: [{ id: 'conversation-4', department: 'Avec Sophie Leroy' }, { id: 'conversation-5', department: 'Avec Thomas Bernard' }],
        contacts: [{ id: 'user-8' }, { id: 'user-9' }],
        messages: [{ id: 'message-41', conversationId: 'conversation-4', content: 'Bienvenue', direction: 'incoming' }],
      });
    });

    test('GET /messaging/bootstrap without conversation does not request any chat messages', async () => {
      mockMessageApi();

      const response = await request(app).get('/messaging/bootstrap').set('Authorization', authorizationFor(agent.id));

      expect(response.status).toBe(200);
      expectBffContract('get', '/messaging/bootstrap', response);
      expect(response.body).not.toHaveProperty('activeConversationId');
      expect(response.body.messages).toEqual([]);
      expect(upstreamSequence(messageApi)).toEqual(['GET /v1/']);
    });
  });

  describe('request validation', () => {
    test.each([
      ['patch', '/me', { email: 'pas-un-email' }],
      ['get', '/contacts?limit=beaucoup', undefined],
      ['post', '/groups', { memberIds: [8] }],
      ['get', '/conversations/conversation-4/messages?limit=1.5', undefined],
      ['post', '/conversations/conversation-4/messages', { content: 42 }],
      ['post', '/direct-messages', { recipientId: 'user-8' }],
      ['post', '/conversations/conversation-4/read', { readUntilMessageId: true }],
    ] as const)('%s %s rejects an invalid payload with 400 before any upstream call', async (method, url, body) => {
      mockMessageApi();

      const call = request(app)[method](url).set('Authorization', authorizationFor(agent.id));
      const response = await (body === undefined ? call : call.send(body));

      expectApiError(response, 400, 'BAD_REQUEST');
      expect(messageApi.requests).toEqual([]);
      expect(contactsRepository.listContacts).not.toHaveBeenCalled();
    });
  });

  describe('Message API failures', () => {
    test('keeps a Message API 401 as a 401 upstream error', async () => {
      mockMessageApi();
      // 401 produit par le JwtMiddleware de mairie360_api_lib (erreurs non typées par orval).
      messageApi.on('get', '/v1/', { status: 401, raw: 'Unauthorized', contentType: 'text/plain', outOfContract: true });

      const response = await request(app).get('/conversations').set('Authorization', authorizationFor(agent.id));

      expectApiError(response, 401, 'UPSTREAM_ERROR');
      expectBffContract('get', '/conversations', response);
    });

    test('keeps a Message API 404 on an unknown chat as a 404', async () => {
      mockMessageApi();

      const response = await request(app).get('/conversations/conversation-99/messages').set('Authorization', authorizationFor(agent.id));

      expectApiError(response, 404, 'UPSTREAM_ERROR');
      expect(messageApi.calls('/v1/{chatId}/').map((call) => call.pathParams.chatId)).toEqual(['99']);
    });

    test('maps a Message API 500 to 502 without leaking the upstream message', async () => {
      mockMessageApi();
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      messageApi.on('post', '/v1/{chatId}/messages/', { status: 500, raw: 'An error occurred while accessing the database.', contentType: 'text/plain', outOfContract: true });

      const response = await request(app).post('/conversations/conversation-4/messages').set('Authorization', authorizationFor(agent.id)).send({ content: 'Bonjour' });

      expectApiError(response, 502, 'BAD_GATEWAY');
      expect(JSON.stringify(response.body)).not.toContain('database');
    });

    test('maps a dropped Message API connection to 502', async () => {
      mockMessageApi();
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      messageApi.on('post', '/v1/', { dropConnection: true });

      const response = await request(app).post('/groups').set('Authorization', authorizationFor(agent.id)).send({ name: 'Équipe', memberIds: [8] });

      expectApiError(response, 502, 'BAD_GATEWAY');
    });
  });

  describe('GET /business-references', () => {
    type Scenario = { projects?: ProjectItem[]; tasks?: Record<string, TaskItem[]>; events?: unknown[] };
    function mockBusinessBffs({ projects = [], tasks = {}, events = [] }: Scenario = {}) {
      projectBff.on('get', '/projects-page', { body: projectsPageResponse(projects) });
      projectBff.on('get', '/projects/{projectId}', ({ pathParams }) => {
        const project = projects.find((candidate) => candidate.id === pathParams.projectId);
        return project
          ? { body: projectDetailsResponse(project, tasks[project.id] ?? []) }
          : { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Projet introuvable', details: [] } }, outOfContract: true };
      });
      calendarBff.on('get', '/calendar/bootstrap', { body: calendarBootstrapResponse(events) });
    }

    test('aggregates project, task and event references with the caller session', async () => {
      const budget = projectListItem({ id: 'project-42', title: 'Budget participatif' });
      const school = projectListItem({ id: 'project/43', title: 'École' });
      mockBusinessBffs({
        projects: [budget, school],
        tasks: { [budget.id]: [taskItem({ id: 'task-7', title: 'Validation' })] },
        events: [calendarEvent({ id: 9, title: 'Conseil', date: '2026-09-08' }), calendarEvent({ id: 'evt-10', title: 'Permanence', date: '2026-09-12' })],
      });

      const response = await request(app).get('/business-references').set('Authorization', authorizationFor(agent.id));

      expect(response.status).toBe(200);
      expectBffContract('get', '/business-references', response);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual({
        references: [
          { id: 'project:project-42', title: 'Budget participatif', kind: 'project', description: 'Projet' },
          { id: 'project:project/43', title: 'École', kind: 'project', description: 'Projet' },
          { id: 'task:task-7', title: 'Validation', kind: 'task', description: 'Tâche · Budget participatif' },
          { id: 'event:9', title: 'Conseil', kind: 'event', description: 'Calendrier · 2026-09-08' },
          { id: 'event:evt-10', title: 'Permanence', kind: 'event', description: 'Calendrier · 2026-09-12' },
        ],
        sources: { projects: 'available', calendar: 'available' },
      });

      expect(Object.fromEntries(projectBff.calls('/projects-page')[0].url.searchParams)).toEqual({ limit: '100' });
      expect(projectBff.calls('/projects/{projectId}').map((call) => call.pathParams.projectId).sort()).toEqual(['project-42', 'project/43']);
      const [bootstrap] = calendarBff.calls('/calendar/bootstrap');
      const year = new Date().getUTCFullYear();
      expect(Object.fromEntries(bootstrap.url.searchParams)).toEqual({ from: `${year - 1}-01-01`, to: `${year + 1}-12-31` });
      // from/to sont lus par BFF Calendar mais absents de @mairie360/bff-calendar-openapi@0.3.0.
      expect(bootstrap.undeclaredQuery).toEqual(['from', 'to']);
      expect([...projectBff.requests, ...calendarBff.requests].every((call) => call.headers.authorization === authorizationFor(agent.id))).toBe(true);
    });

    test('keeps a project whose details fail without inventing its tasks', async () => {
      const budget = projectListItem({ id: 'project-42', title: 'Budget participatif' });
      mockBusinessBffs({ projects: [budget], tasks: { [budget.id]: [taskItem()] } });
      projectBff.on('get', '/projects/{projectId}', { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Projet introuvable', details: [] } }, outOfContract: true });

      const response = await request(app).get('/business-references').set('Authorization', authorizationFor(agent.id));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        references: [{ id: 'project:project-42', title: 'Budget participatif', kind: 'project', description: 'Projet' }],
        sources: { projects: 'available', calendar: 'available' },
      });
    });

    test('marks each failing source unavailable independently', async () => {
      mockBusinessBffs({ events: [calendarEvent({ id: 9, title: 'Conseil' })] });
      projectBff.on('get', '/projects-page', { status: 502, body: { error: { code: 'BAD_GATEWAY', message: 'Project API indisponible', details: [] } }, outOfContract: true });

      const projectsDown = await request(app).get('/business-references').set('Authorization', authorizationFor(agent.id));

      expect(projectsDown.status).toBe(200);
      expectBffContract('get', '/business-references', projectsDown);
      expect(projectsDown.body.sources).toEqual({ projects: 'unavailable', calendar: 'available' });
      expect(projectsDown.body.references.map((reference: { id: string }) => reference.id)).toEqual(['event:9']);
      expect(projectBff.calls('/projects/{projectId}')).toHaveLength(0);

      mockBusinessBffs({ projects: [projectListItem()] });
      calendarBff.on('get', '/calendar/bootstrap', { dropConnection: true });

      const calendarDown = await request(app).get('/business-references').set('Authorization', authorizationFor(agent.id));

      expect(calendarDown.status).toBe(200);
      expect(calendarDown.body.sources).toEqual({ projects: 'available', calendar: 'unavailable' });
    });

    test('requires a session and calls no BFF without it', async () => {
      mockBusinessBffs();

      const response = await request(app).get('/business-references');

      expect(response.status).toBe(401);
      expectBffContract('get', '/business-references', response);
      expect([...projectBff.requests, ...calendarBff.requests]).toHaveLength(0);
    });
  });

  describe('GET /check_apis', () => {
    beforeEach(() => {
      messageApi.on('get', '/health', { raw: 'OK', contentType: 'text/plain' });
    });

    test('reports Message API connected through its /health operation', async () => {
      const response = await request(app).get('/check_apis');

      expect(response.status).toBe(200);
      expectBffContract('get', '/check_apis', response);
      expect(response.body).toEqual({ status: 'OK', message_api: 'Connected' });
      expect(messageApi.requests.map((call) => call.url.pathname)).toEqual(['/health']);
    });

    test('answers 502 when Message API is unreachable', async () => {
      messageApi.on('get', '/health', { dropConnection: true });

      const response = await request(app).get('/check_apis');

      expect(response.status).toBe(502);
      expectBffContract('get', '/check_apis', response);
      expect(response.body).toMatchObject({ status: 'Error', message_api: 'Unreachable' });
    });
  });
});
