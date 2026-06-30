import {Router, Request, Response} from 'express';
import { UploadAttachmentBody } from '../../openapi-registry';
import {
    registry,
    UploadAttachmentBody,
    UploadAttachmentResponse,
    ApiErrorResponse,
} from '../../openapi-registry';

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
    // Implémentation du téléchargement de la pièce jointe
});

export default router;