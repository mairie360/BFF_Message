import { HttpError, mapUpstreamError, unverifiedSubject } from '@mairie360/bffs-lib';
import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';
import { z } from 'zod';
import messageClient from '../../clients/messageClient';
import { getContactUser, listContacts, listContactsByIds } from '../../clients/coreClient';
import type {
  ChatView,
  MessageView,
} from '@mairie360/message-api-openapi/model';
import {
  ContactDtoSchema,
  ConversationDtoSchema,
  CurrentUserDtoSchema,
  MessageDtoSchema,
} from '../../openapi-registry';

export type BffContact = z.infer<typeof ContactDtoSchema>;
export type BffConversation = z.infer<typeof ConversationDtoSchema>;
export type BffCurrentUser = z.infer<typeof CurrentUserDtoSchema>;
export type BffMessage = z.infer<typeof MessageDtoSchema>;

/** Options of a Message API call made on behalf of the caller: its own `Bearer` header, never a default token. */
function authOptions(authorization: string): AxiosRequestConfig {
  return { headers: { Authorization: authorization } };
}

function parseNumericId(value: string | number | undefined): number | null {
  if (value === undefined) {
    return null;
  }

  const match = String(value).match(/\d+$/);
  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);
  return Number.isNaN(parsed) ? null : parsed;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function publicChatId(chatId: number): string {
  return `conversation-${chatId}`;
}

function publicMessageId(messageId: number): string {
  return `message-${messageId}`;
}

function publicUserId(userId: string | number): string {
  return `user-${userId}`;
}

export { HttpError };

/**
 * The caller's profile. Its id is the JWT `sub` read **without verifying the signature**
 * (`unverifiedSubject`): it only shapes requests sent upstream with the same token, which the upstream
 * verifies, and the message direction; it never grants access by itself.
 */
export async function fetchCurrentUser(authorization: string): Promise<BffCurrentUser> {
  const id = unverifiedSubject(authorization);
  if (!id) {
    throw new HttpError(401, 'User id missing from the token');
  }

  const user = await getContactUser(id, authorization);

  if (!user) {
    throw new HttpError(401, 'Authenticated user not found');
  }

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  const roles = (user.roles ?? []).filter((role) => role.trim());

  // Built per request: a module-level user would leak the last caller's profile to the next one.
  // Only what the Core API directory knows is returned: no placeholder role, service, position or
  // last connection (the directory has no such fields).
  return {
    id: publicUserId(id),
    name,
    ...(user.email?.trim() ? { email: user.email } : {}),
    ...(roles.length > 0 ? { role: roles.join(', ') } : {}),
  };
}

type ConversationParticipants = {
  /** Every member id of the chat, the caller included. */
  memberIds: number[];
  /** Directory entries of the other members. */
  others: BffContact[];
  /** Directory entries of every member looked up (the caller only when `includeCaller` was asked). */
  members: BffContact[];
};

const noParticipants: ConversationParticipants = { memberIds: [], others: [], members: [] };

// Name given by `createDirectMessage` to the chats it creates; the id is the recipient's.
const DIRECT_CHAT_NAME = /^Direct (\d+)$/;

function directMessageName(recipientId: number): string {
  return `Direct ${recipientId}`;
}

/**
 * Id of the other participant when the chat is a direct conversation: created by
 * `POST /direct-messages` (named `Direct <recipientId>`, the recipient being either member) and
 * holding exactly the caller and one contact. Message API's own `kind` column is not used: it is
 * set to `direct` for every chat without a group and is not exposed.
 */
function directContactId(
  chatName: string,
  memberIds: number[],
  currentUserId: number | undefined,
): number | undefined {
  const match = DIRECT_CHAT_NAME.exec(chatName);
  if (!match || currentUserId === undefined) return undefined;

  const members = [...new Set(memberIds)];
  if (members.length !== 2 || !members.includes(currentUserId)) return undefined;
  if (!members.includes(Number(match[1]))) return undefined;

  return members.find((memberId) => memberId !== currentUserId);
}

function mapChatToConversation(
  chat: ChatView | { id: number; name: string; unread_count?: number },
  messages: MessageView[] = [],
  participants: ConversationParticipants = noParticipants,
  currentUserId?: number,
): BffConversation {
  const lastMessage = messages[messages.length - 1];
  const summary = {
    id: publicChatId(chat.id),
    lastMessage: lastMessage?.content,
    lastMessageAt: lastMessage?.created_at,
    unreadCount: chat.unread_count ?? 0,
  };
  const contactId = directContactId(chat.name, participants.memberIds, currentUserId);

  if (contactId !== undefined) {
    // A direct conversation is shown under the contact's name, the same on both sides.
    const contact = participants.others.find((other) => other.id === publicUserId(contactId));
    const name = contact?.name ?? `Utilisateur ${contactId}`;

    return {
      ...summary,
      name,
      kind: 'direct',
      contactId: publicUserId(contactId),
      initials: initials(name),
    };
  }

  const participantNames = participants.others.map((other) => other.name);

  return {
    ...summary,
    name: chat.name,
    department: participantNames.length > 0
      ? `Avec ${participantNames.join(', ')}`
      : undefined,
    kind: 'group',
    initials: initials(chat.name),
  };
}

type CoreUser = {
  id?: string | number;
  user_id?: string | number;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
};

function mapCoreUserToContact(user: CoreUser): BffContact | null {
  const userId = user.id ?? user.user_id;
  if (userId === undefined || userId === null) {
    return null;
  }

  const fullName = [user.first_name, user.last_name]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  const name = fullName || user.name?.trim() || user.email?.trim() || `Utilisateur ${userId}`;

  return {
    id: publicUserId(userId),
    name,
    initials: initials(name),
    presence: 'offline',
    // The Core directory answers an empty string when the agent has no email.
    email: user.email?.trim() ? user.email : undefined,
  };
}

async function fetchConversationParticipants(
  chatId: number,
  currentUserId: number | undefined,
  authorization: string,
  includeCaller = false,
): Promise<ConversationParticipants> {
  try {
    const response = await messageClient.getChatUsers(chatId, authOptions(authorization));
    const memberIds = [...new Set(response.data.users.map((user) => user.id))];
    const participants = await listContactsByIds(
      includeCaller ? memberIds : memberIds.filter((userId) => userId !== currentUserId),
      authorization,
    );
    const members = participants.flatMap((participant) => {
      const contact = mapCoreUserToContact(participant);
      return contact ? [contact] : [];
    });
    const callerId = currentUserId === undefined ? undefined : publicUserId(currentUserId);

    return {
      memberIds,
      others: members.filter((member) => member.id !== callerId),
      members,
    };
  } catch {
    return noParticipants;
  }
}

async function fetchChatSummary(
  chatId: number,
  authorization: string,
): Promise<ChatView | undefined> {
  try {
    const response = await messageClient.getChats(authOptions(authorization));
    return response.data.chats.find((chat) => chat.id === chatId);
  } catch {
    return undefined;
  }
}

/**
 * `authorName` is the author's directory name when the author is a member found in Core API, and is
 * left out otherwise (former member, directory unavailable): no placeholder name is made up.
 */
function mapMessageToDto(
  conversationId: string | number,
  message: MessageView,
  currentUserId?: number,
  members: BffContact[] = [],
): BffMessage {
  const authorId = publicUserId(message.sender_id);
  const currentAuthorId = currentUserId === undefined
    ? undefined
    : publicUserId(currentUserId);
  const authorName = members.find((member) => member.id === authorId)?.name;

  return {
    id: publicMessageId(message.id),
    conversationId,
    content: message.content,
    sentAt: message.created_at,
    authorId,
    ...(authorName ? { authorName } : {}),
    direction: currentAuthorId === authorId ? 'outgoing' : 'incoming',
    attachments: [],
    mentions: [],
  };
}

/** 400 for a request that fails its zod schema; each issue becomes a detail such as `body.content`. */
export function validationError(location: 'body' | 'query' | 'params', issues: readonly z.core.$ZodIssue[]): HttpError {
  return new HttpError(400, 'Validation failed', {
    details: issues.map((issue) => ({
      path: [location, ...issue.path.map(String)].join('.'),
      message: issue.message,
    })),
  });
}

/**
 * Error to throw for a failed upstream call (Message API, Core API). Only the upstream 4xx the route
 * declares in its contract (`declared`) are kept, with a generic message; any other status and a
 * network failure become a 502. Upstream messages and bodies are never relayed (information leak).
 * Anything that is not an upstream failure is returned unchanged: errorHandler() answers it.
 */
export function upstreamError(error: unknown, declared: readonly number[] = []): unknown {
  if (error instanceof HttpError || !axios.isAxiosError(error)) return error;

  const status = error.response?.status;
  if (status === undefined) {
    console.error('[BFF] Upstream unreachable', error.message);
    return new HttpError(502, 'An upstream service is unavailable');
  }
  if (status >= 500) console.error('[BFF] Upstream error', status, error.message);
  return mapUpstreamError(error, declared);
}

export async function fetchConversations(
  search: string | undefined,
  limit: number | undefined,
  authorization: string,
): Promise<BffConversation[]> {
  const response = await messageClient.getChats(authOptions(authorization));
  const chats = response.data.chats as ChatView[];
  const filteredChats = search
    ? chats.filter((chat) => chat.name.toLowerCase().includes(search.toLowerCase()))
    : chats;
  const visibleChats = typeof limit === 'number' ? filteredChats.slice(0, limit) : filteredChats;
  const currentUserId = unverifiedSubject(authorization);

  return Promise.all(
    visibleChats.map(async (chat) => {
      const participants = await fetchConversationParticipants(
        chat.id,
        currentUserId,
        authorization,
      );

      return mapChatToConversation(chat, [], participants, currentUserId);
    }),
  );
}

export async function fetchConversationMessages(
  conversationId: string | number,
  limit: number | undefined,
  authorization: string,
): Promise<{ conversation: BffConversation; messages: BffMessage[] }> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new HttpError(400, 'Invalid conversation id');
  }

  const currentUserId = unverifiedSubject(authorization);
  const [response, participants, chat] = await Promise.all([
    messageClient.getChat(chatId, authOptions(authorization)),
    fetchConversationParticipants(chatId, currentUserId, authorization, true),
    fetchChatSummary(chatId, authorization),
  ]);
  const apiMessages = response.data.messages as MessageView[];
  const messages = apiMessages.map((message) => (
    mapMessageToDto(conversationId, message, currentUserId, participants.members)
  ));

  return {
    conversation: mapChatToConversation(
      chat ?? { id: chatId, name: `Conversation ${chatId}` },
      apiMessages,
      participants,
      currentUserId,
    ),
    messages: typeof limit === 'number' ? messages.slice(-limit) : messages,
  };
}

export async function sendMessageToConversation(
  conversationId: string | number,
  content: string,
  authorization: string,
): Promise<{ conversation: BffConversation; message: BffMessage }> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new HttpError(400, 'Invalid conversation id');
  }

  const currentUserId = unverifiedSubject(authorization);
  if (currentUserId === undefined) {
    throw new HttpError(401, 'User id missing from the token');
  }

  const [response, participants, chat] = await Promise.all([
    messageClient.postMessage(chatId, { content }, authOptions(authorization)),
    fetchConversationParticipants(chatId, currentUserId, authorization, true),
    fetchChatSummary(chatId, authorization),
  ]);
  const now = new Date().toISOString();
  const message = mapMessageToDto(conversationId, {
    id: response.data.id,
    content,
    created_at: now,
    sender_id: currentUserId,
  }, currentUserId, participants.members);

  return {
    conversation: mapChatToConversation(
      chat ?? { id: chatId, name: `Conversation ${chatId}` },
      [],
      participants,
      currentUserId,
    ),
    message,
  };
}

export async function createDirectMessage(
  recipientId: string | number,
  message: string,
  authorization: string,
): Promise<{ conversation: BffConversation; message: BffMessage }> {
  const recipientNumericId = parseNumericId(recipientId);
  if (recipientNumericId === null) {
    throw new HttpError(400, 'Invalid recipient id');
  }

  const currentUserId = unverifiedSubject(authorization);
  if (currentUserId === undefined) {
    throw new HttpError(401, 'User id missing from the token');
  }
  if (recipientNumericId === currentUserId) {
    throw new HttpError(400, 'A direct message cannot be sent to oneself');
  }

  // Reuse the direct conversation the caller already has with this contact: a new chat per message
  // would split the history over duplicated conversations.
  const existingChatId = await findDirectChat(recipientNumericId, currentUserId, authorization);
  const chatId = existingChatId ?? (await messageClient.createChat({
    name: directMessageName(recipientNumericId),
    members: [recipientNumericId],
  }, authOptions(authorization))).data.id;

  return sendMessageToConversation(chatId, message, authorization);
}

/**
 * Id of the caller's direct chat with `contactId`, if any. Message API does not expose a chat kind, so
 * the candidates are the caller's chats named `Direct <id>` after either side (the contact may have
 * started it), and a candidate is kept only when its members are exactly the caller and the contact.
 * Only those candidates are inspected, so the lookup costs one listing plus one call per candidate.
 */
async function findDirectChat(
  contactId: number,
  currentUserId: number,
  authorization: string,
): Promise<number | undefined> {
  const response = await messageClient.getChats(authOptions(authorization));
  const candidateNames = new Set([directMessageName(contactId), directMessageName(currentUserId)]);
  const candidates = response.data.chats.filter((chat) => candidateNames.has(chat.name));

  for (const chat of candidates) {
    const members = await messageClient.getChatUsers(chat.id, authOptions(authorization));
    const memberIds = members.data.users.map((user) => user.id);
    if (directContactId(chat.name, memberIds, currentUserId) === contactId) return chat.id;
  }

  return undefined;
}

export async function createGroupConversation(
  name: string,
  memberIds: Array<string | number>,
  authorization: string,
): Promise<BffConversation> {
  const members = memberIds.map(parseNumericId).filter((id): id is number => id !== null);
  const response = await messageClient.createChat({ name, members }, authOptions(authorization));

  return mapChatToConversation({ id: response.data.id, name });
}

export async function deleteConversation(conversationId: string | number, authorization: string): Promise<void> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new HttpError(400, 'Invalid conversation id');
  }

  await messageClient.deleteChat(chatId, authOptions(authorization));
}

export async function markConversationAsRead(conversationId: string | number): Promise<{ conversationId: string | number; unreadCount: number }> {
  if (parseNumericId(conversationId) === null) {
    throw new HttpError(400, 'Invalid conversation id');
  }

  // Message_API has no explicit read operation yet. A fabricated zero would
  // incorrectly tell callers that the unread count was persisted.
  throw new HttpError(503, 'Read acknowledgement unavailable');
}

export async function fetchContacts(
  search: string | undefined,
  limit: number | undefined,
  authorization: string,
): Promise<BffContact[]> {
  const user = await fetchCurrentUser(authorization);
  const currentUserId = Number(String(user.id).replace(/^user-/, ''));
  const users = await listContacts(
    search,
    limit,
    Number.isInteger(currentUserId) ? currentUserId : undefined,
    authorization,
  );
  const contacts = users
    .map((user) => mapCoreUserToContact(user as CoreUser))
    .filter((contact): contact is BffContact => contact !== null);

  return contacts;
}

export async function fetchMessagingBootstrap(authorization: string): Promise<{
  currentUser: BffCurrentUser;
  conversations: BffConversation[];
  contacts: BffContact[];
  activeConversationId?: string | number;
  messages: BffMessage[];
}> {
  const [user, conversations, contacts] = await Promise.all([
    fetchCurrentUser(authorization),
    fetchConversations(undefined, 20, authorization),
    fetchContacts(undefined, undefined, authorization),
  ]);
  const activeConversationId = conversations[0]?.id;
  const activeConversation = activeConversationId
    ? await fetchConversationMessages(activeConversationId, 30, authorization)
    : undefined;

  return {
    currentUser: user,
    conversations,
    contacts,
    activeConversationId,
    messages: activeConversation?.messages ?? [],
  };
}

export async function getCurrentUser(authorization: string): Promise<{ currentUser: BffCurrentUser }> {
  return { currentUser: await fetchCurrentUser(authorization) };
}
