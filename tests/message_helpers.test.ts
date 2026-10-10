import type { Request, Response } from 'express';
import { requireSession } from '@mairie360/bffs-lib';
import messageClient from '../src/clients/messageClient';
import { getContactUser, listContacts } from '../src/clients/coreClient';
import {
  fetchConversationMessages,
  fetchConversations,
  fetchCurrentUser,
  loadConversation,
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
}));

const { agent, sophie } = users;
const authorization = authorizationFor(agent.id);
// Read on every call by the helpers (MAIR-431); the client itself is mocked.
const MESSAGE_API_URL = 'http://message-api.test:3003';
const callOptions = { baseURL: MESSAGE_API_URL, timeout: 5_000, headers: { Authorization: authorization } };
process.env.MESSAGE_API_URL = MESSAGE_API_URL;
// What a route hands to the helpers: the caller's request and the upstream 4xx it declares.
// The request goes through the real `requireSession` (MAIR-474), which records the verified caller id.
const sessionRequest = { headers: { authorization } } as unknown as Request;
requireSession(sessionRequest, {} as Response, () => undefined);
const context = { req: sessionRequest, declared: [401] };

describe('message helpers author direction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the same public user id for the current user and a sent message', async () => {
    jest.mocked(getContactUser).mockResolvedValue(directoryUser(agent));
    jest.mocked(messageClient.postMessage).mockResolvedValue(axiosResponse(postMessageResult(31)));
    jest.mocked(messageClient.getChat).mockResolvedValue(axiosResponse(chatResult(chatView(4), [])));
    jest.mocked(messageClient.getChatUsers).mockResolvedValue(axiosResponse(chatUsers([agent.id])));

    const user = await fetchCurrentUser(context);
    const result = await sendMessageToConversation('conversation-4', 'Message envoyé', context);

    expect(user.id).toBe(`user-${agent.id}`);
    expect(result.message.authorId).toBe(user.id);
    expect(result.message.direction).toBe('outgoing');
    expect(messageClient.postMessage).toHaveBeenCalledWith(4, { content: 'Message envoyé' }, callOptions);
  });

  it('marks only messages from the authenticated user as outgoing', async () => {
    jest.mocked(messageClient.getChatUsers).mockResolvedValue(axiosResponse(chatUsers([])));
    jest.mocked(messageClient.getChat).mockResolvedValue(axiosResponse(chatResult(chatView(4, 'Équipe communication'), [
      messageView(41, agent.id, { content: 'Mon message', created_at: '2026-07-17T09:00:00.000Z' }),
      messageView(42, sophie.id, { content: 'Réponse reçue', created_at: '2026-07-17T09:01:00.000Z' }),
    ])));

    const result = await fetchConversationMessages('conversation-4', {}, context);

    expect(result.messages).toEqual([
      expect.objectContaining({ authorId: `user-${agent.id}`, direction: 'outgoing' }),
      expect.objectContaining({ authorId: `user-${sophie.id}`, direction: 'incoming' }),
    ]);
    expect(result.conversation.name).toBe('Équipe communication');
    // One page of 30 messages, never the whole history.
    expect(messageClient.getChat).toHaveBeenCalledTimes(1);
    expect(messageClient.getChat).toHaveBeenCalledWith(4, { limit: 30 }, callOptions);
  });

  it('shows a group by its member count and reads nothing but the page of chats', async () => {
    jest.mocked(messageClient.getChats).mockResolvedValue(axiosResponse(chatsResult([chatView(4, 'Équipe communication', 0, 3)])));

    const { conversations } = await fetchConversations(undefined, 20, undefined, context);

    expect(conversations).toEqual([
      expect.objectContaining({ name: 'Équipe communication', department: '3 membres', memberCount: 3 }),
    ]);
    expect(messageClient.getChats).toHaveBeenCalledTimes(1);
    expect(messageClient.getChatUsers).not.toHaveBeenCalled();
    expect(listContacts).not.toHaveBeenCalled();
    expect(getContactUser).not.toHaveBeenCalled();
  });
});

describe('Message API pagination (MAIR-507)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads one page of chats and hands over the next cursor', async () => {
    jest.mocked(messageClient.getChats)
      .mockResolvedValueOnce(axiosResponse(chatsResult([chatView(4, 'Équipe communication')], true)))
      .mockResolvedValueOnce(axiosResponse(chatsResult([chatView(5, 'Conseil municipal')])));

    const first = await fetchConversations(undefined, 1, undefined, context);
    const second = await fetchConversations('conseil', 1, first.nextCursor, context);

    expect(first.conversations.map((conversation) => conversation.id)).toEqual(['conversation-4']);
    expect(first.nextCursor).toBe('1');
    expect(second.conversations.map((conversation) => conversation.id)).toEqual(['conversation-5']);
    expect(second.nextCursor).toBeUndefined();
    expect(messageClient.getChats).toHaveBeenNthCalledWith(1, { limit: 1, offset: 0 }, callOptions);
    expect(messageClient.getChats).toHaveBeenNthCalledWith(2, { limit: 1, offset: 1, search: 'conseil' }, callOptions);
  });

  it('reads every page of members, and only the members', async () => {
    jest.mocked(messageClient.getChat).mockResolvedValue(axiosResponse(chatResult(chatView(4), [])));
    jest.mocked(messageClient.getChatUsers).mockImplementation(async (_chatId, params) => axiosResponse(
      params?.offset === 0 ? chatUsers([agent.id], true) : chatUsers([sophie.id]),
    ));

    const { participants } = await loadConversation('conversation-4', {}, context);

    expect(participants.map((participant) => participant.id)).toEqual([`user-${agent.id}`, `user-${sophie.id}`]);
    expect(messageClient.getChatUsers).toHaveBeenNthCalledWith(1, 4, { limit: 100, offset: 0 }, callOptions);
    expect(messageClient.getChatUsers).toHaveBeenNthCalledWith(2, 4, { limit: 100, offset: 100 }, callOptions);
  });

  it('goes back in the history with the before cursor, one page at a time', async () => {
    jest.mocked(messageClient.getChatUsers).mockResolvedValue(axiosResponse(chatUsers([])));
    jest.mocked(messageClient.getChat).mockResolvedValue(axiosResponse(chatResult(chatView(4), [messageView(42, sophie.id), messageView(43, agent.id)], 42)));

    const result = await fetchConversationMessages('conversation-4', { limit: 2, before: 50 }, context);

    expect(result.messages.map((message) => message.id)).toEqual(['message-42', 'message-43']);
    expect(result.hasMore).toBe(true);
    expect(result.nextCursor).toBe('42');
    expect(messageClient.getChat).toHaveBeenCalledTimes(1);
    expect(messageClient.getChat).toHaveBeenCalledWith(4, { limit: 2, before: 50 }, callOptions);
  });

  it('asks Message API for 100 messages at most', async () => {
    jest.mocked(messageClient.getChatUsers).mockResolvedValue(axiosResponse(chatUsers([])));
    jest.mocked(messageClient.getChat).mockResolvedValue(axiosResponse(chatResult(chatView(4), [messageView(43, agent.id)])));

    await fetchConversationMessages('conversation-4', { limit: 5000 }, context);

    expect(messageClient.getChat).toHaveBeenCalledWith(4, { limit: 100 }, callOptions);
  });

  it('leaves the author out of a message whose author account is deleted', async () => {
    jest.mocked(messageClient.getChatUsers).mockResolvedValue(axiosResponse(chatUsers([])));
    jest.mocked(messageClient.getChat).mockResolvedValue(axiosResponse(chatResult(chatView(4), [messageView(41, agent.id, { sender_id: null })])));

    const [message] = (await fetchConversationMessages('conversation-4', {}, context)).messages;

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
