import path from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import type { ChatView, MessageView } from '@mairie360/message-api-openapi/model';
import type { ListDirectoryUsersParams } from '@mairie360/core-api-openapi/model';
import type { ProjectListItem, ProjectTask } from '@mairie360/bff-project-openapi/model';
import type { CalendarEvent } from '@mairie360/bff-calendar-openapi/model';

// Tous les services amont (Message API, Core API pour l'annuaire, BFF Projets et BFF Calendrier) sont servis
// par de vrais serveurs locaux pilotés par les contrats reconstruits depuis leurs paquets @mairie360/*-openapi
// installés (tests/support/orval-contract.ts) : chaque requête du BFF (chemin, paramètres, corps JSON) et
// chaque réponse de succès simulée est validée contre ces contrats. Les corps simulés sont typés par les
// modèles générés et les chemins attendus viennent des helpers d'URL des clients générés.

import { ContractMockServer } from './support/contract-mock-server';
import { OpenApiContract } from './support/openapi-contract';
import { loadOrvalContract } from './support/orval-contract';
import {
  authorizationFor, calendarBffUrls, calendarBootstrapResponse, calendarEvent, chatResult, chatUsers, chatView, chatsResult, coreApiUrls,
  createChatResult, directoryUsers, messageApiUrls, messageView, postMessageResult, projectBffError, projectBffUrls, projectDetailsResponse,
  projectListItem, projectsPageResponse, taskItem, tokenFor, users,
} from './support/upstream-fixtures';

const { agent, sophie, thomas } = users;

const messageApi = new ContractMockServer('MESSAGE_API', loadOrvalContract('@mairie360/message-api-openapi'));
const coreApi = new ContractMockServer('CORE_API', loadOrvalContract('@mairie360/core-api-openapi'));
const projectBff = new ContractMockServer('PROJECT_BFF', loadOrvalContract('@mairie360/bff-project-openapi'));
const calendarBff = new ContractMockServer('CALENDAR_BFF', loadOrvalContract('@mairie360/bff-calendar-openapi'));
const mocks = [messageApi, coreApi, projectBff, calendarBff];
const bffContract = OpenApiContract.load(path.join(__dirname, '..', 'contracts', 'openapi.json'));

// Gabarits du contrat Message API (clés des mocks) ; les chemins concrets attendus viennent de messageApiUrls.
const MESSAGE_API = {
  chats: '/api/v1/',
  chat: '/api/v1/{chatId}/',
  messages: '/api/v1/{chatId}/messages/',
  users: '/api/v1/{chatId}/users/',
  health: '/health',
} as const;
const CORE_API = { directory: '/api/v1/user/', health: '/health' } as const;
const PROJECT_BFF = { page: '/projects-page', project: '/projects/{projectId}' } as const;
const CALENDAR_BFF = { bootstrap: '/calendar/bootstrap' } as const;

let app: Express;

beforeAll(async () => {
  await Promise.all(mocks.map((mock) => mock.start()));
  // messageClient et check_apis lisent leurs URL amont au chargement : l'application est importée après.
  // Former service-token fallback: it must be ignored even when set (MAIR-224).
  process.env.DEFAULT_JWT_TOKEN = 'Bearer service-token-must-not-leak';
  process.env.MESSAGE_API_BASE_PATH = messageApi.url;
  const messageApiUrl = new URL(messageApi.url);
  process.env.MESSAGE_API_URL = messageApiUrl.hostname;
  process.env.MESSAGE_API_PORT = messageApiUrl.port;
  const coreApiUrl = new URL(coreApi.url);
  process.env.CORE_API_URL = coreApiUrl.hostname;
  process.env.CORE_API_PORT = coreApiUrl.port;
  process.env.PROJECT_BFF_URL = projectBff.url;
  process.env.CALENDAR_BFF_URL = calendarBff.url;
  ({ app } = await import('../src/index'));
});
afterAll(async () => { await Promise.all(mocks.map((mock) => mock.stop())); });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  for (const mock of mocks) mock.reset();
  // Annuaire Core : la recherche et la sélection par identifiants sont appliquées comme par Core API.
  const directory = [agent, sophie, thomas];
  coreApi.on('get', CORE_API.directory, ({ url }) => {
    const { ids, search } = Object.fromEntries(url.searchParams) as Pick<ListDirectoryUsersParams, 'ids' | 'search'>;
    const wanted = ids?.split(',').map(Number);
    const needle = search?.toLowerCase();
    return {
      body: directoryUsers(directory.filter((user) => {
        const matchesIds = !wanted || wanted.includes(user.id);
        const fullName = `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase();
        return matchesIds && (!needle || fullName.includes(needle));
      })),
    };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  expect(mocks.flatMap((mock) => mock.violations)).toEqual([]);
});

type MessageApiScenario = {
  chats?: ChatView[];
  messages?: Record<number, MessageView[]>;
  members?: Record<number, number[]>;
  createdChatId?: number;
  postedMessageId?: number;
};

function mockMessageApi({ chats = [], messages = {}, members = {}, createdChatId = 12, postedMessageId = 31 }: MessageApiScenario = {}) {
  messageApi.on('get', MESSAGE_API.chats, { body: chatsResult(chats) });
  messageApi.on('post', MESSAGE_API.chats, { body: createChatResult(createdChatId) });
  messageApi.on('get', MESSAGE_API.chat, ({ pathParams }) => {
    const found = messages[Number(pathParams.chatId)];
    // 404 renvoyé par l'API réelle pour un salon inconnu ; les erreurs ne sont pas typées par orval.
    return found ? { body: chatResult(found) } : { status: 404, raw: 'Chat not found', contentType: 'text/plain', outOfContract: true };
  });
  messageApi.on('delete', MESSAGE_API.chat, { status: 200 });
  messageApi.on('post', MESSAGE_API.messages, { body: postMessageResult(postedMessageId) });
  messageApi.on('get', MESSAGE_API.users, ({ pathParams }) => ({ body: chatUsers(members[Number(pathParams.chatId)] ?? []) }));
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

/** Appels reçus par un service simulé, sous la forme `MÉTHODE chemin?query` (tels que les construisent les clients générés). */
const upstreamSequence = (mock: ContractMockServer) => mock.requests.map((call) => `${call.method} ${call.url.pathname}${call.url.search}`);
const called = (method: string, url: string) => `${method} ${url}`;

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
      expect(upstreamSequence(messageApi).sort()).toEqual([
        called('GET', messageApiUrls.getGetChatsUrl()),
        called('GET', messageApiUrls.getGetChatUsersUrl(4)),
        called('GET', messageApiUrls.getGetChatUsersUrl(5)),
      ]);
      expect(messageApi.requests.every((call) => call.headers.authorization === authorizationFor(agent.id))).toBe(true);
      // Seuls les autres participants sont demandés à l'annuaire.
      expect(coreApi.calls(CORE_API.directory).flatMap((call) => call.url.searchParams.get('ids')!.split(',')))
        .not.toContain(String(agent.id));
    });

    test('GET /conversations filters by search and applies limit before loading participants', async () => {
      mockMessageApi({ chats: [chatView(1, 'Voirie'), chatView(2, 'Équipe voirie nord'), chatView(3, 'Voirie sud'), chatView(4, 'Écoles')] });

      const response = await request(app).get('/conversations?search=VOIRIE&limit=2').set('Authorization', authorizationFor(agent.id));

      expect(response.status).toBe(200);
      expectBffContract('get', '/conversations', response);
      expect(response.body.conversations.map((conversation: { id: string }) => conversation.id)).toEqual(['conversation-1', 'conversation-2']);
      expect(messageApi.calls(MESSAGE_API.users).map((call) => call.pathParams.chatId).sort()).toEqual(['1', '2']);
    });

    test('promotes the accessToken cookie to the Authorization header sent to Message API', async () => {
      mockMessageApi();

      const response = await request(app).get('/conversations').set('Cookie', `theme=dark; accessToken=${encodeURIComponent(tokenFor(sophie.id))}`);

      expect(response.status).toBe(200);
      expect(messageApi.calls(MESSAGE_API.chats)[0].headers.authorization).toBe(authorizationFor(sophie.id));
    });

    test('degrades to conversations without participants when Message API fails on chat users', async () => {
      mockMessageApi({ chats: [chatView(4, 'Équipe communication')] });
      messageApi.on('get', MESSAGE_API.users, { status: 500, raw: 'Database error', contentType: 'text/plain', outOfContract: true });

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
      expect(upstreamSequence(messageApi)).toEqual([called('DELETE', messageApiUrls.getDeleteChatUrl(4))]);
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
      expect(messageApi.calls(MESSAGE_API.chats, 'POST')[0].body).toEqual({ name: 'Équipe voirie', members: [sophie.id, thomas.id] });
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
      expect(upstreamSequence(messageApi).sort()).toEqual([
        called('GET', messageApiUrls.getGetChatsUrl()),
        called('GET', messageApiUrls.getGetChatUrl(4)),
        called('GET', messageApiUrls.getGetChatUsersUrl(4)),
      ]);
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
      expect(messageApi.calls(MESSAGE_API.messages, 'POST').map((call) => [call.url.pathname, call.body]))
        .toEqual([[messageApiUrls.getPostMessageUrl(4), { content: 'Bonjour à tous' }]]);
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
      expect(messageApi.calls(MESSAGE_API.chats, 'POST')[0].body).toEqual({ name: 'Direct 8', members: [sophie.id] });
      expect(messageApi.calls(MESSAGE_API.messages, 'POST').map((call) => [call.url.pathname, call.body]))
        .toEqual([[messageApiUrls.getPostMessageUrl(21), { content: 'Bonjour Sophie' }]]);
      expect(response.body).toEqual({
        conversation: expect.objectContaining({ id: 'conversation-21', name: 'Conversation 21', department: 'Avec Sophie Leroy' }),
        message: expect.objectContaining({ id: 'message-50', conversationId: 21, direction: 'outgoing' }),
      });
    });
  });

  describe('current user, contacts and bootstrap', () => {
    test('GET /me resolves the token subject in the Core API directory', async () => {
      const response = await request(app).get('/me').set('Authorization', authorizationFor(sophie.id));

      expect(response.status).toBe(200);
      expectBffContract('get', '/me', response);
      expect(response.body.currentUser).toMatchObject({ id: 'user-8', name: 'Sophie Leroy', email: 'sophie.leroy@mairie360.fr' });
      expect(upstreamSequence(coreApi)).toEqual([called('GET', coreApiUrls.getListDirectoryUsersUrl({ ids: String(sophie.id) }))]);
    });

    test('GET /me answers 401 for a user absent from the directory', async () => {
      const response = await request(app).get('/me').set('Authorization', authorizationFor(404));

      expectApiError(response, 401, 'UNAUTHORIZED');
      expectBffContract('get', '/me', response);
    });

    test('GET /contacts lists the directory without the current user, search and limit forwarded to Core', async () => {
      const all = await request(app).get('/contacts').set('Authorization', authorizationFor(agent.id));
      const searched = await request(app).get('/contacts?search=le&limit=5').set('Authorization', authorizationFor(agent.id));

      expect(all.status).toBe(200);
      expectBffContract('get', '/contacts', all);
      expect(all.body.contacts).toEqual([
        { id: 'user-8', name: 'Sophie Leroy', initials: 'SL', presence: 'offline', email: 'sophie.leroy@mairie360.fr' },
        // Thomas Bernard n'a pas d'email : l'annuaire renvoie une chaîne vide, le contact n'en porte pas.
        { id: 'user-9', name: 'Thomas Bernard', initials: 'TB', presence: 'offline' },
      ]);

      expect(searched.status).toBe(200);
      expect(upstreamSequence(coreApi).slice(-1)).toEqual([called('GET', coreApiUrls.getListDirectoryUsersUrl({ search: 'le', limit: 5 }))]);
      expect(searched.body.contacts.map((contact: { id: string }) => contact.id)).toEqual(['user-8']);
    });

    test('GET /contacts requires a session', async () => {
      const response = await request(app).get('/contacts');

      expectApiError(response, 401, 'UNAUTHORIZED');
      expectBffContract('get', '/contacts', response);
      expect(coreApi.requests).toEqual([]);
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
      expect(upstreamSequence(messageApi).sort()).toEqual([
        called('GET', messageApiUrls.getGetChatsUrl()),
        called('GET', messageApiUrls.getGetChatsUrl()),
        called('GET', messageApiUrls.getGetChatUrl(4)),
        called('GET', messageApiUrls.getGetChatUsersUrl(4)),
        called('GET', messageApiUrls.getGetChatUsersUrl(4)),
        called('GET', messageApiUrls.getGetChatUsersUrl(5)),
      ]);
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
      expect(upstreamSequence(messageApi)).toEqual([called('GET', messageApiUrls.getGetChatsUrl())]);
    });
  });

  describe('session isolation and authentication (MAIR-224)', () => {
    test('PATCH /me without a token answers 401 and never exposes another user', async () => {
      // A previous caller's GET /me must not leak into an anonymous PATCH /me.
      await request(app).get('/me').set('Authorization', authorizationFor(sophie.id));

      const response = await request(app).patch('/me').send({ city: 'Lyon' });

      expectApiError(response, 401, 'UNAUTHORIZED');
      expectBffContract('patch', '/me', response);
      expect(JSON.stringify(response.body)).not.toContain('sophie');
      expect(JSON.stringify(response.body)).not.toContain('user-8');
    });

    test('PATCH /me answers with the caller own profile, never the last GET /me caller', async () => {
      await request(app).get('/me').set('Authorization', authorizationFor(sophie.id));

      const response = await request(app).patch('/me').set('Authorization', authorizationFor(agent.id)).send({ city: 'Lyon' });

      expect(response.status).toBe(200);
      expectBffContract('patch', '/me', response);
      expect(response.body.currentUser).toMatchObject({ id: 'user-7', name: 'Agent Test', email: 'agent.test@mairie360.fr', city: 'Lyon' });
      expect(upstreamSequence(coreApi).slice(-1)).toEqual([called('GET', coreApiUrls.getListDirectoryUsersUrl({ ids: String(agent.id) }))]);
    });

    test('PATCH /me does not share one user edits with another user', async () => {
      await request(app).patch('/me').set('Authorization', authorizationFor(agent.id)).send({ city: 'Lyon', phone: '0102030405' });

      const response = await request(app).patch('/me').set('Authorization', authorizationFor(sophie.id)).send({ address: '1 rue de la Mairie' });

      expect(response.status).toBe(200);
      expect(response.body.currentUser).toMatchObject({ id: 'user-8', address: '1 rue de la Mairie' });
      expect(response.body.currentUser).not.toHaveProperty('city');
      expect(response.body.currentUser).not.toHaveProperty('phone');
    });

    test('PATCH /me answers 401 for a token whose user is absent from the directory', async () => {
      const response = await request(app).patch('/me').set('Authorization', authorizationFor(404)).send({ city: 'Lyon' });

      expectApiError(response, 401, 'UNAUTHORIZED');
    });

    test('POST /attachments without a token answers 401', async () => {
      const response = await request(app).post('/attachments').send({ files: [{ name: 'note.pdf' }] });

      expectApiError(response, 401, 'UNAUTHORIZED');
      expectBffContract('post', '/attachments', response);
      expect(coreApi.requests).toEqual([]);
    });

    test('POST /attachments answers 401 when the session cannot be resolved', async () => {
      const response = await request(app).post('/attachments').set('Authorization', authorizationFor(404)).send({ files: [{ name: 'note.pdf' }] });

      expectApiError(response, 401, 'UNAUTHORIZED');
    });

    test('POST /attachments accepts an authenticated caller', async () => {
      const response = await request(app).post('/attachments').set('Authorization', authorizationFor(agent.id)).send({ files: [{ name: 'note.pdf' }] });

      expect(response.status).toBe(201);
      expectBffContract('post', '/attachments', response);
      expect(response.body.attachments).toEqual([expect.objectContaining({ name: 'note.pdf' })]);
    });

    test('an anonymous request is forwarded upstream without any default token', async () => {
      messageApi.on('get', MESSAGE_API.chats, ({ headers }) => (headers.authorization
        ? { body: chatsResult([]) }
        : { status: 401, raw: 'Unauthorized', contentType: 'text/plain', outOfContract: true }));

      const response = await request(app).get('/conversations');

      expectApiError(response, 401, 'UNAUTHORIZED');
      expect(messageApi.requests.map((call) => call.headers.authorization)).toEqual([undefined]);
    });

    test('an upstream 4xx is relayed without its message or body', async () => {
      mockMessageApi();
      messageApi.on('post', MESSAGE_API.chats, {
        status: 422, body: { error: 'duplicate key value violates unique constraint "chats_pkey"' }, outOfContract: true,
      });

      const response = await request(app).post('/groups').set('Authorization', authorizationFor(agent.id)).send({ name: 'Équipe', memberIds: [8] });

      expectApiError(response, 422, 'UPSTREAM_ERROR');
      expect(response.body).not.toHaveProperty('details');
      expect(JSON.stringify(response.body)).not.toMatch(/duplicate|chats_pkey|status code/i);
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
      expect(coreApi.requests).toEqual([]);
    });
  });

  describe('Message API failures', () => {
    test('keeps a Message API 401 as a 401 upstream error', async () => {
      mockMessageApi();
      // 401 produit par le JwtMiddleware de mairie360_api_lib (erreurs non typées par orval).
      messageApi.on('get', MESSAGE_API.chats, { status: 401, raw: 'Unauthorized', contentType: 'text/plain', outOfContract: true });

      const response = await request(app).get('/conversations').set('Authorization', authorizationFor(agent.id));

      expectApiError(response, 401, 'UNAUTHORIZED');
      expectBffContract('get', '/conversations', response);
      expect(JSON.stringify(response.body)).not.toContain('Unauthorized');
    });

    test('keeps a Message API 404 on an unknown chat as a 404', async () => {
      mockMessageApi();

      const response = await request(app).get('/conversations/conversation-99/messages').set('Authorization', authorizationFor(agent.id));

      expectApiError(response, 404, 'NOT_FOUND');
      expect(JSON.stringify(response.body)).not.toContain('Chat not found');
      expect(messageApi.calls(MESSAGE_API.chat).map((call) => call.url.pathname)).toEqual([messageApiUrls.getGetChatUrl(99)]);
    });

    test('maps a Message API 500 to 502 without leaking the upstream message', async () => {
      mockMessageApi();
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      messageApi.on('post', MESSAGE_API.messages, { status: 500, raw: 'An error occurred while accessing the database.', contentType: 'text/plain', outOfContract: true });

      const response = await request(app).post('/conversations/conversation-4/messages').set('Authorization', authorizationFor(agent.id)).send({ content: 'Bonjour' });

      expectApiError(response, 502, 'BAD_GATEWAY');
      expect(JSON.stringify(response.body)).not.toContain('database');
    });

    test('maps a dropped Message API connection to 502', async () => {
      mockMessageApi();
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      messageApi.on('post', MESSAGE_API.chats, { dropConnection: true });

      const response = await request(app).post('/groups').set('Authorization', authorizationFor(agent.id)).send({ name: 'Équipe', memberIds: [8] });

      expectApiError(response, 502, 'BAD_GATEWAY');
    });
  });

  describe('GET /business-references', () => {
    type Scenario = { projects?: ProjectListItem[]; tasks?: Record<string, ProjectTask[]>; events?: CalendarEvent[] };
    function mockBusinessBffs({ projects = [], tasks = {}, events = [] }: Scenario = {}) {
      projectBff.on('get', PROJECT_BFF.page, { body: projectsPageResponse(projects) });
      projectBff.on('get', PROJECT_BFF.project, ({ pathParams }) => {
        const project = projects.find((candidate) => candidate.id === pathParams.projectId);
        return project
          ? { body: projectDetailsResponse(project, tasks[project.id] ?? []) }
          : { status: 404, body: projectBffError('NOT_FOUND', 'Projet introuvable'), outOfContract: true };
      });
      calendarBff.on('get', CALENDAR_BFF.bootstrap, { body: calendarBootstrapResponse(events) });
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

      expect(upstreamSequence(projectBff)).toContain(called('GET', projectBffUrls.getGetProjectsPageUrl({ limit: 100 })));
      // Le BFF encode l'identifiant avant de le passer au client généré, qui l'insère tel quel.
      expect(projectBff.calls(PROJECT_BFF.project).map((call) => call.url.pathname).sort())
        .toEqual([projectBffUrls.getGetProjectsProjectIdUrl('project-42'), projectBffUrls.getGetProjectsProjectIdUrl(encodeURIComponent('project/43'))].sort());
      const [bootstrap] = calendarBff.calls(CALENDAR_BFF.bootstrap);
      const year = new Date().getUTCFullYear();
      expect(bootstrap.url.pathname).toBe(calendarBffUrls.getGetCalendarBootstrapUrl());
      expect(Object.fromEntries(bootstrap.url.searchParams)).toEqual({ from: `${year - 1}-01-01`, to: `${year + 1}-12-31` });
      // from/to sont lus par BFF Calendar mais absents de @mairie360/bff-calendar-openapi@0.3.0.
      expect(bootstrap.undeclaredQuery).toEqual(['from', 'to']);
      expect([...projectBff.requests, ...calendarBff.requests].every((call) => call.headers.authorization === authorizationFor(agent.id))).toBe(true);
    });

    test('keeps a project whose details fail without inventing its tasks', async () => {
      const budget = projectListItem({ id: 'project-42', title: 'Budget participatif' });
      mockBusinessBffs({ projects: [budget], tasks: { [budget.id]: [taskItem()] } });
      projectBff.on('get', PROJECT_BFF.project, { status: 404, body: projectBffError('NOT_FOUND', 'Projet introuvable'), outOfContract: true });

      const response = await request(app).get('/business-references').set('Authorization', authorizationFor(agent.id));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        references: [{ id: 'project:project-42', title: 'Budget participatif', kind: 'project', description: 'Projet' }],
        sources: { projects: 'available', calendar: 'available' },
      });
    });

    test('marks each failing source unavailable independently', async () => {
      mockBusinessBffs({ events: [calendarEvent({ id: 9, title: 'Conseil' })] });
      projectBff.on('get', PROJECT_BFF.page, { status: 502, body: projectBffError('BAD_GATEWAY', 'Project API indisponible'), outOfContract: true });

      const projectsDown = await request(app).get('/business-references').set('Authorization', authorizationFor(agent.id));

      expect(projectsDown.status).toBe(200);
      expectBffContract('get', '/business-references', projectsDown);
      expect(projectsDown.body.sources).toEqual({ projects: 'unavailable', calendar: 'available' });
      expect(projectsDown.body.references.map((reference: { id: string }) => reference.id)).toEqual(['event:9']);
      expect(projectBff.calls(PROJECT_BFF.project)).toHaveLength(0);

      mockBusinessBffs({ projects: [projectListItem()] });
      calendarBff.on('get', CALENDAR_BFF.bootstrap, { dropConnection: true });

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
      messageApi.on('get', MESSAGE_API.health, { raw: 'OK', contentType: 'text/plain' });
      coreApi.on('get', CORE_API.health, { raw: 'OK', contentType: 'text/plain' });
    });

    test('reports Message API and Core API connected through their /health operations', async () => {
      const response = await request(app).get('/check_apis');

      expect(response.status).toBe(200);
      expectBffContract('get', '/check_apis', response);
      expect(response.body).toEqual({ status: 'OK', message_api: 'Connected', core_api: 'Connected' });
      expect(upstreamSequence(messageApi)).toEqual([called('GET', messageApiUrls.getHealthUrl())]);
      expect(upstreamSequence(coreApi)).toEqual([called('GET', coreApiUrls.getHealthUrl())]);
    });

    test.each([
      ['Message API', () => messageApi.on('get', MESSAGE_API.health, { dropConnection: true }), { message_api: 'Unreachable', core_api: 'Connected' }],
      ['Core API', () => coreApi.on('get', CORE_API.health, { dropConnection: true }), { message_api: 'Connected', core_api: 'Unreachable' }],
    ])('answers 502 when %s is unreachable', async (_service, breakService, expected) => {
      breakService();

      const response = await request(app).get('/check_apis');

      expect(response.status).toBe(502);
      expectBffContract('get', '/check_apis', response);
      expect(response.body).toMatchObject({ status: 'Error', ...expected });
    });
  });
});
