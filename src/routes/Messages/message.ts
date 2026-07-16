import {Router, Request, Response} from 'express';
import {
    registry,
    MessagesQuery,
    MessagesResponse,
    NewDirectMessageBody,
    NewDirectMessageResponse,
    ConversationIdParams,
    SendMessageBody,
    SendMessageResponse,
    ApiErrorResponse,
} from '../../openapi-registry';
import {
    createDirectMessage,
    fetchConversationMessages,
    handleUnknownError,
    sendMessageToConversation,
    sendValidationError,
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
                    schema: SendMessageBody,
                },
            },
        },
        401: {
            description: 'Utilisateur non authentifié',
            content: {
                'application/json': {
                    schema: ApiErrorResponse,
                },
            },
        },
    },
});

registry.registerPath({
    method: 'post',
    path: '/conversations/{conversationId}/messages',
    tags: ['Messages'],
    summary: 'Crée un nouveau message dans une conversation',
    request: {
        params: ConversationIdParams,
        body: {
            required: true,
            content: {
                'application/json': {
                    schema: SendMessageResponse,
                },
            },
        },
    },
    responses: {
        201: {
            description: 'Message créé avec succès',
            content: {
                'application/json': {
                    schema: MessagesResponse,
                },
            },
        },
        401: {
            description: 'Utilisateur non authentifié',
            content: {
                'application/json': {
                    schema: ApiErrorResponse,
                },
            },
        },
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
        401: {
            description: 'Utilisateur non authentifié',
            content: {
                'application/json': {
                    schema: ApiErrorResponse,
                },
            },
        },
    },
});

router.get('/conversations/:conversationId/messages', (req: Request, res: Response) => {
    const paramsResult = ConversationIdParams.safeParse(req.params);
    const queryResult = MessagesQuery.safeParse(req.query);

    if (!paramsResult.success) {
        return sendValidationError(res, paramsResult.error.issues);
    }

    if (!queryResult.success) {
        return sendValidationError(res, queryResult.error.issues);
    }

    fetchConversationMessages(paramsResult.data.conversationId, queryResult.data.limit, req.headers.authorization)
        .then((result) => res.status(200).json(result))
        .catch((error) => handleUnknownError(res, error));
});

router.post('/conversations/:conversationId/messages', (req: Request, res: Response) => {
    const paramsResult = ConversationIdParams.safeParse(req.params);
    const bodyResult = SendMessageBody.safeParse(req.body);

    if (!paramsResult.success) {
        return sendValidationError(res, paramsResult.error.issues);
    }

    if (!bodyResult.success) {
        return sendValidationError(res, bodyResult.error.issues);
    }

    sendMessageToConversation(paramsResult.data.conversationId, bodyResult.data.content, req.headers.authorization)
        .then((result) => res.status(201).json(result))
        .catch((error) => handleUnknownError(res, error));
});

router.post('/direct-messages', (req: Request, res: Response) => {
    const bodyResult = NewDirectMessageBody.safeParse(req.body);

    if (!bodyResult.success) {
        return sendValidationError(res, bodyResult.error.issues);
    }

    createDirectMessage(bodyResult.data.recipientId, bodyResult.data.message, req.headers.authorization)
        .then((result) => res.status(201).json(result))
        .catch((error) => handleUnknownError(res, error));
});

export default router;
