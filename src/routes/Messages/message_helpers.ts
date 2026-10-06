import { asCaller, authorization, callUpstream, HttpError, unverifiedSubject } from '@mairie360/bffs-lib';
import type { z } from 'zod';
import type { CallContext } from '../../clients/context';
import messageClient from '../../clients/messageClient';
import { getContactUser, listContacts, listContactsByIds } from '../../clients/coreClient';
import type {
  ChatView,
  GetChatParams,
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

const MESSAGE_API_TIMEOUT_MS = 5_000;

/** Largest page a Message API listing serves (`limit` 1 to 100, default 50). */
const MESSAGE_API_PAGE_SIZE = 100;

/**
 * Most pages read from one paginated Message API listing (chats, members, messages), so that a single
 * BFF request cannot fan out without bound: 20 pages of 100 items.
 */
const MAX_MESSAGE_API_PAGES = 20;
/** Conversations the bootstrap tries to open when the first ones are deleted while it runs. */
const MAX_BOOTSTRAP_ATTEMPTS = 3;

/**
 * Options of a Message API call made on behalf of the caller: MESSAGE_API_URL (+ MESSAGE_API_PORT) read
 * now (503 when missing, no localhost default) and the caller's own `Bearer` header, never a default token.
 */
function messageApi(context: CallContext) {
  return asCaller('MESSAGE_API', context.req, MESSAGE_API_TIMEOUT_MS);
}

/** Caller id: the JWT `sub` read without verifying the signature (see `fetchCurrentUser`). */
function callerId(context: CallContext): number | undefined {
  return unverifiedSubject(authorization(context.req));
}

/** Every chat of the caller (newest first), read page by page from Message API. */
async function listChats(context: CallContext, declared?: CallContext['declared']): Promise<ChatView[]> {
  const chats: ChatView[] = [];

  for (let page = 0; page < MAX_MESSAGE_API_PAGES; page += 1) {
    const params = { limit: MESSAGE_API_PAGE_SIZE, offset: page * MESSAGE_API_PAGE_SIZE };
    const response = await callUpstream(
      'MESSAGE_API',
      () => messageClient.getChats(params, messageApi(context)),
      { declared, retry: true },
    );
    chats.push(...response.data.chats);
    if (!response.data.has_more) break;
  }

  return chats;
}

/** Ids of every member of the chat, read page by page from Message API. */
async function listChatMemberIds(
  chatId: number,
  context: CallContext,
  declared?: CallContext['declared'],
): Promise<number[]> {
  const memberIds: number[] = [];

  for (let page = 0; page < MAX_MESSAGE_API_PAGES; page += 1) {
    const params = { limit: MESSAGE_API_PAGE_SIZE, offset: page * MESSAGE_API_PAGE_SIZE };
    const response = await callUpstream(
      'MESSAGE_API',
      () => messageClient.getChatUsers(chatId, params, messageApi(context)),
      { declared, retry: true },
    );
    memberIds.push(...response.data.users.map((user) => user.id));
    if (!response.data.has_more) break;
  }

  return [...new Set(memberIds)];
}

/**
 * Messages of the chat, oldest first: the `limit` latest ones in a single call, or every message
 * (read backwards page by page with the `before` cursor) when no limit is given.
 */
async function listChatMessages(
  chatId: number,
  limit: number | undefined,
  context: CallContext,
): Promise<MessageView[]> {
  const call = (params: GetChatParams) => callUpstream(
    'MESSAGE_API',
    () => messageClient.getChat(chatId, params, messageApi(context)),
    { declared: context.declared, retry: true },
  );

  if (typeof limit === 'number') {
    return (await call({ limit: Math.min(limit, MESSAGE_API_PAGE_SIZE) })).data.messages;
  }

  let messages: MessageView[] = [];
  let before: number | undefined;
  for (let page = 0; page < MAX_MESSAGE_API_PAGES; page += 1) {
    const response = await call({ limit: MESSAGE_API_PAGE_SIZE, ...(before === undefined ? {} : { before }) });
    // Each page is oldest first and older than the previous one.
    messages = [...response.data.messages, ...messages];
    if (!response.data.has_more || response.data.next_before == null) break;
    before = response.data.next_before;
  }

  return messages;
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

/**
 * The caller's profile. Its id is the JWT `sub` read **without verifying the signature**
 * (`unverifiedSubject`): it only shapes requests sent upstream with the same token, which the upstream
 * verifies, and the message direction; it never grants access by itself.
 */
export async function fetchCurrentUser(context: CallContext): Promise<BffCurrentUser> {
  const id = callerId(context);
  if (!id) {
    throw new HttpError(401, 'User id missing from the token');
  }

  const user = await getContactUser(id, context);

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
  context: CallContext,
  includeCaller = false,
): Promise<ConversationParticipants> {
  try {
    const memberIds = await listChatMemberIds(chatId, context);
    const participants = await listContactsByIds(
      includeCaller ? memberIds : memberIds.filter((userId) => userId !== currentUserId),
      context,
    );
    const members = participants.flatMap((participant) => {
      const contact = mapCoreUserToContact(participant);
      return contact ? [contact] : [];
    });
    const callerPublicId = currentUserId === undefined ? undefined : publicUserId(currentUserId);

    return {
      memberIds,
      others: members.filter((member) => member.id !== callerPublicId),
      members,
    };
  } catch {
    return noParticipants;
  }
}

async function fetchChatSummary(
  chatId: number,
  context: CallContext,
): Promise<ChatView | undefined> {
  try {
    return (await listChats(context)).find((chat) => chat.id === chatId);
  } catch {
    return undefined;
  }
}

/**
 * `authorName` is the author's directory name when the author is a member found in Core API, and is
 * left out otherwise (former member, directory unavailable): no placeholder name is made up.
 * `authorId` is left out too once the author's account is deleted (Message API `sender_id: null`).
 */
function mapMessageToDto(
  conversationId: string | number,
  message: MessageView,
  currentUserId?: number,
  members: BffContact[] = [],
): BffMessage {
  const authorId = message.sender_id == null ? undefined : publicUserId(message.sender_id);
  const currentAuthorId = currentUserId === undefined
    ? undefined
    : publicUserId(currentUserId);
  const authorName = authorId === undefined
    ? undefined
    : members.find((member) => member.id === authorId)?.name;

  return {
    id: publicMessageId(message.id),
    conversationId,
    content: message.content,
    sentAt: message.created_at,
    ...(authorId ? { authorId } : {}),
    ...(authorName ? { authorName } : {}),
    direction: authorId !== undefined && currentAuthorId === authorId ? 'outgoing' : 'incoming',
    attachments: [],
    mentions: [],
  };
}

export async function fetchConversations(
  search: string | undefined,
  limit: number | undefined,
  context: CallContext,
): Promise<BffConversation[]> {
  const chats = await listChats(context, context.declared);
  const filteredChats = search
    ? chats.filter((chat) => chat.name.toLowerCase().includes(search.toLowerCase()))
    : chats;
  const visibleChats = typeof limit === 'number' ? filteredChats.slice(0, limit) : filteredChats;
  const currentUserId = callerId(context);

  return Promise.all(
    visibleChats.map(async (chat) => {
      const participants = await fetchConversationParticipants(
        chat.id,
        currentUserId,
        context,
      );

      return mapChatToConversation(chat, [], participants, currentUserId);
    }),
  );
}

export async function fetchConversationMessages(
  conversationId: string | number,
  limit: number | undefined,
  context: CallContext,
): Promise<{ conversation: BffConversation; messages: BffMessage[] }> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new HttpError(400, 'Invalid conversation id');
  }

  const currentUserId = callerId(context);
  const [apiMessages, participants, chat] = await Promise.all([
    listChatMessages(chatId, limit, context),
    fetchConversationParticipants(chatId, currentUserId, context, true),
    fetchChatSummary(chatId, context),
  ]);
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
    messages,
  };
}

export async function sendMessageToConversation(
  conversationId: string | number,
  content: string,
  context: CallContext,
): Promise<{ conversation: BffConversation; message: BffMessage }> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new HttpError(400, 'Invalid conversation id');
  }

  const currentUserId = callerId(context);
  if (currentUserId === undefined) {
    throw new HttpError(401, 'User id missing from the token');
  }

  const [response, participants, chat] = await Promise.all([
    callUpstream('MESSAGE_API', () => messageClient.postMessage(chatId, { content }, messageApi(context)), { declared: context.declared }),
    fetchConversationParticipants(chatId, currentUserId, context, true),
    fetchChatSummary(chatId, context),
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
  context: CallContext,
): Promise<{ conversation: BffConversation; message: BffMessage }> {
  const recipientNumericId = parseNumericId(recipientId);
  if (recipientNumericId === null) {
    throw new HttpError(400, 'Invalid recipient id');
  }

  const currentUserId = callerId(context);
  if (currentUserId === undefined) {
    throw new HttpError(401, 'User id missing from the token');
  }
  if (recipientNumericId === currentUserId) {
    throw new HttpError(400, 'A direct message cannot be sent to oneself');
  }

  // Reuse the direct conversation the caller already has with this contact: a new chat per message
  // would split the history over duplicated conversations.
  const existingChatId = await findDirectChat(recipientNumericId, currentUserId, context);
  const chatId = existingChatId ?? (await callUpstream('MESSAGE_API', () => messageClient.createChat({
    name: directMessageName(recipientNumericId),
    members: [recipientNumericId],
  }, messageApi(context)), { declared: context.declared })).data.id;

  return sendMessageToConversation(chatId, message, context);
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
  context: CallContext,
): Promise<number | undefined> {
  const chats = await listChats(context, context.declared);
  const candidateNames = new Set([directMessageName(contactId), directMessageName(currentUserId)]);
  const candidates = chats.filter((chat) => candidateNames.has(chat.name));

  for (const chat of candidates) {
    let memberIds: number[];
    try {
      memberIds = await listChatMemberIds(chat.id, context, [...context.declared, 404]);
    } catch (error) {
      // A 404 means the chat was deleted since it was listed: it is no longer a candidate.
      if (error instanceof HttpError && error.status === 404) continue;
      throw error;
    }
    if (directContactId(chat.name, memberIds, currentUserId) === contactId) return chat.id;
  }

  return undefined;
}

export async function createGroupConversation(
  name: string,
  memberIds: Array<string | number>,
  context: CallContext,
): Promise<BffConversation> {
  const members = memberIds.map(parseNumericId).filter((id): id is number => id !== null);
  const response = await callUpstream('MESSAGE_API', () => messageClient.createChat({ name, members }, messageApi(context)), { declared: context.declared });

  return mapChatToConversation({ id: response.data.id, name });
}

export async function deleteConversation(conversationId: string | number, context: CallContext): Promise<void> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new HttpError(400, 'Invalid conversation id');
  }

  const userId = callerId(context);
  if (userId === undefined) {
    throw new HttpError(401, 'Invalid session.');
  }

  // "Delete" removes the conversation from the caller's list: the caller leaves it, and Message API deletes the
  // chat with its last member. Message API >= MAIR-394 keeps DELETE of a whole chat for administrators.
  await callUpstream('MESSAGE_API', () => messageClient.removeUserFromChat(chatId, userId, messageApi(context)), {
    declared: context.declared,
  });
}

/**
 * Acknowledges the messages of the conversation as read up to `readUntilMessageId` (Message API
 * `acknowledgeRead`). Without an id, everything is acknowledged up to the latest message (one call with
 * `limit=1`); an empty conversation has nothing to acknowledge and nothing unread.
 */
export async function markConversationAsRead(
  conversationId: string | number,
  readUntilMessageId: string | number | undefined,
  context: CallContext,
): Promise<{ conversationId: string | number; unreadCount: number }> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new HttpError(400, 'Invalid conversation id');
  }

  const requestedId = readUntilMessageId === undefined ? undefined : parseNumericId(readUntilMessageId);
  if (requestedId === null) {
    throw new HttpError(400, 'Invalid message id');
  }

  let untilId: number | undefined = requestedId;
  if (untilId === undefined) {
    const latest = await callUpstream(
      'MESSAGE_API',
      () => messageClient.getChat(chatId, { limit: 1 }, messageApi(context)),
      { declared: context.declared, retry: true },
    );
    const { messages } = latest.data;
    untilId = messages[messages.length - 1]?.id;
    if (untilId === undefined) {
      return { conversationId, unreadCount: 0 };
    }
  }

  const readUntil = untilId;
  const response = await callUpstream(
    'MESSAGE_API',
    () => messageClient.acknowledgeRead(chatId, { readUntilMessageId: readUntil }, messageApi(context)),
    { declared: context.declared },
  );

  return { conversationId, unreadCount: response.data.unread_count };
}

export async function fetchContacts(
  search: string | undefined,
  limit: number | undefined,
  context: CallContext,
): Promise<BffContact[]> {
  const user = await fetchCurrentUser(context);
  const currentUserId = Number(String(user.id).replace(/^user-/, ''));
  const users = await listContacts(
    search,
    limit,
    Number.isInteger(currentUserId) ? currentUserId : undefined,
    context,
  );
  const contacts = users
    .map((user) => mapCoreUserToContact(user as CoreUser))
    .filter((contact): contact is BffContact => contact !== null);

  return contacts;
}

export async function fetchMessagingBootstrap(context: CallContext): Promise<{
  currentUser: BffCurrentUser;
  conversations: BffConversation[];
  contacts: BffContact[];
  activeConversationId?: string | number;
  messages: BffMessage[];
}> {
  const [user, listedConversations, contacts] = await Promise.all([
    fetchCurrentUser(context),
    fetchConversations(undefined, 20, context),
    fetchContacts(undefined, undefined, context),
  ]);
  // A conversation can be deleted between the list and the read of its messages: Message API then
  // answers 404. Drop it and open the next one instead of failing the whole bootstrap.
  const conversations = [...listedConversations];
  const messagesContext: CallContext = { ...context, declared: [...context.declared, 404] };
  let activeConversation: Awaited<ReturnType<typeof fetchConversationMessages>> | undefined;
  for (let attempt = 0; attempt < MAX_BOOTSTRAP_ATTEMPTS && conversations.length > 0; attempt += 1) {
    try {
      activeConversation = await fetchConversationMessages(conversations[0].id, 30, messagesContext);
      break;
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 404) throw error;
      conversations.shift();
    }
  }
  const activeConversationId = activeConversation ? conversations[0]?.id : undefined;

  return {
    currentUser: user,
    conversations,
    contacts,
    activeConversationId,
    messages: activeConversation?.messages ?? [],
  };
}

export async function getCurrentUser(context: CallContext): Promise<{ currentUser: BffCurrentUser }> {
  return { currentUser: await fetchCurrentUser(context) };
}
