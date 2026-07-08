import {Router, Request, Response} from 'express';
import {
    registry,
    ContactsQuery,
    ContactsResponse,
    ApiErrorResponse,
} from '../../openapi-registry';
import { fetchContacts, handleUnknownError, sendValidationError } from './message_helpers';

const router = Router();

registry.registerPath({
    method: 'get',
    path: '/contacts',
    tags: ['Contacts'],
    summary: 'Récupère la liste des contacts',
    request: {
        query: ContactsQuery,
    },
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
    const queryResult = ContactsQuery.safeParse(req.query);

    if (!queryResult.success) {
        return sendValidationError(res, queryResult.error.issues);
    }

    fetchContacts(queryResult.data.search, queryResult.data.limit)
        .then((contacts) => res.status(200).json({ contacts }))
        .catch((error) => handleUnknownError(res, error));
});

export default router;
