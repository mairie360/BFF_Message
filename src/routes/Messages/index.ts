// Imported first: the registration order of the paths is the order of contracts/openapi.json.
import businessReferencesRouter from './business_references';
import { noStore, requireBearer } from '@mairie360/bffs-lib';
import { Router } from 'express';
import attachmentsRoutes from './attachments';
import bootstrapRoutes from './bootstrap';
import contactsRoutes from './contacts';
import conversationRoutes from './conversation';
import groupsRoutes from './groups';
import meRoutes from './me';
import messageRoutes from './message';

/**
 * Every route below is session-bound: answers are never cached, and a request without an
 * `Authorization: Bearer <token>` header gets a 401 before any upstream call (MAIR-429).
 */
export const SESSION_BOUND_PATHS = [
    '/attachments',
    '/business-references',
    '/contacts',
    '/conversations',
    '/direct-messages',
    '/groups',
    '/me',
    '/messaging',
];

const router = Router();
router.use(SESSION_BOUND_PATHS, noStore, requireBearer);

router.use('/business-references', businessReferencesRouter);
router.use('/attachments', attachmentsRoutes);
router.use('/messaging/bootstrap', bootstrapRoutes);
router.use('/contacts', contactsRoutes);
router.use('/conversations', conversationRoutes);
router.use('/groups', groupsRoutes);
router.use('/me', meRoutes);
router.use('/', messageRoutes);

export default router;
