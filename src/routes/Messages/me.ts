import { Router, Request, Response } from 'express';
import {
    ApiErrorResponse,
    CurrentUserResponse,
    registry,
} from '../../openapi-registry';
import { getCurrentUser, handleUnknownError } from './message_helpers';

const router = Router();

registry.registerPath({
    method: 'get',
    path: '/me',
    tags: ['Profile'],
    summary: 'Récupère le profil de l’utilisateur actuel',
    responses: {
        200: {
            description: 'Profil utilisateur actuel',
            content: {
                'application/json': {
                    schema: CurrentUserResponse,
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

router.get('/', (req: Request, res: Response) => {
    getCurrentUser(req.headers.authorization)
        .then((user) => res.status(200).json(user))
        .catch((error) => handleUnknownError(res, error));
});

// Profile edits are not served here: they go through BFF_user / Core_API (PATCH /api/v1/user/me).

export default router;
