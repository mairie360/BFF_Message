import {Router, Request, Response} from 'express';

import {
    registry,
    ConversationIdParams,
    ConversationsQuery,
    ConversationsResponse,
    DeleteConversationResponse,
    MarkConversationAsReadBody,
    MarkConversationAsReadResponse,
    ApiErrorResponse,
} from '../../openapi-registry';

const router = Router();

registry.registerPath({
    method: 'get',
    path: '/conversations',
    tags: ['Conversations'],
    summary: 'Récupère la liste des conversations de l’utilisateur actuel',
    query: ConversationsQuery,
    responses: {
        200: {
            description: 'Liste des conversations de l’utilisateur actuel',
            content: {
                'application/json': {
                    schema: ConversationsResponse,
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
    method: 'delete',
    path: '/conversations/{conversationId}',
    tags: ['Conversations'],
    summary: 'Supprime une conversation',
    params: ConversationIdParams,
    responses: {
        200: {
            description: 'Conversation supprimée avec succès',
            content: {
                'application/json': {
                    schema: DeleteConversationResponse,
                },
            },
        },
    },
});

registry.registerPath({
  method: 'post',
  path: '/conversations/{conversationId}/read',
  tags: ['Conversations'],
  summary: 'Marquer une conversation comme lue',
  request: {
    params: ConversationIdParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: MarkConversationAsReadBody,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'Conversation mise à jour',
      content: {
        'application/json': {
          schema: MarkConversationAsReadResponse,
        },
      },
    },
  },
});

router.get('/', async (req: Request, res: Response) => {
    // Implémentation de la récupération des conversations
});

router.delete('/:conversationId', async (req: Request, res: Response) => {
    // Implémentation de la suppression d'une conversation
});

router.post('/:conversationId/read', async (req: Request, res: Response) => {
    // Implémentation de la mise à jour de l'état de lecture d'une conversation
});

export default router;