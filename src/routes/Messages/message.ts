import { authorization } from '@mairie360/bffs-lib';
import {Router, Request, Response} from 'express';
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
    upstreamError,
    validationError,
} from './message_helpers';

const router = Router();

registry.registerPath({
    method: 'get',
    path: '/conversations/{conversationId}/messages',
    tags: ['Messages'],
    summary: 'Récupère la liste des messages d’une conversation',
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
            502: 'Message API or Core API is unavailable or failed',
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
            502: 'Message API or Core API is unavailable or failed',
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
            502: 'Message API or Core API is unavailable or failed',
        }),
    },
});

router.get('/conversations/:conversationId/messages', async (req: Request, res: Response) => {
    const paramsResult = ConversationIdParams.safeParse(req.params);
    const queryResult = MessagesQuery.safeParse(req.query);

    if (!paramsResult.success) {
        throw validationError('params', paramsResult.error.issues);
    }

    if (!queryResult.success) {
        throw validationError('query', queryResult.error.issues);
    }

    try {
        res.status(200).json(await fetchConversationMessages(paramsResult.data.conversationId, queryResult.data.limit, authorization(req)));
    } catch (error) {
        throw upstreamError(error, [401, 404]);
    }
});

router.post('/conversations/:conversationId/messages', async (req: Request, res: Response) => {
    const paramsResult = ConversationIdParams.safeParse(req.params);
    const bodyResult = SendMessageBody.safeParse(req.body);

    if (!paramsResult.success) {
        throw validationError('params', paramsResult.error.issues);
    }

    if (!bodyResult.success) {
        throw validationError('body', bodyResult.error.issues);
    }

    try {
        res.status(201).json(await sendMessageToConversation(paramsResult.data.conversationId, bodyResult.data.content, authorization(req)));
    } catch (error) {
        throw upstreamError(error, [400, 401, 404]);
    }
});

router.post('/direct-messages', async (req: Request, res: Response) => {
    const bodyResult = NewDirectMessageBody.safeParse(req.body);

    if (!bodyResult.success) {
        throw validationError('body', bodyResult.error.issues);
    }

    try {
        res.status(201).json(await createDirectMessage(bodyResult.data.recipientId, bodyResult.data.message, authorization(req)));
    } catch (error) {
        throw upstreamError(error, [400, 401]);
    }
});

export default router;
