import axios, { AxiosError } from 'axios';
import type { AxiosRequestConfig } from 'axios';
import type { Response } from 'express';
import { z } from 'zod';
import messageClient from '../../clients/messageClient';
import { getAuthorizationHeader } from '../../config/token';
import { getContactUser, listContacts } from '../../repositories/contactsRepository';
import type {
  ChatView,
  MessageView,
} from '@mairie360/message-api-openapi/model';
import {
  AttachmentDtoSchema,
  ContactDtoSchema,
  ConversationDtoSchema,
  CurrentUserDtoSchema,
  MessageDtoSchema,
} from '../../openapi-registry';

export type BffAttachment = z.infer<typeof AttachmentDtoSchema>;
export type BffContact = z.infer<typeof ContactDtoSchema>;
export type BffConversation = z.infer<typeof ConversationDtoSchema>;
export type BffCurrentUser = z.infer<typeof CurrentUserDtoSchema>;
export type BffMessage = z.infer<typeof MessageDtoSchema>;

const fallbackCurrentUser: BffCurrentUser = {
  id: 'user-0',
  name: 'Utilisateur courant',
  email: 'user@mairie360.fr',
  role: 'Agent',
  service: 'Messagerie',
  position: 'Agent municipal',
  lastConnection: new Date().toISOString(),
};

let currentUser: BffCurrentUser = fallbackCurrentUser;

function authOptions(incomingRequestToken?: string): AxiosRequestConfig {
  const authHeader = getAuthorizationHeader(incomingRequestToken);

  if (!authHeader) {
    return {};
  }

  return {
    headers: {
      Authorization: authHeader,
    },
  };
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

function numericUserIdFromToken(incomingRequestToken?: string): number | undefined {
  const token = getAuthorizationHeader(incomingRequestToken)?.replace(/^Bearer\s+/i, '');

  if (!token) return undefined;

  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
      sub?: string | number;
    };
    const id = Number(payload.sub);
    return Number.isInteger(id) && id > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

export async function fetchCurrentUser(incomingRequestToken?: string): Promise<BffCurrentUser> {
  const id = numericUserIdFromToken(incomingRequestToken);
  if (!id) {
    throw new Error('Identifiant utilisateur absent du token');
  }

  const user = await getContactUser(id);

  if (!user) {
    throw new Error('Utilisateur connecté introuvable');
  }

  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();

  currentUser = {
    ...fallbackCurrentUser,
    id: publicUserId(id),
    name,
    email: user.email ?? undefined,
    lastConnection: new Date().toISOString(),
  };

  return currentUser;
}

function mapChatToConversation(
  chat: ChatView | { id: number; name: string; unread_count?: number },
  messages: MessageView[] = [],
  participantNames: string[] = [],
): BffConversation {
  const lastMessage = messages[messages.length - 1];

  return {
    id: publicChatId(chat.id),
    name: chat.name,
    department: participantNames.length > 0
      ? `Avec ${participantNames.join(', ')}`
      : undefined,
    kind: 'group',
    initials: initials(chat.name),
    lastMessage: lastMessage?.content,
    lastMessageAt: lastMessage?.created_at,
    unreadCount: chat.unread_count ?? 0,
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
    email: user.email ?? undefined,
  };
}

async function fetchConversationParticipantNames(
  chatId: number,
  currentUserId: number | undefined,
  incomingRequestToken?: string,
): Promise<string[]> {
  try {
    const response = await messageClient.getChatUsers(chatId, authOptions(incomingRequestToken));
    const participantIds = [...new Set(
      response.data.users
        .map((user) => user.id)
        .filter((userId) => userId !== currentUserId),
    )];
    const participants = await Promise.all(
      participantIds.map((participantId) => getContactUser(participantId)),
    );

    return participants.flatMap((participant) => {
      if (!participant) return [];

      const contact = mapCoreUserToContact(participant);
      return contact ? [contact.name] : [];
    });
  } catch {
    return [];
  }
}

async function fetchChatSummary(
  chatId: number,
  incomingRequestToken?: string,
): Promise<ChatView | undefined> {
  try {
    const response = await messageClient.getChats(authOptions(incomingRequestToken));
    return response.data.chats.find((chat) => chat.id === chatId);
  } catch {
    return undefined;
  }
}

function mapMessageToDto(
  conversationId: string | number,
  message: MessageView,
  currentUserId?: number,
): BffMessage {
  const authorId = publicUserId(message.sender_id);
  const currentAuthorId = currentUserId === undefined
    ? undefined
    : publicUserId(currentUserId);

  return {
    id: publicMessageId(message.id),
    conversationId,
    content: message.content,
    sentAt: message.created_at,
    authorId,
    authorName: `Utilisateur ${message.sender_id}`,
    direction: currentAuthorId === authorId ? 'outgoing' : 'incoming',
    attachments: [],
    mentions: [],
  };
}

export function sendValidationError(res: Response, details: unknown): Response {
  return res.status(400).json({
    code: 'BAD_REQUEST',
    message: 'Validation failed',
    details,
  });
}

export function handleUnknownError(res: Response, error: unknown): Response {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status ?? 502;
    return res.status(status >= 500 ? 502 : status).json({
      code: status >= 500 ? 'BAD_GATEWAY' : 'UPSTREAM_ERROR',
      message: axiosError.message,
      details: axiosError.response?.data,
    });
  }

  return res.status(500).json({
    code: 'INTERNAL_SERVER_ERROR',
    message: error instanceof Error ? error.message : 'Unexpected error',
  });
}

function isAxiosStatus(error: unknown, statuses: number[]): boolean {
  return axios.isAxiosError(error) && statuses.includes(error.response?.status ?? 0);
}

export async function fetchConversations(
  search?: string,
  limit?: number,
  incomingRequestToken?: string,
): Promise<BffConversation[]> {
  const response = await messageClient.getChats(authOptions(incomingRequestToken));
  const chats = response.data.chats as ChatView[];
  const filteredChats = search
    ? chats.filter((chat) => chat.name.toLowerCase().includes(search.toLowerCase()))
    : chats;
  const visibleChats = typeof limit === 'number' ? filteredChats.slice(0, limit) : filteredChats;
  const currentUserId = numericUserIdFromToken(incomingRequestToken);

  return Promise.all(
    visibleChats.map(async (chat) => {
      const participantNames = await fetchConversationParticipantNames(
        chat.id,
        currentUserId,
        incomingRequestToken,
      );

      return mapChatToConversation(chat, [], participantNames);
    }),
  );
}

export async function fetchConversationMessages(
  conversationId: string | number,
  limit?: number,
  incomingRequestToken?: string,
): Promise<{ conversation: BffConversation; messages: BffMessage[] }> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new Error('Invalid conversation id');
  }

  const currentUserId = numericUserIdFromToken(incomingRequestToken);
  const [response, participantNames, chat] = await Promise.all([
    messageClient.getChat(chatId, authOptions(incomingRequestToken)),
    fetchConversationParticipantNames(chatId, currentUserId, incomingRequestToken),
    fetchChatSummary(chatId, incomingRequestToken),
  ]);
  const apiMessages = response.data.messages as MessageView[];
  const messages = apiMessages.map((message) => (
    mapMessageToDto(conversationId, message, currentUserId)
  ));

  return {
    conversation: mapChatToConversation(
      chat ?? { id: chatId, name: `Conversation ${chatId}` },
      apiMessages,
      participantNames,
    ),
    messages: typeof limit === 'number' ? messages.slice(-limit) : messages,
  };
}

export async function sendMessageToConversation(
  conversationId: string | number,
  content: string,
  incomingRequestToken?: string,
): Promise<{ conversation: BffConversation; message: BffMessage }> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new Error('Invalid conversation id');
  }

  const currentUserId = numericUserIdFromToken(incomingRequestToken);
  if (currentUserId === undefined) {
    throw new Error('Identifiant utilisateur absent du token');
  }

  const [response, participantNames, chat] = await Promise.all([
    messageClient.postMessage(chatId, { content }, authOptions(incomingRequestToken)),
    fetchConversationParticipantNames(chatId, currentUserId, incomingRequestToken),
    fetchChatSummary(chatId, incomingRequestToken),
  ]);
  const now = new Date().toISOString();
  const message = mapMessageToDto(conversationId, {
    id: response.data.id,
    content,
    created_at: now,
    sender_id: currentUserId,
  }, currentUserId);

  return {
    conversation: mapChatToConversation(
      chat ?? { id: chatId, name: `Conversation ${chatId}` },
      [],
      participantNames,
    ),
    message,
  };
}

export async function createDirectMessage(
  recipientId: string | number,
  message: string,
  incomingRequestToken?: string,
): Promise<{ conversation: BffConversation; message: BffMessage }> {
  const recipientNumericId = parseNumericId(recipientId);
  if (recipientNumericId === null) {
    throw new Error('Invalid recipient id');
  }

  const chat = await messageClient.createChat({
    name: `Direct ${recipientNumericId}`,
    members: [recipientNumericId],
  }, authOptions(incomingRequestToken));

  return sendMessageToConversation(chat.data.id, message, incomingRequestToken);
}

export async function createGroupConversation(
  name: string,
  memberIds: Array<string | number>,
  incomingRequestToken?: string,
): Promise<BffConversation> {
  const members = memberIds.map(parseNumericId).filter((id): id is number => id !== null);
  const response = await messageClient.createChat({ name, members }, authOptions(incomingRequestToken));

  return mapChatToConversation({ id: response.data.id, name });
}

export async function deleteConversation(conversationId: string | number, incomingRequestToken?: string): Promise<void> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new Error('Invalid conversation id');
  }

  await messageClient.deleteChat(chatId, authOptions(incomingRequestToken));
}

export async function markConversationAsRead(conversationId: string | number): Promise<{ conversationId: string | number; unreadCount: number }> {
  return {
    conversationId,
    unreadCount: 0,
  };
}

export async function fetchContacts(
  search?: string,
  limit?: number,
  incomingRequestToken?: string,
): Promise<BffContact[]> {
  const user = await fetchCurrentUser(incomingRequestToken);
  const currentUserId = Number(String(user.id).replace(/^user-/, ''));
  const users = await listContacts(
    search,
    limit,
    Number.isInteger(currentUserId) ? currentUserId : undefined,
  );
  const contacts = users
    .map((user) => mapCoreUserToContact(user as CoreUser))
    .filter((contact): contact is BffContact => contact !== null);

  return contacts;
}

export async function fetchMessagingBootstrap(incomingRequestToken?: string): Promise<{
  currentUser: BffCurrentUser;
  conversations: BffConversation[];
  contacts: BffContact[];
  activeConversationId?: string | number;
  messages: BffMessage[];
}> {
  const [user, conversations, contacts] = await Promise.all([
    fetchCurrentUser(incomingRequestToken),
    fetchConversations(undefined, 20, incomingRequestToken),
    fetchContacts(undefined, undefined, incomingRequestToken),
  ]);
  const activeConversationId = conversations[0]?.id;
  const activeConversation = activeConversationId
    ? await fetchConversationMessages(activeConversationId, 30, incomingRequestToken)
    : undefined;

  return {
    currentUser: user,
    conversations,
    contacts,
    activeConversationId,
    messages: activeConversation?.messages ?? [],
  };
}

export async function getCurrentUser(incomingRequestToken?: string): Promise<{ currentUser: BffCurrentUser }> {
  return { currentUser: await fetchCurrentUser(incomingRequestToken) };
}

export function updateCurrentUser(input: Partial<Pick<BffCurrentUser, 'email' | 'phone' | 'address' | 'city'>>): {
  currentUser: BffCurrentUser;
} {
  currentUser = {
    ...currentUser,
    ...input,
  };

  return { currentUser };
}

export function uploadAttachment(files?: unknown): { attachments: BffAttachment[] } {
  const fileList = Array.isArray(files) ? files : [files];
  const attachments = fileList.map((file, index) => {
    const name = typeof file === 'object' && file !== null && 'name' in file
      ? String((file as { name: unknown }).name)
      : `attachment-${index + 1}`;

    return {
      id: `attachment-${Date.now()}-${index}`,
      name,
    };
  });

  return {
    attachments,
  };
}
