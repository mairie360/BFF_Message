// Imported first: the registration order of the paths is the order of contracts/openapi.json.
import businessReferencesRouter from './business_references';
import { noStore, requireSession } from '@mairie360/bffs-lib';
import { Router } from 'express';
import attachmentsRoutes from './attachments';
import bootstrapRoutes from './bootstrap';
import contactsRoutes from './contacts';
import conversationRoutes from './conversation';
import groupsRoutes from './groups';
import linkSuggestionsRouter from './link_suggestions';
import meRoutes from './me';
import membersRoutes from './members';
import messageRoutes from './message';
import realtimeRoutes from './realtime';
import streamRoutes from './stream';

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
    '/link-suggestions',
    '/me',
    '/messaging',
    '/stream',
    '/ws',
];

const router = Router();
router.use(SESSION_BOUND_PATHS, noStore, requireSession);

router.use('/business-references', businessReferencesRouter);
router.use('/attachments', attachmentsRoutes);
router.use('/messaging/bootstrap', bootstrapRoutes);
router.use('/contacts', contactsRoutes);
router.use('/conversations', conversationRoutes);
router.use('/conversations', membersRoutes);
router.use('/groups', groupsRoutes);
router.use('/link-suggestions', linkSuggestionsRouter);
router.use('/me', meRoutes);
router.use('/stream', streamRoutes);
router.use('/ws', realtimeRoutes);
router.use('/', messageRoutes);

export default router;
