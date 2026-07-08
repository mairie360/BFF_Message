import axios, { AxiosError } from 'axios';
import type { Response } from 'express';
import { z } from 'zod';
import messageClient from '../../clients/messageClient';
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

type ApiChat = {
  id: number;
  name: string;
};

type ApiMessage = {
  id: number;
  content: string;
  created_at: string;
  sender_id: number;
  sitation?: number | null;
};

type ApiUser = {
  id: string;
  name: string;
};

type ApiChatsResult = {
  chats: ApiChat[];
};

type ApiChatResult = {
  messages: ApiMessage[];
};

type ApiUsersResult = {
  users: ApiUser[];
};

type ApiCreateChatResult = {
  id: number;
  name: string;
};

type ApiPostMessageResult = {
  id: number;
  content: string;
  sitation?: number | null;
};

let currentUser: BffCurrentUser = {
  id: '0',
  name: 'Utilisateur courant',
  email: 'user@mairie360.fr',
  role: 'Agent',
  service: 'Messagerie',
  position: 'Agent municipal',
  lastConnection: new Date().toISOString(),
};

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

function mapChatToConversation(chat: ApiChat, messages: ApiMessage[] = []): BffConversation {
  const lastMessage = messages[messages.length - 1];

  return {
    id: publicChatId(chat.id),
    name: chat.name,
    kind: 'group',
    initials: initials(chat.name),
    lastMessage: lastMessage?.content,
    lastMessageAt: lastMessage?.created_at,
    unreadCount: 0,
  };
}

function mapUserToContact(user: ApiUser): BffContact {
  return {
    id: publicUserId(user.id),
    name: user.name,
    initials: initials(user.name),
    presence: 'offline',
  };
}

function mapMessageToDto(conversationId: string | number, message: ApiMessage): BffMessage {
  const authorId = publicUserId(message.sender_id);

  return {
    id: publicMessageId(message.id),
    conversationId,
    content: message.content,
    sentAt: message.created_at,
    authorId,
    authorName: `Utilisateur ${message.sender_id}`,
    direction: String(message.sender_id) === currentUser.id ? 'outgoing' : 'incoming',
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

export async function fetchConversations(search?: string, limit?: number): Promise<BffConversation[]> {
  const response = await messageClient.get<ApiChatsResult>('/v1/');
  const conversations = response.data.chats.map((chat) => mapChatToConversation(chat));
  const filtered = search
    ? conversations.filter((conversation) => conversation.name.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
}

export async function fetchConversationMessages(
  conversationId: string | number,
  limit?: number,
): Promise<{ conversation: BffConversation; messages: BffMessage[] }> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new Error('Invalid conversation id');
  }

  const response = await messageClient.get<ApiChatResult>(`/v1/${chatId}/`);
  const messages = response.data.messages.map((message) => mapMessageToDto(conversationId, message));

  return {
    conversation: mapChatToConversation({ id: chatId, name: `Conversation ${chatId}` }, response.data.messages),
    messages: typeof limit === 'number' ? messages.slice(-limit) : messages,
  };
}

export async function sendMessageToConversation(
  conversationId: string | number,
  content: string,
): Promise<{ conversation: BffConversation; message: BffMessage }> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new Error('Invalid conversation id');
  }

  const response = await messageClient.post<ApiPostMessageResult>(`/v1/${chatId}/messages/`, { content });
  const now = new Date().toISOString();
  const message = mapMessageToDto(conversationId, {
    id: response.data.id,
    content: response.data.content,
    created_at: now,
    sender_id: Number(currentUser.id),
    sitation: response.data.sitation,
  });

  return {
    conversation: mapChatToConversation({ id: chatId, name: `Conversation ${chatId}` }, []),
    message,
  };
}

export async function createDirectMessage(
  recipientId: string | number,
  message: string,
): Promise<{ conversation: BffConversation; message: BffMessage }> {
  const recipientNumericId = parseNumericId(recipientId);
  if (recipientNumericId === null) {
    throw new Error('Invalid recipient id');
  }

  const chat = await messageClient.post<ApiCreateChatResult>('/v1/', {
    name: `Direct ${recipientNumericId}`,
    members: [recipientNumericId],
  });

  return sendMessageToConversation(chat.data.id, message);
}

export async function createGroupConversation(
  name: string,
  memberIds: Array<string | number>,
): Promise<BffConversation> {
  const members = memberIds.map(parseNumericId).filter((id): id is number => id !== null);
  const response = await messageClient.post<ApiCreateChatResult>('/v1/', { name, members });

  return mapChatToConversation(response.data);
}

export async function deleteConversation(conversationId: string | number): Promise<void> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new Error('Invalid conversation id');
  }

  await messageClient.delete(`/v1/${chatId}/`);
}

export async function markConversationAsRead(conversationId: string | number): Promise<{ conversationId: string | number; unreadCount: number }> {
  return {
    conversationId,
    unreadCount: 0,
  };
}

export async function fetchContacts(search?: string, limit?: number): Promise<BffContact[]> {
  const conversations = await fetchConversations();
  const contactsById = new Map<string | number, BffContact>();

  await Promise.all(
    conversations.map(async (conversation) => {
      const chatId = parseNumericId(conversation.id);
      if (chatId === null) {
        return;
      }

      const response = await messageClient.get<ApiUsersResult>(`/v1/${chatId}/users/`);
      for (const user of response.data.users) {
        const contact = mapUserToContact(user);
        contactsById.set(contact.id, contact);
      }
    }),
  );

  const contacts = [...contactsById.values()];
  const filtered = search
    ? contacts.filter((contact) => contact.name.toLowerCase().includes(search.toLowerCase()))
    : contacts;

  return typeof limit === 'number' ? filtered.slice(0, limit) : filtered;
}

export async function fetchMessagingBootstrap(): Promise<{
  currentUser: BffCurrentUser;
  conversations: BffConversation[];
  activeConversationId?: string | number;
  messages: BffMessage[];
}> {
  const conversations = await fetchConversations(undefined, 20);
  const activeConversationId = conversations[0]?.id;
  const activeConversation = activeConversationId
    ? await fetchConversationMessages(activeConversationId, 30)
    : undefined;

  return {
    currentUser,
    conversations,
    activeConversationId,
    messages: activeConversation?.messages ?? [],
  };
}

export function getCurrentUser(): { currentUser: BffCurrentUser } {
  return { currentUser };
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
