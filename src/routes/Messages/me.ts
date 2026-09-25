import { Router, Request, Response } from 'express';
import {
    ApiErrorResponse,
    CurrentUserResponse,
    registry,
    UpdateCurrentUserBody,
    UpdateCurrentUserResponse,
} from '../../openapi-registry';
import { getAuthorizationHeader } from '../../config/token';
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
        401: {
            description: 'Unauthenticated user',
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
    if (!getAuthorizationHeader(req.headers.authorization)) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const bodyResult = UpdateCurrentUserBody.safeParse(req.body);

    if (!bodyResult.success) {
        return sendValidationError(res, bodyResult.error.issues);
    }

    return updateCurrentUser(bodyResult.data, req.headers.authorization)
        .then((result) => res.status(200).json(result))
        .catch((error) => handleUnknownError(res, error));
});

export default router;
