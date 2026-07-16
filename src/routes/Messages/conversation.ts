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
import {
    deleteConversation,
    fetchConversations,
    handleUnknownError,
    markConversationAsRead,
    sendValidationError,
} from './message_helpers';

const router = Router();

registry.registerPath({
    method: 'get',
    path: '/conversations',
    tags: ['Conversations'],
    summary: 'Récupère la liste des conversations de l’utilisateur actuel',
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
    request: {
        params: ConversationIdParams,
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
    const queryResult = ConversationsQuery.safeParse(req.query);

    if (!queryResult.success) {
        return sendValidationError(res, queryResult.error.issues);
    }

    try {
        const conversations = await fetchConversations(
            queryResult.data.search,
            queryResult.data.limit,
            req.headers.authorization,
        );
        return res.status(200).json({ conversations });
    } catch (error) {
        return handleUnknownError(res, error);
    }
});

router.delete('/:conversationId', async (req: Request, res: Response) => {
    const paramsResult = ConversationIdParams.safeParse(req.params);

    if (!paramsResult.success) {
        return sendValidationError(res, paramsResult.error.issues);
    }

    try {
        await deleteConversation(paramsResult.data.conversationId, req.headers.authorization);
        return res.status(200).json({
            deleted: true,
            conversationId: paramsResult.data.conversationId,
        });
    } catch (error) {
        return handleUnknownError(res, error);
    }
});

router.post('/:conversationId/read', async (req: Request, res: Response) => {
    const paramsResult = ConversationIdParams.safeParse(req.params);
    const bodyResult = MarkConversationAsReadBody.safeParse(req.body);

    if (!paramsResult.success) {
        return sendValidationError(res, paramsResult.error.issues);
    }

    if (!bodyResult.success) {
        return sendValidationError(res, bodyResult.error.issues);
    }

    try {
        const result = await markConversationAsRead(paramsResult.data.conversationId);
        return res.status(200).json(result);
    } catch (error) {
        return handleUnknownError(res, error);
    }
});

export default router;
