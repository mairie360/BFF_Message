import {Router, Request, Response} from 'express';
import {
    registry,
    MessagingBootstrapResponse,
    ApiErrorResponse,
} from '../../openapi-registry';
import { fetchMessagingBootstrap, handleUnknownError } from './message_helpers';

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
    fetchMessagingBootstrap(req.headers.authorization)
        .then((bootstrap) => res.status(200).json(bootstrap))
        .catch((error) => handleUnknownError(res, error));
});

export default router;
