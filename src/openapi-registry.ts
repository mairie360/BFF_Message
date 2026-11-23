import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { ErrorResponseSchema } from '@mairie360/bffs-lib';
import { z } from 'zod';

// Adds the .openapi() methods to Zod
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// The only credential the BFF accepts (`Authorization: Bearer <token>`, MAIR-429) and forwards
// upstream: the fronts' proxy turns the accessToken cookie into it, the BFF reads no cookie. The
// document requires it on every operation (`openapi.ts`); public operations opt out with
// `security: []`. The ZAP OpenAPI coverage gate reads this to tell which operations must be reached
// authenticated.
export const bearerAuth = registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});


export const IdSchema = z.union([z.string(), z.number()]).openapi({
  description: 'Unique id, either a string or a number',
  example: '12345',
});


// Ids received from the client: a positive integer or a public id (`user-3`, `conversation-101`). The helpers
// read the trailing number, so any other string (`12345 AND 1=2`) must be refused before reaching them.
// The examples are numbers (ZAP writes a string example of an anyOf unquoted) naming rows of init-test.sql.
function inputId(kind: string, example: number) {
  return z.union([
    z.number().int().positive(),
    z.string().regex(new RegExp(`^(?:${kind}-)?\\d+$`), `Expected a ${kind} identifier`),
  ]).openapi({ description: `Id (${kind}-<id> or integer)`, example });
}

// No control character (Core API and Message API answer 400 to them). A refinement, not a `.regex()`: the contract then
// does not publish a unicode pattern that other tools would read as a plain ECMA 262 pattern.
const noControlCharacter = (schema: z.ZodString) => schema.refine((value) => !/\p{Cc}/u.test(value), 'must not contain control characters');

// Stored texts are rendered by the fronts: `<` and `>` are refused.
const noMarkup = (schema: z.ZodString) => schema.regex(/^[^<>]*$/, 'Must not contain < or >');

/** Longest message body, conversation name and group description accepted. */
export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_NAME_LENGTH = 100;
export const MAX_DESCRIPTION_LENGTH = 500;
/** Largest page a listing (`limit`) may ask for, and the most members a group may be created with. */
export const MAX_LIMIT = 100;
/** Largest page of `GET /conversations`: keeps one page of the list cheap whatever the size of the messaging. */
export const MAX_CONVERSATIONS_LIMIT = 30;
export const MAX_GROUP_MEMBERS = 100;

// `limit` of the listings: 0 used to return everything and a negative value inverted the slicing.
const limitQuery = () => z.coerce.number().int().min(1).max(MAX_LIMIT);

export const ConversationKindSchema = z.enum(['direct', 'group']).openapi({
  description: 'Type of conversation, direct or group',
  example: 'direct',
});

export const PresenceSchema = z.enum(['online', 'offline', 'away']).openapi({
  description: 'Presence of the user: online, offline or away',
  example: 'online',
});

export const MessageDirectionSchema = z.enum(['incoming', 'outgoing']).openapi({
  description: 'Direction of the message, incoming or outgoing',
  example: 'incoming',
});

export const CurrentUserDtoSchema = z.object({
  id: IdSchema,
  name: z.string().max(100).openapi({
    description: 'Full name of the current user',
    example: 'Alice Dupont',
  }),
  email: z.string().email().optional(),
  role: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  phone: z.string().optional(),
  service: z.string().optional(),
  position: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  lastConnection: z.string().optional(),
}).openapi({
  description: 'Currently signed-in user',
});


export const ConversationDtoSchema = z.object({
  id: IdSchema,
  name: z.string().openapi({
    description: 'Name of the conversation',
    example: 'Discussion de groupe',
  }),
  department: z.string().optional().openapi({
    description: 'Department tied to the conversation',
    example: 'Marketing',
  }),
  kind: ConversationKindSchema.optional().openapi({
    description: 'Conversation type: `direct` for a conversation created by `POST /direct-messages` between the caller and one contact, `group` otherwise',
    example: 'direct',
  }),
  contactId: IdSchema.optional().openapi({
    description: 'Direct conversations only: id of the other participant (the contact), to post a new message to that contact in this conversation instead of creating another one',
    example: 'user-8',
  }),
  avatarUrl: z.string().url().optional().openapi({
    description: 'Avatar URL of the conversation',
    example: 'https://example.com/avatar.png',
  }),
  initials: z.string().optional().openapi({
    description: 'Initials of the conversation',
    example: 'DG',
  }),
  presence: PresenceSchema.optional().openapi({
    description: 'Presence of the user: online, offline or away',
    example: 'online',
  }),
  lastMessage: z.string().optional().openapi({
    description: 'Last message of the conversation',
    example: 'Hello everyone!',
  }),
  lastMessageAt: z.string().optional().openapi({
    description: 'Date and time of the last message (ISO format)',
    example: '2026-06-23T12:32:00Z',
  }),
  unreadCount: z.number().int().optional().openapi({
    description: 'Number of unread messages in the conversation',
    example: 5,
  }),
  memberCount: z.number().int().optional().openapi({
    description: 'Number of members of a group conversation (always 2 for a direct one). The names of the members come with `GET /conversations/{conversationId}`.',
    example: 8,
  }),
}).openapi({
  description: 'A conversation',
});




export const AttachmentDtoSchema = z.object({
  id: IdSchema,
  name: z.string().openapi({
    description: 'Name of the attachment',
    example: 'document.pdf',
  }),
  size: z.number().int().optional().openapi({
    description: 'Size of the attachment in bytes',
    example: 102400,
  }),
  type: z.string().optional().openapi({
    description: 'MIME type of the attachment',
    example: 'application/pdf',
  }),
  url: z.string().url().optional().openapi({
    description: 'URL to reach the attachment',
    example: 'https://example.com/document.pdf',
  }),
}).openapi({
  description: 'An attachment',
});


export const MentionDtoSchema = z.object({
  id: IdSchema,
  name: z.string().openapi({
    description: 'Name of the mention',
    example: 'Alice Dupont',
  }),
  kind: ConversationKindSchema.optional().openapi({
    description: 'Type of conversation tied to the mention',
    example: 'direct',
  }),
  description: z.string().optional().openapi({
    description: 'Description of the mention',
    example: 'Mention of a user in a message',
  }),
}).openapi({
  description: 'A mention',
});

export const QuotedMessageDtoSchema = z.object({
  id: IdSchema,
  authorId: IdSchema.optional().openapi({
    description: 'Id of the author of the quoted message (`user-<n>`), absent once the account is deleted',
    example: 'user-12',
  }),
  authorName: z.string().optional().openapi({
    description: 'Name of the author of the quoted message when they are a current member of the conversation',
    example: 'Alice Dupont',
  }),
  excerpt: z.string().openapi({
    description: 'First 100 characters of the quoted message',
    example: 'Any news about the building permit?',
  }),
}).openapi({
  description: 'The message another message answers, with what is needed to display the quote',
});

/** Number of ids a write may tag a message with, for each kind of tag (Message API's limit, MAIR-1155). */
export const MAX_MESSAGE_TAGS = 50;

export const MessageKindSchema = z.enum(['user', 'system']).openapi({
  description: '`user` for a message written by an agent, `system` for a note the conversation writes itself (a membership change)',
  example: 'user',
});

export const SystemEventDtoSchema = z.object({
  action: z.enum(['members_added', 'member_removed', 'member_left']).openapi({
    description: '`members_added`: the actor added `userIds`; `member_removed`: the actor removed `userIds`; `member_left`: the actor left',
    example: 'members_added',
  }),
  actorId: IdSchema.openapi({ description: 'Id of the agent who made the change (`user-<n>`)', example: 'user-1' }),
  actorName: z.string().optional().openapi({
    description: 'Name of the actor, absent when the directory does not know the account any more',
    example: 'Alice Dupont',
  }),
  userIds: z.array(IdSchema).openapi({ description: 'Agents added or removed (`user-<n>`); the actor alone for `member_left`', example: ['user-3'] }),
  userNames: z.array(z.string()).openapi({
    description: 'Names of `userIds`, in the same order, for the agents the directory still knows',
    example: ['Contact Sample'],
  }),
}).openapi({
  description: 'The membership change a system note records',
});

export const GroupMentionDtoSchema = z.object({
  id: IdSchema.openapi({ description: 'Id of the group (`group-<n>`)', example: 'group-4' }),
  name: z.string().optional().openapi({
    description: 'Name of the group, absent when none of the members of the conversation belongs to it any more',
    example: 'Service urbanisme',
  }),
}).openapi({
  description: 'A group mentioned by a message',
});

export const LinkKindSchema = z.enum(['project', 'task', 'event']).openapi({
  description: 'Kind of business object: a project, a task or a calendar event',
  example: 'project',
});

export const MessageLinkDtoSchema = z.object({
  id: IdSchema.openapi({ description: 'Id of the object (`project-<n>`, `task-<n>` or `event-<n>`)', example: 'project-12' }),
  kind: LinkKindSchema,
  title: z.string().optional().openapi({
    description: 'Title of the object when the BFF knows it (link suggestions); a message does not carry it: its content holds the text its author wrote',
    example: 'Rénovation de la médiathèque',
  }),
  url: z.string().optional().openapi({
    description: 'Page of the object in its front: `<PROJECT_FRONT_URL>/?project=<id>`, `<PROJECT_FRONT_URL>/?project=<project>&task=<id>`, `<CALENDAR_FRONT_URL>/?date=<YYYY-MM-DD>&event=<id>`; absent when that front is not configured on the BFF, or for a task whose project / an event whose start Message API did not give',
    example: 'https://projets.mairie360.fr/projects/12',
  }),
}).openapi({
  description: 'A project, task or event a message links to',
});

export const ReactionDtoSchema = z.object({
  emoji: z.string().openapi({ description: 'The emoji', example: '👍' }),
  count: z.number().int().openapi({ description: 'Number of agents who reacted with it', example: 2 }),
  reactedByMe: z.boolean().openapi({ description: 'Whether the caller is one of them', example: true }),
  userNames: z.array(z.string()).openapi({
    description: 'Names of the agents who reacted with it, in the order of their reaction, for the agents the directory still knows',
    example: ['Alice Dupont', 'Contact Sample'],
  }),
}).openapi({
  description: 'The reactions to a message with one emoji',
});

export const MessageDtoSchema = z.object({
  id: IdSchema,
  conversationId: IdSchema,
  content: z.string().openapi({
    description: 'Content of the message',
    example: 'Hello everyone!',
  }),
  sentAt: z.string().openapi({
    description: 'Date and time the message was sent (ISO format)',
    example: '2026-06-23T12:32:00Z',
  }),
  authorId: IdSchema.optional().openapi({
    description: 'Id of the author (`user-<n>`), absent once the author\'s account is deleted',
    example: 'user-12',
  }),
  authorName: z.string().optional().openapi({
    description: 'Name of the author of the message',
    example: 'Alice Dupont',
  }),
  direction: MessageDirectionSchema.optional().openapi({
    description: 'Direction of the message, incoming or outgoing',
    example: 'incoming',
  }),
  attachments: z.array(AttachmentDtoSchema).optional().openapi({
    description: 'Attachments of the message',
    example: [],
  }),
  mentions: z.array(MentionDtoSchema).optional().openapi({
    description: 'Mentions in the message',
    example: [],
  }),
  citation: IdSchema.optional().openapi({
    description: 'Id of the message this one answers (`message-<n>`), absent when it answers none or once that message is deleted',
    example: 'message-117',
  }),
  quoted: QuotedMessageDtoSchema.optional().openapi({
    description: 'The message `citation` points to (author and excerpt), also when it is older than the loaded page',
  }),
  kind: MessageKindSchema,
  systemEvent: SystemEventDtoSchema.optional().openapi({
    description: 'System notes only (`kind: system`): the membership change the note records',
  }),
  editedAt: z.string().optional().openapi({
    description: 'Date and time of the last edit of the content (ISO format); absent when the message was never edited',
    example: '2026-06-23T12:40:00Z',
  }),
  deleted: z.boolean().openapi({
    description: 'Whether the message was deleted (tombstone): its content is then empty, and it carries no tag nor reaction',
    example: false,
  }),
  mentionsEveryone: z.boolean().openapi({
    description: 'Whether the message mentions every member of the conversation (`@everyone`)',
    example: false,
  }),
  groupMentions: z.array(GroupMentionDtoSchema).openapi({
    description: 'Groups the message mentions',
    example: [],
  }),
  links: z.array(MessageLinkDtoSchema).openapi({
    description: 'Projects, tasks and events the message links to (`#`)',
    example: [],
  }),
  reactions: z.array(ReactionDtoSchema).openapi({
    description: 'Reactions to the message, one entry per emoji, in the order of their first reaction',
    example: [],
  }),
}).openapi({
  description: 'A message',
});


export const ContactDtoSchema = z.object({
  id: IdSchema,
  name: z.string().openapi({
    description: 'Name of the contact',
    example: 'Alice Dupont',
  }),
  email: z.string().email().optional().openapi({
    description: 'Email address of the contact',
    example: 'alice.dupont@mairie360.fr',
  }),
  department: z.string().optional().openapi({
    description: 'Department of the contact',
    example: 'Marketing',
  }),
  avatarUrl: z.string().url().optional().openapi({
    description: 'Avatar URL of the contact',
    example: 'https://example.com/avatar.png',
  }),
  initials: z.string().optional().openapi({
    description: 'Initials of the contact',
    example: 'AD',
  }),
  presence: PresenceSchema.optional().openapi({
    description: 'Presence of the contact: online, offline or away',
    example: 'online',
  }),
}).openapi({
  description: 'A contact',
});

// `GET /conversations/{conversationId}` also takes the numeric `before` cursor. ZAP ("Path Traversal") tries the last
// segment of the URL as the value of a query parameter and flags a parameter that accepts it: the public id as example
// keeps `101` out of reach of `before`, which only accepts a number.
export const LoadConversationIdParams = z.object({
  conversationId: inputId('conversation', 101).openapi({ example: 'conversation-101' }),
}).openapi({
  description: 'Parameters identifying a conversation',
});

export const ConversationIdParams = z.object({
  conversationId: inputId('conversation', 101),
}).openapi({
  description: 'Parameters identifying a conversation',
});

// Writes get their own seeded conversations: a scan replaying the examples must not delete conversation 101,
// nor change the messages that the reads of conversation 101 return.
export const DeletedConversationIdParams = z.object({
  conversationId: inputId('conversation', 102),
});

export const WrittenConversationIdParams = z.object({
  conversationId: inputId('conversation', 201),
});

// The examples name rows of init-test.sql written by the Admin, so that a scan replaying them reaches real rows.
export const EditedMessageParams = z.object({
  conversationId: inputId('conversation', 201),
  messageId: inputId('message', 2001),
});

export const DeletedMessageParams = z.object({
  conversationId: inputId('conversation', 201),
  messageId: inputId('message', 2002),
});

export const RemovedMemberParams = z.object({
  conversationId: inputId('conversation', 201),
  userId: inputId('user', 10),
});

export const LeftConversationIdParams = z.object({
  conversationId: inputId('conversation', 203),
});


export const ConversationsQuery = z.object({
  search: noControlCharacter(z.string().max(MAX_NAME_LENGTH)).optional().openapi({
    description: 'Keeps the conversations whose name contains this text, or in which another member has a first name, last name or full name containing it (a direct conversation is named after its contact). Case-insensitive; the pagination applies to the filtered list.',
    example: 'Xavier Bertrand',
  }),
  limit: z.coerce.number().int().min(1).max(MAX_CONVERSATIONS_LIMIT).optional().openapi({
    description: 'Number of conversations per page, 1 to 30. Default 20.',
    example: 20,
  }),
  cursor: z.string().regex(/^\d{1,9}$/, 'must be the nextCursor of a previous page').optional().openapi({
    description: 'The `nextCursor` of the previous page. Absent: the first page.',
    example: '20',
  }),
}).openapi({
  description: 'Query parameters to filter and page the conversations',
});


export const MessagesQuery = z.object({
  limit: limitQuery().optional().openapi({
    description: 'Number of messages per page, 1 to 100. Default 30.',
    example: 30,
  }),
  // An integer, not a string: a numeric string would be fuzzed as a file name (ZAP "Path Traversal") for no reason.
  before: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional().openapi({
    description: 'The `nextCursor` of the previous page: only the messages older than the message with this numeric id are returned. Absent: the latest messages.',
    example: 117,
  }),
}).openapi({
  description: 'Query parameters to page the messages',
});

export const ContactsQuery = z.object({
    // Core API refuses control characters in `search` (400): refused here, so it is not a Core API failure (502).
    search: noControlCharacter(z.string().max(MAX_NAME_LENGTH)).optional().openapi({
        description: 'Search term filtering the contacts (no control characters)',
        example: 'Alice'
    }),
    limit: limitQuery().optional().openapi({
        description: 'Maximum number of contacts to return',
        example: 10
    }),
}).openapi({
    description: 'Query parameters to filter the contacts',
});

// Requests 

const LinkInputSchema = z.object({
  id: z.string().regex(/^(?:project|task|event)-\d{1,9}$/, 'Expected project-<id>, task-<id> or event-<id>').openapi({
    description: 'The object (`project-<n>`, `task-<n>` or `event-<n>`, as `GET /link-suggestions` gives it), which the author must be allowed to read',
    example: 'project-12',
  }),
}).openapi({ description: 'A project, task or event to link the message to' });

/** Tags of a message written by the caller (MAIR-1154): every field optional. */
function messageTagsFields() {
  return {
    mentionIds: z.array(inputId('user', 3)).max(MAX_MESSAGE_TAGS).optional().openapi({
      description: 'Members the message mentions (`user-<n>` or integer), at most 50: members of the conversation only (400 otherwise)',
    }),
    mentionEveryone: z.boolean().optional().openapi({
      description: 'Whether the message mentions every member of the conversation (`@everyone`)',
      example: false,
    }),
    groupMentionIds: z.array(inputId('group', 4)).max(MAX_MESSAGE_TAGS).optional().openapi({
      description: 'Groups the message mentions (`group-<n>` or integer, from `GET /conversations/{conversationId}/mention-suggestions`), at most 50: groups a member of the conversation belongs to (400 otherwise)',
    }),
    links: z.array(LinkInputSchema).max(MAX_MESSAGE_TAGS).optional().openapi({
      description: 'Projects, tasks and events the message links to, at most 50: objects the author may read (400 otherwise)',
    }),
  };
}


export const SendMessageBody = z.object({
  content: noMarkup(z.string().min(1).max(MAX_MESSAGE_LENGTH)).openapi({
    description: 'Content of the message to send',
    example: 'Hello everyone!',
  }),
  attachmentIds: z.array(inputId('attachment', 1)).max(0, 'Attachments are not supported yet').optional().openapi({
    description: 'Attachment ids. Attachments are not supported yet (`POST /attachments` answers 503): only an empty list is accepted, anything else is refused with 400 instead of being silently dropped.',
  }),
  ...messageTagsFields(),
  replyTo: inputId('message', 1001).optional().openapi({
    description: 'Id of the message this one answers (`message-<n>` or integer), in the same conversation: the answer then carries `citation` and `quoted`',
    example: 1001,
  }),
}).openapi({
  description: 'Request body to send a message',
});

export const EditMessageBody = z.object({
  content: noMarkup(z.string().min(1).max(MAX_MESSAGE_LENGTH)).openapi({
    description: 'New content of the message',
    example: 'The meeting is moved to 3 pm.',
  }),
  ...messageTagsFields(),
}).openapi({
  description: 'Request body to edit a message: each tag field present replaces the tags of that kind, an absent one keeps them',
});

// Codepoints, like Message API counts them (👍 is one character, two UTF-16 units).
export const ReactionEmoji = z.string().min(1).max(64)
  .refine((value) => [...value].length <= 32, 'must be at most 32 characters')
  .refine((value) => !/[\s\p{Cc}]/u.test(value), 'must not contain whitespace or control characters')
  .openapi({ description: 'The emoji: 1 to 32 characters, no whitespace nor control character', example: '👍' });

export const ReactionBody = z.object({ emoji: ReactionEmoji }).openapi({ description: 'Request body to react to a message' });

export const ReactionQuery = z.object({ emoji: ReactionEmoji }).openapi({ description: 'The reaction of the caller to remove' });

export const AddMembersBody = z.object({
  userIds: z.array(inputId('user', 10)).min(1).max(MAX_MESSAGE_TAGS).openapi({
    description: 'Agents to add (`user-<n>` or integer), 1 to 50, none already a member',
    example: [10],
  }),
}).openapi({ description: 'Request body to add members to a group conversation' });

export const SEARCH_TYPES = ['messages', 'files', 'people'] as const;

export const ConversationSearchQuery = z.object({
  q: noControlCharacter(z.string().max(150)).refine((value) => value.trim().length > 0, 'must not be blank').openapi({
    description: 'Text to find, case-insensitive: in the content of the messages, or in the first name, last name or full name of the members. 1 to 150 characters, no control character.',
    example: 'permis',
  }),
  type: z.enum(SEARCH_TYPES).optional().openapi({
    description: '`messages` (default), `files` (always empty: attachments are not supported yet) or `people`',
    example: 'messages',
  }),
  limit: z.coerce.number().int().min(1).max(50).optional().openapi({ description: 'Results per page, 1 to 50. Default 20.', example: 20 }),
  offset: z.coerce.number().int().min(0).max(1_000_000).optional().openapi({
    description: 'Results to skip: the previous `offset` plus `limit` while `hasMore`. Default 0.',
    example: 0,
  }),
}).openapi({ description: 'Query of a search in a conversation' });

export const MentionSuggestionsQuery = z.object({
  q: noControlCharacter(z.string().max(64)).optional().openapi({
    description: 'What the agent typed after `@` (at most 64 characters). Absent or empty: every suggestion.',
    example: 'ali',
  }),
}).openapi({ description: 'Query of the `@` suggestions' });

export const LinkSuggestionsQuery = z.object({
  q: noControlCharacter(z.string().max(MAX_NAME_LENGTH)).optional().openapi({
    description: 'What the agent typed after `#` (at most 100 characters), matched case- and accent-insensitively against the titles. Absent or empty: every suggestion.',
    example: 'média',
  }),
}).openapi({ description: 'Query of the `#` suggestions' });

export const NewDirectMessageBody = z.object({
  recipientId: inputId('user', 3),
  message: noMarkup(z.string().min(1).max(MAX_MESSAGE_LENGTH)).openapi({
    description: 'Content of the direct message to send',
    example: 'Hi! How are you?',
  }),
}).openapi({
  description: 'Request body to create a new direct message',
});

export const CreateGroupBody = z.object({
    name: noMarkup(z.string().min(1).max(MAX_NAME_LENGTH)).openapi({
        description: 'Name of the group to create',
        example: 'Marketing team',
    }),
    description: noMarkup(z.string().max(MAX_DESCRIPTION_LENGTH)).optional().openapi({
        description: 'Description of the group to create',
        example: 'Group of the marketing team',
    }),
    memberIds: z.array(inputId('user', 3)).max(MAX_GROUP_MEMBERS).openapi({
        description: 'Ids of the members to add to the group',
    }),
}).openapi({
    description: 'Request body to create a new group',
});

export const MarkConversationAsReadBody = z.object({
    readUntilMessageId: inputId('message', 1001).optional().openapi({
        description: 'Last message the caller has displayed (`message-<id>` or integer): every message up to '
          + 'and including it is acknowledged. Absent: up to the latest message of the conversation.',
        example: 1001,
    }),
}).openapi({
    description: 'Body of a read acknowledgement (optional)',
});

export const UploadAttachmentBody = z.object({
    files: z.string().openapi({
        type: 'string',
        format: 'binary',
        description: 'File to upload as an attachment (multipart part named `files`)',
    }),
}).openapi({
    description: 'Request body to upload an attachment',
});

// Responses

export const CurrentUserResponse = z.object({
  currentUser: CurrentUserDtoSchema,
}).openapi({
  description: 'Response holding the current user',
});

export const ConversationsResponse = z.object({
  conversations: z.array(ConversationDtoSchema).openapi({
    description: 'Conversations',
  }),
  nextCursor: z.string().optional().openapi({
    description: 'Pass it as `cursor` to get the next page; absent on the last page',
    example: '20',
  }),
}).openapi({
  description: 'Response holding the conversations and a pagination cursor',
});

export const MessagesResponse = z.object({
  conversation: ConversationDtoSchema.openapi({
    description: 'Details of the conversation of the messages',
  }),
  messages: z.array(MessageDtoSchema).openapi({
    description: 'Messages',
  }),
  hasMore: z.boolean().optional().openapi({
    description: 'Whether older messages remain',
    example: true,
  }),
  nextCursor: z.string().optional().openapi({
    description: 'Pass it as `before` to get the previous (older) page; absent on the last page',
    example: '117',
  }),
}).openapi({
  description: 'Response holding the messages and a pagination cursor',
});

export const LoadConversationResponse = z.object({
  conversation: ConversationDtoSchema.openapi({
    description: 'The conversation: name to display, kind, contact, member count, unread counter',
  }),
  participants: z.array(ContactDtoSchema).openapi({
    description: 'The members of the conversation, the caller included, with their names',
  }),
  messages: z.array(MessageDtoSchema).openapi({
    description: 'One page of messages, oldest first, with the sender id and the quoted message',
  }),
  hasMore: z.boolean().openapi({
    description: 'Whether older messages remain',
    example: true,
  }),
  nextCursor: z.string().optional().openapi({
    description: 'Pass it as `before` to `GET /conversations/{conversationId}/messages` to get the previous page; absent on the last page',
    example: '117',
  }),
}).openapi({
  description: 'A conversation opened: the conversation, its members and one page of messages',
});

export const ContactsResponse = z.object({
    contacts: z.array(ContactDtoSchema).openapi({
        description: 'Contacts',
    }),
}).openapi({
    description: 'Response holding the contacts',
});

export const SendMessageResponse = z.object({
  message: MessageDtoSchema.openapi({
    description: 'Sent message',
  }),
  conversation: ConversationDtoSchema.optional().openapi({
    description: 'Details of the conversation of the sent message',
  }),
}).openapi({
  description: 'Response holding the sent message and the details of its conversation',
});

export const NewDirectMessageResponse = z.object({
    conversation: ConversationDtoSchema.openapi({
        description: 'Details of the created direct conversation',
    }),
    message: MessageDtoSchema.openapi({
        description: 'Sent direct message',
    }),
}).openapi({
    description: 'Response holding the details of the created direct conversation and the sent message',
});

export const CreateGroupResponse = z.object({
    conversation: ConversationDtoSchema.openapi({
        description: 'Details of the created group',
    }),
}).openapi({
    description: 'Response holding the details of the created group',
});

export const DeleteConversationResponse = z.object({
    deleted: z.literal(true).openapi({
        description: 'Whether the conversation was deleted',
        example: true,
    }),
    conversationId: IdSchema.optional().openapi({
        description: 'Id of the deleted conversation',
        example: '12345',
    }),
}).openapi({
    description: 'Response telling whether the conversation was deleted',
});

export const MarkConversationAsReadResponse = z.object({
    conversationId: IdSchema.openapi({
        description: 'Id of the conversation marked as read',
        example: '12345',
    }),
    unreadCount: z.number().int().openapi({
        description: 'Number of unread messages left in the conversation after the update',
        example: 0,
    }),
}).openapi({
    description: 'Response holding the id of the conversation and the number of unread messages left after the update',
});

export const UploadAttachmentResponse = z.object({
    attachments: z.array(AttachmentDtoSchema).openapi({
        description: 'Uploaded attachments',
    }),
}).openapi({
    description: 'Response holding the uploaded attachments',
});

export const MessagingBootstrapResponse = z.object({
    contacts: z.array(ContactDtoSchema),
  currentUser: CurrentUserDtoSchema,
    conversations: z.array(ConversationDtoSchema),
    activeConversationId: IdSchema.optional(),
    messages: z.array(MessageDtoSchema),
}).openapi({
    description: 'Response holding the base data to start the messaging module',
});

export const EditMessageResponse = z.object({
  message: MessageDtoSchema.openapi({ description: 'The message as it now reads' }),
}).openapi({ description: 'Response holding the edited message' });

export const DeleteMessageResponse = z.object({
  message: MessageDtoSchema.openapi({ description: 'The deleted message: `deleted: true`, empty content, no tag nor reaction' }),
}).openapi({ description: 'Response holding the deleted message (tombstone)' });

export const ReactionsResponse = z.object({
  reactions: z.array(ReactionDtoSchema).openapi({ description: 'Every reaction to the message after the change' }),
}).openapi({ description: 'Response holding the reactions of a message' });

export const MemberDtoSchema = z.object({
  id: IdSchema.openapi({ description: 'Id of the agent (`user-<n>`)', example: 'user-3' }),
  name: z.string().openapi({ description: 'Full name of the agent', example: 'Contact Sample' }),
  department: z.string().optional().openapi({ description: 'Department of the agent, when known', example: 'Urbanisme' }),
  isAdmin: z.boolean().openapi({
    description: 'Whether the agent administers the group: its creator, as long as they stay a member',
    example: false,
  }),
}).openapi({ description: 'A member of a conversation' });

export const MembersResponse = z.object({
  members: z.array(MemberDtoSchema).openapi({ description: 'The members of the conversation, the caller included' }),
  canManage: z.boolean().openapi({
    description: 'Whether the caller may add and remove members: a group conversation, and the caller is its administrator or a platform administrator',
    example: true,
  }),
}).openapi({ description: 'The members of a conversation' });

export const MembersChangeResponse = MembersResponse.extend({
  systemMessage: MessageDtoSchema.optional().openapi({
    description: 'The system note the change wrote in the conversation (`kind: system`); absent when it could not be read back',
  }),
}).openapi({ description: 'The members of a conversation after a change, and the system note recording it' });

export const SearchMessageItemSchema = z.object({
  messageId: IdSchema.openapi({ description: 'Id of the message (`message-<n>`), to scroll to it', example: 'message-1001' }),
  authorId: IdSchema.optional().openapi({ description: 'Id of the author (`user-<n>`), absent once the account is deleted', example: 'user-3' }),
  authorName: z.string().optional().openapi({ description: 'Name of the author when they are a current member', example: 'Contact Sample' }),
  createdAt: z.string().openapi({ description: 'Date and time the message was sent (ISO format)', example: '2026-06-23T12:32:00Z' }),
  excerpt: z.string().openapi({
    description: 'The content of the message, cut around the first match when it is long (`…` marks a cut)',
    example: 'Any news about the building permit?',
  }),
  highlights: z.array(z.object({
    start: z.number().int().openapi({ description: 'Index of the match in `excerpt` (UTF-16 code units, as JavaScript counts them)', example: 22 }),
    length: z.number().int().openapi({ description: 'Length of the match (UTF-16 code units)', example: 6 }),
  })).openapi({ description: 'Every match of `q` in `excerpt`, case-insensitive, in order' }),
}).openapi({ description: 'A message found by a search' });

export const SearchPersonItemSchema = z.object({
  id: IdSchema.openapi({ description: 'Id of the member (`user-<n>`)', example: 'user-3' }),
  name: z.string().openapi({ description: 'Full name of the member', example: 'Contact Sample' }),
}).openapi({ description: 'A member found by a search' });

export const ConversationSearchResponse = z.object({
  type: z.enum(SEARCH_TYPES).openapi({ description: 'What was searched', example: 'messages' }),
  items: z.array(z.union([SearchMessageItemSchema, SearchPersonItemSchema])).openapi({
    description: 'One page of results, newest message first or by name: `SearchMessageItem` for `messages`, `SearchPersonItem` for `people`, always empty for `files`',
  }),
  hasMore: z.boolean().openapi({ description: 'Whether more results follow (next page: `offset` + `limit`)', example: false }),
  total: z.number().int().openapi({ description: 'Number of results of the whole search', example: 1 }),
}).openapi({ description: 'One page of the results of a search in a conversation' });

export const MentionSuggestionsResponse = z.object({
  everyone: z.boolean().openapi({
    description: 'Whether to suggest mentioning everyone: `q` is empty or the start of `everyone` or of its French label',
    example: true,
  }),
  groups: z.array(z.object({
    id: IdSchema.openapi({ description: 'Id of the group (`group-<n>`), for `groupMentionIds`', example: 'group-4' }),
    name: z.string().openapi({ description: 'Name of the group', example: 'Service urbanisme' }),
  })).openapi({ description: 'Groups a member of the conversation belongs to whose name contains `q` (at most 20)' }),
  people: z.array(z.object({
    id: IdSchema.openapi({ description: 'Id of the member (`user-<n>`), for `mentionIds`', example: 'user-3' }),
    name: z.string().openapi({ description: 'Full name of the member', example: 'Contact Sample' }),
  })).openapi({ description: 'Members of the conversation but the caller whose name contains `q` (case- and accent-insensitive)' }),
}).openapi({ description: 'What an agent may mention after `@` in a conversation' });

export const LinkSuggestionsResponse = z.object({
  items: z.array(z.object({
    id: z.string().openapi({ description: 'Id to send in `links` (`project-<n>`, `task-<n>` or `event-<n>`)', example: 'project-12' }),
    kind: LinkKindSchema,
    title: z.string().openapi({ description: 'Title of the object', example: 'Rénovation de la médiathèque' }),
    detail: z.string().optional().openapi({ description: 'What the object is, to display under its title', example: 'Projet' }),
    url: z.string().optional().openapi({
      description: 'Page of the object in its front (`<PROJECT_FRONT_URL>/?project=<id>`, `?project=<project>&task=<id>`, `<CALENDAR_FRONT_URL>/?date=<YYYY-MM-DD>&event=<id>`), absent when `PROJECT_FRONT_URL` / `CALENDAR_FRONT_URL` is not set on the BFF',
      example: 'https://projets.mairie360.fr/projects/12',
    }),
  })).openapi({ description: 'Projects, tasks and events the caller may read whose title matches `q`' }),
  sources: z.object({
    projects: z.enum(['available', 'unavailable']),
    calendar: z.enum(['available', 'unavailable']),
  }).openapi({ description: 'Whether Project API and Calendar API answered: an unavailable source contributes no item' }),
}).openapi({ description: 'What an agent may link a message to after `#`' });

// Body of every error answer, shared by every BFF (`@mairie360/bffs-lib`): `{ error: { code, message, details } }`.
// clone(): the lib builds its schemas on import, before extendZodWithOpenApi() above, and zod 4 only
// adds .openapi() to schemas created after the extension.
export const ErrorResponse = registry.register('ErrorResponse', ErrorResponseSchema.clone());

/**
 * Error responses of an operation, `{ status: description }`, all answered with `ErrorResponse`. An operation
 * answering 502 calls an upstream, whose 429 bffs-lib >= 2.4.0 relays with its Retry-After (MAIR-562): it is
 * declared too unless the operation describes its own.
 */
export function errorResponses(descriptions: Record<number, string>) {
    const declared = 502 in descriptions && !(429 in descriptions)
        ? { ...descriptions, 429: 'An upstream API rate limit is reached: retry after the Retry-After header (seconds)' }
        : descriptions;
    return Object.fromEntries(Object.entries(declared).map(([status, description]) => [status, {
        description,
        content: { 'application/json': { schema: ErrorResponse } },
    }]));
}

registry.register('IdSchema', IdSchema);
registry.register('CurrentUserDtoSchema', CurrentUserDtoSchema);
registry.register('ContactDtoSchema', ContactDtoSchema);
registry.register('ConversationDtoSchema', ConversationDtoSchema);
registry.register('MessageDtoSchema', MessageDtoSchema);
registry.register('AttachmentDtoSchema', AttachmentDtoSchema);
registry.register('MentionDtoSchema', MentionDtoSchema);
registry.register('ConversationsResponse', ConversationsResponse);
registry.register('MessagesResponse', MessagesResponse);
registry.register('ContactsResponse', ContactsResponse);
registry.register('SendMessageResponse', SendMessageResponse);
registry.register('NewDirectMessageResponse', NewDirectMessageResponse);
registry.register('CreateGroupResponse', CreateGroupResponse);
registry.register('DeleteConversationResponse', DeleteConversationResponse);
registry.register('MarkConversationAsReadResponse', MarkConversationAsReadResponse);
registry.register('UploadAttachmentResponse', UploadAttachmentResponse);
registry.register('MessagingBootstrapResponse', MessagingBootstrapResponse);
registry.register('CurrentUserResponse', CurrentUserResponse);
registry.register('SendMessageBody', SendMessageBody);
registry.register('NewDirectMessageBody', NewDirectMessageBody);
registry.register('CreateGroupBody', CreateGroupBody);
registry.register('MarkConversationAsReadBody', MarkConversationAsReadBody);
registry.register('UploadAttachmentBody', UploadAttachmentBody);
registry.register('ConversationsQuery', ConversationsQuery);
registry.register('MessagesQuery', MessagesQuery);
registry.register('ContactsQuery', ContactsQuery);
registry.register('ConversationIdParams', ConversationIdParams);
registry.register('EditMessageBody', EditMessageBody);
registry.register('ReactionBody', ReactionBody);
registry.register('AddMembersBody', AddMembersBody);
registry.register('EditMessageResponse', EditMessageResponse);
registry.register('DeleteMessageResponse', DeleteMessageResponse);
registry.register('ReactionsResponse', ReactionsResponse);
registry.register('MemberDtoSchema', MemberDtoSchema);
registry.register('MembersResponse', MembersResponse);
registry.register('MembersChangeResponse', MembersChangeResponse);
registry.register('SearchMessageItem', SearchMessageItemSchema);
registry.register('SearchPersonItem', SearchPersonItemSchema);
registry.register('ConversationSearchResponse', ConversationSearchResponse);
registry.register('MentionSuggestionsResponse', MentionSuggestionsResponse);
registry.register('LinkSuggestionsResponse', LinkSuggestionsResponse);
registry.register('ReactionDtoSchema', ReactionDtoSchema);
registry.register('MessageLinkDtoSchema', MessageLinkDtoSchema);
registry.register('GroupMentionDtoSchema', GroupMentionDtoSchema);
registry.register('SystemEventDtoSchema', SystemEventDtoSchema);
