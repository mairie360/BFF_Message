import { parseRequest } from '@mairie360/bffs-lib';
import { Router } from 'express';
import {
    registry,
    ContactsQuery,
    ContactsResponse,
    errorResponses,
} from '../../openapi-registry';
import { fetchContacts } from './message_helpers';

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
            503: 'Core API is not configured on the BFF',
        }),
    },
});

router.get('/', async (req, res) => {
    const query = parseRequest(ContactsQuery, req.query, 'query');
    const contacts = await fetchContacts(query.search, query.limit, { req, declared: [401] });
    res.status(200).json({ contacts });
});

export default router;
