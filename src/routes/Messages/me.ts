import { authorization } from '@mairie360/bffs-lib';
import { Router, Request, Response } from 'express';
import {
    CurrentUserResponse,
    errorResponses,
    registry,
} from '../../openapi-registry';
import { getCurrentUser, upstreamError } from './message_helpers';

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
        ...errorResponses({
            401: 'Missing or invalid session',
            502: 'Core API is unavailable or failed',
            503: 'Core API is not configured on the BFF',
        }),
    },
});

router.get('/', async (req: Request, res: Response) => {
    try {
        res.status(200).json(await getCurrentUser(authorization(req)));
    } catch (error) {
        throw upstreamError(error, [401]);
    }
});

// Profile edits are not served here: they go through BFF_Settings (PATCH /settings/profile) → Core_API (PATCH /api/v1/user/me).

export default router;
