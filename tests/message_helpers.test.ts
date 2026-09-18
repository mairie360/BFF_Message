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

describe('message helpers author direction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the same public user id for the current user and a sent message', async () => {
    jest.mocked(getContactUser).mockResolvedValue(directoryUser(agent));
    jest.mocked(messageClient.postMessage).mockResolvedValue(axiosResponse(postMessageResult(31)));

    const user = await fetchCurrentUser(authorization);
    const result = await sendMessageToConversation('conversation-4', 'Message envoyé', authorization);

    expect(user.id).toBe(`user-${agent.id}`);
    expect(result.message.authorId).toBe(user.id);
    expect(result.message.direction).toBe('outgoing');
    expect(messageClient.postMessage).toHaveBeenCalledWith(4, { content: 'Message envoyé' }, { headers: { Authorization: authorization } });
  });

  it('marks only messages from the authenticated user as outgoing', async () => {
    jest.mocked(messageClient.getChats).mockResolvedValue(axiosResponse(chatsResult([chatView(4, 'Équipe communication')])));
    jest.mocked(messageClient.getChatUsers).mockResolvedValue(axiosResponse(chatUsers([])));
    jest.mocked(messageClient.getChat).mockResolvedValue(axiosResponse(chatResult([
      messageView(41, agent.id, { content: 'Mon message', created_at: '2026-07-17T09:00:00.000Z' }),
      messageView(42, sophie.id, { content: 'Réponse reçue', created_at: '2026-07-17T09:01:00.000Z' }),
    ])));

    const result = await fetchConversationMessages('conversation-4', undefined, authorization);

    expect(result.messages).toEqual([
      expect.objectContaining({ authorId: `user-${agent.id}`, direction: 'outgoing' }),
      expect.objectContaining({ authorId: `user-${sophie.id}`, direction: 'incoming' }),
    ]);
    expect(result.conversation.name).toBe('Équipe communication');
    expect(messageClient.getChat).toHaveBeenCalledWith(4, { headers: { Authorization: authorization } });
  });

  it('adds the other participants next to the conversation name', async () => {
    jest.mocked(messageClient.getChats).mockResolvedValue(axiosResponse(chatsResult([chatView(4, 'Équipe communication')])));
    jest.mocked(messageClient.getChatUsers).mockResolvedValue(axiosResponse(chatUsers([agent.id, sophie.id, thomas.id])));
    // Les participants sont demandés à l'annuaire en un seul appel.
    jest.mocked(listContactsByIds).mockImplementation(async (ids) => [sophie, thomas].filter((user) => ids.includes(user.id)));

    const conversations = await fetchConversations(undefined, 20, authorization);

    expect(conversations).toEqual([
      expect.objectContaining({ name: 'Équipe communication', department: 'Avec Sophie Leroy, Thomas Bernard' }),
    ]);
    expect(listContactsByIds).toHaveBeenCalledTimes(1);
    expect(listContactsByIds).toHaveBeenCalledWith([sophie.id, thomas.id], authorization);
  });
});
