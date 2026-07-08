import { Router } from 'express';
import attachmentsRoutes from './attachments';
import bootstrapRoutes from './bootstrap';
import contactsRoutes from './contacts';
import conversationRoutes from './conversation';
import groupsRoutes from './groups';
import meRoutes from './me';
import messageRoutes from './message';

const router = Router();

router.use('/attachments', attachmentsRoutes);
router.use('/messaging/bootstrap', bootstrapRoutes);
router.use('/contacts', contactsRoutes);
router.use('/conversations', conversationRoutes);
router.use('/groups', groupsRoutes);
router.use('/me', meRoutes);
router.use('/', messageRoutes);

export default router;
