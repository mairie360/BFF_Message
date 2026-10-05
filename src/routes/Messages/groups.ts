import { parseRequest } from '@mairie360/bffs-lib';
import { Router } from 'express';
import {
    registry,
    CreateGroupBody,
    CreateGroupResponse,
    errorResponses,
} from '../../openapi-registry';
import { createGroupConversation } from './message_helpers';

const router = Router();

registry.registerPath({
    method: 'post',
    path: '/groups',
    tags: ['Groups'],
    summary: 'Crée un nouveau groupe',
    request: {
        body: {
            required: true,
            content: {
                'application/json': {
                    schema: CreateGroupBody,
                },
            },
        },
    },
    responses: {
        201: {
            description: 'Groupe créé avec succès',
            content: {
                'application/json': {
                    schema: CreateGroupResponse,
                },
            },
        },
        ...errorResponses({
            400: 'Invalid body (details lists the invalid fields)',
            401: 'Missing or invalid session',
            502: 'Message API is unavailable or failed',
            503: 'Message API is not configured on the BFF',
        }),
    },
});

router.post('/', async (req, res) => {
    const body = parseRequest(CreateGroupBody, req.body, 'body');
    const conversation = await createGroupConversation(body.name, body.memberIds, { req, declared: [400, 401] });
    res.status(201).json({ conversation });
});

export default router;
