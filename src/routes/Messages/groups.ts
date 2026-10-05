import { authorization } from '@mairie360/bffs-lib';
import {Router, Request, Response} from 'express';
import {
    registry,
    CreateGroupBody,
    CreateGroupResponse,
    errorResponses,
} from '../../openapi-registry';
import {
    createGroupConversation,
    upstreamError,
    validationError,
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
        ...errorResponses({
            400: 'Invalid body (details lists the invalid fields)',
            401: 'Missing or invalid session',
            502: 'Message API is unavailable or failed',
        }),
    },
});

router.post('/', async (req: Request, res: Response) => {
    const bodyResult = CreateGroupBody.safeParse(req.body);

    if (!bodyResult.success) {
        throw validationError('body', bodyResult.error.issues);
    }

    try {
        const conversation = await createGroupConversation(bodyResult.data.name, bodyResult.data.memberIds, authorization(req));
        res.status(201).json({ conversation });
    } catch (error) {
        throw upstreamError(error, [400, 401]);
    }
});

export default router;
