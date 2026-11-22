import { asCaller, callUpstream, hasRole, HttpError, sessionRole, sessionUserId, upstreamStatus } from '@mairie360/bffs-lib';
import type { z } from 'zod';
import type { CallContext } from '../../clients/context';
import messageClient from '../../clients/messageClient';
import { getContactUser, listContacts, listContactsByIds, readCallerRoles } from '../../clients/coreClient';
import type {
  ChatView,
  GetChatParams,
  GetChatResultView,
  MessageLinkView,
  MessageView,
  ReactionView,
  SearchMessageItem,
  SearchPersonItem,
} from '@mairie360/message-api-openapi/model';
import {
  ContactDtoSchema,
  ConversationDtoSchema,
  ConversationSearchResponse,
  CurrentUserDtoSchema,
  LinkKindSchema,
  MemberDtoSchema,
  MentionSuggestionsResponse,
  MessageDtoSchema,
  MessageLinkDtoSchema,
  ReactionDtoSchema,
  SEARCH_TYPES,
} from '../../openapi-registry';

export type BffContact = z.infer<typeof ContactDtoSchema>;
export type BffConversation = z.infer<typeof ConversationDtoSchema>;
export type BffCurrentUser = z.infer<typeof CurrentUserDtoSchema>;
export type BffMessage = z.infer<typeof MessageDtoSchema>;
export type BffMember = z.infer<typeof MemberDtoSchema>;
export type BffReaction = z.infer<typeof ReactionDtoSchema>;
export type BffMessageLink = z.infer<typeof MessageLinkDtoSchema>;
type LinkKind = z.infer<typeof LinkKindSchema>;

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

/** A member of a chat as Message API lists it: Core API id, names, and whether they administer the group (MAIR-1155). */
type ChatUser = { id: number; first_name: string; last_name: string; is_admin?: boolean };

/** Every member of the chat with their names, read page by page from Message API (by increasing id). */
async function listChatUsers(
  chatId: number,
  context: CallContext,
  declared?: CallContext['declared'],
): Promise<ChatUser[]> {
  const users = new Map<number, ChatUser>();

  for (let page = 0; page < MAX_MESSAGE_API_PAGES; page += 1) {
    const params = { limit: MESSAGE_API_PAGE_SIZE, offset: page * MESSAGE_API_PAGE_SIZE };
    // Sequential on purpose: Message API gives no total, only `has_more`, so the next page is only known after
    // this one (a chat has a few members: one page in practice).
    // eslint-disable-next-line no-await-in-loop
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

function publicGroupId(groupId: number): string {
  return `group-${groupId}`;
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
/** The fields of a chat a conversation is built from: a chat just created has no `last_activity_at` to read. */
type ChatSummary = Pick<ChatView, 'id' | 'name' | 'kind' | 'contact_id' | 'member_count' | 'unread_count'>;

function mapChatToConversation(chat: ChatSummary, lastMessage?: Pick<MessageView, 'content' | 'created_at'>): BffConversation {
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
 * Names a message refers to (MAIR-1154): agents by Core API id (the members of the conversation, completed with the
 * directory for the former members a page refers to) and groups by id (the groups of the members).
 */
export type NameBook = { users: Map<number, string>; groups: Map<number, string> };

const emptyNames = (): NameBook => ({ users: new Map(), groups: new Map() });

function fullName(user: { first_name?: string | null; last_name?: string | null }): string {
  return [user.first_name, user.last_name].filter((part): part is string => Boolean(part?.trim())).join(' ');
}

/** The names of the members of a chat, by Core API id. */
function memberNames(users: ChatUser[]): Map<number, string> {
  return new Map(users.flatMap((user) => {
    const name = fullName(user);
    return name ? [[user.id, name] as const] : [];
  }));
}

/** A message as the BFF maps it: what a history page gives, every MAIR-1155 field optional (a message just sent). */
type UpstreamMessage = Pick<MessageView, 'id' | 'content' | 'created_at' | 'sender_id'> & Partial<MessageView>;

/** Agents a message names without being its author: mentions, reactions, the actor and the targets of a system note. */
function referencedUserIds(message: UpstreamMessage): number[] {
  return [
    ...(message.mentions ?? []),
    ...(message.reactions ?? []).flatMap((reaction) => reaction.user_ids),
    ...(message.system_event ? [message.system_event.actor_id, ...message.system_event.user_ids] : []),
  ];
}

/** Base URL of a front (`PROJECT_FRONT_URL`, `CALENDAR_FRONT_URL`), read on every call; `undefined` when unset or not http(s). */
function frontUrl(variable: 'PROJECT_FRONT_URL' | 'CALENDAR_FRONT_URL'): string | undefined {
  const value = process.env[variable]?.trim();
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href.replace(/\/+$/, '') : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Page of a business object in its front: `<PROJECT_FRONT_URL>/projects/<id>`, `<PROJECT_FRONT_URL>/tasks/<id>`,
 * `<CALENDAR_FRONT_URL>/events/<id>`; `undefined` when that front is not configured.
 */
export function businessObjectUrl(kind: LinkKind, id: number): string | undefined {
  const base = frontUrl(kind === 'event' ? 'CALENDAR_FRONT_URL' : 'PROJECT_FRONT_URL');
  return base === undefined ? undefined : `${base}/${kind}s/${id}`;
}

function mapLink(link: MessageLinkView): BffMessageLink {
  const url = businessObjectUrl(link.kind, link.id);
  return { id: `${link.kind}-${link.id}`, kind: link.kind, ...(url ? { url } : {}) };
}

/** Reactions with the caller's own and the names of who reacted (the names the book knows). */
function mapReactions(reactions: ReactionView[], currentUserId: number, names: NameBook): BffReaction[] {
  return reactions.map((reaction) => ({
    emoji: reaction.emoji,
    count: reaction.count,
    reactedByMe: reaction.user_ids.includes(currentUserId),
    userNames: reaction.user_ids.flatMap((id) => names.users.get(id) ?? []),
  }));
}

/**
 * `authorName` is the author's name when the author is a current member of the chat, and is left out
 * otherwise (former member): no placeholder name is made up. `authorId` is left out too once the author's
 * account is deleted (Message API `sender_id: null`). A quoted message carries its author and an excerpt, also
 * when it is older than the page. Mentions, reactions and system notes name the agents the book knows (MAIR-1154).
 */
function mapMessageToDto(
  conversationId: string | number,
  message: UpstreamMessage,
  currentUserId: number,
  names: NameBook = emptyNames(),
): BffMessage {
  const authorName = message.sender_id == null ? undefined : names.users.get(message.sender_id);
  const authorId = message.sender_id == null ? undefined : publicUserId(message.sender_id);
  const quotedAuthorId = message.quoted?.sender_id == null ? undefined : publicUserId(message.quoted.sender_id);
  const quotedAuthorName = message.quoted?.sender_id == null ? undefined : names.users.get(message.quoted.sender_id);
  const event = message.system_event;
  const actorName = event ? names.users.get(event.actor_id) : undefined;

  return {
    id: publicMessageId(message.id),
    conversationId,
    content: message.content,
    sentAt: message.created_at,
    ...(authorId ? { authorId } : {}),
    ...(authorName ? { authorName } : {}),
    direction: authorId !== undefined && publicUserId(currentUserId) === authorId ? 'outgoing' : 'incoming',
    attachments: [],
    // A mention of an agent the directory does not know any more has no name to show: it is left out.
    mentions: (message.mentions ?? []).flatMap((id) => {
      const name = names.users.get(id);
      return name ? [{ id: publicUserId(id), name }] : [];
    }),
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
    kind: message.kind ?? 'user',
    ...(event
      ? {
        systemEvent: {
          action: event.action,
          actorId: publicUserId(event.actor_id),
          ...(actorName ? { actorName } : {}),
          userIds: event.user_ids.map(publicUserId),
          userNames: event.user_ids.flatMap((id) => names.users.get(id) ?? []),
        },
      }
      : {}),
    ...(message.edited_at ? { editedAt: message.edited_at } : {}),
    deleted: message.deleted ?? false,
    mentionsEveryone: message.mentions_everyone ?? false,
    groupMentions: (message.group_mentions ?? []).map((id) => {
      const name = names.groups.get(id);
      return { id: publicGroupId(id), ...(name ? { name } : {}) };
    }),
    links: (message.links ?? []).map(mapLink),
    reactions: mapReactions(message.reactions ?? [], currentUserId, names),
  };
}

/**
 * The names `messages` refer to: the members' (`users`), completed with ONE directory read for the other agents they
 * name (former members), and the groups of the members when a message mentions one (ONE Message API read). Both reads
 * only happen when needed, and a failure only leaves the names out: a page is never refused for a name.
 */
async function nameBook(chatId: number, users: ChatUser[], messages: UpstreamMessage[], context: CallContext): Promise<NameBook> {
  const known = memberNames(users);
  const missing = [...new Set(messages.flatMap(referencedUserIds))].filter((id) => !known.has(id));
  const groupIds = new Set(messages.flatMap((message) => message.group_mentions ?? []));
  const quiet: CallContext = { req: context.req, declared: [] };
  const [directory, groups] = await Promise.all([
    missing.length === 0 ? [] : listContactsByIds(missing, quiet).catch(() => []),
    groupIds.size === 0 ? [] : listMentionGroups(chatId, undefined, quiet).catch(() => []),
  ]);
  for (const user of directory) {
    const name = fullName(user);
    if (name && !known.has(user.id)) known.set(user.id, name);
  }
  return { users: known, groups: new Map(groups.map((group) => [group.id, group.name])) };
}

/** The groups at least one member of the chat belongs to, whose name contains `q` (at most 20, Message API). */
async function listMentionGroups(chatId: number, q: string | undefined, context: CallContext) {
  const response = await callUpstream(
    'MESSAGE_API',
    () => messageClient.getMentionGroups(chatId, q ? { q } : {}, messageApi(context)),
    { declared: context.declared, retry: true },
  );
  return response.data.groups;
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
  const names = await nameBook(chatId, users, result.messages, context);

  // Messages carry the public id of their conversation (= `conversation.id`), never the form the client sent:
  // the front matches the two before it trusts a page or a write (MAIR-603).
  return {
    conversation: mapChatToConversation(result.chat, latest),
    participants,
    messages: result.messages.map((message) => mapMessageToDto(publicChatId(chatId), message, currentUserId, names)),
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

/** Tags of a message written through the BFF (MAIR-1154), as the routes validated them. */
export type MessageTags = {
  replyTo?: string | number;
  mentionIds?: Array<string | number>;
  mentionEveryone?: boolean;
  groupMentionIds?: Array<string | number>;
  links?: Array<{ id: string }>;
};

/** Numeric ids of public ids the route already validated (`user-3`, `3`). */
function numericIds(ids: Array<string | number>): number[] {
  return ids.map(parseNumericId).filter((id): id is number => id !== null);
}

/** A link of a request (`project-12`) as Message API takes it (`{ kind: 'project', id: 12 }`). */
function linkOf(id: string): MessageLinkView {
  const match = /^(project|task|event)-(\d+)$/.exec(id);
  if (!match) throw new HttpError(400, 'Invalid link id');
  return { kind: match[1] as LinkKind, id: Number(match[2]) };
}

/** The tag fields of a Message API write: only the ones the request carries (an absent field keeps the tags of an edit). */
function upstreamTags(tags: MessageTags) {
  return {
    ...(tags.mentionIds === undefined ? {} : { mentions: numericIds(tags.mentionIds) }),
    ...(tags.mentionEveryone === undefined ? {} : { mentions_everyone: tags.mentionEveryone }),
    ...(tags.groupMentionIds === undefined ? {} : { group_mentions: numericIds(tags.groupMentionIds) }),
    ...(tags.links === undefined ? {} : { links: tags.links.map((link) => linkOf(link.id)) }),
  };
}

function requireChatId(conversationId: string | number): number {
  const chatId = parseNumericId(conversationId);
  if (chatId === null) throw new HttpError(400, 'Invalid conversation id');
  return chatId;
}

function requireMessageId(messageId: string | number): number {
  const id = parseNumericId(messageId);
  if (id === null) throw new HttpError(400, 'Invalid message id');
  return id;
}

export async function sendMessageToConversation(
  conversationId: string | number,
  content: string,
  context: CallContext,
  tags: MessageTags = {},
): Promise<{ conversation: BffConversation; message: BffMessage }> {
  const chatId = requireChatId(conversationId);
  const citation = tags.replyTo === undefined ? undefined : requireMessageId(tags.replyTo);
  const body = { content, ...(citation === undefined ? {} : { citation }), ...upstreamTags(tags) };

  const currentUserId = callerId(context);
  // The post, the conversation (one message of its page carries it) and the members' names, in parallel.
  const [response, header, users] = await Promise.all([
    callUpstream('MESSAGE_API', () => messageClient.postMessage(chatId, body, messageApi(context)), { declared: context.declared }),
    getChatPage(chatId, { limit: 1 }, context),
    listChatUsers(chatId, context, context.declared),
  ]);
  const sent: UpstreamMessage = {
    id: response.data.id,
    content,
    created_at: new Date().toISOString(),
    sender_id: currentUserId,
    citation: citation ?? null,
    mentions: body.mentions ?? [],
    mentions_everyone: body.mentions_everyone ?? false,
    group_mentions: body.group_mentions ?? [],
    links: body.links ?? [],
  };
  const names = await nameBook(chatId, users, [sent], context);

  return {
    conversation: mapChatToConversation(header.chat, sent),
    message: mapMessageToDto(publicChatId(chatId), sent, currentUserId, names),
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
      // Sequential on purpose: the next conversation is only read when this one was deleted meanwhile (404).
      // eslint-disable-next-line no-await-in-loop
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

// --- Messaging V2 (MAIR-1154): edit, delete, reactions, members, search and `@` suggestions ---

/** How far back the read of a deleted message looks for its tombstone (changes of the conversation since then). */
const TOMBSTONE_LOOKBACK_MS = 5 * 60_000;
/** Messages read back after a membership change to find the system note it wrote. */
const SYSTEM_NOTE_LOOKUP = 5;
/** Longest excerpt of a message found by a search, around its first match. */
export const SEARCH_EXCERPT_LENGTH = 200;

/** `PATCH`: the author edits the content and, for each tag field present, replaces those tags. */
export async function editMessage(
  conversationId: string | number,
  messageId: string | number,
  content: string,
  tags: Omit<MessageTags, 'replyTo'>,
  context: CallContext,
): Promise<{ message: BffMessage }> {
  const chatId = requireChatId(conversationId);
  const id = requireMessageId(messageId);
  const [response, users] = await Promise.all([
    callUpstream(
      'MESSAGE_API',
      () => messageClient.patchMessage(chatId, id, { content, ...upstreamTags(tags) }, messageApi(context)),
      { declared: context.declared },
    ),
    listChatUsers(chatId, context, context.declared),
  ]);
  const names = await nameBook(chatId, users, [response.data], context);
  return { message: mapMessageToDto(publicChatId(chatId), response.data, callerId(context), names) };
}

/**
 * Deletes a message (its author, or an administrator) and answers its tombstone, read back from the changes of the
 * conversation; when that read fails, a tombstone is built from the id alone (dated of the deletion).
 */
export async function deleteMessage(
  conversationId: string | number,
  messageId: string | number,
  context: CallContext,
): Promise<{ message: BffMessage }> {
  const chatId = requireChatId(conversationId);
  const id = requireMessageId(messageId);
  const since = new Date(Date.now() - TOMBSTONE_LOOKBACK_MS).toISOString();
  await callUpstream('MESSAGE_API', () => messageClient.deleteMessage(chatId, id, messageApi(context)), { declared: context.declared });

  const quiet: CallContext = { req: context.req, declared: [] };
  const [changes, users] = await Promise.all([
    getChatPage(chatId, { since, limit: MESSAGE_API_PAGE_SIZE }, quiet).catch(() => undefined),
    listChatUsers(chatId, quiet).catch(() => []),
  ]);
  const tombstone: UpstreamMessage = changes?.messages.find((message) => message.id === id)
    ?? { id, content: '', created_at: new Date().toISOString(), deleted: true };
  const names = { users: memberNames(users), groups: new Map<number, string>() };
  return { message: mapMessageToDto(publicChatId(chatId), { ...tombstone, deleted: true }, callerId(context), names) };
}

/** Adds (`emoji` given to `add`) or removes the caller's reaction, and answers every reaction of the message. */
export async function reactToMessage(
  conversationId: string | number,
  messageId: string | number,
  emoji: string,
  action: 'add' | 'remove',
  context: CallContext,
): Promise<{ reactions: BffReaction[] }> {
  const chatId = requireChatId(conversationId);
  const id = requireMessageId(messageId);
  const [response, users] = await Promise.all([
    callUpstream(
      'MESSAGE_API',
      () => (action === 'add'
        ? messageClient.addReaction(chatId, id, { emoji }, messageApi(context))
        : messageClient.removeReaction(chatId, id, { emoji }, messageApi(context))),
      { declared: context.declared },
    ),
    listChatUsers(chatId, context, context.declared),
  ]);
  const names = await nameBook(chatId, users, [{ id, content: '', created_at: '', reactions: response.data.reactions }], context);
  return { reactions: mapReactions(response.data.reactions, callerId(context), names) };
}

/** Whether the caller is a platform administrator: the role of the token, or Core's when the token has none. */
async function isPlatformAdmin(context: CallContext): Promise<boolean> {
  const role = sessionRole(context.req);
  const roles = role !== undefined ? [role] : await readCallerRoles({ req: context.req, declared: [] }).catch(() => []);
  return hasRole(roles, 'Admin', 'Administrateur');
}

type MembersRead = { users: ChatUser[]; members: BffMember[]; canManage: boolean };

/** The members of the chat and whether the caller may manage them (a group, administered by the caller or a platform admin). */
async function readMembers(chatId: number, context: CallContext): Promise<MembersRead> {
  const [users, header] = await Promise.all([
    listChatUsers(chatId, context, context.declared),
    getChatPage(chatId, { limit: 1 }, context),
  ]);
  const currentUserId = callerId(context);
  const members = users.map((user) => ({
    id: publicUserId(user.id),
    name: fullName(user),
    isAdmin: user.is_admin ?? false,
  }));
  const canManage = header.chat.kind === 'group'
    && (users.some((user) => user.id === currentUserId && user.is_admin) || await isPlatformAdmin(context));
  return { users, members, canManage };
}

export async function fetchMembers(conversationId: string | number, context: CallContext): Promise<{ members: BffMember[]; canManage: boolean }> {
  const { members, canManage } = await readMembers(requireChatId(conversationId), context);
  return { members, canManage };
}

/** Adds members to a group; answers the members after the change and the system note Message API wrote. */
export async function addMembers(
  conversationId: string | number,
  userIds: Array<string | number>,
  context: CallContext,
): Promise<{ members: BffMember[]; canManage: boolean; systemMessage?: BffMessage }> {
  const chatId = requireChatId(conversationId);
  const response = await callUpstream(
    'MESSAGE_API',
    () => messageClient.addUsersToChat(chatId, { users_id: numericIds(userIds) }, messageApi(context)),
    { declared: context.declared },
  );
  const { users, members, canManage } = await readMembers(chatId, context);
  const note = response.data.system_message;
  if (!note) return { members, canManage };
  const names = await nameBook(chatId, users, [note], context);
  return { members, canManage, systemMessage: mapMessageToDto(publicChatId(chatId), note, callerId(context), names) };
}

/**
 * Removes another member from a group (its administrator or a platform admin); answers the members after the change
 * and the system note Message API wrote (read back from the latest messages). The caller leaves with `leaveConversation`.
 */
export async function removeMember(
  conversationId: string | number,
  userId: string | number,
  context: CallContext,
): Promise<{ members: BffMember[]; canManage: boolean; systemMessage?: BffMessage }> {
  const chatId = requireChatId(conversationId);
  const memberId = parseNumericId(userId);
  if (memberId === null) throw new HttpError(400, 'Invalid user id');
  if (memberId === callerId(context)) {
    throw new HttpError(400, 'Use POST /conversations/{conversationId}/leave to leave a conversation');
  }

  try {
    await callUpstream('MESSAGE_API', () => messageClient.removeUserFromChat(chatId, memberId, messageApi(context)), {
      declared: context.declared,
    });
  } catch (error) {
    // Message API answers 400 when `user_id` is not a member of the chat.
    if (error instanceof HttpError && upstreamStatus(error.cause) === 400) {
      throw new HttpError(404, 'This agent is not a member of the conversation');
    }
    throw error;
  }

  const [read, latest] = await Promise.all([
    readMembers(chatId, context),
    getChatPage(chatId, { limit: SYSTEM_NOTE_LOOKUP }, { req: context.req, declared: [] }).catch(() => undefined),
  ]);
  const note = [...(latest?.messages ?? [])].reverse().find((message) => message.kind === 'system'
    && message.system_event?.action === 'member_removed' && message.system_event.user_ids.includes(memberId));
  if (!note) return { members: read.members, canManage: read.canManage };
  const names = await nameBook(chatId, read.users, [note], context);
  return {
    members: read.members,
    canManage: read.canManage,
    systemMessage: mapMessageToDto(publicChatId(chatId), note, callerId(context), names),
  };
}

/** The caller leaves the conversation (a direct one is only hidden): the same as deleting it from the list. */
export async function leaveConversation(conversationId: string | number, context: CallContext): Promise<void> {
  await deleteConversation(conversationId, context);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The excerpt of a message found by `q`: the whole content when short, otherwise `SEARCH_EXCERPT_LENGTH` characters
 * around the first match with `…` at each cut; and every case-insensitive match of `q` in it.
 */
export function searchExcerpt(content: string, q: string): { excerpt: string; highlights: Array<{ start: number; length: number }> } {
  const needle = q.trim();
  const pattern = new RegExp(escapeRegExp(needle), 'giu');
  let excerpt = content;
  if (content.length > SEARCH_EXCERPT_LENGTH) {
    const first = needle ? content.search(pattern) : -1;
    const start = Math.max(0, Math.min(first - Math.floor(SEARCH_EXCERPT_LENGTH / 3), content.length - SEARCH_EXCERPT_LENGTH));
    const end = start + SEARCH_EXCERPT_LENGTH;
    excerpt = `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`;
  }
  const highlights = needle
    ? [...excerpt.matchAll(pattern)].map((match) => ({ start: match.index ?? 0, length: match[0].length }))
    : [];
  return { excerpt, highlights };
}

type SearchType = (typeof SEARCH_TYPES)[number];

/** One page of a search in the conversation: messages (with the author names of the members), people, or files (none). */
export async function searchConversation(
  conversationId: string | number,
  query: { q: string; type?: SearchType; limit?: number; offset?: number },
  context: CallContext,
): Promise<z.infer<typeof ConversationSearchResponse>> {
  const chatId = requireChatId(conversationId);
  const type = query.type ?? 'messages';
  const params = { q: query.q, type, ...(query.limit === undefined ? {} : { limit: query.limit }), ...(query.offset === undefined ? {} : { offset: query.offset }) };
  const [response, users] = await Promise.all([
    callUpstream('MESSAGE_API', () => messageClient.searchChat(chatId, params, messageApi(context)), { declared: context.declared, retry: true }),
    type === 'messages' ? listChatUsers(chatId, context, context.declared) : Promise.resolve([]),
  ]);
  const names = memberNames(users);
  const items = response.data.items.map((item) => {
    if ('content' in item) {
      const message = item as SearchMessageItem;
      const authorName = message.sender_id == null ? undefined : names.get(message.sender_id);
      return {
        messageId: publicMessageId(message.id),
        ...(message.sender_id == null ? {} : { authorId: publicUserId(message.sender_id) }),
        ...(authorName ? { authorName } : {}),
        createdAt: message.created_at,
        ...searchExcerpt(message.content, query.q),
      };
    }
    const person = item as SearchPersonItem;
    return { id: publicUserId(person.id), name: fullName(person) };
  });
  return { type, items, hasMore: response.data.has_more, total: response.data.total };
}

/** Lower case, without accents: « Éloïse » matches « elo ». */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

const EVERYONE_LABELS = ['tout le monde', 'everyone'];

/** What the caller may mention after `@q`: `@tout le monde`, the groups of the members, the other members. */
export async function fetchMentionSuggestions(
  conversationId: string | number,
  q: string | undefined,
  context: CallContext,
): Promise<z.infer<typeof MentionSuggestionsResponse>> {
  const chatId = requireChatId(conversationId);
  const needle = foldText(q ?? '');
  const [users, groups] = await Promise.all([
    listChatUsers(chatId, context, context.declared),
    listMentionGroups(chatId, q?.trim() || undefined, context),
  ]);
  const currentUserId = callerId(context);
  return {
    everyone: needle === '' || EVERYONE_LABELS.some((label) => label.startsWith(needle)),
    groups: groups.map((group) => ({ id: publicGroupId(group.id), name: group.name })),
    people: users
      .filter((user) => user.id !== currentUserId)
      .map((user) => ({ id: publicUserId(user.id), name: fullName(user) }))
      .filter((person) => person.name && foldText(person.name).includes(needle)),
  };
}
