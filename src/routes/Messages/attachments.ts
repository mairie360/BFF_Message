import {Router, Request, Response} from 'express';
import {
    registry,
    UploadAttachmentBody,
    UploadAttachmentResponse,
    ApiErrorResponse,
} from '../../openapi-registry';
import { getAuthorizationHeader } from '../../config/token';
import { fetchCurrentUser, handleUnknownError, uploadAttachment } from './message_helpers';

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

router.post('/', (req: Request, res: Response) => {
    if (!getAuthorizationHeader(req.headers.authorization)) {
        return res.status(401).json({ code: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    // The session is resolved against Core API (which verifies the token) before accepting any file.
    return fetchCurrentUser(req.headers.authorization)
        .then(() => res.status(201).json(uploadAttachment(req.body?.files)))
        .catch((error) => handleUnknownError(res, error));
});

export default router;
