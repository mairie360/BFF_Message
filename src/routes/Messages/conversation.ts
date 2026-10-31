import { parseRequest } from '@mairie360/bffs-lib';
import { Router } from 'express';

import {
    registry,
    ConversationIdParams,
    DeletedConversationIdParams,
    LoadConversationIdParams,
    ConversationsQuery,
    ConversationsResponse,
    LoadConversationResponse,
    MessagesQuery,
    DeleteConversationResponse,
    MarkConversationAsReadBody,
    MarkConversationAsReadResponse,
    errorResponses,
} from '../../openapi-registry';
import {
    deleteConversation,
    fetchConversations,
    loadConversation,
    markConversationAsRead,
} from './message_helpers';

const router = Router();

registry.registerPath({
    method: 'get',
    path: '/conversations',
    tags: ['Conversations'],
    summary: 'Récupère la liste des conversations de l’utilisateur actuel',
    description: 'One page of the caller\'s conversations, newest first (`limit` 1 to 30, default 20; pass `nextCursor` as '
        + '`cursor` for the next page), read with ONE Message API call. Each conversation carries what the list displays: '
        + 'its name (the other participant\'s name for a direct conversation), kind, contact id, member count and unread '
        + 'counter. The members and their names come with `GET /conversations/{conversationId}`. `search` keeps the '
        + 'conversations whose name contains the text, or in which another member\'s name does ("autoroute" finds '
        + '"Projet autoroute", "Xavier Bertrand" finds the direct conversation with him and the groups he belongs to); the '
        + 'pagination applies to the filtered list.',
    request: {
        query: ConversationsQuery,
    },
    responses: {
        200: {
            description: 'Liste des conversations de l’utilisateur actuel',
            content: {
                'application/json': {
                    schema: ConversationsResponse,
                },
            },
        },
        ...errorResponses({
            400: 'Invalid query (details lists the invalid fields)',
            401: 'Missing or invalid session',
            502: 'Message API is unavailable or failed',
            503: 'Message API is not configured on the BFF',
        }),
    },
});

registry.registerPath({
    method: 'get',
    path: '/conversations/{conversationId}',
    tags: ['Conversations'],
    summary: 'Opens a conversation: its members and one page of messages',
    description: 'Everything needed to display one conversation, read with two Message API calls made in parallel '
        + '(the members with their names, and a page of messages with the conversation itself): the conversation '
        + '(name, kind, contact, member count, unread counter), its `participants`, and the latest `limit` messages '
        + '(1 to 100, default 30) oldest first, each with its sender id and, when it answers another message, the '
        + 'quoted message (author and excerpt) also when that message is older than the page. `nextCursor` goes in '
        + '`before` of `GET /conversations/{conversationId}/messages` to load older messages without reloading the members.',
    request: {
        params: LoadConversationIdParams,
        query: MessagesQuery,
    },
    responses: {
        200: {
            description: 'The conversation, its participants and one page of messages',
            content: {
                'application/json': {
                    schema: LoadConversationResponse,
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
    method: 'delete',
    path: '/conversations/{conversationId}',
    tags: ['Conversations'],
    summary: 'Supprime une conversation',
    request: {
        params: DeletedConversationIdParams,
    },
    responses: {
        200: {
            description: 'Conversation supprimée avec succès',
            content: {
                'application/json': {
                    schema: DeleteConversationResponse,
                },
            },
        },
        ...errorResponses({
            400: 'Invalid conversation id',
            401: 'Missing or invalid session',
            403: 'Only an administrator may delete a conversation',
            404: 'Unknown conversation, or the caller is not one of its members',
            502: 'Message API is unavailable or failed',
            503: 'Message API is not configured on the BFF',
        }),
    },
});

registry.registerPath({
  method: 'post',
  path: '/conversations/{conversationId}/read',
  tags: ['Conversations'],
  summary: 'Acknowledges the messages of a conversation as read',
  description: 'Acknowledges every message up to and including `readUntilMessageId` (Message API '
    + '`POST /api/v1/{chat_id}/read/`), or up to the latest message when the body or the id is absent. '
    + 'Later messages stay unread. Acknowledging an empty conversation does nothing and answers `unreadCount: 0`.',
  request: {
    params: ConversationIdParams,
    body: {
      required: false,
      content: {
        'application/json': {
          schema: MarkConversationAsReadBody,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Acknowledgement recorded (or already recorded), with the number of messages still unread by the caller',
      content: {
        'application/json': {
          schema: MarkConversationAsReadResponse,
        },
      },
    },
    ...errorResponses({
      400: 'Invalid conversation id or body (details lists the invalid fields)',
      401: 'Missing or invalid session',
      403: 'The caller may not acknowledge reads in this conversation',
      404: 'Unknown conversation, the caller is not one of its members, or the message is not one of this conversation',
      502: 'Message API is unavailable or failed',
      503: 'Message API is not configured on the BFF',
    }),
  },
});

router.get('/', async (req, res) => {
    const query = parseRequest(ConversationsQuery, req.query, 'query');
    res.status(200).json(await fetchConversations(query.search, query.limit, query.cursor, { req, declared: [401] }));
});

router.get('/:conversationId', async (req, res) => {
    const { conversationId } = parseRequest(ConversationIdParams, req.params, 'params');
    const query = parseRequest(MessagesQuery, req.query, 'query');
    res.status(200).json(await loadConversation(conversationId, query, { req, declared: [401, 404] }));
});

router.delete('/:conversationId', async (req, res) => {
    const { conversationId } = parseRequest(ConversationIdParams, req.params, 'params');
    await deleteConversation(conversationId, { req, declared: [401, 403, 404] });
    res.status(200).json({ deleted: true, conversationId });
});

router.post('/:conversationId/read', async (req, res) => {
    // requireSession (routes/Messages/index.ts) already answered 401 to an anonymous caller. Invalid input
    // is refused before any upstream call; the body is optional.
    const { conversationId } = parseRequest(ConversationIdParams, req.params, 'params');
    const { readUntilMessageId } = parseRequest(MarkConversationAsReadBody, req.body ?? {}, 'body');

    res.status(200).json(await markConversationAsRead(conversationId, readUntilMessageId, { req, declared: [401, 403, 404] }));
});

export default router;
