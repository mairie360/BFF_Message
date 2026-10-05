import { Router } from 'express';
import {
    registry,
    MessagingBootstrapResponse,
    errorResponses,
} from '../../openapi-registry';
import { fetchMessagingBootstrap } from './message_helpers';

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
            503: 'Message API or Core API is not configured on the BFF',
        }),
    },
});

router.get('/', async (req, res) => {
    res.status(200).json(await fetchMessagingBootstrap({ req, declared: [401] }));
});

export default router;
