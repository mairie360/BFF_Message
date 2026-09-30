import {Router, Request, Response} from 'express';
import {
    registry,
    UploadAttachmentBody,
    UploadAttachmentResponse,
    errorResponses,
} from '../../openapi-registry';
import { getAuthorizationHeader } from '../../config/token';
import { fetchCurrentUser, HttpError, uploadAttachment, upstreamError } from './message_helpers';

const router = Router();

registry.registerPath({
    method: 'post',
    path: '/attachments',
    tags: ['Attachments'],
    summary: 'Télécharge une pièce jointe',
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
        201: {
            description: 'Pièce jointe téléchargée avec succès',
            content: {
                'application/json': {
                    schema: UploadAttachmentResponse,
                },
            },
        },
        ...errorResponses({
            401: 'Missing or invalid session',
            502: 'Core API is unavailable or failed',
        }),
    },
});

router.post('/', async (req: Request, res: Response) => {
    if (!getAuthorizationHeader(req.headers.authorization)) {
        throw new HttpError(401, 'Authentication required');
    }

    // The session is resolved against Core API (which verifies the token) before accepting any file.
    try {
        await fetchCurrentUser(req.headers.authorization);
    } catch (error) {
        throw upstreamError(error, [401]);
    }
    return res.status(201).json(uploadAttachment(req.body?.files));
});

export default router;
