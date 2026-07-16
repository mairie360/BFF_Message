import { Router, Request, Response } from 'express';
import {
    ApiErrorResponse,
    CurrentUserResponse,
    registry,
    UpdateCurrentUserBody,
    UpdateCurrentUserResponse,
} from '../../openapi-registry';
import { getCurrentUser, sendValidationError, updateCurrentUser, handleUnknownError } from './message_helpers';

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

registry.registerPath({
    method: 'patch',
    path: '/me',
    tags: ['Profile'],
    summary: 'Met à jour les champs éditables du profil utilisateur',
    request: {
        body: {
            required: true,
            content: {
                'application/json': {
                    schema: UpdateCurrentUserBody,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Profil utilisateur mis à jour',
            content: {
                'application/json': {
                    schema: UpdateCurrentUserResponse,
                },
            },
        },
        400: {
            description: 'Payload invalide',
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

router.patch('/', (req: Request, res: Response) => {
    const bodyResult = UpdateCurrentUserBody.safeParse(req.body);

    if (!bodyResult.success) {
        return sendValidationError(res, bodyResult.error.issues);
    }

    return res.status(200).json(updateCurrentUser(bodyResult.data));
});

export default router;
