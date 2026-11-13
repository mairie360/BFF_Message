import type { Request, Response } from 'express';
import { requireSession } from '@mairie360/bffs-lib';
import messageClient from '../src/clients/messageClient';
import { getContactUser, listContacts } from '../src/clients/coreClient';
import { fetchContacts, fetchConversations, fetchCurrentUser } from '../src/routes/Messages/message_helpers';
import {
  authorizationFor, axiosResponse, chatView, chatsResult, directChatView, directoryUser, users,
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

// MAIR-241: the fallback branches of the helpers (profile with no email or role, directory entry with few fields,
// direct chat of a deleted contact, malformed cursor) that the journeys never reach, so the 80 % branch threshold holds.
describe('MAIR-241 branch coverage of the message helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('leaves out the email and the role the directory does not know', async () => {
    jest.mocked(getContactUser).mockResolvedValue(directoryUser(agent, { email: ' ', roles: [' '] }));

    const user = await fetchCurrentUser(context);

    expect(user).toEqual({ id: `user-${agent.id}`, name: 'Agent Test' });
  });

  it('joins the roles and keeps the email the directory knows', async () => {
    jest.mocked(getContactUser).mockResolvedValue(directoryUser(agent, { roles: ['Admin', 'User'] }));

    expect(await fetchCurrentUser(context)).toMatchObject({ email: agent.email, role: 'Admin, User' });
  });

  it('answers 401 when the caller is not in the directory', async () => {
    jest.mocked(getContactUser).mockResolvedValue(null as never);

    await expect(fetchCurrentUser(context)).rejects.toMatchObject({ status: 401 });
  });

  it('names a contact after what the directory gives, drops an entry without id', async () => {
    jest.mocked(getContactUser).mockResolvedValue(directoryUser(agent));
    jest.mocked(listContacts).mockResolvedValue([
      { user_id: 11, name: 'Nom Seul' },
      { id: 12, email: 'a@mairie360.fr' },
      { id: 13 },
      { first_name: 'Sans', last_name: 'Identifiant' },
    ] as never);

    const contacts = await fetchContacts(undefined, undefined, context);

    expect(contacts.map((contact) => [contact.id, contact.name])).toEqual([
      ['user-11', 'Nom Seul'],
      ['user-12', 'a@mairie360.fr'],
      ['user-13', 'Utilisateur 13'],
    ]);
    expect(listContacts).toHaveBeenCalledWith(undefined, undefined, agent.id, context);
  });

  it('refuses a cursor that is not an offset before any upstream call', async () => {
    await expect(fetchConversations(undefined, 20, 'abc', context)).rejects.toMatchObject({ status: 400 });
    expect(messageClient.getChats).not.toHaveBeenCalled();
  });

  it('lists a direct chat by its contact, a deleted contact without one, and an empty group without a member count', async () => {
    jest.mocked(messageClient.getChats).mockResolvedValue(axiosResponse(chatsResult([
      directChatView(5, 8, 'Sophie Leroy'),
      { ...directChatView(6, 9, ''), contact_id: null },
      { ...directChatView(7, 9, ''), name: '' },
      chatView(8, 'Équipe vide', 0, 0),
    ])));

    const { conversations, nextCursor } = await fetchConversations('  ', undefined, undefined, context);

    expect(conversations[0]).toMatchObject({ kind: 'direct', name: 'Sophie Leroy', contactId: 'user-8', initials: 'SL' });
    expect(conversations[1]).toMatchObject({ kind: 'direct', name: '', initials: '' });
    expect(conversations[1]).not.toHaveProperty('contactId');
    expect(conversations[2]).toMatchObject({ name: 'Utilisateur 9', contactId: 'user-9' });
    expect(conversations[3]).toMatchObject({ kind: 'group', department: undefined });
    expect(nextCursor).toBeUndefined();
    // A blank search is not sent upstream.
    expect(messageClient.getChats).toHaveBeenCalledWith({ limit: 20, offset: 0 }, callOptions);
  });
});
