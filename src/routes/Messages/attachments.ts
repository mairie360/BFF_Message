import {Router, Request, Response} from 'express';
import {
    registry,
    UploadAttachmentBody,
    UploadAttachmentResponse,
    ApiErrorResponse,
} from '../../openapi-registry';
import { uploadAttachment } from './message_helpers';

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
    const result = uploadAttachment(req.body?.files);
    return res.status(201).json(result);
});

export default router;
