import {Router, Request, Response} from 'express';
import {
    registry,
    CreateGroupBody,
    CreateGroupResponse,
    ConversationDtoSchema,
    ApiErrorResponse,
} from '../../openapi-registry';
import {
    createGroupConversation,
    handleUnknownError,
    sendValidationError,
} from './message_helpers';

const router = Router();

registry.registerPath({
    method: 'post',
    path: '/groups',
    tags: ['Groups'],
    summary: 'Crée un nouveau groupe',
    request: {
        body: {
            required: true,
            content: {
                'application/json': {
                    schema: CreateGroupBody,
                },
            },
        },
    },
    responses: {
        201: {
            description: 'Groupe créé avec succès',
            content: {
                'application/json': {
                    schema: CreateGroupResponse,
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

router.post('/', (req: Request, res: Response) => {
    const bodyResult = CreateGroupBody.safeParse(req.body);

    if (!bodyResult.success) {
        return sendValidationError(res, bodyResult.error.issues);
    }

    createGroupConversation(bodyResult.data.name, bodyResult.data.memberIds)
        .then((conversation) => res.status(201).json({ conversation }))
        .catch((error) => handleUnknownError(res, error));
});

export default router;
