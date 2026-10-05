import { authorization } from '@mairie360/bffs-lib';
import {Router, Request, Response} from 'express';
import {
    registry,
    MessagingBootstrapResponse,
    errorResponses,
} from '../../openapi-registry';
import { fetchMessagingBootstrap, upstreamError } from './message_helpers';

const router = Router();

registry.registerPath({
    method: 'get',
    path: '/messaging/bootstrap',
    tags: ['Messaging'],
    summary: 'Récupère les informations de démarrage pour l’utilisateur actuel',
    responses: {
        200: {
            description: 'Informations de démarrage pour l’utilisateur actuel',
            content: {
                'application/json': {
                    schema: MessagingBootstrapResponse,
                },
            },
        },
        ...errorResponses({
            401: 'Missing or invalid session',
            502: 'Message API or Core API is unavailable or failed',
        }),
    },
});

router.get('/', async (req: Request, res: Response) => {
    try {
        res.status(200).json(await fetchMessagingBootstrap(authorization(req)));
    } catch (error) {
        throw upstreamError(error, [401]);
    }
});

export default router;
