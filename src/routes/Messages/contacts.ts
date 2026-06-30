import {Router, Request, Response} from 'express';
import {
    registry,
    ContactsQuery,
    ContactsResponse,
    ApiErrorResponse,
} from '../../openapi-registry';

const router = Router();

registry.registerPath({
    method: 'get',
    path: '/contacts',
    tags: ['Contacts'],
    summary: 'Récupère la liste des contacts',
    query: ContactsQuery,
    responses: {
        200: {
            description: 'Liste des contacts',
            content: {
                'application/json': {
                    schema: ContactsResponse,
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
    // Implementation
});
