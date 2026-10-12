import { asCaller, callUpstream, HttpError, sessionUserId, upstreamStatus } from '@mairie360/bffs-lib';
import type { z } from 'zod';
import type { CallContext } from '../../clients/context';
import messageClient from '../../clients/messageClient';
import { getContactUser, listContacts } from '../../clients/coreClient';
import type {
  ChatView,
  GetChatParams,
  GetChatResultView,
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

/** Conversations per page of `GET /conversations` when `limit` is absent (MAIR-507). */
export const DEFAULT_CONVERSATIONS_LIMIT = 20;
/** Messages per page of a conversation when `limit` is absent (MAIR-507). */
export const DEFAULT_MESSAGES_LIMIT = 30;

/**
 * Most pages read when listing the members of one chat, so that a single BFF request cannot fan out without
 * bound: 20 pages of 100 members.
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

/** Caller id: the `sub` of the token `requireSession` verified (MAIR-474); 401 when the route skipped it. */
function callerId(context: CallContext): number {
  return sessionUserId(context.req);
}

/** A member of a chat as Message API lists it: Core API id and names. */
type ChatUser = { id: number; first_name: string; last_name: string };

/** Every member of the chat with their names, read page by page from Message API (by increasing id). */
async function listChatUsers(
  chatId: number,
  context: CallContext,
  declared?: CallContext['declared'],
): Promise<ChatUser[]> {
  const users = new Map<number, ChatUser>();

  for (let page = 0; page < MAX_MESSAGE_API_PAGES; page += 1) {
    const params = { limit: MESSAGE_API_PAGE_SIZE, offset: page * MESSAGE_API_PAGE_SIZE };
    const response = await callUpstream(
      'MESSAGE_API',
      () => messageClient.getChatUsers(chatId, params, messageApi(context)),
      { declared, retry: true },
    );
    for (const user of response.data.users) users.set(user.id, user);
    if (!response.data.has_more) break;
  }

  return [...users.values()];
}

/**
 * One page of the messages of the chat, oldest first, with the chat itself (`chat`): the `limit` latest
 * messages, or the ones before the message `before`. One Message API call whatever the length of the history.
 */
async function getChatPage(
  chatId: number,
  params: GetChatParams,
  context: CallContext,
): Promise<GetChatResultView> {
  const response = await callUpstream(
    'MESSAGE_API',
    () => messageClient.getChat(chatId, params, messageApi(context)),
    { declared: context.declared, retry: true },
  );
  return response.data;
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
 * The caller's profile. Its id is the `sub` of the token the BFF verified (`requireSession`, MAIR-474); the
 * upstream APIs verify the token again and check revocation.
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

/** "8 membres": what a group conversation shows instead of the names of its members (not loaded by the list). */
function memberCountLabel(memberCount: number): string {
  return `${memberCount} ${memberCount > 1 ? 'membres' : 'membre'}`;
}

/**
 * A conversation as Message API lists it: `name` is ready to display (the title of a group, the other
 * participant's name for a direct conversation), so nothing else is read to build it.
 */
function mapChatToConversation(chat: ChatView, lastMessage?: Pick<MessageView, 'content' | 'created_at'>): BffConversation {
  const summary = {
    id: publicChatId(chat.id),
    lastMessage: lastMessage?.content,
    lastMessageAt: lastMessage?.created_at,
    unreadCount: chat.unread_count,
    memberCount: chat.member_count,
  };

  if (chat.kind === 'direct') {
    const name = chat.name || (chat.contact_id == null ? '' : `Utilisateur ${chat.contact_id}`);

    return {
      ...summary,
      name,
      kind: 'direct',
      ...(chat.contact_id == null ? {} : { contactId: publicUserId(chat.contact_id) }),
      initials: initials(name),
    };
  }

  return {
    ...summary,
    name: chat.name,
    department: chat.member_count > 0 ? memberCountLabel(chat.member_count) : undefined,
    kind: 'group',
    initials: initials(chat.name),
  };
}

/**
 * `authorName` is the author's name when the author is a current member of the chat, and is left out
 * otherwise (former member): no placeholder name is made up. `authorId` is left out too once the author's
 * account is deleted (Message API `sender_id: null`). A quoted message carries its author and an excerpt, also
 * when it is older than the page.
 */
function mapMessageToDto(
  conversationId: string | number,
  message: Pick<MessageView, 'id' | 'content' | 'created_at' | 'sender_id'> & Partial<Pick<MessageView, 'citation' | 'quoted'>>,
  currentUserId: number,
  members: BffContact[] = [],
): BffMessage {
  const nameOf = (id: string | undefined) => (id === undefined ? undefined : members.find((member) => member.id === id)?.name);
  const authorId = message.sender_id == null ? undefined : publicUserId(message.sender_id);
  const authorName = nameOf(authorId);
  const quotedAuthorId = message.quoted?.sender_id == null ? undefined : publicUserId(message.quoted.sender_id);
  const quotedAuthorName = nameOf(quotedAuthorId);

  return {
    id: publicMessageId(message.id),
    conversationId,
    content: message.content,
    sentAt: message.created_at,
    ...(authorId ? { authorId } : {}),
    ...(authorName ? { authorName } : {}),
    direction: authorId !== undefined && publicUserId(currentUserId) === authorId ? 'outgoing' : 'incoming',
    attachments: [],
    mentions: [],
    ...(message.citation == null ? {} : { citation: publicMessageId(message.citation) }),
    ...(message.quoted == null
      ? {}
      : {
        quoted: {
          id: publicMessageId(message.quoted.id),
          ...(quotedAuthorId ? { authorId: quotedAuthorId } : {}),
          ...(quotedAuthorName ? { authorName: quotedAuthorName } : {}),
          excerpt: message.quoted.excerpt,
        },
      }),
  };
}

/** Offset of a `cursor` of `GET /conversations` (the `nextCursor` of the previous page). */
function parseConversationsCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  if (!/^\d{1,9}$/.test(cursor)) throw new HttpError(400, 'Invalid cursor');
  return Number(cursor);
}

/**
 * One page of the caller's conversations, newest first: ONE Message API call, whatever the number of
 * conversations. `search` (name of the conversation or of one of its members) is applied by Message API,
 * before the pagination. `nextCursor` is absent on the last page.
 */
export async function fetchConversations(
  search: string | undefined,
  limit: number | undefined,
  cursor: string | undefined,
  context: CallContext,
): Promise<{ conversations: BffConversation[]; nextCursor?: string }> {
  const pageSize = Math.min(limit ?? DEFAULT_CONVERSATIONS_LIMIT, MESSAGE_API_PAGE_SIZE);
  const offset = parseConversationsCursor(cursor);
  const response = await callUpstream(
    'MESSAGE_API',
    () => messageClient.getChats(
      { limit: pageSize, offset, ...(search?.trim() ? { search: search.trim() } : {}) },
      messageApi(context),
    ),
    { declared: context.declared, retry: true },
  );

  return {
    conversations: response.data.chats.map((chat) => mapChatToConversation(chat)),
    ...(response.data.has_more ? { nextCursor: String(offset + pageSize) } : {}),
  };
}

export type LoadedConversation = {
  conversation: BffConversation;
  participants: BffContact[];
  messages: BffMessage[];
  hasMore: boolean;
  nextCursor?: string;
};

/**
 * Opens a conversation: the members (id and name) and one page of messages with the conversation itself, two
 * Message API calls made in parallel and no Core API call. `before` is the `nextCursor` of the previous page
 * (the numeric id of the oldest message loaded): older messages are read without ever loading the whole history.
 */
export async function loadConversation(
  conversationId: string | number,
  page: { limit?: number; before?: string | number },
  context: CallContext,
): Promise<LoadedConversation> {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) {
    throw new HttpError(400, 'Invalid conversation id');
  }
  const before = page.before === undefined ? undefined : parseNumericId(page.before);
  if (before === null) {
    throw new HttpError(400, 'Invalid cursor');
  }

  const currentUserId = callerId(context);
  const [result, users] = await Promise.all([
    getChatPage(chatId, {
      limit: Math.min(page.limit ?? DEFAULT_MESSAGES_LIMIT, MESSAGE_API_PAGE_SIZE),
      ...(before === undefined ? {} : { before }),
    }, context),
    listChatUsers(chatId, context, context.declared),
  ]);
  const participants = users.flatMap((user) => {
    const contact = mapCoreUserToContact(user);
    return contact ? [contact] : [];
  });
  const latest = result.messages[result.messages.length - 1];

  return {
    conversation: mapChatToConversation(result.chat, latest),
    participants,
    messages: result.messages.map((message) => mapMessageToDto(conversationId, message, currentUserId, participants)),
    hasMore: result.has_more,
    ...(result.has_more && result.next_before != null ? { nextCursor: String(result.next_before) } : {}),
  };
}

/** `GET /conversations/{id}/messages`: the same page as `loadConversation`, without the member list. */
export async function fetchConversationMessages(
  conversationId: string | number,
  page: { limit?: number; before?: string | number },
  context: CallContext,
): Promise<Omit<LoadedConversation, 'participants'>> {
  const { conversation, messages, hasMore, nextCursor } = await loadConversation(conversationId, page, context);
  return { conversation, messages, hasMore, ...(nextCursor === undefined ? {} : { nextCursor }) };
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
  // The post, the conversation (one message of its page carries it) and the members' names, in parallel.
  const [response, header, users] = await Promise.all([
    callUpstream('MESSAGE_API', () => messageClient.postMessage(chatId, { content }, messageApi(context)), { declared: context.declared }),
    getChatPage(chatId, { limit: 1 }, context),
    listChatUsers(chatId, context, context.declared),
  ]);
  const members = users.flatMap((user) => {
    const contact = mapCoreUserToContact(user);
    return contact ? [contact] : [];
  });
  const sent = { id: response.data.id, content, created_at: new Date().toISOString(), sender_id: currentUserId };

  return {
    conversation: mapChatToConversation(header.chat, sent),
    message: mapMessageToDto(conversationId, sent, currentUserId, members),
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
  if (recipientNumericId === currentUserId) {
    throw new HttpError(400, 'A direct message cannot be sent to oneself');
  }

  // Message API finds the caller's direct conversation with the recipient or creates it (one per pair), so a
  // message never splits the history over duplicated conversations.
  const opened = await callUpstream(
    'MESSAGE_API',
    () => messageClient.openDirectChat({ contact_id: recipientNumericId }, messageApi(context)),
    { declared: context.declared },
  );

  return sendMessageToConversation(opened.data.id, message, context);
}

export async function createGroupConversation(
  name: string,
  memberIds: Array<string | number>,
  context: CallContext,
): Promise<BffConversation> {
  const members = memberIds.map(parseNumericId).filter((id): id is number => id !== null);
  const response = await callUpstream('MESSAGE_API', () => messageClient.createChat({ name, members }, messageApi(context)), { declared: context.declared });

  // The creator is a member too.
  return mapChatToConversation({
    id: response.data.id,
    name,
    kind: 'group',
    contact_id: null,
    member_count: new Set([...members, callerId(context)]).size,
    unread_count: 0,
  });
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
  // Message API answers 400 when the caller is not a member: for the caller, the conversation does not exist.
  try {
    await callUpstream('MESSAGE_API', () => messageClient.removeUserFromChat(chatId, userId, messageApi(context)), {
      declared: context.declared,
    });
  } catch (error) {
    if (error instanceof HttpError && upstreamStatus(error.cause) === 400) {
      throw new HttpError(404, 'Conversation not found');
    }
    throw error;
  }
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
  const [user, listed, contacts] = await Promise.all([
    fetchCurrentUser(context),
    fetchConversations(undefined, DEFAULT_CONVERSATIONS_LIMIT, undefined, context),
    fetchContacts(undefined, undefined, context),
  ]);
  // A conversation can be deleted between the list and the read of its messages: Message API then
  // answers 404. Drop it and open the next one instead of failing the whole bootstrap.
  const conversations = [...listed.conversations];
  const messagesContext: CallContext = { ...context, declared: [...context.declared, 404] };
  let activeConversation: Awaited<ReturnType<typeof loadConversation>> | undefined;
  for (let attempt = 0; attempt < MAX_BOOTSTRAP_ATTEMPTS && conversations.length > 0; attempt += 1) {
    try {
      activeConversation = await loadConversation(conversations[0].id, { limit: DEFAULT_MESSAGES_LIMIT }, messagesContext);
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
