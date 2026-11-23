import { parseRequest } from '@mairie360/bffs-lib';
import { Router } from 'express';
import {
    registry,
    MessagesQuery,
    MessagesResponse,
    NewDirectMessageBody,
    NewDirectMessageResponse,
    ConversationIdParams,
    WrittenConversationIdParams,
    SendMessageBody,
    EditMessageBody,
    EditMessageResponse,
    EditedMessageParams,
    DeletedMessageParams,
    DeleteMessageResponse,
    ReactionBody,
    ReactionQuery,
    ReactionsResponse,
    SendMessageResponse,
    errorResponses,
} from '../../openapi-registry';
import {
    createDirectMessage,
    deleteMessage,
    editMessage,
    reactToMessage,
    fetchConversationMessages,
    sendMessageToConversation,
} from './message_helpers';

const router = Router();

registry.registerPath({
    method: 'get',
    path: '/conversations/{conversationId}/messages',
    tags: ['Messages'],
    summary: 'List the messages of a conversation',
    description: 'One page of messages, oldest first (`limit` 1 to 100, default 30), with the conversation: `nextCursor` goes in '
        + '`before` for the older page. The whole history is never read. The author names come from the members of the '
        + 'conversation (one Message API call, no Core API call); `GET /conversations/{conversationId}` returns them with the first page.',
    request: {
        params: ConversationIdParams,
        query: MessagesQuery,
    },
    responses: {
        200: {
            description: 'Messages of the conversation',
            content: {
                'application/json': {
                    schema: MessagesResponse,
                },
            },
        },
        ...errorResponses({
            400: 'Invalid conversation id or query (details lists the invalid fields)',
            401: 'Missing or invalid session',
            404: 'Unknown conversation, or the caller is not one of its members',
            502: 'Message API is unavailable or failed',
            503: 'Message API is not configured on the BFF',
        }),
    },
});

registry.registerPath({
    method: 'post',
    path: '/conversations/{conversationId}/messages',
    tags: ['Messages'],
    summary: 'Create a new message in a conversation',
    request: {
        params: WrittenConversationIdParams,
        body: {
            required: true,
            content: {
                'application/json': {
                    schema: SendMessageBody,
                },
            },
        },
    },
    responses: {
        201: {
            description: 'Message created',
            content: {
                'application/json': {
                    schema: SendMessageResponse,
                },
            },
        },
        ...errorResponses({
            400: 'Invalid conversation id or body (details lists the invalid fields), or Message API refused a tag: a mention of a non-member, '
                + 'a group no member belongs to, an object the caller may not read, or `replyTo` a message of another conversation',
            401: 'Missing or invalid session',
            403: 'The caller is a platform administrator who is not a member of the conversation',
            404: 'Unknown conversation, or the caller is not one of its members',
            502: 'Message API is unavailable or failed',
            503: 'Message API is not configured on the BFF',
        }),
    },
});

registry.registerPath({
    method: 'patch',
    path: '/conversations/{conversationId}/messages/{messageId}',
    tags: ['Messages'],
    summary: 'Edit a message',
    description: 'The author edits the content of their message (administrators included: nobody edits someone else\'s message). '
        + 'Each tag field present (`mentionIds`, `mentionEveryone`, `groupMentionIds`, `links`) replaces those tags; an absent one keeps them. '
        + 'The answer carries `editedAt`. The other members get a `MSG_EDITED` stream event, and a newly mentioned member a `mentioned` one.',
    request: {
        params: EditedMessageParams,
        body: { required: true, content: { 'application/json': { schema: EditMessageBody } } },
    },
    responses: {
        200: { description: 'The message as it now reads', content: { 'application/json': { schema: EditMessageResponse } } },
        ...errorResponses({
            400: 'Invalid ids or body (details lists the invalid fields), a tag Message API refused, or the message is a system note',
            401: 'Missing or invalid session',
            403: 'The message was written by someone else',
            404: 'Unknown conversation or message (or a deleted one), or the caller is not one of its members',
            502: 'Message API is unavailable or failed',
            503: 'Message API is not configured on the BFF',
        }),
    },
});

registry.registerPath({
    method: 'delete',
    path: '/conversations/{conversationId}/messages/{messageId}',
    tags: ['Messages'],
    summary: 'Delete a message',
    description: 'Deletes a message (its author, or a platform administrator moderating): it stays in the history as a tombstone, '
        + 'answered here with `deleted: true`, an empty content and no tag nor reaction. The other members get a `MSG_DELETED` stream event.',
    request: { params: DeletedMessageParams },
    responses: {
        200: { description: 'The deleted message (tombstone)', content: { 'application/json': { schema: DeleteMessageResponse } } },
        ...errorResponses({
            400: 'Invalid ids, or the message is a system note',
            401: 'Missing or invalid session',
            403: 'The message was written by another member and the caller is not an administrator',
            404: 'Unknown conversation or message, a message already deleted, or the caller is not one of its members',
            502: 'Message API is unavailable or failed',
            503: 'Message API is not configured on the BFF',
        }),
    },
});

registry.registerPath({
    method: 'post',
    path: '/conversations/{conversationId}/messages/{messageId}/reactions',
    tags: ['Messages'],
    summary: 'React to a message',
    description: 'Adds the caller\'s reaction with `emoji` (nothing changes when it is already there) and answers every reaction of '
        + 'the message. Members only. The other members get a `message_reacted` stream event.',
    request: {
        params: EditedMessageParams,
        body: { required: true, content: { 'application/json': { schema: ReactionBody } } },
    },
    responses: {
        200: { description: 'The reactions of the message', content: { 'application/json': { schema: ReactionsResponse } } },
        ...errorResponses({
            400: 'Invalid ids or emoji (details lists the invalid fields), or the message is a system note',
            401: 'Missing or invalid session',
            403: 'The caller is a platform administrator who is not a member of the conversation',
            404: 'Unknown conversation or message (or a deleted one), or the caller is not one of its members',
            502: 'Message API is unavailable or failed',
            503: 'Message API is not configured on the BFF',
        }),
    },
});

registry.registerPath({
    method: 'delete',
    path: '/conversations/{conversationId}/messages/{messageId}/reactions',
    tags: ['Messages'],
    summary: 'Remove a reaction to a message',
    description: 'Removes the caller\'s reaction with `emoji` and answers the reactions left. Members only.',
    request: { params: EditedMessageParams, query: ReactionQuery },
    responses: {
        200: { description: 'The reactions left on the message', content: { 'application/json': { schema: ReactionsResponse } } },
        ...errorResponses({
            400: 'Invalid ids or emoji (details lists the invalid fields)',
            401: 'Missing or invalid session',
            403: 'The caller is a platform administrator who is not a member of the conversation',
            404: 'Unknown conversation or message, or the caller had not reacted with this emoji',
            502: 'Message API is unavailable or failed',
            503: 'Message API is not configured on the BFF',
        }),
    },
});

registry.registerPath({
    method: 'post',
    path: '/direct-messages',
    tags: ['Messages'],
    summary: 'Create a new direct message',
    request: {
        body: {
            required: true,
            content: {
                'application/json': {
                    schema: NewDirectMessageBody,
                },
            },
        },
    },
    responses: {
        201: {
            description: 'Direct message created',
            content: {
                'application/json': {
                    schema: NewDirectMessageResponse,
                },
            },
        },
        ...errorResponses({
            400: 'Invalid body (details lists the invalid fields)',
            401: 'Missing or invalid session',
            502: 'Message API is unavailable or failed',
            503: 'Message API is not configured on the BFF',
        }),
    },
});

router.get('/conversations/:conversationId/messages', async (req, res) => {
    const { conversationId } = parseRequest(ConversationIdParams, req.params, 'params');
    const query = parseRequest(MessagesQuery, req.query, 'query');
    res.status(200).json(await fetchConversationMessages(conversationId, query, { req, declared: [401, 404] }));
});

router.post('/conversations/:conversationId/messages', async (req, res) => {
    const { conversationId } = parseRequest(ConversationIdParams, req.params, 'params');
    const body = parseRequest(SendMessageBody, req.body, 'body');
    const { content, ...tags } = body;
    res.status(201).json(await sendMessageToConversation(conversationId, content, { req, declared: [400, 401, 403, 404] }, tags));
});

const MessageParams = EditedMessageParams;

router.patch('/conversations/:conversationId/messages/:messageId', async (req, res) => {
    const { conversationId, messageId } = parseRequest(MessageParams, req.params, 'params');
    const { content, ...tags } = parseRequest(EditMessageBody, req.body, 'body');
    res.status(200).json(await editMessage(conversationId, messageId, content, tags, { req, declared: [400, 401, 403, 404] }));
});

router.delete('/conversations/:conversationId/messages/:messageId', async (req, res) => {
    const { conversationId, messageId } = parseRequest(MessageParams, req.params, 'params');
    res.status(200).json(await deleteMessage(conversationId, messageId, { req, declared: [400, 401, 403, 404] }));
});

router.post('/conversations/:conversationId/messages/:messageId/reactions', async (req, res) => {
    const { conversationId, messageId } = parseRequest(MessageParams, req.params, 'params');
    const { emoji } = parseRequest(ReactionBody, req.body, 'body');
    res.status(200).json(await reactToMessage(conversationId, messageId, emoji, 'add', { req, declared: [400, 401, 403, 404] }));
});

router.delete('/conversations/:conversationId/messages/:messageId/reactions', async (req, res) => {
    const { conversationId, messageId } = parseRequest(MessageParams, req.params, 'params');
    const { emoji } = parseRequest(ReactionQuery, req.query, 'query');
    res.status(200).json(await reactToMessage(conversationId, messageId, emoji, 'remove', { req, declared: [400, 401, 403, 404] }));
});

router.post('/direct-messages', async (req, res) => {
    const body = parseRequest(NewDirectMessageBody, req.body, 'body');
    res.status(201).json(await createDirectMessage(body.recipientId, body.message, { req, declared: [400, 401] }));
});

export default router;
