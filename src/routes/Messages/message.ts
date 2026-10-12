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
    SendMessageResponse,
    errorResponses,
} from '../../openapi-registry';
import {
    createDirectMessage,
    fetchConversationMessages,
    sendMessageToConversation,
} from './message_helpers';

const router = Router();

registry.registerPath({
    method: 'get',
    path: '/conversations/{conversationId}/messages',
    tags: ['Messages'],
    summary: 'Récupère la liste des messages d’une conversation',
    description: 'One page of messages, oldest first (`limit` 1 to 100, default 30), with the conversation: `nextCursor` goes in '
        + '`before` for the older page. The whole history is never read. The author names come from the members of the '
        + 'conversation (one Message API call, no Core API call); `GET /conversations/{conversationId}` returns them with the first page.',
    request: {
        params: ConversationIdParams,
        query: MessagesQuery,
    },
    responses: {
        200: {
            description: 'Liste des messages de la conversation',
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
    summary: 'Crée un nouveau message dans une conversation',
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
            description: 'Message créé avec succès',
            content: {
                'application/json': {
                    schema: SendMessageResponse,
                },
            },
        },
        ...errorResponses({
            400: 'Invalid conversation id or body (details lists the invalid fields)',
            401: 'Missing or invalid session',
            404: 'Unknown conversation, or the caller is not one of its members',
            502: 'Message API is unavailable or failed',
            503: 'Message API is not configured on the BFF',
        }),
    },
});

registry.registerPath({
    method: 'post',
    path: '/direct-messages',
    tags: ['Messages'],
    summary: 'Crée un nouveau message direct',
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
            description: 'Message direct créé avec succès',
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
    res.status(201).json(await sendMessageToConversation(conversationId, body.content, { req, declared: [400, 401, 404] }));
});

router.post('/direct-messages', async (req, res) => {
    const body = parseRequest(NewDirectMessageBody, req.body, 'body');
    res.status(201).json(await createDirectMessage(body.recipientId, body.message, { req, declared: [400, 401] }));
});

export default router;
