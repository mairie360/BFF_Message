import { parseRequest } from '@mairie360/bffs-lib';
import { Router } from 'express';

import {
    registry,
    ConversationIdParams,
    DeletedConversationIdParams,
    ConversationsQuery,
    ConversationsResponse,
    DeleteConversationResponse,
    MarkConversationAsReadBody,
    MarkConversationAsReadResponse,
    errorResponses,
} from '../../openapi-registry';
import {
    deleteConversation,
    fetchConversations,
    fetchCurrentUser,
    markConversationAsRead,
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
        ...errorResponses({
            400: 'Invalid query (details lists the invalid fields)',
            401: 'Missing or invalid session',
            502: 'Message API or Core API is unavailable or failed',
            503: 'Message API or Core API is not configured on the BFF',
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
  summary: 'Marquer une conversation comme lue (indisponible tant que la persistance amont manque)',
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
      description: 'Conversation mise à jour après persistance amont (fonctionnalité à venir)',
      content: {
        'application/json': {
          schema: MarkConversationAsReadResponse,
        },
      },
    },
    ...errorResponses({
      400: 'Invalid conversation id or body (details lists the invalid fields)',
      401: 'Missing or invalid session',
      502: 'Core API is unavailable or failed',
      503: 'Read acknowledgement unavailable: nothing was persisted (also when Core API is not configured)',
    }),
  },
});

router.get('/', async (req, res) => {
    const query = parseRequest(ConversationsQuery, req.query, 'query');
    const conversations = await fetchConversations(query.search, query.limit, { req, declared: [401] });
    res.status(200).json({ conversations });
});

router.delete('/:conversationId', async (req, res) => {
    const { conversationId } = parseRequest(ConversationIdParams, req.params, 'params');
    await deleteConversation(conversationId, { req, declared: [401, 403, 404] });
    res.status(200).json({ deleted: true, conversationId });
});

router.post('/:conversationId/read', async (req, res) => {
    // requireBearer (routes/Messages/index.ts) already answered 401 to an anonymous caller, before the
    // 503 of the missing upstream operation. Invalid input is refused before the session is resolved
    // against Core API (which verifies the token), so it costs no upstream call.
    const { conversationId } = parseRequest(ConversationIdParams, req.params, 'params');
    parseRequest(MarkConversationAsReadBody, req.body, 'body');

    await fetchCurrentUser({ req, declared: [401] });

    res.status(200).json(await markConversationAsRead(conversationId));
});

export default router;
