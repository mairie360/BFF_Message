import {Router, Request, Response} from 'express';
import {
    registry,
    ContactsQuery,
    ContactsResponse,
    errorResponses,
} from '../../openapi-registry';
import { getAuthorizationHeader } from '../../config/token';
import { fetchContacts, HttpError, upstreamError, validationError } from './message_helpers';

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
    if (!getAuthorizationHeader(req.headers.authorization)) {
        throw new HttpError(401, 'Authentication required');
    }

    const queryResult = ContactsQuery.safeParse(req.query);

    if (!queryResult.success) {
        throw validationError('query', queryResult.error.issues);
    }

    try {
        const contacts = await fetchContacts(queryResult.data.search, queryResult.data.limit, req.headers.authorization);
        res.status(200).json({ contacts });
    } catch (error) {
        throw upstreamError(error, [401]);
    }
});

export default router;
