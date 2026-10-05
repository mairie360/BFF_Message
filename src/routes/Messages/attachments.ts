import { authorization } from '@mairie360/bffs-lib';
import {Router, Request, Response} from 'express';
import {
    registry,
    UploadAttachmentBody,
    errorResponses,
} from '../../openapi-registry';
import { fetchCurrentUser, HttpError, upstreamError } from './message_helpers';

const router = Router();

registry.registerPath({
    method: 'post',
    path: '/attachments',
    tags: ['Attachments'],
    summary: 'Upload an attachment (not available yet: no attachment storage exists upstream)',
    description: 'Message API has no attachment storage yet. Rather than answering ids of files that are '
        + 'stored nowhere, the operation answers 503 to an authenticated caller; `attachmentIds` is likewise '
        + 'refused on `POST /conversations/{conversationId}/messages`.',
    request: {
        body: {
            required: true,
            content: {
                'multipart/form-data': {
                    schema: UploadAttachmentBody,
                },
            },
        },
    },
    responses: {
        ...errorResponses({
            401: 'Missing or invalid session',
            503: 'Attachment upload is not available yet: nothing was stored',
            502: 'Core API is unavailable or failed',
        }),
    },
});

router.post('/', async (req: Request, _res: Response) => {
    // The session is resolved against Core API (which verifies the token) before answering.
    try {
        await fetchCurrentUser(authorization(req));
    } catch (error) {
        throw upstreamError(error, [401]);
    }

    // No upstream stores attachments yet: answering made-up ids would let the front believe a file
    // was kept (MAIR-400).
    throw new HttpError(503, 'Attachment upload is not available yet');
});

export default router;
