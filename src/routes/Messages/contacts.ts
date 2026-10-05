import { authorization } from '@mairie360/bffs-lib';
import {Router, Request, Response} from 'express';
import {
    registry,
    ContactsQuery,
    ContactsResponse,
    errorResponses,
} from '../../openapi-registry';
import { fetchContacts, upstreamError, validationError } from './message_helpers';

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
        ...errorResponses({
            400: 'Invalid query (details lists the invalid fields)',
            401: 'Missing or invalid session',
            502: 'Core API is unavailable or failed',
        }),
    },
});

router.get('/', async (req: Request, res: Response) => {

    const queryResult = ContactsQuery.safeParse(req.query);

    if (!queryResult.success) {
        throw validationError('query', queryResult.error.issues);
    }

    try {
        const contacts = await fetchContacts(queryResult.data.search, queryResult.data.limit, authorization(req));
        res.status(200).json({ contacts });
    } catch (error) {
        throw upstreamError(error, [401]);
    }
});

export default router;
