import {Router, Request, Response} from 'express';
import {
    registry,
    MessagesQuery,
    MessagesResponse,
    NewDirectMessageBody,
    NewDirectMessageResponse,
    ConversationIdParams,
    ApiErrorResponse,
} from '../../openapi-registry';

const router = Router();

registry.registerPath({
    method: 'get',
    path: '/conversations/{conversationId}/messages',
    tags: ['Messages'],
    summary: 'Récupère la liste des messages d’une conversation',
    params: ConversationIdParams,
    query: MessagesQuery,
    responses: {
        200: {
            description: 'Liste des messages de la conversation',
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
    path: '/conversations/{conversationId}/messages',
    tags: ['Messages'],
    summary: 'Crée un nouveau message dans une conversation',
    params: ConversationIdParams,
    request: {
        body: {
            required: true,
            content: {
                'application/json': {
                    schema: MessagesResponse,
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

router.get('/:conversationId/messages', (req: Request, res: Response) => {
    // Implementation
});

router.post('/:conversationId/messages', (req: Request, res: Response) => {
    // Implementation
});

router.post('/', (req: Request, res: Response) => {
    // Implementation
});

export default router;