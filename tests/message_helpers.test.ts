import messageClient from '../src/clients/messageClient';
import { getContactUser, listContactsByIds } from '../src/clients/coreClient';
import {
  fetchConversationMessages,
  fetchConversations,
  fetchCurrentUser,
  sendMessageToConversation,
} from '../src/routes/Messages/message_helpers';
import {
  authorizationFor, axiosResponse, chatResult, chatUsers, chatView, chatsResult, directoryUser, messageView, postMessageResult, users,
} from './support/upstream-fixtures';

// Le client Message API est remplacé par un mock qui expose exactement les opérations du client généré
// (@mairie360/message-api-openapi) : une opération renommée ou retirée par le contrat casse le test.
jest.mock('../src/clients/messageClient', () => {
  const { getMessageAPIMairie360 } = jest.requireActual<typeof import('@mairie360/message-api-openapi/endpoints/messageAPIMairie360')>(
    '@mairie360/message-api-openapi/endpoints/messageAPIMairie360',
  );
  return {
    __esModule: true,
    default: Object.fromEntries(Object.keys(getMessageAPIMairie360()).map((operation) => [operation, jest.fn()])),
  };
});

jest.mock('../src/clients/coreClient', () => ({
  getContactUser: jest.fn(),
  listContacts: jest.fn(),
  listContactsByIds: jest.fn().mockResolvedValue([]),
}));

const { agent, sophie, thomas } = users;
const authorization = authorizationFor(agent.id);
// Read on every call by the helpers (MAIR-431); the client itself is mocked.
const MESSAGE_API_URL = 'http://message-api.test:3003';
const callOptions = { baseURL: MESSAGE_API_URL, timeout: 5_000, headers: { Authorization: authorization } };
process.env.MESSAGE_API_URL = MESSAGE_API_URL;
// What a route hands to the helpers: the caller's request and the upstream 4xx it declares.
const context = { req: { headers: { authorization } }, declared: [401] };

describe('message helpers author direction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the same public user id for the current user and a sent message', async () => {
    jest.mocked(getContactUser).mockResolvedValue(directoryUser(agent));
    jest.mocked(messageClient.postMessage).mockResolvedValue(axiosResponse(postMessageResult(31)));

    const user = await fetchCurrentUser(context);
    const result = await sendMessageToConversation('conversation-4', 'Message envoyé', context);

    expect(user.id).toBe(`user-${agent.id}`);
    expect(result.message.authorId).toBe(user.id);
    expect(result.message.direction).toBe('outgoing');
    expect(messageClient.postMessage).toHaveBeenCalledWith(4, { content: 'Message envoyé' }, callOptions);
  });

  it('marks only messages from the authenticated user as outgoing', async () => {
    jest.mocked(messageClient.getChats).mockResolvedValue(axiosResponse(chatsResult([chatView(4, 'Équipe communication')])));
    jest.mocked(messageClient.getChatUsers).mockResolvedValue(axiosResponse(chatUsers([])));
    jest.mocked(messageClient.getChat).mockResolvedValue(axiosResponse(chatResult([
      messageView(41, agent.id, { content: 'Mon message', created_at: '2026-07-17T09:00:00.000Z' }),
      messageView(42, sophie.id, { content: 'Réponse reçue', created_at: '2026-07-17T09:01:00.000Z' }),
    ])));

    const result = await fetchConversationMessages('conversation-4', undefined, context);

    expect(result.messages).toEqual([
      expect.objectContaining({ authorId: `user-${agent.id}`, direction: 'outgoing' }),
      expect.objectContaining({ authorId: `user-${sophie.id}`, direction: 'incoming' }),
    ]);
    expect(result.conversation.name).toBe('Équipe communication');
    // Without a limit, every page is read (here a single one).
    expect(messageClient.getChat).toHaveBeenCalledWith(4, { limit: 100 }, callOptions);
  });

  it('adds the other participants next to the conversation name', async () => {
    jest.mocked(messageClient.getChats).mockResolvedValue(axiosResponse(chatsResult([chatView(4, 'Équipe communication')])));
    jest.mocked(messageClient.getChatUsers).mockResolvedValue(axiosResponse(chatUsers([agent.id, sophie.id, thomas.id])));
    // Les participants sont demandés à l'annuaire en un seul appel.
    jest.mocked(listContactsByIds).mockImplementation(async (ids) => [sophie, thomas].filter((user) => ids.includes(user.id)));

    const conversations = await fetchConversations(undefined, 20, context);

    expect(conversations).toEqual([
      expect.objectContaining({ name: 'Équipe communication', department: 'Avec Sophie Leroy, Thomas Bernard' }),
    ]);
    expect(listContactsByIds).toHaveBeenCalledTimes(1);
    expect(listContactsByIds).toHaveBeenCalledWith([sophie.id, thomas.id], context);
  });
});

describe('Message API pagination (message-api 1.0)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads every page of chats and members', async () => {
    jest.mocked(messageClient.getChats)
      .mockResolvedValueOnce(axiosResponse(chatsResult([chatView(4, 'Équipe communication')], true)))
      .mockResolvedValueOnce(axiosResponse(chatsResult([chatView(5, 'Conseil municipal')])));
    jest.mocked(messageClient.getChatUsers).mockImplementation(async (_chatId, params) => axiosResponse(
      params?.offset === 0 ? chatUsers([agent.id], true) : chatUsers([sophie.id]),
    ));
    jest.mocked(listContactsByIds).mockImplementation(async (ids) => [sophie].filter((user) => ids.includes(user.id)));

    const conversations = await fetchConversations(undefined, undefined, context);

    expect(conversations.map((conversation) => conversation.id)).toEqual(['conversation-4', 'conversation-5']);
    expect(conversations[0]).toEqual(expect.objectContaining({ department: 'Avec Sophie Leroy' }));
    expect(messageClient.getChats).toHaveBeenNthCalledWith(1, { limit: 100, offset: 0 }, callOptions);
    expect(messageClient.getChats).toHaveBeenNthCalledWith(2, { limit: 100, offset: 100 }, callOptions);
    expect(messageClient.getChatUsers).toHaveBeenCalledWith(4, { limit: 100, offset: 100 }, callOptions);
  });

  it('reads older pages of messages with the before cursor when no limit is given', async () => {
    jest.mocked(messageClient.getChats).mockResolvedValue(axiosResponse(chatsResult([chatView(4)])));
    jest.mocked(messageClient.getChatUsers).mockResolvedValue(axiosResponse(chatUsers([])));
    jest.mocked(messageClient.getChat)
      .mockResolvedValueOnce(axiosResponse(chatResult([messageView(42, sophie.id), messageView(43, agent.id)], 42)))
      .mockResolvedValueOnce(axiosResponse(chatResult([messageView(41, sophie.id)])));

    const result = await fetchConversationMessages('conversation-4', undefined, context);

    expect(result.messages.map((message) => message.id)).toEqual(['message-41', 'message-42', 'message-43']);
    expect(messageClient.getChat).toHaveBeenNthCalledWith(1, 4, { limit: 100 }, callOptions);
    expect(messageClient.getChat).toHaveBeenNthCalledWith(2, 4, { limit: 100, before: 42 }, callOptions);
  });

  it('asks Message API for the requested number of latest messages only', async () => {
    jest.mocked(messageClient.getChats).mockResolvedValue(axiosResponse(chatsResult([chatView(4)])));
    jest.mocked(messageClient.getChatUsers).mockResolvedValue(axiosResponse(chatUsers([])));
    jest.mocked(messageClient.getChat).mockResolvedValue(axiosResponse(chatResult([messageView(43, agent.id)], 43)));

    const result = await fetchConversationMessages('conversation-4', 1, context);

    expect(result.messages.map((message) => message.id)).toEqual(['message-43']);
    expect(messageClient.getChat).toHaveBeenCalledTimes(1);
    expect(messageClient.getChat).toHaveBeenCalledWith(4, { limit: 1 }, callOptions);
  });

  it('leaves the author out of a message whose author account is deleted', async () => {
    jest.mocked(messageClient.getChats).mockResolvedValue(axiosResponse(chatsResult([chatView(4)])));
    jest.mocked(messageClient.getChatUsers).mockResolvedValue(axiosResponse(chatUsers([])));
    jest.mocked(messageClient.getChat).mockResolvedValue(axiosResponse(chatResult([messageView(41, agent.id, { sender_id: null })])));

    const [message] = (await fetchConversationMessages('conversation-4', undefined, context)).messages;

    expect(message).not.toHaveProperty('authorId');
    expect(message).not.toHaveProperty('authorName');
    expect(message!.direction).toBe('incoming');
  });
});

describe('Core API directory ids', () => {
  const { idsQueries } = jest.requireActual<typeof import('../src/clients/coreClient')>('../src/clients/coreClient');

  it('splits the ids into lists Core API accepts (at most 255 characters)', () => {
    const ids = Array.from({ length: 100 }, (_, index) => 1_000_000 + index);
    const queries = idsQueries(ids);

    expect(queries.length).toBeGreaterThan(1);
    expect(queries.every((query) => query.length <= 255)).toBe(true);
    expect(queries.join(',').split(',').map(Number)).toEqual(ids);
    expect(idsQueries([7, 8, 7])).toEqual(['7,8']);
    expect(idsQueries([])).toEqual([]);
  });
});
