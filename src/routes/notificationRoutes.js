import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { listNotifications, markAsRead, markAllAsRead } from '../controllers/notificationController.js';

const router = Router();

router.get('/', authRequired, listNotifications);
router.patch('/:id/read', authRequired, markAsRead);
router.patch('/read-all', authRequired, markAllAsRead);

export default router;
