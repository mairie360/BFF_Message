import messageClient from '../src/clients/messageClient';
import { getContactUser } from '../src/repositories/contactsRepository';
import {
  fetchConversationMessages,
  fetchConversations,
  fetchCurrentUser,
  sendMessageToConversation,
} from '../src/routes/Messages/message_helpers';

jest.mock('../src/clients/messageClient', () => ({
  __esModule: true,
  default: {
    getChat: jest.fn(),
    getChats: jest.fn(),
    getChatUsers: jest.fn(),
    postMessage: jest.fn(),
  },
}));

jest.mock('../src/repositories/contactsRepository', () => ({
  getContactUser: jest.fn(),
  listContacts: jest.fn(),
}));

const authorization = `Bearer header.${Buffer.from(
  JSON.stringify({ sub: 7 }),
).toString('base64url')}.signature`;

describe('message helpers author direction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the same public user id for the current user and a sent message', async () => {
    jest.mocked(getContactUser).mockResolvedValue({
      id: 7,
      first_name: 'Agent',
      last_name: 'Test',
      email: 'agent.test@mairie360.fr',
    });
    jest.mocked(messageClient.postMessage).mockResolvedValue({
      data: { id: 31 },
    } as Awaited<ReturnType<typeof messageClient.postMessage>>);

    const user = await fetchCurrentUser(authorization);
    const result = await sendMessageToConversation(
      'conversation-4',
      'Message envoyé',
      authorization,
    );

    expect(user.id).toBe('user-7');
    expect(result.message.authorId).toBe(user.id);
    expect(result.message.direction).toBe('outgoing');
  });

  it('marks only messages from the authenticated user as outgoing', async () => {
    jest.mocked(messageClient.getChats).mockResolvedValue({
      data: {
        chats: [{ id: 4, name: 'Équipe communication', unread_count: 0 }],
      },
    } as Awaited<ReturnType<typeof messageClient.getChats>>);
    jest.mocked(messageClient.getChatUsers).mockResolvedValue({
      data: { users: [] },
    } as unknown as Awaited<ReturnType<typeof messageClient.getChatUsers>>);
    jest.mocked(messageClient.getChat).mockResolvedValue({
      data: {
        messages: [
          {
            id: 41,
            sender_id: 7,
            content: 'Mon message',
            created_at: '2026-07-17T09:00:00.000Z',
          },
          {
            id: 42,
            sender_id: 8,
            content: 'Réponse reçue',
            created_at: '2026-07-17T09:01:00.000Z',
          },
        ],
      },
    } as Awaited<ReturnType<typeof messageClient.getChat>>);

    const result = await fetchConversationMessages(
      'conversation-4',
      undefined,
      authorization,
    );

    expect(result.messages).toEqual([
      expect.objectContaining({ authorId: 'user-7', direction: 'outgoing' }),
      expect.objectContaining({ authorId: 'user-8', direction: 'incoming' }),
    ]);
    expect(result.conversation.name).toBe('Équipe communication');
  });

  it('adds the other participants next to the conversation name', async () => {
    jest.mocked(messageClient.getChats).mockResolvedValue({
      data: {
        chats: [
          { id: 4, name: 'Équipe communication', unread_count: 0 },
        ],
      },
    } as Awaited<ReturnType<typeof messageClient.getChats>>);
    jest.mocked(messageClient.getChatUsers).mockResolvedValue({
      data: { users: [{ id: 7 }, { id: 8 }, { id: 9 }] },
    } as unknown as Awaited<ReturnType<typeof messageClient.getChatUsers>>);
    jest.mocked(getContactUser).mockImplementation(async (id) => ({
      id,
      first_name: id === 8 ? 'Sophie' : 'Thomas',
      last_name: id === 8 ? 'Leroy' : 'Bernard',
      email: null,
    }));

    const conversations = await fetchConversations(undefined, 20, authorization);

    expect(conversations).toEqual([
      expect.objectContaining({
        name: 'Équipe communication',
        department: 'Avec Sophie Leroy, Thomas Bernard',
      }),
    ]);
    expect(getContactUser).toHaveBeenCalledTimes(2);
    expect(getContactUser).not.toHaveBeenCalledWith(7);
  });
});
